import {
  extraBelongsToVehicleDocType,
  vehicleFilesForDocType,
} from "@/features/vehicles/utils/vehicleDocuments.util";

describe("vehicleFilesForDocType", () => {
  it("includes the slot plus extras of that type, and skips other types", () => {
    const files = vehicleFilesForDocType(
      {
        rc: { url: "org/v/rc.jpg", expiryDate: "2027-01-01" },
        extras: [
          { id: "e1", url: "org/v/extras/1.jpg", expiryDate: "", fileName: "RC · page-2.jpg", docType: "rc" },
          { id: "e2", url: "org/v/extras/2.jpg", expiryDate: "", fileName: "Fitness · extra.jpg", docType: "fitness" },
        ],
      },
      "rc",
    );
    expect(files).toHaveLength(2);
    expect(files[0]?.url).toBe("org/v/rc.jpg");
    expect(files[1]?.url).toBe("org/v/extras/1.jpg");
  });

  it("matches extras by filename when docType is missing", () => {
    expect(
      extraBelongsToVehicleDocType(
        { id: "e", url: "x", expiryDate: "", fileName: "rc" },
        "rc",
      ),
    ).toBe(true);
  });
});
