export type AccessMode = "read-only" | "workspace-write" | "full-access";

export function accessMode(value: unknown, surface: unknown): AccessMode {
  if (value === "read-only" || value === "workspace-write" || value === "full-access") return value;
  return surface === "chat" ? "read-only" : "workspace-write";
}

export function sandboxMode(mode: AccessMode) {
  return mode === "full-access" ? "danger-full-access" : mode;
}

export function sandboxPolicy(mode: AccessMode, cwd: string) {
  if (mode === "full-access") return { type: "dangerFullAccess" };
  if (mode === "read-only") return { type: "readOnly", networkAccess: false };
  return { type: "workspaceWrite", writableRoots: [cwd], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false };
}
