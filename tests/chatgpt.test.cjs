const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const policy = require('../dist-electron/chatgpt-policy');

test('ChatGPT navigation uses exact HTTPS hosts and rejects privileged URLs and lookalikes', () => {
  for (const url of ['https://chatgpt.com/c/123', 'https://www.chatgpt.com/']) assert(policy.isChatGPTUrl(url));
  for (const url of ['https://auth.openai.com/login', 'https://accounts.google.com/signin']) {
    assert(policy.isEmbeddedUrl(url)); assert(!policy.isChatGPTUrl(url));
  }
  for (const url of ['http://chatgpt.com', 'https://chatgpt.com.evil.test', 'https://evilchatgpt.com', 'https://chatgpt.com@evil.test', 'https://user@chatgpt.com', 'https://chatgpt.com:8080', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'lodex-image://local', 'not a URL']) assert(!policy.isEmbeddedUrl(url), url);
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'ms-settings:test', 'https://user:password@example.com']) assert.equal(policy.externalUrl(url), null);
  assert.equal(policy.externalUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(policy.permissionLabel('media', ['audio', 'video']), 'microphone and camera');
  for (const permission of ['hid', 'serial', 'geolocation', 'fileSystem', 'unknown']) assert.equal(policy.permissionLabel(permission), null);
  assert.equal(policy.permissionLabel('media', []), null);
  assert.equal(policy.permissionLabel('media', ['unknown']), null);
});

function fixture() {
  const handlers = new Map(); const windows = []; const views = []; const external = []; const messages = []; const localActions = [];
  let answer = 1; let focused;
  class Contents extends EventEmitter {
    constructor() { super(); this.url = ''; this.mainFrame = {}; this.closed = false; this.navigationHistory = { canGoBack: () => false, canGoForward: () => false, clear: () => { this.historyCleared = true; } }; }
    getURL() { return this.url; }
    isDestroyed() { return this.closed; }
    async loadURL(url) { this.url = url; }
    send(channel, value) { messages.push({ channel, value }); }
    setWindowOpenHandler(handler) { this.openHandler = handler; }
    reload() { this.reloaded = true; }
    close() { this.closed = true; }
    focus() {}
  }
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = new Contents(); this.contentView = { addChildView() {} }; windows.push(this); focused = this; }
    static getFocusedWindow() { return focused; }
    getContentSize() { return [1440, 960]; }
    isDestroyed() { return this.closed || false; }
    isFocused() { return focused === this; }
    async loadFile() {}
    show() {}
    focus() { focused = this; }
    destroy() { this.closed = true; this.emit('closed'); }
    setMenu() {}
    setTitle() {}
  }
  class View {
    constructor(options) { this.options = options; this.webContents = new Contents(); views.push(this); }
    setBounds(bounds) { this.bounds = bounds; }
    setVisible(visible) { this.visible = visible; }
  }
  const ses = new EventEmitter();
  ses.setPermissionCheckHandler = fn => ses.check = fn;
  ses.setPermissionRequestHandler = fn => ses.request = fn;
  ses.setDevicePermissionHandler = fn => ses.device = fn;
  ses.setDisplayMediaRequestHandler = fn => ses.capture = fn;
  ses.clearStorageData = async () => { ses.cleared = true; };
  ses.clearCache = async () => {};
  const dialogs = [];
  const electron = {
    app: { getAppPath: () => '/lodex', isPackaged: false }, BrowserWindow: Window, WebContentsView: View,
    session: { fromPartition: name => { assert.equal(name, 'persist:lodex-chatgpt'); return ses; } },
    ipcMain: { handle: (key, handler) => handlers.set(key, handler) },
    shell: { openExternal: async url => external.push(url) },
    dialog: { showMessageBox: async (_window, options) => { dialogs.push(options); return typeof answer === 'function' ? answer() : { response: answer }; } },
    desktopCapturer: { getSources: async () => [{ id: 'screen:1', name: 'Display', thumbnail: { toDataURL: () => 'data:image/png;base64,AA==' } }] },
  };
  const exports = {};
  vm.runInNewContext(readFileSync('dist-electron/chatgpt-window.js', 'utf8'), {
    exports, process, __dirname: '/lodex/electron', URL,
    require: name => name === 'electron' ? electron : name === './chatgpt-policy' ? policy : require(name),
  });
  const service = new exports.ChatGPTWorkspace(action => localActions.push(action)); service.open();
  const contents = views[0].webContents;
  const event = { sender: windows[0].webContents, senderFrame: windows[0].webContents.mainFrame };
  const request = (permission, details = {}) => new Promise(resolve => ses.request(contents, permission, resolve, { isMainFrame: true, requestingUrl: policy.CHATGPT_HOME, ...details }));
  return { service, ses, contents, windows, views, handlers, event, external, dialogs, localActions, request, answer: value => answer = value, focus: value => focused = value };
}

test('remote content has no preload; toolbar IPC rejects remote frames and other windows', async () => {
  const f = fixture(); const view = f.views[0];
  assert.equal(view.options.webPreferences.preload, undefined);
  assert.equal(view.options.webPreferences.nodeIntegration, false);
  assert.equal(view.options.webPreferences.sandbox, true);
  assert.equal(view.options.webPreferences.contextIsolation, true);
  assert.equal(view.bounds.y, 64);
  for (const name of ['chatgpt:state', 'chatgpt:action', 'chatgpt:capture']) {
    await assert.rejects(async () => f.handlers.get(name)({ sender: f.contents, senderFrame: f.contents.mainFrame }, 'home'), /Unknown ChatGPT toolbar/);
    await assert.rejects(async () => f.handlers.get(name)({ ...f.event, senderFrame: {} }, 'home'), /Unknown ChatGPT toolbar/);
  }
  await assert.rejects(f.handlers.get('chatgpt:action')(f.event, 'https://evil.test'), /Unsupported/);
  f.service.open(); assert.equal(f.windows.length, 1);
  f.windows[0].destroy(); assert.equal(f.contents.closed, true);
});

