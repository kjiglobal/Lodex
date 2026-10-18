import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, session, shell, WebContentsView } from "electron";
import path from "node:path";
import { CHATGPT_HOME, CHATGPT_PARTITION, externalUrl, isChatGPTUrl, isEmbeddedUrl, permissionLabel } from "./chatgpt-policy";
import type { ChatGPTAction, ChatGPTState } from "./chatgpt-types";

const TOP = 64;
const BOTTOM = 32;
const actions = new Set<ChatGPTAction>(["back", "forward", "reload", "home", "browser", "workspace", "info", "clear-session"]);

export class ChatGPTWorkspace {
  private window: BrowserWindow | null = null;
  private view: WebContentsView | null = null;
  private popups = new Set<BrowserWindow>();
  private grants = new Set<string>();
  private capture: { sources: Electron.DesktopCapturerSource[]; finish(id: string | null): void } | null = null;
  private state: ChatGPTState = { origin: "https://chatgpt.com", loading: true, canGoBack: false, canGoForward: false, error: null, notice: null, captureSources: null };
  private webSession: Electron.Session;

  constructor(private readonly openLocal: (action?: string) => void) {
    this.webSession = session.fromPartition(CHATGPT_PARTITION);
    this.configurePermissions();
    this.webSession.on("will-download", (event, item, contents) => {
      if (!this.isChatPage(contents)) { event.preventDefault(); return; }
      // Electron's Save dialog is shown because no save path is assigned.
      item.setSaveDialogOptions({ title: "Save ChatGPT file", defaultPath: path.basename(item.getFilename()) });
      item.on("updated", () => {
        const total = item.getTotalBytes();
        this.state.notice = total > 0 ? `Downloading ${Math.round(item.getReceivedBytes() / total * 100)}%` : "Downloading file…";
        this.publish();
      });
      item.once("done", (_event, status) => {
        this.state.notice = status === "completed" ? `Saved ${path.basename(item.getSavePath())}` : status === "cancelled" ? "Download canceled." : "Download failed. Try downloading the file again.";
        this.publish();
      });
    });
    ipcMain.handle("chatgpt:state", event => { this.assertToolbar(event); return this.snapshot(); });
    ipcMain.handle("chatgpt:action", async (event, action: unknown) => {
      this.assertToolbar(event);
      if (typeof action !== "string" || !actions.has(action as ChatGPTAction)) throw new Error("Unsupported ChatGPT action.");
      await this.action(action as ChatGPTAction);
    });
    ipcMain.handle("chatgpt:capture", (event, id: unknown) => {
      this.assertToolbar(event);
      if (id !== null && typeof id !== "string") throw new Error("Invalid screen selection.");
      this.capture?.finish(id);
    });
  }

