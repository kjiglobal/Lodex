import {
  Activity,
  Blocks,
  ChevronDown,
  FolderOpen,
  Gauge,
  GitCompareArrows,
  Goal as GoalIcon,
  LogIn,
  PanelRight,
  Pin,
  PinOff,
  Settings2,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApprovalDialog } from "./components/ApprovalDialog";
import { ActivityPanel } from "./components/ActivityPanel";
import { Composer } from "./components/Composer";
import { GoalDialog } from "./components/GoalDialog";
import { MessageList } from "./components/MessageList";
import { Sidebar } from "./components/Sidebar";
import { TerminalPanel } from "./components/TerminalPanel";
import { ToolsPanel } from "./components/ToolsPanel";
import { WorkspacePanel } from "./components/WorkspacePanel";
import type {
  AccountUsage,
  AccountState,
  AttachedImage,
  ChatApp,
  CodexEvent,
  FileNode,
  GitStatus,
  Model,
  PendingServerRequest,
  PlanStep,
  RateLimits,
  Skill,
  Thread,
  ThreadGoal,
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

const titleForThread = (thread: Thread | null) => thread?.name?.trim() || thread?.preview?.trim() || "New session";

const pinnedStorageKey = "lodex-pinned-threads";

const readPinnedThreadIds = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(pinnedStorageKey) || "[]") as unknown;
    return new Set(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
};

const withLocalPins = (threads: Thread[]) => {
  const pinned = readPinnedThreadIds();
  return threads.map((thread) => ({ ...thread, isPinned: pinned.has(thread.id) }));
};

type SurfaceMode = "chat" | "work" | "build";

