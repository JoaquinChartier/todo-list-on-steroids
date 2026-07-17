import { useState } from "react";

export const MAX_ITEM_TEXT = 80;

type Props = {
  onAdd: (text: string) => void;
};

export function AddItem({ onAdd }: Props) {
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
        maxLength={MAX_ITEM_TEXT}
        value={text}
        placeholder="Add an item…"
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button type="button" className="add-btn" onClick={submit} disabled={!text.trim()}>
        Add
      </button>
    </div>
  );
}
