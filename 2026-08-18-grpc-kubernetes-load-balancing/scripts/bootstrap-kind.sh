#!/bin/sh
set -eu

kind_version=v0.32.0
kubernetes_version=v1.36.1
tools_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)/.tools"
kind_bin="$tools_dir/kind"
kubectl_bin="$tools_dir/kubectl"

# The checked download URLs below target the documented macOS arm64 host.
if [ "$(uname -s)-$(uname -m)" != "Darwin-arm64" ]; then
  echo "This bootstrap supports macOS arm64; install kind/kubectl manually on other hosts." >&2
  exit 2
fi
mkdir -p "$tools_dir"

if [ ! -x "$kind_bin" ]; then
  curl -fsSLo "$kind_bin" "https://kind.sigs.k8s.io/dl/${kind_version}/kind-darwin-arm64"
  curl -fsSLo "$tools_dir/kind.sha256sum" "https://kind.sigs.k8s.io/dl/${kind_version}/kind-darwin-arm64.sha256sum"
  expected="$(awk '{print $1}' "$tools_dir/kind.sha256sum")"
  actual="$(shasum -a 256 "$kind_bin" | awk '{print $1}')"
  test "$expected" = "$actual"
  chmod +x "$kind_bin"
fi

if [ ! -x "$kubectl_bin" ]; then
  curl -fsSLo "$kubectl_bin" "https://dl.k8s.io/release/${kubernetes_version}/bin/darwin/arm64/kubectl"
  curl -fsSLo "$tools_dir/kubectl.sha256" "https://dl.k8s.io/release/${kubernetes_version}/bin/darwin/arm64/kubectl.sha256"
  expected="$(cat "$tools_dir/kubectl.sha256")"
  actual="$(shasum -a 256 "$kubectl_bin" | awk '{print $1}')"
  test "$expected" = "$actual"
  chmod +x "$kubectl_bin"
fi

if ! "$kind_bin" get clusters | grep -qx grpc-k8s-lab; then
  "$kind_bin" create cluster --name grpc-k8s-lab --image "kindest/node:${kubernetes_version}" --wait 120s
fi

"$kind_bin" version
"$kubectl_bin" version --client
