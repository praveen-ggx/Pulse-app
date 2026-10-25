import { mergeCategoryPreviewUrls } from "@/features/trips/components/trip-detail/VaultCategoryPreviewModal";

describe("mergeCategoryPreviewUrls", () => {
  it("keeps a compliance preview when the trip bucket later reports a miss", () => {
    const path = "org/driver/driver-1/license_abc.jpg";
    const merged = mergeCategoryPreviewUrls(
      { [path]: "blob:license" },
      { [path]: null },
    );
    expect(merged[path]).toBe("blob:license");
  });

  it("accepts a signed URL that arrives after an empty trip lookup", () => {
    const path = "org/driver/driver-1/license_abc.jpg";
    const merged = mergeCategoryPreviewUrls(
      { [path]: null },
      { [path]: "blob:license" },
    );
    expect(merged[path]).toBe("blob:license");
  });
});
