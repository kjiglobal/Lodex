import {
  ChevronDown,
  FolderGit2,
  LogIn,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PenLine,
  Search,
} from "lucide-react";
import type { Account, Thread } from "../types";

type Props = {
  threads: Thread[];
  activeThreadId: string | null;
  account: Account | null;
  workspace: string | null;
  collapsed: boolean;
  onToggle(): void;
  onNew(): void;
  onSelect(thread: Thread): void;
  onOpenWorkspace(): void;
  onSignIn(): void;
  onLogout(): void;
};

const shortPath = (value: string | null) => {
  if (!value) return "Open project";
  const parts = value.replaceAll("\\", "/").split("/").filter(Boolean);
  return parts.at(-1) || value;
};

const threadTitle = (thread: Thread) => thread.name?.trim() || thread.preview?.trim() || "Untitled task";

export function Sidebar({
  threads,
  activeThreadId,
  account,
  workspace,
  collapsed,
  onToggle,
  onNew,
  onSelect,
  onOpenWorkspace,
  onSignIn,
  onLogout,
}: Props) {
  if (collapsed) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <button className="icon-button" onClick={onToggle} title="Open sidebar">
          <MessageSquare size={19} />
        </button>
        <button className="icon-button" onClick={onNew} title="New task">
          <PenLine size={19} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">L</div>
        <span>Lodex</span>
        <button className="icon-button sidebar-close" onClick={onToggle} title="Close sidebar">
          <PanelLeftClose size={18} />
        </button>
      </div>

      <button className="new-task-button" onClick={onNew}>
        <PenLine size={17} />
        <span>New task</span>
      </button>

      <button className="workspace-button" onClick={onOpenWorkspace} title={workspace ?? undefined}>
        <FolderGit2 size={16} />
        <span>{shortPath(workspace)}</span>
        <ChevronDown size={15} />
      </button>

      <div className="sidebar-search">
        <Search size={15} />
        <span>Recent tasks</span>
      </div>

      <nav className="thread-list" aria-label="Recent tasks">
        {threads.map((thread) => (
          <button
            key={thread.id}
            className={`thread-link ${activeThreadId === thread.id ? "active" : ""}`}
            onClick={() => onSelect(thread)}
            title={threadTitle(thread)}
          >
            <span>{threadTitle(thread)}</span>
          </button>
        ))}
        {!threads.length && <p className="sidebar-empty">Your recent tasks will appear here.</p>}
      </nav>

      <div className="sidebar-account">
        {account ? (
          <>
            <div className="account-avatar">{(account.email?.[0] || "U").toUpperCase()}</div>
            <div className="account-copy">
              <span>{account.email || "ChatGPT account"}</span>
              <small>{account.planType || "Signed in"}</small>
            </div>
            <button className="icon-button" onClick={onLogout} title="Sign out">
              <LogOut size={16} />
            </button>
          </>
        ) : (
          <button className="account-signin" onClick={onSignIn}>
            <LogIn size={17} />
            Sign in with ChatGPT
          </button>
        )}
      </div>
    </aside>
  );
}
