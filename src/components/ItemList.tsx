import type { Item } from "../ai/types";
import { ItemRow } from "./Item";

type Props = {
  items: Item[];
  loadingIds: Set<string>;
  hasApiKey: boolean;
  onToggleDone: (item: Item) => void;
  onCommitEdit: (item: Item, nextText: string) => void;
  onDelete: (item: Item) => void;
  onRegenerate: (item: Item) => void;
};

export function ItemList({
  items,
  loadingIds,
  hasApiKey,
  onToggleDone,
  onCommitEdit,
  onDelete,
  onRegenerate,
}: Props) {
  if (items.length === 0) {
    return <p className="empty-state">No items yet. Add one above.</p>;
  }

  return (
    <ul className="item-list">
      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          loading={loadingIds.has(item.id)}
          hasApiKey={hasApiKey}
          onToggleDone={onToggleDone}
          onCommitEdit={onCommitEdit}
          onDelete={onDelete}
          onRegenerate={onRegenerate}
        />
      ))}
    </ul>
  );
}
