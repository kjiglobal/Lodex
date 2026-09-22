import { useEffect, useState } from "react";
import { X } from "lucide-react";

export function SettingsDialog({ theme, onTheme, approvalPolicy, onApproval, instructions, onInstructions, onArchived, onClose }: {
  theme: "light" | "dark"; onTheme(value: "light" | "dark"): void;
  approvalPolicy: string; onApproval(value: string): void;
  instructions: string; onInstructions(value: string): void; onArchived(): void; onClose(): void;
}) {
  const [info, setInfo] = useState<{ version: string; softwareRendering: boolean } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void window.lodex.app.info().then(setInfo).catch(() => undefined); }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header><h2 id="settings-title">Settings</h2><button className="icon-button" title="Close settings" onClick={onClose}><X size={20} /></button></header>
      <label className="settings-row"><span>Appearance</span><select autoFocus value={theme} onChange={event => onTheme(event.target.value as "light" | "dark")}><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label className="settings-row"><span>Approvals<small>Control commands and file changes</small></span><select value={approvalPolicy} onChange={event => onApproval(event.target.value)}><option value="on-request">Ask when needed</option><option value="untrusted">Trusted commands only</option><option value="never">Never ask</option></select></label>
      <label className="instructions-label"><span>Custom instructions</span><small>What should Lodex know about how you like responses? Applies to new chats.</small><textarea rows={4} maxLength={6000} value={instructions} onChange={event => onInstructions(event.target.value)} placeholder="For example: Keep responses concise and explain technical terms." /></label>
      <div className="settings-info"><strong>About Lodex {info?.version}</strong><p>Uses your ChatGPT account through the Codex runtime. Models and tools depend on your account. Chats are saved locally; ChatGPT web history is separate.</p><p>Voice typing runs on this device after a one-time speech model download. Click the microphone, speak, stop, and review your text before sending.</p><p>Live voice conversations, Canvas, scheduled tasks, and full browser control are not available in Lodex.</p><a href="https://chatgpt.com" target="_blank" rel="noreferrer">Open ChatGPT ↗</a></div>
      <div className="settings-row"><span>Diagnostics<small>{info?.softwareRendering ? "Linux compatibility rendering is on" : "Standard rendering"}</small></span><button className="secondary-button" onClick={() => void window.lodex.app.openDiagnostics().catch(() => setError("Unable to open diagnostics."))}>Open log</button></div>
      <div className="settings-row"><span>Archived chats<small>Restore chats to the sidebar</small></span><button className="secondary-button" onClick={onArchived}>Manage archived chats</button></div>
      <p className="shortcut-hint">Ctrl+N · New chat &nbsp; Ctrl+Shift+N · Temporary chat &nbsp; Ctrl+O · Open folder &nbsp; Ctrl+K · Search chats &nbsp; Ctrl+B · Toggle sidebar</p>
      {error && <p role="alert">{error}</p>}
    </section>
  </div>;
}
