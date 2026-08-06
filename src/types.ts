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
  changes?: Array<{ path: string; kind: string; diff?: string }>;
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
  status?: unknown;
  turns?: Turn[];
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
  codex: {
    request<T = unknown>(method: string, params?: unknown): Promise<T>;
    respond(id: number | string, result: unknown): void;
    onEvent(callback: (message: CodexEvent) => void): () => void;
    onStatus(callback: (status: { state: string; message?: string }) => void): () => void;
  };
  auth: {
    loginWithChatGPT(): Promise<unknown>;
    logout(): Promise<unknown>;
  };
  workspace: {
    current(): Promise<string | null>;
    choose(): Promise<string | null>;
    chooseImages(): Promise<AttachedImage[]>;
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
