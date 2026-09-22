const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdtemp, readdir, readFile, writeFile, rm } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { UpdateService, isNewerVersion, parseRelease } = require('../dist-electron/updates');
const base = 'https://github.com/wwdreamb/Lodex';
const name = 'Lodex-0.5.0-amd64.deb';
const bytes = Buffer.from('test package contents');
const digest = createHash('sha256').update(bytes).digest('hex');
function release() {
  return { draft: false, prerelease: false, tag_name: 'v0.5.0', html_url: base + '/releases/tag/v0.5.0', assets: [
    { name, browser_download_url: `${base}/releases/download/v0.5.0/${name}`, size: bytes.length, state: 'uploaded', digest: 'sha256:' + digest },
    { name: 'SHA256SUMS', browser_download_url: `${base}/releases/download/v0.5.0/SHA256SUMS`, size: 100, state: 'uploaded' },
  ] };
}
async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lodex-updates-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith('lodex-updates-'));
    await rm(directory, { recursive: true, force: true });
  });
  const events = [], installs = [], requests = [];
  const fetch = async (url, options) => {
    requests.push(url);
    if (overrides.fetch) { const result = await overrides.fetch(url, options); if (result) return result; }
    if (url.includes('/releases/latest')) return new Response(JSON.stringify(overrides.release || release()));
    if (url.endsWith('SHA256SUMS')) return new Response(overrides.sums || `${digest}  ${name}\n`);
    return new Response(overrides.bytes || bytes);
  };
  const service = new UpdateService({ version: '0.4.1', arch: 'x64', directory, canInstall: true, ...overrides, fetch,
    install: async (...args) => { installs.push(args); return overrides.install ? overrides.install(...args) : 'installed'; },
    changed: state => events.push(state),
  });
  return { service, directory, installs, events, requests };
}
test('versions compare numerically and stable release metadata binds the architecture and repository', () => {
  assert(isNewerVersion('v0.10.0', '0.9.9'));
  assert(!isNewerVersion('0.4.0', '0.4.1'));
  assert(!isNewerVersion('0.4.1', '0.4.1'));
  assert.throws(() => isNewerVersion('0.4.2-beta.1', '0.4.1'));
  assert.throws(() => parseRelease({ ...release(), prerelease: true }, 'x64'));
  assert.throws(() => parseRelease({ ...release(), draft: true }, 'x64'));
  assert.equal(parseRelease(release(), 'arm64').asset, undefined);
  const malicious = release(); malicious.assets[0].browser_download_url = 'https://example.com/payload.deb';
  assert.throws(() => parseRelease(malicious, 'x64'));
});
test('new release downloads byte-for-byte, emits progress, installs once and requires a separate restart', async t => {
  const { service, directory, installs, events } = await fixture(t);
  assert.equal((await service.install()).status, 'idle');
  assert.equal((await service.check()).status, 'available');
  await Promise.all([service.download(), service.download()]);
  assert.equal(service.snapshot().status, 'ready');
  const dirs = await readdir(directory); assert.equal(dirs.length, 1);
  assert.deepEqual(await readFile(path.join(directory, dirs[0], name)), bytes);
  assert(events.some(state => state.progress === 100));
  await Promise.all([service.install(), service.install()]);
  assert.equal(installs.length, 1); assert.equal(installs[0][1], '0.5.0');
  assert.equal(service.snapshot().status, 'installed');
  assert.deepEqual(await readdir(directory), []);
  assert.equal((await service.check()).status, 'installed');
});
test('current/newer installations and unsupported installations never download an older package', async t => {
  const current = await fixture(t, { version: '0.5.0' });
  assert.equal((await current.service.check()).status, 'current');
  await current.service.download(); assert.equal(current.requests.length, 1);
  const newer = await fixture(t, { version: '0.6.0' });
  assert.equal((await newer.service.check()).status, 'current');
  const unsupported = await fixture(t, { canInstall: false });
  assert.equal((await unsupported.service.check()).canInstall, false);
  await unsupported.service.download(); assert.equal(unsupported.requests.length, 1);
});
test('missing checksums, incorrect content and incomplete downloads cannot install', async t => {
  for (const overrides of [{ sums: `${'0'.repeat(64)}  ${name}` }, { bytes: Buffer.from('modified bytes') }, { sums: `${digest}  another.deb` }]) {
    const { service, installs, directory } = await fixture(t, overrides);
    await service.check(); await service.download(); await service.install();
    assert.equal(service.snapshot().status, 'error'); assert.equal(installs.length, 0);
    assert.deepEqual(await readdir(directory), []);
  }
});
test('changes after verification are rejected and canceled authorization can be retried', async t => {
  const changed = await fixture(t); await changed.service.check(); await changed.service.download();
  const [folder] = await readdir(changed.directory);
  await writeFile(path.join(changed.directory, folder, name), Buffer.alloc(bytes.length, 65));
  assert.equal((await changed.service.install()).status, 'error'); assert.equal(changed.installs.length, 0);
  await changed.service.check(); assert.deepEqual(await readdir(changed.directory), []);
  let count = 0;
  const canceled = await fixture(t, { install: () => ++count === 1 ? 'canceled' : 'installed' });
  await canceled.service.check(); await canceled.service.download();
  assert.equal((await canceled.service.install()).status, 'ready');
  assert.equal((await canceled.service.install()).status, 'installed');
});
test('download cancellation removes the partial package and does not invoke installation', async t => {
  let started; const start = new Promise(resolve => { started = resolve; });
  const { service, directory, installs } = await fixture(t, { fetch: async (url, { signal }) => {
    if (!url.endsWith('.deb')) return;
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(bytes.subarray(0, 3));
      signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
      started();
    } }));
  } });
  await service.check(); const downloading = service.download(); await start; service.cancel(); await downloading;
  assert.equal(service.snapshot().status, 'available');
  assert.deepEqual(await readdir(directory), []); assert.equal(installs.length, 0);
});
test('untrusted redirects and network/rate-limit failures are recoverable', async t => {
  let bad = true;
  const { service, requests } = await fixture(t, { fetch: async () => bad ? new Response(null, { status: 302, headers: { location: 'https://example.com/installer' } }) : undefined });
  assert.equal((await service.check()).status, 'error'); assert.equal(requests.length, 1);
  bad = false; assert.equal((await service.check()).status, 'available');
  const limited = await fixture(t, { fetch: async () => new Response(null, { status: 403 }) });
  assert.match((await limited.service.check()).message, /limiting update checks/);
  const offline = await fixture(t, { fetch: async () => { throw new TypeError('fetch failed'); } });
  assert.match((await offline.service.check()).message, /internet connection/);
});

