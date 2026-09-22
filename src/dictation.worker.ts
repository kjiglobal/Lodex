import { env, pipeline, type AutomaticSpeechRecognitionPipeline, type ProgressInfo } from "@huggingface/transformers";
import wasmUrl from "../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url";
import wasmModuleUrl from "../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url";

// CPU inference stays in this worker, including on Linux software rendering.
env.allowLocalModels = false;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;
env.backends.onnx.wasm!.wasmPaths = {
  wasm: new URL(wasmUrl, import.meta.url).href,
  mjs: new URL(wasmModuleUrl, import.meta.url).href,
};
let transcriber: AutomaticSpeechRecognitionPipeline | undefined;
// Avoid expanding the library's union of every supported pipeline task.
const createTranscriber = pipeline as unknown as (task: "automatic-speech-recognition", model: string, options: { device: "wasm"; dtype: "q8"; progress_callback(progress: ProgressInfo): void }) => Promise<AutomaticSpeechRecognitionPipeline>;
let busy = false;
self.onmessage = async (event: MessageEvent<{ type: "prepare" | "transcribe"; audio?: Float32Array }>) => {
  if (busy) return;
  busy = true;
  try {
    transcriber ??= await createTranscriber("automatic-speech-recognition", "Xenova/whisper-tiny", {
      device: "wasm", dtype: "q8",
      progress_callback: progress => {
        if (progress.status === "progress") self.postMessage({ type: "progress", file: progress.file, progress: Math.round(progress.progress) });
      },
    });
    if (event.data.type === "prepare") self.postMessage({ type: "ready" });
    else {
      const audio = event.data.audio;
      if (!(audio instanceof Float32Array) || !audio.length || audio.length > 16000 * 61) throw new Error("Record up to one minute at a time.");
      const result = await transcriber(audio, { task: "transcribe", chunk_length_s: 30, stride_length_s: 5, return_timestamps: false });
      self.postMessage({ type: "text", text: (Array.isArray(result) ? result.map(part => part.text).join(" ") : result.text).trim() });
    }
  } catch {
    self.postMessage({ type: "error", message: "Voice typing could not finish. Check your connection for the first download, then try again." });
  } finally { busy = false; }
};
