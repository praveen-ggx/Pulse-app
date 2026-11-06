/** Production project. Invoice tests must not write here. */
export const PRODUCTION_SUPABASE_HOST = "nafxpivddesgsrthmosv.supabase.co";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function invoiceTestModeEnabled(
  env: Record<string, string | undefined>,
): boolean {
  return (
    env.EXPO_PUBLIC_INVOICE_PRO_TEST === "1" ||
    env.PULSE_INVOICE_PRO_TEST === "1"
  );
}

/**
 * Fail closed while invoice testing is on. Production issuance is unchanged
 * when the test flags are unset. A test session may write only to localhost.
 */
export function invoiceTestWriteBlockReason(
  supabaseUrl: string | null | undefined,
  env: Record<string, string | undefined>,
): string | null {
  if (!invoiceTestModeEnabled(env)) return null;
  let host = "";
  try {
    host = new URL(supabaseUrl ?? "").hostname;
  } catch {
    host = "";
  }
  if (LOCAL_HOSTS.has(host)) return null;
  if (host === PRODUCTION_SUPABASE_HOST) {
    return "Invoice writes are blocked because this test session points at production.";
  }
  return "Invoice writes are blocked because this test session is not using local Supabase.";
}

export function refuseProductionInvoiceWrite(
  supabaseUrl: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): void {
  const reason = invoiceTestWriteBlockReason(supabaseUrl, env);
  if (reason) throw new Error(reason);
}
