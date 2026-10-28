import {
  acceptPendingTeamInvitation,
  resolveTeamInvitationsByPhone,
} from "../services/teamInvitationResolver.service";

const mockRpc = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ rpc: mockRpc }),
}));

beforeEach(() => {
  mockRpc.mockReset();
});

const row = (overrides: Record<string, unknown> = {}) => ({
  invite_id: "inv-1",
  invitee_name: "Sam",
  organization_id: "org-1",
  organization_name: "Pulse",
  invited_by_name: "Owner",
  role: "member",
  platform_role: "tripops",
  business_unit_name: null,
  department_name: null,
  invitee_email: null,
  created_at: "2026-01-01T00:00:00Z",
  expires_at: "2026-04-01T00:00:00Z",
  is_expired: false,
  status: "pending",
  ...overrides,
});

describe("team invitation resolver", () => {
  it("splits expired invites from active ones", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "expire_stale_team_invitations") {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({
        data: [
          row({ invite_id: "live", is_expired: false, status: "pending" }),
          row({ invite_id: "old", is_expired: true, status: "expired" }),
          row({ invite_id: "revoked", is_expired: false, status: "cancelled" }),
        ],
        error: null,
      });
    });

    const { result, error } = await resolveTeamInvitationsByPhone("9876543210");
    expect(error).toBeNull();
    expect(result.active.map((i) => i.inviteId)).toEqual(["live"]);
    expect(result.expired.map((i) => i.inviteId)).toEqual(["old"]);
  });

  it("treats already_member accept as idempotent", async () => {
    mockRpc.mockResolvedValue({
      data: {
        organization_id: "org-1",
        membership_id: "mem-1",
        already_member: true,
      },
      error: null,
    });

    const res = await acceptPendingTeamInvitation("inv-1");
    expect(res.error).toBeNull();
    expect(res.alreadyAccepted).toBe(true);
    expect(res.organizationId).toBe("org-1");
  });

  it("treats already_accepted as idempotent and does not escalate role", async () => {
    mockRpc.mockResolvedValue({
      data: {
        organization_id: "org-1",
        membership_id: "mem-1",
        already_accepted: true,
      },
      error: null,
    });

    const res = await acceptPendingTeamInvitation("inv-1");
    expect(res.alreadyAccepted).toBe(true);
    expect(mockRpc.mock.calls[0]?.[0]).toBe("accept_pending_team_invitation");
    expect(mockRpc.mock.calls[0]?.[1]).toEqual({ p_invite_id: "inv-1" });
  });
});
