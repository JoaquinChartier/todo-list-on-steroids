import { useCallback, useEffect, useRef, useState } from "react";
import type { Item, NewItemInput } from "../ai/types";
import { listItems, putItem, deleteItem } from "../db/store";
import { MAX_ITEM_TEXT } from "../components/AddItem";

const MAX = MAX_ITEM_TEXT;

function clampText(s: string): string {
  return s.length > MAX ? s.slice(0, MAX) : s;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type UseItems = {
  items: Item[];
  loaded: boolean;
  createItem: (input: NewItemInput) => Promise<Item>;
  updateItem: (id: string, patch: Partial<Item>) => Promise<Item | undefined>;
  removeItem: (id: string) => Promise<void>;
};

export function useItems(): UseItems {
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    let cancelled = false;
    listItems()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createItem = useCallback(async (input: NewItemInput) => {
    const now = Date.now();
    const item: Item = {
      id: uuid(),
      text: clampText(input.text.trim()),
      done: input.done ?? false,
      createdAt: now,
      updatedAt: now,
    };
    await putItem(item);
    setItems((prev) => [item, ...prev]);
    return item;
  }, []);

  const updateItem = useCallback(
    async (id: string, patch: Partial<Item>) => {
      const current = itemsRef.current.find((it) => it.id === id);
      if (!current) return undefined;
      const updated: Item = { ...current, ...patch, updatedAt: Date.now() };
      setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
      await putItem(updated);
      return updated;
    },
    [],
  );

  const removeItem = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    await deleteItem(id);
  }, []);

  return { items, loaded, createItem, updateItem, removeItem };
}
