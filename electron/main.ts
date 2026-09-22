import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CodexClient } from "./codex-client";
import { WorkspaceService } from "./workspace";
import { installMenu } from "./menu";
import { accessMode, sandboxMode, sandboxPolicy } from "./access";

// Software rendering avoids blank surfaces on Linux drivers after suspend.
// Keep an opt-in for machines whose GPU is known to work well with Electron.
const softwareRendering = process.platform === "linux" && process.env.LODEX_HARDWARE_ACCELERATION !== "1";
if (softwareRendering) app.disableHardwareAcceleration();
if (process.env.LODEX_USER_DATA_DIR) app.setPath("userData", path.resolve(process.env.LODEX_USER_DATA_DIR));

let diagnosticWrites = Promise.resolve();
function recordDiagnostic(category: string): void {
  diagnosticWrites = diagnosticWrites.then(async () => {
    const logPath = path.join(app.getPath("userData"), "diagnostics.log");
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    if (((await fs.stat(logPath).catch(() => null))?.size || 0) > 256_000) await fs.writeFile(logPath, "");
    await fs.appendFile(logPath, `${new Date().toISOString()} ${category}\n`);
  }).catch(() => undefined);
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "lodex-image",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

let mainWindow: BrowserWindow | null = null;
type WindowSession = { workspace: WorkspaceService; codex: CodexClient };
const sessions = new Map<number, WindowSession>();
function sessionFor(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): WindowSession {
  const value = sessions.get(event.sender.id);
  if (!value || event.senderFrame !== event.sender.mainFrame) throw new Error("Unknown Lodex window.");
  return value;
}
const rendererCodexMethods = new Set([
  "account/read",
  "model/list",
  "thread/list",
  "thread/start",
  "thread/unsubscribe",
  "thread/resume",
  "thread/read",
  "thread/fork",
  "thread/unarchive",
  "thread/name/set",
  "thread/archive",
  "thread/goal/set",
  "thread/goal/get",
  "thread/goal/clear",
  "thread/compact/start",
  "turn/start",
  "turn/interrupt",
  "account/rateLimits/read",
  "account/usage/read",
  "skills/list",
  "app/list",
  "command/exec",
  "command/exec/write",
  "command/exec/resize",
  "command/exec/terminate",
]);
async function createWindow(): Promise<void> {
  const workspace = new WorkspaceService();
  await workspace.load();
  const isAdditional = sessions.size > 0;
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 720,
    minHeight: 540,
    backgroundColor: "#212121",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const window = mainWindow;
  const sendToRenderer = (channel: string, value: unknown) => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      try { window.webContents.send(channel, value); } catch { /* Renderer is recovering. */ }
    }
  };
  const codex = new CodexClient(message => {
    const item = (message.params as { item?: { type?: string; savedPath?: string } } | undefined)?.item;
    if (item?.type === "imageGeneration") workspace.allowGeneratedImage(item.savedPath);
    sendToRenderer("codex:event", message);
  }, status => sendToRenderer("codex:status", status));
  const windowId = window.webContents.id;
  sessions.set(windowId, { workspace, codex });
  window.on("closed", () => {
    codex.stop(); sessions.delete(windowId);
    void workspace.clearTemporaryImages();
    if (mainWindow === window) mainWindow = BrowserWindow.getAllWindows()[0] || null;
  });
  void codex.start().catch(() => undefined);
  let recoveryAttempts = 0;
  let recoveryReset: NodeJS.Timeout | undefined;
  let recoveryDialogOpen = false;
  const recover = async (automatic: boolean) => {
    if (window.isDestroyed()) return;
    if (automatic && recoveryAttempts++ < 2) {
      recordDiagnostic("renderer-auto-reload");
      window.webContents.reload();
      return;
    }
    if (recoveryDialogOpen) return;
    recoveryDialogOpen = true;
    try {
      const result = await dialog.showMessageBox(window, {
        type: "warning", title: "Recover Lodex", buttons: ["Reload window", "Wait"], defaultId: 0,
        message: "The Lodex window stopped responding.",
        detail: "Reloading reopens your chat and saved draft. It does not resend messages or restart the task runtime.",
      });
      if (result.response === 0 && !window.isDestroyed()) window.webContents.reload();
    } finally { recoveryDialogOpen = false; }
  };
  window.webContents.on("render-process-gone", (_event, details) => {
    recordDiagnostic(`renderer-gone:${details.reason}`);
    if (details.reason !== "clean-exit") void recover(true);
  });
  window.on("unresponsive", () => { recordDiagnostic("window-unresponsive"); void recover(false); });
  window.webContents.on("did-finish-load", () => {
    clearTimeout(recoveryReset);
    recoveryReset = setTimeout(() => { recoveryAttempts = 0; }, 60_000);
  });
  window.on("closed", () => clearTimeout(recoveryReset));
  window.webContents.on("did-fail-load", (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) { recordDiagnostic(`load-failed:${code}`); void recover(false); }
  });
  window.webContents.on("preload-error", () => recordDiagnostic("preload-error"));

  const devServer = process.env.VITE_DEV_SERVER_URL;
  const windowSlot = isAdditional ? String(windowId) : "primary";
  const loaded = devServer ? window.loadURL(devServer + "?window=" + windowSlot) : window.loadFile(path.join(__dirname, "..", "dist", "index.html"), { query: { window: windowSlot } });
  void loaded.catch(() => recordDiagnostic("window-load-rejected"));

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const current = window.webContents.getURL();
    if (current && url !== current) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });

  if (process.env.LODEX_SMOKE_TEST === "1") {
    window.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          // Exercise the packaged runtime as well as the rendered window.
          await codex.start();
          await codex.request("account/read", { refreshToken: false });
          const snapshot = await window.webContents.executeJavaScript(`({
            title: document.title,
            hasRoot: Boolean(document.querySelector('#root')),
            hasComposer: Boolean(document.querySelector('.composer')),
            hasSidebar: Boolean(document.querySelector('.sidebar')),
            text: document.body.innerText.slice(0, 500)
          })`);
          if (!snapshot?.hasRoot || !snapshot.hasComposer || !snapshot.hasSidebar) {
            throw new Error("The Lodex window did not render its main controls.");
          }
          const screenshotPath = process.env.LODEX_SMOKE_SCREENSHOT;
          if (screenshotPath && !window.isDestroyed()) {
            const image = await window.webContents.capturePage();
            await fs.writeFile(screenshotPath, image.toPNG());
          }
          console.log(`LODEX_SMOKE_OK ${JSON.stringify(snapshot)}`);
          app.exit(0);
        } catch (error) {
          console.error("LODEX_SMOKE_FAILED", error);
          app.exit(1);
        }
      }, 2500);
    });
  }
}

