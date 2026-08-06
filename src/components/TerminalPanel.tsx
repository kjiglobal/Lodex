import { Maximize2, TerminalSquare, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

type Props = {
  workspace: string | null;
  onClose(): void;
};

const encodeBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const decodeBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export function TerminalPanel({ workspace, onClose }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const processIdRef = useRef(`lodex-terminal-${crypto.randomUUID()}`);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: "#171716",
        foreground: "#e8e7e3",
        cursor: "#9ee8c5",
        selectionBackground: "#4b665a",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container.current);
    fit.fit();
    terminal.focus();
    terminalRef.current = terminal;
    fitRef.current = fit;

    const processId = processIdRef.current;
    const shell = window.lodex.platform === "win32" ? "powershell.exe" : (window.lodex.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
    void window.lodex.codex.request<{ exitCode: number }>("command/exec", {
      command: window.lodex.platform === "win32" ? [shell, "-NoLogo"] : [shell, "-l"],
      processId,
      tty: true,
      streamStdin: true,
      streamStdoutStderr: true,
      disableTimeout: true,
      cwd: workspace || undefined,
      size: { rows: terminal.rows, cols: terminal.cols },
    }).then((result) => terminal.writeln(`\r\n[process exited ${result.exitCode}]`)).catch((error: Error) => terminal.writeln(`\r\n[terminal error: ${error.message}]`));

    const input = terminal.onData((data) => {
      void window.lodex.codex.request("command/exec/write", { processId, deltaBase64: encodeBase64(data) });
    });
    const resize = terminal.onResize(({ rows, cols }) => {
      void window.lodex.codex.request("command/exec/resize", { processId, size: { rows, cols } }).catch(() => undefined);
    });
    const unsubscribe = window.lodex.codex.onEvent((event) => {
      if (event.method !== "command/exec/outputDelta" || event.params?.processId !== processId) return;
      const chunk = event.params.deltaBase64;
      if (typeof chunk === "string") terminal.write(decodeBase64(chunk));
    });
    const observer = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* The panel may be closing. */ }
    });
    observer.observe(container.current);

    return () => {
      observer.disconnect();
      unsubscribe();
      input.dispose();
      resize.dispose();
      terminal.dispose();
      void window.lodex.codex.request("command/exec/terminate", { processId }).catch(() => undefined);
    };
  }, [workspace]);

  useEffect(() => {
    requestAnimationFrame(() => fitRef.current?.fit());
  }, [maximized]);

  return (
    <section className={`terminal-panel ${maximized ? "maximized" : ""}`}>
      <div className="terminal-header">
        <span><TerminalSquare size={15} />Terminal</span>
        <div>
          <button className="icon-button" onClick={() => terminalRef.current?.clear()} title="Clear"><Trash2 size={14} /></button>
          <button className="icon-button" onClick={() => setMaximized((value) => !value)} title="Maximize"><Maximize2 size={14} /></button>
          <button className="icon-button" onClick={onClose} title="Close"><X size={14} /></button>
        </div>
      </div>
      <div className="terminal-container" ref={container} />
    </section>
  );
}
