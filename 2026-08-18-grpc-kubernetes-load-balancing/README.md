---
type: Experiment
title: Kubernetes에서 장수명 gRPC 연결의 Pod 고정과 로드밸런싱
description: ClusterIP 뒤의 gRPC 연결이 한 Pod에 고정되는 현상을 재현하고 연결 수명 제한과 클라이언트 측 로드밸런싱을 비교합니다.
tags: [kubernetes, grpc, http2, load-balancing, service-mesh]
status: draft
sources:
  - id: kubernetes-service
    resource: https://kubernetes.io/docs/concepts/services-networking/service/
    title: Kubernetes Service
  - id: kubernetes-dns
    resource: https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/
    title: DNS for Services and Pods
  - id: grpc-load-balancing
    resource: https://grpc.io/blog/grpc-load-balancing/
    title: gRPC Load Balancing
  - id: grpc-custom-lb
    resource: https://grpc.io/docs/guides/custom-load-balancing/
    title: Custom Load Balancing Policies
  - id: grpc-performance
    resource: https://grpc.io/docs/guides/performance/
    title: Performance Best Practices
  - id: istio-traffic
    resource: https://istio.io/latest/docs/concepts/traffic-management/
    title: Istio Traffic Management
  - id: kind-quick-start
    resource: https://kind.sigs.k8s.io/docs/user/quick-start/
    title: kind Quick Start
  - id: grpc-js-channelz
    resource: https://github.com/grpc/grpc-node/tree/master/packages/grpc-js
    title: gRPC JS Channelz
  - id: envoy-release
    resource: https://github.com/envoyproxy/envoy/releases
    title: Envoy releases
  - id: envoy-http-connection-manager
    resource: https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/http/http_connection_management
    title: Envoy HTTP connection management
  - id: envoy-load-balancing
    resource: https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers
    title: Envoy supported load balancers
  - id: istio-install
    resource: https://istio.io/latest/docs/setup/install/istioctl/
    title: Installing Istio with istioctl
  - id: istio-protocol-selection
    resource: https://istio.io/latest/docs/ops/configuration/traffic-management/protocol-selection/
    title: Istio protocol selection
---

# Kubernetes에서 장수명 gRPC 연결의 Pod 고정과 로드밸런싱

## 목적과 배경

일반적인 Kubernetes `ClusterIP Service` 뒤에 여러 Pod가 있어도, 하나의 장수명 gRPC 채널이 보내는 RPC가 한 Pod에만 도착할 수 있다. 이 실험은 그 현상을 합성 애플리케이션으로 재현하고 클라이언트 분산, Envoy L4/L7 프록시, Istio 관리형 sidecar를 단계적으로 비교한다.

1. `ClusterIP + pick_first`: 문제의 기준선
2. `ClusterIP + 서버의 max connection age`: 연결 고정 시간을 제한하는 완화책
3. `Headless Service + 클라이언트 round_robin`: 클라이언트가 Pod 주소를 직접 발견해 RPC 단위로 분산하는 방법
4. `Envoy TCP proxy`: 프록시가 TCP 연결을 Backend로 전달하는 연결 단위 방식
5. `Envoy HTTP connection manager`: HTTP/2 gRPC stream을 해석하고 stream별로 Backend를 선택하는 방식
6. `Istio sidecar`: 메시가 배포한 Envoy 프록시와 서비스 정책을 통해 분산하는 방식

Kubernetes의 일반 Service DNS는 Service의 가상 IP를 반환한다. 반면 Headless Service는 뒷단 Pod의 주소를 DNS 레코드로 반환하며, kube-proxy가 그 Service를 처리하지 않는다.[^kubernetes-service][^kubernetes-dns]

gRPC는 채널과 연결을 재사용하는 것이 권장되며, 여러 RPC를 HTTP/2 스트림으로 같은 연결에 멀티플렉싱한다.[^grpc-performance] 따라서 L4에서 TCP 연결이 처음 선택한 Endpoint는 연결이 유지되는 동안 바뀌지 않는다. 이것은 “Kubernetes의 round robin이 고장 난 것”이 아니라 **연결 단위 분산과 요청 단위 분산의 차이**다.

