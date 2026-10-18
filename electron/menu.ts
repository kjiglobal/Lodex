import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";

export function installMenu(newWindow: () => void, openChatGPT: () => void, routeChatGPT: (action: string) => boolean) {
  const send = (action: string) => { if (!routeChatGPT(action)) BrowserWindow.getFocusedWindow()?.webContents.send("app:menu", action); };
  const template: MenuItemConstructorOptions[] = [
    { label: "File", submenu: [
      { label: "New Window", click: newWindow },
      { label: "New Chat", accelerator: "CmdOrCtrl+N", click: () => send("new-chat") },
      { label: "New Temporary Chat", accelerator: "CmdOrCtrl+Shift+N", click: () => send("temporary-chat") },
      { type: "separator" },
      { label: "Open Folder…", accelerator: "CmdOrCtrl+O", click: () => send("open-folder") },
      { type: "separator" },
      { role: "close", label: "Close", accelerator: "CmdOrCtrl+W" },
      { type: "separator" },
      { label: "Log Out", click: () => send("logout") },
      { role: "quit", label: "Quit Lodex", accelerator: "CmdOrCtrl+Q" },
    ] },
    { role: "editMenu" },
    { label: "View", submenu: [
      { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => { if (!routeChatGPT("reload")) BrowserWindow.getFocusedWindow()?.webContents.reload(); } },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
      { type: "separator" }, { role: "togglefullscreen" },
    ] },
    { label: "Workspace", submenu: [
      { label: "Open ChatGPT", accelerator: "CmdOrCtrl+Shift+G", click: openChatGPT },
      { label: "Local workspace", click: () => send("local-workspace") },
    ] },
    { label: "Help", submenu: [
      { label: `Lodex ${app.getVersion()}`, enabled: false },
      { label: "About Lodex", click: () => send("about") },
      { label: "Check for Updates…", click: () => send("updates") },
      { type: "separator" },
      { label: "Settings", click: () => send("settings") },
      { label: "Open Diagnostics", click: () => send("diagnostics") },
    ] },
  ];
  app.setAboutPanelOptions({ applicationName: "Lodex", applicationVersion: app.getVersion(), version: app.getVersion(), copyright: "An independent Ubuntu client for your ChatGPT account." });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