function installerFixture({ metadata = 'lodex\n0.5.0\namd64', code = 0, installed = 'install ok installed\n0.5.0' } = {}) {
  const calls = [], exports = {};
  require('node:vm').runInNewContext(require('node:fs').readFileSync('dist-electron/update-installer.js', 'utf8'), {
    exports, process: { platform: 'linux', arch: 'x64', resourcesPath: '/opt/Lodex/resources' },
    require: name => name === 'node:util' ? { promisify: () => async (file, args) => { calls.push({ file, args }); return { stdout: file.endsWith('dpkg-deb') ? metadata : installed }; } }
      : name === 'node:child_process' ? { execFile() {}, spawn: (file, args, options) => {
        calls.push({ file, args, options }); const child = new (require('node:events').EventEmitter)();
        setImmediate(() => child.emit('exit', code)); return child;
      } } : require(name),
  });
  return { install: exports.installUbuntuUpdate, calls };
}
test('Ubuntu installer uses a fixed authenticated command and verifies package identity and installed version', async () => {
  const fixture = installerFixture();
  const file = '/home/tester/a folder/$(touch nope).deb';
  assert.equal(await fixture.install(file, '0.5.0', digest), 'installed');
  const privileged = fixture.calls.find(call => call.file.endsWith('pkexec'));
  assert.equal(privileged.file, '/usr/bin/pkexec');
  assert.deepEqual(Array.from(privileged.args), ['--disable-internal-agent', '/usr/bin/python3', path.join('/opt/Lodex/resources', 'update-helper.py'), file, digest, '0.5.0', 'amd64']);
  assert.equal(privileged.options.shell, undefined);
  const wrongPackage = installerFixture({ metadata: 'something-else\n0.5.0\namd64' });
  await assert.rejects(wrongPackage.install(file, '0.5.0'));
  assert.equal(wrongPackage.calls.length, 1);
  assert.equal(await installerFixture({ code: 126 }).install(file, '0.5.0'), 'canceled');
  await assert.rejects(installerFixture({ code: 127 }).install(file, '0.5.0'), /authorize/);
  await assert.rejects(installerFixture({ code: 100 }).install(file, '0.5.0'), /could not install/);
  await assert.rejects(installerFixture({ installed: 'install ok installed\n0.4.1' }).install(file, '0.5.0'), /did not confirm/);
});
