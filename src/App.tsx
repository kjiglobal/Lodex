import {
  Blocks,
  ChevronDown,
  FolderOpen,
  Gauge,
  GitCompareArrows,
  LogIn,
  PanelRight,
  Settings2,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApprovalDialog } from "./components/ApprovalDialog";
import { Composer } from "./components/Composer";
import { MessageList } from "./components/MessageList";
import { Sidebar } from "./components/Sidebar";
import { TerminalPanel } from "./components/TerminalPanel";
import { WorkspacePanel } from "./components/WorkspacePanel";
import type {
  AccountState,
  AttachedImage,
  CodexEvent,
  FileNode,
  GitStatus,
  Model,
  PendingServerRequest,
  Thread,
  ThreadItem,
} from "./types";

const serverRequestMethods = new Set([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
  "item/tool/requestUserInput",
  "mcpServer/elicitation/request",
]);

const flattenItems = (thread: Thread) => thread.turns?.flatMap((turn) => turn.items || []) || [];

const titleForThread = (thread: Thread | null) => thread?.name?.trim() || thread?.preview?.trim() || "New task";

export default function App() {
  const [accountState, setAccountState] = useState<AccountState>({ account: null, requiresOpenaiAuth: true });
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [effort, setEffort] = useState("");
  const [approvalPolicy, setApprovalPolicy] = useState("on-request");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [git, setGit] = useState<GitStatus | null>(null);
  const [turnDiff, setTurnDiff] = useState("");
  const [loadingThread, setLoadingThread] = useState(false);
  const [running, setRunning] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspaceVisible, setWorkspaceVisible] = useState(true);
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [requests, setRequests] = useState<PendingServerRequest[]>([]);
  const [runtimeState, setRuntimeState] = useState("starting");
  const [error, setError] = useState<string | null>(null);
  const activeThreadId = useRef<string | null>(null);

  useEffect(() => {
    activeThreadId.current = activeThread?.id || null;
  }, [activeThread]);

  const upsertItem = useCallback((nextItem: ThreadItem) => {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === nextItem.id);
      if (index < 0) return [...current, nextItem];
      const copy = [...current];
      copy[index] = nextItem;
      return copy;
    });
  }, []);

  const refreshAccount = useCallback(async () => {
    const result = await window.lodex.codex.request<AccountState>("account/read", { refreshToken: false });
    setAccountState(result);
  }, []);

  const refreshModels = useCallback(async () => {
    const result = await window.lodex.codex.request<{ data: Model[] }>("model/list", { limit: 50, includeHidden: false });
    const availableModels = result.data || [];
    setModels(availableModels);
    const defaultModel = availableModels.find((model) => model.isDefault) || availableModels.find((model) => model.id === "gpt-5.6-terra") || availableModels[0];
    setSelectedModel(defaultModel?.id || defaultModel?.model || "");
    setEffort(defaultModel?.defaultReasoningEffort || defaultModel?.supportedReasoningEfforts?.[0]?.reasoningEffort || "");
  }, []);

  const refreshThreads = useCallback(async () => {
    const result = await window.lodex.codex.request<{ data: Thread[] }>("thread/list", {
      limit: 100,
      sortKey: "updated_at",
      sortDirection: "desc",
      archived: false,
    });
    setThreads(result.data || []);
  }, []);

  const refreshWorkspace = useCallback(async () => {
    const root = await window.lodex.workspace.current();
    setWorkspace(root);
    if (!root) {
      setTree([]);
      setGit(null);
      return;
    }
    const [nextTree, nextGit] = await Promise.all([
      window.lodex.workspace.tree(),
      window.lodex.git.status(),
    ]);
    setTree(nextTree);
    setGit(nextGit);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [accountResult, modelResult] = await Promise.all([
          window.lodex.codex.request<AccountState>("account/read", { refreshToken: false }),
          window.lodex.codex.request<{ data: Model[] }>("model/list", { limit: 50, includeHidden: false }),
        ]);
        setAccountState(accountResult);
        const availableModels = modelResult.data || [];
        setModels(availableModels);
        const defaultModel = availableModels.find((model) => model.isDefault) || availableModels.find((model) => model.id === "gpt-5.6-terra") || availableModels[0];
        if (defaultModel) {
          setSelectedModel(defaultModel.id || defaultModel.model);
          setEffort(defaultModel.defaultReasoningEffort || defaultModel.supportedReasoningEfforts?.[0]?.reasoningEffort || "");
        }
        await Promise.all([refreshThreads(), refreshWorkspace()]);
        setRuntimeState("ready");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to start Lodex.");
      }
    };
    void load();
  }, [refreshThreads, refreshWorkspace]);

  useEffect(() => {
    const unsubscribeStatus = window.lodex.codex.onStatus((status) => {
      if (status.state !== "log") setRuntimeState(status.state);
      if (status.state === "error") setError(status.message || "Codex runtime stopped.");
    });

    const unsubscribeEvents = window.lodex.codex.onEvent((event: CodexEvent) => {
      const method = event.method || "";
      const params = event.params || {};

      if (event.id !== undefined && serverRequestMethods.has(method)) {
        setRequests((current) => [...current, { id: event.id!, method, params }]);
        return;
      }

      if (method === "account/updated" || method === "account/login/completed") {
        void Promise.all([refreshAccount(), refreshModels()]).catch(() => undefined);
        return;
      }

      if (method === "thread/name/updated" || method === "thread/archived") {
        void refreshThreads().catch(() => undefined);
      }

      const eventThreadId = typeof params.threadId === "string" ? params.threadId : null;
      if (eventThreadId && eventThreadId !== activeThreadId.current) return;

      if (method === "item/started" || method === "item/completed") {
        const item = params.item as ThreadItem | undefined;
        if (item?.id) upsertItem(item);
      } else if (method === "item/agentMessage/delta") {
        const itemId = String(params.itemId || "streaming-agent-message");
        const delta = String(params.delta || "");
        setItems((current) => {
          const index = current.findIndex((item) => item.id === itemId);
          if (index < 0) return [...current, { id: itemId, type: "agentMessage", text: delta, phase: "final_answer" }];
          const copy = [...current];
          copy[index] = { ...copy[index], text: `${copy[index].text || ""}${delta}` };
          return copy;
        });
      } else if (method === "item/commandExecution/outputDelta") {
        const itemId = String(params.itemId || "");
        const delta = String(params.delta || "");
        setItems((current) => current.map((item) => item.id === itemId ? { ...item, aggregatedOutput: `${item.aggregatedOutput || ""}${delta}` } : item));
      } else if (method === "turn/diff/updated") {
        setTurnDiff(String(params.diff || ""));
      } else if (method === "turn/started") {
        const turn = params.turn as { id?: string } | undefined;
        if (turn?.id) setActiveTurnId(turn.id);
        setRunning(true);
      } else if (method === "turn/completed") {
        setRunning(false);
        setActiveTurnId(null);
        void Promise.all([refreshThreads(), refreshWorkspace()]).catch(() => undefined);
      } else if (method === "error") {
        const details = params.error as { message?: string } | undefined;
        setError(details?.message || "The current turn failed.");
      }
    });

    return () => {
      unsubscribeStatus();
      unsubscribeEvents();
    };
  }, [refreshAccount, refreshModels, refreshThreads, refreshWorkspace, upsertItem]);

  const openWorkspace = async () => {
    try {
      const selected = await window.lodex.workspace.choose();
      if (!selected) return;
      setWorkspace(selected);
      setWorkspaceVisible(true);
      await refreshWorkspace();
    } catch (workspaceError) {
      setError(workspaceError instanceof Error ? workspaceError.message : "Unable to open that project.");
    }
  };

  const openThread = async (thread: Thread) => {
    if (running) return;
    setLoadingThread(true);
    setTurnDiff("");
    setActiveThread(thread);
    activeThreadId.current = thread.id;
    try {
      const result = await window.lodex.codex.request<{ thread: Thread }>("thread/resume", { threadId: thread.id });
      setActiveThread(result.thread);
      setItems(flattenItems(result.thread));
    } catch (threadError) {
      setError(threadError instanceof Error ? threadError.message : "Unable to open that task.");
    } finally {
      setLoadingThread(false);
    }
  };

  const newTask = () => {
    if (running) return;
    activeThreadId.current = null;
    setActiveThread(null);
    setItems([]);
    setTurnDiff("");
    setActiveTurnId(null);
  };

  const send = async (text: string, images: AttachedImage[]) => {
    if (!accountState.account && accountState.requiresOpenaiAuth) {
      await signIn();
      throw new Error("Finish signing in, then send your message again.");
    }

    try {
      let thread = activeThread;
      if (!thread) {
        const result = await window.lodex.codex.request<{ thread: Thread }>("thread/start", {
          model: selectedModel || undefined,
          cwd: workspace || undefined,
          approvalPolicy,
          sandbox: "workspace-write",
          serviceName: "lodex",
        });
        thread = result.thread;
        setActiveThread(thread);
        activeThreadId.current = thread.id;
      }

      const input = [
        ...(text ? [{ type: "text", text, text_elements: [] }] : []),
        ...images.map((image) => ({ type: "localImage", path: image.path, detail: "auto" })),
      ];
      setRunning(true);
      const result = await window.lodex.codex.request<{ turn: { id: string } }>("turn/start", {
        threadId: thread.id,
        input,
        cwd: workspace || undefined,
        approvalPolicy,
        model: selectedModel || undefined,
        effort: effort || undefined,
      });
      setActiveTurnId(result.turn.id);
    } catch (sendError) {
      setRunning(false);
      setError(sendError instanceof Error ? sendError.message : "Unable to send the message.");
      throw sendError;
    }
  };

  const stop = () => {
    if (!activeThread?.id || !activeTurnId) return;
    void window.lodex.codex.request("turn/interrupt", { threadId: activeThread.id, turnId: activeTurnId });
  };

  const signIn = async () => {
    try {
      await window.lodex.auth.loginWithChatGPT();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to start ChatGPT sign-in.");
    }
  };

  const logout = async () => {
    await window.lodex.auth.logout();
    await refreshAccount();
  };

  const currentModel = models.find((model) => model.id === selectedModel || model.model === selectedModel);
  const efforts = currentModel?.supportedReasoningEfforts || [];
  const empty = !items.length && !loadingThread;

  return (
    <div className="app-shell">
      <Sidebar
        threads={threads}
        activeThreadId={activeThread?.id || null}
        account={accountState.account}
        workspace={workspace}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        onNew={newTask}
        onSelect={(thread) => void openThread(thread)}
        onOpenWorkspace={() => void openWorkspace()}
        onSignIn={() => void signIn()}
        onLogout={() => void logout()}
      />

      <main className="main-column">
        <header className="topbar">
          <div className="task-title"><span>{titleForThread(activeThread)}</span></div>
          <div className="topbar-controls">
            <label className="select-control" title="Model">
              <Sparkles size={14} />
              <select value={selectedModel} onChange={(event) => {
                const modelId = event.target.value;
                setSelectedModel(modelId);
                const model = models.find((candidate) => candidate.id === modelId);
                setEffort(model?.defaultReasoningEffort || model?.supportedReasoningEfforts?.[0]?.reasoningEffort || "");
              }}>
                {models.map((model) => <option value={model.id} key={model.id}>{model.displayName || model.id}</option>)}
              </select>
              <ChevronDown size={13} />
            </label>
            {!!efforts.length && (
              <label className="select-control compact" title="Reasoning effort">
                <Gauge size={14} />
                <select value={effort} onChange={(event) => setEffort(event.target.value)}>
                  {efforts.map((option) => <option value={option.reasoningEffort} key={option.reasoningEffort}>{option.reasoningEffort}</option>)}
                </select>
                <ChevronDown size={13} />
              </label>
            )}
            <label className="select-control compact" title="Approval policy">
              <Settings2 size={14} />
              <select value={approvalPolicy} onChange={(event) => setApprovalPolicy(event.target.value)}>
                <option value="on-request">Ask</option>
                <option value="untrusted">Strict</option>
                <option value="never">Never ask</option>
              </select>
              <ChevronDown size={13} />
            </label>
            <span className={`runtime-dot ${runtimeState}`} title={`Codex runtime: ${runtimeState}`} />
            <button className={`icon-button ${terminalVisible ? "active" : ""}`} onClick={() => setTerminalVisible((value) => !value)} title="Terminal"><TerminalSquare size={17} /></button>
            <button className={`icon-button ${workspaceVisible ? "active" : ""}`} onClick={() => setWorkspaceVisible((value) => !value)} title="Workspace"><PanelRight size={17} /></button>
          </div>
        </header>

        <div className="conversation-area">
          {empty ? (
            <div className="welcome">
              <div className="welcome-mark">L</div>
              <h1>{accountState.account ? "What are we building?" : "Your AI workspace for Linux"}</h1>
              <p>{accountState.account ? "Ask a question, inspect a repository, or delegate a change." : "Use your ChatGPT account with a native coding workspace, terminal, files, images, and Git."}</p>
              {!accountState.account && accountState.requiresOpenaiAuth ? (
                <button className="signin-button" onClick={() => void signIn()}><LogIn size={18} />Sign in with ChatGPT</button>
              ) : (
                <div className="suggestion-grid">
                  <button onClick={() => void send("Explain the architecture of this project and identify the most important files.", [])}><Blocks size={18} /><span>Understand this project</span></button>
                  <button onClick={() => void send("Review the current Git changes for correctness, regressions, and missing tests.", [])}><GitCompareArrows size={18} /><span>Review Git changes</span></button>
                  <button onClick={() => void openWorkspace()}><FolderOpen size={18} /><span>Open another project</span></button>
                </div>
              )}
            </div>
          ) : (
            <MessageList items={items} loading={loadingThread} running={running} />
          )}
          <Composer disabled={runtimeState === "error" || loadingThread} running={running} workspace={workspace} onSend={send} onStop={stop} />
        </div>

        {terminalVisible && <TerminalPanel workspace={workspace} onClose={() => setTerminalVisible(false)} />}
      </main>

      <WorkspacePanel
        visible={workspaceVisible}
        workspace={workspace}
        tree={tree}
        git={git}
        turnDiff={turnDiff}
        onClose={() => setWorkspaceVisible(false)}
        onOpenWorkspace={() => void openWorkspace()}
        onRefresh={refreshWorkspace}
      />

      {!!requests.length && (
        <ApprovalDialog
          request={requests[0]}
          onResolve={(result) => {
            window.lodex.codex.respond(requests[0].id, result);
            setRequests((current) => current.slice(1));
          }}
        />
      )}

      {error && <div className="toast" role="alert"><span>{error}</span><button onClick={() => setError(null)}>×</button></div>}
    </div>
  );
}
