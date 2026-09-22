import {
  Archive,
  Blocks,
  ChevronDown,
  FolderGit2,
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PenLine,
  Pin,
  PinOff,
  Search,
  Sun,
  Settings,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Account, AccountUsage, RateLimits, Thread } from "../types";

type Props = {
  threads: Thread[];
  activeThreadId: string | null;
  account: Account | null;
  workspace: string | null;
  rateLimits: RateLimits | null;
  accountUsage: AccountUsage | null;
  collapsed: boolean;
  theme: "light" | "dark";
  onToggle(): void;
  onToggleTheme(): void;
  onNew(): void;
  onSelect(thread: Thread): void;
  onRename(thread: Thread, name: string): void;
  onPin(thread: Thread): void;
  onArchive(thread: Thread): void;
  onOpenWorkspace(): void;
  onOpenTools(): void;
  onSignIn(): void;
  onLogout(): void;
  onSettings(): void;
  onArchived(): void;
  busy: boolean;
};

const shortPath = (value: string | null) => {
  if (!value) return "Open project";
  const parts = value.replaceAll("\\", "/").split("/").filter(Boolean);
  return parts.at(-1) || value;
};

const threadTitle = (thread: Thread) => thread.name?.trim() || thread.preview?.trim() || "Untitled chat";

