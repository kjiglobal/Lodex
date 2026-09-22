import type { UpdateState } from "../electron/update-types";
export type { UpdateState } from "../electron/update-types";

export type Account = {
  type: string;
  email?: string | null;
  planType?: string | null;
};

export type AccountState = {
  account: Account | null;
  requiresOpenaiAuth: boolean;
};

export type Model = {
  id: string;
  model: string;
  displayName: string;
  description?: string;
  isDefault?: boolean;
  defaultReasoningEffort?: string;
  supportedReasoningEfforts?: Array<{ reasoningEffort: string; description: string }>;
  inputModalities?: string[];
};

export type UserInput =
  | { type: "text"; text: string; text_elements?: unknown[] }
  | { type: "image"; url: string; detail?: string }
  | { type: "localImage"; path: string; detail?: string }
  | { type: "mention" | "skill"; name: string; path: string };

export type ThreadItem = {
  id: string;
  type: string;
  text?: string;
  phase?: "commentary" | "final_answer" | null;
  content?: UserInput[] | string[];
  summary?: string[];
  command?: string;
  cwd?: string;
  status?: string;
  aggregatedOutput?: string | null;
  exitCode?: number | null;
  changes?: Array<{ path: string; kind: string | { type: string; move_path?: string | null }; diff?: string }>;
  server?: string;
  tool?: string;
  arguments?: unknown;
  result?: unknown;
  error?: unknown;
  query?: string;
  path?: string;
  savedPath?: string;
  revisedPrompt?: string | null;
  [key: string]: unknown;
};

export type Turn = {
  id: string;
  status: string;
  items: ThreadItem[];
};

export type Thread = {
  id: string;
  name?: string | null;
  preview: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
  status?: ThreadStatus;
  turns?: Turn[];
};

export type ThreadStatus = {
  type: "notLoaded" | "idle" | "active" | "systemError" | string;
  activeFlags?: string[];
  message?: string | null;
};

export type PlanStep = {
  step: string;
  status: "pending" | "inProgress" | "completed";
};

export type ThreadGoal = {
  threadId: string;
  objective: string;
  status: "active" | "complete" | "blocked" | string;
  tokenBudget?: number | null;
  tokensUsed?: number | null;
  timeUsedSeconds?: number | null;
};

export type RateLimitWindow = {
  usedPercent: number;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
};

export type RateLimits = {
  limitId?: string | null;
  limitName?: string | null;
  planType?: string | null;
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
  rateLimitReachedType?: string | null;
};

export type AccountUsage = {
  summary?: {
    lifetimeTokens?: number | null;
    peakDailyTokens?: number | null;
    longestRunningTurnSec?: number | null;
    currentStreakDays?: number | null;
    longestStreakDays?: number | null;
  } | null;
  dailyUsageBuckets?: Array<{ startDate: string; tokens: number }> | null;
};

export type Skill = {
  name: string;
  description?: string;
  path: string;
  enabled: boolean;
  interface?: {
    displayName?: string;
    shortDescription?: string;
  } | null;
};

export type ChatApp = {
  id: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  logoUrlDark?: string | null;
  installUrl?: string | null;
  isAccessible: boolean;
  isEnabled: boolean;
};

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
};

export type GitFile = {
  path: string;
  index: string;
  workingTree: string;
};

export type GitStatus = {
  branch: string;
  files: GitFile[];
  isRepository: boolean;
};

export type AttachedImage = { path: string; name: string };
export type Attachment = AttachedImage & { kind: "image" | "file"; size?: number };

export type SurfaceMode = "chat" | "work" | "build";
export type AccessMode = "read-only" | "workspace-write" | "full-access";

export type CodexEvent = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
};

export type PendingServerRequest = {
  id: number | string;
  method: string;
  params: Record<string, unknown>;
};

export type LodexApi = {
  platform: string;
  updates: {
    state(): Promise<UpdateState>;
    check(): Promise<UpdateState>;
    download(): Promise<UpdateState>;
    cancel(): Promise<UpdateState>;
    install(): Promise<UpdateState>;
    openRelease(): Promise<void>;
    restart(): Promise<void>;
    onChange(callback: (state: UpdateState) => void): () => void;
  };
  app: {
    onMenu(callback: (action: string) => void): () => void;
    reportError(category: string): void;
    openDiagnostics(): Promise<void>;
    exportChat(title: string, content: string): Promise<boolean>;
    info(): Promise<{ version: string; softwareRendering: boolean }>;
  };
  codex: {
    request<T = unknown>(method: string, params?: unknown): Promise<T>;
    respond(id: number | string, result: unknown): void;
    onEvent(callback: (message: CodexEvent) => void): () => void;
    onStatus(callback: (status: { state: string; message?: string }) => void): () => void;
    pendingRequests(): Promise<PendingServerRequest[]>;
  };
  auth: {
    loginWithChatGPT(): Promise<unknown>;
    logout(): Promise<unknown>;
  };
  workspace: {
    projects(): Promise<string[]>;
    select(value: string): Promise<string>;
    pasteImage(bytes: Uint8Array, temporary: boolean): Promise<Attachment>;
    clearTemporary(): Promise<void>;
    current(): Promise<string | null>;
    choose(): Promise<string | null>;
    chooseImages(): Promise<AttachedImage[]>;
    chooseAttachments(): Promise<Attachment[]>;
    attachmentInputs(attachments: Attachment[]): Promise<UserInput[]>;
    tree(): Promise<FileNode[]>;
    read(filePath: string): Promise<{ content: string; path: string }>;
    write(filePath: string, content: string): Promise<void>;
    imageUrl(filePath: string): string;
  };
  git: {
    status(): Promise<GitStatus>;
    diff(filePath: string, staged: boolean): Promise<string>;
    stage(filePath: string): Promise<void>;
    unstage(filePath: string): Promise<void>;
  };
};
