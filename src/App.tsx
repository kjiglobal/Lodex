import {
  Activity,
  Blocks,
  FolderOpen,
  GitCompareArrows,
  Goal as GoalIcon,
  LogIn,
  PanelRight,
  Pin,
  PinOff,
  Sparkles,
  TerminalSquare,
  Download,
  GitBranch,
  Settings,
  X,
  MoreHorizontal,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ApprovalDialog } from "./components/ApprovalDialog";
import { ActivityPanel } from "./components/ActivityPanel";
import { Composer } from "./components/Composer";
import { GoalDialog } from "./components/GoalDialog";
import { MessageList } from "./components/MessageList";
import { Sidebar } from "./components/Sidebar";
import { TerminalPanel } from "./components/TerminalPanel";
import { ToolsPanel } from "./components/ToolsPanel";
import { SettingsDialog } from "./components/SettingsDialog";
import { storage } from "./storage";
import { normalizeItem } from "./protocol";
const WorkspacePanel = lazy(() => import("./components/WorkspacePanel").then(module => ({ default: module.WorkspacePanel })));
import type {
  AccessMode,
  AccountUsage,
  AccountState,
  Attachment,
  ChatApp,
  CodexEvent,
  FileNode,
  GitStatus,
  Model,
  PendingServerRequest,
  PlanStep,
  RateLimits,
  Skill,
  SurfaceMode,
  Thread,
  ThreadGoal,
  ThreadItem,
  UserInput,
} from "./types";

const serverRequestMethods = new Set([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
  "item/tool/requestUserInput",
  "mcpServer/elicitation/request",
]);

const flattenItems = (thread: Thread) => (thread.turns?.flatMap((turn) => turn.items || []) || []).map(normalizeItem).filter((item): item is ThreadItem => !!item);

const titleForThread = (thread: Thread | null) => thread?.name?.trim() || thread?.preview?.trim() || "New chat";

const windowSlot = new URLSearchParams(window.location.search).get("window");
const activeStorageKey = !windowSlot || windowSlot === "primary" ? "lodex-active-thread" : "lodex-active-thread-" + windowSlot;
const newDraftKey = !windowSlot || windowSlot === "primary" ? "new" : "new-window-" + windowSlot;
const pinnedStorageKey = "lodex-pinned-threads";

