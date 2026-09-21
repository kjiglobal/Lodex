#!/usr/bin/env bash
set -euo pipefail

# Some VM guest-control sessions inherit a restrictive 0007 umask. Linux
# desktop packages must remain readable and traversable by regular users.
umask 022

cd "$(dirname "$0")/.."

case "${1:-all}" in
  all) targets=(AppImage deb) ;;
  deb) targets=(deb) ;;
  *) echo "Usage: $0 [all|deb]"; exit 1 ;;
esac

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This script must run on Linux so npm installs the Linux Codex runtime."
  exit 1
fi

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( node_major < 22 )); then
  echo "Node.js 22 or newer is required. Found: $(node --version)"
  exit 1
fi

case "$(uname -m)" in
  x86_64) codex_arch="x64" ;;
  aarch64|arm64) codex_arch="arm64" ;;
  *) echo "Unsupported architecture: $(uname -m)"; exit 1 ;;
esac

npm ci --include=optional
npm run generate:icon

if [[ ! -d "node_modules/@openai/codex-linux-${codex_arch}" ]]; then
  echo "The platform-specific Codex runtime was not installed."
  echo "Remove node_modules, confirm npm optional dependencies are enabled, and run this script again."
  exit 1
fi

# npm also honors the process umask when extracting executable package files.
# Normalize the bundled runtimes so an app installed by root works for users.
chmod -R a+rX \
  "node_modules/@openai/codex" \
  "node_modules/@openai/codex-linux-${codex_arch}"

npm run build
npx --no-install electron-builder --linux "${targets[@]}" --publish never
npm audit --audit-level=high

echo
echo "Linux packages are ready in: $(pwd)/release"
