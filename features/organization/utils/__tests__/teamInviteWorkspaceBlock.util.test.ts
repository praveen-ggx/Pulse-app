import { teamInviteWorkspaceBlock } from "@/features/organization/utils/teamInviteWorkspaceBlock.util";
import type { TeamInvitePrecheckResult } from "@/features/organization/services/teamInvitePrecheck.service";

function check(
  overrides: Partial<TeamInvitePrecheckResult>,
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

describe("teamInviteWorkspaceBlock", () => {
  it("allows a new phone with no Pulse account", () => {
    expect(teamInviteWorkspaceBlock(check({ recommendedAction: "pending_invite" }))).toBeNull();
  });

  it("blocks a phone already on this workspace", () => {
    const block = teamInviteWorkspaceBlock(
      check({ recommendedAction: "already_member", userName: "Sanjeevi N" }),
    );
    expect(block?.action).toBe("already_member");
    expect(block?.message).toContain("Sanjeevi N");
  });

  it("blocks a phone that belongs to another workspace", () => {
    const block = teamInviteWorkspaceBlock(
      check({
        recommendedAction: "invite_existing_user",
        userName: "Sanjeevi N",
        otherOrgs: [{ id: "org-2", name: "GogoX" }],
      }),
    );
    expect(block?.action).toBe("belongs_to_other_org");
    expect(block?.title).toBe("Cannot add to this workspace");
    expect(block?.message).toContain("GogoX");
  });

  it("blocks a pending invite for the same phone", () => {
    const block = teamInviteWorkspaceBlock(
      check({ recommendedAction: "already_invited", userName: "Sanjeevi N" }),
    );
    expect(block?.action).toBe("already_invited");
  });
});
