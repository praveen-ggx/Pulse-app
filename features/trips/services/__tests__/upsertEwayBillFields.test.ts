import { upsertEwayBillFields } from "../tripDocuments.service";

/**
 * Saving an e-way number must write document_number alone. Also updating
 * uploaded_at is rejected for anyone who is not a trip-org manager, and a
 * blocked update used to report success because zero rows came back with no error.
 */

const mockUpdates: Record<string, unknown>[] = [];
let mockUpdateRows: { id: string }[] = [{ id: "doc-1" }];
let mockMode: "list" | "update" = "list";

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => {
      if (table !== "trip_documents") throw new Error(`unexpected table ${table}`);
      const builder: {
        select: () => typeof builder;
        eq: () => typeof builder;
        update: (payload: Record<string, unknown>) => typeof builder;
        then: (resolve: (value: unknown) => void) => void;
      } = {
        select: () => builder,
        eq: () => builder,
        update: (payload) => {
          mockUpdates.push(payload);
          mockMode = "update";
          return builder;
        },
        then: (resolve) => {
          resolve(
            mockMode === "update"
              ? { data: mockUpdateRows, error: null }
              : {
                  data: [
                    {
                      id: "doc-1",
                      storage_path: "trip-1/eway_bill/bill.pdf",
                      file_name: "bill.pdf",
                    },
                  ],
                  error: null,
                },
          );
        },
      };
      return builder;
    },
  }),
}));

beforeEach(() => {
  mockUpdates.length = 0;
  mockUpdateRows = [{ id: "doc-1" }];
  mockMode = "list";
});

describe("upsertEwayBillFields", () => {
  it("writes the e-way number without touching the upload stamp", async () => {
    const { error } = await upsertEwayBillFields({
      tripId: "trip-1",
      uploadedBy: "user-1",
      values: [
        {
          ewayNo: "542099308608",
          createdDate: "02-Nov-26",
          validTill: "10-Nov-26",
          docNo: "138",
        },
      ],
    });
    expect(error).toBeNull();
    expect(mockUpdates).toEqual([
      {
        document_number: expect.stringContaining("542099308608"),
      },
    ]);
    expect(mockUpdates[0]).not.toHaveProperty("uploaded_at");
    expect(mockUpdates[0]).not.toHaveProperty("uploaded_by");
  });

  it("reports a miss when the update changes no row", async () => {
    mockUpdateRows = [];
    const { error } = await upsertEwayBillFields({
      tripId: "trip-1",
      uploadedBy: "user-1",
      values: [
        {
          ewayNo: "542099308608",
          createdDate: "",
          validTill: "10-Nov-26",
          docNo: "138",
        },
      ],
    });
    expect(error?.message).toMatch(/was not saved/);
  });
});
