import { contextBridge, ipcRenderer } from "electron";

const on = (channel: string, callback: (value: unknown) => void) => {
  const listener = (_event: Electron.IpcRendererEvent, value: unknown) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("lodex", {
  platform: process.platform,
  codex: {
    request: (method: string, params?: unknown) => ipcRenderer.invoke("codex:request", method, params),
    respond: (id: number | string, result: unknown) => ipcRenderer.send("codex:respond", id, result),
    onEvent: (callback: (message: unknown) => void) => on("codex:event", callback),
    onStatus: (callback: (status: unknown) => void) => on("codex:status", callback),
  },
  auth: {
    loginWithChatGPT: () => ipcRenderer.invoke("auth:login-chatgpt"),
    logout: () => ipcRenderer.invoke("auth:logout"),
  },
  workspace: {
    current: () => ipcRenderer.invoke("workspace:current"),
    choose: () => ipcRenderer.invoke("workspace:choose"),
    chooseImages: () => ipcRenderer.invoke("workspace:choose-images"),
    tree: () => ipcRenderer.invoke("workspace:tree"),
    read: (filePath: string) => ipcRenderer.invoke("workspace:read", filePath),
    write: (filePath: string, content: string) => ipcRenderer.invoke("workspace:write", filePath, content),
    imageUrl: (filePath: string) => `lodex-image://local?path=${encodeURIComponent(filePath)}`,
  },
  git: {
    status: () => ipcRenderer.invoke("git:status"),
    diff: (filePath: string, staged: boolean) => ipcRenderer.invoke("git:diff", filePath, staged),
    stage: (filePath: string) => ipcRenderer.invoke("git:stage", filePath),
    unstage: (filePath: string) => ipcRenderer.invoke("git:unstage", filePath),
  },
});
