import { Check, ChevronDown, Shield, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AccessMode, Model } from "../types";

export type PromptOptions = {
  models: Model[]; selectedModel: string; effort: string; access: AccessMode;
  onModel(value: string): void; onEffort(value: string): void; onAccess(value: AccessMode): void;
};

export const effortLabel = (value: string) => ({ xhigh: "Extra High", high: "High", medium: "Medium", low: "Low", minimal: "Minimal", none: "None", max: "Max", ultra: "Ultra" }[value] || value);
const accessOptions: { value: AccessMode; label: string; description: string }[] = [
  { value: "read-only", label: "Read only", description: "Read files; request approval for changes." },
  { value: "workspace-write", label: "Project access", description: "Edit files in this chat’s project; ask before broader access." },
  { value: "full-access", label: "Full access", description: "Allow commands, file changes, and network access without approval." },
];

export function PromptControls({ options, disabled, side }: { options: PromptOptions; disabled: boolean; side: "access" | "model" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", outside); window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape); };
  }, []);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const model = options.models.find(m => m.id === options.selectedModel || m.model === options.selectedModel);
  const access = accessOptions.find(a => a.value === options.access)!;
  return <div className={`prompt-control ${side}`} ref={ref}>
    <button className={`prompt-control-trigger ${side === "access" && options.access === "full-access" ? "full-access" : ""}`} aria-label={side === "access" ? "Model access" : "Model and reasoning"} aria-haspopup="menu" aria-expanded={open} disabled={disabled || (side === "model" && !model)} onClick={() => setOpen(!open)}>
      {side === "access" ? <>{options.access === "full-access" ? <ShieldAlert size={17} /> : <Shield size={17} />}<span>{access.label}</span></> : <><span className="prompt-model-name">{model?.displayName || model?.id || "Loading models…"}</span><span className="prompt-effort">{effortLabel(options.effort)}</span><ChevronDown size={14} /></>}
    </button>
    {open && <div className="prompt-options" role="menu" aria-label={side === "access" ? "Access options" : "Model options"}>
      {side === "access" ? accessOptions.map(option => <button key={option.value} role="menuitemradio" aria-checked={options.access === option.value} onClick={() => { options.onAccess(option.value); setOpen(false); }}><span>{option.label}<small>{option.description}</small></span>{options.access === option.value && <Check size={16} />}</button>) : <>
        <p className="prompt-options-heading">Models available to your account</p>
        {options.models.map(option => <button key={option.id} role="menuitemradio" aria-checked={option.id === options.selectedModel} onClick={() => options.onModel(option.id)}><span>{option.displayName || option.id}<small>{option.description || option.model}</small>{option.inputModalities?.length ? <small>Supports {option.inputModalities.join(" and ")}</small> : null}</span>{option.id === options.selectedModel && <Check size={16} />}</button>)}
        {!!model?.supportedReasoningEfforts?.length && <><p className="prompt-options-heading">Reasoning effort</p>{model.supportedReasoningEfforts.map(option => <button role="menuitemradio" key={option.reasoningEffort} aria-checked={options.effort === option.reasoningEffort} onClick={() => { options.onEffort(option.reasoningEffort); setOpen(false); }}><span>{effortLabel(option.reasoningEffort)}<small>{option.description}</small></span>{options.effort === option.reasoningEffort && <Check size={16} />}</button>)}</>}
      </>}
    </div>}
  </div>;
}
