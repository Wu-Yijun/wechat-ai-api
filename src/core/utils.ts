import { type ItemType, MessageItemType } from "../types.ts";

export function mergeObjects<T>(ref: T, ...sources: Partial<T>[]): T {
  const target = { ...ref };
  for (const source of sources) {
    for (const key in source) {
      if (source[key] !== undefined) {
        target[key] = source[key] as T[Extract<keyof T, string>];
      }
    }
  }
  return target;
}

export function getItemType(item: number): ItemType {
  switch (item) {
    case MessageItemType.TEXT:
      return "text";
    case MessageItemType.IMAGE:
      return "image";
    case MessageItemType.VIDEO:
      return "video";
    case MessageItemType.FILE:
      return "file";
    case MessageItemType.VOICE:
      return "voice";
    default:
      return "unknown";
  }
}

