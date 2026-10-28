# vasanth workspace invite contact

## What
- Dual-resolve email and phone on workspace invite so Pulse never silently picks one account when they disagree.
- When an existing account is matched by email, tell the inviter that the typed phone is not saved to that person's profile.
- Member cards and the permissions identity line say "No phone on their account" when the profile has no phone.
- Keep inviting existing users through `invite_existing_user_to_org` and new people through `create_team_invite_pending`. Never write inviter-supplied phones onto another profile.

## Why
Inviting an existing Pulse account by email while also typing a phone discarded the phone with no explanation, and the member card said "No phone".

## Areas
- `features/organization/services/members.service.ts`
- `features/organization/utils/resolveTeamInviteContactMatch.util.ts`
- `features/organization/utils/teamInviteWorkspaceBlock.util.ts`
- `features/organization/components/InviteMemberModal.tsx`
- `features/organization/components/TeamMembersView.tsx`
- `features/organization/components/MemberPermissionsPanel/MemberPermissionsPanel.tsx`

## Migrations
- None. No schema, RLS, or RPC change.

## Tested
- `npx jest --ci --silent` on resolveTeamInviteContactMatch, teamInviteWorkspaceBlock, inviteTeamMemberByContact, teamInvitationResolver — passed (exit 0).
- Invite modal / member card not clicked through in a browser this change.
