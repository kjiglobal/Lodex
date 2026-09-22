import { test, expect, type Page } from "@playwright/test";

async function setup(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    const listeners = new Set<(event: any) => void>();
    const read = () => JSON.parse(sessionStorage.getItem("test-runtime") || "null");
    const initial = {
      id: "saved-chat", name: "Planning a weekend", preview: "First question", cwd: "/project", createdAt: 1, updatedAt: 1,
      status: { type: "idle" }, turns: [
        { id: "turn-1", status: "completed", items: [{ id: "user-1", type: "userMessage", content: [{ type: "text", text: "First question" }] }, { id: "answer-1", type: "agentMessage", text: "First answer", phase: "final_answer" }] },
        { id: "turn-2", status: "completed", items: [{ id: "user-2", type: "userMessage", content: [{ type: "text", text: "Second question" }] }, { id: "answer-2", type: "agentMessage", text: "Second answer", phase: "final_answer" }] },
      ],
    };
    let threads = read() || [initial];
    const save = () => sessionStorage.setItem("test-runtime", JSON.stringify(threads.filter((thread: any) => !thread.ephemeral)));
    w.__requests = [];
    w.__emit = (event: any) => { for (const listener of listeners) listener(event); };
    w.__finish = () => { const thread = threads.at(-1); thread.status = { type: "idle" }; const turn = thread.turns.at(-1); turn.status = "completed"; save(); w.__emit({ method: "turn/completed", params: { threadId: thread.id, turn } }); };
    w.lodex = {
      platform: "linux",
      app: { onMenu: (callback: any) => { w.__menu = callback; return () => {}; }, reportError: (category: string) => { w.__reported = [...(w.__reported || []), category]; }, info: async () => ({ version: "0.4.1", softwareRendering: true }), openDiagnostics: async () => {}, exportChat: async (title: string, content: string) => { w.__export = { title, content }; return true; } },
      codex: {
        request: async (method: string, params: any = {}) => {
          w.__requests.push({ method, params });
          if (method === "account/read") return { account: { email: "test@example.com", planType: "Plus" }, requiresOpenaiAuth: true };
          if (method === "model/list") return { data: [{ id: "test-model", model: "test-model", displayName: "Test model", description: "A model for testing", inputModalities: ["text", "image"], isDefault: true, defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "medium" }, { reasoningEffort: "high" }] }] };
          if (method === "thread/list") return { data: params.archived ? [{ ...initial, id: "archived-chat", name: "Archived example" }] : threads.filter((thread: any) => !thread.ephemeral) };
          if (method === "thread/read" || method === "thread/resume") return { thread: threads.find((t: any) => t.id === params.threadId) };
          if (method === "thread/goal/get") return { goal: null };
          if (method === "thread/start" || method === "thread/fork") {
            let turns: any[] = [];
            if (method === "thread/fork") {
              const source = threads.find((t: any) => t.id === params.threadId);
              const index = params.lastTurnId ? source.turns.findIndex((turn: any) => turn.id === params.lastTurnId) : source.turns.length - 1;
              turns = JSON.parse(JSON.stringify(source.turns.slice(0, index + 1)));
            }
            const thread = { ...initial, id: "new-" + threads.length, name: "New conversation", turns, ephemeral: params.ephemeral === true };
            threads.push(thread); save(); return { thread };
          }
          if (method === "turn/start") {
            if (w.__failSend) throw new Error("Test connection interrupted");
            const thread = threads.find((t: any) => t.id === params.threadId);
            const turn = { id: "running-turn", status: "inProgress", items: [{ id: "live-user", type: "userMessage", content: params.input }] };
            thread.turns.push(turn); thread.status = { type: "active" }; save();
            w.__emit({ method: "turn/started", params: { threadId: thread.id, turn } });
            w.__emit({ method: "item/started", params: { threadId: thread.id, item: turn.items[0] } });
            return { turn };
          }
          if (method === "thread/name/set") { threads.find((t: any) => t.id === params.threadId).name = params.name; save(); }
          if (method === "account/rateLimits/read") return { rateLimits: { primary: { usedPercent: 18 } } };
          if (method === "app/list" || method === "skills/list") return { data: [] };
          if (method === "turn/interrupt") w.__finish();
          return {};
        },
        respond: () => {},
        onEvent: (callback: any) => { listeners.add(callback); return () => listeners.delete(callback); },
        onStatus: () => () => {},
        pendingRequests: async () => JSON.parse(sessionStorage.getItem("test-approvals") || "[]"),
      },
      auth: { loginWithChatGPT: async () => {}, logout: async () => {} },
      workspace: { projects: async () => JSON.parse(sessionStorage.getItem("test-projects") || "[]"), select: async (path: string) => { w.__project = path; return path; }, clearTemporary: async () => {}, pasteImage: async (bytes: Uint8Array, temporary: boolean) => { w.__pasted = { size: bytes.length, temporary }; return { path: "/pasted.png", name: "Pasted image.png", kind: "image", size: bytes.length }; }, current: async () => w.__project || null, choose: async () => null, tree: async () => [], imageUrl: () => "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
        chooseAttachments: async () => [{ path: "/notes.txt", name: "notes.txt", kind: "file", size: 20 }],
        attachmentInputs: async (files: any[]) => files.map(file => file.kind === "image" ? { type: "localImage", path: file.path } : ({ type: "text", text: "Attached file: " + file.name + "\nSample notes", text_elements: [] })),
      }, git: { status: async () => null },
    };
    {
    const w = window as any;
    const listeners = new Set<(value: any) => void>();
    let value = { status: "idle", currentVersion: "0.4.1", latestVersion: "0.5.0", canInstall: true, message: "Check for the latest stable Lodex release." };
    const set = (next: any) => { value = { ...value, ...next }; for (const listener of listeners) listener(value); return value; };
    w.__updateState = set;
    w.lodex.updates = {
      state: async () => value,
      onChange: (fn: any) => { listeners.add(fn); return () => listeners.delete(fn); },
      check: async () => { w.__updateChecks = (w.__updateChecks || 0) + 1; return set(w.__updateFailure ? { status: "error", message: "Check your internet connection and try again." } : w.__updateCurrent ? { status: "current", message: "Lodex 0.4.1 is up to date." } : { status: "available", message: "Lodex 0.5.0 is available." }); },
      download: async () => set({ status: "downloading", progress: 25, message: "Downloading the Ubuntu update…" }),
      cancel: async () => set({ status: "available", message: "Download canceled." }),
      install: async () => { w.__updateInstalls = (w.__updateInstalls || 0) + 1; return set({ status: "installing", message: "Approve the Ubuntu password prompt to install." }); },
      restart: async () => { w.__updateRestart = true; },
      openRelease: async () => { w.__releaseOpened = true; },
    };
    }
  });
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Message Lodex" })).toBeEnabled();
}