## 질문 또는 가설

- 일반 ClusterIP와 기본 `pick_first`를 사용하면 한 클라이언트 채널의 모든 RPC가 한 Backend Pod로 간다.
- 서버가 주기적으로 HTTP/2 `GOAWAY`를 보내 연결을 교체하면, 새 연결이 다른 Pod를 선택할 기회가 생겨 장기적으로 고정이 완화된다.
- Headless Service가 여러 Pod 주소를 반환하고 gRPC 클라이언트가 `round_robin`을 사용하면 RPC가 여러 Backend Pod로 분산된다.[^grpc-custom-lb]
- 동일한 합성 부하에서 두 Pod를 사용하면 제한된 서버 처리 슬롯을 더 활용하므로 처리량과 큐 대기시간이 개선된다.
- Envoy TCP proxy는 downstream gRPC TCP 연결마다 upstream Backend 하나를 선택하므로 그 연결의 RPC는 같은 Pod로 간다.
- Envoy HTTP connection manager는 upstream HTTP/2를 사용하고 gRPC stream을 라우팅하므로, 한 downstream 연결의 여러 RPC를 여러 Backend Pod로 분산할 수 있다.[^envoy-http-connection-manager][^envoy-load-balancing]
- Istio sidecar 경로에서도 프로토콜 인식과 Backend 선택 정책이 활성화된 경우 gRPC 요청 단위 분산을 관찰할 수 있다. sidecar 존재만으로 결과를 가정하지 않고 실제 Pod별 요청과 연결 로그를 확인한다.[^istio-protocol-selection]

## 실제 경험과 공개 실험의 관계

작성자가 직접 대응한 장애 사례가 아니라, 팀에서 접한 문제와 연결 종료 대응을 이해하기 위한 개인 학습 실험이다. 이 실험의 질문은 “복수의 클라이언트 인스턴스가 복수의 gRPC 서버 인스턴스 중 하나에 연결되어 트래픽이 편중된 현상”에서 출발했다.

그러나 이 저장소에는 회사명, 내부 저장소·서비스명, 코드, 모니터링 화면, 실제 요청·성능 수치가 없다. 서버 처리 모델과 부하는 공개 실험을 위해 새로 만든 합성 조건이다. 이 결과는 실제 장애의 원인이나 개선 폭을 증명하지 않고, 일반화한 네트워크 메커니즘만 검증한다.

## 실행 환경과 의존성

- macOS arm64
- Docker Desktop 29.4.0
- kind 0.32.0
- Kubernetes 1.36.1
- kubectl 1.36.1
- Node.js 24.6.0 Alpine 이미지(OCI digest 고정)
- `@grpc/grpc-js` 1.14.4
- `@grpc/proto-loader` 0.8.1
- pnpm 11.21.0
- Envoy 1.39.1 OCI image
- Istio 1.31.1 `istioctl` (기록된 실습 버전)[^envoy-release][^istio-install]

`bootstrap-kind.sh`는 kind와 kubectl 바이너리 및 SHA-256 체크섬을 공식 배포처에서 받아 실험 디렉터리의 `.tools/`에 둔다. kind는 Docker 컨테이너로 로컬 Kubernetes 클러스터를 만든다.[^kind-quick-start]

## 설치와 실행

```bash
cd 2026-08-18-grpc-kubernetes-load-balancing
./scripts/bootstrap-kind.sh
./scripts/deploy.sh
./scripts/run-case.sh baseline
./scripts/run-case.sh headless-round-robin
./scripts/run-case.sh reconnect
./scripts/deploy-envoy.sh
./scripts/run-case.sh envoy-tcp
./scripts/run-case.sh envoy-l7
```

Docker가 실행 중인 macOS arm64에서 시작한다. 호스트 도구 자동 설치는 해당 플랫폼 전용이다. 다른 플랫폼은 같은 버전의 kind/kubectl을 `.tools/`에 준비한다. 모든 변경 스크립트는 `kind-grpc-k8s-lab` 컨텍스트를 명시한다. Istio는 아래 별도 설치 절차가 필요하다.

