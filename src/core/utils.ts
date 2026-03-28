export function mergeObjects<T>(target: T, ...sources: Partial<T>[]): T {
  for (const source of sources) {
    for (const key in source) {
      if (source[key] !== undefined) {
        target[key] = source[key] as T[Extract<keyof T, string>];
      }
    }
  }
  return target;
}