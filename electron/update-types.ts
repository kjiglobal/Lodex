export type UpdateStatus = "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "installing" | "installed" | "error";

export type UpdateState = {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  canInstall: boolean;
  progress?: number;
  message: string;
};