test('external links and redirects leave the embedded view; privileged URLs never open', () => {
  const f = fixture();
  for (const eventName of ['will-navigate', 'will-redirect']) {
    let prevented = false;
    f.contents.emit(eventName, { preventDefault() { prevented = true; } }, 'https://example.com', false, true);
    assert(prevented);
  }
  assert.equal(f.external.length, 2);
  const denied = f.contents.openHandler({ url: 'file:///etc/passwd' });
  assert.equal(denied.action, 'deny'); assert.equal(f.external.length, 2);
  const popup = f.contents.openHandler({ url: 'https://auth.openai.com/login' });
  assert.equal(popup.action, 'allow'); assert.equal(popup.overrideBrowserWindowOptions.webPreferences.preload, '');
  assert.equal(popup.overrideBrowserWindowOptions.webPreferences.sandbox, true);
});

test('media permissions require a trusted focused top frame and explicit approval, with revocation on close', async () => {
  const f = fixture();
  assert.equal(await f.request('media', { mediaTypes: ['audio'] }), true);
  assert.equal(f.ses.check(f.contents, 'media', 'https://chatgpt.com', { isMainFrame: true, mediaType: 'audio' }), true);
  assert.equal(f.ses.check(f.contents, 'media', 'https://evil.test', { isMainFrame: true, mediaType: 'audio' }), false);
  assert.equal(f.ses.check(f.contents, 'media', 'https://chatgpt.com', { isMainFrame: false, mediaType: 'audio' }), false);
  assert.equal(await f.request('media', { mediaTypes: ['video'], requestingUrl: 'https://evil.test' }), false);
  assert.equal(await f.request('media', { mediaTypes: ['video'], isMainFrame: false }), false);
  f.answer(0); assert.equal(await f.request('media', { mediaTypes: ['video'] }), false);
  assert.equal(await f.request('media', { mediaTypes: [] }), false);
  f.answer(1); assert.equal(await f.request('media', { mediaTypes: [] }), true);
  f.answer(0); assert.equal(await f.request('media', { mediaTypes: [] }), false);
  assert.equal(await f.request('media'), false);
  assert.equal(await f.request('hid'), false);
  assert.equal(f.ses.device({}), false);
  f.focus(null); assert.equal(await f.request('notifications'), false);
  f.windows[0].destroy(); f.service.open();
  assert.equal(f.ses.check(f.views[1].webContents, 'media', 'https://chatgpt.com', { isMainFrame: true, mediaType: 'audio' }), false);
});

test('permission approval is discarded if the page navigates during its prompt', async () => {
  const f = fixture(); let finish;
  f.answer(() => new Promise(resolve => finish = resolve));
  const result = f.request('media', { mediaTypes: ['audio'] });
  f.contents.url = 'https://auth.openai.com'; finish({ response: 1 });
  assert.equal(await result, false);
});

test('screen sharing always requires a user gesture and a selected source; cancel releases the request', async () => {
  const f = fixture();
  const request = { frame: f.contents.mainFrame, securityOrigin: 'https://chatgpt.com', userGesture: true, videoRequested: true };
  let denied;
  f.ses.capture({ ...request, userGesture: false }, value => denied = value);
  assert.equal(Object.keys(denied).length, 0);
  const first = new Promise(resolve => f.ses.capture(request, resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.handlers.get('chatgpt:state')(f.event).captureSources.length, 1);
  assert.equal(f.views[0].visible, false);
  f.handlers.get('chatgpt:capture')(f.event, 'screen:1');
  assert.equal((await first).video.id, 'screen:1'); assert.equal(f.views[0].visible, true);
  const second = new Promise(resolve => f.ses.capture(request, resolve));
  f.handlers.get('chatgpt:capture')(f.event, null);
  assert.equal(Object.keys(await second).length, 0);
});

test('session clearing is cancellable, clears only the web session, and returns to ChatGPT', async () => {
  const f = fixture(); f.answer(0);
  await f.service.action('clear-session'); assert.equal(f.ses.cleared, undefined);
  f.answer(1); await f.service.action('clear-session'); assert.equal(f.ses.cleared, true);
  assert.equal(f.contents.historyCleared, true);
  assert.equal(f.contents.getURL(), 'https://chatgpt.com/');
  await f.service.action('workspace'); assert.equal(f.localActions.length, 1);
});

test('failed loads and crashed pages surface recovery, and downloads keep the Save dialog', () => {
  const f = fixture();
  f.contents.emit('did-fail-load', {}, -105, 'DNS failure', 'https://chatgpt.com', true);
  assert.match(f.handlers.get('chatgpt:state')(f.event).error, /could not load/);
  assert.equal(f.views[0].visible, false);
  f.contents.emit('render-process-gone');
  assert.match(f.handlers.get('chatgpt:state')(f.event).error, /stopped responding/);
  const download = new EventEmitter(); let saveOptions;
  download.getFilename = () => '../../report.csv'; download.setSaveDialogOptions = value => saveOptions = value;
  download.getSavePath = () => '/Downloads/report.csv';
  f.ses.emit('will-download', { preventDefault() { throw new Error('Unexpected denial'); } }, download, f.contents);
  assert.equal(saveOptions.defaultPath, 'report.csv');
  download.emit('done', {}, 'completed');
  assert.match(f.handlers.get('chatgpt:state')(f.event).notice, /Saved report.csv/);
});
