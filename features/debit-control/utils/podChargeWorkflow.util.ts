/** Compare POD validate vs revalidate workflow events. */

export type PodChargeWorkflowFlags = {
  chargesSaved: boolean;
  revalidateRequested: boolean;
  settlementReleased: boolean;
  hasDebit?: boolean;
  noDebit?: boolean;
};

export function workflowEventPostedMs(input: {
  createdAt?: string | null;
  updatedAt?: string | null;
  payload?: unknown;
}): number {
  const payload =
    input.payload && typeof input.payload === "object"
      ? (input.payload as { posted_at?: unknown })
      : null;
  const posted = String(payload?.posted_at ?? "").trim();
  const updated = String(input.updatedAt ?? "").trim();
  const created = String(input.createdAt ?? "").trim();
  const raw = posted || updated || created;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

export function resolvePodChargeWorkflow(input: {
  validatedAtMs: number | null;
  revalidateAtMs: number | null;
  notFoundAtMs?: number | null;
  settlementReleasedAtMs?: number | null;
}): PodChargeWorkflowFlags {
  const validatedAtMs = input.validatedAtMs && input.validatedAtMs > 0 ? input.validatedAtMs : null;
  const revalidateAtMs = input.revalidateAtMs && input.revalidateAtMs > 0 ? input.revalidateAtMs : null;
  const notFoundAtMs = input.notFoundAtMs && input.notFoundAtMs > 0 ? input.notFoundAtMs : null;
  const settlementReleasedAtMs =
    input.settlementReleasedAtMs && input.settlementReleasedAtMs > 0
      ? input.settlementReleasedAtMs
      : null;
  if (
    notFoundAtMs &&
    (!validatedAtMs || notFoundAtMs > validatedAtMs) &&
    (!revalidateAtMs || notFoundAtMs > revalidateAtMs)
  ) {
    return { chargesSaved: false, revalidateRequested: false, settlementReleased: false };
  }
  const revalidateRequested = Boolean(revalidateAtMs && (!validatedAtMs || revalidateAtMs > validatedAtMs));
  const chargesSaved = Boolean(validatedAtMs && !revalidateRequested);
  const settlementReleased = Boolean(
    settlementReleasedAtMs &&
      (!revalidateAtMs || settlementReleasedAtMs > revalidateAtMs) &&
      (!notFoundAtMs || settlementReleasedAtMs > notFoundAtMs),
  );
  return { chargesSaved, revalidateRequested, settlementReleased };
}
