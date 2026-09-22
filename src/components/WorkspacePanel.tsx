import Editor from "@monaco-editor/react";
import "../editor";
import {
  Check,
  ChevronDown,
  ChevronRight,
  File,
  FileDiff,
  Files,
  Folder,
  FolderOpen,
  GitBranch,
  LoaderCircle,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FileNode, GitFile, GitStatus } from "../types";

type Props = {
  visible: boolean;
  workspace: string | null;
  tree: FileNode[];
  git: GitStatus | null;
  turnDiff: string;
  onClose(): void;
  onOpenWorkspace(): void;
  onRefresh(): Promise<void>;
};

type Tab = "files" | "git" | "changes";

const languageForPath = (filePath: string) => {
  const extension = filePath.split(".").at(-1)?.toLowerCase();
  const languages: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    json: "json", css: "css", scss: "scss", html: "html", md: "markdown",
    py: "python", rs: "rust", go: "go", java: "java", c: "c", cpp: "cpp",
    yml: "yaml", yaml: "yaml", toml: "ini", sh: "shell", sql: "sql",
  };
  return languages[extension || ""] || "plaintext";
};

function TreeNode({ node, onOpen }: { node: FileNode; onOpen(path: string): void }) {
  const [open, setOpen] = useState(false);
  if (node.type === "file") {
    return (
      <button className="file-row" onClick={() => onOpen(node.path)} title={node.path}>
        <File size={14} />
        <span>{node.name}</span>
      </button>
    );
  }
  return (
    <div>
      <button className="file-row folder-row" onClick={() => setOpen((value) => !value)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {open ? <FolderOpen size={14} /> : <Folder size={14} />}
        <span>{node.name}</span>
      </button>
      {open && <div className="tree-children">{node.children?.map((child) => <TreeNode node={child} onOpen={onOpen} key={child.path} />)}</div>}
    </div>
  );
}

function GitRow({ file, onPick, onRefresh }: { file: GitFile; onPick(file: GitFile, staged: boolean): void; onRefresh(): Promise<void> }) {
  const staged = file.index !== " " && file.index !== "?";
  const changed = file.workingTree !== " ";
  return (
    <div className="git-file-row">
      <button onClick={() => onPick(file, staged && !changed)} title={file.path}>
        <span className="git-code">{file.index}{file.workingTree}</span>
        <span>{file.path}</span>
      </button>
      <button
        className="git-stage-button"
        onClick={() => void (async () => {
          if (staged) await window.lodex.git.unstage(file.path);
          else await window.lodex.git.stage(file.path);
          await onRefresh();
        })()}
        title={staged ? "Unstage" : "Stage"}
      >
        {staged ? <Check size={14} /> : "+"}
      </button>
    </div>
  );
}

export function WorkspacePanel({
  visible,
  workspace,
  tree,
  git,
  turnDiff,
  onClose,
  onOpenWorkspace,
  onRefresh,
}: Props) {
  const [tab, setTab] = useState<Tab>("files");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [diff, setDiff] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = content !== savedContent;

  useEffect(() => {
    setSelectedFile(null);
    setContent("");
    setSavedContent("");
  }, [workspace]);

  const title = useMemo(() => selectedFile?.replaceAll("\\", "/").split("/").at(-1), [selectedFile]);

  const openFile = async (filePath: string) => {
    setBusy(true);
    try {
      const file = await window.lodex.workspace.read(filePath);
      setSelectedFile(file.path);
      setContent(file.content);
      setSavedContent(file.content);
      setDiff("");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!selectedFile || !dirty) return;
    await window.lodex.workspace.write(selectedFile, content);
    setSavedContent(content);
    await onRefresh();
  };

  const openGitDiff = async (file: GitFile, staged: boolean) => {
    setBusy(true);
    try {
      setSelectedFile(file.path);
      setDiff(await window.lodex.git.diff(file.path, staged));
      setContent("");
      setSavedContent("");
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <aside className="workspace-panel">
      <div className="panel-tabs">
        <button className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}><Files size={15} />Files</button>
        <button className={tab === "git" ? "active" : ""} onClick={() => setTab("git")}><GitBranch size={15} />Git</button>
        <button className={tab === "changes" ? "active" : ""} onClick={() => setTab("changes")}><FileDiff size={15} />Changes</button>
        <button className="icon-button panel-close" onClick={onClose} title="Close workspace"><X size={16} /></button>
      </div>

      {!workspace ? (
        <div className="panel-empty">
          <FolderOpen size={28} />
          <p>Open a project to browse and edit files.</p>
          <button className="primary-button" onClick={onOpenWorkspace}>Open project</button>
        </div>
      ) : (
        <>
          <div className="panel-toolbar">
            <span title={workspace}>{workspace.replaceAll("\\", "/").split("/").at(-1)}</span>
            <button className="icon-button" onClick={() => void onRefresh()} title="Refresh"><RefreshCw size={14} /></button>
          </div>
          <div className="panel-content">
            <div className="panel-browser">
              {tab === "files" && tree.map((node) => <TreeNode node={node} onOpen={openFile} key={node.path} />)}
              {tab === "git" && (
                git?.isRepository ? (
                  <>
                    <div className="git-branch"><GitBranch size={14} />{git.branch || "HEAD"}</div>
                    {git.files.map((file) => <GitRow file={file} onPick={openGitDiff} onRefresh={onRefresh} key={file.path} />)}
                    {!git.files.length && <div className="clean-state"><Check size={16} />Working tree clean</div>}
                  </>
                ) : <div className="panel-hint">This folder is not a Git repository.</div>
              )}
              {tab === "changes" && (
                turnDiff ? <pre className="diff-view standalone-diff">{turnDiff}</pre> : <div className="panel-hint">Changes from the active turn appear here.</div>
              )}
            </div>

            {(selectedFile || busy) && tab !== "changes" && (
              <div className="editor-pane">
                <div className="editor-header">
                  <span>{busy ? "Opening…" : title}</span>
                  {dirty && <i>Modified</i>}
                  {dirty && <button className="icon-button" onClick={() => void save()} title="Save"><Save size={14} /></button>}
                  <button className="icon-button" onClick={() => setSelectedFile(null)} title="Close"><X size={14} /></button>
                </div>
                {busy ? (
                  <div className="editor-loading"><LoaderCircle className="spin" size={20} /></div>
                ) : diff ? (
                  <pre className="diff-view">{diff || "No textual diff is available."}</pre>
                ) : (
                  <Editor
                    value={content}
                    language={languageForPath(selectedFile || "")}
                    theme="lodex-light"
                    onChange={(value) => setContent(value ?? "")}
                    beforeMount={(monacoApi) => {
                      monacoApi.editor.defineTheme("lodex-light", {
                        base: "vs",
                        inherit: true,
                        rules: [],
                        colors: {
                          "editor.background": "#fbfbfa",
                          "editorLineNumber.foreground": "#aaa9a4",
                          "editor.lineHighlightBackground": "#f2f1ee",
                        },
                      });
                    }}
                    onMount={(editor, monacoApi) => {
                      editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, () => void save());
                    }}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineHeight: 20,
                      padding: { top: 12 },
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      automaticLayout: true,
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
