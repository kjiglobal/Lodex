import { app, dialog } from "electron";
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
  private root: string | null = null;
  private allowedImages = new Set<string>();

  async load(): Promise<void> {
    try {
      const stored = JSON.parse(await fs.readFile(this.preferencesPath(), "utf8")) as { workspace?: string };
      if (stored.workspace && (await fs.stat(stored.workspace)).isDirectory()) this.root = stored.workspace;
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
    await fs.mkdir(path.dirname(this.preferencesPath()), { recursive: true });
    await fs.writeFile(this.preferencesPath(), JSON.stringify({ workspace: this.root }, null, 2), "utf8");
    return this.root;
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
