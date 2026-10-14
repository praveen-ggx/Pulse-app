/**
 * Resolve supplier bank proof + account details for Compliance Finance → Bank Docs.
 * Prefers KYC files (cancelled cheque / statement), then cancelled_cheque_url on the account.
 */
import { getSupplierKycDocuments } from "@/features/suppliers/services/supplierKycDocuments.service";
import {
  getSupplierBankAccount,
  type SupplierBankAccount,
} from "@/features/suppliers/services/supplierVendorOnboarding.service";
import type { SupplierKycDocument } from "@/features/suppliers/types/supplierManagement.types";

export const SUPPLIER_BANK_PROOF_DOC_TYPES = [
  "cancelled_cheque",
  "bank_statement",
  "bank_proof_other",
] as const;

export type SupplierBankProofBundle = {
  account: SupplierBankAccount | null;
  kycDoc: SupplierKycDocument | null;
  /** Openable storage path or https URL for preview. */
  previewPath: string | null;
  /** Compact line for list rows (matches supplier vault “On file” meta). */
  detailLine: string | null;
  /** True when account numbers and/or a proof file exist. */
  onFile: boolean;
};

/** Same trailing meta as supplier Banking vault: On file · full account · IFSC. */
export function formatSupplierBankOnFileLine(account: SupplierBankAccount | null): string | null {
  const acct = account?.account_number?.trim();
  if (!acct) return null;
  const ifsc = account?.ifsc_code?.trim() || "—";
  return `On file · ${acct} · ${ifsc}`;
}

function bankDetailLine(
  account: SupplierBankAccount | null,
  fileName?: string | null,
): string | null {
  const onFile = formatSupplierBankOnFileLine(account);
  const parts: string[] = [];
  if (fileName?.trim()) parts.push(fileName.trim());
  const bank = account?.bank_name?.trim();
  if (bank) parts.push(bank);
  if (onFile) {
    if (!fileName?.trim() && !bank) return onFile;
    const acct = account?.account_number?.trim();
    if (acct) parts.push(acct);
    const ifsc = account?.ifsc_code?.trim();
    if (ifsc) parts.push(ifsc);
  }
  if (parts.length > 0) return parts.join(" · ");
  return onFile;
}

function pickBankKycDoc(documents: SupplierKycDocument[]): SupplierKycDocument | null {
  const withFile = documents.filter(
    (doc) =>
      SUPPLIER_BANK_PROOF_DOC_TYPES.includes(doc.doc_type as (typeof SUPPLIER_BANK_PROOF_DOC_TYPES)[number]) &&
      Boolean(doc.storage_path?.trim()),
  );
  if (withFile.length === 0) return null;
  const rank = (type: string) => {
    const idx = SUPPLIER_BANK_PROOF_DOC_TYPES.indexOf(
      type as (typeof SUPPLIER_BANK_PROOF_DOC_TYPES)[number],
    );
    return idx >= 0 ? idx : 99;
  };
  return [...withFile].sort((a, b) => {
    const byType = rank(a.doc_type) - rank(b.doc_type);
    if (byType !== 0) return byType;
    return (b.updated_at ?? b.created_at ?? "").localeCompare(a.updated_at ?? a.created_at ?? "");
  })[0] ?? null;
}

export async function fetchSupplierBankProofBundle(
  orgId: string,
  supplierId: string,
): Promise<SupplierBankProofBundle> {
  const empty: SupplierBankProofBundle = {
    account: null,
    kycDoc: null,
    previewPath: null,
    detailLine: null,
    onFile: false,
  };
  if (!orgId.trim() || !supplierId.trim()) return empty;

  const [accountResult, kycResult] = await Promise.all([
    getSupplierBankAccount(orgId, supplierId),
    getSupplierKycDocuments(orgId, supplierId),
  ]);
  const account = accountResult.account;
  const kycDoc = pickBankKycDoc(kycResult.documents);
  const chequeUrl = account?.cancelled_cheque_url?.trim() || null;
  const previewPath = kycDoc?.storage_path?.trim() || chequeUrl || null;
  const detailLine = bankDetailLine(account, kycDoc?.file_name ?? null);
  const onFile = Boolean(
    account?.account_number?.trim() || previewPath || detailLine,
  );
  return {
    account,
    kycDoc,
    previewPath,
    detailLine,
    onFile,
  };
}
