#!/bin/sh
set -eu

experiment_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
kind_bin="$experiment_dir/.tools/kind"
kubectl_bin="$experiment_dir/.tools/kubectl"

test -x "$kind_bin"
test -x "$kubectl_bin"
docker build -t grpc-k8s-lab:local "$experiment_dir"
"$kind_bin" load docker-image grpc-k8s-lab:local --name grpc-k8s-lab
"$kubectl_bin" --context kind-grpc-k8s-lab apply -f "$experiment_dir/k8s/lab.yaml"
"$kubectl_bin" --context kind-grpc-k8s-lab rollout status deployment/backend -n grpc-lb-lab --timeout=120s
"$kubectl_bin" --context kind-grpc-k8s-lab get pods,services -n grpc-lb-lab -o wide
