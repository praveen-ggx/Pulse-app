import type { SupplierKycDocument } from "@/features/suppliers/types/supplierManagement.types";

/**
 * TDS supporting documents for a vendor's rate in a financial year.
 * Upload is mandatory only for 0% (team decision — a nil rate needs a basis on
 * file, e.g. Form 15G / 15H or the transporter declaration); every rate above 0
 * is optional. All uploads use one type: "TDS supporting document".
 */
export const TDS_DOC_TYPE = "tds_supporting_document" as const;

export type TdsDocumentRule = {
  /** Mandatory upload vs optional upload. */
  required: boolean;
};

export function getTdsDocumentRule(rate: number | null | undefined): TdsDocumentRule | null {
  if (rate == null || !Number.isFinite(rate) || rate < 0 || rate > 100) return null;
  return { required: Math.abs(rate) < 1e-9 };
}

/** Stored doc_label for a TDS document, tagged with its financial year. */
export function tdsDocLabelForYear(label: string, financialYear: string): string {
  return `${label} · FY ${financialYear}`;
}

/** Every uploaded TDS supporting document for the year, oldest first (matches the "· FY <year>" label suffix). */
export function tdsDocsForYear(
  docs: readonly SupplierKycDocument[],
  financialYear: string,
): SupplierKycDocument[] {
  const suffix = `FY ${financialYear}`;
  return docs
    .filter(
      (d) =>
        d.doc_type === TDS_DOC_TYPE &&
        Boolean((d.storage_path ?? "").trim()) &&
        (d.doc_label ?? "").trim().endsWith(suffix),
    )
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
}

/** True when at least one TDS supporting document is on file for the year. */
export function hasTdsDocForYear(docs: readonly SupplierKycDocument[], financialYear: string): boolean {
  return tdsDocsForYear(docs, financialYear).length > 0;
}
