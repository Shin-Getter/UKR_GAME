/**
 * Deterministic JSON: object keys sorted, so two equal states always
 * serialise (and hash) identically regardless of key insertion order.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) return JSON.stringify(String(value));
    return JSON.stringify(value) ?? "null";
  }
  if (ArrayBuffer.isView(value)) return stableStringify(Array.from(value as unknown as ArrayLike<number>));
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
