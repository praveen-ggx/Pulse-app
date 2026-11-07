/**
 * The trips hub imports this module at load. An undeclared PAGE identifier
 * rejects the TripsScreen chunk before the screen can render.
 */
jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ from: jest.fn(), rpc: jest.fn() }),
}));

import { TRIP_INDENT_REPORT_MAX_ENTITY_ROWS } from "../tripIndentReport.service";

describe("tripIndentReport page size", () => {
  it("exports a numeric indent cap from the declared page size", () => {
    expect(TRIP_INDENT_REPORT_MAX_ENTITY_ROWS).toBe(500 * 25);
  });
});
