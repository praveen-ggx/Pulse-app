import { collectAssetEntityExtras } from "@/features/trips/components/trip-detail/assetEntityExtras.util";

const row = (id: string, doc_type: string, extra: Record<string, unknown> = {}) => ({
  id,
  doc_type,
  storage_path: `org/vehicle/${id}.pdf`,
  status: "pending",
  created_at: `2026-10-2${id.length}T00:00:00Z`,
  ...extra,
});

describe("collectAssetEntityExtras", () => {
  it("lists a second RC next to the one in the slot (added, not replaced)", () => {
    const extras = collectAssetEntityExtras(
      [row("rc1", "rc", { storage_path: "vault/rc.pdf" }), row("rc22", "rc")],
      { allowedTypes: ["rc", "insurance"], shownPaths: new Set(["vault/rc.pdf"]) },
    );
    expect(extras.map((e) => e.id)).toEqual(["rc22"]);
    expect(extras[0]).toMatchObject({ docType: "rc", storagePath: "org/vehicle/rc22.pdf" });
  });

  it("skips the driver file already shown in its slot by id", () => {
    const extras = collectAssetEntityExtras(
      [row("lic1", "license"), row("lic22", "license"), row("aad1", "aadhaar")],
      { allowedTypes: ["license", "aadhaar"], shownIds: new Set(["lic1", "aad1"]) },
    );
    expect(extras.map((e) => e.id)).toEqual(["lic22"]);
  });

  it("drops rejected, replaced, file-less and other-type rows, and duplicates across orgs", () => {
    const extras = collectAssetEntityExtras(
      [
        row("a", "rc", { status: "rejected" }),
        row("b", "rc", { status: "replaced" }),
        row("c", "rc", { storage_path: " " }),
        row("d", "pan_card"),
        row("e", "insurance"),
        row("e", "insurance"),
      ],
      { allowedTypes: ["rc", "insurance"] },
    );
    expect(extras.map((e) => e.id)).toEqual(["e"]);
  });

  it("orders added files oldest first", () => {
    const extras = collectAssetEntityExtras(
      [
        row("x", "rc", { created_at: "2026-10-22T00:00:00Z" }),
        row("y", "rc", { created_at: "2026-10-20T00:00:00Z" }),
      ],
      { allowedTypes: ["rc"] },
    );
    expect(extras.map((e) => e.id)).toEqual(["y", "x"]);
  });
});
