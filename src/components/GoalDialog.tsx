import { Goal, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ThreadGoal } from "../types";

type Props = {
  goal: ThreadGoal | null;
  onCancel(): void;
  onSave(objective: string, tokenBudget?: number): Promise<void>;
  onClear(): Promise<void>;
};

export function GoalDialog({ goal, onCancel, onSave, onClear }: Props) {
  const [objective, setObjective] = useState(goal?.objective || "");
  const [budget, setBudget] = useState(goal?.tokenBudget ? String(goal.tokenBudget) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setObjective(goal?.objective || "");
    setBudget(goal?.tokenBudget ? String(goal.tokenBudget) : "");
  }, [goal]);

  const save = async () => {
    const value = objective.trim();
    if (!value || saving) return;
    setSaving(true);
    try {
      const parsed = budget ? Number.parseInt(budget, 10) : undefined;
      await onSave(value, parsed && parsed > 0 ? parsed : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="goal-dialog" role="dialog" aria-modal="true" aria-labelledby="goal-title">
        <div className="dialog-title"><span className="dialog-icon"><Goal size={19} /></span><div><h2 id="goal-title">{goal ? "Edit goal" : "Set a goal"}</h2><p>Keep Lodex pursuing one durable outcome across turns.</p></div></div>
        <label>
          <span>Objective</span>
          <textarea value={objective} onChange={(event) => setObjective(event.target.value)} maxLength={4000} rows={4} autoFocus placeholder="Finish the feature and keep the build green" />
        </label>
        <label>
          <span>Optional token budget</span>
          <input value={budget} onChange={(event) => setBudget(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="40000" />
        </label>
        <div className="dialog-actions">
          {goal && <button className="danger-quiet" onClick={() => void onClear()}><Trash2 size={15} />Clear</button>}
          <span />
          <button className="secondary-button" onClick={onCancel}>Cancel</button>
          <button className="primary-button" onClick={() => void save()} disabled={!objective.trim() || saving}>{saving ? "Saving…" : "Save goal"}</button>
        </div>
      </div>
    </div>
  );
}
