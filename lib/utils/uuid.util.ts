/** Any-version UUID: the shape Postgres accepts for a uuid column. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/**
 * Trimmed, de-duplicated UUIDs only. Use before `.in("<uuid column>", ids)`: one non-UUID
 * value (a person's name stored in a free-text actor column) makes Postgres reject the whole
 * list with 22P02, so every other id in the batch is lost too.
 */
export function onlyUuids(values: ReadonlyArray<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const t = (v ?? "").trim();
    if (isUuid(t)) out.add(t);
  }
  return [...out];
}
