import { app, dialog, nativeImage } from "electron";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, promises as fs, realpathSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "dist-electron",
  "release",
  "target",
  ".cache",
  ".next",
]);

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

export class WorkspaceService {
  private static preferenceWrites = Promise.resolve();
  private root: string | null = null;
  private projects: string[] = [];
  private allowedImages = new Set<string>();
  private allowedAttachments = new Set<string>();

  async load(): Promise<void> {
    try {
      const paths: unknown = JSON.parse(await fs.readFile(path.join(app.getPath("userData"), "attachments.json"), "utf8"));
      if (Array.isArray(paths)) for (const file of paths) if (typeof file === "string") {
        this.allowedAttachments.add(file);
        if (/\.(png|jpe?g|webp|gif)$/i.test(file)) this.allowedImages.add(file);
      }
    } catch { /* No attachments yet. */ }
    try {
      const stored = JSON.parse(await fs.readFile(this.preferencesPath(), "utf8")) as { workspace?: string; projects?: string[] };
      if (stored.workspace && (await fs.stat(stored.workspace)).isDirectory()) this.root = stored.workspace;
      this.projects = [...new Set([...(Array.isArray(stored.projects) ? stored.projects.filter(p => typeof p === "string") : []), ...(this.root ? [this.root] : [])])];
    } catch {
      // First launch or a stale workspace is expected.
    }
  }

  current(): string | null {
    return this.root;
  }

  async choose(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: "Open a project",
      defaultPath: this.root ?? app.getPath("home"),
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    this.root = path.resolve(result.filePaths[0]);
    this.projects = [...new Set([...this.projects, this.root])];
    await this.savePreferences();
    return this.root;
  }

  async listProjects(): Promise<string[]> {
    await WorkspaceService.preferenceWrites;
    const stored = await fs.readFile(this.preferencesPath(), "utf8").then(JSON.parse).catch(() => ({}));
    this.projects = [...new Set([...this.projects, ...(Array.isArray(stored.projects) ? stored.projects.filter((p: unknown) => typeof p === "string") : [])])];
    return this.projects;
  }

  private async savePreferences(): Promise<void> {
    const write = WorkspaceService.preferenceWrites.then(async () => {
      const stored = await fs.readFile(this.preferencesPath(), "utf8").then(JSON.parse).catch(() => ({}));
      this.projects = [...new Set([...this.projects, ...(Array.isArray(stored.projects) ? stored.projects.filter((p: unknown) => typeof p === "string") : [])])];
      await fs.mkdir(path.dirname(this.preferencesPath()), { recursive: true });
      await fs.writeFile(this.preferencesPath(), JSON.stringify({ workspace: this.root, projects: this.projects }, null, 2), "utf8");
    });
    WorkspaceService.preferenceWrites = write.catch(() => undefined);
    await write;
  }

  async selectProject(value: unknown): Promise<string> {
    await this.listProjects();
    if (typeof value !== "string" || !this.projects.includes(value)) throw new Error("Open this folder using File → Open Folder first.");
    if (!(await fs.stat(value)).isDirectory()) throw new Error("This project folder is no longer available.");
    this.root = value;
    await this.savePreferences();
    return value;
  }

