import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import type { UpdateState } from "./update-types";

const repository = "https://github.com/wwdreamb/Lodex";
const latestEndpoint = "https://api.github.com/repos/wwdreamb/Lodex/releases/latest";
const maxPackageSize = 1_000_000_000;
type Asset = { name: string; browser_download_url: string; size: number; digest?: string };
type Release = { version: string; url: string; asset?: Asset; checksum?: Asset };
type Options = {
  version: string;
  arch: string;
  directory: string;
  canInstall: boolean;
  fetch?: typeof fetch;
  install: (file: string, version: string, hash: string) => Promise<"installed" | "canceled">;
  changed: (state: UpdateState) => void;
};

function versionParts(value: string): number[] {
  if (!/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error("The release has an unsupported version number.");
  const parts = value.replace(/^v/, "").split(".").map(Number);
  if (parts.some(part => !Number.isSafeInteger(part))) throw new Error("The release version number is invalid.");
  return parts;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const a = versionParts(candidate), b = versionParts(current);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] > b[index];
  return false;
}

function parseAsset(value: unknown, name: string, tag: string): Asset | undefined {
  if (!value || typeof value !== "object") return;
  const asset = value as Asset & { state?: string };
  if (asset.name !== name) return;
  if (asset.state !== "uploaded" || asset.browser_download_url !== `${repository}/releases/download/${tag}/${name}` || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > maxPackageSize) {
    throw new Error("The release download details could not be verified.");
  }
  return asset;
}

export function parseRelease(value: unknown, arch: string): Release {
  if (!value || typeof value !== "object") throw new Error("GitHub returned an invalid release.");
  const data = value as Record<string, unknown>;
  if (data.draft !== false || data.prerelease !== false || typeof data.tag_name !== "string" || !Array.isArray(data.assets)) throw new Error("A stable release is not available.");
  const tag = data.tag_name;
  versionParts(tag);
  const version = tag.replace(/^v/, "");
  const name = `Lodex-${version}-${arch === "x64" ? "amd64" : arch === "arm64" ? "arm64" : "unsupported"}.deb`;
  if (data.html_url !== `${repository}/releases/tag/${tag}`) throw new Error("The release address could not be verified.");
  return { version, url: data.html_url, asset: data.assets.map(asset => parseAsset(asset, name, tag)).find(Boolean), checksum: data.assets.map(asset => parseAsset(asset, "SHA256SUMS", tag)).find(Boolean) };
}

function trustedDownload(url: string): boolean {
  const value = new URL(url);
  return value.protocol === "https:" && !value.username && !value.password && !value.port &&
    (value.hostname === "api.github.com" && value.pathname === "/repos/wwdreamb/Lodex/releases/latest" ||
     value.hostname === "github.com" && value.pathname.startsWith("/wwdreamb/Lodex/releases/download/") ||
     value.hostname === "release-assets.githubusercontent.com" || value.hostname === "objects.githubusercontent.com");
}

