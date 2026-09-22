import { ArrowUp, Blocks, FileText, FolderGit2, Paperclip, Plus, Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { storage } from "../storage";
import type { Attachment, SurfaceMode } from "../types";

type Props = {
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

export function Composer({ disabled, running, workspace, draftKey, surfaceMode, onSend, onStop, onOpenTools }: Props) {
  const key = `lodex-draft-${draftKey}`;
  const [value, setValue] = useState(() => readDraft(key).text);
  const [attachments, setAttachments] = useState<Attachment[]>(() => readDraft(key).attachments);
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState("");
  const submitLock = useRef(false);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const save = (text: string, files: Attachment[]) => storage.set(key, JSON.stringify({ text, attachments: files }));
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
    if ((!text && !attachments.length) || disabled || running || submitLock.current) return;
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
    try {
      const picked = await window.lodex.workspace.chooseAttachments();
      const files = [...new Map([...attachments, ...picked].map(file => [file.path, file])).values()].slice(0, 8);
      setAttachments(files);
      save(value, files);
      setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to attach files."); }
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
        onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); }
          if (event.key === "Escape") setMenu(false);
        }}
        placeholder={running ? "Write your next message…" : workspace ? "Ask anything about your project" : "Ask anything"}
        disabled={disabled || sending} rows={1} />
      <div className="composer-actions">
        <div ref={menuRef} className="composer-menu-wrap">
          <button className="icon-button composer-add" aria-label="Add photos, files and tools" aria-expanded={menu} onClick={() => setMenu(!menu)} disabled={disabled || sending}><Plus size={22} /></button>
          {menu && <div className="composer-menu" role="menu">
            <button role="menuitem" onClick={() => void attach()}><Paperclip size={18} /><span>Add photos and files<small>Up to 8 files, 20 MB each</small></span></button>
            <button role="menuitem" onClick={() => { setMenu(false); onOpenTools(); }}><Blocks size={18} /><span>Apps and skills<small>Use your connected tools</small></span></button>
          </div>}
          <span className="composer-context">
            {surfaceMode === "build" ? <FolderGit2 size={13} /> : <Sparkles size={13} />}
            {surfaceMode === "build" ? (workspace?.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) || "Choose project") : surfaceMode === "work" ? "Work" : "Chat"}
          </span>
        </div>
        {running ? <button className="send-button stop" onClick={onStop} title="Stop response"><Square size={14} fill="currentColor" /></button> :
          <button className="send-button" onClick={() => void submit()} disabled={disabled || sending || (!value.trim() && !attachments.length)} title="Send message"><ArrowUp size={21} /></button>}
      </div>
    </div>
    {error ? <p className="composer-error" role="alert">{error}</p> : <p className="composer-caption">Lodex can make mistakes. Check important information.</p>}
  </div>;
}