const readPinnedThreadIds = () => {
  try {
    const stored = JSON.parse(storage.get(pinnedStorageKey) || "[]") as unknown;
    return new Set(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
};

const withLocalPins = (threads: Thread[]) => {
  const pinned = readPinnedThreadIds();
  return threads.map((thread) => ({ ...thread, isPinned: pinned.has(thread.id) }));
};

const initialTheme = (): "light" | "dark" => {
  const stored = storage.get("lodex-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export default function App() {
  const [accountState, setAccountState] = useState<AccountState>({ account: null, requiresOpenaiAuth: true });
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [effort, setEffort] = useState("");
  const [approvalPolicy, setApprovalPolicy] = useState("on-request");
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>(() => {
    const saved = storage.get("lodex-mode") || storage.get("lodex-surface");
    return saved === "work" || saved === "build" ? saved : "chat";
  });
  const [draftKey, setDraftKey] = useState(() => storage.get(activeStorageKey) || newDraftKey);
  const [temporary, setTemporary] = useState(false);
  const [accessOverride, setAccessOverride] = useState<AccessMode | null>(null);
  const access: AccessMode = accessOverride || (surfaceMode === "chat" ? "read-only" : "workspace-write");
  const [projects, setProjects] = useState<string[]>([]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [instructions, setInstructions] = useState(() => storage.get("lodex-instructions") || "");
  const [archivedVisible, setArchivedVisible] = useState(false);
  const [archivedThreads, setArchivedThreads] = useState<Thread[]>([]);
  const [editingItem, setEditingItem] = useState<ThreadItem | null>(null);
  const [editedText, setEditedText] = useState("");
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
  const sendLock = useRef(false);
  const threadOpenVersion = useRef(0);

  useEffect(() => {
    activeThreadId.current = activeThread?.id || null;
  }, [activeThread]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storage.set("lodex-theme", theme);
  }, [theme]);
  useEffect(() => { storage.set("lodex-mode", surfaceMode); }, [surfaceMode]);

  const upsertItem = useCallback((nextItem: ThreadItem) => {
    const safeItem = normalizeItem(nextItem);
    if (!safeItem) return;
    setItems((current) => {
      const index = current.findIndex((item) => item.id === nextItem.id);
      if (index < 0) return [...current, safeItem];
      const copy = [...current];
      copy[index] = safeItem;
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
    const defaultModel = availableModels.find((model) => model.isDefault) || availableModels[0];
    const preferred = availableModels.find(model => model.id === storage.get("lodex-model")) || defaultModel;
    setSelectedModel(preferred?.id || preferred?.model || "");
    setEffort(preferred?.defaultReasoningEffort || preferred?.supportedReasoningEfforts?.[0]?.reasoningEffort || "");
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
    setProjects(await window.lodex.workspace.projects());
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
    let cancelled = false;
    const load = async () => {
      try {
        const [accountResult, modelResult] = await Promise.all([
          window.lodex.codex.request<AccountState>("account/read", { refreshToken: false }),
          window.lodex.codex.request<{ data: Model[] }>("model/list", { limit: 50, includeHidden: false }),
        ]);
        if (cancelled) return;
        setAccountState(accountResult);
        const availableModels = modelResult.data || [];
        setModels(availableModels);
        const defaultModel = availableModels.find(model => model.id === storage.get("lodex-model")) || availableModels.find((model) => model.isDefault) || availableModels[0];
        if (defaultModel) {
          setSelectedModel(defaultModel.id || defaultModel.model);
          setEffort(defaultModel.defaultReasoningEffort || defaultModel.supportedReasoningEfforts?.[0]?.reasoningEffort || "");
        }
        await Promise.all([refreshThreads(), refreshWorkspace()]);
        if (cancelled) return;
        const savedThread = storage.get(activeStorageKey);
        if (savedThread) {
          try {
            const resumed = await window.lodex.codex.request<{ thread: Thread }>("thread/resume", { threadId: savedThread });
            if (cancelled) return;
            activeThreadId.current = resumed.thread.id;
            setActiveThread(resumed.thread);
            setItems(flattenItems(resumed.thread));
            const activeTurn = resumed.thread.turns?.find(turn => turn.status === "inProgress");
            setRunning(!!activeTurn || resumed.thread.status?.type === "active");
            setActiveTurnId(activeTurn?.id || null);
            void refreshGoal(savedThread);
          } catch { storage.remove(activeStorageKey); setDraftKey(newDraftKey); setError("The previous chat could not be reopened. You can find it in your chat history."); }
        }
        const pending = await window.lodex.codex.pendingRequests();
        if (cancelled) return;
        setRequests(current => [...current, ...pending.filter(request => serverRequestMethods.has(request.method) && !current.some(entry => entry.id === request.id))]);
        if (accountResult.account) void refreshAccountInsights();
        setRuntimeState("ready");
      } catch (loadError) {
        if (!cancelled) { setRuntimeState("error"); setError(loadError instanceof Error ? loadError.message : "Unable to start Lodex."); }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [refreshAccountInsights, refreshThreads, refreshWorkspace, refreshGoal]);

  useEffect(() => {
    // Flush chunks together so a fast stream doesn't rerender the transcript
    // once per token. Flush before completed items to preserve event order.
    const deltas = new Map<string, { text: string; output: string }>();
    const flush = () => {
      if (!deltas.size) return;
      const pending = new Map(deltas);
      deltas.clear();
      setItems(current => {
        const result = [...current];
        for (const [id, delta] of pending) {
          const index = result.findIndex(item => item.id === id);
          if (index < 0) {
            if (delta.text) result.push({ id, type: "agentMessage", text: delta.text, phase: "final_answer" });
          } else {
            result[index] = { ...result[index], ...(delta.text ? { text: `${result[index].text || ""}${delta.text}` } : {}), ...(delta.output ? { aggregatedOutput: `${result[index].aggregatedOutput || ""}${delta.output}`.slice(-64_000) } : {}) };
          }
        }
        return result;
      });
    };
    const timer = window.setInterval(flush, 50);
    const unsubscribeStatus = window.lodex.codex.onStatus((status) => {
      if (status.state !== "log") setRuntimeState(status.state);
      if (status.state === "error") { setError(status.message || "Codex runtime stopped."); setRunning(false); setActiveTurnId(null); setRequests([]); }
    });

    const unsubscribeEvents = window.lodex.codex.onEvent((event: CodexEvent) => {
      const method = event.method || "";
      const params = event.params || {};

      if (method === "serverRequest/resolved") {
        setRequests(current => current.filter(request => request.id !== params.requestId));
        return;
      }

      if (event.id !== undefined && serverRequestMethods.has(method)) {
        setRequests((current) => current.some(request => request.id === event.id) ? current : [...current, { id: event.id!, method, params }]);
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

      if (method === "thread/name/updated" || method === "thread/archived" || method === "thread/unarchived") {
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
        flush();
        const item = params.item as ThreadItem | undefined;
        if (item?.id) upsertItem(item);
      } else if (method === "item/agentMessage/delta") {
        const itemId = String(params.itemId || "streaming-agent-message");
        const delta = String(params.delta || "");
        const pending = deltas.get(itemId) || { text: "", output: "" };
        pending.text += delta;
        deltas.set(itemId, pending);
      } else if (method === "item/commandExecution/outputDelta") {
        const itemId = String(params.itemId || "");
        const delta = String(params.delta || "");
        const pending = deltas.get(itemId) || { text: "", output: "" };
        pending.output = `${pending.output}${delta}`.slice(-64_000);
        deltas.set(itemId, pending);
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
        flush();
        setRunning(false);
        setActiveTurnId(null);
        void Promise.all([refreshThreads(), refreshWorkspace()]).catch(() => undefined);
        const turn = params.turn as { error?: { message?: string } } | undefined;
        if (turn?.error?.message) setError(turn.error.message);
      } else if (method === "error") {
        const details = params.error as { message?: string } | undefined;
        setError(details?.message || "The current turn failed.");
      }
    });

    return () => {
      unsubscribeStatus();
      unsubscribeEvents();
      window.clearInterval(timer);
      deltas.clear();
    };
  }, [refreshAccount, refreshAccountInsights, refreshModels, refreshThreads, refreshWorkspace, upsertItem]);

  const openWorkspace = async (project?: string) => {
    if (running || sendLock.current) return;
    try {
      const selected = project ? await window.lodex.workspace.select(project) : await window.lodex.workspace.choose();
      if (!selected) return;
      newTask();
      setWorkspace(selected);
      setSurfaceMode("build");
      setWorkspaceVisible(true);
      await refreshWorkspace();
    } catch (workspaceError) {
      setError(workspaceError instanceof Error ? workspaceError.message : "Unable to open that project.");
    }
  };

  const openThread = async (thread: Thread) => {
    if (running || sendLock.current) return;
    leaveTemporary();
    setTemporary(false);
    setAccessOverride(null);
    const version = ++threadOpenVersion.current;
    setLoadingThread(true);
    setItems([]);
    setTurnDiff("");
    setPlan([]);
    setGoal(null);
    setTokenUsage(null);
    setActiveThread(thread);
    activeThreadId.current = thread.id;
    try {
      const result = await window.lodex.codex.request<{ thread: Thread }>("thread/resume", { threadId: thread.id });
      if (version !== threadOpenVersion.current) return;
      setActiveThread({ ...result.thread, isPinned: readPinnedThreadIds().has(result.thread.id) });
      storage.set(activeStorageKey, result.thread.id);
      const mode = storage.get(`lodex-thread-mode-${result.thread.id}`);
      if (mode === "chat" || mode === "work" || mode === "build") setSurfaceMode(mode);
      setDraftKey(result.thread.id);
      setItems(flattenItems(result.thread));
      const activeTurn = result.thread.turns?.find(turn => turn.status === "inProgress");
      setRunning(!!activeTurn || result.thread.status?.type === "active");
      setActiveTurnId(activeTurn?.id || null);
      await refreshGoal(thread.id);
    } catch (threadError) {
      if (version === threadOpenVersion.current) { setActiveThread(null); activeThreadId.current = null; setError(threadError instanceof Error ? threadError.message : "Unable to open that task."); }
    } finally {
      if (version === threadOpenVersion.current) setLoadingThread(false);
    }
  };

  const leaveTemporary = () => {
    if (!temporary) return;
    if (activeThread) void window.lodex.codex.request("thread/unsubscribe", { threadId: activeThread.id }).catch(() => undefined);
    void window.lodex.workspace.clearTemporary().catch(() => undefined);
  };

  const newTask = (isTemporary = false) => {
    if (running || sendLock.current) return;
    leaveTemporary();
    setTemporary(isTemporary);
    setAccessOverride(null);
    threadOpenVersion.current++;
    setLoadingThread(false);
    setDraftKey(isTemporary ? "temporary-" + crypto.randomUUID() : newDraftKey);
    storage.remove(activeStorageKey);
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
    if (running || sendLock.current) return;
    setSurfaceMode(surface);
    if (surface !== "build") {
      setWorkspaceVisible(false);
      setTerminalVisible(false);
    }
    if (surface === "build" && workspace) setWorkspaceVisible(true);
    newTask();
  };

  const send = async (text: string, attachments: Attachment[]) => {
    if (running || loadingThread || sendLock.current) throw new Error("Wait for this response to finish, or press Stop.");
    if (!accountState.account && accountState.requiresOpenaiAuth) {
      await signIn();
      throw new Error("Finish signing in, then send your message again.");
    }

    sendLock.current = true;
    setRunning(true);
    try {
      const attachedInputs = await window.lodex.workspace.attachmentInputs(attachments);
      let thread = activeThread;
      if (!thread) {
        const result = await window.lodex.codex.request<{ thread: Thread }>("thread/start", {
          model: selectedModel || undefined,
          approvalPolicy: access === "full-access" ? "never" : approvalPolicy,
          surface: surfaceMode,
          accessMode: access,
          ephemeral: temporary,
          personality: "friendly",
          serviceName: "lodex",
          developerInstructions: instructions || undefined,
        });
        thread = result.thread;
        setActiveThread(thread);
        activeThreadId.current = thread.id;
        if (!temporary) storage.set(activeStorageKey, thread.id);
        const draft = storage.get(`lodex-draft-${draftKey}`);
        if (draft && !temporary) storage.set(`lodex-draft-${thread.id}`, draft);
        if (!temporary) storage.set(`lodex-thread-mode-${thread.id}`, surfaceMode);
      }

      const input = [
        ...(text ? [{ type: "text", text, text_elements: [] }] : []),
        ...attachedInputs,
      ];
      setRunning(true);
      const result = await window.lodex.codex.request<{ turn: { id: string } }>("turn/start", {
        threadId: thread.id,
        input,
        surface: surfaceMode,
        approvalPolicy: access === "full-access" ? "never" : approvalPolicy,
        accessMode: access,
        model: selectedModel || undefined,
        effort: effort || undefined,
        personality: "friendly",
      });
      setActiveTurnId(result.turn.id);
      storage.remove(`lodex-draft-${thread.id}`);
      // Move subsequent drafts to the durable chat after the current composer
      // has acknowledged and cleared the submitted draft.
      if (!temporary) window.setTimeout(() => setDraftKey(thread!.id), 0);
    } catch (sendError) {
      setRunning(false);
      setError(sendError instanceof Error ? sendError.message : "Unable to send the message.");
      throw sendError;
    } finally {
      sendLock.current = false;
    }
  };

  const stop = () => {
    if (!activeThread?.id || !activeTurnId) return;
    void window.lodex.codex.request("turn/interrupt", { threadId: activeThread.id, turnId: activeTurnId }).catch(error => setError(String(error)));
  };

  const signIn = async () => {
    try {
      await window.lodex.auth.loginWithChatGPT();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to start ChatGPT sign-in.");
    }
  };

  const logout = async () => {
    if (running || sendLock.current) { setError("Stop the response before logging out."); return; }
    try {
      await window.lodex.auth.logout();
      newTask();
      await refreshAccount();
      setRateLimits(null);
      setAccountUsage(null);
    } catch (error) { setError(String(error)); }
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
    storage.set(pinnedStorageKey, JSON.stringify([...pinned]));
    setThreads((current) => current.map((entry) => entry.id === thread.id ? { ...entry, isPinned } : entry));
    if (activeThread?.id === thread.id) setActiveThread((current) => current ? { ...current, isPinned } : current);
  };

  const archiveThread = async (thread: Thread) => {
    if (thread.status?.type === "active" || (thread.id === activeThread?.id && running)) { setError("Stop this chat before archiving it."); return; }
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

  const openArchived = async () => {
    setArchivedVisible(true);
    try {
      const result = await window.lodex.codex.request<{ data: Thread[] }>("thread/list", { archived: true, limit: 100, sortKey: "updated_at", sortDirection: "desc" });
      setArchivedThreads(result.data || []);
    } catch (failure) { setError(String(failure)); }
  };

  const restoreThread = async (thread: Thread) => {
    try {
      await window.lodex.codex.request("thread/unarchive", { threadId: thread.id });
      setArchivedThreads(current => current.filter(entry => entry.id !== thread.id));
      await refreshThreads();
    } catch (failure) { setError(String(failure)); }
  };

  const exportChat = async () => {
    const content = items.filter(item => ["agentMessage", "userMessage"].includes(item.type)).map(item => {
      const text = item.type === "agentMessage" ? item.text || "" : (item.content as UserInput[] || []).map(input => input.type === "text" ? input.text : "name" in input ? `[Attachment: ${input.name}]` : "[Image]").join("\n\n");
      return `## ${item.type === "userMessage" ? "You" : "Lodex"}\n\n${text}`;
    }).join("\n\n---\n\n");
    try { await window.lodex.app.exportChat(titleForThread(activeThread), `# ${titleForThread(activeThread)}\n\n${content}\n`); }
    catch (failure) { setError(String(failure)); }
  };

  const branchChat = async (targetItem?: ThreadItem, replacement?: string) => {
    if (!activeThread || running || sendLock.current || temporary) return;
    sendLock.current = true;
    setLoadingThread(true);
    try {
      const source = await window.lodex.codex.request<{ thread: Thread }>("thread/read", { threadId: activeThread.id, includeTurns: true });
      const turns = source.thread.turns || [];
      const index = targetItem ? turns.findIndex(turn => turn.items.some(item => item.id === targetItem.id)) : -1;
      if (targetItem && index < 0) throw new Error("This message is not yet saved. Try again when the response finishes.");
      const startFresh = targetItem && index === 0;
      const result = await window.lodex.codex.request<{ thread: Thread }>(startFresh ? "thread/start" : "thread/fork", {
        ...(startFresh ? { restartFromThreadId: activeThread.id } : { threadId: activeThread.id, ...(targetItem ? { lastTurnId: turns[index - 1].id } : {}) }),
        model: selectedModel || undefined, surface: surfaceMode, approvalPolicy: access === "full-access" ? "never" : approvalPolicy, accessMode: access,
        ...(startFresh ? { developerInstructions: instructions || undefined } : {}),
      });
      const next = result.thread;
      activeThreadId.current = next.id;
      setActiveThread(next);
      setItems(flattenItems(next));
      setDraftKey(next.id);
      storage.set(activeStorageKey, next.id);
      storage.set(`lodex-thread-mode-${next.id}`, surfaceMode);
      setPlan([]); setGoal(null); setTurnDiff(""); setTokenUsage(null);
      setEditingItem(null);
      if (targetItem) {
        const original = turns[index].items.find(item => item.type === "userMessage");
        const originalInput = Array.isArray(original?.content) ? original.content as UserInput[] : [];
        const input = replacement !== undefined ? [{ type: "text", text: replacement, text_elements: [] }, ...originalInput.filter(entry => entry.type !== "text")] : originalInput;
        if (!input.length) throw new Error("There is no prompt to retry in this turn.");
        setRunning(true);
        const response = await window.lodex.codex.request<{ turn: { id: string } }>("turn/start", { threadId: next.id, input, model: selectedModel || undefined, effort: effort || undefined, surface: surfaceMode, approvalPolicy: access === "full-access" ? "never" : approvalPolicy, accessMode: access });
        setActiveTurnId(response.turn.id);
      }
      await refreshThreads();
    } catch (failure) { setRunning(false); setError(String(failure)); }
    finally { sendLock.current = false; setLoadingThread(false); }
  };

  const editMessage = useCallback((item: ThreadItem) => {
    setEditingItem(item);
    setEditedText((item.content as UserInput[] || []).filter(input => input.type === "text").map(input => input.type === "text" ? input.text : "").join("\n"));
  }, []);

  const regenerate = () => {
    const last = [...items].reverse().find(item => item.type === "userMessage");
    if (last) void branchChat(last);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "o") { event.preventDefault(); void openWorkspace(); }
      if (event.key.toLowerCase() === "n") { event.preventDefault(); if (event.altKey) switchSurface("chat"); else newTask(event.shiftKey); }
      if (event.key.toLowerCase() === "b") { event.preventDefault(); setSidebarCollapsed(value => !value); }
      if (event.key.toLowerCase() === "k") { event.preventDefault(); setSidebarCollapsed(false); window.setTimeout(() => document.querySelector<HTMLInputElement>(".sidebar-search-field input")?.focus(), 0); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => window.lodex.app.onMenu(action => {
    if (action === "new-chat") { switchSurface("chat"); }
    if (action === "temporary-chat" && !running && !sendLock.current) { setSurfaceMode("chat"); newTask(true); }
    if (action === "open-folder") void openWorkspace();
    if (action === "logout") void logout();
    if (action === "settings") setSettingsVisible(true);
    if (action === "diagnostics") void window.lodex.app.openDiagnostics().catch(() => setError("Unable to open diagnostics."));
  }));

  const selectModel = (modelId: string) => {
    setSelectedModel(modelId); storage.set("lodex-model", modelId);
    const model = models.find(candidate => candidate.id === modelId);
    setEffort(model?.defaultReasoningEffort || model?.supportedReasoningEfforts?.[0]?.reasoningEffort || "");
  };
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
        projects={projects}
        onProject={project => void openWorkspace(project)}
        rateLimits={rateLimits}
        accountUsage={accountUsage}
        collapsed={sidebarCollapsed}
        theme={theme}
        surfaceMode={surfaceMode}
        onSwitchSurface={switchSurface}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        onToggleTheme={() => setTheme((value) => value === "light" ? "dark" : "light")}
        onNew={() => newTask()}
        onSelect={(thread) => void openThread(thread)}
        onRename={(thread, name) => void renameThread(thread, name)}
        onPin={(thread) => void pinThread(thread)}
        onArchive={(thread) => void archiveThread(thread)}
        onOpenWorkspace={() => void openWorkspace()}
        onOpenTools={openTools}
        onSignIn={() => void signIn()}
        onLogout={() => void logout()}
        onSettings={() => setSettingsVisible(true)}
        onArchived={() => void openArchived()}
        busy={running || loadingThread}
      />

      <main className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <div className="task-title"><span>{titleForThread(activeThread)}</span></div>

          </div>
          {surfaceMode === "build" ? (
            <div className="product-heading"><Blocks size={15} /><span>Codex</span></div>
          ) : (
            <nav className="surface-switcher" aria-label="ChatGPT mode">
              {(["chat", "work"] as SurfaceMode[]).map((surface) => (
                <button disabled={running || loadingThread} className={surfaceMode === surface ? "active" : ""} onClick={() => switchSurface(surface)} key={surface}>{surface[0].toUpperCase()}{surface.slice(1)}</button>
              ))}
            </nav>
          )}
          <div className="topbar-controls">
            <span className={`runtime-dot ${runtimeState}`} title={`Codex runtime: ${runtimeState}`} />
            {activeThread && !temporary && <details className="chat-options"><summary className="icon-button" title="Chat options"><MoreHorizontal size={20} /></summary><div className="chat-options-menu">
              <button title="Export chat" disabled={!items.length || running} onClick={() => void exportChat()}><Download size={16} />Export chat</button>
              <button title="Branch chat" disabled={running || loadingThread} onClick={() => void branchChat()}><GitBranch size={16} />Branch chat</button>
              <button onClick={() => void pinThread(activeThread)}><Pin size={16} />{activeThread.isPinned ? "Unpin chat" : "Pin chat"}</button>
              <button onClick={() => setGoalDialogVisible(true)}><GoalIcon size={16} />Set a goal</button>
            </div></details>}
            <button className="icon-button" title="Settings" onClick={() => setSettingsVisible(true)}><Settings size={17} /></button>
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

        {runtimeState === "error" && <div className="connection-banner" role="status">Lodex lost its connection. Your draft is saved.<button onClick={() => window.location.reload()}>Reconnect</button></div>}
        {temporary && <div className="temporary-banner">Temporary chat · Not saved in history. Closes when you leave this chat.</div>}
        {activeThread && <div className="conversation-title">{titleForThread(activeThread)}</div>}
        <div className={`conversation-area ${empty ? "empty-conversation" : ""}`}>
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
                      <button onClick={() => void send("Help me think through the most important decision I need to make today.", []).catch(() => undefined)}><Sparkles size={18} /><span>Think through a decision</span></button>
                      <button onClick={openTools}><Blocks size={18} /><span>Explore apps and skills</span></button>
                      <button onClick={() => switchSurface("work")}><GoalIcon size={18} /><span>Start substantial work</span></button>
                    </>
                  ) : surfaceMode === "work" ? (
                    <>
                      <button onClick={() => void send("Help me turn this goal into a clear plan with milestones and completion criteria.", []).catch(() => undefined)}><GoalIcon size={18} /><span>Plan a goal</span></button>
                      <button onClick={openTools}><Blocks size={18} /><span>Use apps and skills</span></button>
                      <button onClick={() => void openWorkspace()}><FolderOpen size={18} /><span>Add project context</span></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => void send("Explain the architecture of this project and identify the most important files.", []).catch(() => undefined)}><Blocks size={18} /><span>Understand this project</span></button>
                      <button onClick={() => void send("Review the current Git changes for correctness, regressions, and missing tests.", []).catch(() => undefined)}><GitCompareArrows size={18} /><span>Review Git changes</span></button>
                      <button onClick={() => void openWorkspace()}><FolderOpen size={18} /><span>Open another project</span></button>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <MessageList key={activeThread?.id || "new"} items={items} loading={loadingThread} running={running} onEdit={editMessage} onRegenerate={regenerate} />
          )}
          <Composer key={draftKey} draftKey={draftKey} temporary={temporary} options={{ models, selectedModel, effort, access, onModel: selectModel, onEffort: setEffort, onAccess: setAccessOverride }} surfaceMode={surfaceMode} disabled={runtimeState !== "ready" || loadingThread} running={running} workspace={surfaceMode === "chat" ? null : workspace} onSend={send} onStop={stop} onOpenTools={openTools} />
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

      {workspaceVisible && surfaceMode === "build" && <Suspense fallback={<aside className="workspace-panel"><div className="conversation-state">Opening project tools…</div></aside>}><WorkspacePanel
        visible={workspaceVisible && surfaceMode === "build"}
        workspace={workspace}
        tree={tree}
        git={git}
        turnDiff={turnDiff}
        onClose={() => setWorkspaceVisible(false)}
        onOpenWorkspace={() => void openWorkspace()}
        onRefresh={refreshWorkspace}
      /></Suspense>}

      {settingsVisible && <SettingsDialog theme={theme} onTheme={setTheme} approvalPolicy={approvalPolicy} onApproval={setApprovalPolicy} instructions={instructions} onInstructions={value => { setInstructions(value); storage.set("lodex-instructions", value); }} onArchived={() => { setSettingsVisible(false); void openArchived(); }} onClose={() => setSettingsVisible(false)} />}

      {archivedVisible && <div className="modal-backdrop"><section className="settings-dialog" role="dialog" aria-modal="true" aria-label="Archived chats"><header><h2>Archived chats</h2><button className="icon-button" title="Close archived chats" onClick={() => setArchivedVisible(false)}><X size={20} /></button></header>{archivedThreads.map(thread => <div className="settings-row" key={thread.id}><span>{titleForThread(thread)}</span><button className="secondary-button" onClick={() => void restoreThread(thread)}>Restore</button></div>)}{!archivedThreads.length && <p className="drawer-empty">No archived chats.</p>}</section></div>}

      {editingItem && <div className="modal-backdrop"><form className="settings-dialog" role="dialog" aria-modal="true" aria-label="Edit message" onSubmit={event => { event.preventDefault(); if (editedText.trim()) void branchChat(editingItem, editedText.trim()); }}><header><h2>Edit message</h2><button type="button" className="icon-button" title="Cancel edit" onClick={() => setEditingItem(null)}><X size={20} /></button></header><p className="drawer-empty">This starts a new branch. Your original conversation and project files are kept.</p><textarea autoFocus aria-label="Edited message" rows={6} value={editedText} onChange={event => setEditedText(event.target.value)} /><div className="dialog-actions"><span /><button type="button" className="secondary-button" onClick={() => setEditingItem(null)}>Cancel</button><button type="submit" className="primary-button" disabled={!editedText.trim() || loadingThread}>Send in new branch</button></div></form></div>}

      {goalDialogVisible && activeThread && <GoalDialog goal={goal} onCancel={() => setGoalDialogVisible(false)} onSave={saveGoal} onClear={clearGoal} />}

      {!!requests.length && (
        <ApprovalDialog
          key={requests[0].id}
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
