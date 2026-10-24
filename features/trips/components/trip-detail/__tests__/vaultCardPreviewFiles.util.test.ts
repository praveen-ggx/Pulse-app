import { filesFromVaultDoc } from "../vaultCardPreviewFiles.util";
import type { TripDocItem } from "../tripDocTypes";

function doc(partial: Partial<TripDocItem> & Pick<TripDocItem, "id" | "label">): TripDocItem {
  return {
    category: "trip",
    type: "PDF",
    status: "Uploaded",
    ...partial,
  } as TripDocItem;
}

describe("filesFromVaultDoc", () => {
  it("prefers nested files with a storage path over the card path", () => {
    const files = filesFromVaultDoc(
      doc({
        id: "lr",
        label: "LR",
        storagePath: "trips/old.pdf",
        files: [
          {
            id: "f1",
            label: "Copy 1",
            type: "PDF",
            storagePath: "trips/new.pdf",
            fileName: "lr.pdf",
            docSource: "trip",
          },
        ],
      }),
    );
    expect(files).toHaveLength(1);
    expect(files[0]?.storagePath).toBe("trips/new.pdf");
    expect(files[0]?.id).toBe("f1");
  });

  it("falls back to the card storage path when no nested files exist", () => {
    const files = filesFromVaultDoc(
      doc({
        id: "lr",
        label: "LR copy",
        storagePath: "trips/lr.pdf",
        docSource: "trip",
      }),
    );
    expect(files).toEqual([
      {
        id: "lr",
        label: "LR copy",
        type: "PDF",
        storagePath: "trips/lr.pdf",
        fileName: "LR copy",
        docSource: "trip",
      },
    ]);
  });

  it("returns empty when the document is missing", () => {
    expect(filesFromVaultDoc(doc({ id: "lr", label: "LR", status: "Pending" }))).toEqual([]);
  });
});
