import { normalizeIndianPhoneForMetadata } from "@/lib/phoneValidation";
import { supabase } from "@/lib/supabase";
import type { SupplierVendorStatus } from "@/features/suppliers/types/supplierManagement.types";
import {
  normalizeIdNumber,
  normalizeVendorStatus,
} from "@/features/suppliers/utils/supplierVendorOnboarding.util";

/** Vendor onboarding fields on `suppliers` (not returned by the list RPC). */
export type VendorOnboardingProfile = {
  vendor_status: SupplierVendorStatus;
  blacklist_reason: string | null;
  status_changed_at: string | null;
  advance_percentage: number | null;
  aadhaar_number: string | null;
  pan_number: string | null;
  gstin: string | null;
  msme_number: string | null;
  gumasta_number: string | null;
  phone: string | null;
  secondary_phone: string | null;
  /** Integrated vendors' primary phone is owned by the connected account. */
  is_integrated: boolean;
};

export type SupplierTdsRate = {
  id: string;
  financial_year: string;
  rate_percent: number;
  updated_at: string;
};

export type BankVerificationStatus = "pending" | "verified" | "failed";

export type SupplierBankAccount = {
  id: string;
  bank_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  beneficiary_name?: string | null;
  branch_name?: string | null;
  cancelled_cheque_url?: string | null;
  is_primary?: boolean | null;
  verified_at?: string | null;
  verification_status?: BankVerificationStatus | null;
};

export function bankVerificationStatus(account: SupplierBankAccount | null | undefined): BankVerificationStatus {
  const stored = account?.verification_status;
  if (stored === "verified" || stored === "pending" || stored === "failed") return stored;
  return account?.verified_at ? "verified" : "pending";
}

const PROFILE_COLUMNS =
  "vendor_status, blacklist_reason, status_changed_at, advance_percentage, aadhaar_number, pan_number, gstin, msme_number, " +
  "gumasta_number, phone, secondary_phone, supplier_type, linked_organization_id";

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function getVendorOnboardingProfile(
  orgId: string,
  supplierId: string,
): Promise<{ error: Error | null; profile: VendorOnboardingProfile | null }> {
  const { data, error } = await supabase()
    .from("suppliers")
    .select(PROFILE_COLUMNS)
    .eq("organization_id", orgId)
    .eq("id", supplierId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), profile: null };
  if (!data) return { error: null, profile: null };
  const row = data as unknown as Record<string, unknown>;
  const pct = row.advance_percentage;
  return {
    error: null,
    profile: {
      vendor_status: normalizeVendorStatus(row.vendor_status as string | null),
      blacklist_reason: (row.blacklist_reason as string | null) ?? null,
      status_changed_at: (row.status_changed_at as string | null) ?? null,
      advance_percentage: pct == null ? null : Number(pct),
      aadhaar_number: (row.aadhaar_number as string | null) ?? null,
      pan_number: (row.pan_number as string | null) ?? null,
      gstin: (row.gstin as string | null) ?? null,
      msme_number: (row.msme_number as string | null) ?? null,
      gumasta_number: (row.gumasta_number as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
      secondary_phone: (row.secondary_phone as string | null) ?? null,
      is_integrated: row.supplier_type === "integrated" || Boolean(row.linked_organization_id),
    },
  };
}

/** Saves identity numbers typed in the vault. Pass only the fields that changed. */
export async function updateVendorIdentityNumbers(
  orgId: string,
  supplierId: string,
  patch: Partial<
    Pick<VendorOnboardingProfile, "pan_number" | "aadhaar_number" | "gstin" | "msme_number" | "gumasta_number">
  >,
): Promise<{ error: Error | null }> {
  const updates: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    updates[key] = value == null ? null : normalizeIdNumber(value) || null;
  }
  if (Object.keys(updates).length === 0) return { error: null };
  const { error } = await supabase()
    .from("suppliers")
    .update(updates)
    .eq("organization_id", orgId)
    .eq("id", supplierId);
  return { error: error ? new Error(error.message) : null };
}

/**
 * Saves primary / secondary mobile as +91XXXXXXXXXX (same shape as suppliers.phone).
 * Pass `phone` only for non-integrated vendors; empty string clears the secondary.
 */
