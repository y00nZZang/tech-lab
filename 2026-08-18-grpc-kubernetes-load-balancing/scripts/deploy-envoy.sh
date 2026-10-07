#!/bin/sh
set -eu

experiment_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
kubectl_bin="$experiment_dir/.tools/kubectl"

test -x "$kubectl_bin"
"$kubectl_bin" --context kind-grpc-k8s-lab apply -f "$experiment_dir/k8s/envoy.yaml"
"$kubectl_bin" --context kind-grpc-k8s-lab rollout status deployment/envoy-proxy -n grpc-lb-lab --timeout=180s
"$kubectl_bin" --context kind-grpc-k8s-lab get pods,services -n grpc-lb-lab -l app=envoy-proxy -o wide
