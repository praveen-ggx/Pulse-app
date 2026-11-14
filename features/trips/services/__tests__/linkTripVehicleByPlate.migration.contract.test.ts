/**
 * Static contract for linking trips.vehicle_id from a typed plate (TRP002015).
 * Not a database test; nothing here is applied anywhere.
 */
import { readFileSync } from "fs";
import { join } from "path";

const FILE = "20261114111733_link_trip_vehicle_by_plate.sql";
const sql = readFileSync(join(process.cwd(), "supabase/migrations", FILE), "utf8")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("link_trip_vehicle_by_plate migration", () => {
  it("has a real timestamp, never the sibling repo's 000000 slot", () => {
    expect(FILE.slice(8, 14)).not.toBe("000000");
  });

  it("resolves supplier fleet first, then trip org, and never guesses", () => {
    expect(sql).toContain("array_remove(array[v_supplier_org, p_org_id], null)");
    expect(sql).toContain("v.deleted_at is null");
    expect(sql).toMatch(/cardinality\(v_ids\) = 1 then\s+return v_ids\[1\]/);
    expect(sql).toMatch(/cardinality\(v_ids\) > 1 then\s+return null/);
  });

  it("links on trip save without overriding a picked truck or an explicit unlink", () => {
    expect(sql).toMatch(
      /create trigger trips_link_vehicle_by_plate\s+before insert or update of vehicle_display_number, vehicle_id on public\.trips/,
    );
    expect(sql).toContain("if new.vehicle_id is not null");
    expect(sql).toContain("old.vehicle_id is not null");
    expect(sql).toContain("or new.owner_vehicle_id is not null");
  });

  it("back-links older trips when a truck is added later", () => {
    expect(sql).toMatch(
      /create trigger vehicles_backlink_trips_by_plate\s+after insert or update of vehicle_number, deleted_at on public\.vehicles/,
    );
    expect(sql).toContain("= new.id;");
  });

  it("never touches cancelled or deleted trips and keeps helpers private", () => {
    expect(sql.match(/<> 'cancelled'/g)?.length).toBe(2);
    expect(sql).toContain("x.deleted_at is null");
    expect(sql).toMatch(/revoke all on function private\.resolve_trip_vehicle_by_plate\(text, uuid, uuid\) from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant execute/i);
  });
});
