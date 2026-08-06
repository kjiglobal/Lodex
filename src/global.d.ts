import type { LodexApi } from "./types";

declare global {
  interface Window {
    lodex: LodexApi;
  }

  interface WindowOrWorkerGlobalScope {
    MonacoEnvironment?: {
      getWorker(_moduleId: string, label: string): Worker;
    };
  }
}

export {};
