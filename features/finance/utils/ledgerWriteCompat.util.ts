/**
 * PostgREST / schema-cache compatibility for ledger writes.
 * `transactions.payment_reference` exists only after 20260921105432.
 * Live DBs that have not applied that migration reject the column (PGRST204).
 * The UTR still lives in `description` via parsePaymentReference / buildDescriptionWithMeta.
 */

export function isMissingPaymentReferenceColumnError(
  error: {
    message?: string;
    code?: string;
  } | null,
): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  if (!msg.includes("payment_reference")) return false;
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    msg.includes("schema cache") ||
    msg.includes("could not find") ||
    msg.includes("does not exist")
  );
}

export function omitPaymentReferenceField<T extends { payment_reference?: unknown }>(
  payload: T,
): Omit<T, "payment_reference"> {
  const { payment_reference: _unused, ...rest } = payload;
  return rest;
}
