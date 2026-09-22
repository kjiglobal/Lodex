const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, stat, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('@playwright/test');

test('desktop menus, clipboard persistence, temporary images and independent windows', { timeout: 90_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lodex-desktop-'));
  const home = path.join(root, 'codex'); const data = path.join(root, 'app');
  const projectA = path.join(root, 'project-a'); const projectB = path.join(root, 'project-b');
  await Promise.all([home, data, projectA, projectB].map(directory => mkdir(directory)));
  const instance = await electron.launch({
    ...(process.env.LODEX_TEST_EXECUTABLE ? { executablePath: process.env.LODEX_TEST_EXECUTABLE } : {}),
    args: [...(process.env.LODEX_TEST_EXECUTABLE ? [] : [path.resolve('.')]), '--use-fake-device-for-media-stream'],
    env: { ...process.env, CODEX_HOME: home, LODEX_USER_DATA_DIR: data },
  });
  try {
    await instance.evaluate(({ clipboard }) => { globalThis.__savedClipboard = clipboard.availableFormats().map(format => [format, clipboard.readBuffer(format)]); });
    const first = await instance.firstWindow();
    await first.locator('.composer').waitFor();
    const menu = await instance.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map(item => ({ label: item.label, children: item.submenu?.items.map(child => ({ label: child.label, accelerator: child.accelerator })) })));
    assert.deepEqual(menu.find(item => item.label === 'File').children.filter(item => item.label).map(item => item.label), ['New Window', 'New Chat', 'New Temporary Chat', 'Open Folder…', 'Close', 'Log Out', 'Quit Lodex']);
    assert(menu.find(item => item.label === 'Help').children.some(item => item.label === 'Lodex 0.4.0'));
    const input = first.getByRole('textbox', { name: 'Message Lodex' });
    await input.fill('First window draft');
    const png = (await require('sharp')({ create: { width: 12, height: 12, channels: 4, background: '#55cc88' } }).png().toBuffer()).toString('base64');
    await instance.evaluate(({ clipboard, nativeImage }, base64) => clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(base64, 'base64'))), png);
    await input.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v');
    await first.locator('.attachment img').waitFor();
    const originalPath = await first.evaluate(() => JSON.parse(localStorage.getItem('lodex-draft-new')).attachments[0].path);
    assert((await stat(originalPath)).size > 0);
    await first.reload(); await first.locator('.attachment img').waitFor();
    assert.equal(await input.inputValue(), 'First window draft');
    assert.equal(await first.locator('.attachment img').evaluate(image => image.complete && image.naturalWidth > 0), true);
    const inputs = await first.evaluate(file => window.lodex.workspace.attachmentInputs([{ path: file, name: 'Pasted image.png', kind: 'image' }]), originalPath);
    assert.equal(inputs[0].type, 'localImage');
    const ephemeral = await first.evaluate(() => window.lodex.codex.request('thread/start', { ephemeral: true, surface: 'chat', accessMode: 'read-only' }));
    const live = await first.evaluate(id => window.lodex.codex.request('thread/read', { threadId: id }), ephemeral.thread.id);
    assert.equal(live.thread.id, ephemeral.thread.id);
    const history = await first.evaluate(() => window.lodex.codex.request('thread/list', { limit: 100 }));
    assert(!history.data.some(thread => thread.id === ephemeral.thread.id));
    await first.evaluate(id => window.lodex.codex.request('thread/unsubscribe', { threadId: id }), ephemeral.thread.id);
    await assert.rejects(first.evaluate(() => window.lodex.workspace.attachmentInputs([{ path: '/etc/passwd', name: 'passwd', kind: 'file' }])));
    await instance.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, projectA);
    await first.evaluate(() => window.lodex.workspace.choose());
    const secondPromise = instance.waitForEvent('window');
    await instance.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(item => item.label === 'File').submenu.items.find(item => item.label === 'New Window').click());
    const second = await secondPromise; await second.locator('.composer').waitFor();
    assert.equal(await second.getByRole('textbox', { name: 'Message Lodex' }).inputValue(), '');
    await instance.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, projectB);
    await second.evaluate(() => window.lodex.workspace.choose());
    assert.equal(await first.evaluate(() => window.lodex.workspace.current()), projectA);
    assert.equal(await second.evaluate(() => window.lodex.workspace.current()), projectB);
    await second.bringToFront();
    await second.waitForFunction(() => document.hasFocus());
    await instance.evaluate(({ Menu }) => { Menu.getApplicationMenu().items.find(item => item.label === 'File').submenu.items.find(item => item.label === 'New Temporary Chat').click(); });
    await second.locator('.temporary-banner').waitFor();
    await second.getByRole('textbox', { name: 'Message Lodex' }).fill('Temporary secret');
    assert(!(await second.evaluate(() => JSON.stringify(localStorage))).includes('Temporary secret'));
    const pasted = await second.evaluate(async base64 => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      return window.lodex.workspace.pasteImage(bytes, true);
    }, png);
    const temporaryInputs = await second.evaluate(image => window.lodex.workspace.attachmentInputs([image]), pasted);
    assert.equal(temporaryInputs[0].type, 'image');
    assert(temporaryInputs[0].url.startsWith('data:image/png;base64,'));
    await assert.rejects(stat(pasted.path));
    assert(!(await readFile(path.join(data, 'attachments.json'), 'utf8')).includes(pasted.path.replaceAll('\\', '\\\\')));
    await second.evaluate(() => window.lodex.workspace.clearTemporary());
    await assert.rejects(second.evaluate(image => window.lodex.workspace.attachmentInputs([image]), pasted));
    await second.close();
    assert.equal(await input.inputValue(), 'First window draft');
  } finally {
    await instance.evaluate(({ clipboard }) => { for (const [format, buffer] of globalThis.__savedClipboard || []) clipboard.writeBuffer(format, buffer); delete globalThis.__savedClipboard; }).catch(() => undefined);
    await instance.close();
    // Only remove the exact temporary directory created by this test.
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert(path.basename(root).startsWith('lodex-desktop-'));
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
