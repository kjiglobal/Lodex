# Lodex 0.4.0 release notes

[Lodex 0.4.0 for Ubuntu](https://github.com/wwdreamb/Lodex/releases/tag/v0.4.0) introduced the desktop controls below. See [the latest release](https://github.com/wwdreamb/Lodex/releases/latest) for the current installer. [Version 0.4.1](RELEASE-0.4.1.md) adds in-app update checks and installation.

- Paste screenshots and images directly into the prompt with Ctrl+V. Images show previews, can be removed, and remain with ordinary drafts after a reload. File attachments and clipboard text continue to work.
- Collapsible Pinned, Projects, and Recents sections. Projects contain chats from opened folders, and pinned chats stay at the top.
- ChatGPT/Codex product dropdown with descriptions and the selected product marked.
- File menu: New Window, New Chat, New Temporary Chat, Open Folder, Close, Log Out, and Quit Lodex. Each window has its own runtime, current project, and active chat. Temporary chats use ephemeral runtime threads and do not write drafts to browser storage.
- Help shows the installed version and offers About Lodex, Settings, and Diagnostics.
- Prompt controls for read-only, project, or full access; account-provided models, model descriptions, input support, and reasoning effort. Full access explicitly disables the sandbox and approval prompts for the selected chat's next turns. Other chats start with their normal access limits.
- Local voice-to-text using multilingual Whisper Tiny. Set it up from the microphone button once (approximately 80 MB), click to record, stop, and edit the inserted text before sending. Recording ends after one minute; canceling or changing chats releases the microphone. Audio stays on the device and is not saved to disk. The downloaded model is cached locally.

The 0.3 renderer recovery and saved-draft protections remain enabled. CPU speech processing runs in a separate worker, so Linux compatibility rendering can stay on.

## Compatibility

Ubuntu 24.04+ on amd64. Model choices and connected tools depend on the signed-in account. ChatGPT and Codex are workflow labels in this independent client; ChatGPT web history and proprietary desktop features are separate. Voice typing is dictation, not a live voice conversation. Temporary chat means no local chat history; it does not change OpenAI's service retention policies.

## Verification

The [Ubuntu 24.04 build](https://github.com/wwdreamb/Lodex/actions/runs/35763842759) passed all 3 runtime and 14 browser checks, installed-package recovery, native desktop checks, and real speech transcription with offline model caching. The same installer was also installed and opened successfully in the Ubuntu 26.04 VirtualBox test VM.

`npm run build` checks renderer and desktop types. `npm test` covers streaming/recovery, persistent image drafts, groups, product switching, model and access controls, and temporary-chat behavior. `node --test tests/desktop.test.cjs` exercises the native menus, real clipboard images, attachment authorization, separate windows and folders, and temporary-image cleanup. Run the desktop check under `xvfb-run -a` on headless Ubuntu.

`scripts/verify-dictation.cjs` downloads the actual model, transcribes the public JFK sample, checks that text reaches the composer, and verifies microphone release on cancel. It makes no paid API calls. Set `LODEX_TEST_EXECUTABLE=/usr/bin/lodex` to verify the installed package. The Ubuntu workflow also installs the .deb and kills a renderer to verify automatic recovery.

Speech recognition uses [Transformers.js](https://huggingface.co/docs/transformers.js/v3.8.1/index) and [Whisper Tiny](https://huggingface.co/Xenova/whisper-tiny). The app-server integration follows the [official protocol](https://learn.chatgpt.com/docs/app-server).
