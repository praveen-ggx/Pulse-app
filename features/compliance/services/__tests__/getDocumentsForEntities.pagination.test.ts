/**
 * getDocumentsForEntities feeds the Compliance list's Vehicle x/6 and Driver x/2
 * counts. On prod GOGOVAN's list was at ~998 rows (2026-10-27) — one unpaged
 * select would cut at 1000 without an error.
 */
import { createFakePostgrest, fakeUuid, shuffled, type FakeRow } from "@/lib/__tests__/fakePostgrest";

const mockServer = createFakePostgrest();
jest.mock("@/lib/supabase", () => ({ supabase: () => mockServer.client }));

import { getDocumentsForEntities } from "@/features/compliance/services/documents.service";
import { READ_ALL_ID_CHUNK } from "@/lib/pagination";

const ORG = "org-a";
const OTHER_ORG = "org-b";

function doc(n: number, entityId: string, over: Partial<FakeRow> = {}): FakeRow {
  return {
    id: fakeUuid(n, 3),
    organization_id: ORG,
    entity_type: "vehicle",
    entity_id: entityId,
    doc_type: ["rc", "insurance", "permit"][n % 3],
    status: "verified",
    storage_path: `org-a/${entityId}/${n}.jpg`,
    ...over,
  };
}

beforeEach(() => {
  mockServer.requests.length = 0;
  mockServer.state.failRequest = null;
});

describe("getDocumentsForEntities pagination", () => {
  it("returns all 1300 org documents across 650 entities, excluding other orgs and replaced rows", async () => {
    const entityIds = Array.from({ length: 650 }, (_, i) => fakeUuid(i, 4));
    const mine: FakeRow[] = [];
    entityIds.forEach((entityId, i) => {
      mine.push(doc(i * 2, entityId), doc(i * 2 + 1, entityId, { entity_type: i % 2 ? "driver" : "vehicle" }));
    });
    const foreign = entityIds.slice(0, 200).map((entityId, i) => doc(50_000 + i, entityId, { organization_id: OTHER_ORG }));
    const replaced = entityIds.slice(0, 50).map((entityId, i) => doc(60_000 + i, entityId, { status: "replaced" }));
    mockServer.tables.entity_documents = shuffled([...mine, ...foreign, ...replaced]);

    const { error, documents } = await getDocumentsForEntities(ORG, entityIds, ["vehicle", "driver"]);

    expect(error).toBeNull();
    expect(documents).toHaveLength(1300);
    expect(new Set(documents.map((d) => d.id)).size).toBe(1300);
    expect(new Set(documents.map((d) => d.id))).toEqual(new Set(mine.map((d) => d.id)));
    expect(documents.every((d) => d.organization_id === ORG && d.status !== "replaced")).toBe(true);
    // Org scope and status filter on every page; id lists stay chunked.
    for (const req of mockServer.requests) {
      expect(req.filters).toContain(`organization_id=eq.${ORG}`);
      expect(req.filters).toContain("status=neq.replaced");
      expect(req.inSizes.entity_id).toBeLessThanOrEqual(READ_ALL_ID_CHUNK);
    }
  });

  it("a single entity with more than 1000 documents is fully paged", async () => {
    const entityId = fakeUuid(1, 4);
    mockServer.tables.entity_documents = shuffled(Array.from({ length: 1250 }, (_, n) => doc(n, entityId)));
    const { documents } = await getDocumentsForEntities(ORG, [entityId]);
    expect(documents).toHaveLength(1250);
  });

  it("returns the error and no documents when a page fails", async () => {
    const entityIds = Array.from({ length: 300 }, (_, i) => fakeUuid(i, 4));
    mockServer.tables.entity_documents = entityIds.map((entityId, i) => doc(i, entityId));
    mockServer.state.failRequest = (_req, n) => n === 2;
    const { error, documents } = await getDocumentsForEntities(ORG, entityIds);
    expect(error).toEqual({ message: "fake page failure" });
    expect(documents).toEqual([]);
  });
});
