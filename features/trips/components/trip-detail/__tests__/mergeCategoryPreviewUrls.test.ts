// Attribution row → Avatar → Auth; keep this pure merge helper test free of native modules.
jest.mock("@/components/Avatar", () => ({ UserAvatar: "UserAvatar" }));
// DocumentDateCalendar's lucide icons need react-native-svg internals Jest does not load.
jest.mock("lucide-react-native", () => ({ ChevronLeft: "ChevronLeft", ChevronRight: "ChevronRight" }));

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
