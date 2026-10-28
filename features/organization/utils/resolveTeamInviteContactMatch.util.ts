import type { TeamInvitePrecheckResult } from "@/features/organization/services/teamInvitePrecheck.service";
import type { UserProfileForInvite } from "@/types/organization";

export type TeamInviteContactMatch =
  | {
      kind: "new_pending";
    }
  | {
      kind: "invite_existing";
      profile: UserProfileForInvite;
      matchedBy: "phone" | "email";
      /** Inviter typed a phone that is not this account's profile phone. */
      suppliedPhoneNotSaved: boolean;
    }
  | {
      kind: "blocked";
      action:
        | "already_member"
        | "already_invited"
        | "belongs_to_other_org"
        | "email_registered"
        | "contact_conflict";
      title: string;
      message: string;
    };

const SAME_PERSON_CONFLICT =
  "The phone and email belong to two different Pulse accounts. Use one contact that belongs to the same person.";

const PHONE_NOT_ON_ACCOUNT =
  "This Pulse account will be invited. The phone you typed is not on their account and will not be saved.";

function sameUser(
  a: UserProfileForInvite | null,
  b: UserProfileForInvite | null,
): boolean {
  return Boolean(a?.user_id && b?.user_id && a.user_id === b.user_id);
}

/**
 * Decide who the invite is for. Phone and email are resolved independently so
 * Pulse never silently picks one account when they disagree.
 * Never writes the inviter's phone onto another user's profile.
 */
export function resolveTeamInviteContactMatch(input: {
  suppliedPhone: string | null | undefined;
  suppliedEmail: string | null | undefined;
  profileByPhone: UserProfileForInvite | null;
  profileByEmail: UserProfileForInvite | null;
  precheck?: TeamInvitePrecheckResult | null;
}): TeamInviteContactMatch {
  const { profileByPhone, profileByEmail, precheck } = input;
  const typedPhone = (input.suppliedPhone ?? "").replace(/\s+/g, "").trim();
  const hasTypedPhone = typedPhone.length >= 8;

  if (profileByPhone && profileByEmail && !sameUser(profileByPhone, profileByEmail)) {
    return {
      kind: "blocked",
      action: "contact_conflict",
      title: "Contacts do not match",
      message: SAME_PERSON_CONFLICT,
    };
  }

  if (precheck?.recommendedAction === "already_member") {
    return {
      kind: "blocked",
      action: "already_member",
      title: "Already on this workspace",
      message: `${(precheck.userName ?? "").trim() || "This person"} is already an active member of this workspace. They cannot be added again.`,
    };
  }

  if (precheck?.recommendedAction === "already_invited") {
    return {
      kind: "blocked",
      action: "already_invited",
      title: "Invite already sent",
      message: `${(precheck.userName ?? "").trim() || "This person"} already has a pending invitation to this workspace.`,
    };
  }

  if (
    precheck?.recommendedAction === "belongs_to_other_org" ||
    (precheck?.otherOrgs.length ?? 0) > 0
  ) {
    return {
      kind: "blocked",
      action: "belongs_to_other_org",
      title: "Cannot add to this workspace",
      message:
        precheck?.message?.trim() ||
        "This person already belongs to another workspace on Pulse and cannot be added here.",
    };
  }

  const existing = profileByPhone ?? profileByEmail;
  if (existing?.user_id) {
    const matchedBy = profileByPhone?.user_id === existing.user_id ? "phone" : "email";
    const accountPhone = (existing.phone ?? "").replace(/\s+/g, "").trim();
    const suppliedPhoneNotSaved =
      matchedBy === "email" &&
      hasTypedPhone &&
      (accountPhone.length === 0 || accountPhone !== typedPhone);

    return {
      kind: "invite_existing",
      profile: existing,
      matchedBy,
      suppliedPhoneNotSaved,
    };
  }

  if (precheck?.recommendedAction === "email_registered") {
    return {
      kind: "blocked",
      action: "email_registered",
      title: "Email already registered",
      message:
        precheck.message?.trim() ||
        "This email already has a Pulse account. Ask them to sign in. Do not add them as a new signup.",
    };
  }

  return { kind: "new_pending" };
}

export function suppliedPhoneNotSavedMessage(): string {
  return PHONE_NOT_ON_ACCOUNT;
}
