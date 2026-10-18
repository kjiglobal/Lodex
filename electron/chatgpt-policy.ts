export const CHATGPT_HOME = "https://chatgpt.com/";
export const CHATGPT_PARTITION = "persist:lodex-chatgpt";

// Exact hosts only. In particular, a suffix match must never trust lookalike sites.
const chatHosts = new Set(["chatgpt.com", "www.chatgpt.com"]);
const loginHosts = new Set([
  "auth.openai.com", "auth0.openai.com", "auth.chatgpt.com",
  "accounts.google.com", "login.microsoftonline.com", "login.live.com", "appleid.apple.com",
]);

function secureUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : null;
  } catch { return null; }
}

export function isChatGPTUrl(value: string): boolean {
  const url = secureUrl(value);
  return !!url && chatHosts.has(url.hostname);
}

export function isEmbeddedUrl(value: string): boolean {
  const url = secureUrl(value);
  return !!url && (chatHosts.has(url.hostname) || loginHosts.has(url.hostname));
}

export function externalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function permissionLabel(permission: string, mediaTypes: string[] = []): string | null {
  if (permission === "media") {
    if (!mediaTypes.length || mediaTypes.some(type => type !== "audio" && type !== "video")) return null;
    return mediaTypes.map(type => type === "audio" ? "microphone" : "camera").join(" and ");
  }
  if (permission === "notifications") return "desktop notifications";
  if (permission === "clipboard-read") return "clipboard";
  return null;
}
