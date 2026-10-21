import type { IndentRow } from "@/features/indents/services/indents.service";
import {
  indentDetailCacheHint,
  peekCachedIndentLists,
  peekIndentDetailListsWarm,
  resolveIndentDetailBootstrap,
} from "@/features/indents/utils/indentDetailBootstrap.util";
import { queryKeys } from "@/lib/queryKeys";
import { QueryClient } from "@tanstack/react-query";

function row(id: string, extra: Partial<IndentRow> = {}): IndentRow {
  return { id, ...extra } as IndentRow;
}

describe("indentDetailBootstrap", () => {
  it("prefers the navigation seed when ids match", () => {
    const seed = row("ind-1", { pickup_area: "Bengaluru" });
    expect(
      resolveIndentDetailBootstrap("ind-1", seed, [row("ind-2")])?.pickup_area,
    ).toBe("Bengaluru");
  });

  it("falls back to a cached list row (deep link / trips hub)", () => {
    const cached = row("ind-9", { pickup_area: "Chennai", indent_number: "IND-009" });
    expect(resolveIndentDetailBootstrap("ind-9", null, [cached])?.pickup_area).toBe(
      "Chennai",
    );
    expect(resolveIndentDetailBootstrap("IND-009", null, [cached])?.id).toBe("ind-9");
  });

  it("returns null when nothing is seeded or cached", () => {
    expect(resolveIndentDetailBootstrap("ind-missing", null, [])).toBeNull();
  });

  it("builds a cache hint with the seed first", () => {
    const seed = row("a");
    const hint = indentDetailCacheHint(seed, [row("b"), row("a")]);
    expect(hint.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("reads indent rows already in TanStack list caches", () => {
    const qc = new QueryClient();
    const cached = row("ind-cache", { pickup_area: "Pune" });
    qc.setQueryData(["q", "indents", "org-1", "finite"], [cached]);
    expect(peekCachedIndentLists(qc, "org-1")[0]?.id).toBe("ind-cache");
    expect(peekCachedIndentLists(qc, null)).toEqual([]);
    expect(
      resolveIndentDetailBootstrap("ind-cache", null, peekCachedIndentLists(qc, "org-1"))
        ?.pickup_area,
    ).toBe("Pune");
  });

  it("treats hub list caches as warm so enrichment can skip the wait", () => {
    const qc = new QueryClient();
    expect(peekIndentDetailListsWarm(qc, "org-1")).toBe(false);
    qc.setQueryData(queryKeys.suppliers.finite("org-1"), [{ id: "s1" }]);
    expect(peekIndentDetailListsWarm(qc, "org-1")).toBe(true);
  });
});
