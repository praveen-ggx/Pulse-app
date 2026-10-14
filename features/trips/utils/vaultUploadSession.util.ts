/**
 * Confirm-upload session for the trip vault.
 * The dialog closes before the storage write. A second accept while one
 * upload is in flight is ignored. Success never asks for a full document reload.
 */

export type VaultUploadError = {
  slotId: string;
  message: string;
};

export function acceptVaultFileConfirmation(args: {
  inFlight: boolean;
  slotId: string;
}):
  | { accepted: false }
  | {
      accepted: true;
      closeDialog: true;
      uploadingSlotId: string;
      refreshDocuments: false;
    } {
  if (args.inFlight || !args.slotId.trim()) return { accepted: false };
  return {
    accepted: true,
    closeDialog: true,
    uploadingSlotId: args.slotId,
    refreshDocuments: false,
  };
}

export function vaultUploadOutcome(args: {
  ok: boolean;
  documentId?: string | null;
  message?: string;
  slotId: string;
}): {
  refreshDocuments: false;
  saved: boolean;
  uploading: false;
  error: VaultUploadError | null;
  documentId: string | null;
} {
  if (!args.ok || !args.documentId) {
    return {
      refreshDocuments: false,
      saved: false,
      uploading: false,
      error: {
        slotId: args.slotId,
        message: args.message?.trim() || "Upload failed",
      },
      documentId: null,
    };
  }
  return {
    refreshDocuments: false,
    saved: true,
    uploading: false,
    error: null,
    documentId: args.documentId,
  };
}

/**
 * Org that uploads a vehicle document from the trip vault: the signed-in
 * user's org, else the trip's org. Never the truck owner's org, because a
 * partner truck's folder is closed to us. Null means "no org to upload as".
 */
export function vaultUploaderOrgId(args: {
  currentOrgId: string | null | undefined;
  tripOrgId: string | null | undefined;
}): string | null {
  return args.currentOrgId?.trim() || args.tripOrgId?.trim() || null;
}
