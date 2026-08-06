import { ArrowUp, ImagePlus, Paperclip, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AttachedImage } from "../types";

type Props = {
  disabled: boolean;
  running: boolean;
  workspace: string | null;
  onSend(text: string, images: AttachedImage[]): Promise<void>;
  onStop(): void;
};

export function Composer({ disabled, running, workspace, onSend, onStop }: Props) {
  const [value, setValue] = useState("");
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [sending, setSending] = useState(false);
  const textArea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = textArea.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }, [value]);

  const submit = async () => {
    const text = value.trim();
    if ((!text && !images.length) || disabled || sending) return;
    setSending(true);
    setValue("");
    const pendingImages = images;
    setImages([]);
    try {
      await onSend(text, pendingImages);
    } catch {
      setValue(text);
      setImages(pendingImages);
    } finally {
      setSending(false);
      textArea.current?.focus();
    }
  };

  const attachImages = async () => {
    const picked = await window.lodex.workspace.chooseImages();
    setImages((current) => [...current, ...picked].slice(0, 8));
  };

  return (
    <div className="composer-wrap">
      <div className={`composer ${disabled ? "disabled" : ""}`}>
        {!!images.length && (
          <div className="attachment-row">
            {images.map((image) => (
              <div className="attachment" key={image.path}>
                <img src={window.lodex.workspace.imageUrl(image.path)} alt="" />
                <span>{image.name}</span>
                <button onClick={() => setImages((all) => all.filter((item) => item.path !== image.path))}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={textArea}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={workspace ? "Ask Lodex to build, explain, or change something" : "Ask anything, or open a project to start coding"}
          disabled={disabled}
          rows={1}
        />
        <div className="composer-actions">
          <div>
            <button className="icon-button" onClick={attachImages} disabled={disabled} title="Attach images">
              <ImagePlus size={18} />
            </button>
            <button className="icon-button muted-action" disabled title="Attach files (use the project browser in v1)">
              <Paperclip size={18} />
            </button>
          </div>
          {running ? (
            <button className="send-button stop" onClick={onStop} title="Stop">
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button
              className="send-button"
              onClick={() => void submit()}
              disabled={disabled || sending || (!value.trim() && !images.length)}
              title="Send"
            >
              <ArrowUp size={18} strokeWidth={2.6} />
            </button>
          )}
        </div>
      </div>
      <p className="composer-caption">Lodex can make mistakes. Review commands and file changes.</p>
    </div>
  );
}