기존 backend 기본 실험을 실행한 뒤 별도 Envoy 리소스를 적용한다. `envoy-tcp`와 `envoy-l7`은 요청 200건, 동시성 20의 같은 클라이언트 부하를 사용한다. Envoy 이미지를 내려받을 수 없으면 Pod가 `ImagePullBackOff`가 될 수 있으므로 프록시 준비 상태를 확인한 뒤 부하를 실행한다.

### Backend 연결 관찰

실험 서버는 `ENABLE_CHANNELZ=1`일 때만 gRPC Channelz admin 서비스를 같은 포트에 추가한다. Channelz는 서버가 현재 유지 중인 HTTP/2 소켓과 각 소켓의 local/remote 주소를 조회하게 해준다.[^grpc-js-channelz] 관찰용 스크립트는 각 백엔드 Pod IP를 직접 조회해 100ms 간격으로 활성 소켓 목록을 비교하고, 새 연결과 사라진 연결을 JSON Lines로 출력한다. 조회 사이에 소켓이 닫히는 경합은 정상 종료로 처리한다. 짧은 주기 사이에 열리고 닫힌 연결은 놓칠 수 있으므로 이 실험의 5초 연결 수명 관찰용이며 패킷 캡처와 동등하지 않다.

먼저 이미지를 다시 빌드하고 backend Deployment에 적용한다.

```bash
./scripts/deploy.sh
```

새 이미지로 관찰용 Pod를 만들고, 연결 수명 설정을 적용한 뒤 rollout 완료와 현재 Backend Pod IP를 확인한다.

```bash
kubectl --context kind-grpc-k8s-lab run connection-watcher \
  -n grpc-lb-lab \
  --image=grpc-k8s-lab:local \
  --image-pull-policy=Never \
  --restart=Never \
  --command -- sleep 3600

kubectl --context kind-grpc-k8s-lab set env deployment/backend \
  -n grpc-lb-lab MAX_CONNECTION_AGE_MS=5000
kubectl --context kind-grpc-k8s-lab rollout status deployment/backend -n grpc-lb-lab
kubectl --context kind-grpc-k8s-lab get pods -n grpc-lb-lab -l app=backend -o wide
```

위 출력에서 두 Backend Pod IP를 확인한 다음, 첫 터미널에서 관찰을 시작한다. `<POD_IP_1>`과 `<POD_IP_2>`를 실제 주소로 바꾸고 JSON Lines 기록 파일명을 지정한다.

```bash
kubectl --context kind-grpc-k8s-lab exec connection-watcher -n grpc-lb-lab -- \
  env WATCH_DURATION_MS=30000 node src/watch-connections.js <POD_IP_1> <POD_IP_2> \
  | tee results/connection-events.jsonl
```

관찰기가 `watcher_ready`를 출력한 뒤 두 번째 터미널에서 `./scripts/run-case.sh reconnect`를 실행한다. 이 스크립트는 동일한 `MAX_CONNECTION_AGE_MS=5000` 설정을 사용하므로 Backend rollout을 다시 일으키지 않아야 한다. 관찰은 30초 뒤 자동 종료된다. `connection_open`과 `connection_closed` 행의 `backend_ip`, `local`, `remote`, `socketId`를 Pod별 RPC 수와 별도로 비교한다. 관찰 중 Pod IP가 바뀌거나 Channelz 질의가 실패하면 실험을 멈추고 현재 Pod 목록을 다시 확인한다.

실험 클러스터를 제거하려면 다음을 실행한다.

```bash
./scripts/cleanup.sh
```

## 데이터와 fixtures

외부 데이터는 사용하지 않는다. 클라이언트는 순번만 포함한 unary RPC를 만들고, 서버는 다음 합성 조건으로 응답한다.

- Backend Pod: 2개
- Pod당 동시 처리 슬롯: 4개
- 각 요청의 합성 작업 시간: 50ms
- 응답 데이터: 요청 순번, Backend Pod의 hostname, 서버 큐 대기시간, 서비스 시간

