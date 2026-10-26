export type VaultCategoryPreviewFile = {
  id: string;
  fileName: string;
  categoryLabel: string;
  storagePath?: string | null;
  previewUri?: string | null;
  mimeHint?: string | null;
  documentId?: string;
  category?: string;
  deleteKind?: "trip" | "vehicle_extra" | "vehicle_compliance" | "driver_identity";
  extraId?: string;
  complianceType?: string;
  driverKind?: "license" | "aadhaar";
  /** ISO YYYY-MM-DD when this file has a validity date. */
  expiryDate?: string | null;
  /** LR / invoice number for this copy. */
  documentNumber?: string | null;
};

export type VaultCategoryPreviewSession = {
  files: VaultCategoryPreviewFile[];
  index: number;
};
