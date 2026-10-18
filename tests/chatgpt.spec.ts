import { test, expect, type Page } from "@playwright/test";

async function setup(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__actions = []; w.__selections = [];
    const listeners = new Set<(state: any) => void>();
    let state = { origin: "https://chatgpt.com", loading: false, canGoBack: false, canGoForward: false, error: null, notice: null, captureSources: null };
    w.__state = (next: any) => { state = { ...state, ...next }; listeners.forEach(callback => callback(state)); };
    w.chatgpt = {
      state: async () => state,
      action: async (value: string) => { w.__actions.push(value); if (w.__fail) throw new Error("offline"); },
      selectCapture: async (id: string | null) => { w.__selections.push(id); w.__state({ captureSources: null }); },
      onChange: (callback: any) => { listeners.add(callback); return () => listeners.delete(callback); },
    };
  });
  await page.goto("/?view=chatgpt");
}

test("ChatGPT toolbar works without Codex authentication and keeps navigation visible at minimum size", async ({ page }) => {
  await setup(page);
  await expect(page.getByTitle("Back", { exact: true })).toBeDisabled();
  await expect(page.getByTitle("Forward", { exact: true })).toBeDisabled();
  await page.evaluate(() => (window as any).__state({ canGoBack: true, origin: "https://auth.openai.com" }));
  await expect(page.locator(".chatgpt-location")).toContainText("https://auth.openai.com");
  await page.getByTitle("Back", { exact: true }).click();
  await page.getByTitle("Open ChatGPT in browser", { exact: true }).click();
  await page.getByRole("button", { name: "Local workspace", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__actions)).toEqual(["back", "browser", "workspace"]);
  await page.setViewportSize({ width: 720, height: 540 });
  await expect(page.getByTitle("Clear ChatGPT session")).toBeInViewport();
  await expect(page.getByRole("button", { name: "Local workspace" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(720);
});

test("offline recovery and action errors remain visible", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => (window as any).__state({ error: "ChatGPT could not load. Check your connection." }));
  await expect(page.getByRole("alert")).toContainText("Check your connection");
  await page.getByRole("button", { name: "Try again" }).click();
  expect(await page.evaluate(() => (window as any).__actions)).toEqual(["reload"]);
  await page.evaluate(() => { (window as any).__fail = true; });
  await page.getByRole("button", { name: "Open in browser", exact: true }).click();
  await expect(page.locator(".chatgpt-status")).toContainText("did not complete");
  await page.screenshot({ path: "test-results/chatgpt-recovery.png" });
});

test("screen picker exposes individual sources and keyboard cancellation", async ({ page }) => {
  await setup(page);
  const sources = [{ id: "screen:1", name: "Display 1", thumbnail: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" }, { id: "window:2", name: "Notes", thumbnail: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" }];
  await page.evaluate(captureSources => (window as any).__state({ captureSources }), sources);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__selections)).toEqual(["window:2"]);
  await page.evaluate(captureSources => (window as any).__state({ captureSources }), sources);
  await page.getByRole("button", { name: "Cancel sharing" }).press("Escape");
  expect(await page.evaluate(() => (window as any).__selections)).toEqual(["window:2", null]);
});
