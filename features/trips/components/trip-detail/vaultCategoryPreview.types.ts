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
};

export type VaultCategoryPreviewSession = {
  files: VaultCategoryPreviewFile[];
  index: number;
};
