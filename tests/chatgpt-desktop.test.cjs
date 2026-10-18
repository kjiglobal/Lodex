const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron: electron, expect } = require('@playwright/test');

test('ChatGPT runs in an isolated desktop view with navigation, recovery and independent session clearing', { timeout: 90_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lodex-chatgpt-'));
  await mkdir(path.join(root, 'codex'));
  const instance = await electron.launch({
    ...(process.env.LODEX_TEST_EXECUTABLE ? { executablePath: process.env.LODEX_TEST_EXECUTABLE } : {}),
    args: process.env.LODEX_TEST_EXECUTABLE ? [] : [path.resolve('.')],
    env: { ...process.env, CODEX_HOME: path.join(root, 'codex'), LODEX_USER_DATA_DIR: path.join(root, 'app') },
  });
  try {
    const local = await instance.firstWindow(); await local.locator('.composer').waitFor();
    await local.getByRole('textbox', { name: 'Message Lodex' }).fill('Keep my native draft');
    await instance.evaluate(({ session, shell, dialog }) => {
      globalThis.__external = [];
      globalThis.__clearAnswer = 0;
      shell.openExternal = async url => { globalThis.__external.push(url); };
      dialog.showMessageBox = async () => ({ response: globalThis.__clearAnswer, checkboxChecked: false });
      session.fromPartition('persist:lodex-chatgpt').protocol.handle('https', request => new Response(`<!doctype html><html><body><h1>ChatGPT website fixture</h1><p>${new URL(request.url).pathname}</p><a id="chat" href="/c/example">Open saved chat</a><a id="external" href="https://example.com">Source</a><a id="unsafe" href="file:///etc/passwd">Blocked file</a><input aria-label="Website draft"></body></html>`, { headers: { 'content-type': 'text/html' } }));
    });
    const opened = instance.waitForEvent('window', { predicate: page => page.url().includes('view=chatgpt') });
    await local.getByTitle('Open official ChatGPT').click();
    const toolbar = await opened;
    await toolbar.getByRole('button', { name: 'Local workspace' }).waitFor();
    const inspect = () => instance.evaluate(({ webContents }) => {
      const remote = webContents.getAllWebContents().find(contents => contents.getURL().startsWith('https://chatgpt.com'));
      if (!remote) return null;
      const preferences = remote.getLastWebPreferences();
      return { id: remote.id, url: remote.getURL(), sandbox: preferences.sandbox, nodeIntegration: preferences.nodeIntegration, contextIsolation: preferences.contextIsolation, preload: preferences.preload };
    });
    await expect.poll(inspect).toMatchObject({ url: 'https://chatgpt.com/', sandbox: true, nodeIntegration: false, contextIsolation: true });
    const remoteId = (await inspect()).id;
    assert(!(await inspect()).preload);
    const run = script => instance.evaluate(({ webContents }, { id, script }) => { const contents = webContents.fromId(id); contents.focus(); return contents.executeJavaScript(script, true); }, { id: remoteId, script });
    assert.deepEqual(await run('({ bridge: typeof window.lodex, toolbar: typeof window.chatgpt, node: typeof require })'), { bridge: 'undefined', toolbar: 'undefined', node: 'undefined' });
    await run('document.querySelector("#chat").click()');
    await expect.poll(async () => (await inspect()).url).toBe('https://chatgpt.com/c/example');
    await expect(toolbar.getByTitle('Back', { exact: true })).toBeEnabled();
    await toolbar.getByTitle('Back', { exact: true }).click();
    await expect.poll(async () => (await inspect()).url).toBe('https://chatgpt.com/');
    await run('document.querySelector("#external").click()');
    await expect.poll(() => instance.evaluate(() => globalThis.__external)).toEqual(['https://example.com/']);
    assert.equal((await inspect()).url, 'https://chatgpt.com/');
    await instance.evaluate(({ desktopCapturer, nativeImage }) => {
      globalThis.__clearAnswer = 1;
      desktopCapturer.getSources = async () => [{ id: 'screen:fixture', name: 'Test display', thumbnail: nativeImage.createEmpty(), display_id: 'fixture', appIcon: null }];
    });
    await run('void navigator.mediaDevices.getDisplayMedia({video:true}).then(stream => { stream.getTracks().forEach(track => track.stop()); window.__captureResult = "shared"; }).catch(error => { window.__captureResult = error.name; })');
    await expect.poll(async () => await toolbar.getByRole('dialog', { name: 'Choose what to share with ChatGPT' }).count() ? 'picker' : await run('window.__captureResult')).toBe('picker');
    await toolbar.getByRole('button', { name: 'Cancel sharing' }).click();
    await expect.poll(() => run('window.__captureResult')).toBeTruthy();
    await instance.evaluate(() => { globalThis.__clearAnswer = 0; });
    await instance.evaluate(({ webContents }, id) => webContents.fromId(id).forcefullyCrashRenderer(), remoteId);
    await expect(toolbar.getByRole('alert')).toContainText('stopped responding');
    await toolbar.getByRole('button', { name: 'Try again' }).click();
    await expect(toolbar.getByRole('alert')).toHaveCount(0);
    await expect.poll(() => run('document.querySelector("h1")?.textContent')).toBe('ChatGPT website fixture');
    await instance.evaluate(async ({ session }) => {
      await session.fromPartition('persist:lodex-chatgpt').cookies.set({ url: 'https://chatgpt.com', name: 'lodex-test', value: 'website-only' });
      await session.defaultSession.cookies.set({ url: 'https://example.test', name: 'local-test', value: 'keep' });
    });
    await toolbar.getByTitle('Clear ChatGPT session').click();
    assert.equal(await instance.evaluate(async ({ session }) => (await session.fromPartition('persist:lodex-chatgpt').cookies.get({ name: 'lodex-test' })).length), 1);
    await instance.evaluate(() => { globalThis.__clearAnswer = 1; });
    await toolbar.getByTitle('Clear ChatGPT session').click();
    await expect.poll(() => instance.evaluate(async ({ session }) => (await session.fromPartition('persist:lodex-chatgpt').cookies.get({ name: 'lodex-test' })).length)).toBe(0);
    assert.equal(await instance.evaluate(async ({ session }) => (await session.defaultSession.cookies.get({ name: 'local-test' })).length), 1);
    await toolbar.getByRole('button', { name: 'Local workspace' }).click();
    assert.equal(await local.getByRole('textbox', { name: 'Message Lodex' }).inputValue(), 'Keep my native draft');
    await toolbar.close();
    await expect.poll(() => instance.evaluate(({ webContents }, id) => !!webContents.fromId(id), remoteId)).toBe(false);
  } finally {
    await instance.close();
    assert.equal(path.dirname(root), os.tmpdir());
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