  async pasteImage(value: unknown, temporary = false) {
    if (!(value instanceof Uint8Array) || !value.byteLength || value.byteLength > 20 * 1024 * 1024) throw new Error("Paste an image smaller than 20 MB.");
    const image = nativeImage.createFromBuffer(Buffer.from(value));
    const dimensions = image.getSize();
    if (image.isEmpty() || dimensions.width * dimensions.height > 40_000_000) throw new Error("This clipboard image is not supported or is too large.");
    const png = image.toPNG();
    if (png.length > 20 * 1024 * 1024) throw new Error("Paste an image smaller than 20 MB.");
    const directory = path.join(app.getPath("userData"), temporary ? "temporary-images" : "pasted-images");
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, `${randomUUID()}.png`);
    await fs.writeFile(file, png, { mode: 0o600, flag: "wx" });
    this.allowedImages.add(file);
    this.allowedAttachments.add(file);
    if (!temporary) await this.saveAttachments();
    return { path: file, name: "Pasted image.png", kind: "image" as const, size: png.length };
  }

  private async saveAttachments() {
    const file = path.join(app.getPath("userData"), "attachments.json");
    const existing: unknown = await fs.readFile(file, "utf8").then(JSON.parse).catch(() => []);
    const paths = [...new Set([...(Array.isArray(existing) ? existing.filter(p => typeof p === "string") : []), ...this.allowedAttachments])];
    const permanent = paths.filter(p => path.dirname(p) !== path.join(app.getPath("userData"), "temporary-images"));
    await fs.mkdir(app.getPath("userData"), { recursive: true });
    await fs.writeFile(file, JSON.stringify(permanent.slice(-500)), { encoding: "utf8", mode: 0o600 });
  }

  async clearTemporaryImages() {
    const directory = path.join(app.getPath("userData"), "temporary-images");
    for (const file of this.allowedImages) {
      if (path.dirname(file) !== directory) continue;
      await fs.unlink(file).catch(() => undefined);
      this.allowedImages.delete(file); this.allowedAttachments.delete(file);
    }
  }

  async chooseImages(): Promise<Array<{ path: string; name: string }>> {
    const result = await dialog.showOpenDialog({
      title: "Attach images",
      defaultPath: this.root ?? app.getPath("pictures"),
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (result.canceled) return [];
    for (const filePath of result.filePaths) this.allowedImages.add(realpathSync.native(filePath));
    return result.filePaths.map((filePath) => ({ path: filePath, name: path.basename(filePath) }));
  }

  async chooseAttachments(): Promise<Array<{ path: string; name: string; kind: "image" | "file"; size: number }>> {
    const result = await dialog.showOpenDialog({
      title: "Add photos and files", defaultPath: this.root ?? app.getPath("documents"),
      properties: ["openFile", "multiSelections"],
    });
    if (result.canceled) return [];
    const attachments = await Promise.all(result.filePaths.slice(0, 8).map(async (file) => {
      const resolved = await fs.realpath(file);
      const stat = await fs.stat(resolved);
      if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error("Choose files smaller than 20 MB.");
      const kind = /\.(png|jpe?g|webp|gif)$/i.test(file) ? "image" as const : "file" as const;
      this.allowedAttachments.add(resolved);
      if (kind === "image") this.allowedImages.add(resolved);
      return { path: resolved, name: path.basename(file), kind, size: stat.size };
    }));
    await this.saveAttachments();
    return attachments;
  }

  async attachmentInputs(value: unknown): Promise<unknown[]> {
    if (!Array.isArray(value) || value.length > 8) throw new Error("Choose up to eight attachments.");
    return Promise.all(value.map(async (attachment: unknown) => {
      if (!attachment || typeof attachment !== "object" || !("path" in attachment) || typeof attachment.path !== "string") throw new Error("Invalid attachment.");
      const file = await fs.realpath(attachment.path);
      if (!this.allowedAttachments.has(file) && !this.allowedImages.has(file)) throw new Error("Please attach this file again using Add photos and files.");
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error("Choose files smaller than 20 MB.");
      if (/\.(png|jpe?g|webp|gif)$/i.test(file)) return { type: "localImage", path: file, detail: "auto" };
      if (/\.(txt|md|csv|tsv|json|yaml|yml|xml|log|ts|tsx|js|jsx|py|html|css)$/i.test(file)) {
        if (stat.size > 512_000) throw new Error("Text attachments must be smaller than 500 KB. Open a project to work with larger files.");
        return { type: "text", text: `Attached file: ${path.basename(file)}\n\n${await fs.readFile(file, "utf8")}`, text_elements: [] };
      }
      // Binary documents are file references; installed runtime tools determine
      // which formats can be read. Never decode binary documents as UTF-8.
      return { type: "mention", name: path.basename(file), path: file };
    }));
  }

  async tree(): Promise<FileNode[]> {
    const root = this.requireRoot();
    let count = 0;

    const walk = async (directory: string, relativeDirectory: string, depth: number): Promise<FileNode[]> => {
      if (depth > 10 || count > 8000) return [];
      const entries = await fs.readdir(directory, { withFileTypes: true });
      entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });

      const nodes: FileNode[] = [];
      for (const entry of entries) {
        if (count++ > 8000) break;
        if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
        if (entry.isSymbolicLink()) continue;
        const relativePath = path.join(relativeDirectory, entry.name);
        if (entry.isDirectory()) {
          nodes.push({
            name: entry.name,
            path: relativePath,
            type: "directory",
            children: await walk(path.join(directory, entry.name), relativePath, depth + 1),
          });
        } else if (entry.isFile()) {
          nodes.push({ name: entry.name, path: relativePath, type: "file" });
        }
      }
      return nodes;
    };

    return walk(root, "", 0);
  }

  async read(relativePath: string): Promise<{ content: string; path: string }> {
    const absolutePath = this.resolveInsideRoot(relativePath);
    const stats = await fs.stat(absolutePath);
    if (stats.size > 5 * 1024 * 1024) throw new Error("Files larger than 5 MB are not opened in the editor.");
    return { content: await fs.readFile(absolutePath, "utf8"), path: relativePath };
  }

  async write(relativePath: string, content: string): Promise<void> {
    const absolutePath = this.resolveInsideRoot(relativePath);
    await fs.writeFile(absolutePath, content, "utf8");
  }

  async gitStatus(): Promise<{ branch: string; files: GitFile[]; isRepository: boolean }> {
    const root = this.requireRoot();
    try {
      const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1", "--branch", "-z"], {
        cwd: root,
        maxBuffer: 10 * 1024 * 1024,
        encoding: "utf8",
      });
      const records = stdout.split("\0").filter(Boolean);
      const header = records.shift() ?? "## HEAD";
      const branch = header.replace(/^##\s*/, "").split("...")[0].trim();
      const files: GitFile[] = [];
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        if (record.length < 4) continue;
        const indexStatus = record[0];
        const workingTree = record[1];
        let filePath = record.slice(3);
        if (indexStatus === "R" || indexStatus === "C") {
          const originalPath = records[index + 1];
          if (originalPath) {
            filePath = `${originalPath} → ${filePath}`;
            index += 1;
          }
        }
        files.push({ path: filePath, index: indexStatus, workingTree });
      }
      return { branch, files, isRepository: true };
    } catch {
      return { branch: "", files: [], isRepository: false };
    }
  }

  async gitDiff(relativePath: string, staged: boolean): Promise<string> {
    const root = this.requireRoot();
    this.resolveInsideRoot(relativePath.split(" → ").at(-1) ?? relativePath);
    const args = ["diff", "--no-ext-diff", "--no-color"];
    if (staged) args.push("--cached");
    args.push("--", relativePath.split(" → ").at(-1) ?? relativePath);
    const { stdout } = await execFileAsync("git", args, { cwd: root, maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  }

  async gitStage(relativePath: string): Promise<void> {
    const root = this.requireRoot();
    const filePath = relativePath.split(" → ").at(-1) ?? relativePath;
    this.resolveInsideRoot(filePath);
    await execFileAsync("git", ["add", "--", filePath], { cwd: root });
  }

  async gitUnstage(relativePath: string): Promise<void> {
    const root = this.requireRoot();
    const filePath = relativePath.split(" → ").at(-1) ?? relativePath;
    this.resolveInsideRoot(filePath);
    try {
      await execFileAsync("git", ["restore", "--staged", "--", filePath], { cwd: root });
    } catch {
      await execFileAsync("git", ["reset", "--", filePath], { cwd: root });
    }
  }

  canLoadImage(filePath: string): boolean {
    if (!existsSync(filePath)) return false;
    const realPath = realpathSync.native(filePath);
    if (this.allowedImages.has(realPath)) return true;
    if (!this.root) return false;
    const realRoot = realpathSync.native(this.root);
    const relative = path.relative(realRoot, realPath);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  allowGeneratedImage(filePath: unknown): void {
    if (typeof filePath !== "string" || !/\.(png|jpe?g|webp|gif)$/i.test(filePath)) return;
    try { this.allowedImages.add(realpathSync.native(filePath)); } catch { /* The file may not exist yet. */ }
  }

  private requireRoot(): string {
    if (!this.root) throw new Error("Open a project first.");
    return this.root;
  }

  private resolveInsideRoot(relativePath: string): string {
    const root = this.requireRoot();
    const absolutePath = path.resolve(root, relativePath);
    const realRoot = realpathSync.native(root);
    const realTarget = existsSync(absolutePath)
      ? realpathSync.native(absolutePath)
      : path.join(realpathSync.native(path.dirname(absolutePath)), path.basename(absolutePath));
    const relative = path.relative(realRoot, realTarget);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Path is outside the open project.");
    return realTarget;
  }

  private preferencesPath(): string {
    return path.join(app.getPath("userData"), "preferences.json");
  }
}