function ThreadRow({
  thread,
  active,
  menuOpen,
  onSelect,
  onMenu,
  onRename,
  onPin,
  onArchive,
}: {
  thread: Thread;
  active: boolean;
  menuOpen: boolean;
  onSelect(): void;
  onMenu(): void;
  onRename(name: string): void;
  onPin(): void;
  onArchive(): void;
}) {
  const status = thread.status?.type;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(threadTitle(thread));
  return (
    <div className={`thread-row ${active ? "active" : ""}`}>
      <button className="thread-link" onClick={onSelect} title={threadTitle(thread)}>
        <span className={`thread-status ${status === "active" ? "active" : status === "systemError" ? "error" : ""}`} />
        <span>{threadTitle(thread)}</span>
      </button>
      <button className="thread-menu-button" onClick={onMenu} title="Chat actions"><MoreHorizontal size={16} /></button>
      {renaming && <form className="inline-rename" onSubmit={event => { event.preventDefault(); if (name.trim()) { onRename(name.trim()); setRenaming(false); } }}><input autoFocus aria-label="Chat name" value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setRenaming(false); }} /><button type="submit">Save</button><button type="button" onClick={() => setRenaming(false)}>Cancel</button></form>}
      {menuOpen && !renaming && (
        <div className="thread-menu" role="menu">
          <button onClick={() => {
            setName(threadTitle(thread)); setRenaming(true);
          }}><PenLine size={14} />Rename</button>
          <button onClick={onPin}>{thread.isPinned ? <PinOff size={14} /> : <Pin size={14} />}{thread.isPinned ? "Unpin" : "Pin"}</button>
          <button onClick={onArchive}><Archive size={14} />Archive</button>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  threads,
  activeThreadId,
  account,
  workspace,
  rateLimits,
  accountUsage,
  collapsed,
  theme,
  onToggle,
  onToggleTheme,
  onNew,
  onSelect,
  onRename,
  onPin,
  onArchive,
  onOpenWorkspace,
  onOpenTools,
  onSignIn,
  onLogout,
  onSettings,
  onArchived,
  busy,
}: Props) {
  const [query, setQuery] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return threads;
    return threads.filter((thread) => threadTitle(thread).toLocaleLowerCase().includes(normalized));
  }, [query, threads]);
  const pinned = filtered.filter((thread) => thread.isPinned);
  const recent = filtered.filter((thread) => !thread.isPinned);
  const usage = rateLimits?.primary?.usedPercent;

  if (collapsed) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <div className="brand-mark small">L</div>
        <button className="icon-button" onClick={onToggle} title="Open sidebar"><MessageSquare size={19} /></button>
        <button className="icon-button" disabled={busy} onClick={onNew} title="New chat"><PenLine size={19} /></button>
        <button className="icon-button" onClick={onSettings} title="Settings"><Settings size={19} /></button>
        <button className="icon-button sidebar-bottom-action" onClick={onToggleTheme} title={`Use ${theme === "light" ? "dark" : "light"} mode`}>
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </aside>
    );
  }

  const renderRows = (rows: Thread[]) => rows.map((thread) => (
    <ThreadRow
      key={thread.id}
      thread={thread}
      active={activeThreadId === thread.id}
      menuOpen={openMenu === thread.id}
      onSelect={() => { setOpenMenu(null); onSelect(thread); }}
      onMenu={() => setOpenMenu((current) => current === thread.id ? null : thread.id)}
      onRename={(name) => { setOpenMenu(null); onRename(thread, name); }}
      onPin={() => { setOpenMenu(null); onPin(thread); }}
      onArchive={() => { setOpenMenu(null); onArchive(thread); }}
    />
  ));

  return (
    <aside className="sidebar" onClick={(event) => {
      if (!(event.target as HTMLElement).closest(".thread-row")) setOpenMenu(null);
    }}>
      <div className="sidebar-brand">
        <div className="brand-mark">L</div>
        <span>Lodex</span>
        <button className="icon-button sidebar-close" onClick={onToggle} title="Close sidebar"><PanelLeftClose size={18} /></button>
      </div>

      <div className="sidebar-primary-actions">
        <button className="new-task-button" disabled={busy} onClick={onNew}><PenLine size={17} /><span>New chat</span><kbd>Ctrl ⇧ O</kbd></button>
        <label className="sidebar-search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" /></label>
      </div>

      <div className="sidebar-nav">
        <button className="workspace-button" disabled={busy} onClick={onOpenWorkspace} title={workspace ?? undefined}>
          <FolderGit2 size={16} /><span>{shortPath(workspace)}</span><ChevronDown size={15} />
        </button>
        <button className="workspace-button" onClick={onOpenTools}><Blocks size={16} /><span>Apps and skills</span></button>
      </div>

      <nav className="thread-list" aria-label="Chats">
        {!!pinned.length && <section><div className="sidebar-section-title"><span>Pinned</span></div>{renderRows(pinned)}</section>}
        <section>
          <div className="sidebar-section-title"><span>Chats</span><small>{filtered.length || ""}</small></div>
          {renderRows(recent)}
          {!filtered.length && <p className="sidebar-empty">{query ? "No chats match your search." : "Your recent chats will appear here."}</p>}
        </section>
      </nav>

      <div className="sidebar-footer-actions">
        <button className="theme-button" onClick={onArchived}><Archive size={16} /><span>Archived chats</span></button>
        <button className="theme-button" onClick={onSettings}><Settings size={16} /><span>Settings</span></button>
        <button className="theme-button" onClick={onToggleTheme}>{theme === "light" ? <Moon size={15} /> : <Sun size={15} />}<span>{theme === "light" ? "Dark mode" : "Light mode"}</span></button>
      </div>

      <div className="sidebar-account">
        {account ? (
          <>
            <div className="account-avatar">{(account.email?.[0] || "U").toUpperCase()}</div>
            <div className="account-copy">
              <span>{account.email || "ChatGPT account"}</span>
              <small>{account.planType || rateLimits?.planType || "Signed in"}{typeof usage === "number" ? ` · ${Math.round(usage)}% used` : accountUsage?.summary?.currentStreakDays ? ` · ${accountUsage.summary.currentStreakDays} day streak` : ""}</small>
              {typeof usage === "number" && <span className="usage-meter"><i style={{ width: `${Math.min(100, Math.max(0, usage))}%` }} /></span>}
            </div>
            <button className="icon-button" onClick={onLogout} title="Sign out"><LogOut size={16} /></button>
          </>
        ) : (
          <button className="account-signin" onClick={onSignIn}><LogIn size={17} />Sign in with ChatGPT</button>
        )}
      </div>
    </aside>
  );
}