const initialTheme = (): "light" | "dark" => {
  const stored = window.localStorage.getItem("lodex-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export default function App() {
  const [accountState, setAccountState] = useState<AccountState>({ account: null, requiresOpenaiAuth: true });
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [effort, setEffort] = useState("");
  const [approvalPolicy, setApprovalPolicy] = useState("on-request");
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>("build");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [git, setGit] = useState<GitStatus | null>(null);
  const [turnDiff, setTurnDiff] = useState("");
  const [plan, setPlan] = useState<PlanStep[]>([]);
  const [goal, setGoal] = useState<ThreadGoal | null>(null);
  const [tokenUsage, setTokenUsage] = useState<Record<string, unknown> | null>(null);
  const [rateLimits, setRateLimits] = useState<RateLimits | null>(null);
  const [accountUsage, setAccountUsage] = useState<AccountUsage | null>(null);
  const [apps, setApps] = useState<ChatApp[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [running, setRunning] = useState(false);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspaceVisible, setWorkspaceVisible] = useState(false);
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [activityVisible, setActivityVisible] = useState(false);
  const [toolsVisible, setToolsVisible] = useState(false);
  const [goalDialogVisible, setGoalDialogVisible] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);
  const [requests, setRequests] = useState<PendingServerRequest[]>([]);
  const [runtimeState, setRuntimeState] = useState("starting");
  const [error, setError] = useState<string | null>(null);
  const activeThreadId = useRef<string | null>(null);

  useEffect(() => {
    activeThreadId.current = activeThread?.id || null;
  }, [activeThread]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("lodex-theme", theme);
  }, [theme]);

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

  const refreshAccountInsights = useCallback(async () => {
    const [limitsResult, usageResult] = await Promise.allSettled([
      window.lodex.codex.request<{ rateLimits: RateLimits }>("account/rateLimits/read"),
      window.lodex.codex.request<AccountUsage>("account/usage/read"),
    ]);
    if (limitsResult.status === "fulfilled") setRateLimits(limitsResult.value.rateLimits || null);
    if (usageResult.status === "fulfilled") setAccountUsage(usageResult.value);
  }, []);

  const refreshThreads = useCallback(async () => {
    const result = await window.lodex.codex.request<{ data: Thread[] }>("thread/list", {
      limit: 100,
      sortKey: "updated_at",
      sortDirection: "desc",
      archived: false,
      sourceKinds: ["cli", "vscode", "appServer"],
    });
    setThreads(withLocalPins(result.data || []));
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

  const refreshGoal = useCallback(async (threadId: string) => {
    try {
      const result = await window.lodex.codex.request<{ goal: ThreadGoal | null }>("thread/goal/get", { threadId });
      setGoal(result.goal || null);
    } catch {
      setGoal(null);
    }
  }, []);

  const refreshTools = useCallback(async () => {
    setToolsLoading(true);
    const requests: Array<Promise<unknown>> = [
      window.lodex.codex.request<{ data: ChatApp[] }>("app/list", { cursor: null, limit: 50, forceRefetch: false }),
    ];
    if (workspace) {
      requests.push(window.lodex.codex.request<{ data: Array<{ cwd: string; skills: Skill[] }> }>("skills/list", {
        cwds: [workspace],
        forceReload: false,
      }));
    }
    const [appResult, skillResult] = await Promise.allSettled(requests);
    if (appResult?.status === "fulfilled") {
      const result = appResult.value as { data?: ChatApp[] };
      setApps(result.data || []);
    }
    if (skillResult?.status === "fulfilled") {
      const result = skillResult.value as { data?: Array<{ skills?: Skill[] }> };
      setSkills(result.data?.flatMap((entry) => entry.skills || []) || []);
    } else if (!workspace) {
      setSkills([]);
    }
    setToolsLoading(false);
  }, [workspace]);

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
        if (accountResult.account) void refreshAccountInsights();
        setRuntimeState("ready");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to start Lodex.");
      }
    };
    void load();
  }, [refreshAccountInsights, refreshThreads, refreshWorkspace]);

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
        void Promise.all([refreshAccount(), refreshModels(), refreshAccountInsights()]).catch(() => undefined);
        return;
      }

      if (method === "account/rateLimits/updated") {
        const next = params.rateLimits as RateLimits | undefined;
        if (next) setRateLimits(next);
        return;
      }

      if (method === "app/list/updated") {
        const next = params.data as ChatApp[] | undefined;
        if (next) setApps(next);
      }

      if (method === "thread/name/updated" || method === "thread/archived") {
        void refreshThreads().catch(() => undefined);
      }

      if (method === "thread/status/changed") {
        const threadId = typeof params.threadId === "string" ? params.threadId : null;
        if (threadId) {
          setThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, status: params.status as Thread["status"] } : thread));
        }
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
      } else if (method === "turn/plan/updated") {
        setPlan((params.plan as PlanStep[] | undefined) || []);
      } else if (method === "thread/goal/updated") {
        const nextGoal = params.goal as ThreadGoal | undefined;
        if (nextGoal) setGoal(nextGoal);
      } else if (method === "thread/goal/cleared") {
        setGoal(null);
      } else if (method === "thread/tokenUsage/updated") {
        setTokenUsage(params);
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
  }, [refreshAccount, refreshAccountInsights, refreshModels, refreshThreads, refreshWorkspace, upsertItem]);

  const openWorkspace = async () => {
    try {
      const selected = await window.lodex.workspace.choose();
      if (!selected) return;
      setWorkspace(selected);
      setSurfaceMode("build");
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
    setPlan([]);
    setGoal(null);
    setTokenUsage(null);
    setActiveThread(thread);
    activeThreadId.current = thread.id;
    try {
      const result = await window.lodex.codex.request<{ thread: Thread }>("thread/resume", { threadId: thread.id });
      setActiveThread({ ...result.thread, isPinned: readPinnedThreadIds().has(result.thread.id) });
      setItems(flattenItems(result.thread));
      await refreshGoal(thread.id);
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
    setPlan([]);
    setGoal(null);
    setTokenUsage(null);
    setActiveTurnId(null);
  };

  const switchSurface = (surface: SurfaceMode) => {
    if (running) return;
    setSurfaceMode(surface);
    if (surface !== "build") {
      setWorkspaceVisible(false);
      setTerminalVisible(false);
    }
    if (surface === "build" && workspace) setWorkspaceVisible(true);
    newTask();
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
          approvalPolicy,
          surface: surfaceMode,
          sandbox: surfaceMode === "chat" ? "read-only" : "workspace-write",
          personality: "friendly",
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
        surface: surfaceMode,
        approvalPolicy,
        model: selectedModel || undefined,
        effort: effort || undefined,
        personality: "friendly",
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
    setRateLimits(null);
    setAccountUsage(null);
  };

  const renameThread = async (thread: Thread, name: string) => {
    try {
      await window.lodex.codex.request("thread/name/set", { threadId: thread.id, name });
      setThreads((current) => current.map((entry) => entry.id === thread.id ? { ...entry, name } : entry));
      if (activeThread?.id === thread.id) setActiveThread((current) => current ? { ...current, name } : current);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to rename that chat.");
    }
  };

  const pinThread = async (thread: Thread) => {
    const pinned = readPinnedThreadIds();
    const isPinned = !pinned.has(thread.id);
    if (isPinned) pinned.add(thread.id);
    else pinned.delete(thread.id);
    window.localStorage.setItem(pinnedStorageKey, JSON.stringify([...pinned]));
    setThreads((current) => current.map((entry) => entry.id === thread.id ? { ...entry, isPinned } : entry));
    if (activeThread?.id === thread.id) setActiveThread((current) => current ? { ...current, isPinned } : current);
  };

  const archiveThread = async (thread: Thread) => {
    try {
      await window.lodex.codex.request("thread/archive", { threadId: thread.id });
      setThreads((current) => current.filter((entry) => entry.id !== thread.id));
      if (activeThread?.id === thread.id) newTask();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to archive that chat.");
    }
  };

  const saveGoal = async (objective: string, tokenBudget?: number) => {
    if (!activeThread) return;
    try {
      const result = await window.lodex.codex.request<{ goal: ThreadGoal }>("thread/goal/set", {
        threadId: activeThread.id,
        objective,
        status: "active",
        tokenBudget,
      });
      setGoal(result.goal);
      setGoalDialogVisible(false);
      setActivityVisible(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to save that goal.");
    }
  };

  const clearGoal = async () => {
    if (!activeThread) return;
    try {
      await window.lodex.codex.request("thread/goal/clear", { threadId: activeThread.id });
      setGoal(null);
      setGoalDialogVisible(false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to clear that goal.");
    }
  };

  const compactThread = async () => {
    if (!activeThread || running) return;
    try {
      await window.lodex.codex.request("thread/compact/start", { threadId: activeThread.id });
      setRunning(true);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to compact this chat.");
    }
  };

  const openTools = () => {
    setActivityVisible(false);
    setWorkspaceVisible(false);
    setToolsVisible(true);
    void refreshTools();
  };

  const currentModel = models.find((model) => model.id === selectedModel || model.model === selectedModel);
  const efforts = currentModel?.supportedReasoningEfforts || [];
  const empty = !items.length && !loadingThread;
  const welcomeTitle = surfaceMode === "chat" ? "What can I help with?" : surfaceMode === "work" ? "What are we working on?" : "What are we building?";
  const welcomeCopy = surfaceMode === "chat"
    ? "Ask a question, explore an idea, or think through a decision."
    : surfaceMode === "work"
      ? "Bring a goal, a file, or a substantial task and work through it together."
      : "Open a project, inspect the codebase, or delegate a verified change.";

  return (
    <div className={`app-shell surface-${surfaceMode}`}>
      <Sidebar
        threads={threads}
        activeThreadId={activeThread?.id || null}
        account={accountState.account}
        workspace={workspace}
        rateLimits={rateLimits}
        accountUsage={accountUsage}
        collapsed={sidebarCollapsed}
        theme={theme}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        onToggleTheme={() => setTheme((value) => value === "light" ? "dark" : "light")}
        onNew={newTask}
        onSelect={(thread) => void openThread(thread)}
        onRename={(thread, name) => void renameThread(thread, name)}
        onPin={(thread) => void pinThread(thread)}
        onArchive={(thread) => void archiveThread(thread)}
        onOpenWorkspace={() => void openWorkspace()}
        onOpenTools={openTools}
        onSignIn={() => void signIn()}
        onLogout={() => void logout()}
      />

      <main className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <div className="task-title"><span>{titleForThread(activeThread)}</span></div>
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
                <option value="untrusted">Trusted only</option>
                <option value="never">Never ask</option>
              </select>
              <ChevronDown size={13} />
            </label>
          </div>
          <nav className="surface-switcher" aria-label="Lodex mode">
            {(["chat", "work", "build"] as SurfaceMode[]).map((surface) => (
              <button className={surfaceMode === surface ? "active" : ""} onClick={() => switchSurface(surface)} key={surface}>{surface[0].toUpperCase()}{surface.slice(1)}</button>
            ))}
          </nav>
          <div className="topbar-controls">
            <span className={`runtime-dot ${runtimeState}`} title={`Codex runtime: ${runtimeState}`} />
            <button className={`topbar-action ${activityVisible ? "active" : ""}`} onClick={() => {
              setActivityVisible((value) => !value);
              setToolsVisible(false);
              setWorkspaceVisible(false);
            }} title="Activity"><Activity size={16} /><span>Activity</span></button>
            <button className={`topbar-action ${activeThread?.isPinned ? "active" : ""}`} onClick={() => activeThread && void pinThread(activeThread)} disabled={!activeThread} title={activeThread?.isPinned ? "Unpin chat" : "Pin chat"}>
              {activeThread?.isPinned ? <PinOff size={16} /> : <Pin size={16} />}<span>Pin</span>
            </button>
            <button className={`icon-button ${goal ? "active" : ""}`} onClick={() => setGoalDialogVisible(true)} disabled={!activeThread} title="Goal"><GoalIcon size={17} /></button>
            {surfaceMode === "build" && <button className={`icon-button ${terminalVisible ? "active" : ""}`} onClick={() => setTerminalVisible((value) => !value)} title="Terminal"><TerminalSquare size={17} /></button>}
            {surfaceMode === "build" && <button className={`icon-button ${workspaceVisible ? "active" : ""}`} onClick={() => {
              setWorkspaceVisible((value) => !value);
              setActivityVisible(false);
              setToolsVisible(false);
            }} title="Workspace"><PanelRight size={17} /></button>}
          </div>
        </header>

        <div className="conversation-area">
          {empty ? (
            <div className="welcome">
              <div className="welcome-mark">L</div>
              <h1>{accountState.account ? welcomeTitle : "Your AI workspace for Linux"}</h1>
              <p>{accountState.account ? welcomeCopy : "Use your ChatGPT account with native chat, long-running work, project tools, images, Git, and a terminal."}</p>
              {!accountState.account && accountState.requiresOpenaiAuth ? (
                <button className="signin-button" onClick={() => void signIn()}><LogIn size={18} />Sign in with ChatGPT</button>
              ) : (
                <div className="suggestion-grid">
                  {surfaceMode === "chat" ? (
                    <>
                      <button onClick={() => void send("Help me think through the most important decision I need to make today.", [])}><Sparkles size={18} /><span>Think through a decision</span></button>
                      <button onClick={openTools}><Blocks size={18} /><span>Explore apps and skills</span></button>
                      <button onClick={() => switchSurface("work")}><GoalIcon size={18} /><span>Start substantial work</span></button>
                    </>
                  ) : surfaceMode === "work" ? (
                    <>
                      <button onClick={() => void send("Help me turn this goal into a clear plan with milestones and completion criteria.", [])}><GoalIcon size={18} /><span>Plan a goal</span></button>
                      <button onClick={openTools}><Blocks size={18} /><span>Use apps and skills</span></button>
                      <button onClick={() => void openWorkspace()}><FolderOpen size={18} /><span>Add project context</span></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => void send("Explain the architecture of this project and identify the most important files.", [])}><Blocks size={18} /><span>Understand this project</span></button>
                      <button onClick={() => void send("Review the current Git changes for correctness, regressions, and missing tests.", [])}><GitCompareArrows size={18} /><span>Review Git changes</span></button>
                      <button onClick={() => void openWorkspace()}><FolderOpen size={18} /><span>Open another project</span></button>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <MessageList items={items} loading={loadingThread} running={running} />
          )}
          <Composer disabled={runtimeState === "error" || loadingThread} running={running} workspace={surfaceMode === "chat" ? null : workspace} onSend={send} onStop={stop} onOpenTools={openTools} />
        </div>

        {terminalVisible && <TerminalPanel workspace={workspace} onClose={() => setTerminalVisible(false)} />}
      </main>

      <ActivityPanel
        visible={activityVisible}
        running={running}
        items={items}
        plan={plan}
        goal={goal}
        tokenUsage={tokenUsage}
        onClose={() => setActivityVisible(false)}
        onEditGoal={() => activeThread && setGoalDialogVisible(true)}
        onCompact={() => void compactThread()}
      />

      <ToolsPanel visible={toolsVisible} loading={toolsLoading} apps={apps} skills={skills} onClose={() => setToolsVisible(false)} onRefresh={() => void refreshTools()} />

      <WorkspacePanel
        visible={workspaceVisible && surfaceMode === "build"}
        workspace={workspace}
        tree={tree}
        git={git}
        turnDiff={turnDiff}
        onClose={() => setWorkspaceVisible(false)}
        onOpenWorkspace={() => void openWorkspace()}
        onRefresh={refreshWorkspace}
      />

      {goalDialogVisible && activeThread && <GoalDialog goal={goal} onCancel={() => setGoalDialogVisible(false)} onSave={saveGoal} onClear={clearGoal} />}

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
