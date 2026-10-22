/**
 * Same stack as network / grow cards: S3 `org-logos/` (or `logo_url`) first,
 * then the CRM/contact photo so trip cards never drop a stored party mark.
 * Kept free of imports so pure helpers (indent card avatars) don't pull in auth.
 */
export function pickPartyOrganizationImageUrl(options: {
  organizationImageUrl?: string | null;
  logoUrl?: string | null;
  avatarUrl?: string | null;
}): string | null {
  const branded =
    (options.organizationImageUrl ?? "").trim() ||
    (options.logoUrl ?? "").trim();
  if (branded) return branded;
  const avatar = (options.avatarUrl ?? "").trim();
  if (!avatar) return null;
  return avatar;
}
