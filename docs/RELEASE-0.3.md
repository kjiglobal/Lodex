# Lodex 0.3 release notes

## Reliability

The 0.2 renderer assumed a file change's `kind` was a string. The Codex protocol sends an object such as `{ type: "update", move_path: null }`. Rendering that object directly as a React child throws and unmounts the app, which appears as a blank window during a task. The updated renderer reads the kind's type, validates incoming items, and isolates failures with message and app error boundaries.

Streaming updates are batched every 50 ms, command previews retain the last 64,000 characters, and long transcripts initially render the most recent 150 items with a Show earlier messages control. The editor is loaded only when opening project tools. Scrolling up no longer jumps back to the bottom on each token.

The main process attempts at most two automatic renderer reloads per minute after a crash. It keeps Codex running and restores the active conversation, saved draft, and outstanding approvals. Repeated crashes and hangs offer native recovery controls. No prompt is automatically resent. Linux defaults to software rendering to reduce GPU-related blank surfaces; `LODEX_HARDWARE_ACCELERATION=1` opts into GPU rendering.

Codex requests now wait for the initialize handshake. A late exit from an old runtime cannot clear a replacement process. Runtime failures offer Reconnect in the chat. Diagnostic logs record fault categories without prompt text, tool output, credentials, or stack traces.

## Chat experience

- Chat-first light and dark layouts with a centered composer, quieter sidebar, and responsive model controls.
- Chat, Work, and Build surfaces; available models come from the signed-in account. Bundled Codex updated from 0.150.1 to 0.155.1 (the npm latest release when checked).
- Persistent per-chat drafts, including attachment selections; Enter cannot start another turn while one is running. IME composition does not submit a message.
- Photo and file picker. Images use native image input. Supported text files are included as text (up to 500 KB); other documents are passed as file references, so format support depends on runtime tools. Up to eight attachments and 20 MB per file. There is no separate document conversion service.
- Copy responses and code, export a conversation to Markdown, and branch a conversation.
- Edit a message or retry an answer in a new branch; the original history is retained. Existing project file changes are not undone.
- Inline chat rename, pins, archived-chat restore, settings, and custom instructions for new chats.
- Ctrl+Shift+O for new chat, Ctrl+K for chat search, Ctrl+B for the sidebar.

## Compatibility boundary

This is a native Codex-based client, not the proprietary ChatGPT app. ChatGPT web history synchronization, live voice, Canvas, scheduled tasks, full browser/computer control, and the complete ChatGPT plugin/Library experience are not implemented. App/skill discovery and image generation depend on the signed-in runtime's tools. The Settings screen explains this boundary and links to ChatGPT.

The current product reference is [Use ChatGPT](https://learn.chatgpt.com/docs/use-chatgpt); the supported integration is [Codex App Server](https://developers.openai.com/codex/app-server). Wire shapes were also checked against generated TypeScript from the bundled 0.155.1 executable.

## Verification

Run `npm run build`, then `npm test`. The suite covers the startup race, late process exits, retained approvals, object-shaped file changes, burst streaming, bounded output, reload recovery, failed-send drafts, attachments, custom instructions, branching, rename, export, archive restore, and light/dark/compact layouts. Browser tests use a deterministic runtime fixture and do not make paid model calls.

The Ubuntu workflow additionally installs the actual Debian package, checks its launcher and bundled runtime, opens the normal sandboxed app, forces a renderer crash, and verifies that the window and draft recover. It saves the installer, checksum, screenshots, and verification log as build artifacts.
