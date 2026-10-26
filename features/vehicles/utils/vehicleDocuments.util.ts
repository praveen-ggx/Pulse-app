/** Vehicle document types — matches pulse-unified-base utils/documentExpiry.ts */
export interface DocumentWithExpiry {
  url: string;
  expiryDate: string;
  uploadedAt?: string;
  /** Set only when someone approves this file in Compliance. Upload alone does not set it. */
  verifiedAt?: string | null;
}

export type VehicleComplianceDocType =
  | "rc"
  | "insurance"
  | "fitness"
  | "pollution"
  | "permit"
  | "road_tax";

/** Extra files attached from the trip vault (additional pages of RC / insurance / etc.). */
export interface VehicleExtraDocument extends DocumentWithExpiry {
  id: string;
  fileName?: string;
  /** When set, this extra is another page of that compliance type. */
  docType?: VehicleComplianceDocType;
}

export interface VehicleDocuments {
  rc?: DocumentWithExpiry;
  insurance?: DocumentWithExpiry;
  fitness?: DocumentWithExpiry;
  pollution?: DocumentWithExpiry;
  permit?: DocumentWithExpiry;
  road_tax?: DocumentWithExpiry;
  extras?: VehicleExtraDocument[];
}

export const DOCUMENT_LABELS: Record<VehicleComplianceDocType, string> = {
  rc: 'Registration Certificate (RC)',
  insurance: 'Insurance Policy',
  fitness: 'Fitness Certificate',
  pollution: 'PUC Certificate',
  permit: 'Permit',
  road_tax: 'Tax',
};

export const DOCUMENT_SHORT_LABELS: Record<VehicleComplianceDocType, string> = {
  rc: 'RC',
  insurance: 'Insurance',
  fitness: 'Fitness',
  pollution: 'PUC',
  permit: 'Permit',
  road_tax: 'Tax',
};

export const DOCUMENT_EXPIRY_ORDER: VehicleComplianceDocType[] = [
  'insurance',
  'rc',
  'fitness',
  'pollution',
];

/** Upload picker order — RC and Fitness first so they are easy to tell apart. */
export const VEHICLE_UPLOAD_CHOOSER_ORDER: VehicleComplianceDocType[] = [
  'rc',
  'fitness',
  'insurance',
  'pollution',
  'permit',
  'road_tax',
];

export function isVehicleComplianceDocType(
  value: string,
): value is VehicleComplianceDocType {
  return (VEHICLE_UPLOAD_CHOOSER_ORDER as readonly string[]).includes(value);
}

export const VEHICLE_COMPLIANCE_TYPE_HINT = VEHICLE_UPLOAD_CHOOSER_ORDER.map(
  (docType) => DOCUMENT_SHORT_LABELS[docType],
).join(' · ');

export function vehicleComplianceOnFileSummary(
  docs: VehicleDocuments | null | undefined,
): string {
  return VEHICLE_UPLOAD_CHOOSER_ORDER.filter((docType) => !!docs?.[docType]?.url)
    .map((docType) => DOCUMENT_SHORT_LABELS[docType])
    .join(' · ');
}

/** Extra pages of RC / insurance / etc. after the first slot file. */
export function extraBelongsToVehicleDocType(
  extra: VehicleExtraDocument,
  docType: VehicleComplianceDocType,
): boolean {
  if (extra.docType) return extra.docType === docType;
  const name = (extra.fileName ?? "").trim().toLowerCase();
  if (!name) return false;
  const short = DOCUMENT_SHORT_LABELS[docType].toLowerCase();
  const long = DOCUMENT_LABELS[docType].toLowerCase();
  return (
    name === docType ||
    name === short ||
    name === long ||
    name.startsWith(`${short} ·`) ||
    name.startsWith(`${short} `) ||
    name.startsWith(`${long} `)
  );
}

export function vehicleFilesForDocType(
  docs: VehicleDocuments | null | undefined,
  docType: VehicleComplianceDocType,
): { url: string; fileName: string; extraId?: string; expiryDate?: string | null }[] {
  const slot = docs?.[docType];
  const files: { url: string; fileName: string; extraId?: string; expiryDate?: string | null }[] = [];
  const slotUrl = slot?.url?.trim() ?? "";
  if (slotUrl) {
    files.push({
      url: slotUrl,
      fileName: DOCUMENT_LABELS[docType],
      expiryDate: slot?.expiryDate ?? null,
    });
  }
  (docs?.extras ?? []).forEach((extra, index) => {
    const url = extra.url?.trim() ?? "";
    if (!url || !extraBelongsToVehicleDocType(extra, docType)) return;
    if (files.some((file) => file.url === url)) return;
    files.push({
      url,
      fileName:
        extra.fileName?.trim() ||
        `${DOCUMENT_SHORT_LABELS[docType]} ${files.length + index + 1}`,
      extraId: extra.id,
      expiryDate: extra.expiryDate || slot?.expiryDate || null,
    });
  });
  return files;
}