  private assertToolbar(event: Electron.IpcMainInvokeEvent) {
    if (!this.window || event.sender !== this.window.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error("Unknown ChatGPT toolbar.");
  }

  private snapshot(): ChatGPTState { return { ...this.state }; }

  private publish() {
    if (!this.window || this.window.isDestroyed() || this.window.webContents.isDestroyed()) return;
    const contents = this.view?.webContents;
    if (contents && !contents.isDestroyed()) {
      const url = contents.getURL();
      this.state.origin = isEmbeddedUrl(url) ? new URL(url).origin : "https://chatgpt.com";
      this.state.canGoBack = contents.navigationHistory.canGoBack();
      this.state.canGoForward = contents.navigationHistory.canGoForward();
      this.view?.setVisible(!this.state.error && !this.state.captureSources);
    }
    this.window.webContents.send("chatgpt:changed", this.snapshot());
  }

  private isChatPage(contents: Electron.WebContents | null): boolean {
    return !!contents && !contents.isDestroyed() && contents === this.view?.webContents && isChatGPTUrl(contents.getURL());
  }

  private configurePermissions() {
    this.webSession.setPermissionCheckHandler((contents, permission, origin, details) => {
      if (!this.isChatPage(contents) || !isChatGPTUrl(origin) || !details.isMainFrame) return false;
      if (permission === "clipboard-sanitized-write") return true;
      // Chromium checks this before invoking our per-request source picker.
      if (String(permission) === "display-capture") return this.window?.isFocused() === true;
      const key = permission === "media" ? `media:${details.mediaType}` : permission;
      return this.grants.has(key);
    });
    this.webSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      if (!this.isChatPage(contents) || !details.isMainFrame || !isChatGPTUrl(details.requestingUrl)) { callback(false); return; }
      if (permission === "clipboard-sanitized-write") { callback(true); return; }
      if (permission === "display-capture") { callback(this.window?.isFocused() === true); return; }
      const types = "mediaTypes" in details && Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
      // Electron 43 reports display/legacy desktop requests as mediaTypes: [].
      // Require fresh consent even for this generic capture permission; do not cache it.
      const screenCapture = permission === "media" && "mediaTypes" in details && Array.isArray(details.mediaTypes) && !types.length;
      const label = screenCapture ? "screen for this sharing request" : permissionLabel(permission, types);
      const window = this.window;
      if (!label || !window || !window.isFocused()) { callback(false); return; }
      const url = contents.getURL();
      const keys = permission === "media" ? types.map(type => `media:${type}`) : [permission];
      if (keys.length && keys.every(key => this.grants.has(key))) { callback(true); return; }
      void dialog.showMessageBox(window, {
        type: "question", title: "ChatGPT permission", message: `Allow chatgpt.com to use your ${label}?`,
        detail: screenCapture ? "Allow screen capture for this request. Standard browser screen sharing will also ask you to choose a screen or window. Deny if you did not start sharing." : "This permission lasts until you close the ChatGPT window. You can deny it and continue chatting.",
        buttons: ["Deny", "Allow"], defaultId: 0, cancelId: 0,
      }).then(result => {
        const allowed = result.response === 1 && this.isChatPage(contents) && contents.getURL() === url && !window.isDestroyed() && window.isFocused();
        if (allowed) keys.forEach(key => this.grants.add(key));
        callback(allowed);
      }).catch(() => callback(false));
    });
    this.webSession.setDevicePermissionHandler(() => false);
    this.webSession.setDisplayMediaRequestHandler((request, callback) => {
      const frame = request.frame;
      if (!frame || frame !== this.view?.webContents.mainFrame || !this.isChatPage(this.view.webContents) || !isChatGPTUrl(request.securityOrigin) || !request.userGesture || !request.videoRequested || !this.window?.isFocused() || this.capture) {
        callback({}); return;
      }
      // Always choose a source for each request; never silently select a display.
      const pending = {
        sources: [] as Electron.DesktopCapturerSource[],
        finish: (id: string | null) => {
          if (this.capture !== pending) return;
          const source = pending.sources.find(source => source.id === id);
          this.capture = null; this.state.captureSources = null;
          const valid = this.view && !this.view.webContents.isDestroyed() && frame === this.view.webContents.mainFrame && this.isChatPage(this.view.webContents);
          try { callback(source && valid ? { video: source } : {}); } catch { /* Request frame closed. */ }
          this.publish();
        },
      };
      this.capture = pending;
      void desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 } }).then(sources => {
        if (this.capture !== pending) return;
        if (!sources.length) { pending.finish(null); return; }
        pending.sources = sources;
        this.state.captureSources = sources.map(source => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() }));
        this.publish(); this.window?.webContents.focus();
      }).catch(() => pending.finish(null));
    });
  }

  private async openExternal(url: string) {
    const safe = externalUrl(url);
    if (!safe) return;
    try { await shell.openExternal(safe); }
    catch { this.state.notice = "Unable to open your browser. Try again."; this.publish(); }
  }

  private protectRemote(contents: Electron.WebContents) {
    const navigate = (event: Electron.Event, url: string) => {
      if (isEmbeddedUrl(url)) return;
      event.preventDefault();
      void this.openExternal(url);
    };
    contents.on("will-navigate", navigate);
    contents.on("will-redirect", (event, url, _inPlace, mainFrame) => { if (mainFrame) navigate(event, url); });
    contents.on("will-attach-webview", event => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (!isEmbeddedUrl(url)) { void this.openExternal(url); return { action: "deny" }; }
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 600, height: 760, autoHideMenuBar: true,
          webPreferences: { session: this.webSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false, preload: "" },
        },
      };
    });
    contents.on("did-create-window", popup => {
      this.popups.add(popup);
      popup.setMenu(null);
      this.protectRemote(popup.webContents);
      const title = () => {
        const url = popup.webContents.getURL();
        popup.setTitle(`${isEmbeddedUrl(url) ? new URL(url).origin : "Sign in"} — Lodex`);
      };
      popup.webContents.on("page-title-updated", event => { event.preventDefault(); title(); });
      popup.webContents.on("did-navigate", title);
      popup.on("closed", () => this.popups.delete(popup));
    });
  }

  open() {
    if (this.window && !this.window.isDestroyed()) { this.window.show(); this.window.focus(); return; }
    this.state = { origin: "https://chatgpt.com", loading: true, canGoBack: false, canGoForward: false, error: null, notice: null, captureSources: null };
    const window = new BrowserWindow({
      title: "ChatGPT — Lodex", width: 1440, height: 960, minWidth: 720, minHeight: 540, backgroundColor: "#212121",
      icon: app.isPackaged ? path.join(process.resourcesPath, "icon.png") : path.join(app.getAppPath(), "build", "icon.png"),
      webPreferences: { preload: path.join(__dirname, "chatgpt-preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    this.window = window;
    const view = new WebContentsView({ webPreferences: { session: this.webSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false } });
    this.view = view;
    window.contentView.addChildView(view);
    const resize = () => {
      const [width, height] = window.getContentSize();
      view.setBounds({ x: 0, y: TOP, width, height: Math.max(0, height - TOP - BOTTOM) });
    };
    resize(); window.on("resize", resize);
    window.webContents.on("will-navigate", event => event.preventDefault());
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("did-finish-load", () => this.publish());
    window.webContents.on("render-process-gone", () => { view.setVisible(false); window.webContents.reload(); });
    this.protectRemote(view.webContents);
    view.webContents.on("did-start-navigation", (_event, _url, sameDocument, mainFrame) => {
      if (mainFrame && !sameDocument) { this.capture?.finish(null); this.state.error = null; this.state.loading = true; this.publish(); }
    });
    view.webContents.on("did-stop-loading", () => { this.state.loading = false; this.publish(); });
    view.webContents.on("did-navigate", () => this.publish());
    view.webContents.on("did-navigate-in-page", () => this.publish());
    view.webContents.on("did-fail-load", (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3) this.fail("ChatGPT could not load. Check your connection, retry, or open ChatGPT in your browser.");
    });
    view.webContents.on("render-process-gone", () => this.fail("The ChatGPT page stopped responding. Reload to reconnect. Unsent text on the website may need to be entered again."));
    window.on("closed", () => {
      this.capture?.finish(null);
      for (const popup of this.popups) if (!popup.isDestroyed()) popup.destroy();
      this.popups.clear(); this.grants.clear();
      // WebContentsView contents are not automatically destroyed with their window.
      if (!view.webContents.isDestroyed()) view.webContents.close();
      this.view = null; this.window = null;
    });
    const dev = process.env.VITE_DEV_SERVER_URL;
    const loaded = dev ? window.loadURL(`${dev}?view=chatgpt`) : window.loadFile(path.join(__dirname, "..", "dist", "index.html"), { query: { view: "chatgpt" } });
    void loaded.catch(() => { if (!window.isDestroyed()) window.close(); });
    void this.loadHome();
  }

  private fail(message: string) { this.state.error = message; this.state.loading = false; this.publish(); }
  private async loadHome() {
    try { await this.view?.webContents.loadURL(CHATGPT_HOME); }
    catch { this.fail("ChatGPT could not load. Check your connection, retry, or open it in your browser."); }
  }

  handlesMenu(action: string): boolean {
    if (BrowserWindow.getFocusedWindow() !== this.window) return false;
    const run = (value: ChatGPTAction) => { void this.action(value).catch(() => { this.state.notice = "That action did not complete. Please try again."; this.publish(); }); };
    if (action === "new-chat") run("home");
    else if (action === "reload") run("reload");
    else if (action === "logout") run("clear-session");
    else if (action === "temporary-chat") {
      void dialog.showMessageBox(this.window!, { message: "Start a temporary chat using ChatGPT’s own chat controls.", detail: "Temporary Chat availability and retention follow your ChatGPT account settings.", buttons: ["OK"] }).catch(() => undefined);
    } else { this.openLocal(action); }
    return true;
  }

  async action(action: ChatGPTAction) {
    const contents = this.view?.webContents;
    if (!contents || contents.isDestroyed() || !this.window) return;
    if (action === "workspace") { this.openLocal(); return; }
    if (action === "browser") { await this.openExternal(isChatGPTUrl(contents.getURL()) ? contents.getURL() : CHATGPT_HOME); return; }
    if (action === "info") {
      await dialog.showMessageBox(this.window, {
        title: "ChatGPT in Lodex", message: "The official ChatGPT website, inside Lodex",
        detail: "Use ChatGPT’s models, history, projects, search, research, images, files, Canvas, apps and other features as they become available to your account on the web.\n\nSign in here separately from the native Codex workspace. Website features and limits depend on your plan, region and workspace settings. Desktop-only features are not added by this window.\n\nIf sign-in or a feature requires a supported browser, use Open in browser. Browser sessions are separate; Lodex does not transfer cookies or credentials.", buttons: ["OK"],
      }); return;
    }
    if (action === "clear-session") {
      const result = await dialog.showMessageBox(this.window, {
        type: "question", title: "Clear ChatGPT session", message: "Sign out of ChatGPT in Lodex?",
        detail: "This clears website cookies, cache and media permissions in Lodex. It does not delete cloud chats or sign out of Codex or your system browser. Unsent website drafts will be lost.", buttons: ["Cancel", "Clear session"], defaultId: 0, cancelId: 0,
      });
      if (result.response !== 1 || contents.isDestroyed()) return;
      this.capture?.finish(null); this.grants.clear();
      for (const popup of this.popups) if (!popup.isDestroyed()) popup.destroy();
      await contents.loadURL("about:blank");
      await this.webSession.clearStorageData(); await this.webSession.clearCache();
      await this.loadHome();
      if (!contents.isDestroyed()) contents.navigationHistory.clear();
      this.publish(); return;
    }
    if (this.capture) this.capture.finish(null);
    this.state.error = null; this.publish();
    if (action === "home") await this.loadHome();
    if (action === "reload") { if (!isEmbeddedUrl(contents.getURL())) await this.loadHome(); else contents.reload(); }
    if (action === "back" && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    if (action === "forward" && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
  }
}
