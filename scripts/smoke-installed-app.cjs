// Verify the installed app through its normal UI and IPC, without a test-mode launch.
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const { setTimeout: delay } = require("node:timers/promises");

async function main() {
  const app = spawn("/usr/bin/lodex", ["--disable-gpu", "--remote-debugging-port=9222"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.pipe(process.stdout);
  app.stderr.pipe(process.stderr);
  let launchError;
  app.on("error", (error) => { launchError = error; });
  let socket;
  try {
    let page;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (launchError) throw launchError;
      if (app.exitCode !== null) throw new Error(`Lodex exited with ${app.exitCode}`);
      try {
        const response = await fetch("http://127.0.0.1:9222/json/list", { signal: AbortSignal.timeout(1000) });
        page = (await response.json()).find((target) => target.type === "page" && target.url.startsWith("file:"));
      } catch {}
      if (page) break;
      await delay(250);
    }
    if (!page) throw new Error("The installed app did not open its window.");
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let nextId = 0;
    const send = (method, params) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const listener = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        socket.removeEventListener("message", listener);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      };
      socket.addEventListener("message", listener);
      socket.send(JSON.stringify({ id, method, params }));
    });
    const result = await send("Runtime.evaluate", {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        for (let i = 0; i < 100 && !document.querySelector('.composer'); i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        await window.lodex.codex.request('account/read', { refreshToken: false });
        return { title: document.title, hasComposer: !!document.querySelector('.composer'),
          hasSidebar: !!document.querySelector('.sidebar'), runtimeReady: true };
      })()`,
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    const snapshot = result.result.value;
    if (!snapshot.hasComposer || !snapshot.hasSidebar || !snapshot.runtimeReady) {
      throw new Error(`Incomplete app window: ${JSON.stringify(snapshot)}`);
    }
    const screenshot = await send("Page.captureScreenshot", { format: "png" });
    await fs.writeFile("release/ubuntu-smoke.png", Buffer.from(screenshot.data, "base64"));
    console.log(`LODEX_SMOKE_OK ${JSON.stringify(snapshot)}`);
  } finally {
    socket?.close();
    app.kill();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
