import type { IndentRow } from "@/features/indents/services/indents.service";
import { findIndentInMarketList } from "@/features/indents/utils/findIndentInList.util";
import { queryKeys } from "@/lib/queryKeys";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Review Hub open-path bootstrap — same idea as network-profile / allocation
 * `placeholderData`: paint the row already on screen, then refresh.
 */
export function resolveIndentDetailBootstrap(
  indentId: string | null | undefined,
  seed: IndentRow | null | undefined,
  cachedLists: readonly IndentRow[] = [],
): IndentRow | null {
  const raw = (indentId ?? "").trim();
  if (!raw) return null;
  if (seed && findIndentInMarketList([seed], raw)) return seed;
  if (!cachedLists.length) return null;
  return findIndentInMarketList(cachedLists, raw);
}

export function indentDetailCacheHint(
  seed: IndentRow | null | undefined,
  cachedLists: readonly IndentRow[] = [],
): IndentRow[] {
  const hint: IndentRow[] = [];
  if (seed?.id) hint.push(seed);
  for (const row of cachedLists) {
    if (row?.id && row.id !== seed?.id) hint.push(row);
  }
  return hint;
}

/** Indent rows already on screen (market, org list, paged lists). */
export function peekCachedIndentLists(
  qc: QueryClient,
  orgId: string | null,
): IndentRow[] {
  if (!orgId || typeof qc.getQueriesData !== "function") return [];
  const rows: IndentRow[] = [];
  const entries = qc.getQueriesData({ queryKey: ["q", "indents", orgId] });
  for (const [, data] of entries) {
    if (Array.isArray(data)) {
      rows.push(...(data as IndentRow[]));
      continue;
    }
    if (
      data &&
      typeof data === "object" &&
      "pages" in data &&
      Array.isArray((data as { pages: unknown }).pages)
    ) {
      for (const page of (data as { pages: unknown[] }).pages) {
        if (Array.isArray(page)) rows.push(...(page as IndentRow[]));
      }
    }
  }
  return rows;
}

/** Hub already loaded org lists — skip the deferred enrichment wait. */
export function peekIndentDetailListsWarm(
  qc: QueryClient,
  orgId: string | null,
): boolean {
  if (!orgId || typeof qc.getQueryData !== "function") return false;
  return (
    qc.getQueryData(queryKeys.suppliers.finite(orgId)) != null ||
    qc.getQueryData(queryKeys.clients.finite(orgId)) != null ||
    qc.getQueryData(queryKeys.trips.finite(orgId)) != null
  );
}
