import { useEffect, useRef, useState } from "react";
import { useVoiceInput } from "../hooks/useVoiceInput";

export const MAX_ITEM_TEXT = 80;

type Props = {
  onAdd: (text: string) => void;
  apiKey: string;
};

export function AddItem({ onAdd, apiKey }: Props) {
  const [text, setText] = useState("");
  const {
    recording,
    transcribing,
    transcript,
    error,
    supported,
    level,
    start,
    stop,
    cancel,
    reset,
  } = useVoiceInput({ apiKey });

  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;

  useEffect(() => {
    if (transcript) {
      const trimmed = transcript.trim().slice(0, MAX_ITEM_TEXT);
      if (trimmed) {
        onAddRef.current(trimmed);
        reset();
      } else {
        setText("");
        reset();
      }
    }
  }, [transcript, reset]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText("");
    reset();
  };

  const toggleMic = async () => {
    if (recording || transcribing) {
      if (transcribing) cancel();
      else stop();
      return;
    }
    setText("");
    await start();
  };

  const busy = recording || transcribing;
  const micTitle = recording
    ? "Stop recording"
    : transcribing
      ? "Cancel transcription"
      : "Voice input";

  return (
    <div className="add-item">
      <input
        type="text"
        maxLength={MAX_ITEM_TEXT}
        value={busy ? (transcript || "") : text}
        placeholder={recording ? "Recording…" : transcribing ? "Transcribing…" : "Add an item…"}
        autoFocus
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button type="button" className="add-btn" onClick={submit} disabled={!text.trim() || busy}>
        Add
      </button>
      {supported && (
        <button
          type="button"
          className={`mic-btn${recording ? " recording" : ""}${transcribing ? " transcribing" : ""}`}
          onClick={toggleMic}
          title={micTitle}
          aria-label={micTitle}
          aria-pressed={recording}
          disabled={transcribing && !recording}
        >
          {recording ? (
            <span className="mic-meter" aria-hidden="true">
              <span className="mic-bar" style={{ transform: `scaleY(${Math.max(0.15, level * 3)})` }} />
              <span className="mic-bar" style={{ transform: `scaleY(${Math.max(0.25, level * 4.2)})` }} />
              <span className="mic-bar" style={{ transform: `scaleY(${Math.max(0.2, level * 3.6)})` }} />
              <span className="mic-bar" style={{ transform: `scaleY(${Math.max(0.3, level * 4.8)})` }} />
              <span className="mic-bar" style={{ transform: `scaleY(${Math.max(0.15, level * 3.2)})` }} />
            </span>
          ) : transcribing ? (
            <span className="mic-spinner" aria-hidden="true" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          )}
        </button>
      )}
      {error && <span className="mic-error">{error}</span>}
    </div>
  );
}
