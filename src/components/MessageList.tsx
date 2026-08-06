import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleEllipsis,
  FileCode2,
  Globe2,
  Image as ImageIcon,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ThreadItem, UserInput } from "../types";

type Props = {
  items: ThreadItem[];
  loading: boolean;
  running: boolean;
};

const inputText = (inputs: UserInput[] | undefined) =>
  inputs?.filter((input) => input.type === "text").map((input) => (input.type === "text" ? input.text : "")).join("\n") || "";

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children: linkChildren, ...props }) => (
          <a {...props} target="_blank" rel="noreferrer">
            {linkChildren}
          </a>
        ),
        code: ({ className, children: codeChildren, ...props }) => {
          const block = Boolean(className?.startsWith("language-"));
          return block ? (
            <pre className="code-block">
              <code className={className} {...props}>{codeChildren}</code>
            </pre>
          ) : (
            <code className="inline-code" {...props}>{codeChildren}</code>
          );
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function ToolItem({ item }: { item: ThreadItem }) {
  const [expanded, setExpanded] = useState(item.status === "inProgress");
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
        {item.status === "inProgress" ? <CircleEllipsis size={15} className="spin-soft" /> : <Check size={14} />}
        {hasDetails && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
      </button>
      {expanded && hasDetails && (
        <div className="tool-details">
          {item.aggregatedOutput && <pre>{item.aggregatedOutput}</pre>}
          {item.changes?.map((change) => (
            <div className="change-row" key={`${item.id}-${change.path}`}>
              <strong>{change.kind}</strong>
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

function MessageItem({ item }: { item: ThreadItem }) {
  if (item.type === "userMessage") {
    const content = Array.isArray(item.content) ? (item.content as UserInput[]) : [];
    const images = content.filter((input) => input.type === "localImage" || input.type === "image");
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
        {inputText(content) && <div className="user-bubble"><Markdown>{inputText(content)}</Markdown></div>}
      </div>
    );
  }

  if (item.type === "agentMessage") {
    return (
      <div className={`message assistant-message ${item.phase === "commentary" ? "commentary-message" : ""}`}>
        <div className="assistant-mark">L</div>
        <div className="message-body"><Markdown>{item.text || ""}</Markdown></div>
      </div>
    );
  }

  if (item.type === "reasoning") {
    const summary = item.summary?.join("\n") || "Thinking";
    return <div className="reasoning-line"><CircleEllipsis size={15} /><span>{summary}</span></div>;
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
}

export function MessageList({ items, loading, running }: Props) {
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: running ? "auto" : "smooth", block: "end" });
  }, [items, running]);

  if (loading) {
    return <div className="conversation-state"><div className="loader" /><span>Opening task…</span></div>;
  }

  return (
    <div className="message-list">
      {items.map((item) => <MessageItem item={item} key={item.id} />)}
      {running && !items.some((item) => item.type === "agentMessage" && !item.text) && (
        <div className="working-indicator"><span /><span /><span /></div>
      )}
      <div ref={end} />
    </div>
  );
}
