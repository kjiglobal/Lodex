import { ArrowLeft, ArrowRight, ExternalLink, House, Info, LoaderCircle, LogOut, PanelLeft, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { ChatGPTAction, ChatGPTState } from "../../electron/chatgpt-types";
import { storage } from "../storage";

export function ChatGPTWindow() {
  const [state, setState] = useState<ChatGPTState>({ origin: "https://chatgpt.com", loading: true, canGoBack: false, canGoForward: false, error: null, notice: null, captureSources: null });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    document.title = "ChatGPT — Lodex";
    const theme = storage.get("lodex-theme");
    document.documentElement.dataset.theme = theme === "light" || theme === "dark" ? theme : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    let active = true;
    let received = false;
    const off = window.chatgpt.onChange(value => { received = true; setState(value); });
    void window.chatgpt.state().then(value => { if (active && !received) setState(value); }).catch(() => setError("Unable to connect to the ChatGPT window. Reopen it from Lodex."));
    return () => { active = false; off(); };
  }, []);
  const action = (value: ChatGPTAction) => {
    setError(null);
    void window.chatgpt.action(value).catch(() => setError("That action did not complete. Please try again."));
  };
  const selectCapture = (id: string | null) => {
    void window.chatgpt.selectCapture(id).catch(() => setError("Unable to share that screen. Please try again."));
  };
  return <main className="chatgpt-window">
    <header className="chatgpt-toolbar" aria-label="ChatGPT navigation">
      <button className="icon-button" title="Back" disabled={!state.canGoBack} onClick={() => action("back")}><ArrowLeft size={18} /></button>
      <button className="icon-button" title="Forward" disabled={!state.canGoForward} onClick={() => action("forward")}><ArrowRight size={18} /></button>
      <button className="icon-button" title="Reload ChatGPT" onClick={() => action("reload")}><RotateCw size={18} /></button>
      <button className="icon-button" title="ChatGPT home" onClick={() => action("home")}><House size={18} /></button>
      <div className="chatgpt-location"><strong>ChatGPT</strong><span>{state.origin}</span>{state.loading && <LoaderCircle size={15} className="chatgpt-spinner" aria-label="Loading ChatGPT" />}</div>
      <button className="icon-button" title="ChatGPT features and availability" onClick={() => action("info")}><Info size={18} /></button>
      <button className="icon-button" title="Open ChatGPT in browser" onClick={() => action("browser")}><ExternalLink size={18} /></button>
      <button className="icon-button" title="Clear ChatGPT session" onClick={() => action("clear-session")}><LogOut size={18} /></button>
      <button className="chatgpt-local-button" onClick={() => action("workspace")}><PanelLeft size={17} />Local workspace</button>
    </header>
    <section className="chatgpt-page-area">
      {state.captureSources ? <div className="chatgpt-capture" role="dialog" aria-modal="true" aria-labelledby="capture-title" onKeyDown={event => { if (event.key === "Escape") selectCapture(null); }}>
        <h1 id="capture-title">Choose what to share with ChatGPT</h1>
        <p>Share one screen or window. System audio is not included. Stop sharing using ChatGPT’s controls.</p>
        <button autoFocus onClick={() => selectCapture(null)}>Cancel sharing</button>
        <div className="chatgpt-sources">{state.captureSources.map(source => <button key={source.id} onClick={() => selectCapture(source.id)}>
          <img src={source.thumbnail} alt="" /><span>{source.name}</span>
        </button>)}</div>
      </div> : state.error ? <div className="chatgpt-load-error" role="alert">
        <h1>Let’s reconnect to ChatGPT</h1><p>{state.error}</p>
        <div><button onClick={() => action("reload")}>Try again</button><button onClick={() => action("browser")}>Open in browser</button><button onClick={() => action("workspace")}>Local workspace</button></div>
      </div> : <p className="chatgpt-loading" role="status">Opening ChatGPT…</p>}
    </section>
    <footer className="chatgpt-status" role="status">{error || state.notice || "ChatGPT web · Sign in separately from Codex · Features depend on your account"}</footer>
  </main>;
}
