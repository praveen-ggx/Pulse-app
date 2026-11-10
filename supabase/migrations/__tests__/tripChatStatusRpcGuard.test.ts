import fs from "fs";
import path from "path";

const file = path.join(
  __dirname,
  "../20261110083407_trip_chat_status_rpc_owner_guard.sql",
);
const sql = fs.readFileSync(file, "utf8");

function at(needle: string): number {
  const i = sql.indexOf(needle);
  expect(i).toBeGreaterThanOrEqual(0);
  return i;
}

describe("trip chat status RPC owner guard", () => {
  it("is a later non-midnight migration and leaves both release sets unchanged", () => {
    expect(path.basename(file).slice(0, 14) > "20261110023000").toBe(true);
    expect(path.basename(file).slice(8, 14)).not.toBe("000000");
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
    expect(sql).not.toContain("20261106121132");
    expect(sql).not.toContain("20261109144113");
    expect(sql).not.toContain("20261110023000");
    const set10 = fs.readFileSync(
      path.join(__dirname, "../../release-sets/prod-2026-11-10.versions"),
      "utf8",
    );
    const set07 = fs.readFileSync(
      path.join(__dirname, "../../release-sets/prod-2026-11-07.versions"),
      "utf8",
    );
    expect(set10).toContain("20261109144113");
    expect(set10).not.toContain("20261110083407");
    expect(set10).not.toContain("20261110023000");
    expect(set07).toContain("20261106121132");
    expect(set07).not.toContain("20261110083407");
  });

  it("authorizes the locked row before the status write and the chat message", () => {
    expect(at("FOR UPDATE")).toBeLessThan(at("trip_revoke_delivered_owner_only"));
    expect(at("t.organization_id, t.status, t.source, t.source_market_bid_id")).toBeLessThan(
      at("FOR UPDATE"),
    );
    expect(sql).toContain("t.indent_id, t.supplier_id");
    expect(at("trip_revoke_delivered_owner_only")).toBeLessThan(at("UPDATE public.trips"));
    expect(at("trip_cancel_owner_only")).toBeLessThan(at("UPDATE public.trips"));
    expect(at("trip_cancel_not_eligible")).toBeLessThan(at("UPDATE public.trips"));
    expect(at("UPDATE public.trips")).toBeLessThan(at("INSERT INTO public.trip_messages"));
    expect(sql).toContain("public.caller_is_trip_action_admin(v_org)");
    expect(sql).toContain("public.is_org_staff(v_org)");
    const body = sql.slice(sql.indexOf("DECLARE"), sql.indexOf("REVOKE ALL"));
    expect(body).not.toContain("p_user_id");
    expect(body).not.toContain("p_user_name");
    expect(sql).toContain("p_user_id         uuid DEFAULT NULL");
    expect(sql).toContain("p_user_name       text DEFAULT 'Dispatcher'");
    expect(sql).toContain("'completed', 'delivered', 'done'");
    expect(sql).toContain("'ok',              TRUE");
    expect(sql).toContain("'previous_status', v_prev_status");
    expect(sql).toContain("'new_status',      p_new_status");
    expect(sql).toContain("'changed_at',      v_changed_at");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.change_trip_status_with_notification(uuid, uuid, text, uuid, text) TO authenticated",
    );
  });
});
