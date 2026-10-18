import { contextBridge, ipcRenderer } from "electron";
import type { ChatGPTAction, ChatGPTState } from "./chatgpt-types";

// This bridge belongs ONLY to the local toolbar. The remote view has no preload.
contextBridge.exposeInMainWorld("chatgpt", {
  state: () => ipcRenderer.invoke("chatgpt:state"),
  action: (action: ChatGPTAction) => ipcRenderer.invoke("chatgpt:action", action),
  selectCapture: (id: string | null) => ipcRenderer.invoke("chatgpt:capture", id),
  onChange: (callback: (state: ChatGPTState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: ChatGPTState) => callback(state);
    ipcRenderer.on("chatgpt:changed", listener);
    return () => ipcRenderer.removeListener("chatgpt:changed", listener);
  },
});
