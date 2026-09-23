/**
 * Client invoice POD policy (P2.1 configuration).
 * Resolution only. Does not read AsyncStorage or enforce Issue eligibility.
 */

export const INVOICE_POD_POLICIES = ["none", "soft_copy", "hard_copy"] as const;

export type InvoicePodPolicy = (typeof INVOICE_POD_POLICIES)[number];

export const INVOICE_POD_POLICY_LABELS: Record<InvoicePodPolicy, string> = {
  none: "No POD",
  soft_copy: "Soft Copy POD",
  hard_copy: "Hard Copy POD",
};

export type ParsedInvoicePodPolicy =
  | { ok: true; policy: InvoicePodPolicy | null }
  | { ok: false; raw: string };

export function isInvoicePodPolicy(value: unknown): value is InvoicePodPolicy {
  return (
    value === "none" || value === "soft_copy" || value === "hard_copy"
  );
}

/** Normalize DB `string | null` into the canonical type. Invalid values are not remapped. */
export function parseInvoicePodPolicy(raw: unknown): ParsedInvoicePodPolicy {
  if (raw == null) return { ok: true, policy: null };
  if (typeof raw !== "string") return { ok: false, raw: String(raw) };
  if (raw === "") return { ok: false, raw };
  if (isInvoicePodPolicy(raw)) return { ok: true, policy: raw };
  return { ok: false, raw };
}

export function invoicePodPolicyLabel(policy: InvoicePodPolicy): string {
  return INVOICE_POD_POLICY_LABELS[policy];
}

/**
 * Client policy is the only eligibility input.
 * NULL is unconfigured — it does not inherit workspace/device AsyncStorage.
 * `workspacePodRequired` is ignored (kept so existing call sites compile).
 */
export function resolveInvoicePodPolicy(args: {
  clientPolicy: InvoicePodPolicy | null;
  workspacePodRequired?: boolean;
}): InvoicePodPolicy | null {
  if (args.clientPolicy === "none") return "none";
  if (args.clientPolicy === "soft_copy") return "soft_copy";
  if (args.clientPolicy === "hard_copy") return "hard_copy";
  return null;
}

/** Reset stores NULL (unconfigured). Invoicing stays blocked until a policy is set. */
export function resetClientInvoicePodPolicy(): null {
  return null;
}

/**
 * Mirrors `can_manage_client_invoice_pod_policy` (DB trigger/helper).
 * UI still calls the RPC; this is for tests and documentation of the same OR.
 */
export function memberCanManageClientInvoicePodPolicy(member: {
  role?: string | null;
  permissions?: {
    grants?: unknown;
    surfaces?: Record<string, unknown> | null;
  } | null;
}): boolean {
  const role = (member.role ?? "").trim();
  if (role === "owner" || role === "admin" || role === "finance") return true;

  const grants = member.permissions?.grants;
  if (Array.isArray(grants) && grants.includes("finance:manage")) return true;

  const surface = member.permissions?.surfaces?.["finance.manage"];
  if (surface === true || surface === "true") return true;

  return false;
}
