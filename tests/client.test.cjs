const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

function fixture() {
  const children = [];
  const events = [];
  const fakeSpawn = () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.messages = [];
    child.stdin.on("data", data => child.messages.push(JSON.parse(data.toString())));
    child.kill = () => {};
    children.push(child);
    return child;
  };
  const exports = {};
  vm.runInNewContext(readFileSync("dist-electron/codex-client.js", "utf8"), {
    exports, process, setTimeout, clearTimeout,
    require: name => name === "electron" ? { app: { getPath: () => process.cwd(), getAppPath: () => process.cwd(), getVersion: () => "0.3.0", isPackaged: false } } : name === "node:child_process" ? { spawn: fakeSpawn } : require(name),
  });
  return { client: new exports.CodexClient(event => events.push(event), () => {}), children, events };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const reply = (child, id, result = {}) => child.stdout.write(JSON.stringify({ id, result }) + "\n");

test("concurrent startup requests wait for initialize before reaching the runtime", async () => {
  const { client, children } = fixture();
  try {
    const a = client.request("account/read"); const b = client.request("model/list");
    assert.equal(children.length, 1);
    const child = children[0];
    assert.deepEqual(child.messages.map(message => message.method), ["initialize"]);
    reply(child, child.messages[0].id);
    await tick();
    assert.deepEqual(child.messages.map(message => message.method), ["initialize", "initialized", "account/read", "model/list"]);
    reply(child, child.messages[2].id); reply(child, child.messages[3].id);
    await Promise.all([a, b]);
  } finally { client.stop(); }
});

test("pending approvals survive renderer reload and disappear when resolved", async () => {
  const { client, children } = fixture();
  try {
    const start = client.start(); const child = children[0]; reply(child, 1); await start;
    child.stdout.write(JSON.stringify({ id: 200, method: "item/fileChange/requestApproval", params: { threadId: "t1" } }) + "\n");
    await tick();
    assert.equal(client.pendingServerRequests().length, 1);
    child.stdout.write(JSON.stringify({ method: "serverRequest/resolved", params: { threadId: "t1", requestId: 200 } }) + "\n");
    await tick();
    assert.equal(client.pendingServerRequests().length, 0);
  } finally { client.stop(); }
});

test("a late exit from an old process cannot tear down its replacement", async () => {
  const { client, children } = fixture();
  try {
    const first = client.start(); const old = children[0]; reply(old, 1); await first;
    old.emit("error", new Error("Connection lost"));
    const next = client.start(); const current = children[1];
    old.emit("exit", 1);
    reply(current, current.messages[0].id); await next;
    const request = client.request("account/read"); await tick();
    reply(current, current.messages.at(-1).id, { ok: true });
    assert.equal((await request).ok, true);
  } finally { client.stop(); }
});
