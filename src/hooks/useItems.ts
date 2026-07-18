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
  createChildItems: (parentId: string, texts: string[]) => Promise<Item[]>;
  updateItem: (id: string, patch: Partial<Item>) => Promise<Item | undefined>;
  removeItem: (id: string) => Promise<void>;
  removeChildren: (parentId: string) => Promise<void>;
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
      ...(input.parentId ? { parentId: input.parentId } : {}),
    };
    await putItem(item);
    setItems((prev) => [item, ...prev]);
    return item;
  }, []);

  const createChildItems = useCallback(
    async (parentId: string, texts: string[]) => {
      const now = Date.now();
      const children: Item[] = texts
        .filter((t) => t.trim().length > 0)
        .map((t, i) => ({
          id: uuid(),
          text: clampText(t.trim()),
          done: false,
          createdAt: now + i,
          updatedAt: now + i,
          parentId,
        }));
      await Promise.all(children.map(putItem));
      setItems((prev) => [...children, ...prev]);
      return children;
    },
    [],
  );

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

  const removeChildren = useCallback(async (parentId: string) => {
    const children = itemsRef.current.filter((it) => it.parentId === parentId);
    setItems((prev) => prev.filter((it) => it.parentId !== parentId));
    await Promise.all(children.map((c) => deleteItem(c.id)));
  }, []);

  return { items, loaded, createItem, createChildItems, updateItem, removeItem, removeChildren };
}
