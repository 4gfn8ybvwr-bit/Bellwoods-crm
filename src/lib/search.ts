export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
