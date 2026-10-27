import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("ledgerAggregationRpc indent lookups", () => {
  it("chunks PostgREST .in() filters so large orgs do not 400", () => {
    const source = readFileSync(
      join(__dirname, "../ledgerAggregationRpc.service.ts"),
      "utf8",
    );
    expect(source).toContain("POSTGREST_IN_CHUNK");
    expect(source).toContain("for (const chunk of chunkIds(indentIds))");
    expect(source).not.toMatch(/\.in\("id", indentIds\)/);
  });
});
