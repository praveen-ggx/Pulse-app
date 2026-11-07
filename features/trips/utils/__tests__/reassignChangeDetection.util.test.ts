import {
  isEditingCurrentTripDriver,
  isNameOnlyDriverUpdate,
  isSameDriverPhone,
  phoneLast10,
  shouldInviteDriverByPhone,
} from "@/features/trips/utils/reassignChangeDetection.util";

describe("shouldInviteDriverByPhone", () => {
  it("does not invite when the number is the current trip driver", () => {
    expect(
      shouldInviteDriverByPhone({
        phone: "8104921341",
        currentDriverPhone: "+91 81049 21341",
        rosterPhones: [],
      }),
    ).toBe(false);
  });

  it("does not invite when the number is already on this org roster", () => {
    expect(
      shouldInviteDriverByPhone({
        phone: "9876543210",
        currentDriverPhone: "8104921341",
        rosterPhones: ["+919876543210"],
      }),
    ).toBe(false);
  });

  it("invites only for a number that is not current and not in roster", () => {
    expect(
      shouldInviteDriverByPhone({
        phone: "9000000001",
        currentDriverPhone: "8104921341",
        rosterPhones: ["8104921341"],
      }),
    ).toBe(true);
  });

  it("normalizes last 10 digits", () => {
    expect(phoneLast10("+91 81049 21341")).toBe("8104921341");
  });

  it("treats +91 and 10-digit as the same driver", () => {
    expect(isSameDriverPhone("+91 98491 22459", "9849122459")).toBe(true);
    expect(isSameDriverPhone("9849122459", "9000000001")).toBe(false);
  });
});

describe("isEditingCurrentTripDriver / isNameOnlyDriverUpdate", () => {
  it("keeps the assigned driver when phone fields are empty", () => {
    expect(
      isEditingCurrentTripDriver({
        tripDriverId: "drv-1",
        phone: "",
        currentDriverPhone: null,
      }),
    ).toBe(true);
  });

  it("allows a name-only update without a loaded phone", () => {
    expect(
      isNameOnlyDriverUpdate({
        tripDriverId: "drv-1",
        phone: "",
        currentDriverPhone: null,
        currentDriverName: "JOHNAMALRAJ",
        driverNameInput: "John Amalraj",
      }),
    ).toBe(true);
  });

  it("does not treat a newly typed phone as the current driver without a baseline", () => {
    expect(
      isEditingCurrentTripDriver({
        tripDriverId: "drv-1",
        phone: "9566594872",
        currentDriverPhone: null,
      }),
    ).toBe(false);
  });
});
