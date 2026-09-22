# Lodex 0.4.1 — Check for Updates

- **Help → Check for Updates** checks the latest stable GitHub release and tells you when Lodex is up to date.
- **About Lodex** now includes the installed version, release notes, and update controls. Settings also offers Check for Updates.
- **Download Update** shows progress and can be canceled. Lodex checks the installer's size and SHA-256 checksum before enabling **Install Update**.
- **Install Update** uses Ubuntu's normal password prompt. Lodex never asks for or saves your password. Ubuntu installs the package, and Lodex confirms the installed version.
- **Restart Lodex** appears after successful installation. Restart when your running tasks are finished. Your chats and settings are kept.

## Install or upgrade

[Download Lodex 0.4.1 for Ubuntu](https://github.com/wwdreamb/Lodex/releases/download/v0.4.1/Lodex-0.4.1-amd64.deb), close Lodex, and open the package in App Center / Software Install. The [release checksum](https://github.com/wwdreamb/Lodex/releases/download/v0.4.1/SHA256SUMS) is also available.

**Lodex 0.4.0 and earlier need this one manual upgrade to add the updater.** From 0.4.1 onward, use Help → Check for Updates for future stable releases.

In-app installation supports the installed Ubuntu `.deb` package, with an installer matching the computer's architecture. AppImage and development builds can check versions and open the release page for manual installation. Ubuntu 24.04+ on Intel/AMD 64-bit computers is the published download target. Checks run only when requested; updates are never installed silently.

## Verification

Regression checks cover numeric version ordering, stable releases, architecture and download-address validation, checksum failures, truncated and canceled downloads, modified installers, canceled authorization, installation failures, and explicit restart. Browser checks cover the About/Help flow, progress, retry, and compact light/dark layouts. Ubuntu verification installs the package, checks the native menu and updater availability, and exercises the same package validation and apt arguments using CI's existing sudo authorization in place of an interactive password prompt.

All [0.4 features](RELEASE-0.4.md), including image paste, sidebar groups, model/access controls, voice typing, and window recovery, are retained.