Pod당 처리 슬롯은 CPU나 DB 커넥션 풀의 실제 동작을 모사한 성능 모델이 아니라, 한 Pod 고정의 효과를 관찰하기 위한 통제 변수다.

## 측정 기준과 절차

클라이언트 한 프로세스는 실험 내내 하나의 gRPC 채널을 재사용한다. 각 경우에 다음을 기록한다.

- `counts_by_pod`: Backend Pod별 완료 요청 수
- `throughput_rps`: 전체 완료 요청 수 / 측정 시간
- `latency_ms`: 클라이언트가 관찰한 p50, p95, max
- `server_queue_wait_ms`: 서버의 처리 슬롯을 기다린 p50, p95, max

`baseline`과 `headless-round-robin`은 요청 200건, 동시성 20로 같은 조건이다. `reconnect`는 5초마다 연결이 교체될 충분한 시간을 확보하기 위해 요청 800건, 동시성 4, 요청 사이 간격 20ms를 사용한다. 따라서 `reconnect`의 처리량과 지연은 앞의 두 경우와 직접 비교하지 않는다.

## 결과

2026-08-18 두 차례 실행 결과는 [결과 기록](results/2026-08-18.md)에 있다. 아래 수치는 최초 실행 값이다.

- `ClusterIP + pick_first`: 200건 모두 한 Pod가 처리했다.
- `Headless + round_robin`: 두 Pod가 각각 90건과 110건을 처리했다.
- `max connection age = 5초`: 약 16초 동안 두 Pod가 548건과 252건을 처리했다.
- 2026-10-06 첫 Envoy TCP/L7 실행 결과는 [Envoy 결과 기록](results/2026-10-06-envoy.md)에 있다. 각 사례 1회 관찰이며 균등 분포나 성능 우위를 일반화하지 않는다.
- 2026-10-07 Istio sidecar 실행은 [Istio 결과 기록](results/2026-10-07-istio.md)에 정리했다. 사용자 제공 실행 출력 기준으로 200 RPC가 100/100으로 나뉘었다.

같은 부하 조건인 앞의 두 경우에서 처리량은 76.16 RPS에서 133.04 RPS로, 서버 큐 대기 p50은 202.67ms에서 103.75ms로 바뀌었다. 이는 이 실험의 합성 처리 슬롯을 두 Pod가 함께 사용한 결과이며 운영 환경의 개선 폭으로 일반화할 수 없다.

## 해석과 한계

### 용어와 메커니즘

- **gRPC 채널(channel)**: RPC를 보낼 논리적 통신 경로다. 채널은 하나 이상의 subchannel/HTTP/2 연결을 관리할 수 있다.
- **`pick_first`**: resolver가 준 주소 중 연결 가능한 첫 주소를 선택하고, 그 subchannel을 계속 사용하는 정책이다.
- **ClusterIP**: Pod 집합 앞의 안정적인 가상 IP다. 일반 Service 이름은 이 VIP로 해석된다.[^kubernetes-service]
- **Headless Service**: `clusterIP: None`인 Service다. DNS가 Pod Endpoint 주소를 직접 제공하므로 클라이언트 측 service discovery에 사용할 수 있다.[^kubernetes-service]
- **L4 분산**: TCP 연결 단위로 Backend를 고른다. 같은 HTTP/2 연결 안의 RPC 스트림을 서로 다른 Pod로 나누지 못한다.
- **L7 분산**: gRPC/HTTP/2 요청 또는 스트림을 이해하는 프록시나 클라이언트가 RPC 단위로 Backend를 고를 수 있다.[^grpc-load-balancing]

### 연결 수명 제한은 완화책이다

서버의 max connection age는 기존 연결에 `GOAWAY`를 보내 새 연결을 유도한다. 새 TCP 연결이 만들어질 때 ClusterIP의 다른 Endpoint가 선택될 기회가 생긴다. 그러나 한 연결이 살아 있는 동안에는 여전히 한 Pod에 고정되고, 매번 다른 Pod가 선택된다는 보장도 없다. 따라서 이는 **요청 단위 로드밸런싱이 아니라 고정 상태의 최대 지속 시간을 제한하는 확률적 완화책**이다.

