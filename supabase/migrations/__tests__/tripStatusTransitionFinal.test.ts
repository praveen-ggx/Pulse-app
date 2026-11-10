import fs from "fs";
import path from "path";

const file = path.join(
  __dirname,
  "../20271108094500_trip_status_transition_guard_final.sql",
);
const sql = fs.readFileSync(file, "utf8");
const historical = fs.readFileSync(
  path.join(__dirname, "../20271005211835_driver_execution_authority_core.sql"),
  "utf8",
);

describe("final trip status transition guard", () => {
  it("sorts after every existing migration and stays out of both release sets", () => {
    expect(path.basename(file).slice(0, 14) > "20271107190000").toBe(true);
    expect(path.basename(file).slice(0, 14) > "20271005211835").toBe(true);
    expect(path.basename(file).slice(8, 14)).not.toBe("000000");
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
    const set10 = fs.readFileSync(
      path.join(__dirname, "../../release-sets/prod-2026-11-10.versions"),
      "utf8",
    );
    const set07 = fs.readFileSync(
      path.join(__dirname, "../../release-sets/prod-2026-11-07.versions"),
      "utf8",
    );
    expect(set07).toContain("20261106121132");
    expect(set07).not.toContain("20271108094500");
    expect(set10).toContain("20261109144113");
    expect(set10).not.toContain("20271108094500");
    expect(set10).not.toContain("20261110023000");
    expect(historical).not.toContain("trips_enforce_owner_status_transition");
  });

  it("keeps one transition policy and restores the chat RPC after the historical replace", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.trips_enforce_owner_status_transition");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.change_trip_status_with_notification");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.submit_business_event");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.process_b2b_event");
    expect(sql).not.toContain("driver_execute_command");
    expect(sql).not.toContain("revoke_ground_ops_pickup_status");
    const chat = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.change_trip_status_with_notification"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.submit_business_event"),
    );
    expect(chat.indexOf("FOR UPDATE")).toBeLessThan(chat.indexOf("trips_enforce_owner_status_transition"));
    expect(chat.indexOf("trips_enforce_owner_status_transition")).toBeLessThan(chat.indexOf("UPDATE public.trips"));
    expect(chat.indexOf("UPDATE public.trips")).toBeLessThan(chat.indexOf("INSERT INTO public.trip_messages"));
    const submit = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.submit_business_event"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.process_b2b_event"),
    );
    expect(submit.indexOf("FOR UPDATE")).toBeLessThan(submit.indexOf("trips_enforce_owner_status_transition"));
    expect(submit.indexOf("trips_enforce_owner_status_transition")).toBeLessThan(submit.indexOf("UPDATE public.trips"));
    const b2b = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.process_b2b_event"));
    expect(b2b.indexOf("FOR UPDATE")).toBeLessThan(b2b.indexOf("trips_enforce_owner_status_transition"));
    expect(b2b.indexOf("trips_enforce_owner_status_transition")).toBeLessThan(b2b.indexOf("UPDATE public.trips"));
    expect(b2b.indexOf("UPDATE public.trips")).toBeLessThan(b2b.indexOf("INSERT INTO public.trip_messages"));
  });
});
