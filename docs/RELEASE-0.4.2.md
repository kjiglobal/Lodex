# Lodex 0.4.2 — Blue logo and updated release location

- Applies the blue Lodex logo throughout the interface, startup screen, native windows, Ubuntu launcher, and installer.
- Updates release checks, verified downloads, and release-page links to the project's current home, **kjiglobal/Lodex**.
- Retains the chat, project tools, local voice typing, recovery, and verified Ubuntu update installation introduced in previous releases.

## Install or upgrade

[Download Lodex 0.4.2 for Ubuntu](https://github.com/kjiglobal/Lodex/releases/download/v0.4.2/Lodex-0.4.2-amd64.deb), close Lodex, and open the package in App Center / Software Install. Your chats and preferences are retained. A [SHA-256 checksum](https://github.com/kjiglobal/Lodex/releases/download/v0.4.2/SHA256SUMS) is included.

**Use this manual installation when upgrading from 0.4.1 or earlier.** Version 0.4.1's update checker still uses the former repository address and cannot validate releases at the new location. After installing 0.4.2, use **Help → Check for Updates** for future releases.

The published installer supports Ubuntu 24.04 or newer on Intel/AMD 64-bit computers. Open **Help** to confirm the installed version is **Lodex 0.4.2**. A ChatGPT account with Codex access is required; no separate API key is needed.

## Verification

Publication requires the Ubuntu build to pass type checking, dependency auditing, runtime and browser regressions, installed-package launch and recovery, native desktop controls, update-installer checks, and local voice transcription. Updater regressions check the current repository endpoint and reject release metadata or package links from the former location.
