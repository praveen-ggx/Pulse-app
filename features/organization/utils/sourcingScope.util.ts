/**
 * Sourcing scope — which indents and trips a Sourcing member follows.
 *
 * Union of the assigned clients and warehouses:
 *   - an indent is in scope when its client or its warehouse is assigned;
 *   - a trip is in scope when its indent (indent_id / source_indent_id) is in
 *     scope, or it has no indent and its client is assigned.
 * Nothing assigned → nothing in scope (fail closed).
 *
 * App-side only: the database does not filter on this (Sourcing is stored as
 * org role `member`). See docs/RBAC_OPERATING_MODEL.md.
 */

export type SourcingScope = {
  clientIds: ReadonlySet<string>;
  warehouseIds: ReadonlySet<string>;
  /** Ids of the org's indents whose client or warehouse is assigned. */
  indentIds: ReadonlySet<string>;
};

type ScopedIndent = {
  id: string;
  client_id?: string | null;
  warehouse_id?: string | null;
};

type ScopedTrip = {
  indent_id?: string | null;
  source_indent_id?: string | null;
  client_id?: string | null;
};

const has = (set: ReadonlySet<string>, id: string | null | undefined): boolean => {
  const v = (id ?? "").trim();
  return v.length > 0 && set.has(v);
};

export function sourcingScopeIsEmpty(scope: SourcingScope): boolean {
  return scope.clientIds.size === 0 && scope.warehouseIds.size === 0;
}

export function indentInSourcingScope(scope: SourcingScope, indent: ScopedIndent): boolean {
  return (
    has(scope.indentIds, indent.id) ||
    has(scope.clientIds, indent.client_id) ||
    has(scope.warehouseIds, indent.warehouse_id)
  );
}

export function tripInSourcingScope(scope: SourcingScope, trip: ScopedTrip): boolean {
  const indentId = (trip.indent_id ?? "").trim() || (trip.source_indent_id ?? "").trim();
  if (indentId) {
    return has(scope.indentIds, trip.indent_id) || has(scope.indentIds, trip.source_indent_id);
  }
  return has(scope.clientIds, trip.client_id);
}

/** Read the stored client list from member permissions (Sourcing only). */
export function sourcingClientIdsFromPermissions(permissions: unknown): string[] {
  const raw = (permissions as { clientIds?: unknown } | null | undefined)?.clientIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}