export async function updateVendorContactNumbers(
  orgId: string,
  supplierId: string,
  patch: { phone?: string; secondary_phone?: string },
): Promise<{ error: Error | null }> {
  const updates: Record<string, string | null> = {};
  if (patch.phone !== undefined) {
    const primary = normalizeIndianPhoneForMetadata(patch.phone);
    if (!primary) return { error: new Error("Enter a valid primary mobile number.") };
    updates.phone = primary;
  }
  if (patch.secondary_phone !== undefined) {
    const raw = patch.secondary_phone.trim();
    const secondary = raw ? normalizeIndianPhoneForMetadata(raw) : null;
    if (raw && !secondary) return { error: new Error("Enter a valid secondary mobile number.") };
    updates.secondary_phone = secondary;
  }
  if (Object.keys(updates).length === 0) return { error: null };
  const { error } = await supabase()
    .from("suppliers")
    .update(updates)
    .eq("organization_id", orgId)
    .eq("id", supplierId);
  return { error: error ? new Error(error.message) : null };
}

export async function setVendorStatus(
  orgId: string,
  supplierId: string,
  status: SupplierVendorStatus,
  reason: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("suppliers")
    .update({
      vendor_status: status,
      blacklist_reason: status === "blacklisted" ? reason.trim() : null,
      status_changed_at: new Date().toISOString(),
      status_changed_by: await currentUserId(),
    })
    .eq("organization_id", orgId)
    .eq("id", supplierId);
  return { error: error ? new Error(error.message) : null };
}

export async function updateVendorAdvancePercentage(
  orgId: string,
  supplierId: string,
  percentage: number | null,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("suppliers")
    .update({ advance_percentage: percentage })
    .eq("organization_id", orgId)
    .eq("id", supplierId);
  return { error: error ? new Error(error.message) : null };
}

/** Ids of the org's blacklisted vendors (the list RPC does not return vendor_status). */
export async function getBlacklistedSupplierIds(orgId: string): Promise<Set<string>> {
  const { data, error } = await supabase()
    .from("suppliers")
    .select("id")
    .eq("organization_id", orgId)
    .eq("vendor_status", "blacklisted");
  if (error || !data) return new Set();
  return new Set((data as { id: string }[]).map((r) => r.id));
}

// ── TDS rate per financial year ──────────────────────────────────────────────

export async function listSupplierTdsRates(
  orgId: string,
  supplierId: string,
): Promise<{ error: Error | null; rates: SupplierTdsRate[] }> {
  const { data, error } = await supabase()
    .from("supplier_tds_rates")
    .select("id, financial_year, rate_percent, updated_at")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .is("deleted_at", null)
    .order("financial_year", { ascending: false });
  if (error) return { error: new Error(error.message), rates: [] };
  return {
    error: null,
    rates: ((data ?? []) as SupplierTdsRate[]).map((r) => ({ ...r, rate_percent: Number(r.rate_percent) })),
  };
}

/** One rate per financial year: updates the existing row or inserts a new one. */
export async function upsertSupplierTdsRate(
  orgId: string,
  supplierId: string,
  financialYear: string,
  ratePercent: number,
): Promise<{ error: Error | null }> {
  const { data: existing, error: findErr } = await supabase()
    .from("supplier_tds_rates")
    .select("id")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId)
    .eq("financial_year", financialYear)
    .is("deleted_at", null)
    .maybeSingle();
  if (findErr) return { error: new Error(findErr.message) };
  if (existing) {
    const { error } = await supabase()
      .from("supplier_tds_rates")
      .update({ rate_percent: ratePercent })
      .eq("id", (existing as { id: string }).id);
    return { error: error ? new Error(error.message) : null };
  }
  const { error } = await supabase()
    .from("supplier_tds_rates")
    .insert({
      organization_id: orgId,
      supplier_id: supplierId,
      financial_year: financialYear,
      rate_percent: ratePercent,
      created_by: await currentUserId(),
    });
  return { error: error ? new Error(error.message) : null };
}

