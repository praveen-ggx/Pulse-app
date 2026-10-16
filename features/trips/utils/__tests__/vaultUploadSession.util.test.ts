import {
  acceptVaultFileConfirmation,
  vaultUploadOutcome,
  vaultUploaderOrgId,
} from "@/features/trips/utils/vaultUploadSession.util";

describe("vault upload confirmation", () => {
  it("closes the dialog immediately and marks the card uploading", () => {
    const next = acceptVaultFileConfirmation({
      inFlight: false,
      slotId: "pod",
    });
    expect(next).toEqual({
      accepted: true,
      closeDialog: true,
      uploadingSlotId: "pod",
      refreshDocuments: false,
    });
  });

  it("prevents a second accept while an upload is in flight", () => {
    expect(
      acceptVaultFileConfirmation({ inFlight: true, slotId: "pod" }),
    ).toEqual({ accepted: false });
  });

  it("records one saved document and does not refresh the document list", () => {
    expect(
      vaultUploadOutcome({
        ok: true,
        documentId: "doc-1",
        slotId: "pod",
      }),
    ).toEqual({
      refreshDocuments: false,
      saved: true,
      uploading: false,
      error: null,
      documentId: "doc-1",
    });
  });

  it("surfaces the failure reason and does not mark the document saved", () => {
    expect(
      vaultUploadOutcome({
        ok: false,
        message: "Storage quota exceeded",
        slotId: "manifest",
      }),
    ).toEqual({
      refreshDocuments: false,
      saved: false,
      uploading: false,
      error: { slotId: "manifest", message: "Storage quota exceeded" },
      documentId: null,
    });
  });
});

describe("vault uploader org", () => {
  it("uses the signed-in user's org first", () => {
    expect(vaultUploaderOrgId({ currentOrgId: "viewer", tripOrgId: "trip" })).toBe("viewer");
  });

  it("falls back to the trip org when there is no current org", () => {
    expect(vaultUploaderOrgId({ currentOrgId: null, tripOrgId: "trip" })).toBe("trip");
    expect(vaultUploaderOrgId({ currentOrgId: "  ", tripOrgId: "trip" })).toBe("trip");
  });

  it("returns null instead of any other org when neither is known", () => {
    expect(vaultUploaderOrgId({ currentOrgId: undefined, tripOrgId: null })).toBeNull();
    expect(vaultUploaderOrgId({ currentOrgId: "", tripOrgId: " " })).toBeNull();
  });
});
