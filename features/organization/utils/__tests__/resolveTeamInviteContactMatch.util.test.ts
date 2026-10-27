import { resolveTeamInviteContactMatch } from "@/features/organization/utils/resolveTeamInviteContactMatch.util";
import type { TeamInvitePrecheckResult } from "@/features/organization/services/teamInvitePrecheck.service";
import type { UserProfileForInvite } from "@/types/organization";

function profile(overrides: Partial<UserProfileForInvite>): UserProfileForInvite {
  return {
    user_id: "user-a",
    full_name: "Sanjeevi N",
    phone: null,
    email: "sanjeevi.n@gogox.com",
    avatar_url: null,
    role: "user",
    ...overrides,
  };
}

function precheck(
  overrides: Partial<TeamInvitePrecheckResult> = {},
): TeamInvitePrecheckResult {
  return {
    recommendedAction: "pending_invite",
    userId: null,
    userName: null,
    userEmail: null,
    userPhone: null,
    otherOrgs: [],
    phoneMatchesInvite: false,
    message: null,
    ...overrides,
  };
}

describe("resolveTeamInviteContactMatch", () => {
  it("email match with extra phone invites the account and does not save the phone", () => {
    const match = resolveTeamInviteContactMatch({
      suppliedPhone: "9876543210",
      suppliedEmail: "sanjeevi.n@gogox.com",
      profileByPhone: null,
      profileByEmail: profile({ phone: null }),
      precheck: precheck({
        recommendedAction: "invite_existing_user",
        userId: "user-a",
        userEmail: "sanjeevi.n@gogox.com",
      }),
    });
    expect(match).toMatchObject({
      kind: "invite_existing",
      matchedBy: "email",
      suppliedPhoneNotSaved: true,
    });
  });

  it("existing account with no profile phone is invited by email", () => {
    const match = resolveTeamInviteContactMatch({
      suppliedPhone: "",
      suppliedEmail: "sanjeevi.n@gogox.com",
      profileByPhone: null,
      profileByEmail: profile({ phone: null }),
    });
    expect(match.kind).toBe("invite_existing");
    if (match.kind === "invite_existing") {
      expect(match.suppliedPhoneNotSaved).toBe(false);
      expect(match.profile.phone).toBeNull();
    }
  });

  it("new invitee with no existing account becomes a pending phone invite", () => {
    const match = resolveTeamInviteContactMatch({
      suppliedPhone: "9876543210",
      suppliedEmail: "new@example.com",
      profileByPhone: null,
      profileByEmail: null,
      precheck: precheck({ recommendedAction: "pending_invite" }),
    });
    expect(match).toEqual({ kind: "new_pending" });
  });

  it("blocks when email and phone match different accounts", () => {
    const match = resolveTeamInviteContactMatch({
      suppliedPhone: "9876543210",
      suppliedEmail: "sanjeevi.n@gogox.com",
      profileByPhone: profile({ user_id: "user-phone", email: null, phone: "9876543210" }),
      profileByEmail: profile({ user_id: "user-email", phone: null }),
    });
    expect(match.kind).toBe("blocked");
    if (match.kind === "blocked") {
      expect(match.action).toBe("contact_conflict");
      expect(match.message).toContain("two different Pulse accounts");
    }
  });

  it("blocks already-a-member", () => {
    const match = resolveTeamInviteContactMatch({
      suppliedPhone: "9876543210",
      suppliedEmail: null,
      profileByPhone: profile({ phone: "9876543210" }),
      profileByEmail: null,
      precheck: precheck({ recommendedAction: "already_member", userName: "Sanjeevi N" }),
    });
    expect(match.kind).toBe("blocked");
    if (match.kind === "blocked") expect(match.action).toBe("already_member");
  });

  it("blocks a duplicate pending invitation", () => {
    const match = resolveTeamInviteContactMatch({
      suppliedPhone: "9876543210",
      suppliedEmail: null,
      profileByPhone: profile({ phone: "9876543210" }),
      profileByEmail: null,
      precheck: precheck({ recommendedAction: "already_invited" }),
    });
    expect(match.kind).toBe("blocked");
    if (match.kind === "blocked") expect(match.action).toBe("already_invited");
  });

  it("blocks a person already active in another workspace", () => {
    const match = resolveTeamInviteContactMatch({
      suppliedPhone: "9876543210",
      suppliedEmail: "sanjeevi.n@gogox.com",
      profileByPhone: null,
      profileByEmail: profile({}),
      precheck: precheck({
        recommendedAction: "invite_existing_user",
        otherOrgs: [{ id: "org-2", name: "GogoX" }],
      }),
    });
    expect(match.kind).toBe("blocked");
    if (match.kind === "blocked") expect(match.action).toBe("belongs_to_other_org");
  });

  it("treats same-user phone and email as one account", () => {
    const same = profile({ phone: "9876543210" });
    const match = resolveTeamInviteContactMatch({
      suppliedPhone: "9876543210",
      suppliedEmail: "sanjeevi.n@gogox.com",
      profileByPhone: same,
      profileByEmail: same,
    });
    expect(match).toMatchObject({
      kind: "invite_existing",
      matchedBy: "phone",
      suppliedPhoneNotSaved: false,
    });
  });
});
