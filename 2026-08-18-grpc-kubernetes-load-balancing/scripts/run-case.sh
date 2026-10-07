#!/bin/sh
set -eu

case_name="${1:-baseline}"
experiment_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
kubectl_bin="$experiment_dir/.tools/kubectl"
namespace=grpc-lb-lab
image=grpc-k8s-lab:local
pod="grpc-client-${case_name}-$(date +%s)"

test -x "$kubectl_bin"

case "$case_name" in
  baseline)
    "$kubectl_bin" --context kind-grpc-k8s-lab set env deployment/backend -n "$namespace" MAX_CONNECTION_AGE_MS=0 >/dev/null
    target=backend-cluster-ip.grpc-lb-lab.svc.cluster.local:50051
    policy=pick_first
    requests=200
    concurrency=20
    interval_ms=0
    ;;
  reconnect)
    "$kubectl_bin" --context kind-grpc-k8s-lab set env deployment/backend -n "$namespace" MAX_CONNECTION_AGE_MS=5000 >/dev/null
    target=backend-cluster-ip.grpc-lb-lab.svc.cluster.local:50051
    policy=pick_first
    requests=800
    concurrency=4
    interval_ms=20
    ;;
  headless-round-robin)
    "$kubectl_bin" --context kind-grpc-k8s-lab set env deployment/backend -n "$namespace" MAX_CONNECTION_AGE_MS=0 >/dev/null
    target=dns:///backend-headless.grpc-lb-lab.svc.cluster.local:50051
    policy=round_robin
    requests=200
    concurrency=20
    interval_ms=0
    ;;
  envoy-tcp)
    "$kubectl_bin" --context kind-grpc-k8s-lab set env deployment/backend -n "$namespace" MAX_CONNECTION_AGE_MS=0 >/dev/null
    target=envoy-proxy.grpc-lb-lab.svc.cluster.local:50052
    policy=pick_first
    requests=200
    concurrency=20
    interval_ms=0
    ;;
  envoy-l7)
    "$kubectl_bin" --context kind-grpc-k8s-lab set env deployment/backend -n "$namespace" MAX_CONNECTION_AGE_MS=0 >/dev/null
    target=envoy-proxy.grpc-lb-lab.svc.cluster.local:50051
    policy=pick_first
    requests=200
    concurrency=20
    interval_ms=0
    ;;
  *)
    echo "usage: $0 baseline|reconnect|headless-round-robin|envoy-tcp|envoy-l7" >&2
    exit 2
    ;;
esac

"$kubectl_bin" --context kind-grpc-k8s-lab rollout status deployment/backend -n "$namespace" --timeout=120s >/dev/null
"$kubectl_bin" --context kind-grpc-k8s-lab run "$pod" \
  -n "$namespace" \
  --image="$image" \
  --image-pull-policy=IfNotPresent \
  --restart=Never \
  --env="TARGET=$target" \
  --env="LB_POLICY=$policy" \
  --env="REQUESTS=$requests" \
  --env="CONCURRENCY=$concurrency" \
  --env="INTERVAL_MS=$interval_ms" \
  --command -- node src/client.js >/dev/null

"$kubectl_bin" --context kind-grpc-k8s-lab wait pod/"$pod" -n "$namespace" --for=jsonpath='{.status.phase}'=Succeeded --timeout=180s >/dev/null || {
  "$kubectl_bin" --context kind-grpc-k8s-lab describe pod/"$pod" -n "$namespace"
  "$kubectl_bin" --context kind-grpc-k8s-lab logs pod/"$pod" -n "$namespace" || true
  exit 1
}
"$kubectl_bin" --context kind-grpc-k8s-lab logs pod/"$pod" -n "$namespace"
"$kubectl_bin" --context kind-grpc-k8s-lab delete pod/"$pod" -n "$namespace" --wait=false >/dev/null
