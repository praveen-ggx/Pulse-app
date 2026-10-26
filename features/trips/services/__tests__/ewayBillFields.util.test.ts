import {
  buildEwayBillStripRows,
  clampEwayBillNumber,
  ewayBillFieldsStoragePath,
  ewayExpiryLabel,
  ewayExpiryTone,
  ewayLabelMatchesHubFilter,
  isEwayBillMetaPath,
  mostUrgentEwayExpiryLabel,
  parseEwayFieldValues,
  serializeEwayFieldEntries,
  serializeEwayFieldValues,
} from "../ewayBillFields.util";

describe("parseEwayFieldValues", () => {
  it("reads a plain e-way number", () => {
    expect(parseEwayFieldValues("202274977039")).toEqual({
      ewayNo: "202274977039",
      createdDate: "",
      validTill: "",
      docNo: "",
    });
  });

  it("reads JSON saved from the pencil editor", () => {
    expect(
      parseEwayFieldValues(
        serializeEwayFieldValues({
          ewayNo: "202274977039",
          createdDate: "01-Sep-26",
          validTill: "03-Sep-26",
          docNo: "262718182",
        }),
      ),
    ).toEqual({
      ewayNo: "202274977039",
      createdDate: "01-Sep-26",
      validTill: "03-Sep-26",
      docNo: "262718182",
    });
  });
});

describe("clampEwayBillNumber", () => {
  it("keeps at most 12 digits", () => {
    expect(clampEwayBillNumber("324325345342653463526534")).toBe("324325345342");
    expect(clampEwayBillNumber("3243 2534 5342")).toBe("324325345342");
  });
});

describe("ewayExpiryLabel", () => {
  const now = new Date(2026, 8, 29, 2, 0, 0);

  it("counts hours until the end of the valid-till day", () => {
    expect(ewayExpiryLabel("29-Sep-26", now)).toBe("EW-Bill expiring in 22 hours");
    expect(ewayExpiryLabel("29-Sep-26", new Date(2026, 8, 29, 14, 0, 0))).toBe(
      "EW-Bill expiring in 10 hours",
    );
  });

  it("is green when more than 24 hours remain", () => {
    expect(ewayExpiryTone("EW-Bill expiring in 3 days")).toBe("ok");
    expect(ewayExpiryTone("EW-Bill expiring in 25 hours")).toBe("ok");
    expect(ewayExpiryTone("EW-Bill expiring in 10 hours")).toBe("soon");
    expect(ewayExpiryTone("EW-Bill expired")).toBe("expired");
  });

  it("matches the hub e-way filters", () => {
    expect(ewayLabelMatchesHubFilter("EW-Bill expired", "expired")).toBe(true);
    expect(ewayLabelMatchesHubFilter("EW-Bill expiring in 10 hours", "soon")).toBe(
      true,
    );
    expect(ewayLabelMatchesHubFilter("EW-Bill expiring in 3 days", "active")).toBe(
      true,
    );
    expect(ewayLabelMatchesHubFilter("EW-Bill expiring in 10 hours", "active")).toBe(
      false,
    );
    expect(ewayLabelMatchesHubFilter(null, "expired")).toBe(false);
  });

  it("is expired after that day", () => {
    expect(ewayExpiryLabel("28-Sep-26", now)).toBe("EW-Bill expired");
  });

  it("uses the most critical bill, not the first in the list", () => {
    expect(
      mostUrgentEwayExpiryLabel(
        ["01-Oct-26", "29-Sep-26", "28-Sep-26"],
        new Date(2026, 8, 29, 14, 0, 0),
      ),
    ).toBe("EW-Bill expired");
    expect(
      mostUrgentEwayExpiryLabel(["01-Oct-26", "29-Sep-26"], now),
    ).toBe("EW-Bill expiring in 22 hours");
    expect(mostUrgentEwayExpiryLabel(["27-Sep-26", "28-Sep-26"], now)).toBe(
      "EW-Bill expired",
    );
  });
});

describe("isEwayBillMetaPath", () => {
  it("detects the metadata-only fields file", () => {
    expect(isEwayBillMetaPath("trip-1/eway_bill/fields.json")).toBe(true);
    expect(isEwayBillMetaPath("trip-1/eway_bill/abc.pdf")).toBe(false);
    expect(isEwayBillMetaPath(undefined, "eway-fields.json")).toBe(true);
  });
});

