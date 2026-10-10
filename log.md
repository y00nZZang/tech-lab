# Tech Lab Update Log

## 2026-10-08

- **공개 준비**: gRPC 합성 실험과 결과를 정리하고 Istio 1회 출력 기록을 추가했습니다. 과거 미실행 표현을 현재 증거와 대조했으며 Channelz 원본의 조회 경합을 보존했습니다. 실행 스크립트에 전용 컨텍스트와 kind 노드 버전을 명시했습니다. 팀의 대응과 개인 학습을 구분합니다.

## 2026-10-07

- **Istio lab setup**: `grpc-lb-mesh-lab` Namespace, auto-injected backend/client Deployments, and an explicitly named gRPC Service were added as a separate experimental topology. Server-side dry-run passed; pods have not yet been created.

## 2026-10-06

- **Envoy first run**: 동일한 200 RPC 부하로 TCP proxy와 HTTP/2-aware L7 listener를 각각 1회 실행했습니다. 관찰 분포는 각각 단일 Pod 200건, 두 Pod 100건씩이며 반복 5회 전의 단일 실행 결과로 기록했습니다.

## 2026-09-27

- **Envoy proxy comparison**: 동일한 Headless Backend를 바라보는 Envoy TCP proxy와 HTTP/2-aware L7 listener 및 비교 실행 사례를 추가했습니다. Kubernetes server-side dry-run에서 ConfigMap, Deployment, Service 스키마를 확인했습니다. Envoy image pull과 실제 proxy 결과는 아직 검증하지 않았으며 Istio sidecar 구성은 후속 단계입니다.

## 2026-09-27

- **Connection observation**: `@grpc/grpc-js` Channelz를 조건부로 노출하고 Backend Pod IP별 활성 소켓을 관찰해 연결 생성·종료 JSON 로그를 남기는 도구를 추가했습니다. 새 이미지 배포, Channelz 질의와 watcher 초기화를 확인했습니다. 실제 reconnect 부하에서 open/close 로그를 workload와 대조하는 것은 남아 있습니다. 100ms polling은 짧은 연결을 놓칠 수 있어 packet capture와 동등한 기록으로 취급하지 않습니다.

## 2026-08-18

- **gRPC/Kubernetes load-balancing experiment**: 장수명 HTTP/2 연결의 Pod 고정 현상을 재현하고 `max_connection_age`와 `Headless Service + round_robin`을 비교하는 합성 실험 및 1차 결과를 추가했습니다.
- **Initialization**: OKF v0.2 기반의 공개 기술 실험 저장소 구조를 만들었습니다.
- **Governance**: 실험 디렉터리명, README 필수 내용, 재현성과 공개 안전 규칙을 정의했습니다.

## 2026-10-10 브라우저 RPC 실험 공개

- Connect·gRPC-Web/Envoy 및 Spring REST·Armeria 실습 코드와 검증 기록을 추가했습니다.