test("About and Help update controls support download, cancel, install and an explicit restart", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => (window as any).__menu("about"));
  const dialog = page.getByRole("dialog", { name: "About Lodex" });
  await expect(dialog).toContainText("Version 0.4.1");
  expect(await page.evaluate(() => (window as any).__updateChecks || 0)).toBe(0);
  await dialog.getByRole("button", { name: "Check for Updates", exact: true }).click();
  await expect(dialog).toContainText("0.5.0 is available");
  await dialog.getByRole("button", { name: "Download Update", exact: true }).click();
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("value", "25");
  await dialog.getByRole("button", { name: "Cancel download" }).click();
  await expect(dialog).toContainText("Download canceled");
  await dialog.getByRole("button", { name: "Download Update", exact: true }).click();
  await dialog.getByTitle("Close update window").click();
  await page.evaluate(() => (window as any).__updateState({ status: "ready", message: "Lodex 0.5.0 is ready to install. Ubuntu will ask for your password." }));
  await page.evaluate(() => (window as any).__menu("about"));
  await expect(dialog.getByRole("button", { name: "Install Update" })).toBeVisible();
  await dialog.getByRole("button", { name: "Install Update" }).click();
  await expect(dialog.getByRole("button", { name: "Installing…" })).toBeDisabled();
  await page.evaluate(() => (window as any).__updateState({ status: "installed", message: "Lodex 0.5.0 is installed. Restart Lodex when your tasks are finished." }));
  expect(await page.evaluate(() => !!(window as any).__updateRestart)).toBe(false);
  await page.screenshot({ path: "test-results/lodex-updates-installed.png" });
  await dialog.getByRole("button", { name: "Restart Lodex" }).click();
  expect(await page.evaluate(() => (window as any).__updateRestart)).toBe(true);
});

