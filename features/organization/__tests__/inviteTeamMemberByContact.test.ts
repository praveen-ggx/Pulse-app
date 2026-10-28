import { inviteTeamMemberByContact } from "../services/members.service";

const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockUpdate = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    rpc: mockRpc,
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

function orgBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.ilike = () => builder;
  builder.limit = () => builder;
  builder.update = (...args: unknown[]) => {
    mockUpdate(...args);
    throw new Error("must not write inviter phone onto profiles");
  };
  builder.maybeSingle = () =>
    Promise.resolve({ data: { operating_model: "HYBRID" }, error: null });
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: [], error: null });
  return builder;
}

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockUpdate.mockReset();
  mockFrom.mockImplementation(() => orgBuilder());
});

describe("inviteTeamMemberByContact — contact matching", () => {
  it("invites the email account and never writes the extra phone", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "get_user_profile_by_phone") {
        return Promise.resolve({ data: [], error: null });
      }
      if (name === "get_user_profile_by_email") {
        return Promise.resolve({
          data: [
            {
              user_id: "user-email",
              full_name: "Sanjeevi N",
              phone: null,
              email: "sanjeevi.n@gogox.com",
              avatar_url: null,
              role: "user",
            },
          ],
          error: null,
        });
      }
      if (name === "precheck_team_invite_contact") {
        return Promise.resolve({
          data: {
            recommended_action: "invite_existing_user",
            user_id: "user-email",
            user_email: "sanjeevi.n@gogox.com",
            other_orgs: [],
            phone_matches_invite: false,
          },
          error: null,
        });
      }
      if (name === "invite_existing_user_to_org") {
        return Promise.resolve({
          data: { id: "mem-1", user_id: "user-email", status: "pending" },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const result = await inviteTeamMemberByContact("org-1", {
      phone: "9876543210",
      name: "Sanjeevi N",
      email: "sanjeevi.n@gogox.com",
      platformRole: "tripops",
    });

    expect(result.error).toBeNull();
    expect(result.kind).toBe("member");
    expect(result.suppliedPhoneNotSaved).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRpc.mock.calls.map((c) => c[0])).not.toContain("create_team_invite_pending");
    const inviteCall = mockRpc.mock.calls.find((c) => c[0] === "invite_existing_user_to_org");
    expect(inviteCall?.[1]).toMatchObject({ p_org_id: "org-1", p_user_id: "user-email" });
    expect(inviteCall?.[1]).not.toHaveProperty("p_phone");
  });

  it("creates a pending invite when neither email nor phone has an account", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "create_team_invite_pending") {
        return Promise.resolve({
          data: { id: "inv-1", invitee_phone: "9876543210", status: "pending" },
          error: null,
        });
      }
      if (name === "precheck_team_invite_contact") {
        return Promise.resolve({
          data: { recommended_action: "pending_invite", other_orgs: [] },
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    const result = await inviteTeamMemberByContact("org-1", {
      phone: "9876543210",
      name: "New Hire",
      email: "new@example.com",
      platformRole: "tripops",
    });
    expect(result.kind).toBe("pending");
    expect(result.suppliedPhoneNotSaved).toBeUndefined();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("refuses when email and phone belong to different accounts", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "get_user_profile_by_phone") {
        return Promise.resolve({
          data: [
            {
              user_id: "user-phone",
              full_name: "A",
              phone: "9876543210",
              email: null,
              avatar_url: null,
              role: "user",
            },
          ],
          error: null,
        });
      }
      if (name === "get_user_profile_by_email") {
        return Promise.resolve({
          data: [
            {
              user_id: "user-email",
              full_name: "B",
              phone: null,
              email: "b@x.com",
              avatar_url: null,
              role: "user",
            },
          ],
          error: null,
        });
      }
      if (name === "precheck_team_invite_contact") {
        return Promise.resolve({
          data: {
            recommended_action: "invite_existing_user",
            user_id: "user-phone",
            other_orgs: [],
          },
          error: null,
        });
      }
      if (name === "invite_existing_user_to_org" || name === "create_team_invite_pending") {
        throw new Error("must not invite when contacts conflict");
      }
      return Promise.resolve({ data: null, error: null });
    });

    const result = await inviteTeamMemberByContact("org-1", {
      phone: "9876543210",
      name: "Mixed",
      email: "b@x.com",
      platformRole: "tripops",
    });
    expect(result.kind).toBeNull();
    expect(result.precheckAction).toBe("contact_conflict");
    expect(result.error?.message).toContain("two different Pulse accounts");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns alreadyMember without creating a second membership", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "get_user_profile_by_phone") {
        return Promise.resolve({
          data: [
            {
              user_id: "user-a",
              full_name: "A",
              phone: "9876543210",
              email: null,
              avatar_url: null,
              role: "user",
            },
          ],
          error: null,
        });
      }
      if (name === "precheck_team_invite_contact") {
        return Promise.resolve({
          data: { recommended_action: "already_member", user_id: "user-a", other_orgs: [] },
          error: null,
        });
      }
      if (name === "invite_existing_user_to_org") {
        throw new Error("must not re-invite an active member");
      }
      return Promise.resolve({ data: [], error: null });
    });

    const result = await inviteTeamMemberByContact("org-1", {
      phone: "9876543210",
      name: "A",
      platformRole: "tripops",
    });
    expect(result.alreadyMember).toBe(true);
    expect(result.kind).toBeNull();
  });

  it("returns alreadyInvited without a second pending invite", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "precheck_team_invite_contact") {
        return Promise.resolve({
          data: { recommended_action: "already_invited", other_orgs: [] },
          error: null,
        });
      }
      if (name === "create_team_invite_pending") {
        throw new Error("must not create a duplicate pending invite");
      }
      return Promise.resolve({ data: [], error: null });
    });

    const result = await inviteTeamMemberByContact("org-1", {
      phone: "9876543210",
      name: "Pending",
      platformRole: "tripops",
    });
    expect(result.alreadyInvited).toBe(true);
    expect(result.kind).toBeNull();
  });

  it("surfaces unauthorized invite attempts from the RPC", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "precheck_team_invite_contact") {
        return Promise.resolve({
          data: null,
          error: { message: "Not a member of this organization" },
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    const result = await inviteTeamMemberByContact("org-foreign", {
      phone: "9876543210",
      name: "Intruder",
      platformRole: "admin",
    });
    expect(result.error?.message).toMatch(/Not a member|organization/i);
    expect(result.kind).toBeNull();
    expect(mockRpc.mock.calls.map((c) => c[0])).not.toContain("invite_existing_user_to_org");
  });
});
