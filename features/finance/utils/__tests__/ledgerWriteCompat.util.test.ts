import {
  isMissingPaymentReferenceColumnError,
  omitPaymentReferenceField,
} from "@/features/finance/utils/ledgerWriteCompat.util";

describe("ledgerWriteCompat.util", () => {
  it("detects PostgREST schema-cache miss for payment_reference", () => {
    expect(
      isMissingPaymentReferenceColumnError({
        code: "PGRST204",
        message:
          "Could not find the 'payment_reference' column of 'transactions' in the schema cache",
      }),
    ).toBe(true);
  });

  it("ignores unrelated schema-cache errors", () => {
    expect(
      isMissingPaymentReferenceColumnError({
        code: "PGRST204",
        message: "Could not find the 'display_trip_id' column of 'trips' in the schema cache",
      }),
    ).toBe(false);
  });

  it("strips payment_reference so the insert can retry on older schemas", () => {
    expect(
      omitPaymentReferenceField({
        organization_id: "org",
        description: "UTR: ABC",
        payment_reference: "ABC",
      }),
    ).toEqual({
      organization_id: "org",
      description: "UTR: ABC",
    });
  });
});
