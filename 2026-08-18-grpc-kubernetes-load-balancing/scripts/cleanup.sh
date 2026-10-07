#!/bin/sh
set -eu

experiment_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
kind_bin="$experiment_dir/.tools/kind"

test -x "$kind_bin"
"$kind_bin" delete cluster --name grpc-k8s-lab
