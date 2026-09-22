#!/usr/bin/env bash
set -euxo pipefail

# Run on a disposable Ubuntu test machine: this installs the built package.
cd "$(dirname "$0")/.."
version="$(node -p 'require("./package.json").version')"
deb_arch="$(dpkg --print-architecture)"
case "$deb_arch" in
  amd64) codex_arch=x64; triple=x86_64-unknown-linux-musl ;;
  arm64) codex_arch=arm64; triple=aarch64-unknown-linux-musl ;;
  *) echo "Unsupported architecture: $deb_arch"; exit 1 ;;
esac
package="release/Lodex-${version}-${deb_arch}.deb"

test "$(dpkg-deb -f "$package" Package)" = lodex
test "$(dpkg-deb -f "$package" Architecture)" = "$deb_arch"
test "$(dpkg-deb -f "$package" Version)" = "$version"
sudo apt-get install -y "./$package"

desktop-file-validate /usr/share/applications/lodex.desktop
test -f /usr/share/icons/hicolor/512x512/apps/lodex.png
test -f /opt/Lodex/resources/apparmor-profile
test -x /usr/bin/lodex
modules=/opt/Lodex/resources/app.asar.unpacked/node_modules/@openai
test -x "$modules/codex-linux-${codex_arch}/vendor/${triple}/bin/codex"
ELECTRON_RUN_AS_NODE=1 /opt/Lodex/lodex "$modules/codex/bin/codex.js" --version

# Keep authentication, preferences and history isolated from the test account.
test_home="$(mktemp -d)"
trap 'find "$test_home/.config" -name diagnostics.log -exec cat {} \; > release/ubuntu-diagnostics.log; rm -rf -- "$test_home"' EXIT
mkdir -p "$test_home/.codex" "$test_home/.config"
HOME="$test_home" XDG_CONFIG_HOME="$test_home/.config" CODEX_HOME="$test_home/.codex" \
  timeout 100s xvfb-run -a node scripts/smoke-installed-app.cjs 2>&1 | tee release/ubuntu-smoke.log
grep -q 'LODEX_SMOKE_OK' release/ubuntu-smoke.log

(cd release && sha256sum "$(basename "$package")" > SHA256SUMS)
echo "Ubuntu installation, desktop entry, bundled runtime and window verified."
