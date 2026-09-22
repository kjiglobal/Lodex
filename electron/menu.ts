import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";

export function installMenu(newWindow: () => void) {
  const send = (action: string) => BrowserWindow.getFocusedWindow()?.webContents.send("app:menu", action);
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
    { role: "viewMenu" },
    { label: "Help", submenu: [
      { label: `Lodex ${app.getVersion()}`, enabled: false },
      { label: "About Lodex", click: () => app.showAboutPanel() },
      { label: "Settings", click: () => send("settings") },
      { label: "Open Diagnostics", click: () => send("diagnostics") },
    ] },
  ];
  app.setAboutPanelOptions({ applicationName: "Lodex", applicationVersion: app.getVersion(), version: app.getVersion(), copyright: "An independent Ubuntu client for your ChatGPT account." });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
