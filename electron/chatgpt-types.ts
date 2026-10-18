export type ChatGPTAction = "back" | "forward" | "reload" | "home" | "browser" | "workspace" | "info" | "clear-session";
export type ChatGPTState = {
  origin: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error: string | null;
  notice: string | null;
  captureSources: Array<{ id: string; name: string; thumbnail: string }> | null;
};
export type ChatGPTApi = {
  state(): Promise<ChatGPTState>;
  action(action: ChatGPTAction): Promise<void>;
  selectCapture(id: string | null): Promise<void>;
  onChange(callback: (state: ChatGPTState) => void): () => void;
};