function registerIpc(): void {
  ipcMain.handle("app:info", () => ({ version: app.getVersion(), softwareRendering }));
  ipcMain.on("app:report-error", (_event, category: unknown) => {
    if (typeof category === "string" && /^[a-z-]{1,80}$/.test(category)) recordDiagnostic(category);
  });
  ipcMain.handle("app:open-diagnostics", async () => {
    recordDiagnostic(`lodex-${app.getVersion()}:software-rendering-${softwareRendering}`);
    await diagnosticWrites;
    const error = await shell.openPath(path.join(app.getPath("userData"), "diagnostics.log"));
    if (error) throw new Error(error);
  });
  ipcMain.handle("app:export-chat", async (_event, title: unknown, content: unknown) => {
    if (typeof title !== "string" || typeof content !== "string" || content.length > 10_000_000) throw new Error("Invalid chat export.");
    const result = await dialog.showSaveDialog({
      title: "Export chat", defaultPath: `${title.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 80) || "Lodex chat"}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!result.filePath || result.canceled) return false;
    await fs.writeFile(result.filePath, content, "utf8");
    return true;
  });
  ipcMain.handle("codex:pending-requests", event => sessionFor(event).codex.pendingServerRequests());
  ipcMain.handle("codex:request", async (_event, method: unknown, params: unknown) => {
    const { workspace, codex } = sessionFor(_event);
    if (typeof method !== "string" || !rendererCodexMethods.has(method)) throw new Error("Unsupported Codex method.");
    const value = params && typeof params === "object" ? { ...(params as Record<string, unknown>) } : {};
    if (method === "thread/start" || method === "thread/fork") {
      const surface = value.surface;
      if (method === "thread/start") value.cwd = surface === "chat" ? undefined : workspace.current() || undefined;
      if (method === "thread/start" && typeof value.restartFromThreadId === "string") {
        const source = await codex.request<{ thread: { cwd: string } }>("thread/read", { threadId: value.restartFromThreadId });
        value.cwd = source.thread.cwd;
      }
      delete value.restartFromThreadId;
      value.sandbox = sandboxMode(accessMode(value.accessMode, surface));
      delete value.accessMode;
      delete value.surface;
    }
    if (method === "turn/start") {
      // Continue in the thread's own directory. A project selected elsewhere
      // must not silently redirect an existing conversation's file operations.
      delete value.cwd;
      const mode = accessMode(value.accessMode, value.surface);
      const source = await codex.request<{ thread: { cwd: string } }>("thread/read", { threadId: value.threadId });
      value.sandboxPolicy = sandboxPolicy(mode, source.thread.cwd);
      delete value.accessMode;
      delete value.surface;
    }
    if (method.startsWith("command/exec")) {
      const processId = value.processId;
      if (typeof processId !== "string" || !processId.startsWith("lodex-terminal-")) throw new Error("Invalid terminal session.");
      if (method === "command/exec") {
        const expectedShell = process.platform === "win32" ? ["powershell.exe", "-NoLogo"] : [process.platform === "darwin" ? "/bin/zsh" : "/bin/bash", "-l"];
        if (JSON.stringify(value.command) !== JSON.stringify(expectedShell)) throw new Error("Unsupported terminal command.");
        value.cwd = workspace.current() || undefined;
        value.sandboxPolicy = { type: "dangerFullAccess" };
      }
      if (typeof value.deltaBase64 === "string" && value.deltaBase64.length > 1_500_000) throw new Error("Terminal input is too large.");
    }
    const result = await codex.request(method, value);
    if (["thread/resume", "thread/read", "thread/fork"].includes(method)) {
      const thread = (result as { thread?: { turns?: Array<{ items?: Array<{ type?: string; savedPath?: string }> }> } })?.thread;
      for (const turn of thread?.turns || []) for (const item of turn.items || []) {
        if (item.type === "imageGeneration") workspace.allowGeneratedImage(item.savedPath);
      }
    }
    return result;
  });

  ipcMain.on("codex:respond", (_event, id: unknown, result: unknown) => {
    const { codex } = sessionFor(_event);
    if (typeof id !== "number" && typeof id !== "string") return;
    try { codex.respond(id, result); }
    catch { _event.sender.send("codex:status", { state: "error", message: "The runtime disconnected before receiving your response. Reconnect to continue." }); }
  });

  ipcMain.handle("auth:login-chatgpt", async event => {
    const { codex } = sessionFor(event);
    const result = await codex.request<{ authUrl?: string }>("account/login/start", {
      type: "chatgpt",
      useHostedLoginSuccessPage: true,
      appBrand: "chatgpt",
    });
    if (!result.authUrl) throw new Error("The Codex runtime did not return a sign-in URL.");
    await shell.openExternal(result.authUrl);
    return result;
  });

  ipcMain.handle("auth:logout", async event => {
    const result = await sessionFor(event).codex.request("account/logout");
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("codex:event", { method: "account/updated", params: {} });
    return result;
  });

  ipcMain.handle("workspace:projects", event => sessionFor(event).workspace.listProjects());
  ipcMain.handle("workspace:select", (event, value: unknown) => sessionFor(event).workspace.selectProject(value));
  ipcMain.handle("workspace:paste-image", (event, bytes: unknown, temporary: unknown) => sessionFor(event).workspace.pasteImage(bytes, temporary === true));
  ipcMain.handle("workspace:clear-temporary", event => sessionFor(event).workspace.clearTemporaryImages());
  ipcMain.handle("workspace:current", event => sessionFor(event).workspace.current());
  ipcMain.handle("workspace:choose", event => sessionFor(event).workspace.choose());
  ipcMain.handle("workspace:choose-images", event => sessionFor(event).workspace.chooseImages());
  ipcMain.handle("workspace:choose-attachments", event => sessionFor(event).workspace.chooseAttachments());
  ipcMain.handle("workspace:attachment-inputs", (_event, attachments: unknown) => sessionFor(_event).workspace.attachmentInputs(attachments));
  ipcMain.handle("workspace:tree", event => sessionFor(event).workspace.tree());
  ipcMain.handle("workspace:read", (_event, filePath: unknown) => {
    if (typeof filePath !== "string") throw new Error("Invalid file path.");
    return sessionFor(_event).workspace.read(filePath);
  });
  ipcMain.handle("workspace:write", (_event, filePath: unknown, content: unknown) => {
    if (typeof filePath !== "string" || typeof content !== "string") throw new Error("Invalid file write.");
    return sessionFor(_event).workspace.write(filePath, content);
  });

  ipcMain.handle("git:status", event => sessionFor(event).workspace.gitStatus());
  ipcMain.handle("git:diff", (_event, filePath: unknown, staged: unknown) => {
    if (typeof filePath !== "string") throw new Error("Invalid Git path.");
    return sessionFor(_event).workspace.gitDiff(filePath, Boolean(staged));
  });
  ipcMain.handle("git:stage", (_event, filePath: unknown) => {
    if (typeof filePath !== "string") throw new Error("Invalid Git path.");
    return sessionFor(_event).workspace.gitStage(filePath);
  });
  ipcMain.handle("git:unstage", (_event, filePath: unknown) => {
    if (typeof filePath !== "string") throw new Error("Invalid Git path.");
    return sessionFor(_event).workspace.gitUnstage(filePath);
  });
}

app.whenReady().then(async () => {
  protocol.handle("lodex-image", (request) => {
    const requestUrl = new URL(request.url);
    const filePath = requestUrl.searchParams.get("path");
    if (!filePath || !/\.(png|jpe?g|webp|gif)$/i.test(filePath) || ![...sessions.values()].some(value => value.workspace.canLoadImage(filePath))) {
      return new Response("Unsupported image", { status: 400 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(permission === "media" && sessions.has(contents.id) && details.isMainFrame && "mediaTypes" in details && details.mediaTypes?.every(type => type === "audio") === true);
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => permission === "media" && details.mediaType === "audio" && !!contents && sessions.has(contents.id));
  registerIpc();
  installMenu(() => { void createWindow(); });
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => { for (const value of sessions.values()) { value.codex.stop(); void value.workspace.clearTemporaryImages(); } });
