/**
 * Driver identity docs shown on Trip Asset Vault (License + Aadhaar).
 * Persisted on entity_documents (same store Compliance uses for driver slots).
 */

export type DriverIdentityDocType = "license" | "aadhaar";

export const DRIVER_IDENTITY_LABELS: Record<DriverIdentityDocType, string> = {
  license: "Driver License",
  aadhaar: "Driver Aadhaar Card",
};

export const DRIVER_IDENTITY_SHORT_LABELS: Record<DriverIdentityDocType, string> = {
  license: "License",
  aadhaar: "Aadhaar",
};

export const DRIVER_IDENTITY_UPLOAD_ORDER: readonly DriverIdentityDocType[] = [
  "license",
  "aadhaar",
];

export const DRIVER_IDENTITY_TYPE_HINT = DRIVER_IDENTITY_UPLOAD_ORDER.map(
  (docType) => DRIVER_IDENTITY_SHORT_LABELS[docType].toUpperCase(),
).join(" · ");

export type DriverIdentityFile = {
  id: string;
  url: string;
  expiryDate?: string | null;
  fileName?: string | null;
  kind: DriverIdentityDocType;
};

export type DriverIdentityDocuments = Partial<
  Record<
    DriverIdentityDocType,
    {
      id: string;
      url: string;
      expiryDate?: string | null;
      fileName?: string | null;
    }
  >
> & {
  extras?: DriverIdentityFile[];
};

export function driverIdentityOnFileSummary(
  docs: DriverIdentityDocuments | null | undefined,
): string {
  return DRIVER_IDENTITY_UPLOAD_ORDER.filter((docType) => !!docs?.[docType]?.url)
    .map((docType) => DRIVER_IDENTITY_SHORT_LABELS[docType])
    .join(" · ");
}

export function isDriverIdentityDocType(value: string): value is DriverIdentityDocType {
  return value === "license" || value === "aadhaar";
}

export function driverFilesForDocType(
  docs: DriverIdentityDocuments | null | undefined,
  docType: DriverIdentityDocType,
): { url: string; fileName: string; documentId?: string; expiryDate?: string | null }[] {
  const slot = docs?.[docType];
  const files: {
    url: string;
    fileName: string;
    documentId?: string;
    expiryDate?: string | null;
  }[] = [];
  const slotUrl = slot?.url?.trim() ?? "";
  if (slotUrl) {
    files.push({
      url: slotUrl,
      fileName: slot?.fileName?.trim() || DRIVER_IDENTITY_LABELS[docType],
      documentId: slot?.id,
      expiryDate: slot?.expiryDate ?? null,
    });
  }
  for (const extra of docs?.extras ?? []) {
    const url = extra.url?.trim() ?? "";
    if (!url || extra.kind !== docType) continue;
    if (files.some((file) => file.url === url)) continue;
    files.push({
      url,
      fileName: extra.fileName?.trim() || DRIVER_IDENTITY_LABELS[docType],
      documentId: extra.id,
      expiryDate: extra.expiryDate ?? slot?.expiryDate ?? null,
    });
  }
  return files;
}