test("update check reports current and offline states, supports retry and fits small dark windows", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { (window as any).__updateCurrent = true; (window as any).__menu("updates"); });
  const dialog = page.getByRole("dialog", { name: "About Lodex" });
  await expect(dialog).toContainText("0.4.1 is up to date");
  await dialog.getByTitle("Close update window").click();
  await page.evaluate(() => { (window as any).__updateFailure = true; (window as any).__menu("updates"); });
  await expect(dialog).toContainText("internet connection");
  await page.evaluate(() => { (window as any).__updateFailure = false; (window as any).__updateCurrent = false; });
  await dialog.getByRole("button", { name: "Check for Updates", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Download Update", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/lodex-updates.png" });
  await page.setViewportSize({ width: 720, height: 540 });
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  const box = await dialog.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(540);
  await page.screenshot({ path: "test-results/lodex-updates-compact.png" });
  await dialog.press("Escape");
  await expect(dialog).toHaveCount(0);
});

async function start(page: Page) {
  await page.getByRole("textbox", { name: "Message Lodex" }).fill("Help me with this project");
  await page.getByTitle("Send message", { exact: true }).click();
  await expect(page.getByTitle("Stop response")).toBeVisible();
}

test("file-change objects and mixed streamed activity never blank the window", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await setup(page); await start(page);
  await page.evaluate(() => {
    const w = window as any;
    w.__emit({ method: "item/started", params: { threadId: "new-1", item: { id: "patch", type: "fileChange", status: "inProgress", changes: [{ path: "src/app.ts", kind: { type: "update", move_path: null } }] } } });
    for (let i = 0; i < 300; i++) w.__emit({ method: "item/agentMessage/delta", params: { threadId: "new-1", itemId: "stream", delta: "hello " } });
    w.__emit({ method: "item/completed", params: { threadId: "new-1", item: { id: "stream", type: "agentMessage", text: "Finished reviewing your project.", phase: "final_answer" } } });
  });
  await page.getByRole("button", { name: /1 file change/ }).click();
  await expect(page.locator(".change-row")).toContainText("update");
  await expect(page.locator(".change-row")).toContainText("src/app.ts");
  await expect(page.locator(".assistant-message")).toContainText("Finished reviewing your project.");
  await expect(page.locator(".composer")).toBeVisible();
  expect(errors).toEqual([]);
});

test("large command streams stay bounded and unexpected fields are contained", async ({ page }) => {
  await setup(page); await start(page);
  await page.evaluate(() => {
    const emit = (window as any).__emit;
    emit({ method: "item/started", params: { threadId: "new-1", item: { id: "cmd", type: "commandExecution", command: "Build project", status: "inProgress" } } });
    for (let i = 0; i < 150; i++) emit({ method: "item/commandExecution/outputDelta", params: { threadId: "new-1", itemId: "cmd", delta: "x".repeat(1000) } });
    emit({ method: "item/started", params: { threadId: "new-1", item: { id: "odd", type: "fileChange", changes: [{ path: "a.ts", kind: { unexpected: true } }], command: { unexpected: true } } } });
  });
  await page.getByRole("button", { name: "Build project" }).click();
  await expect(page.locator(".tool-details pre")).toHaveText("x".repeat(64000));
  await page.getByRole("button", { name: /1 file change/ }).click();
  await expect(page.locator(".change-row")).toContainText("change");
  await expect(page.locator(".composer")).toBeVisible();
});

