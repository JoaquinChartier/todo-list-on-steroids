import { get, set, del, keys, createStore, clear } from "idb-keyval";
import type { Item } from "../ai/types";

const STORE_KEY = "todos-on-steroids";
const store = createStore(STORE_KEY, "items");

function isItemKey(k: unknown): k is string {
  return typeof k === "string" && k.startsWith("item:");
}

export async function listItems(): Promise<Item[]> {
  const allKeys = (await keys(store)) as string[];
  const itemKeys = allKeys.filter(isItemKey);
  const items = await Promise.all(itemKeys.map((k) => get<Item>(k, store)));
  return items
    .filter((i): i is Item => i != null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getItem(id: string): Promise<Item | undefined> {
  return get<Item>(itemKey(id), store);
}

export async function putItem(item: Item): Promise<void> {
  await set(itemKey(item.id), item, store);
}

export async function deleteItem(id: string): Promise<void> {
  await del(itemKey(id), store);
}

export async function clearAllItems(): Promise<void> {
  await clear(store);
}

function itemKey(id: string): string {
  return `item:${id}`;
}
