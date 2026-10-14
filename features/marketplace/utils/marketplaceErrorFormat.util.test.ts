import { formatMarketplaceTransactionError } from "@/features/marketplace/utils/marketplaceErrorFormat.util";

describe("formatMarketplaceTransactionError", () => {
  it("translates driver_unavailable with the exact A6.4 wording, not regressed", () => {
    expect(
      formatMarketplaceTransactionError(
        "driver_unavailable: this driver is already on an active trip",
      ),
    ).toBe("You're currently on an active trip. Complete it before bidding on another load.");
  });

  it("translates not_biddable", () => {
    expect(
      formatMarketplaceTransactionError("not_biddable: indent abc123 is not open for marketplace bids"),
    ).toBe("This load is no longer open for bidding.");
  });

  it("translates already_awarded", () => {
    expect(
      formatMarketplaceTransactionError("already_awarded: indent abc123 already has an active canonical trip"),
    ).toBe("This load has already been awarded to another bid.");
  });

  it("translates bid_locked", () => {
    expect(
      formatMarketplaceTransactionError("bid_locked: an existing decided bid cannot be changed"),
    ).toBe("This bid has already been decided and can no longer be changed.");
  });

  it("translates invalid_amount", () => {
    expect(formatMarketplaceTransactionError("invalid_amount")).toBe(
      "Enter a valid bid amount greater than zero.",
    );
  });

  it("translates vehicle_no_longer_eligible", () => {
    expect(
      formatMarketplaceTransactionError(
        "vehicle_no_longer_eligible: owner_vehicle xyz is no longer valid for bidder abc",
      ),
    ).toBe("The selected vehicle is no longer eligible for this bid. Choose another vehicle and try again.");
  });

  it("translates the own-organization bid guard (no error-code prefix)", () => {
    expect(
      formatMarketplaceTransactionError("cannot bid on your own organization's indent"),
    ).toBe("You can't bid on your own organization's load.");
  });

  it("translates invalid_state", () => {
    expect(
      formatMarketplaceTransactionError("invalid_state: bid already decided (current: rejected)"),
    ).toBe("This bid has already been decided.");
  });

  it("translates unauthorized", () => {
    expect(
      formatMarketplaceTransactionError("unauthorized: caller must be a non-driver member"),
    ).toBe("You don't have permission to do this.");
  });

  it("translates fee_paid from revoke_indent_award", () => {
    expect(
      formatMarketplaceTransactionError(
        "fee_paid: marketplace fee is already paid for this award",
      ),
    ).toBe("This award cannot be revoked because the marketplace fee has already been paid.");
  });

  it("translates unsupported_provider without changing the award", () => {
    expect(
      formatMarketplaceTransactionError(
        "unsupported_provider: only a test_online marketplace fee can be reversed this way (provider=razorpay)",
      ),
    ).toBe(
      "This paid fee was not a test payment, so it cannot be reversed here. The award is unchanged.",
    );
  });

  it("translates trip_exists from a revoke that rolls the refund back", () => {
    expect(
      formatMarketplaceTransactionError(
        "trip_exists: cancel the trip before revoking this award",
      ),
    ).toBe("Cancel the trip before revoking this award.");
  });

  it("translates not_found", () => {
    expect(formatMarketplaceTransactionError("not_found: bid abc123")).toBe(
      "This bid or load could not be found. It may have been removed.",
    );
  });

  it("falls back to a safe generic message for an unrecognized error, never raw text", () => {
    const raw = "column \"foo\" does not exist (SQLSTATE 42703)";
    const result = formatMarketplaceTransactionError(raw);
    expect(result).toBe("Something went wrong. Please try again.");
    expect(result).not.toContain("SQLSTATE");
    expect(result).not.toContain("foo");
  });

  it("falls back safely for null/undefined/empty input", () => {
    expect(formatMarketplaceTransactionError(null)).toBe("Something went wrong. Please try again.");
    expect(formatMarketplaceTransactionError(undefined)).toBe("Something went wrong. Please try again.");
    expect(formatMarketplaceTransactionError("")).toBe("Something went wrong. Please try again.");
  });

  it("is case-insensitive on the matched error code", () => {
    expect(formatMarketplaceTransactionError("DRIVER_UNAVAILABLE: on trip")).toBe(
      "You're currently on an active trip. Complete it before bidding on another load.",
    );
  });
});
