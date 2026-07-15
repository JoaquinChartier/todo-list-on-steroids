import { useEffect, useRef, useState } from "react";

type Props = {
  initialText: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
};

export function ItemEditor({ initialText, onCommit, onCancel }: Props) {
  const [text, setText] = useState(initialText);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      className="item-editor"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const trimmed = text.trim();
        if (trimmed && trimmed !== initialText) onCommit(trimmed);
        else onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const trimmed = text.trim();
          if (trimmed && trimmed !== initialText) onCommit(trimmed);
          else onCancel();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
}