test("draft and active turn recover after reload, with pending approval", async ({ page }) => {
  await setup(page); await start(page);
  const input = page.getByRole("textbox", { name: "Message Lodex" });
  await input.fill("My next question is saved");
  await input.press("Enter");
  expect(await page.evaluate(() => (window as any).__requests.filter((r: any) => r.method === "turn/start").length)).toBe(1);
  await page.evaluate(() => sessionStorage.setItem("test-approvals", JSON.stringify([{ id: 41, method: "item/fileChange/requestApproval", params: { threadId: "new-1" } }])));
  await page.reload();
  await expect(input).toHaveValue("My next question is saved");
  await expect(page.getByTitle("Stop response")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Apply these changes?");
  expect(await page.evaluate(() => (window as any).__requests.filter((r: any) => r.method === "turn/start").length)).toBe(0);
});

test("failed send keeps the draft even after reload", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { (window as any).__failSend = true; });
  await page.getByRole("textbox", { name: "Message Lodex" }).fill("Do not lose this text");
  await page.getByTitle("Send message", { exact: true }).click();
  await expect(page.locator(".composer-error")).toContainText("Test connection interrupted");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Message Lodex" })).toHaveValue("Do not lose this text");
});

test("attachments reach the turn and settings persist", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Add photos, files and tools" }).click();
  await page.getByRole("menuitem", { name: /Add photos and files/ }).click();
  await expect(page.locator(".attachment")).toContainText("notes.txt");
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await page.getByLabel("Appearance").selectOption("dark");
  await page.getByLabel("Custom instructions", { exact: false }).fill("Use plain language.");
  await page.getByTitle("Close settings").click();
  await page.getByRole("textbox", { name: "Message Lodex" }).fill("Summarize my notes");
  await page.getByTitle("Send message", { exact: true }).click();
  const requests = await page.evaluate(() => (window as any).__requests);
  expect(requests.find((r: any) => r.method === "thread/start").params.developerInstructions).toBe("Use plain language.");
  expect(requests.find((r: any) => r.method === "turn/start").params.input).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining("Sample notes") })]));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("edit and retry fork the preceding history without touching the original", async ({ page }) => {
  await setup(page);
  await page.getByTitle("Planning a weekend", { exact: true }).click();
  await expect(page.locator(".assistant-message").last()).toContainText("Second answer");
  await page.getByTitle("Edit in a new branch").last().click();
  await page.getByLabel("Edited message", { exact: true }).fill("A different second question");
  await page.getByRole("button", { name: "Send in new branch" }).click();
  await expect(page.getByTitle("Stop response")).toBeVisible();
  const requests = await page.evaluate(() => (window as any).__requests);
  expect(requests.find((r: any) => r.method === "thread/fork").params.lastTurnId).toBe("turn-1");
  expect(requests.find((r: any) => r.method === "turn/start").params.input[0].text).toBe("A different second question");
  expect(requests.some((r: any) => r.method === "thread/rollback")).toBe(false);
  const original = await page.evaluate(() => JSON.parse(sessionStorage.getItem("test-runtime")!).find((t: any) => t.id === "saved-chat"));
  expect(original.turns[1].items[0].content[0].text).toBe("Second question");
});