### Headless + round_robin은 애플리케이션 수준 해결책이다

`round_robin` 정책만 켜고 일반 ClusterIP 이름을 사용하면 resolver가 주소 하나(VIP)만 주므로 선택할 Backend가 하나뿐이다. Headless Service와 함께 사용해야 여러 Pod 주소에 subchannel을 만들고 RPC를 순회시킬 수 있다.[^grpc-custom-lb]

### 서비스 메시가 하는 일

서비스 메시에서는 각 워크로드 가까이에 있는 Envoy 같은 데이터 플레인 프록시가 애플리케이션 트래픽을 가로챈다. 애플리케이션의 gRPC 클라이언트는 하나의 목적지에 연결해도, 프록시는 Kubernetes Endpoint를 알고 HTTP/2/gRPC 스트림을 여러 Backend 연결로 전달할 수 있다. Istio는 기본 service discovery와 load balancing 외에도 retry, timeout, circuit breaking, mTLS, telemetry 같은 정책을 중앙에서 제공한다.[^istio-traffic]

다만 서비스 메시가 항상 “가장 좋은” 단일 답은 아니다. 이 문제 하나만 해결한다면 Headless Service와 클라이언트 측 `round_robin`이 더 작은 변경일 수 있다. 여러 언어·서비스에서 일관된 L7 트래픽 정책, 보안, 관측성을 운영할 필요가 있을 때 메시의 추가 프록시 hop, 자원 사용, 제어 평면과 장애 분석 복잡성을 감수할 근거가 생긴다.

### 독립 Envoy와 서비스 메시 비교

`envoy-tcp`와 `envoy-l7`은 한 Envoy Pod와 같은 Headless Backend 집합을 사용한다. TCP proxy는 gRPC를 해석하지 않고 downstream TCP 연결을 upstream에 연결한다. HTTP connection manager는 HTTP/2를 처리하고 router가 RPC stream을 upstream host로 보낼 수 있도록 구성한다. 따라서 프록시가 존재하는지만 비교하는 것이 아니라, 프록시가 연결을 중계하는지 HTTP/2 요청을 해석하는지 구분한다.[^envoy-http-connection-manager][^envoy-load-balancing]

Istio 실습은 별도 단계에서 `istioctl` 최소 프로파일과 자동 sidecar 주입을 사용한다. backend와 client를 모두 mesh namespace에 생성하고 gRPC 포트 프로토콜을 명시한다. Pod의 2/2 Ready와 1회 RPC 분포를 확인했다. 결과는 해당 실습 범위로 한정한다.[^istio-install][^istio-protocol-selection]

### Istio sidecar 실험 준비와 실행

