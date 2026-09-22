// Release check: real packaged Whisper worker, real audio, no ChatGPT/API calls.
const { _electron: electron } = require('@playwright/test');
const { mkdtemp, mkdir, rm } = require('node:fs/promises');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lodex-voice-'));
  const home = path.join(root, 'codex'), data = path.join(root, 'app');
  await Promise.all([mkdir(home), mkdir(data)]);
  console.log('LODEX_VOICE starting isolated app');
  const instance = await electron.launch({
    ...(process.env.LODEX_TEST_EXECUTABLE ? { executablePath: process.env.LODEX_TEST_EXECUTABLE } : {}),
    args: [...(process.env.LODEX_TEST_EXECUTABLE ? [] : [path.resolve('.')]), '--use-fake-device-for-media-stream'],
    env: { ...process.env, CODEX_HOME: home, LODEX_USER_DATA_DIR: data },
  });
  try {
    const page = await instance.firstWindow();
    console.log('LODEX_VOICE window-open');
    page.on('console', message => { if (message.type() === 'error') console.error('Renderer:', message.text()); });
    await page.getByTitle('Voice to text', { exact: true }).waitFor();
    await page.evaluate(() => {
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(...args) { super(...args); window.__dictationWorker = this; this.addEventListener('message', event => { window.__voiceResult = event.data; }); }
      };
      const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (...args) => { const stream = await getUserMedia(...args); window.__microphoneTracks = stream.getTracks(); return stream; };
    });
    await page.getByTitle('Voice to text', { exact: true }).click();
    await page.getByRole('button', { name: 'Set up voice typing' }).click();
    console.log('LODEX_VOICE preparing-model');
    await page.waitForFunction(() => ['ready', 'error'].includes(window.__voiceResult?.type), undefined, { timeout: 600_000 });
    assert.equal(await page.evaluate(() => window.__voiceResult.type), 'ready', await page.getByRole('status').textContent());
    console.log('LODEX_VOICE model-loaded');
    const response = await fetch('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav', { signal: AbortSignal.timeout(30_000) });
    assert.equal(response.ok, true);
    const audio = Buffer.from(await response.arrayBuffer()).toString('base64');
    await page.evaluate(async base64 => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const context = new AudioContext(); const decoded = await context.decodeAudioData(bytes.buffer); await context.close();
      const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
      const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
      const samples = (await offline.startRendering()).getChannelData(0);
      window.__voiceResult = null;
      window.__dictationWorker.postMessage({ type: 'transcribe', audio: samples }, [samples.buffer]);
    }, audio);
    await page.waitForFunction(() => ['text', 'error'].includes(window.__voiceResult?.type), undefined, { timeout: 180_000 });
    const result = await page.evaluate(() => window.__voiceResult);
    assert.equal(result.type, 'text'); assert.match(result.text.toLowerCase(), /country/);
    assert.match(await page.getByRole('textbox', { name: 'Message Lodex' }).inputValue(), /country/i);
    console.log('LODEX_VOICE real-audio-transcribed');
    await page.getByTitle('Voice to text', { exact: true }).click();
    await page.getByTitle('Stop dictation', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__microphoneTracks.every(track => track.readyState === 'live')), true);
    await page.getByRole('button', { name: 'Cancel dictation' }).click();
    assert.equal(await page.evaluate(() => window.__microphoneTracks.every(track => track.readyState === 'ended')), true);
    await instance.context().setOffline(true);
    await page.evaluate(() => { window.__voiceResult = null; });
    await page.getByTitle('Voice to text', { exact: true }).click();
    await page.getByRole('button', { name: 'Set up voice typing' }).click();
    await page.waitForFunction(() => ['ready', 'error'].includes(window.__voiceResult?.type), undefined, { timeout: 30_000 });
    assert.equal(await page.evaluate(() => window.__voiceResult.type), 'ready', 'The downloaded voice model must load offline.');
    console.log('LODEX_VOICE_OK local transcription, microphone cleanup, and offline model cache verified');
  } catch (error) {
    console.error('LODEX_VOICE_FAILED', error);
    throw error;
  } finally {
    await instance.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert(path.basename(root).startsWith('lodex-voice-'));
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
