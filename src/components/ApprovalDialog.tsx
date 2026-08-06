import { AlertTriangle, Check, ShieldAlert, TerminalSquare, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { PendingServerRequest } from "../types";

type Props = {
  request: PendingServerRequest;
  onResolve(result: unknown): void;
};

type Question = {
  id: string;
  header: string;
  question: string;
  options?: Array<{ label: string; description: string }> | null;
};

export function ApprovalDialog({ request, onResolve }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const isCommand = request.method === "item/commandExecution/requestApproval";
  const isFile = request.method === "item/fileChange/requestApproval";
  const isPermission = request.method === "item/permissions/requestApproval";
  const isQuestion = request.method === "item/tool/requestUserInput";
  const questions = (request.params.questions as Question[] | undefined) || [];
  const title = isCommand ? "Run this command?" : isFile ? "Apply these changes?" : isPermission ? "Grant additional access?" : isQuestion ? "Lodex needs your input" : "Action requires approval";
  const command = typeof request.params.command === "string" ? request.params.command : "";

  const changes = useMemo(() => {
    const value = request.params.changes;
    return Array.isArray(value) ? value : [];
  }, [request]);

  const decline = () => {
    if (isCommand || isFile) onResolve({ decision: "decline" });
    else if (isPermission) onResolve({ permissions: {}, scope: "turn" });
    else if (isQuestion) {
      const emptyAnswers = Object.fromEntries(questions.map((question) => [question.id, { answers: [] }]));
      onResolve({ answers: emptyAnswers });
    } else onResolve({ action: "cancel", content: null, _meta: null });
  };

  const accept = (session = false) => {
    if (isCommand || isFile) onResolve({ decision: session ? "acceptForSession" : "accept" });
    else if (isPermission) onResolve({ permissions: request.params.permissions || {}, scope: session ? "session" : "turn" });
    else if (isQuestion) {
      const response = Object.fromEntries(questions.map((question) => [question.id, { answers: answers[question.id] ? [answers[question.id]] : [] }]));
      onResolve({ answers: response });
    } else onResolve({ action: "accept", content: {}, _meta: null });
  };

  return (
    <div className="modal-backdrop">
      <div className="approval-dialog" role="dialog" aria-modal="true" aria-labelledby="approval-title">
        <div className="approval-icon">{isCommand ? <TerminalSquare size={20} /> : <ShieldAlert size={20} />}</div>
        <div className="approval-copy">
          <h2 id="approval-title">{title}</h2>
          {request.params.reason != null && <p>{String(request.params.reason)}</p>}
          {command && <pre className="approval-command">{command}</pre>}
          {!!changes.length && <pre className="approval-command">{JSON.stringify(changes, null, 2)}</pre>}
          {isPermission && <pre className="approval-command">{JSON.stringify(request.params.permissions, null, 2)}</pre>}
          {isQuestion && (
            <div className="approval-questions">
              {questions.map((question) => (
                <fieldset key={question.id}>
                  <legend>{question.header}</legend>
                  <p>{question.question}</p>
                  {question.options?.map((option) => (
                    <label key={option.label}>
                      <input
                        type="radio"
                        name={question.id}
                        value={option.label}
                        checked={answers[question.id] === option.label}
                        onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.label }))}
                      />
                      <span><strong>{option.label}</strong><small>{option.description}</small></span>
                    </label>
                  )) || (
                    <input className="answer-input" value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} />
                  )}
                </fieldset>
              ))}
            </div>
          )}
          <div className="approval-warning"><AlertTriangle size={14} />Only approve actions you understand.</div>
          <div className="approval-actions">
            <button className="secondary-button" onClick={decline}><X size={15} />Decline</button>
            {(isCommand || isFile || isPermission) && <button className="secondary-button" onClick={() => accept(true)}>Allow for session</button>}
            <button className="primary-button" onClick={() => accept(false)}><Check size={15} />{isQuestion ? "Submit" : "Allow once"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
