import {
  Activity,
  Check,
  Circle,
  CircleDashed,
  FileCode2,
  Gauge,
  Goal,
  Sparkles,
  TerminalSquare,
  Wrench,
  X,
} from "lucide-react";
import type { PlanStep, ThreadGoal, ThreadItem } from "../types";

type Props = {
  visible: boolean;
  running: boolean;
  items: ThreadItem[];
  plan: PlanStep[];
  goal: ThreadGoal | null;
  tokenUsage: Record<string, unknown> | null;
  onClose(): void;
  onEditGoal(): void;
  onCompact(): void;
};

const activityTypes = new Set([
  "commandExecution",
  "fileChange",
  "mcpToolCall",
  "dynamicToolCall",
  "webSearch",
  "collabAgentToolCall",
  "contextCompaction",
]);

const activityTitle = (item: ThreadItem) => {
  if (item.type === "commandExecution") return item.command || "Ran a command";
  if (item.type === "fileChange") return `${item.changes?.length || 0} file change${item.changes?.length === 1 ? "" : "s"}`;
  if (item.type === "webSearch") return `Searched ${item.query || "the web"}`;
  if (item.type === "contextCompaction") return "Compacted conversation context";
  return item.tool || item.type.replace(/([A-Z])/g, " $1");
};

const ActivityIcon = ({ item }: { item: ThreadItem }) => {
  if (item.type === "commandExecution") return <TerminalSquare size={15} />;
  if (item.type === "fileChange") return <FileCode2 size={15} />;
  if (item.type === "contextCompaction") return <Sparkles size={15} />;
  return <Wrench size={15} />;
};

const statusIcon = (status: PlanStep["status"]) => {
  if (status === "completed") return <Check size={13} />;
  if (status === "inProgress") return <CircleDashed size={13} className="spin" />;
  return <Circle size={11} />;
};

const firstNumber = (value: unknown): number | null => {
  if (typeof value === "number") return value;
  if (!value || typeof value !== "object") return null;
  for (const key of ["totalTokens", "total_tokens", "inputTokens", "input_tokens"]) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === "number") return candidate;
  }
  return null;
};

export function ActivityPanel({
  visible,
  running,
  items,
  plan,
  goal,
  tokenUsage,
  onClose,
  onEditGoal,
  onCompact,
}: Props) {
  if (!visible) return null;
  const activity = items.filter((item) => activityTypes.has(item.type));
  const completed = plan.filter((step) => step.status === "completed").length;
  const tokenCount = firstNumber(tokenUsage);

  return (
    <aside className="activity-panel" aria-label="Task activity">
      <header className="drawer-header">
        <div><Activity size={17} /><span>Activity</span></div>
        <button className="icon-button" onClick={onClose} title="Close activity"><X size={17} /></button>
      </header>

      <div className="drawer-scroll">
        <section className="activity-section">
          <div className="section-heading">
            <span>Goal</span>
            <button onClick={onEditGoal}>{goal ? "Edit" : "Set goal"}</button>
          </div>
          {goal ? (
            <div className="goal-card">
              <Goal size={17} />
              <div>
                <strong>{goal.objective}</strong>
                <span>{goal.status}{goal.tokenBudget ? ` · ${Math.round(((goal.tokensUsed || 0) / goal.tokenBudget) * 100)}% budget used` : ""}</span>
              </div>
            </div>
          ) : <p className="drawer-empty">Give this chat a durable outcome to keep working toward.</p>}
        </section>

        <section className="activity-section">
          <div className="section-heading">
            <span>Plan</span>
            {!!plan.length && <small>{completed}/{plan.length}</small>}
          </div>
          {!!plan.length ? (
            <ol className="plan-list">
              {plan.map((entry, index) => (
                <li className={entry.status} key={`${entry.step}-${index}`}>
                  <span className="plan-status">{statusIcon(entry.status)}</span>
                  <span>{entry.step}</span>
                </li>
              ))}
            </ol>
          ) : <p className="drawer-empty">{running ? "A plan will appear here when Lodex shares one." : "No plan has been shared for this chat."}</p>}
        </section>

        <section className="activity-section">
          <div className="section-heading"><span>Timeline</span><small>{activity.length || ""}</small></div>
          {!!activity.length ? (
            <div className="activity-timeline">
              {activity.map((item) => (
                <div className="activity-row" key={item.id}>
                  <span className={`activity-icon ${item.status === "inProgress" ? "active" : ""}`}><ActivityIcon item={item} /></span>
                  <div><strong>{activityTitle(item)}</strong><span>{item.status === "inProgress" ? "In progress" : "Completed"}</span></div>
                </div>
              ))}
            </div>
          ) : <p className="drawer-empty">Commands, searches, and file changes will appear here.</p>}
        </section>

        <section className="activity-section compact-section">
          <div className="section-heading"><span>Context</span></div>
          <div className="context-row"><Gauge size={15} /><span>{tokenCount ? `${tokenCount.toLocaleString()} tokens in this chat` : "Usage updates appear while a task runs"}</span></div>
          <button className="secondary-button compact-button" onClick={onCompact} disabled={running}>Compact chat</button>
        </section>
      </div>
    </aside>
  );
}
