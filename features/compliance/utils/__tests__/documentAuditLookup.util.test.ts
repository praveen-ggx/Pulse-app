import {
  documentAuditLookupOrFilter,
  storageLeftAfterDbDeleteMessage,
} from "../documentAuditLookup.util";

describe("documentAuditLookupOrFilter", () => {
  it("includes live document_id rows and NULL delete rows keyed in metadata", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    expect(documentAuditLookupOrFilter(id)).toBe(
      `document_id.eq.${id},and(document_id.is.null,metadata->>document_id.eq.${id})`,
    );
  });

  it("rejects values that would break the PostgREST or-filter", () => {
    expect(documentAuditLookupOrFilter("")).toBeNull();
    expect(documentAuditLookupOrFilter("id,document_id.eq.other")).toBeNull();
  });
});

describe("storageLeftAfterDbDeleteMessage", () => {
  it("does not claim full cleanup when only the file remove failed", () => {
    expect(storageLeftAfterDbDeleteMessage("Object not removed")).toMatch(
      /record was removed[\s\S]*file may still be in storage[\s\S]*Object not removed/,
    );
  });
});