export async function deleteSupplierTdsRate(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("supplier_tds_rates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  return { error: error ? new Error(error.message) : null };
}

// ── Bank account (entity_bank_accounts, entity_type = 'supplier') ─────────────

export async function listSupplierBankAccounts(
  orgId: string,
  supplierId: string,
): Promise<{ error: Error | null; accounts: SupplierBankAccount[] }> {
  let lastError: string | null = null;
  for (const columns of SUPPLIER_BANK_SELECTS) {
    const { data, error } = await supabase()
      .from("entity_bank_accounts")
      .select(columns)
      .eq("organization_id", orgId)
      .eq("entity_type", "supplier")
      .eq("entity_id", supplierId)
      .is("deleted_at", null)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (!error) {
      return { error: null, accounts: (data ?? []) as unknown as SupplierBankAccount[] };
    }
    lastError = error.message;
  }
  return { error: new Error(lastError ?? "Could not load bank accounts"), accounts: [] };
}

export async function getSupplierBankAccount(
  orgId: string,
  supplierId: string,
): Promise<{ error: Error | null; account: SupplierBankAccount | null }> {
  const { error, accounts } = await listSupplierBankAccounts(orgId, supplierId);
  const account = accounts.find((row) => row.is_primary) ?? accounts[0] ?? null;
  return { error, account };
}

const SUPPLIER_BANK_SELECTS = [
  "id, bank_name, account_number, ifsc_code, beneficiary_name, branch_name, cancelled_cheque_url, is_primary, verified_at, verification_status",
  "id, bank_name, account_number, ifsc_code, beneficiary_name, branch_name, cancelled_cheque_url, is_primary, verified_at",
  "id, bank_name, account_number, ifsc_code, beneficiary_name, branch_name, cancelled_cheque_url",
  "id, bank_name, account_number, ifsc_code, cancelled_cheque_url",
  "id, bank_name, account_number, ifsc_code",
] as const;

export type SupplierBankAccountInput = {
  bank_name: string;
  account_number: string;
  ifsc_code: string;
  beneficiary_name: string;
  branch_name: string;
};

function isMissingBankDetailColumn(message: string | undefined) {
  return /beneficiary_name|branch_name/i.test(message ?? "");
}

function isMissingVerificationStatusColumn(message: string | undefined) {
  return /verification_status/i.test(message ?? "") && /does not exist|schema cache|could not find/i.test(message ?? "");
}

/**
 * `extrasPending` is true when the DB does not have the beneficiary/branch
 * columns yet: the core account is saved, the two extra fields are not.
 */
export async function saveSupplierBankAccount(
  orgId: string,
  supplierId: string,
  existingId: string | null,
  input: SupplierBankAccountInput,
  options?: { isPrimary?: boolean },
): Promise<{ error: Error | null; id?: string | null; extrasPending?: boolean }> {
  const core = {
    bank_name: input.bank_name.trim() || null,
    account_number: normalizeIdNumber(input.account_number) || null,
    ifsc_code: normalizeIdNumber(input.ifsc_code) || null,
  };
  const full = {
    ...core,
    beneficiary_name: input.beneficiary_name.replace(/\s+/g, " ").trim() || null,
    branch_name: input.branch_name.replace(/\s+/g, " ").trim() || null,
  };
  const isPrimary = options?.isPrimary ?? true;
  const write = (values: typeof core | typeof full) =>
    existingId
      ? supabase()
          .from("entity_bank_accounts")
          .update({ ...values, is_primary: isPrimary })
          .eq("id", existingId)
          .select("id")
          .single()
      : supabase()
          .from("entity_bank_accounts")
          .insert({
            organization_id: orgId,
            entity_type: "supplier",
            entity_id: supplierId,
            is_primary: isPrimary,
            ...values,
          })
          .select("id")
          .single();

  const { data, error } = await write(full);
  if (error && isMissingBankDetailColumn(error.message)) {
    const retry = await write(core);
    return {
      error: retry.error ? new Error(retry.error.message) : null,
      id: (retry.data as { id?: string } | null)?.id ?? existingId,
      extrasPending: !retry.error,
    };
  }
  return {
    error: error ? new Error(error.message) : null,
    id: (data as { id?: string } | null)?.id ?? existingId,
  };
}

export async function deleteSupplierBankAccount(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("entity_bank_accounts")
    .update({ deleted_at: new Date().toISOString(), is_primary: false })
    .eq("id", id);
  return { error: error ? new Error(error.message) : null };
}

export async function setSupplierBankVerification(
  id: string,
  status: BankVerificationStatus,
): Promise<{ error: Error | null }> {
  const userId = status === "verified" ? await currentUserId() : null;
  const values: Record<string, unknown> = {
    verification_status: status,
    verified_at: status === "verified" ? new Date().toISOString() : null,
    verified_by: userId,
  };
  const write = (patch: Record<string, unknown>) =>
    supabase().from("entity_bank_accounts").update(patch).eq("id", id);
  const { error } = await write(values);
  if (error && isMissingVerificationStatusColumn(error.message)) {
    if (status === "failed") {
      return {
        error: new Error("Failed status is stored once the bank verification update is applied on the database."),
      };
    }
    delete values.verification_status;
    const retry = await write(values);
    return { error: retry.error ? new Error(retry.error.message) : null };
  }
  return { error: error ? new Error(error.message) : null };
}
