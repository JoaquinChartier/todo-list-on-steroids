import { useState } from "react";
import type { Item, Priority } from "../ai/types";
import { ItemEditor } from "./ItemEditor";
import { AIPanel } from "./AIPanel";

const PRIORITY_LABEL: Record<Priority, string> = {
  low: "low",
  medium: "med",
  high: "high",
  urgent: "urgent",
};

type Props = {
  item: Item;
  loading: boolean;
  hasApiKey: boolean;
  onToggleDone: (item: Item) => void;
  onCommitEdit: (item: Item, nextText: string) => void;
  onDelete: (item: Item) => void;
};

export function ItemRow({
  item,
  loading,
  hasApiKey,
  onToggleDone,
  onCommitEdit,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <li className={`item${item.done ? " done" : ""}`}>
      <div className="item-main">
        <input
          type="checkbox"
          checked={item.done}
          onChange={() => onToggleDone(item)}
          aria-label="toggle done"
        />
        {item.priority && (
          <span className={`priority-badge ${item.priority}`}>
            {PRIORITY_LABEL[item.priority]}
          </span>
        )}
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
          className="delete-btn"
          onClick={() => onDelete(item)}
          title="Delete"
        >
          ×
        </button>
      </div>
      {hasApiKey && !item.parentId && (
        <AIPanel ai={item.ai} loading={loading} />
      )}
      {!hasApiKey && !item.parentId && (
        <p className="ai-line empty">
          Add your OpenRouter API key in Settings to generate AI notes.
        </p>
      )}
    </li>
  );
}
