import { useState } from "react";

type Props = {
  onAdd: (text: string) => void;
  disabled?: boolean;
};

export function AddItem({ onAdd, disabled }: Props) {
  const [text, setText] = useState("");

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText("");
  };

  return (
    <div className="add-item">
      <input
        type="text"
        value={text}
        placeholder="Add an item…"
        autoFocus
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button type="button" className="add-btn" onClick={submit} disabled={disabled || !text.trim()}>
        Add
      </button>
    </div>
  );
}
