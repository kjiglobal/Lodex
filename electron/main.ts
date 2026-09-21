import { app, BrowserWindow, ipcMain, net, protocol, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CodexClient } from "./codex-client";
import { WorkspaceService } from "./workspace";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "lodex-image",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

let mainWindow: BrowserWindow | null = null;
const workspace = new WorkspaceService();
const rendererCodexMethods = new Set([
  "account/read",
  "model/list",
  "thread/list",
  "thread/start",
  "thread/resume",
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
const codex = new CodexClient(
  (message) => mainWindow?.webContents.send("codex:event", message),
  (status) => mainWindow?.webContents.send("codex:status", status),
);

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#f7f7f5",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) void mainWindow.loadURL(devServer);
  else void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const current = mainWindow?.webContents.getURL();
    if (current && url !== current) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });

  if (process.env.LODEX_SMOKE_TEST === "1") {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        try {
          // Exercise the packaged runtime as well as the rendered window.
          await codex.start();
          await codex.request("account/read");
          const snapshot = await mainWindow?.webContents.executeJavaScript(`({
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
          if (screenshotPath && mainWindow) {
            const image = await mainWindow.webContents.capturePage();
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
  ipcMain.handle("codex:request", async (_event, method: unknown, params: unknown) => {
    if (typeof method !== "string" || !rendererCodexMethods.has(method)) throw new Error("Unsupported Codex method.");
    const value = params && typeof params === "object" ? { ...(params as Record<string, unknown>) } : {};
    if (method === "thread/start") {
      const surface = value.surface;
      value.cwd = surface === "chat" ? undefined : workspace.current() || undefined;
      value.sandbox = surface === "chat" ? "read-only" : "workspace-write";
      delete value.surface;
    }
    if (method === "turn/start") {
      const surface = value.surface;
      value.cwd = surface === "chat" ? undefined : workspace.current() || undefined;
      delete value.surface;
      delete value.sandboxPolicy;
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
    return codex.request(method, value);
  });

  ipcMain.on("codex:respond", (_event, id: unknown, result: unknown) => {
    if (typeof id !== "number" && typeof id !== "string") return;
    codex.respond(id, result);
  });

  ipcMain.handle("auth:login-chatgpt", async () => {
    const result = await codex.request<{ authUrl?: string }>("account/login/start", {
      type: "chatgpt",
      useHostedLoginSuccessPage: true,
      appBrand: "chatgpt",
    });
    if (!result.authUrl) throw new Error("The Codex runtime did not return a sign-in URL.");
    await shell.openExternal(result.authUrl);
    return result;
  });

  ipcMain.handle("auth:logout", () => codex.request("account/logout"));

  ipcMain.handle("workspace:current", () => workspace.current());
  ipcMain.handle("workspace:choose", () => workspace.choose());
  ipcMain.handle("workspace:choose-images", () => workspace.chooseImages());
  ipcMain.handle("workspace:tree", () => workspace.tree());
  ipcMain.handle("workspace:read", (_event, filePath: unknown) => {
    if (typeof filePath !== "string") throw new Error("Invalid file path.");
    return workspace.read(filePath);
  });
  ipcMain.handle("workspace:write", (_event, filePath: unknown, content: unknown) => {
    if (typeof filePath !== "string" || typeof content !== "string") throw new Error("Invalid file write.");
    return workspace.write(filePath, content);
  });

  ipcMain.handle("git:status", () => workspace.gitStatus());
  ipcMain.handle("git:diff", (_event, filePath: unknown, staged: unknown) => {
    if (typeof filePath !== "string") throw new Error("Invalid Git path.");
    return workspace.gitDiff(filePath, Boolean(staged));
  });
  ipcMain.handle("git:stage", (_event, filePath: unknown) => {
    if (typeof filePath !== "string") throw new Error("Invalid Git path.");
    return workspace.gitStage(filePath);
  });
  ipcMain.handle("git:unstage", (_event, filePath: unknown) => {
    if (typeof filePath !== "string") throw new Error("Invalid Git path.");
    return workspace.gitUnstage(filePath);
  });
}

app.whenReady().then(async () => {
  protocol.handle("lodex-image", (request) => {
    const requestUrl = new URL(request.url);
    const filePath = requestUrl.searchParams.get("path");
    if (!filePath || !/\.(png|jpe?g|webp|gif)$/i.test(filePath) || !workspace.canLoadImage(filePath)) {
      return new Response("Unsupported image", { status: 400 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

  await workspace.load();
  registerIpc();
  createWindow();
  void codex.start().catch(() => undefined);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => codex.stop());
