import {
  invoiceTestWriteBlockReason,
  PRODUCTION_SUPABASE_HOST,
} from "../invoiceProductionWriteGuard.util";

const testEnv = { EXPO_PUBLIC_INVOICE_PRO_TEST: "1" };
const off = {};

describe("invoiceProductionWriteGuard", () => {
  it("leaves production issuance alone when test mode is off", () => {
    expect(
      invoiceTestWriteBlockReason(
        `https://${PRODUCTION_SUPABASE_HOST}`,
        off,
      ),
    ).toBeNull();
  });

  it("blocks production and any non-local host while testing", () => {
    expect(
      invoiceTestWriteBlockReason(
        `https://${PRODUCTION_SUPABASE_HOST}`,
        testEnv,
      ),
    ).toMatch(/production/);
    expect(
      invoiceTestWriteBlockReason(
        "https://xbisiveavvbifbzyfhgy.supabase.co",
        testEnv,
      ),
    ).toMatch(/local Supabase/);
    expect(
      invoiceTestWriteBlockReason("not-a-url", testEnv),
    ).toMatch(/local Supabase/);
  });

  it("allows the local stack while testing", () => {
    expect(
      invoiceTestWriteBlockReason("http://127.0.0.1:54321", testEnv),
    ).toBeNull();
    expect(
      invoiceTestWriteBlockReason("http://localhost:54321", testEnv),
    ).toBeNull();
  });
});
