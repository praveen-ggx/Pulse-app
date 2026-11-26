import type { OrgMember } from "@/types/organization";

const mockRpc = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: jest.fn(),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

jest.mock("@/features/organization/services/members.service", () => ({
  getOrganizationMembersShared: jest.fn(),
}));

jest.mock("@/features/chat/services/chatPlatform.service", () => ({
  ensureDirectChat: jest.fn(async (_org: string, peer: string) => ({
    id: `conv-${peer}`,
    organization_id: "org-1",
    conversation_type: "direct",
    title: null,
    trip_id: null,
  })),
}));

import { getOrganizationMembersShared } from "@/features/organization/services/members.service";
import {
  listTeamChatMembers,
  openTeamDirectChat,
  peerUserIdFromDirectChannelKey,
} from "@/features/chat/services/teamChat.service";

const mockedMembers = getOrganizationMembersShared as jest.MockedFunction<
  typeof getOrganizationMembersShared
>;

function member(partial: Partial<OrgMember> & { user_id: string }): OrgMember {
  return {
    id: `m-${partial.user_id}`,
    organization_id: "org-1",
    role: "member",
    status: "active",
    permissions: {},
    joined_at: "2026-01-01T00:00:00Z",
    full_name: "Teammate",
    ...partial,
  };
}

describe("teamChat.service", () => {
  beforeEach(() => {
    mockedMembers.mockReset();
    mockRpc.mockReset();
    // RPC not deployed → keep org-roster filter only.
    mockRpc.mockResolvedValue({ data: null, error: { message: "missing" } });
  });

  it("excludes self and drivers from the Team roster", async () => {
    mockedMembers.mockResolvedValue({
      error: null,
      members: [
        member({ user_id: "self", full_name: "Me", role: "owner" }),
        member({ user_id: "u-admin", full_name: "Ada", role: "admin" }),
        member({ user_id: "u-driver", full_name: "Drv", role: "driver" }),
        member({
          user_id: "u-inactive",
          full_name: "Gone",
          status: "inactive",
        }),
      ],
    });

    const roster = await listTeamChatMembers("org-1", "self");
    expect(roster.map((m) => m.userId)).toEqual(["u-admin"]);
  });

  it("intersects roster with auth-eligible ids when RPC is available", async () => {
    mockedMembers.mockResolvedValue({
      error: null,
      members: [
        member({ user_id: "u-admin", full_name: "Ada", role: "admin" }),
        member({ user_id: "u-ghost", full_name: "Ghost", role: "member" }),
      ],
    });
    mockRpc.mockResolvedValue({
      data: ["u-admin"],
      error: null,
    });

    const roster = await listTeamChatMembers("org-1", "self");
    expect(roster.map((m) => m.userId)).toEqual(["u-admin"]);
    expect(mockRpc).toHaveBeenCalledWith("list_team_chat_eligible_user_ids", {
      p_organization_id: "org-1",
    });
  });

  it("opens a workspace direct chat via ensure_direct_chat", async () => {
    const conv = await openTeamDirectChat("org-1", "peer-9");
    expect(conv.id).toBe("conv-peer-9");
  });

  it("resolves the peer user id from a dm channel_key", () => {
    const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    expect(peerUserIdFromDirectChannelKey(`dm:${a}:${b}`, a)).toBe(b);
    expect(peerUserIdFromDirectChannelKey(`dm:${a}:${b}`, b)).toBe(a);
    expect(peerUserIdFromDirectChannelKey("not-a-dm", a)).toBeNull();
  });
});
