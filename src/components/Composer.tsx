import { ArrowUp, Blocks, FileText, Paperclip, Plus, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { storage } from "../storage";
import { Dictation } from "./Dictation";
import { PromptControls, type PromptOptions } from "./PromptControls";
import type { Attachment, SurfaceMode } from "../types";

type Props = {
  options: PromptOptions;
  temporary: boolean;
  disabled: boolean;
  running: boolean;
  workspace: string | null;
  draftKey: string;
  surfaceMode: SurfaceMode;
  onSend(text: string, attachments: Attachment[]): Promise<void>;
  onStop(): void;
  onOpenTools(): void;
};

function readDraft(key: string): { text: string; attachments: Attachment[] } {
  try {
    const draft = JSON.parse(storage.get(key) || "{}");
    return { text: typeof draft.text === "string" ? draft.text : "", attachments: Array.isArray(draft.attachments) ? draft.attachments.filter((file: Attachment) => file && typeof file.path === "string" && typeof file.name === "string" && ["file", "image"].includes(file.kind)).slice(0, 8) : [] };
  } catch { return { text: "", attachments: [] }; }
}

export function Composer({ disabled, running, workspace, draftKey, temporary, options, onSend, onStop, onOpenTools }: Props) {
  const key = `lodex-draft-${draftKey}`;
  const [value, setValue] = useState(() => temporary ? "" : readDraft(key).text);
  const [attachments, setAttachments] = useState<Attachment[]>(() => temporary ? [] : readDraft(key).attachments);
  const [pasting, setPasting] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const pasteLock = useRef(false);
  const latest = useRef({ value, attachments }); latest.current = { value, attachments };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState("");
  const submitLock = useRef(false);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const save = (text: string, files: Attachment[]) => { if (!temporary) storage.set(key, JSON.stringify({ text, attachments: files })); };
  useEffect(() => {
    const element = textArea.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  const submit = async () => {
    const text = value.trim();
    if ((!text && !attachments.length) || disabled || running || submitLock.current || pasteLock.current || voiceBusy) return;
    submitLock.current = true;
    setSending(true);
    setError("");
    try {
      await onSend(text, attachments);
      setValue("");
      setAttachments([]);
      storage.remove(key);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to send. Your draft is saved.");
    } finally {
      submitLock.current = false;
      setSending(false);
      textArea.current?.focus();
    }
  };

  const attach = async () => {
    setMenu(false);
    if (pasteLock.current) return;
    pasteLock.current = true; setPasting(true);
    try {
      const picked = await window.lodex.workspace.chooseAttachments();
      if (!mounted.current) return;
      const files = [...new Map([...latest.current.attachments, ...picked].map(file => [file.path, file])).values()].slice(0, 8);
      setAttachments(files);
      save(latest.current.value, files);
      setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to attach files."); }
    finally { pasteLock.current = false; if (mounted.current) setPasting(false); }
  };

  const pasteImages = async (images: File[]) => {
    if (pasteLock.current) { setError("Wait for the current images to finish attaching."); return; }
    if (latest.current.attachments.length + images.length > 8) { setError("You can attach up to eight images and files per message."); return; }
    pasteLock.current = true; setPasting(true); setError("");
    try {
      for (const file of images) {
        if (file.size > 20 * 1024 * 1024) throw new Error("Paste images smaller than 20 MB.");
        const image = await window.lodex.workspace.pasteImage(new Uint8Array(await file.arrayBuffer()), temporary);
        if (!mounted.current) return;
        const files = [...latest.current.attachments, image];
        latest.current.attachments = files; setAttachments(files); save(latest.current.value, files);
      }
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "Unable to paste this image."); }
    finally { pasteLock.current = false; if (mounted.current) setPasting(false); }
  };

  return <div className="composer-wrap">
    <div className={`composer ${disabled ? "disabled" : ""}`}>
      {!!attachments.length && <div className="attachment-row">
        {attachments.map(file => <div className="attachment" key={file.path}>
          {file.kind === "image" ? <img src={window.lodex.workspace.imageUrl(file.path)} alt="" /> : <FileText size={24} />}
          <span title={file.name}>{file.name}</span>
          <button aria-label={`Remove ${file.name}`} disabled={sending} onClick={() => { const files = attachments.filter(entry => entry.path !== file.path); setAttachments(files); save(value, files); }}><X size={13} /></button>
        </div>)}
      </div>}
      <textarea ref={textArea} aria-label="Message Lodex" value={value} onChange={event => { setValue(event.target.value); save(event.target.value, attachments); }}
        onPaste={event => {
          const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith("image/"));
          if (!images.length) return;
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          if (text) { const input = event.currentTarget; const next = value.slice(0, input.selectionStart) + text + value.slice(input.selectionEnd); latest.current.value = next; setValue(next); save(next, attachments); }
          void pasteImages(images);
        }}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); }
          if (event.key === "Escape") setMenu(false);
        }}
        placeholder={running ? "Write your next message…" : workspace ? "Ask anything about your project" : "Ask anything"}
        disabled={disabled || sending} rows={1} />
      <div className="composer-actions">
        <div ref={menuRef} className="composer-menu-wrap">
          <button className="icon-button composer-add" aria-label="Add photos, files and tools" aria-expanded={menu} onClick={() => setMenu(!menu)} disabled={disabled || sending || pasting}><Plus size={22} /></button>
          {menu && <div className="composer-menu" role="menu">
            <button role="menuitem" onClick={() => void attach()}><Paperclip size={18} /><span>Add photos and files<small>Up to 8 files, 20 MB each</small></span></button>
            <button role="menuitem" onClick={() => { setMenu(false); onOpenTools(); }}><Blocks size={18} /><span>Apps and skills<small>Use your connected tools</small></span></button>
          </div>}
          <PromptControls side="access" options={options} disabled={disabled || sending || running} />
        </div>
        <div className="composer-right-controls">
        <PromptControls side="model" options={options} disabled={disabled || sending || running} />
        <Dictation disabled={disabled || sending || pasting} onBusy={setVoiceBusy} onText={text => {
          const current = latest.current.value; const next = current + (current && !/\s$/.test(current) ? " " : "") + text;
          setValue(next); save(next, latest.current.attachments); textArea.current?.focus();
        }} />
        {running ? <button className="send-button stop" onClick={onStop} title="Stop response"><Square size={14} fill="currentColor" /></button> :
          <button className="send-button" onClick={() => void submit()} disabled={disabled || sending || pasting || voiceBusy || (!value.trim() && !attachments.length)} title="Send message"><ArrowUp size={21} /></button>}
        </div>
      </div>
    </div>
    {error ? <p className="composer-error" role="alert">{error}</p> : <p className="composer-caption">{pasting ? "Attaching images…" : "Lodex can make mistakes. Check important information."}</p>}
  </div>;
}
