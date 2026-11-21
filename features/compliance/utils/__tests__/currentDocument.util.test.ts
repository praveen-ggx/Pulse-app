import {
  canonicalEntityDocsByType,
  currentEntityDocuments,
  isSupersededEntityDoc,
  pickCanonicalEntityDoc,
} from "../currentDocument.util";

type Doc = {
  id: string;
  doc_type: string;
  status: string;
  expiry_date: string | null;
  created_at: string;
};

const doc = (over: Partial<Doc> & Pick<Doc, "id">): Doc => ({
  doc_type: "insurance",
  status: "pending",
  expiry_date: "2027-01-01",
  created_at: "2026-11-01T00:00:00Z",
  ...over,
});

describe("current document rule", () => {
  it("expired old copy + valid new copy: the new copy is current, the old one superseded", () => {
    // Prod: TN28BK2090 insurance, ids chosen so the old one sorts first by id.
    const oldExpired = doc({ id: "621ab8cc", expiry_date: "2025-11-17", created_at: "2026-11-17T06:51:25Z" });
    const newValid = doc({ id: "ecbc2039", expiry_date: "2027-08-09", created_at: "2026-11-19T09:57:34Z" });
    const docs = [oldExpired, newValid];
    expect(pickCanonicalEntityDoc(docs)).toBe(newValid);
    expect(isSupersededEntityDoc(oldExpired, docs)).toBe(true);
    expect(currentEntityDocuments(docs)).toEqual([newValid]);
  });

  it("valid old copy + expired new copy: the new copy is current (its own expiry decides), the old one does not mask it", () => {
    const oldValid = doc({ id: "a", expiry_date: "2027-06-01", created_at: "2026-10-01T00:00:00Z" });
    const newExpired = doc({ id: "b", expiry_date: "2025-01-01", created_at: "2026-11-01T00:00:00Z" });
    const docs = [oldValid, newExpired];
    expect(pickCanonicalEntityDoc(docs)).toBe(newExpired);
    expect(currentEntityDocuments(docs)).toEqual([newExpired]);
  });

  it("an old verified copy does not hide a newer upload", () => {
    const oldVerified = doc({ id: "a", status: "verified", expiry_date: "2025-01-01", created_at: "2026-01-01T00:00:00Z" });
    const newPending = doc({ id: "b", status: "pending", expiry_date: "2027-01-01", created_at: "2026-11-01T00:00:00Z" });
    expect(pickCanonicalEntityDoc([oldVerified, newPending])).toBe(newPending);
  });

  it("pages of one document (same expiry) all stay current", () => {
    const front = doc({ id: "front", doc_type: "rc", expiry_date: null, created_at: "2026-11-01T00:00:00Z" });
    const back = doc({ id: "back", doc_type: "rc", expiry_date: null, created_at: "2026-11-01T00:00:05Z" });
    expect(currentEntityDocuments([front, back])).toEqual([front, back]);
    const p1 = doc({ id: "p1", expiry_date: "2027-03-05", created_at: "2026-11-01T00:00:00Z" });
    const p2 = doc({ id: "p2", expiry_date: "2027-03-05", created_at: "2026-11-02T00:00:00Z" });
    expect(currentEntityDocuments([p1, p2])).toEqual([p1, p2]);
  });

  it("missing expiry: a newer copy without a date never hides or supersedes the dated copy", () => {
    const dated = doc({ id: "dated", expiry_date: "2027-01-01", created_at: "2026-10-01T00:00:00Z" });
    const undated = doc({ id: "undated", expiry_date: null, created_at: "2026-11-01T00:00:00Z" });
    const docs = [dated, undated];
    expect(pickCanonicalEntityDoc(docs)).toBe(dated);
    expect(isSupersededEntityDoc(dated, docs)).toBe(false);
    expect(currentEntityDocuments(docs)).toEqual([dated, undated]);
  });

  it("several copies with different dates: only the newest dated copy is current", () => {
    const a = doc({ id: "a", expiry_date: "2024-01-01", created_at: "2026-01-01T00:00:00Z" });
    const b = doc({ id: "b", expiry_date: "2028-01-01", created_at: "2026-05-01T00:00:00Z" });
    const c = doc({ id: "c", expiry_date: "2026-12-31", created_at: "2026-09-01T00:00:00Z" });
    expect(pickCanonicalEntityDoc([a, b, c])).toBe(c);
    expect(currentEntityDocuments([a, b, c])).toEqual([c]);
  });

  it("replaced and rejected rows are history: never current, never supersede, but are not removed from the list", () => {
    const replaced = doc({ id: "old", status: "replaced", expiry_date: "2025-01-01", created_at: "2026-01-01T00:00:00Z" });
    const rejected = doc({ id: "rej", status: "rejected", expiry_date: "2029-01-01", created_at: "2026-12-01T00:00:00Z" });
    const live = doc({ id: "live", expiry_date: "2027-01-01", created_at: "2026-06-01T00:00:00Z" });
    const docs = [replaced, rejected, live];
    expect(pickCanonicalEntityDoc(docs)).toBe(live);
    expect(isSupersededEntityDoc(live, docs)).toBe(false);
    expect(currentEntityDocuments(docs)).toEqual([live]);
    expect(docs).toHaveLength(3);
  });

  it("only compares copies of the same doc_type", () => {
    const insurance = doc({ id: "ins", expiry_date: "2025-01-01", created_at: "2026-01-01T00:00:00Z" });
    const fitness = doc({ id: "fc", doc_type: "fitness", expiry_date: "2027-01-01", created_at: "2026-11-01T00:00:00Z" });
    expect(isSupersededEntityDoc(insurance, [insurance, fitness])).toBe(false);
    const byType = canonicalEntityDocsByType([insurance, fitness]);
    expect(byType.get("insurance")).toBe(insurance);
    expect(byType.get("fitness")).toBe(fitness);
  });
});
