import { MAX_TRIP_DOC_BYTES } from "@/features/trips/services/tripDocuments.service";
import {
  COMPLIANCE_TRIP_DOC_FORMAT_LABEL,
  complianceTripDocFormatHint,
  complianceTripDocPreviewKind,
  inferComplianceTripDocMime,
  validateComplianceTripDocumentFile,
} from "@/features/tripCompliance/utils/complianceTripDocumentFormat.util";

describe("validateComplianceTripDocumentFile", () => {
  it("accepts PDF, JPG, JPEG, PNG, and WebP including uppercase extensions", () => {
    expect(validateComplianceTripDocumentFile({ fileName: "a.PDF", mimeType: "application/pdf", byteLength: 100 }).ok).toBe(true);
    expect(validateComplianceTripDocumentFile({ fileName: "a.JPG", mimeType: "image/jpeg", byteLength: 100 }).ok).toBe(true);
    expect(validateComplianceTripDocumentFile({ fileName: "a.jpeg", mimeType: "image/jpg", byteLength: 100 }).ok).toBe(true);
    expect(validateComplianceTripDocumentFile({ fileName: "a.png", mimeType: "image/png", byteLength: 100 }).ok).toBe(true);
    expect(validateComplianceTripDocumentFile({ fileName: "a.webp", mimeType: "image/webp", byteLength: 100 }).ok).toBe(true);
  });

  it("infers MIME from extension when the picker omits it", () => {
    const result = validateComplianceTripDocumentFile({ fileName: "scan.png", mimeType: null, byteLength: 50 });
    expect(result).toEqual({ ok: true, mimeType: "image/png", extension: "png" });
  });

  it("rejects MIME/extension mismatches", () => {
    const pdfAsImage = validateComplianceTripDocumentFile({
      fileName: "lr.pdf",
      mimeType: "image/jpeg",
      byteLength: 50,
    });
    expect(pdfAsImage.ok).toBe(false);
    const jpgAsPdf = validateComplianceTripDocumentFile({
      fileName: "photo.jpg",
      mimeType: "application/pdf",
      byteLength: 50,
    });
    expect(jpgAsPdf.ok).toBe(false);
  });

  it("rejects docx, xlsx, zip, txt, and executables", () => {
    for (const fileName of ["note.docx", "sheet.xlsx", "pack.zip", "readme.txt", "run.exe"]) {
      const result = validateComplianceTripDocumentFile({ fileName, mimeType: null, byteLength: 50 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain(COMPLIANCE_TRIP_DOC_FORMAT_LABEL);
    }
  });

  it("rejects oversized files using MAX_TRIP_DOC_BYTES", () => {
    const result = validateComplianceTripDocumentFile({
      fileName: "big.pdf",
      mimeType: "application/pdf",
      byteLength: MAX_TRIP_DOC_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/larger than the 100 MB limit/i);
  });
});

describe("complianceTripDocFormatHint", () => {
  it("uses the authoritative size ceiling and supported formats", () => {
    expect(complianceTripDocFormatHint()).toContain("PDF, JPG, JPEG, PNG or WebP");
    expect(complianceTripDocFormatHint()).toContain("Up to 100 MB");
  });
});

describe("inferComplianceTripDocMime / preview kind", () => {
  it("does not treat text as a previewable user upload", () => {
    expect(inferComplianceTripDocMime({ fileName: "delivery-place.txt", mimeType: "text/plain" })).toBeNull();
    expect(complianceTripDocPreviewKind("text/plain")).toBe("none");
    expect(complianceTripDocPreviewKind("application/pdf")).toBe("pdf");
    expect(complianceTripDocPreviewKind("image/jpeg")).toBe("image");
  });
});
