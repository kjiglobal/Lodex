import { Blocks, ExternalLink, Puzzle, RefreshCw, Sparkles, X } from "lucide-react";
import type { ChatApp, Skill } from "../types";

type Props = {
  visible: boolean;
  loading: boolean;
  apps: ChatApp[];
  skills: Skill[];
  onClose(): void;
  onRefresh(): void;
};

export function ToolsPanel({ visible, loading, apps, skills, onClose, onRefresh }: Props) {
  if (!visible) return null;
  return (
    <aside className="tools-panel" aria-label="Tools and apps">
      <header className="drawer-header">
        <div><Blocks size={17} /><span>Tools</span></div>
        <div>
          <button className="icon-button" onClick={onRefresh} title="Refresh tools"><RefreshCw size={16} className={loading ? "spin" : ""} /></button>
          <button className="icon-button" onClick={onClose} title="Close tools"><X size={17} /></button>
        </div>
      </header>
      <div className="drawer-scroll">
        <section className="activity-section">
          <div className="section-heading"><span>Apps</span><small>{apps.length || ""}</small></div>
          <div className="tool-catalog">
            {apps.map((app) => (
              <div className="catalog-card" key={app.id}>
                <span className="catalog-logo">{app.logoUrl ? <img src={app.logoUrl} alt="" /> : <Puzzle size={18} />}</span>
                <div><strong>{app.name}</strong><p>{app.description || (app.isEnabled ? "Available to Lodex" : "Available to connect")}</p></div>
                <span className={`catalog-state ${app.isEnabled ? "enabled" : ""}`}>{app.isEnabled ? "On" : "Off"}</span>
                {app.installUrl && <a href={app.installUrl} target="_blank" rel="noreferrer" title="Open app settings"><ExternalLink size={15} /></a>}
              </div>
            ))}
            {!apps.length && !loading && <p className="drawer-empty">No ChatGPT apps are available for this account yet.</p>}
          </div>
        </section>
        <section className="activity-section">
          <div className="section-heading"><span>Skills</span><small>{skills.length || ""}</small></div>
          <div className="tool-catalog">
            {skills.map((skill) => (
              <div className="catalog-card skill-card" key={skill.path}>
                <span className="catalog-logo"><Sparkles size={18} /></span>
                <div><strong>{skill.interface?.displayName || skill.name}</strong><p>{skill.interface?.shortDescription || skill.description || "Reusable Lodex workflow"}</p></div>
                <span className={`catalog-state ${skill.enabled ? "enabled" : ""}`}>{skill.enabled ? "On" : "Off"}</span>
              </div>
            ))}
            {!skills.length && !loading && <p className="drawer-empty">Open a project to discover its available skills.</p>}
          </div>
        </section>
        {loading && <div className="drawer-loading"><div className="loader" />Loading tools…</div>}
      </div>
    </aside>
  );
}