[공식 설치 안내](https://istio.io/latest/docs/setup/install/istioctl/)에서 호스트에 맞는 1.31.1 배포 파일을 받아 `.tools/istio-1.31.1/`에 풀어 둔다. 바이너리는 커밋하지 않는다. 기본 실험의 `deploy.sh`로 앱 이미지를 kind에 로드한 뒤 실행한다.

```bash
.tools/istio-1.31.1/bin/istioctl x precheck --context kind-grpc-k8s-lab
.tools/istio-1.31.1/bin/istioctl install --context kind-grpc-k8s-lab --set profile=minimal -y
```

최소 프로파일을 설치한 뒤 다음 매니페스트를 적용한다. `istio-injection: enabled` Namespace label은 이후 새로 만들어지는 Pod에 Envoy sidecar 자동 주입을 요청한다. 기존 `grpc-lb-lab` 리소스는 변경하지 않는다.

```bash
kubectl --context kind-grpc-k8s-lab apply -f k8s/istio-lab.yaml
kubectl --context kind-grpc-k8s-lab rollout status deployment/backend-mesh -n grpc-lb-mesh-lab
kubectl --context kind-grpc-k8s-lab rollout status deployment/mesh-client -n grpc-lb-mesh-lab
kubectl --context kind-grpc-k8s-lab get pods -n grpc-lb-mesh-lab -o wide
```

각 Pod의 `READY`가 `2/2`이면 애플리케이션 컨테이너와 `istio-proxy` sidecar가 모두 준비된 것이다. Service 포트 이름과 `appProtocol`은 `grpc`로 설정되어 있다. 실험 전 Pod별 `counts_by_pod`를 예상하고, 그 다음 client 컨테이너 안에서 같은 200 RPC 부하를 보낸다.

```bash
kubectl --context kind-grpc-k8s-lab exec deployment/mesh-client \
  -c mesh-client -n grpc-lb-mesh-lab -- \
  env TARGET=backend-mesh.grpc-lb-mesh-lab.svc.cluster.local:50051 \
      LB_POLICY=pick_first REQUESTS=200 CONCURRENCY=20 \
  node src/client.js
```

### 남은 한계와 다음 단계

- 기준선·Headless·연결 수명 제한은 최초 기록의 각 2회, Envoy TCP/L7과 Istio는 각 1회 관찰이다. 성능 벤치마크나 정확한 균등 분산의 보편적 증거로 사용하지 않는다.
- 로컬 단일 노드 kind, IPv4, 합성 unary RPC 실험이다. 운영 CNI, 노드 간 네트워크, TLS, 장수명 streaming RPC와 장애 복구를 검증한 결과가 아니다.
- [2026-09-27 Channelz 로그](results/2026-09-27-reconnect-connections.jsonl)에 연결 open/close가 남아 있다. 실험 클러스터의 임시 사설 IP이며 업무망 주소가 아니다. `NOT_FOUND` 조회 경합 1건도 원본대로 보존했다. 현재 관찰기는 이 경합을 건너뛰도록 수정되어 원본 로그를 완전히 재생하지는 않는다.
- Channelz의 100ms polling은 짧은 연결을 놓칠 수 있으며, RPC별 연결 상관관계나 정확한 GOAWAY 시점을 증명하지 않는다.
- Pod별 채널을 직접 관리하는 구현과 롤아웃 중 DNS 갱신·실패 RPC 복구 실험은 포함하지 않았다. Headless 구현은 라이브러리의 DNS resolver와 round_robin을 사용한다.
- 인증 없는 합성 실험 서버이며 Channelz는 실험에서만 켠다. 외부에 서비스 포트나 admin 정보를 공개하는 운영 구성이 아니다.

## 공개 전 정리와 검증

2026-10-08에 실험 파일, 잠금 파일, 매니페스트와 결과 문서를 검토했다. 로컬 도구, node_modules, 자격증명은 커밋 대상에서 제외한다. 이번 정리에서는 코드 구문 검사와 로컬 서버/클라이언트 smoke test를 수행하며, 과거 클러스터 측정 결과를 새 실행 결과로 바꾸지 않는다.

## 연결된 블로그 글

「gRPC 요청은 왜 한 Pod에 몰렸을까?」 초안을 별도 블로그 저장소에서 작성 중이다. 공개 배포 전이므로 게시물 URL은 아직 연결하지 않는다. 글에서는 이 저장소의 확정 commit permalink로 코드와 기록을 인용한다.

[^kubernetes-service]: Kubernetes Service 공식 문서
[^kubernetes-dns]: Kubernetes DNS for Services and Pods 공식 문서
[^grpc-load-balancing]: gRPC Load Balancing 공식 글
[^grpc-custom-lb]: gRPC Custom Load Balancing Policies 공식 문서
[^grpc-performance]: gRPC Performance Best Practices 공식 문서
[^istio-traffic]: Istio Traffic Management 공식 문서
[^kind-quick-start]: kind Quick Start 공식 문서
[^grpc-js-channelz]: gRPC JS Channelz 서비스 구현과 소켓 조회 API
[^envoy-release]: Envoy 공식 release 목록과 버전 기록
[^envoy-http-connection-manager]: Envoy HTTP connection manager와 HTTP/2 stream 처리
[^envoy-load-balancing]: Envoy upstream cluster의 host load balancing
[^istio-install]: Istio `istioctl` 설치 가이드
[^istio-protocol-selection]: Istio의 포트 기반 또는 자동 프로토콜 선택 규칙
