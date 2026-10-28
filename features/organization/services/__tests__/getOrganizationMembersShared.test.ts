/**
 * get_org_members_with_profiles ran ~1,960 times in 18 min on prod because every
 * identity / audit-log lookup re-read the full roster. Display callers now share
 * one in-flight request per org and reuse it for 60s.
 */
import {
  __resetSharedMembersForTests,
  getOrganizationMembersShared,
} from "../members.service";

const mockRpc = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ rpc: mockRpc }),
}));

const member = { id: "m1", organization_id: "org-1", user_id: "u1", role: "owner", status: "active" };

beforeEach(() => {
  __resetSharedMembersForTests();
  mockRpc.mockReset();
  jest.useRealTimers();
});

test("concurrent callers for one org share a single RPC", async () => {
  mockRpc.mockResolvedValue({ data: [member], error: null });
  const results = await Promise.all([
    getOrganizationMembersShared("org-1"),
    getOrganizationMembersShared("org-1"),
    getOrganizationMembersShared("org-1"),
  ]);
  expect(mockRpc).toHaveBeenCalledTimes(1);
  for (const r of results) expect(r.members).toEqual([member]);
});

test("reuses the result within 60s, refetches after", async () => {
  jest.useFakeTimers({ now: 1_000_000 });
  mockRpc.mockResolvedValue({ data: [member], error: null });
  await getOrganizationMembersShared("org-1");
  jest.setSystemTime(1_000_000 + 59_000);
  await getOrganizationMembersShared("org-1");
  expect(mockRpc).toHaveBeenCalledTimes(1);
  jest.setSystemTime(1_000_000 + 61_000);
  await getOrganizationMembersShared("org-1");
  expect(mockRpc).toHaveBeenCalledTimes(2);
});

test("orgs are cached separately", async () => {
  mockRpc.mockResolvedValue({ data: [member], error: null });
  await getOrganizationMembersShared("org-1");
  await getOrganizationMembersShared("org-2");
  expect(mockRpc).toHaveBeenCalledTimes(2);
});

test("a failed read is not cached", async () => {
  mockRpc.mockRejectedValueOnce(new Error("timeout"));
  const first = await getOrganizationMembersShared("org-1");
  expect(first.error).toBeTruthy();
  mockRpc.mockResolvedValue({ data: [member], error: null });
  const second = await getOrganizationMembersShared("org-1");
  expect(second.members).toEqual([member]);
  expect(mockRpc).toHaveBeenCalledTimes(2);
});
