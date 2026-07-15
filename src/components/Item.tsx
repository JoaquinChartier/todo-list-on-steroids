import { useState } from "react";
import type { Item } from "../ai/types";
import { ItemEditor } from "./ItemEditor";
import { AIPanel } from "./AIPanel";

type Props = {
  item: Item;
  loading: boolean;
  hasApiKey: boolean;
  onToggleDone: (item: Item) => void;
  onCommitEdit: (item: Item, nextText: string) => void;
  onDelete: (item: Item) => void;
  onRegenerate: (item: Item) => void;
};

export function ItemRow({
  item,
  loading,
  hasApiKey,
  onToggleDone,
  onCommitEdit,
  onDelete,
  onRegenerate,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <li className={`item${item.done ? " done" : ""}`}>
      <div className="item-main">
        <input
          type="checkbox"
          checked={item.done}
          onChange={() => onToggleDone(item)}
          aria-label="toggle done"
        />
        {editing ? (
          <ItemEditor
            initialText={item.text}
            onCommit={(next) => {
              setEditing(false);
              onCommitEdit(item, next);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <span
            className="item-text"
            onClick={() => setEditing(true)}
            title="Click to edit"
          >
            {item.text}
          </span>
        )}
        <button
          type="button"
          className="ai-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          title="Toggle AI notes"
        >
          {expanded ? "▾" : "▸"}
        </button>
        <button
          type="button"
          className="delete-btn"
          onClick={() => onDelete(item)}
          title="Delete"
        >
          ×
        </button>
      </div>
      {expanded && (
        <div className="item-ai">
          {hasApiKey ? (
            <AIPanel ai={item.ai} loading={loading} onRegenerate={() => onRegenerate(item)} />
          ) : (
            <p className="ai-empty">
              Add your OpenRouter API key in Settings to generate AI notes.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
