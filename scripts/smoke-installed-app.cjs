// Verify the installed app, including recovery after a real renderer crash.
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const { setTimeout: delay } = require("node:timers/promises");

async function main() {
  const app = spawn("/usr/bin/lodex", ["--remote-debugging-port=9222", "--inspect=127.0.0.1:9223"], { stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.pipe(process.stdout); app.stderr.pipe(process.stderr);
  let launchError, socket, mainSocket;
  app.on("error", error => { launchError = error; });
  let nextId = 0;
  async function connect() {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (launchError) throw launchError;
      if (app.exitCode !== null) throw new Error(`Lodex exited with ${app.exitCode}`);
      try {
        const response = await fetch("http://127.0.0.1:9222/json/list", { signal: AbortSignal.timeout(1000) });
        const page = (await response.json()).find(target => target.type === "page" && target.url.startsWith("file:"));
        if (page) {
          socket = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((resolve, reject) => {
            socket.addEventListener("open", resolve, { once: true });
            socket.addEventListener("error", reject, { once: true });
          });
          return;
        }
      } catch {}
      await delay(250);
    }
    throw new Error("The installed app did not open its window.");
  }
  const send = (method, params, target = socket) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { target.removeEventListener("message", listener); reject(new Error(`${method} timed out`)); }, 35000);
    const listener = event => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timer); target.removeEventListener("message", listener);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    };
    target.addEventListener("message", listener);
    target.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression, target = socket) => {
    const result = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression }, target);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  try {
    await connect();
    console.log("LODEX_SMOKE_PHASE initial-window-connected");
    const snapshot = await evaluate(`(async () => {
      for (let i = 0; i < 100 && !document.querySelector('.composer'); i++) await new Promise(resolve => setTimeout(resolve, 100));
      await window.lodex.codex.request('account/read', { refreshToken: false });
      const info = await window.lodex.app.info();
      return { title: document.title, hasComposer: !!document.querySelector('.composer'),
        hasSidebar: !!document.querySelector('.sidebar'), runtimeReady: true, softwareRendering: info.softwareRendering };
    })()`);
    if (!snapshot.hasComposer || !snapshot.hasSidebar || !snapshot.softwareRendering) throw new Error(`Incomplete app: ${JSON.stringify(snapshot)}`);
    console.log(`LODEX_SMOKE_PHASE initial-window-ready ${JSON.stringify(snapshot)}`);
    // Write through the real textarea event path, then terminate only the
    // renderer. The main process and Codex runtime must remain alive.
    await evaluate(`(() => {
      const input = document.querySelector('.composer textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Saved recovery test draft');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await delay(100);
    const saved = await evaluate(`JSON.parse(localStorage.getItem('lodex-draft-new') || '{}').text`);
    if (saved !== "Saved recovery test draft") throw new Error("Draft was not persisted before crash.");
    console.log("LODEX_SMOKE_PHASE draft-persisted-crashing-renderer");
    const mainTargets = await (await fetch("http://127.0.0.1:9223/json/list")).json();
    mainSocket = new WebSocket(mainTargets[0].webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      mainSocket.addEventListener("open", resolve, { once: true });
      mainSocket.addEventListener("error", reject, { once: true });
    });
    // Disconnect the renderer debugger before killing its process. Observe
    // recovery through the main process, whose connection survives the crash.
    socket.close();
    const rendererPid = await evaluate(`process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents.getOSProcessId()`, mainSocket);
    if (!Number.isInteger(rendererPid) || rendererPid <= 1 || rendererPid === app.pid) throw new Error("Invalid renderer PID.");
    // SIGKILL models a renderer/OOM termination without waiting for Ubuntu's
    // core-dump handler, which can block intentional Chromium crash commands.
    process.kill(rendererPid, "SIGKILL");
    console.log("LODEX_SMOKE_PHASE renderer-terminated");
    const recovered = await evaluate(`(async () => {
      const window = process.mainModule.require('electron').BrowserWindow.getAllWindows()[0];
      for (let i = 0; i < 100; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (window.webContents.isCrashed() || window.webContents.isLoading()) continue;
        try {
          const state = await window.webContents.executeJavaScript("({ rendererRecovered: !!document.querySelector('.composer'), draftRecovered: document.querySelector('.composer textarea')?.value === 'Saved recovery test draft' })");
          if (state.rendererRecovered) return state;
        } catch {}
      }
      return { rendererRecovered: false, draftRecovered: false };
    })()`, mainSocket);
    if (!recovered.rendererRecovered || !recovered.draftRecovered) throw new Error(`Recovery failed: ${JSON.stringify(recovered)}`);
    const screenshot = await evaluate(`(async () => (await process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'))()`, mainSocket);
    await fs.writeFile("release/ubuntu-smoke.png", Buffer.from(screenshot, "base64"));
    console.log(`LODEX_SMOKE_OK ${JSON.stringify({ ...snapshot, ...recovered })}`);
  } finally { socket?.close(); mainSocket?.close(); app.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
