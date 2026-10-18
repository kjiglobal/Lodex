# ChatGPT capability coverage

Reviewed against [ChatGPT’s current features](https://learn.chatgpt.com/docs/features) and [cloud/local workflow documentation](https://learn.chatgpt.com/docs/use-chatgpt) on October 18, 2026. Feature availability depends on plan, platform, region, rollout and workspace policy. This is a map of integration paths, not a claim that every account exposes every feature.

Lodex has two independent experiences:

1. **ChatGPT web:** the actual `https://chatgpt.com` website in an isolated Electron view. Sign in there to access your website account, history and current web tools. No local implementation of those services is substituted.
2. **Local workspace:** Lodex’s existing native Chat, Work and Codex interface, powered by the bundled app-server. Its files, drafts, permissions and conversations stay local to that integration.

| Capability | ChatGPT web in Lodex | Native local workspace |
| --- | --- | --- |
| Current models and reasoning choices | Website/account controls update with ChatGPT | Models and reasoning discovered from the Codex account |
| Cloud chat history, search, archive, sharing | Website’s own history and controls | Separate Codex history, local search/pins, rename/archive, Markdown export |
| Projects and conversation context | Cloud projects available on the website | Local project folders, project threads and custom instructions |
| Memory, personalization, temporary chats | Website’s own account controls and retention rules | Custom instructions and ephemeral Codex threads; no shared ChatGPT memory |
| Web search and research | Available website tools and account limits | Tools exposed by the configured Codex runtime |
| Images and multimodal input | Website tools, uploads and generated results | Local image attachments and runtime-generated images |
| Files, data analysis and downloadable artifacts | Website file picker, analysis tools and native Save dialog | Local attachments, editor, terminal and generated files |
| Canvas, interactive outputs and visualizations | Available website experiences | Markdown, code blocks, images and local code editing; no native Canvas |
| Apps, plugins and connected accounts | Website-managed connections and consent; external connection flows may need a browser | Runtime app and skill discovery |
| Sites and Space | Use through ChatGPT when exposed to the web account | No native Sites hosting or Space collaboration service |
| Scheduled tasks and cloud work | Website-managed services, if available | Goals and live activity; no new local scheduler in this release |
| Voice dictation | Website feature if available, with microphone permission | Existing local Whisper dictation |
| Live ChatGPT Voice | Browser media support does not imply access to desktop Voice | Not implemented; the documented GPT-Live desktop service is not exposed by this integration |
| Camera and screen sharing | Browser API support when the website requests it; explicit camera permission or source selection | Image paste/attachments; no continuous screen context |
| Browser/computer use | Website cloud tools when available to the account | No added local browser/computer control service |
| Local code, terminal, Git and approvals | No access to Lodex’s native IPC or local tools | Existing editor, terminal, Git, tool approvals and sandbox controls |
| Mobile delegation, Appshots, browser extension, pets and other desktop integrations | Only functionality actually offered by the website | Not reproduced by this release |

The [ChatGPT Voice documentation](https://learn.chatgpt.com/docs/features/voice) describes desktop and paired-mobile functionality, including platform-specific screen context. Loading ChatGPT in Electron does not provide those proprietary desktop integrations. System audio is not included in Lodex’s screen-sharing implementation.

## Sign-in and compatibility

ChatGPT web, Codex authentication and your system browser use separate sessions. Lodex does not copy tokens or cookies between them. Website uploads and cloud tools send data to their services under the account’s settings; native local dictation keeps its existing local processing behavior.

Main-page navigation is limited to ChatGPT and explicit sign-in hosts. Trusted authentication popups are sandboxed with no preload bridge. Other HTTP(S) links open in the system browser; privileged URL schemes are rejected. Enterprise SSO, third-party OAuth and providers that prohibit embedded user agents may require completing the workflow in a supported browser. Browser fallback opens the page; it does not sign Lodex in or synchronize drafts.

Microphone/camera, notifications and clipboard-read permissions require confirmation and expire when the ChatGPT window closes. A requesting iframe or unrelated origin cannot acquire them. Screen sharing requires a user gesture and source selection every time; Linux’s screen-capture portal may also prompt. File downloads use the native Save dialog and are never executed automatically.

**Clear ChatGPT session** requires confirmation and clears web storage/cache and Lodex’s remembered media grants. It does not delete cloud conversations, revoke server sessions on other devices, or sign out of Codex. Unsent website drafts are not backed up by Lodex. Offline and renderer-crash states offer reload and browser fallback without resending messages.

## Validation

Unit tests cover origin validation, remote/preload isolation, IPC ownership, permission approval and navigation races, screen-source selection/cancel, session clearing, and recovery. Browser tests cover navigation controls, compact layouts, errors, screen selection and preservation of native work. The desktop integration test uses a controlled HTTPS fixture to exercise real Electron views, history, isolation, recovery and independent cookie stores without signing into a real account.

Live account sign-in and gated website features require manual acceptance with the intended account. Automated fixtures do not verify provider acceptance, paid tools, live Voice, connector consent or desktop-only services.