async function sha256(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export class UpdateService {
  private state: UpdateState;
  private release?: Release;
  private downloaded?: { file: string; hash: string; size: number };
  private controller?: AbortController;
  private locked = false;
  private fetch: typeof fetch;

  constructor(private options: Options) {
    this.fetch = options.fetch || fetch;
    this.state = { status: "idle", currentVersion: options.version, canInstall: options.canInstall, message: "Check for the latest stable Lodex release." };
  }

  snapshot(): UpdateState { return { ...this.state }; }
  get installing(): boolean { return this.state.status === "installing"; }
  private set(value: Partial<UpdateState>): UpdateState {
    this.state = { ...this.state, ...value };
    this.options.changed(this.snapshot());
    return this.snapshot();
  }

  private async request(url: string, signal: AbortSignal): Promise<Response> {
    for (let redirects = 0; redirects < 6; redirects++) {
      if (!trustedDownload(url)) throw new Error("The download address is not a trusted GitHub release address.");
      const response = await this.fetch(url, { redirect: "manual", signal, headers: { Accept: url.startsWith("https://api.github.com/") ? "application/vnd.github+json" : "application/octet-stream", "User-Agent": `Lodex/${this.options.version}`, "Cache-Control": "no-cache" } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new Error("GitHub returned an incomplete download address.");
        url = new URL(location, url).href;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 403 || response.status === 429) throw new Error("GitHub is limiting update checks. Please try again later.");
        throw new Error(`GitHub could not provide the update (HTTP ${response.status}). Please try again later.`);
      }
      return response;
    }
    throw new Error("GitHub redirected the download too many times.");
  }

  private async text(url: string, signal: AbortSignal, limit: number): Promise<string> {
    const response = await this.request(url, signal);
    if (!response.body) throw new Error("GitHub returned an empty response.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > limit) throw new Error("GitHub returned more update information than expected.");
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    return Buffer.concat(chunks).toString("utf8");
  }

  async check(): Promise<UpdateState> {
    if (this.locked || this.state.status === "installed" || this.state.status === "ready") return this.snapshot();
    this.locked = true;
    this.release = undefined;
    this.set({ status: "checking", latestVersion: undefined, releaseUrl: undefined, progress: undefined, message: "Checking GitHub for updates…" });
    try {
      if (this.downloaded) {
        await this.removeDownload(path.dirname(this.downloaded.file));
        this.downloaded = undefined;
      }
      this.release = parseRelease(JSON.parse(await this.text(latestEndpoint, AbortSignal.timeout(20_000), 1_000_000)), this.options.arch);
      const { version, url, asset, checksum } = this.release;
      const newer = isNewerVersion(version, this.options.version);
      const canInstall = this.options.canInstall && !!asset && !!checksum;
      return this.set({ status: newer ? "available" : "current", latestVersion: version, releaseUrl: url, canInstall,
        message: !newer ? `Lodex ${this.options.version} is up to date.` : canInstall ? `Lodex ${version} is available.` : `Lodex ${version} is available. Open the release page for installation options for this system.` });
    } catch (error) { return this.set({ status: "error", message: this.error(error, "Could not check for updates. Check your internet connection and try again.") }); }
    finally { this.locked = false; }
  }

  cancel(): UpdateState { if (this.state.status === "downloading") this.controller?.abort(); return this.snapshot(); }

  async download(): Promise<UpdateState> {
    if (this.locked || this.state.status !== "available" || !this.state.canInstall || !this.release?.asset || !this.release.checksum) return this.snapshot();
    this.locked = true;
    const release = this.release, asset = release.asset!, checksum = release.checksum!;
    this.controller = new AbortController();
    const controller = this.controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30 * 60_000)]);
    let directory: string | undefined;
    this.set({ status: "downloading", progress: 0, message: "Downloading the Ubuntu update…" });
    try {
      const sums = await this.text(checksum.browser_download_url, signal, 64_000);
      const entries = sums.split(/\r?\n/).map(line => /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line)).filter(match => match?.[2] === asset.name);
      if (entries.length !== 1) throw new Error("The release does not contain a unique checksum for this installer.");
      const expected = entries[0]![1].toLowerCase();
      if (asset.digest && asset.digest !== `sha256:${expected}`) throw new Error("GitHub's installer checksum does not match the release checksum.");
      await fs.mkdir(this.options.directory, { recursive: true, mode: 0o700 });
      directory = await fs.mkdtemp(path.join(this.options.directory, "update-"));
      const file = path.join(directory, asset.name);
      const handle = await fs.open(file, "wx", 0o600);
      try {
        const response = await this.request(asset.browser_download_url, signal);
        if (!response.body) throw new Error("GitHub returned an empty installer.");
        const reader = response.body.getReader();
        const hash = createHash("sha256"); let received = 0, progress = -1;
        try {
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            received += value.length;
            if (received > asset.size) throw new Error("The installer size does not match the release.");
            hash.update(value);
            await handle.writeFile(value);
            const percent = Math.floor(received * 100 / asset.size);
            if (percent !== progress) { progress = percent; this.set({ progress }); }
          }
        } finally { await reader.cancel().catch(() => undefined); }
        if (received !== asset.size || hash.digest("hex") !== expected) throw new Error("The downloaded installer could not be verified. Check for updates and try the download again.");
        await handle.sync();
      } finally { await handle.close(); }
      this.downloaded = { file, hash: expected, size: asset.size };
      return this.set({ status: "ready", progress: 100, message: `Lodex ${release.version} is ready to install. Ubuntu will ask for your password. Restart afterward when your tasks are finished.` });
    } catch (error) {
      if (directory) await this.removeDownload(directory);
      return this.set({ status: controller.signal.aborted ? "available" : "error", progress: undefined, message: controller.signal.aborted ? "Download canceled. You can download the update again whenever you’re ready." : this.error(error, "The download was interrupted. Check your connection and try again.") });
    } finally { this.controller = undefined; this.locked = false; }
  }

  async install(): Promise<UpdateState> {
    if (this.locked || this.state.status !== "ready" || !this.downloaded || !this.release || !this.state.canInstall) return this.snapshot();
    this.locked = true;
    this.set({ status: "installing", message: "Approve the Ubuntu password prompt to install. Keep Lodex open until installation finishes." });
    try {
      const info = await fs.lstat(this.downloaded.file);
      if (!info.isFile() || info.isSymbolicLink() || info.size !== this.downloaded.size || await sha256(this.downloaded.file) !== this.downloaded.hash) throw new Error("The installer changed after download. Check for updates and download it again.");
      const result = await this.options.install(this.downloaded.file, this.release.version, this.downloaded.hash);
      if (result === "canceled") return this.set({ status: "ready", message: "Installation canceled. Your current version is unchanged. Select Install Update to try again." });
      await this.removeDownload(path.dirname(this.downloaded.file));
      this.downloaded = undefined;
      return this.set({ status: "installed", message: `Lodex ${this.release.version} is installed. Restart Lodex when your tasks are finished.` });
    } catch (error) { return this.set({ status: "error", message: this.error(error, "Ubuntu could not install the update. Close other software installers, then check for updates and try again.") }); }
    finally { this.locked = false; }
  }

  private async removeDownload(directory: string): Promise<void> {
    if (path.dirname(directory) !== path.resolve(this.options.directory) || !path.basename(directory).startsWith("update-")) return;
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
  private error(error: unknown, fallback: string): string {
    return error instanceof Error && error.name === "Error" && !/fetch failed|ENOTFOUND|ECONN|ENOENT|EACCES|ENOSPC/i.test(error.message) ? error.message : fallback;
  }
}
