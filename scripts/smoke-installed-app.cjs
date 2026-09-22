// Verify the installed app, including recovery after a real renderer crash.
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const { setTimeout: delay } = require("node:timers/promises");

async function main() {
  const app = spawn("/usr/bin/lodex", ["--remote-debugging-port=9222"], { stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.pipe(process.stdout); app.stderr.pipe(process.stderr);
  let launchError, socket;
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
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const target = socket;
    const timer = setTimeout(() => { target.removeEventListener("message", listener); reject(new Error(`${method} timed out`)); }, 15000);
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
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  try {
    await connect();
    const snapshot = await evaluate(`(async () => {
      for (let i = 0; i < 100 && !document.querySelector('.composer'); i++) await new Promise(resolve => setTimeout(resolve, 100));
      await window.lodex.codex.request('account/read', { refreshToken: false });
      const info = await window.lodex.app.info();
      return { title: document.title, hasComposer: !!document.querySelector('.composer'),
        hasSidebar: !!document.querySelector('.sidebar'), runtimeReady: true, softwareRendering: info.softwareRendering };
    })()`);
    if (!snapshot.hasComposer || !snapshot.hasSidebar || !snapshot.softwareRendering) throw new Error(`Incomplete app: ${JSON.stringify(snapshot)}`);
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
    socket.send(JSON.stringify({ id: ++nextId, method: "Page.crash" }));
    await delay(1500);
    socket.close();
    await connect();
    const recovered = await evaluate(`(async () => {
      for (let i = 0; i < 100 && !document.querySelector('.composer textarea'); i++) await new Promise(resolve => setTimeout(resolve, 100));
      return { rendererRecovered: !!document.querySelector('.composer'), draftRecovered: document.querySelector('.composer textarea')?.value === 'Saved recovery test draft' };
    })()`);
    if (!recovered.rendererRecovered || !recovered.draftRecovered) throw new Error(`Recovery failed: ${JSON.stringify(recovered)}`);
    const screenshot = await send("Page.captureScreenshot", { format: "png" });
    await fs.writeFile("release/ubuntu-smoke.png", Buffer.from(screenshot.data, "base64"));
    console.log(`LODEX_SMOKE_OK ${JSON.stringify({ ...snapshot, ...recovered })}`);
  } finally { socket?.close(); app.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
