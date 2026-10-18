# Lodex 0.5.0 — ChatGPT web workspace

This source release adds the official ChatGPT website alongside Lodex’s native Codex workspace. Open it from the sidebar’s **ChatGPT web** button, **Workspace → Open ChatGPT**, or **Ctrl+Shift+G**. Existing local drafts and tasks continue in their original window.

- Persistent, separate ChatGPT website sign-in and access to the web features available to your account.
- Back/forward/home, reload, browser fallback and return to local work.
- Native Save dialogs and progress feedback for website downloads.
- Explicit microphone, camera, clipboard and notification permissions; screen/window selection for each browser screen-sharing request.
- Confirmed web-session clearing independent of Codex authentication and cloud chat history.
- Isolated remote content with no Node or preload bridge, exact-host navigation policy, sandboxed login popups and validated toolbar IPC.
- Offline/crash recovery, browser and desktop integration tests, and a documented capability matrix.
- Patched Electron 43.8.0, concurrently 10.0.6 and DOMPurify 3.4.16 dependencies.

This is not full parity with the proprietary ChatGPT desktop app. Desktop-only Voice, Appshots, computer control and other native services are not supplied by loading the website. Embedded-browser sign-in and individual features remain subject to provider/account support. Use **Open ChatGPT in browser** if required. See [capabilities and limits](CHATGPT-CAPABILITIES.md).

No new OpenAI API credentials are required. ChatGPT web sign-in is separate from Codex and your browser. The website’s cloud chats do not merge with local Codex threads. No release has been published automatically by these source changes.

## Verification

The source build passes TypeScript checks, 19 unit tests, 20 browser UI tests and both native desktop integration suites. An unsigned live check loaded the official ChatGPT homepage with its composer and sign-in controls. Authenticated features and third-party account connections still require manual acceptance. The production dependency audit reports no vulnerabilities; the full development dependency audit still reports findings in the existing build/dictation toolchain, so this is not a claim of a clean full audit.