test("rename, archive restore and Markdown export are usable", async ({ page }) => {
  await setup(page);
  await page.getByTitle("Planning a weekend", { exact: true }).click();
  await page.getByTitle("Chat actions").first().click();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByRole("textbox", { name: "Chat name" }).fill("Weekend plans");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTitle("Weekend plans", { exact: true })).toBeVisible();
  await page.getByTitle("Chat options", { exact: true }).click();
  await page.getByTitle("Export chat", { exact: true }).click();
  expect(await page.evaluate(() => (window as any).__export.content)).toContain("## You\n\nFirst question");
  await page.getByRole("button", { name: "Archived chats" }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("No archived chats");
});

test("light, dark and compact layouts keep chat controls visible", async ({ page }) => {
  await setup(page);
  await page.screenshot({ path: "test-results/lodex-light.png" });
  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await page.screenshot({ path: "test-results/lodex-dark.png" });
  await page.setViewportSize({ width: 900, height: 650 });
  await expect(page.getByRole("textbox", { name: "Message Lodex" })).toBeInViewport();
  await expect(page.getByRole("navigation", { name: "ChatGPT mode" })).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: "test-results/lodex-compact.png" });
});

test("product navigation keeps saved modes, shortcuts and running-turn protection", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    localStorage.removeItem("lodex-mode");
    localStorage.setItem("lodex-surface", "build");
  });
  await page.reload();
  await expect(page.locator(".product-heading")).toHaveText("Codex");
  await page.keyboard.press("Control+Alt+n");
  await expect(page.getByRole("navigation", { name: "ChatGPT mode" })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByPlaceholder("Search chats")).toBeFocused();
  await start(page);
  await expect(page.getByRole("button", { name: "Switch between ChatGPT and Codex" })).toBeDisabled();
  await page.keyboard.press("Control+n");
  await expect(page.getByTitle("Stop response")).toBeVisible();
  await page.getByTitle("Stop response").click();
  await expect(page.getByRole("button", { name: "Switch between ChatGPT and Codex" })).toBeEnabled();
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await page.getByRole("button", { name: "Manage archived chats" }).click();
  await expect(page.getByRole("dialog")).toContainText("Archived example");
});

