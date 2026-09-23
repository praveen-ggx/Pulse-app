/**
 * P2.2 invoice POD eligibility + Issue gate.
 * Resolution uses canonical resolveInvoicePodPolicy (P2.1). This file does not
 * duplicate fallback rules and does not persist client policy.
 */

import {
  parseInvoicePodPolicy,
  resolveInvoicePodPolicy,
  type InvoicePodPolicy,
} from "@/features/invoicing/utils/invoicePodPolicy.util";

export const INVOICE_POD_SOFT_COPY_REQUIRED =
  "Digital POD is required for this client before invoicing.";
export const INVOICE_POD_HARD_COPY_REQUIRED =
  "Physical POD receipt is required for this client before invoicing.";
export const INVOICE_POD_MULTI_CLIENT =
  "An invoice can contain trips for only one client.";
export const INVOICE_POD_INVALID_CLIENT_POLICY =
  "This client's invoicing POD policy is invalid and must be reconfigured before invoicing.";
export const INVOICE_POD_LEGACY_REQUIRED =
  "POD is required before invoice creation.";
export const INVOICE_POD_WORKSPACE_HARD_COPY =
  "POD Required is ON. Physical POD receipt is required before invoicing.";
export const INVOICE_POD_OPTIONS_CONFLICT =
  "podPolicy and requirePod were both supplied and do not agree.";
export const INVOICE_POD_POLICY_UNCONFIGURED =
  "This client has no invoicing POD policy. Set none, soft copy, or hard copy before invoicing.";

export type InvoicePodEvidence = {
  digitalPodPresent: boolean;
  physicalPodReceived: boolean;
};

export type InvoicePodSelectionIdentity = {
  client_id?: string | null;
} & InvoicePodEvidence;

export function distinctInvoiceClientIds(
  trips: Array<{ client_id?: string | null }>,
): string[] {
  return Array.from(
    new Set(
      trips
        .map((trip) => (trip.client_id ?? "").trim())
        .filter((id) => id.length > 0),
    ),
  );
}

export function invoiceSelectionClientIdentityError(
  trips: Array<{ client_id?: string | null }>,
): string | null {
  const ids = distinctInvoiceClientIds(trips);
  if (ids.length > 1) return INVOICE_POD_MULTI_CLIENT;
  const missing = trips.some((trip) => !(trip.client_id ?? "").trim());
  if (ids.length === 1 && missing) {
    return INVOICE_POD_MULTI_CLIENT;
  }
  return null;
}

export function isTripEligibleForInvoicePodPolicy(
  policy: InvoicePodPolicy,
  evidence: InvoicePodEvidence,
): boolean {
  if (policy === "none") return true;
  if (policy === "soft_copy") return evidence.digitalPodPresent === true;
  return evidence.physicalPodReceived === true;
}

export function selectedTripsBlockIssueForPodPolicy(
  policy: InvoicePodPolicy,
  trips: InvoicePodEvidence[],
): boolean {
  if (trips.length === 0) return false;
  return trips.some((trip) => !isTripEligibleForInvoicePodPolicy(policy, trip));
}

export function invoiceIssuePodPolicyReason(
  policy: InvoicePodPolicy,
  trips: InvoicePodEvidence[],
  source: "client" | "workspace" = "client",
): string | null {
  if (!selectedTripsBlockIssueForPodPolicy(policy, trips)) return null;
  if (policy === "soft_copy") return INVOICE_POD_SOFT_COPY_REQUIRED;
  if (policy === "hard_copy") {
    return source === "workspace"
      ? INVOICE_POD_WORKSPACE_HARD_COPY
      : INVOICE_POD_HARD_COPY_REQUIRED;
  }
  return null;
}

export function invoiceTripPodHint(
  policy: InvoicePodPolicy,
  evidence: InvoicePodEvidence,
  source: "client" | "workspace" = "client",
): string | null {
  if (isTripEligibleForInvoicePodPolicy(policy, evidence)) return null;
  return invoiceIssuePodPolicyReason(policy, [evidence], source);
}

/** Explicit requirePod cannot represent hard_copy; mixing it with podPolicy is rejected. */
export function conflictingInvoicePodOptions(args: {
  requirePodSupplied: boolean;
  podPolicySupplied: boolean;
  requirePod?: boolean;
  podPolicy?: InvoicePodPolicy;
}): string | null {
  if (!args.requirePodSupplied || !args.podPolicySupplied) return null;
  const requirePod = args.requirePod !== false;
  const policy = args.podPolicy;
  if (policy === "none" && requirePod === false) return null;
  if (policy === "soft_copy" && requirePod === true) return null;
  return INVOICE_POD_OPTIONS_CONFLICT;
}

export function parseClientInvoicePodPolicyOrError(
  raw: unknown,
): { ok: true; policy: InvoicePodPolicy | null } | { ok: false; error: string } {
  const parsed = parseInvoicePodPolicy(raw);
  if (!parsed.ok) {
    return { ok: false, error: INVOICE_POD_INVALID_CLIENT_POLICY };
  }
  return { ok: true, policy: parsed.policy };
}

export function effectiveInvoicePodPolicyFromClientRaw(args: {
  clientPolicyRaw: unknown;
  /** Ignored. NULL client policy is unconfigured, not a workspace fallback. */
  workspacePodRequired?: boolean;
}):
  | { ok: true; policy: InvoicePodPolicy; source: "client" }
  | { ok: false; error: string } {
  const parsed = parseClientInvoicePodPolicyOrError(args.clientPolicyRaw);
  if (!parsed.ok) return parsed;
  const policy = resolveInvoicePodPolicy({
    clientPolicy: parsed.policy,
  });
  if (policy == null) {
    return { ok: false, error: INVOICE_POD_POLICY_UNCONFIGURED };
  }
  return {
    ok: true,
    policy,
    source: "client",
  };
}

export function invoiceNeedsDigitalPodLookup(
  policy: InvoicePodPolicy,
): boolean {
  return policy === "soft_copy";
}

export function invoiceNeedsPhysicalPodField(
  policy: InvoicePodPolicy,
): boolean {
  return policy === "hard_copy";
}
