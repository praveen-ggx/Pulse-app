import type { TeamInvitePrecheckResult } from "@/features/organization/services/teamInvitePrecheck.service";

export type TeamInviteWorkspaceBlock = {
  title: string;
  message: string;
  action:
    | "already_member"
    | "already_invited"
    | "belongs_to_other_org"
    | "email_registered";
};

function personLabel(check: TeamInvitePrecheckResult): string {
  return (check.userName ?? "").trim() || "This person";
}

function otherWorkspaceLabel(check: TeamInvitePrecheckResult): string {
  if (check.otherOrgs.length === 1) {
    return check.otherOrgs[0]?.name?.trim() || "another workspace";
  }
  if (check.otherOrgs.length > 1) {
    return `${check.otherOrgs.length} other workspaces`;
  }
  return "another workspace";
}

/**
 * Reasons a contact cannot be added to this workspace.
 * A phone already on Pulse (this team, a pending invite, or another org)
 * must never create a second membership.
 */
export function teamInviteWorkspaceBlock(
  check: TeamInvitePrecheckResult | null | undefined,
): TeamInviteWorkspaceBlock | null {
  if (!check) return null;

  if (check.recommendedAction === "already_member") {
    return {
      action: "already_member",
      title: "Already on this workspace",
      message: `${personLabel(check)} is already an active member of this workspace. They cannot be added again.`,
    };
  }

  if (check.recommendedAction === "already_invited") {
    return {
      action: "already_invited",
      title: "Invite already sent",
      message: `${personLabel(check)} already has a pending invitation to this workspace. Wait for them to accept, or cancel the existing invite.`,
    };
  }

  if (
    check.recommendedAction === "belongs_to_other_org" ||
    check.otherOrgs.length > 0
  ) {
    return {
      action: "belongs_to_other_org",
      title: "Cannot add to this workspace",
      message:
        check.message?.trim() ||
        `${personLabel(check)} already belongs to ${otherWorkspaceLabel(check)} on Pulse. This phone number is already in use, so they cannot be added here.`,
    };
  }

  if (check.recommendedAction === "email_registered") {
    return {
      action: "email_registered",
      title: "Email already registered",
      message:
        check.message?.trim() ||
        "This email already has a Pulse account. Invite them with the phone on that account, or ask them to sign in. Do not add them as a new signup.",
    };
  }

  return null;
}
