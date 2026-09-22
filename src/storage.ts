// Preferences and drafts must never be able to take down the renderer.
export const storage = {
  get(key: string): string | null {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string): void {
    try { window.localStorage.setItem(key, value); } catch { /* Storage may be full or unavailable. */ }
  },
  remove(key: string): void {
    try { window.localStorage.removeItem(key); } catch { /* Best effort. */ }
  },
};
