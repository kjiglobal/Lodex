import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { app } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

type JsonRpcId = number;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export type CodexMessageHandler = (message: Record<string, unknown>) => void;
export type CodexStatusHandler = (status: { state: string; message?: string }) => void;

export class CodexClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<JsonRpcId, PendingRequest>();
  private nextId = 1;
  private starting: Promise<void> | null = null;
  private stopped = false;
  private serverRequests = new Map<number | string, Record<string, unknown>>();

  constructor(
    private readonly onMessage: CodexMessageHandler,
    private readonly onStatus: CodexStatusHandler,
  ) {}

  async start(): Promise<void> {
    if (this.starting) return this.starting;
    if (this.process) return;

    this.stopped = false;
    this.starting = this.startInternal().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async startInternal(): Promise<void> {
    const runtime = this.resolveRuntime();
    this.onStatus({ state: "starting", message: `Starting ${runtime.label}` });

    const child = spawn(runtime.command, runtime.args, {
      cwd: app.getPath("home"),
      env: runtime.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.process = child;
    child.stdin.on("error", (error) => this.handleExit(error, child));
    child.once("error", (error) => this.handleExit(error, child));
    child.once("exit", (code, signal) => {
      if (!this.stopped) {
        this.handleExit(new Error(`Codex runtime exited (${code ?? signal ?? "unknown"}).`), child);
      }
    });

    const output = readline.createInterface({ input: child.stdout });
    output.on("line", (line) => { if (this.process === child) this.handleLine(line); });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const message = chunk.trim();
      if (message) this.onStatus({ state: "log", message: message.slice(0, 1200) });
    });

    try {
      await this.sendRequest("initialize", {
        clientInfo: {
          name: "lodex",
          title: "Lodex",
          version: app.getVersion(),
        },
        capabilities: {
          experimentalApi: true,
        },
      });
      this.sendNotification("initialized", {});
      this.onStatus({ state: "ready" });
    } catch (error) {
      this.handleExit(error instanceof Error ? error : new Error("Runtime initialization failed."), child);
      child.kill();
      throw error;
    }
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    await this.start();
    return this.sendRequest(method, params) as Promise<T>;
  }

  respond(id: number | string, result: unknown): void {
    this.write({ id, result });
    this.serverRequests.delete(id);
  }

  pendingServerRequests(): Record<string, unknown>[] {
    return [...this.serverRequests.values()];
  }

  respondError(id: number | string, code: number, message: string): void {
    this.write({ id, error: { code, message } });
  }

  stop(): void {
    this.stopped = true;
    this.process?.kill();
    this.process = null;
    this.serverRequests.clear();
    this.rejectPending(new Error("Codex runtime stopped."));
  }

  private sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const payload = params === undefined ? { method, id } : { method, id, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out.`));
      }, method === "command/exec" ? 24 * 60 * 60 * 1000 : 30_000);

      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write(payload);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  private sendNotification(method: string, params?: unknown): void {
    this.write(params === undefined ? { method } : { method, params });
  }

  private write(message: unknown): void {
    if (!this.process?.stdin.writable) throw new Error("Codex runtime is not available.");
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      this.onStatus({ state: "log", message: line.slice(0, 1200) });
      return;
    }
    if (!message || typeof message !== "object" || Array.isArray(message)) return;

    if (typeof message.id === "number" && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) {
        const details = message.error as { message?: string };
        pending.reject(new Error(details.message || "Codex request failed."));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method === "serverRequest/resolved") {
      const params = message.params as { requestId?: number | string } | undefined;
      if (params?.requestId !== undefined) this.serverRequests.delete(params.requestId);
    }
    if (message.method && (typeof message.id === "number" || typeof message.id === "string")) {
      this.serverRequests.set(message.id, message);
    }
    this.onMessage(message);
  }

  private handleExit(error: Error, child: ChildProcessWithoutNullStreams): void {
    if (this.process !== child) return;
    this.process = null;
    this.serverRequests.clear();
    this.rejectPending(error);
    this.onStatus({ state: "error", message: error.message });
  }

  private rejectPending(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }

  private resolveRuntime(): { command: string; args: string[]; env: NodeJS.ProcessEnv; label: string } {
    const explicit = process.env.LODEX_CODEX_PATH;
    if (explicit) {
      return { command: explicit, args: ["app-server"], env: process.env, label: explicit };
    }

    const appRoot = app.getAppPath();
    const localScript = app.isPackaged
      ? path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "node_modules",
          "@openai",
          "codex",
          "bin",
          "codex.js",
        )
      : path.join(appRoot, "node_modules", "@openai", "codex", "bin", "codex.js");

    const platformName = process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";
    const architecture = process.arch === "arm64" ? "arm64" : "x64";
    const openAiModules = app.isPackaged
      ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "@openai")
      : path.join(appRoot, "node_modules", "@openai");
    const platformRuntime = path.join(openAiModules, `codex-${platformName}-${architecture}`);

    if (existsSync(localScript) && existsSync(platformRuntime)) {
      return {
        command: process.execPath,
        args: [localScript, "app-server"],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        label: "bundled Codex runtime",
      };
    }

    const command = process.platform === "win32" ? "codex.cmd" : "codex";
    return { command, args: ["app-server"], env: process.env, label: command };
  }
}
