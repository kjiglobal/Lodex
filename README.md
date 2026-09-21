# Lodex

Lodex is a native Linux desktop workspace that combines a ChatGPT-style conversation experience with Codex-style project tools. It uses Electron for the desktop shell and the official open-source Codex app-server for authentication, agent turns, approvals, models, and terminal sessions.

## Lodex 0.2 capabilities

- Official **Sign in with ChatGPT** browser flow; Lodex never receives the user's password.
- Streaming multi-turn conversations with persisted Codex task history.
- Current model and reasoning-effort selection discovered from the signed-in account.
- Chat, Work, and Build modes for conversation-only, goal-oriented, and project workflows.
- ChatGPT/Codex product navigation that maps Chat and Work to ChatGPT-style workflows and project work to Codex.
- Searchable chat history with rename, local pinning, archive, active-state indicators, and response copy actions.
- Durable goals, live plans, task activity, token/context feedback, and manual conversation compaction.
- ChatGPT apps and local/project skills discovery from the current Codex runtime.
- Account plan, rate-limit, and usage feedback when the signed-in account exposes it.
- Project picker, recursive file browser, Monaco editor, and save support.
- Integrated interactive terminal.
- Git branch/status, staged and unstaged changes, diffs, stage, and unstage.
- Local image attachments and generated-image rendering.
- Command, file-change, permission, and user-input approval surfaces.
- Light/dark, responsive UI inspired by the current ChatGPT and Codex product structure without using proprietary OpenAI assets.
- Desktop shortcuts: `Ctrl/Cmd+K` searches chats, `Ctrl/Cmd+N` starts a new chat or task, `Ctrl/Cmd+Alt+N` opens a quick chat, and `Ctrl/Cmd+Shift+O` opens a project.

## Install on Ubuntu (no terminal needed)

1. [Download the Ubuntu installer](https://github.com/wwdreamb/Lodex/releases/latest/download/Lodex-0.2.0-amd64.deb) on your Ubuntu laptop.
2. Open **Downloads** and double-click **Lodex-0.2.0-amd64.deb**.
3. Click **Install** in App Center / Software Install and enter your Ubuntu password when asked.
4. Open **Lodex** from the applications menu, then choose **Sign in with ChatGPT**.

This installer is for **Ubuntu 24.04 or newer on Intel/AMD 64-bit laptops**. It includes Electron and the Linux Codex runtime; you do not need Node.js, npm, a global Codex installation, or an API key. Ubuntu installs the package's system dependencies automatically, so keep an internet connection available during installation. A ChatGPT account with Codex access is required to use the app.

If double-clicking opens Archive Manager, right-click the file, choose **Open With**, and select **App Center** or **Software Install**. If neither is available, install **GDebi Package Installer** from App Center and open the file with GDebi.

For an ARM64 laptop, build on ARM64 Ubuntu using the instructions below; the amd64 download is not compatible with ARM.

## Requirements for building from source

- Ubuntu 24.04 or newer, x86-64 or ARM64.
- Node.js 22 or newer and npm.
- Git and standard build tools.
- A ChatGPT account with Codex access.

The packaged app contains the matching `@openai/codex` runtime. You do not need to paste an API key or install Codex globally.

## Build on Ubuntu

Copy or mount this repository in Ubuntu, then run:

```bash
sudo apt update
sudo apt install -y git build-essential
chmod +x scripts/build-linux.sh
./scripts/build-linux.sh
```

Install Node.js 22 (latest 22.x) or newer before running the script. Ubuntu 24.04's default Node.js package is too old for the build. To build only the double-click Ubuntu installer, run `npm run dist:ubuntu`.

Artifacts are written to `release/`. Install the Debian package:

```bash
sudo apt install ./release/Lodex-0.2.0-amd64.deb
```

Or run the AppImage:

```bash
chmod +x release/Lodex-0.2.0-x86_64.AppImage
./release/Lodex-0.2.0-x86_64.AppImage
```

If the VM does not provide FUSE support, run the AppImage with `--appimage-extract-and-run` or use the Debian package.

The **Ubuntu installer** GitHub Actions workflow builds on Ubuntu 24.04, installs the `.deb`, validates its application launcher, runs its bundled Codex runtime, and checks that the app window opens with the Electron sandbox enabled. It saves the installer, SHA-256 checksum, and verification screenshot as workflow artifacts. Run `bash scripts/verify-ubuntu-package.sh` only on a disposable Ubuntu test machine because it installs the package.

## First launch

1. Select **Sign in with ChatGPT**.
2. Complete the official browser flow with the same ChatGPT credentials you normally use.
3. Choose **ChatGPT** for Chat or Work, or choose **Codex** for project work.
4. In Build mode, select **Open project** and choose a local repository.
5. Start a task. Keep the default **Ask** approval policy until you are comfortable with the commands and edits being proposed.

ChatGPT-managed credentials and task history are maintained by Codex under its normal local state directory (`~/.codex`). Lodex stores UI preferences such as the last opened project, theme, and locally pinned chats in its Electron user-data or browser storage. Pin state is local to Lodex; archived and renamed chats are persisted by Codex.

## Development

```bash
npm ci
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run build
npm audit
```

Set `LODEX_CODEX_PATH` to an explicit `codex` executable to test a locally built runtime instead of the bundled npm package.

## Scope and compatibility

Lodex 0.2 covers the requested chat, goals, plans, activity, apps/skills discovery, editing, terminal, files, images, and Git workflows. It is not a redistribution of the proprietary ChatGPT or Codex desktop applications, and it cannot duplicate private product internals. Voice, screen sharing, Canvas, full browser/computer control, proprietary ChatGPT history synchronization, and undocumented experiments are not yet implemented. The app-server boundary is intentionally isolated so supported features can be added as OpenAI exposes them.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the security model and implementation map. The integration follows the official [Codex app-server](https://learn.chatgpt.com/docs/app-server) and [authentication](https://learn.chatgpt.com/docs/authentication) documentation.
