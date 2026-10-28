import { getProfile } from "@/features/auth/services/auth.service";
import { getOrganizationMembers } from "@/features/organization/services/members.service";
import { listIndentHubActivityPage } from "@/features/trips/services/indentHubActivity.service";
import {
  indentToHubActivityEvents,
  type IndentHubActivityRow,
} from "@/features/trips/utils/indentHubActivity.util";
import { useCallback, useEffect, useState } from "react";

export function useIndentHubActivity(
  orgId: string | null,
  opts: {
    enabled: boolean;
    pageSize: number;
    search?: string;
    indentId?: string | null;
  },
) {
  const [rows, setRows] = useState<IndentHubActivityRow[]>([]);
  const [namesById, setNamesById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveNames = useCallback(
    async (nextRows: IndentHubActivityRow[], known: Record<string, string>) => {
      const missing = Array.from(
        new Set(
          nextRows
            .map((row) => String(row.createdByUserId ?? "").trim())
            .filter((id) => id && !known[id]),
        ),
      );
      if (missing.length === 0 || !orgId) return known;
      const next = { ...known };
      const members = await getOrganizationMembers(orgId);
      for (const member of members.members) {
        const id = String(member.user_id ?? "").trim();
        const name = (member.full_name || member.email || member.phone || "").trim();
        if (id && name) next[id] = name;
      }
      await Promise.all(
        missing
          .filter((id) => !next[id])
          .map(async (id) => {
            const profile = await getProfile(id);
            const name = (
              profile?.full_name ||
              profile?.displayName ||
              profile?.email ||
              profile?.phone ||
              ""
            ).trim();
            if (name) next[id] = name;
          }),
      );
      return next;
    },
    [orgId],
  );

  const reload = useCallback(async () => {
    if (!orgId || !opts.enabled) return;
    setLoading(true);
    setError(null);
    const res = await listIndentHubActivityPage(orgId, {
      offset: 0,
      limit: opts.pageSize,
      search: opts.search,
      indentId: opts.indentId,
    });
    if (res.error) {
      setRows([]);
      setHasMore(false);
      setError(res.error.message);
      setLoading(false);
      return;
    }
    const nextRows = res.indents.flatMap(indentToHubActivityEvents);
    setRows(nextRows);
    setHasMore(res.hasMore);
    setNamesById(await resolveNames(nextRows, {}));
    setLoading(false);
  }, [orgId, opts.enabled, opts.indentId, opts.pageSize, opts.search, resolveNames]);

  useEffect(() => {
    if (!opts.enabled) return;
    void reload();
  }, [opts.enabled, reload]);

  const loadMore = useCallback(async () => {
    if (!orgId || !opts.enabled || loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const res = await listIndentHubActivityPage(orgId, {
      offset: rows.length,
      limit: opts.pageSize,
      search: opts.search,
      indentId: opts.indentId,
    });
    if (res.error) {
      setError(res.error.message);
      setLoadingMore(false);
      return;
    }
    const extra = res.indents
      .flatMap(indentToHubActivityEvents)
      .filter((row) => !rows.some((seen) => seen.id === row.id));
    const merged = [...rows, ...extra];
    setRows(merged);
    setHasMore(res.hasMore);
    setNamesById(await resolveNames(extra, namesById));
    setLoadingMore(false);
  }, [
    hasMore,
    loading,
    loadingMore,
    namesById,
    orgId,
    opts.enabled,
    opts.indentId,
    opts.pageSize,
    opts.search,
    resolveNames,
    rows,
  ]);

  return { rows, namesById, loading, loadingMore, hasMore, error, loadMore, reload };
}
