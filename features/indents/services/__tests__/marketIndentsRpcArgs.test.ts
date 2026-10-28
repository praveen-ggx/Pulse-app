/**
 * Guards the PostgREST named-arg for market_indents_for_org.
 * Renaming the SQL param without updating the client 404s Claimed/Find Work.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("market_indents_for_org client args", () => {
  it("calls the RPC with p_org_id (not org_id)", () => {
    const source = readFileSync(
      join(__dirname, "../indents.service.ts"),
      "utf8",
    );
    const fn = source.slice(
      source.indexOf("export async function getMarketIndentsForOrganization"),
      source.indexOf("async function resolveShipperOrganizationName"),
    );
    expect(fn).toMatch(/rpc\("market_indents_for_org", \{\s*p_org_id:/);
    expect(fn).not.toMatch(/rpc\("market_indents_for_org", \{\s*org_id:/);
  });

  it("calls the RPC once per fetch (no immediate repeat on error)", () => {
    const source = readFileSync(
      join(__dirname, "../indents.service.ts"),
      "utf8",
    );
    const fn = source.slice(
      source.indexOf("export async function getMarketIndentsForOrganization"),
      source.indexOf("async function resolveShipperOrganizationName"),
    );
    expect(fn.match(/rpc\("market_indents_for_org"/g)).toHaveLength(1);
  });
});
