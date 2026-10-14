import {
  canAddMoreTripDocs,
  canMutateTripVaultDoc,
  formatLrVaultDateLabel,
  formatLrVaultNumberLabel,
  formatInvoiceVaultNumberLabel,
  formatVaultDocDate,
  isDriverPodVaultDoc,
  isPdfTripDoc,
  vaultDocDateToIso,
  vaultDocHasPreviewableFile,
  vaultPickerRejectionMessage,
} from "../tripDocTypes";

describe("isPdfTripDoc", () => {
  it("detects PDF from vault type", () => {
    expect(isPdfTripDoc({ type: "PDF" })).toBe(true);
    expect(isPdfTripDoc({ type: "JPG" })).toBe(false);
  });

  it("detects PDF from mime type even when type is image-like", () => {
    expect(
      isPdfTripDoc({ type: "JPG", mimeType: "application/pdf" }),
    ).toBe(true);
  });

  it("detects PDF from file name or storage path when mime is missing", () => {
    expect(
      isPdfTripDoc({
        type: "JPG",
        fileName: "lr-scan.pdf",
        storagePath: "trip-1/lr/abc.jpg",
      }),
    ).toBe(true);
    expect(
      isPdfTripDoc({
        type: "JPG",
        storagePath: "trip-1/lr/abc.pdf?token=1",
      }),
    ).toBe(true);
  });

  it("does not treat images as PDFs", () => {
    expect(
      isPdfTripDoc({
        type: "JPG",
        mimeType: "image/jpeg",
        fileName: "pod.jpg",
        storagePath: "trip-1/pod/abc.jpg",
      }),
    ).toBe(false);
  });
});

describe("canMutateTripVaultDoc", () => {
  it("allows Driver POD before and after trip completion when upload is authorized", () => {
    expect(
      canMutateTripVaultDoc({
        doc: { id: "pod", category: "driver" },
        canUploadTripDocs: true,
        tripCompleted: false,
      }),
    ).toBe(true);
    expect(
      canMutateTripVaultDoc({
        doc: { id: "pod", category: "driver" },
        canUploadTripDocs: true,
        tripCompleted: true,
      }),
    ).toBe(true);
  });

  it("still denies Driver POD when the caller cannot upload trip docs", () => {
    expect(
      canMutateTripVaultDoc({
        doc: { id: "pod", category: "driver" },
        canUploadTripDocs: false,
        tripCompleted: false,
      }),
    ).toBe(false);
  });

  it("does not gate LR or manifest on trip completion", () => {
    expect(
      canMutateTripVaultDoc({
        doc: { id: "lr", category: "lr" },
        canUploadTripDocs: true,
        tripCompleted: false,
      }),
    ).toBe(true);
    expect(isDriverPodVaultDoc({ id: "manifest", category: "trip" })).toBe(
      false,
    );
  });
});

describe("canAddMoreTripDocs", () => {
  it("allows extra files for trip-scoped vault slots", () => {
    expect(canAddMoreTripDocs({ category: "lr" })).toBe(true);
    expect(canAddMoreTripDocs({ category: "eway" })).toBe(false);
    expect(canAddMoreTripDocs({ id: "eway_bill" })).toBe(false);
    expect(canAddMoreTripDocs({ category: "trip" })).toBe(true);
    expect(canAddMoreTripDocs({ category: "driver" })).toBe(true);
  });

  it("allows extra files for vehicle documents", () => {
    expect(canAddMoreTripDocs({ category: "vehicle" })).toBe(true);
    expect(canAddMoreTripDocs({ id: "vehicle-documents" })).toBe(true);
    expect(
      canAddMoreTripDocs({ docSource: "vehicle", category: "vehicle" }),
    ).toBe(true);
  });

  it("allows invoice, memo, and driver identity vault slots", () => {
    expect(canAddMoreTripDocs({ category: "invoice", id: "invoice" })).toBe(
      true,
    );
    expect(canAddMoreTripDocs({ category: "trip_details", id: "trip-details" })).toBe(
      true,
    );
    expect(canAddMoreTripDocs({ category: "driver_identity" })).toBe(true);
    expect(canAddMoreTripDocs({ id: "driver-documents" })).toBe(true);
    expect(
      canAddMoreTripDocs({ docSource: "compliance", id: "driver-documents" }),
    ).toBe(true);
  });
});

