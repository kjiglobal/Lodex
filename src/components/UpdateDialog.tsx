import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, CircleCheck, RefreshCw, X } from "lucide-react";
import type { UpdateState } from "../types";
import { LodexLogo } from "./LodexLogo";

export function UpdateDialog({ checkOnOpen, onClose }: { checkOnOpen: boolean; onClose(): void }) {
  const [state, setState] = useState<UpdateState | null>(null);
  const [error, setError] = useState("");
  const container = useRef<HTMLElement>(null);
  const alive = useRef(true);
  const initialCheck = useRef(false);

  const action = (operation: () => Promise<unknown>) => {
    setError("");
    void operation().catch(() => { if (alive.current) setError("Unable to complete this update action. Please try again."); });
  };
  useEffect(() => {
    alive.current = true;
    let received = false;
    const off = window.lodex.updates.onChange(value => { received = true; setState(value); });
    void window.lodex.updates.state().then(value => { if (alive.current && !received) setState(value); }).catch(() => { if (alive.current) setError("Unable to load update information."); });
    return () => { alive.current = false; off(); };
  }, []);
  useEffect(() => {
    if (checkOnOpen && !initialCheck.current) { initialCheck.current = true; action(() => window.lodex.updates.check()); }
  }, [checkOnOpen]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    container.current?.focus();
    return () => previous?.focus();
  }, []);
  const busy = state && ["checking", "downloading", "installing"].includes(state.status);
  const downloading = state?.status === "downloading";
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={container} tabIndex={-1} className="settings-dialog update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-title" onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const buttons = Array.from(container.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === container.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header><h2 id="update-title">About Lodex</h2><button className="icon-button" title="Close update window" onClick={onClose}><X size={20} /></button></header>
      <LodexLogo className="update-brand" />
      <h3>Lodex</h3><p className="update-version">Version {state?.currentVersion || "…"}</p>
      <p className="update-description">An independent Ubuntu client for your ChatGPT account.</p>
      <div className="update-status" role="status" aria-live="polite">
        {(state?.status === "current" || state?.status === "installed") && <CircleCheck size={20} />}
        <p>{state?.message || "Loading update information…"}</p>
      </div>
      {downloading && <div className="update-progress"><progress aria-label="Update download" max={100} value={state.progress || 0} /><span>{state.progress || 0}%</span></div>}
      {state?.status === "available" && state.canInstall && <p className="update-hint">Download first, then install with your Ubuntu password. Your chats and settings are kept.</p>}
      {state?.status === "installing" && <p className="update-hint">You can keep chatting. Reopen Help → Check for Updates to see the result.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="update-actions">
        <button className="secondary-button" onClick={() => action(() => window.lodex.updates.openRelease())}>Release notes</button>
        {downloading ? <button className="secondary-button" onClick={() => action(() => window.lodex.updates.cancel())}>Cancel download</button>
          : state?.status === "ready" ? <button className="primary-button" onClick={() => action(() => window.lodex.updates.install())}>Install Update</button>
          : state?.status === "installed" ? <button className="primary-button" onClick={() => action(() => window.lodex.updates.restart())}>Restart Lodex</button>
          : state?.status === "available" && state.canInstall ? <button className="primary-button" onClick={() => action(() => window.lodex.updates.download())}><ArrowDownToLine size={16} />Download Update</button>
          : <button className="primary-button" disabled={!state || !!busy} onClick={() => action(() => window.lodex.updates.check())}><RefreshCw size={16} />{state?.status === "checking" ? "Checking…" : state?.status === "installing" ? "Installing…" : "Check for Updates"}</button>}
      </div>
    </section>
  </div>;
}
