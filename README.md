# Lodex

Lodex is a native Linux desktop workspace that combines a ChatGPT-style conversation experience with Codex-style project tools. It uses Electron for the desktop shell and the official open-source Codex app-server for authentication, agent turns, approvals, models, and terminal sessions.

## Version 1 capabilities

- Official **Sign in with ChatGPT** browser flow; Lodex never receives the user's password.
- Streaming multi-turn conversations with persisted Codex task history.
- Current model and reasoning-effort selection discovered from the signed-in account.
- Project picker, recursive file browser, Monaco editor, and save support.
- Integrated interactive terminal.
- Git branch/status, staged and unstaged changes, diffs, stage, and unstage.
- Local image attachments and generated-image rendering.
- Command, file-change, permission, and user-input approval surfaces.
- Light, responsive three-pane UI inspired by ChatGPT and Codex without using proprietary OpenAI assets.

## Ubuntu requirements

- Ubuntu 24.04 or newer, x86-64 or ARM64.
- Node.js 22 or newer and npm.
- Git and standard build tools.
- A ChatGPT account with Codex access.

The packaged app contains the matching `@openai/codex` runtime. You do not need to paste an API key or install Codex globally.

## Build on the Ubuntu VM

Copy or mount this repository in Ubuntu, then run:

```bash
sudo apt update
sudo apt install -y nodejs npm git build-essential
chmod +x scripts/build-linux.sh
./scripts/build-linux.sh
```

Artifacts are written to `release/`. Install the Debian package:

```bash
sudo apt install ./release/Lodex-0.1.0-amd64.deb
```

Or run the AppImage:

```bash
chmod +x release/Lodex-0.1.0-x86_64.AppImage
./release/Lodex-0.1.0-x86_64.AppImage
```

If the VM does not provide FUSE support, run the AppImage with `--appimage-extract-and-run` or use the Debian package.

## First launch

1. Select **Sign in with ChatGPT**.
2. Complete the official browser flow with the same ChatGPT credentials you normally use.
3. Select **Open project** and choose a local repository.
4. Start a task. Keep the default **Ask** approval policy until you are comfortable with the commands and edits being proposed.

ChatGPT-managed credentials and task history are maintained by Codex under its normal local state directory (`~/.codex`). Lodex stores only the last opened project path in its Electron user-data directory.

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

Version 1 covers the requested chat, editing, terminal, files, images, and Git workflows. It is not a redistribution of the proprietary ChatGPT or Codex desktop applications, and it cannot duplicate private product internals. Consumer-only features such as Voice, screen sharing, Canvas, proprietary ChatGPT sidebar synchronization, and undocumented experiments are outside this baseline. The app-server boundary is intentionally isolated so documented features can be added as OpenAI exposes them.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the security model and implementation map. The integration follows the official [Codex app-server](https://learn.chatgpt.com/docs/app-server) and [authentication](https://learn.chatgpt.com/docs/authentication) documentation.