describe("vaultDocHasPreviewableFile", () => {
  it("disables preview when the vehicle slot has no files", () => {
    expect(
      vaultDocHasPreviewableFile({ status: "Pending" }),
    ).toBe(false);
  });

  it("enables preview when a file is on file", () => {
    expect(
      vaultDocHasPreviewableFile({
        status: "Pending",
        storagePath: "vehicles/1/rc.pdf",
      }),
    ).toBe(true);
    expect(
      vaultDocHasPreviewableFile({
        status: "Pending",
        files: [{ id: "rc", label: "RC", type: "PDF", storagePath: "a.pdf" }],
      }),
    ).toBe(true);
    expect(
      vaultDocHasPreviewableFile({ status: "Uploaded" }),
    ).toBe(true);
  });
});

describe("vaultPickerRejectionMessage", () => {
  it("rejects files over 100 MB", () => {
    expect(
      vaultPickerRejectionMessage([
        { name: "scan.pdf", mimeType: "application/pdf", size: 101 * 1024 * 1024 },
      ]),
    ).toMatch(/100 MB/);
  });

  it("rejects unsupported types", () => {
    expect(
      vaultPickerRejectionMessage([
        { name: "notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      ]),
    ).toMatch(/not supported/);
  });

  it("accepts PDF and JPEG under the limit", () => {
    expect(
      vaultPickerRejectionMessage([
        { name: "lr.pdf", mimeType: "application/pdf", size: 2 * 1024 * 1024 },
        { name: "pod.jpg", mimeType: "image/jpeg", size: 500_000 },
      ]),
    ).toBeNull();
  });
});

describe("formatVaultDocDate", () => {
  it("formats ISO dates", () => {
    expect(formatVaultDocDate("2026-09-04T10:00:00.000Z")).toBe("04-Sep-26");
  });

  it("formats DD-MM-YYYY from OCR", () => {
    expect(formatVaultDocDate("28-08-2026")).toBe("28-Aug-26");
    expect(formatVaultDocDate("04-09-2026 18:00")).toBe("04-Sep-26");
  });
});

describe("vaultDocDateToIso", () => {
  it("converts display and typed dates to YYYY-MM-DD", () => {
    expect(vaultDocDateToIso("04-Sep-26")).toBe("2026-09-04");
    expect(vaultDocDateToIso("28-08-2026")).toBe("2026-08-28");
    expect(vaultDocDateToIso("2026-09-03")).toBe("2026-09-03");
  });
});

describe("formatInvoiceVaultNumberLabel", () => {
  it("shows the invoice number on the invoice bar", () => {
    expect(formatInvoiceVaultNumberLabel("45821")).toBe("Invoice No. 45821");
    expect(formatInvoiceVaultNumberLabel("")).toBeNull();
  });

  it("shows every invoice number joined with slashes", () => {
    expect(formatInvoiceVaultNumberLabel("123456/897654/345678")).toBe(
      "Invoice No. 123456/897654/345678",
    );
  });
});

describe("formatLrVaultNumberLabel", () => {
  it("shows the typed LR number on the vault card", () => {
    expect(formatLrVaultNumberLabel("AI3583")).toBe("LR No. AI3583");
  });

  it("does not duplicate an existing LR No. prefix", () => {
    expect(formatLrVaultNumberLabel("LR No. AI3583")).toBe("LR No. AI3583");
  });

  it("hides the line when no number was entered", () => {
    expect(formatLrVaultNumberLabel("  ")).toBeNull();
  });

  it("reads the number from a stored LR payload", () => {
    expect(
      formatLrVaultNumberLabel(
        JSON.stringify({
          lrNumber: "AI3583",
          date: "03-09-2026",
          invoice: "INV-12",
        }),
      ),
    ).toBe("LR No. AI3583");
  });
});

describe("formatLrVaultDateLabel", () => {
  it("prefixes the vault date for the card", () => {
    expect(formatLrVaultDateLabel("03-Sep-26")).toBe("LR date 03-Sep-26");
    expect(formatLrVaultDateLabel("03-09-2026")).toBe("LR date 03-Sep-26");
  });

  it("does not duplicate an existing LR date prefix", () => {
    expect(formatLrVaultDateLabel("LR date 03-Sep-26")).toBe("LR date 03-Sep-26");
  });

  it("hides the line when no date was entered", () => {
    expect(formatLrVaultDateLabel("  ")).toBeNull();
  });
});
