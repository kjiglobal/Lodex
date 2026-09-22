import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Square, X } from "lucide-react";

export function Dictation({ disabled, onText, onBusy }: { disabled: boolean; onText(text: string): void; onBusy(value: boolean): void }) {
  const [state, setState] = useState<"idle" | "setup" | "loading" | "ready" | "starting" | "recording" | "transcribing">("idle");
  const [message, setMessage] = useState("");
  const worker = useRef<Worker | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0);
  const audioContext = useRef<AudioContext | null>(null);
  const onTextRef = useRef(onText); onTextRef.current = onText;
  const busy = ["loading", "starting", "recording", "transcribing"].includes(state);
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  const cleanup = () => {
    clearTimeout(timer.current);
    if (recorder.current) { recorder.current.onstop = null; recorder.current.ondataavailable = null; if (recorder.current.state !== "inactive") recorder.current.stop(); }
    recorder.current = null;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    void audioContext.current?.close().catch(() => undefined); audioContext.current = null;
  };
  useEffect(() => () => { generation.current++; cleanup(); worker.current?.terminate(); }, []);

  const cancel = () => {
    generation.current++; cleanup(); worker.current?.terminate(); worker.current = null;
    setState("idle"); setMessage("");
  };
  const prepare = () => {
    setState("loading"); setMessage("Downloading voice model… This only happens once.");
    try {
      worker.current = new Worker(new URL("../dictation.worker.ts", import.meta.url), { type: "module" });
      worker.current.onmessage = ({ data }) => {
        if (data.type === "progress") setMessage(`Setting up voice typing… ${data.progress}%`);
        if (data.type === "ready") { setState("ready"); setMessage("Ready. Click the microphone to dictate."); }
        if (data.type === "text") { setState("ready"); setMessage(data.text ? "" : "No speech detected. Try again."); if (data.text) onTextRef.current(data.text); }
        if (data.type === "error") { cancel(); setMessage(data.message); }
      };
      worker.current.onerror = () => { cancel(); setMessage("Voice typing could not start. Please try again."); };
      worker.current.postMessage({ type: "prepare" });
    } catch { cancel(); setMessage("Voice typing could not start. Please try again."); }
  };
  const record = async () => {
    const current = ++generation.current;
    setState("starting"); setMessage("Opening microphone…");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (current !== generation.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const recording = new MediaRecorder(media);
      recorder.current = recording;
      const chunks: Blob[] = [];
      recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recording.onerror = () => { cleanup(); setState("ready"); setMessage("Recording failed. Check your Ubuntu microphone settings."); };
      recording.onstop = async () => {
        clearTimeout(timer.current);
        media.getTracks().forEach(track => track.stop()); stream.current = null; recorder.current = null;
        if (current !== generation.current) return;
        setState("transcribing"); setMessage("Turning speech into text…");
        try {
          const context = new AudioContext(); audioContext.current = context;
          const audio = await context.decodeAudioData(await new Blob(chunks, { type: recording.mimeType }).arrayBuffer());
          await context.close(); audioContext.current = null;
          const offline = new OfflineAudioContext(1, Math.min(Math.ceil(audio.duration * 16000), 16000 * 60), 16000);
          const source = offline.createBufferSource(); source.buffer = audio; source.connect(offline.destination); source.start();
          const mono = (await offline.startRendering()).getChannelData(0);
          if (current !== generation.current) return;
          // Silence should never become a hallucinated Whisper transcript.
          const rms = Math.sqrt(mono.reduce((sum, sample) => sum + sample * sample, 0) / mono.length);
          if (rms < 0.003) { setState("ready"); setMessage("No speech detected. Check your microphone and try again."); return; }
          worker.current?.postMessage({ type: "transcribe", audio: mono }, [mono.buffer]);
        } catch { if (current === generation.current) { void audioContext.current?.close().catch(() => undefined); audioContext.current = null; setState("ready"); setMessage("Could not read the recording. Try again."); } }
      };
      recording.start(); setState("recording"); setMessage("Listening… Click Stop when you’re done (up to 1 minute).");
      timer.current = setTimeout(() => { if (recording.state === "recording") recording.stop(); }, 60_000);
    } catch { if (current === generation.current) { cleanup(); setState("ready"); setMessage("Microphone unavailable. Allow microphone access and check Ubuntu Sound settings."); } }
  };
  return <div className="dictation-control">
    <button className={`icon-button dictation-button ${state === "recording" ? "recording" : ""}`} disabled={disabled || ["loading", "starting", "transcribing"].includes(state)} title={state === "recording" ? "Stop dictation" : "Voice to text"} onClick={() => {
      if (state === "recording") recorder.current?.stop();
      else if (state === "ready") void record();
      else setState(state === "setup" ? "idle" : "setup");
    }}>{state === "recording" ? <Square size={17} fill="currentColor" /> : busy ? <LoaderCircle size={19} className="spin" /> : <Mic size={20} />}</button>
    {(state === "setup" || message) && <div className="dictation-popover" role="status">
      {state === "setup" ? <><strong>Voice to text</strong><p>Dictate on your device. Download the speech model once (about 80 MB), then speak and review the text before sending.</p><button className="primary-button" onClick={prepare}>Set up voice typing</button><button className="icon-button" title="Close voice setup" onClick={() => setState("idle")}><X size={15} /></button></> : <><p>{message}</p>{busy ? <button className="secondary-button" onClick={cancel}>Cancel dictation</button> : <button className="icon-button" title="Dismiss voice status" onClick={() => setMessage("")}><X size={15} /></button>}</>}
    </div>}
  </div>;
}
