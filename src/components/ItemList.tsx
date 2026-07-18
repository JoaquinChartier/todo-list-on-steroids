import { useState } from "react";
import type { Item } from "../ai/types";
import { PRIORITY_ORDER } from "../ai/types";
import { ItemRow } from "./Item";

type Props = {
  items: Item[];
  loadingIds: Set<string>;
  hasApiKey: boolean;
  onToggleDone: (item: Item) => void;
  onCommitEdit: (item: Item, nextText: string) => void;
  onDelete: (item: Item) => void;
};

export function ItemList({
  items,
  loadingIds,
  hasApiKey,
  onToggleDone,
  onCommitEdit,
  onDelete,
}: Props) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [sortByPriority, setSortByPriority] = useState(false);

  if (items.length === 0) {
    return <p className="empty-state">No items yet. Add one above.</p>;
  }

  let active = items.filter((i) => !i.done);
  const completed = items.filter((i) => i.done);

  if (sortByPriority) {
    active = [...active].sort((a, b) => {
      const pa = a.priority ? PRIORITY_ORDER[a.priority] : 99;
      const pb = b.priority ? PRIORITY_ORDER[b.priority] : 99;
      if (pa !== pb) return pa - pb;
      return a.createdAt - b.createdAt;
    });
  }

  const renderItem = (item: Item) => (
    <ItemRow
      key={item.id}
      item={item}
      loading={loadingIds.has(item.id)}
      hasApiKey={hasApiKey}
      onToggleDone={onToggleDone}
      onCommitEdit={onCommitEdit}
      onDelete={onDelete}
    />
  );

  return (
    <div className="item-list-wrap">
      {active.length > 0 && (
        <div className="list-toolbar">
          <button
            type="button"
            className={`ghost-btn sm${sortByPriority ? " active" : ""}`}
            onClick={() => setSortByPriority((v) => !v)}
          >
            {sortByPriority ? "✓ " : ""}Sort by priority
          </button>
        </div>
      )}
      {active.length > 0 ? (
        <ul className="item-list">{active.map(renderItem)}</ul>
      ) : (
        <p className="empty-state">All done. Nice work.</p>
      )}

      {completed.length > 0 && (
        <div className="completed-toggle">
          <button
            type="button"
            className="ghost-btn sm"
            onClick={() => setShowCompleted((v) => !v)}
          >
            {showCompleted ? "Hide" : "Show"} {completed.length} completed
          </button>
          {showCompleted && (
            <ul className="item-list">{completed.map(renderItem)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
