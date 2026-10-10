---
okf_version: "0.2"
---

# Tech Lab

- [저장소 안내](README.md) - 실험 디렉터리 형식, README 구조와 운영 흐름을 설명합니다.
- [Codex 작업 규칙](AGENTS.md) - OKF 형식, 재현성, 실험 문서화와 공개 안전 규칙을 정의합니다.
- [변경 기록](log.md) - 저장소의 의미 있는 변경을 최신순으로 기록합니다.

## Experiments

- [Kubernetes에서 장수명 gRPC 연결의 Pod 고정과 로드밸런싱](2026-08-18-grpc-kubernetes-load-balancing/README.md) - ClusterIP, Headless Service, Channelz, Envoy TCP/L7 프록시와 Istio sidecar 분산을 비교합니다. [Envoy 1차 결과](2026-08-18-grpc-kubernetes-load-balancing/results/2026-10-06-envoy.md) (draft)

- [Istio sidecar 1회 결과](2026-08-18-grpc-kubernetes-load-balancing/results/2026-10-07-istio.md) — 사용자 제공 실습 출력, 일반화하지 않은 관찰.

- [브라우저 RPC — Connect, Envoy, Spring REST와 Armeria](2026-10-08-browser-rpc/README.md) — 같은 proto의 unary·server streaming·오류·취소 비교.
