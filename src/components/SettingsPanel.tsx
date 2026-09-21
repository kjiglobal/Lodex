import { ArchiveRestore, Check, Keyboard, Moon, Settings2, Sun, X } from "lucide-react";
import type { Thread } from "../types";

type Props = {
  visible: boolean;
  theme: "light" | "dark";
  archivedThreads: Thread[];
  loading: boolean;
  onClose(): void;
  onTheme(theme: "light" | "dark"): void;
  onRefresh(): void;
  onRestore(thread: Thread): void;
};

const threadTitle = (thread: Thread) => thread.name?.trim() || thread.preview?.trim() || "Untitled chat";

export function SettingsPanel({ visible, theme, archivedThreads, loading, onClose, onTheme, onRefresh, onRestore }: Props) {
  if (!visible) return null;

  return (
    <aside className="settings-panel" aria-label="Settings">
      <header className="drawer-header">
        <div><Settings2 size={17} /><span>Settings</span></div>
        <button className="icon-button" onClick={onClose} title="Close settings"><X size={17} /></button>
      </header>
      <div className="drawer-scroll">
        <section className="settings-section">
          <div className="settings-heading"><span>Appearance</span><small>Choose how Lodex looks</small></div>
          <div className="choice-grid">
            <button className={theme === "light" ? "active" : ""} onClick={() => onTheme("light")}><Sun size={17} /><span>Light</span>{theme === "light" && <Check size={14} />}</button>
            <button className={theme === "dark" ? "active" : ""} onClick={() => onTheme("dark")}><Moon size={17} /><span>Dark</span>{theme === "dark" && <Check size={14} />}</button>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-heading"><span>Keyboard shortcuts</span><small>Desktop navigation</small></div>
          <div className="shortcut-list">
            <div><Keyboard size={14} /><span>Search chats</span><kbd>Ctrl K</kbd></div>
            <div><Keyboard size={14} /><span>New chat or task</span><kbd>Ctrl N</kbd></div>
            <div><Keyboard size={14} /><span>Quick chat</span><kbd>Ctrl Alt N</kbd></div>
            <div><Keyboard size={14} /><span>Open project</span><kbd>Ctrl Shift O</kbd></div>
            <div><Keyboard size={14} /><span>Toggle terminal</span><kbd>Ctrl `</kbd></div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-heading settings-heading-row">
            <div><span>Archived chats</span><small>Restore chats to the sidebar</small></div>
            <button onClick={onRefresh}>Refresh</button>
          </div>
          {loading ? <div className="drawer-loading"><span className="loader" />Loading archived chats…</div> : (
            <div className="archived-list">
              {archivedThreads.map((thread) => (
                <div className="archived-row" key={thread.id}>
                  <div><strong>{threadTitle(thread)}</strong><small>{thread.cwd || "Chat"}</small></div>
                  <button onClick={() => onRestore(thread)} title="Restore chat"><ArchiveRestore size={15} />Restore</button>
                </div>
              ))}
              {!archivedThreads.length && <p className="drawer-empty">No archived chats.</p>}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
