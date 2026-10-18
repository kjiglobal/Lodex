import type { LodexApi } from "./types";
import type { ChatGPTApi } from "../electron/chatgpt-types";

declare global {
  interface Window {
    lodex: LodexApi;
    chatgpt: ChatGPTApi;
  }

  interface WindowOrWorkerGlobalScope {
    MonacoEnvironment?: {
      getWorker(_moduleId: string, label: string): Worker;
    };
  }
}

export {};
