import type { CatalogKind } from "@features/catalog/lib/catalogStore";

export const RESERVED_ATTR_KEYS: Partial<Record<CatalogKind, string[]>> = {
  finish: ["coats"],
};

export function visibleAttrs(
  attributes: Record<string, unknown>,
  kind: CatalogKind
): [string, string][] {
  const reserved = RESERVED_ATTR_KEYS[kind] ?? [];
  const entries: [string, string][] = Object.entries(attributes)
    .filter(([key]) => !reserved.includes(key))
    .map(([key, value]) => [key, String(value ?? "")])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) as [string, string][];
  return entries;
}

export function setAttr(
  attributes: Record<string, unknown>,
  key: string,
  value: string
): Record<string, unknown> {
  const k = key.trim();
  if (!k) return attributes;
  return { ...attributes, [k]: value };
}

export function removeAttr(
  attributes: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const { [key]: _drop, ...rest } = attributes;
  return rest;
}
