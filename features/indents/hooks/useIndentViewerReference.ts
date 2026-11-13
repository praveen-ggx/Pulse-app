import { useOrganization } from "@/contexts/OrganizationContext";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";

/**
 * Shared indent reference (indent_code, e.g. SAT812-IND-003827) for the shipper
 * org or the awarded supplier org. Supplier rows don't carry indent_code, so it
 * is fetched (batched across cards). Null when hidden, unavailable or disabled.
 */
export function useIndentViewerReference(
  indentId: string | null | undefined,
  enabled: boolean,
): string | null {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? "";
  const id = (indentId ?? "").trim();
  const q = useQuery({
    queryKey: queryKeys.indents.viewerReference(orgId, id),
    queryFn: async () => {
      const { getIndentReferenceForViewerBatched } = await import(
        "@/features/indents/services/indents.service"
      );
      return getIndentReferenceForViewerBatched(id);
    },
    enabled: enabled && Boolean(orgId && id),
    staleTime: STALE.frequent,
  });
  return q.data ?? null;
}
