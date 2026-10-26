import { lookupDriversByPhoneVariants } from "@/features/trips/utils/driverPhoneLookup.util";

const mockSearchExistingDriversByPhone = jest.fn();

jest.mock("@/features/drivers/services/drivers.service", () => ({
  searchExistingDriversByPhone: (...args: unknown[]) =>
    mockSearchExistingDriversByPhone(...args),
}));

describe("lookupDriversByPhoneVariants", () => {
  beforeEach(() => {
    mockSearchExistingDriversByPhone.mockReset();
  });

  it("issues one last-10 RPC because the server already canonicalizes +91 / 91", async () => {
    mockSearchExistingDriversByPhone.mockResolvedValue({
      error: null,
      matches: [
        {
          user_id: "u1",
          full_name: "Ravi",
          phone: "+919876543210",
          email: null,
          emergency_contact_name: null,
          emergency_contact_phone: null,
          license_number: null,
          avatar_url: null,
          avatar_seed: null,
          is_in_fleet: false,
        },
      ],
    });

    const { matches, last10, error } = await lookupDriversByPhoneVariants(
      "+91 98765 43210",
    );

    expect(error).toBeNull();
    expect(last10).toBe("9876543210");
    expect(matches).toHaveLength(1);
    expect(mockSearchExistingDriversByPhone).toHaveBeenCalledTimes(1);
    expect(mockSearchExistingDriversByPhone).toHaveBeenCalledWith("9876543210");
  });

  it("shares one in-flight request for the same last-10", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inFlight = 0;

    mockSearchExistingDriversByPhone.mockImplementation(async () => {
      inFlight += 1;
      await gate;
      return { error: null, matches: [] };
    });

    const a = lookupDriversByPhoneVariants("9876543210");
    const b = lookupDriversByPhoneVariants("+91 98765 43210");
    await Promise.resolve();
    expect(inFlight).toBe(1);
    release();
    await Promise.all([a, b]);
    expect(mockSearchExistingDriversByPhone).toHaveBeenCalledTimes(1);
  });
});