describe("buildEwayBillStripRows", () => {
  it("shows typed e-way fields without using an LR document", () => {
    const rows = buildEwayBillStripRows({
      ewayDoc: {
        id: "eway_bill",
        label: "Eway Bill",
        type: "PDF",
        status: "Uploaded",
        documentNumber: serializeEwayFieldValues({
          ewayNo: "202274977039",
          createdDate: "2026-09-01",
          validTill: "2026-09-03",
          docNo: "262718182",
        }),
        storagePath: ewayBillFieldsStoragePath("trip-1"),
      },
    });
    expect(rows).toEqual([
      {
        id: "eway_bill-entry-0",
        entryIndex: 0,
        ewayNo: "202274977039",
        createdDate: "01-Sep-26",
        validTill: "03-Sep-26",
        docNo: "262718182",
        canView: false,
        updatedAt: null,
        updatedById: null,
        previewPath: null,
        previewUri: null,
        previewFileName: null,
        previewMime: null,
      },
    ]);
  });

  it("does not copy the LR number into e-way columns", () => {
    const rows = buildEwayBillStripRows({
      ewayDoc: {
        id: "eway_bill",
        label: "Eway Bill",
        type: "PDF",
        status: "Pending",
      },
    });
    expect(rows[0]).toMatchObject({
      ewayNo: "—",
      createdDate: "—",
      validTill: "—",
      docNo: "—",
      canView: false,
    });
  });

  it("shows one table row for each saved e-way number", () => {
    const rows = buildEwayBillStripRows({
      ewayDoc: {
        id: "eway_bill",
        label: "Eway Bill",
        type: "PDF",
        status: "Uploaded",
        documentNumber: serializeEwayFieldEntries([
          {
            ewayNo: "111111111111",
            createdDate: "01-Sep-26",
            validTill: "03-Sep-26",
            docNo: "LR-1",
          },
          {
            ewayNo: "222222222222",
            createdDate: "02-Sep-26",
            validTill: "04-Sep-26",
            docNo: "LR-2",
          },
        ]),
        storagePath: ewayBillFieldsStoragePath("trip-1"),
      },
    });
    expect(rows.map((row) => row.ewayNo)).toEqual([
      "111111111111",
      "222222222222",
    ]);
    expect(rows[1]).toMatchObject({
      entryIndex: 1,
      createdDate: "02-Sep-26",
      validTill: "04-Sep-26",
      docNo: "LR-2",
    });
  });

  it("carries the last update stamp and actor onto each row", () => {
    const rows = buildEwayBillStripRows({
      ewayDoc: {
        id: "eway_bill",
        label: "Eway Bill",
        type: "PDF",
        status: "Uploaded",
        uploadedAt: "2026-10-26T09:40:00.000Z",
        uploadedBy: "user-vasanth",
        documentNumber: serializeEwayFieldValues({
          ewayNo: "121321234321",
          createdDate: "2026-10-25",
          validTill: "2026-10-28",
          docNo: "",
        }),
      },
    });
    expect(rows[0]).toMatchObject({
      updatedAt: "2026-10-26T09:40:00.000Z",
      updatedById: "user-vasanth",
    });
  });

  it("attaches an uploaded file for the tiny preview", () => {
    const rows = buildEwayBillStripRows({
      ewayDoc: {
        id: "eway_bill",
        label: "Eway Bill",
        type: "PDF",
        status: "Uploaded",
        storagePath: "trip-1/eway_bill/bill.pdf",
        documentNumber: serializeEwayFieldValues({
          ewayNo: "121321234321",
          createdDate: "",
          validTill: "",
          docNo: "",
        }),
        files: [
          {
            id: "file-1",
            label: "Eway Bill · 121321234321",
            type: "PDF",
            storagePath: "trip-1/eway_bill/bill.pdf",
            fileName: "bill.pdf",
          },
        ],
      },
    });
    expect(rows[0]).toMatchObject({
      canView: true,
      previewPath: "trip-1/eway_bill/bill.pdf",
      previewFileName: "bill.pdf",
      previewMime: "PDF",
    });
  });
});
