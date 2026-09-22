import {
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleEllipsis,
  Copy,
  FileCode2,
  Globe2,
  Image as ImageIcon,
  Sparkles,
  TerminalSquare,
  Wrench,
  ArrowDown,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ThreadItem, UserInput } from "../types";
import { ErrorBoundary } from "./ErrorBoundary";

type Props = {
  items: ThreadItem[];
  loading: boolean;
  running: boolean;
  onEdit(item: ThreadItem): void;
  onRegenerate(): void;
};

const inputText = (inputs: UserInput[] | undefined) =>
  inputs?.filter((input) => input?.type === "text").map((input) => (input.type === "text" ? input.text : "")).join("\n") || "";

function CodeBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  return <div className="code-container"><header><span>Code</span><button onClick={() => {
    void navigator.clipboard.writeText(ref.current?.textContent || "").then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); }).catch(() => undefined);
  }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy code"}</button></header><pre ref={ref} className="code-block">{children}</pre></div>;
}

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children: codeChildren }) => <CodeBlock>{codeChildren}</CodeBlock>,
        a: ({ children: linkChildren, ...props }) => (
          <a {...props} target="_blank" rel="noreferrer">
            {linkChildren}
          </a>
        ),
        code: ({ className, children: codeChildren, ...props }) => {
          return <code className={className || "inline-code"} {...props}>{codeChildren}</code>;
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function ToolItem({ item }: { item: ThreadItem }) {
  const [expanded, setExpanded] = useState(false);
  const isCommand = item.type === "commandExecution";
  const isFile = item.type === "fileChange";
  const isSearch = item.type === "webSearch";
  const title = isCommand
    ? item.command || "Command"
    : isFile
      ? `${item.changes?.length || 0} file change${item.changes?.length === 1 ? "" : "s"}`
      : isSearch
        ? `Searched for ${item.query || "the web"}`
        : item.tool || item.type.replace(/([A-Z])/g, " $1");
  const Icon = isCommand ? TerminalSquare : isFile ? FileCode2 : isSearch ? Globe2 : Wrench;
  const hasDetails = Boolean(item.aggregatedOutput || item.changes?.length || item.arguments || item.result || item.error);

  return (
    <div className="tool-item">
      <button className="tool-header" onClick={() => hasDetails && setExpanded((value) => !value)}>
        <Icon size={15} />
        <span>{title}</span>
        {item.status === "inProgress" ? <CircleEllipsis size={15} className="spin-soft" /> : <span className="tool-status">{item.status === "failed" || item.status === "declined" ? item.status : <Check size={14} />}</span>}
        {hasDetails && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
      </button>
      {expanded && hasDetails && (
        <div className="tool-details">
          {item.aggregatedOutput && <pre>{item.aggregatedOutput.slice(-64_000)}</pre>}
          {item.changes?.map((change) => (
            <div className="change-row" key={`${item.id}-${change.path}`}>
              <strong>{typeof change.kind === "string" ? change.kind : change.kind?.type || "change"}</strong>
              <span>{change.path}</span>
            </div>
          ))}
          {item.arguments !== undefined && <pre>{JSON.stringify(item.arguments, null, 2)}</pre>}
          {item.result !== undefined && item.result !== null && <pre>{JSON.stringify(item.result, null, 2)}</pre>}
          {item.error !== undefined && item.error !== null && <pre className="error-text">{JSON.stringify(item.error, null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}

const MessageItem = memo(function MessageItem({ item, onEdit, onRegenerate, canRegenerate }: { item: ThreadItem; onEdit?: (item: ThreadItem) => void; onRegenerate: () => void; canRegenerate: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* Clipboard may be unavailable. */ }
  };

  if (item.type === "userMessage") {
    const content = Array.isArray(item.content) ? (item.content as UserInput[]) : [];
    const messageContent = content.filter(input => input.type !== "text" || !input.text.startsWith("Attached file: "));
    const textAttachments = content.filter((input): input is Extract<UserInput, { type: "text" }> => input.type === "text" && input.text.startsWith("Attached file: "));
    const images = content.filter((input) => input?.type === "localImage" || input?.type === "image");
    return (
      <div className="message user-message">
        {!!images.length && (
          <div className="message-images">
            {images.map((image, index) => {
              const src = image.type === "localImage" ? window.lodex.workspace.imageUrl(image.path) : image.url;
              return <img src={src} alt="Attached" key={`${item.id}-${index}`} />;
            })}
          </div>
        )}
        {inputText(messageContent) && <div className="user-bubble"><Markdown>{inputText(messageContent)}</Markdown></div>}
        {textAttachments.map((input, index) => <details className="text-attachment" key={index}><summary><FileCode2 size={16} />{input.text.split("\n", 1)[0].replace("Attached file: ", "")}</summary><pre>{input.text.slice(input.text.indexOf("\n") + 1)}</pre></details>)}
        {content.filter(input => input?.type === "mention" || input?.type === "skill").map((input, index) => <div className="file-reference" key={index}><FileCode2 size={16} />{"name" in input ? input.name : "Attachment"}</div>)}
        {inputText(content) && <div className="message-actions"><button title="Copy message" onClick={() => void copy(inputText(content))}><Copy size={15} /></button>{onEdit && <button title="Edit in a new branch" onClick={() => onEdit(item)}><Pencil size={15} /></button>}</div>}
      </div>
    );
  }

  if (item.type === "agentMessage") {
    return (
      <div className={`message assistant-message ${item.phase === "commentary" ? "commentary-message" : ""}`}>
        <div className="assistant-mark">L</div>
        <div className="message-body">
          <Markdown>{item.text || ""}</Markdown>
          {item.text && item.phase !== "commentary" && (
            <div className="message-actions">
              <button onClick={() => void copy(item.text || "")} title="Copy response">{copied ? <CheckCheck size={14} /> : <Copy size={14} />}<span>{copied ? "Copied" : "Copy"}</span></button>
              {canRegenerate && <button title="Try again in a new branch" onClick={onRegenerate}><RotateCcw size={15} /><span>Try again</span></button>}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (item.type === "reasoning") {
    const summary = Array.isArray(item.summary) ? item.summary.filter(entry => typeof entry === "string").join("\n") : "Thinking";
    return <div className="reasoning-line"><CircleEllipsis size={15} /><span>{summary}</span></div>;
  }

  if (item.type === "plan") {
    return <div className="plan-message"><CircleEllipsis size={15} /><div><strong>Plan</strong><Markdown>{item.text || ""}</Markdown></div></div>;
  }

  if (item.type === "contextCompaction") {
    return <div className="system-line"><Sparkles size={14} /><span>Conversation context compacted</span></div>;
  }

  if (item.type === "enteredReviewMode") {
    return <div className="system-line"><Check size={14} /><span>Review started</span></div>;
  }

  if (item.type === "exitedReviewMode") {
    const review = typeof item.review === "string" ? item.review : "Review completed";
    return <div className="message assistant-message"><div className="assistant-mark">L</div><div className="message-body"><Markdown>{review}</Markdown></div></div>;
  }

  if (item.type === "imageGeneration" && item.savedPath) {
    return (
      <div className="generated-image">
        <div><ImageIcon size={15} /> Generated image</div>
        <img src={window.lodex.workspace.imageUrl(item.savedPath)} alt={item.revisedPrompt || "Generated"} />
      </div>
    );
  }

  if (["commandExecution", "fileChange", "mcpToolCall", "dynamicToolCall", "webSearch", "collabAgentToolCall"].includes(item.type)) {
    return <ToolItem item={item} />;
  }

  return null;
});

export function MessageList({ items, loading, running, onEdit, onRegenerate }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [visibleCount, setVisibleCount] = useState(150);
  const lastAnswer = [...items].reverse().find(item => item.type === "agentMessage" && item.phase !== "commentary");

  useEffect(() => {
    const element = container.current;
    if (following.current && element) element.scrollTop = element.scrollHeight;
  }, [items, running]);

  if (loading) {
    return <div className="conversation-state"><div className="loader" /><span>Opening task…</span></div>;
  }

  return (
    <div className="transcript-wrap">
    <div className="message-list" ref={container} onScroll={() => {
      const element = container.current;
      if (!element) return;
      following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90;
      setShowJump(!following.current);
    }}>
      {items.length > visibleCount && <button className="load-earlier secondary-button" onClick={() => { following.current = false; setVisibleCount(value => value + 150); }}>Show earlier messages</button>}
      {items.slice(-visibleCount).map((item) => <ErrorBoundary compact key={item.id}><MessageItem item={item} onEdit={running ? undefined : onEdit} onRegenerate={onRegenerate} canRegenerate={!running && item.id === lastAnswer?.id} /></ErrorBoundary>)}
      {running && !items.some((item) => item.type === "agentMessage" && !item.text) && (
        <div className="working-indicator"><span /><span /><span /></div>
      )}
      <span className="sr-only" role="status">{running ? "Lodex is responding" : "Response complete"}</span>
    </div>
    {showJump && <button className="jump-latest" title="Jump to latest" onClick={() => { const element = container.current; if (element) element.scrollTop = element.scrollHeight; following.current = true; setShowJump(false); }}><ArrowDown size={18} /></button>}
    </div>
  );
}
