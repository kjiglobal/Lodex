import { Component, type ErrorInfo, type ReactNode } from "react";
import { LodexLogo } from "./LodexLogo";

export class ErrorBoundary extends Component<{ children: ReactNode; compact?: boolean }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Record the fault category, not chat content or filesystem paths.
    window.lodex?.app.reportError(this.props.compact ? "message-render-failed" : "app-render-failed");
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.compact) {
      return <div className="message-error" role="alert">This activity could not be displayed. Your chat is still available.</div>;
    }
    return <main className="recovery-screen" role="alert">
      <LodexLogo className="brand-mark" />
      <h1>Let’s get your chat back.</h1>
      <p>Lodex couldn’t display this view. Reload to reopen your conversation and saved draft.</p>
      <button className="primary-button" onClick={() => window.location.reload()}>Reload Lodex</button>
      <button className="secondary-button" onClick={() => { try { window.localStorage.removeItem("lodex-active-thread"); } catch {} window.location.reload(); }}>Open a fresh chat</button>
    </main>;
  }
}
