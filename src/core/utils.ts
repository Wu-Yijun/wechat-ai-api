// src/core/utils.ts
import {
  type ItemTypeStr,
  MessageItemType,
  type RawMessageItem,
} from "../types.ts";

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

export function getItemType(item: MessageItemType): ItemTypeStr {
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

/** 将 "2.1.1" 转换为 API 要求的数字位运算格式 */
export function buildClientVersion(version: string): number {
  const parts = version.split(".").map((p) => parseInt(p, 10));
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;
  return ((major & 0xff) << 16) | ((minor & 0xff) << 8) | (patch & 0xff);
}

export function getFileImageItem(item: RawMessageItem) {
  if ("file_item" in item) return item.file_item;
  if ("image_item" in item) return item.image_item;
  if ("voice_item" in item) return item.voice_item;
  if ("video_item" in item) return item.video_item;
}

export function isItemWithMedia(
  item: MessageItemType,
): item is
  | MessageItemType.FILE
  | MessageItemType.IMAGE
  | MessageItemType.VOICE
  | MessageItemType.VIDEO {
  switch (item) {
    case MessageItemType.IMAGE:
    case MessageItemType.VOICE:
    case MessageItemType.FILE:
    case MessageItemType.VIDEO:
      return true;
    case MessageItemType.NONE:
    case MessageItemType.TEXT:
    default:
      return false;
  }
}
