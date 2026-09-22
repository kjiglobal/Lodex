import type { ThreadItem } from "./types";

// Notifications cross a process boundary and may gain new shapes between
// runtime versions. Do not let an unexpected value become a React child.
export function normalizeItem(value: unknown): ThreadItem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.type !== "string") return null;
  const item = { ...raw } as ThreadItem;
  for (const key of ["text", "command", "cwd", "status", "aggregatedOutput", "server", "tool", "query", "path", "savedPath", "revisedPrompt"] as const) {
    if (typeof raw[key] !== "string") delete item[key];
  }
  if (Array.isArray(raw.summary)) item.summary = raw.summary.filter((entry): entry is string => typeof entry === "string");
  else delete item.summary;
  if (!Array.isArray(raw.content)) delete item.content;
  else if (raw.type === "userMessage") item.content = raw.content.filter(entry => {
    if (!entry || typeof entry !== "object") return false;
    if (entry.type === "text") return typeof entry.text === "string";
    if (entry.type === "image") return typeof entry.url === "string";
    if (entry.type === "localImage") return typeof entry.path === "string";
    if (entry.type === "mention" || entry.type === "skill") return typeof entry.name === "string" && typeof entry.path === "string";
    return false;
  });
  if (Array.isArray(raw.changes)) item.changes = raw.changes.filter(entry => entry && typeof entry.path === "string").map(entry => ({
    path: entry.path, kind: typeof entry.kind === "string" ? entry.kind : typeof entry.kind?.type === "string" ? { type: entry.kind.type } : "change",
    diff: typeof entry.diff === "string" ? entry.diff : undefined,
  }));
  else delete item.changes;
  if (item.aggregatedOutput) item.aggregatedOutput = item.aggregatedOutput.slice(-64_000);
  return item;
}