test("pasted images survive reload and reach the model while plain text still pastes", async ({ page }) => {
  await setup(page);
  const input = page.getByRole("textbox", { name: "Message Lodex" });
  await input.fill("Describe this screenshot");
  await input.evaluate(element => {
    const data = new DataTransfer(); data.items.add(new File([new Uint8Array([137, 80, 78, 71])], "clipboard.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.locator(".attachment")).toContainText("Pasted image.png");
  await page.reload();
  await expect(input).toHaveValue("Describe this screenshot");
  await expect(page.locator(".attachment img")).toBeVisible();
  const prevented = await input.evaluate(element => {
    const data = new DataTransfer(); data.setData("text/plain", "ordinary text");
    const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }); element.dispatchEvent(event); return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await page.getByTitle("Send message", { exact: true }).click();
  expect(await page.evaluate(() => (window as any).__requests.find((r: any) => r.method === "turn/start").params.input)).toContainEqual({ type: "localImage", path: "/pasted.png" });
});

test("sidebar groups, product menu and prompt settings perform their actions", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => sessionStorage.setItem("test-projects", JSON.stringify(["/project"])));
  await page.reload();
  await expect(page.getByRole("button", { name: "Pinned", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Projects", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recents", exact: true })).toBeVisible();
  await page.getByLabel("Expand project", { exact: true }).click();
  await expect(page.locator(".project-chats")).toContainText("Planning a weekend");
  await page.getByTitle("Chat actions").click(); await page.getByRole("button", { name: "Pin", exact: true }).click();
  await expect(page.getByRole("region", { name: "Pinned chats" })).toContainText("Planning a weekend");
  await page.getByRole("button", { name: "Switch between ChatGPT and Codex" }).click();
  await page.getByRole("menuitemradio", { name: /Codex Build/ }).click();
  await expect(page.locator(".product-heading")).toHaveText("Codex");
  await page.getByLabel("Model access", { exact: true }).click();
  await page.getByRole("menuitemradio", { name: /Full access/ }).click();
  await expect(page.getByLabel("Model access", { exact: true })).toHaveText("Full access");
  await page.getByLabel("Model and reasoning").click();
  await expect(page.getByRole("menu", { name: "Model options" })).toContainText("A model for testing");
  await expect(page.getByRole("menu", { name: "Model options" })).toContainText("Supports text and image");
  await page.getByRole("menuitemradio", { name: "High", exact: true }).click();
  await start(page);
  const params = await page.evaluate(() => (window as any).__requests.find((r: any) => r.method === "turn/start").params);
  expect(params).toMatchObject({ accessMode: "full-access", effort: "high", approvalPolicy: "never" });
});

test("temporary chat leaves no persistent draft or history and menu actions are routed", async ({ page }) => {
  await setup(page);
  await page.getByRole("textbox", { name: "Message Lodex" }).fill("Keep my ordinary draft");
  await page.evaluate(() => (window as any).__menu("temporary-chat"));
  await expect(page.locator(".temporary-banner")).toBeVisible();
  await page.getByRole("textbox", { name: "Message Lodex" }).fill("Private temporary words");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("Private temporary words");
  await page.getByTitle("Send message", { exact: true }).click();
  expect(await page.evaluate(() => (window as any).__requests.find((r: any) => r.method === "thread/start").params.ephemeral)).toBe(true);
  await page.evaluate(() => (window as any).__finish());
  await page.evaluate(() => (window as any).__menu("new-chat"));
  await expect(page.locator(".temporary-banner")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message Lodex" })).toHaveValue("Keep my ordinary draft");
  expect(await page.evaluate(() => sessionStorage.getItem("test-runtime"))).not.toContain("Private temporary words");
  await page.evaluate(() => (window as any).__menu("settings"));
  await expect(page.getByRole("dialog")).toContainText("Lodex 0.4.1");
});

test("voice setup is cancellable and recognition inserts text without sending", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const w = window as any;
    w.Worker = class { onmessage: any; onerror: any; constructor() { w.__voiceWorker = this; } postMessage(value: any) { if (value.type === "prepare") setTimeout(() => this.onmessage({ data: { type: "ready" } }), 10); } terminate() { w.__voiceTerminated = true; } };
  });
  await page.getByTitle("Voice to text", { exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Download the speech model once");
  await page.getByTitle("Close voice setup").click();
  await page.getByTitle("Voice to text", { exact: true }).click();
  await page.getByRole("button", { name: "Set up voice typing" }).click();
  await expect(page.getByRole("status")).toContainText("Ready.");
  await page.getByRole("textbox", { name: "Message Lodex" }).fill("My draft:");
  await page.evaluate(() => (window as any).__voiceWorker.onmessage({ data: { type: "text", text: "These are my dictated words." } }));
  await expect(page.getByRole("textbox", { name: "Message Lodex" })).toHaveValue("My draft: These are my dictated words.");
  expect(await page.evaluate(() => (window as any).__requests.some((r: any) => r.method === "turn/start"))).toBe(false);
});

test("long model menus fit a small Ubuntu window", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const w = window as any; const original = w.lodex.codex.request;
    w.lodex.codex.request = async (method: string, params: any) => {
      const result = await original(method, params);
      if (method === "model/list") return { data: Array.from({ length: 8 }, (_, i) => ({ ...result.data[0], id: "model-" + i, displayName: "Available model " + i })) };
      return result;
    };
    w.__emit({ method: "account/updated" });
  });
  await page.setViewportSize({ width: 720, height: 540 });
  await expect(page.getByLabel("Model and reasoning")).toContainText("Available model");
  await page.getByLabel("Model and reasoning").click();
  const bounds = await page.getByRole("menu", { name: "Model options" }).boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(720);
  await expect(page.getByTitle("Voice to text", { exact: true })).toBeInViewport();
});
