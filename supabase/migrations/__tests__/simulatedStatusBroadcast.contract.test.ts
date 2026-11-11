import { readFileSync } from "fs";
import { join } from "path";

const FILE = "20271111143000_clear_simulated_status_origin_without_second_update.sql";

function readMigration(name: string): string {
  return readFileSync(join(__dirname, "..", name), "utf8");
}

describe("simulated status chat broadcast", () => {
  const sql = readMigration(FILE);

  it("does not update trips from the chat broadcast", () => {
    const broadcast = sql.slice(sql.indexOf("FUNCTION public.fn_broadcast_trip_status_to_chat"));
    expect(broadcast).not.toMatch(/UPDATE\s+public\.trips/i);
    expect(broadcast).not.toMatch(/status_change_origin\s*=\s*NULL/i);
    expect(broadcast).toMatch(/\(simulated\)/);
    expect(broadcast).toMatch(/fn_post_system_message_to_trip_chats/);
    expect(broadcast).toMatch(/fn_post_trip_feedback_prompt_to_chats/);
  });

  it("clears only business_simulated on the row being written", () => {
    const consume = sql.slice(
      sql.indexOf("FUNCTION public.trips_consume_business_simulated_origin"),
      sql.indexOf("FUNCTION public.fn_broadcast_trip_status_to_chat"),
    );
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF status ON public\.trips/);
    expect(consume).toMatch(/NEW\.status_change_origin := NULL/);
    expect(consume).toMatch(/coalesce\(NEW\.status_change_origin, ''\) = 'business_simulated'/);
    expect(consume).toMatch(/NEW\.status IS DISTINCT FROM OLD\.status/);
    expect(consume).toMatch(/fn_trip_status_chat_message_body\(NEW\) IS NOT NULL/);
    expect(consume).not.toMatch(/driver_command/);
    expect(consume).not.toMatch(/business_simulation_revoked/);
  });

  it("keeps the simulated marker transaction-local and clears it before return", () => {
    const broadcast = sql.slice(sql.indexOf("FUNCTION public.fn_broadcast_trip_status_to_chat"));
    expect(sql).toMatch(/set_config\('pulse\.trip_status_simulated_id', NEW\.id::text, true\)/);
    expect(sql).toMatch(/set_config\('pulse\.trip_status_simulated_id', '', true\)/);
    expect(sql).not.toMatch(/set_config\([^)]*,\s*false\)/);
    expect(broadcast.match(/trips_release_simulated_status_marker\(NEW\.id\)/g)).toHaveLength(4);
  });
});
