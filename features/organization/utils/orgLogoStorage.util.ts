/**
 * Same folder RLS as personal avatars: `{userId}/…` on `userprofiles`.
 * `orgs/{orgId}/…` only allows `organizations.owner_id`, which is often not
 * the active workspace owner/admin row.
 */
export function orgLogoStoragePath(
  orgId: string,
  userId: string,
  now = Date.now(),
): string {
  return `${userId}/org-logo-${orgId}-${now}.jpg`;
}
