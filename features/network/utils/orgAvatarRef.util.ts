/**
 * Org avatars are stored in the public S3-backed `org-assets` bucket
 * (`org-logos/<orgId>/...`). Parse every stored reference shape to that key
 * so PartyAvatar never signs an org logo against `userprofiles`.
 */
export const PUBLIC_ORG_ASSET_BUCKET = "org-assets";
export const PUBLIC_ORG_LOGO_PREFIX = "org-logos/";

function extractStorageObjectRef(
  rawUrl: string,
): { bucket: string; path: string } | null {
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const objectIdx = segments.indexOf("object");
    if (objectIdx < 0 || objectIdx + 2 >= segments.length) return null;
    const accessType = segments[objectIdx + 1];
    if (!["public", "sign", "authenticated"].includes(accessType ?? "")) {
      return null;
    }
    const bucket = segments[objectIdx + 2] ?? "";
    const pathParts = segments.slice(objectIdx + 3);
    if (!bucket || pathParts.length === 0) return null;
    return {
      bucket,
      path: decodeURIComponent(pathParts.join("/")),
    };
  } catch {
    return null;
  }
}

export function orgLogoObjectPath(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (candidate.toLowerCase().startsWith("s3://")) {
    const withoutScheme = candidate.slice(5);
    const slash = withoutScheme.indexOf("/");
    candidate =
      slash > 0 ? withoutScheme.slice(slash + 1) || withoutScheme : withoutScheme;
  }

  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    const ref = extractStorageObjectRef(candidate);
    if (ref?.bucket === PUBLIC_ORG_ASSET_BUCKET && ref.path.trim()) {
      candidate = ref.path.trim();
    } else {
      const idx = candidate.indexOf(PUBLIC_ORG_LOGO_PREFIX);
      if (idx < 0) return null;
      candidate = candidate.slice(idx).split("?")[0] ?? "";
    }
  }

  if (candidate.startsWith(`${PUBLIC_ORG_ASSET_BUCKET}/`)) {
    candidate = candidate.slice(PUBLIC_ORG_ASSET_BUCKET.length + 1);
  }
  if (candidate.startsWith(PUBLIC_ORG_LOGO_PREFIX)) {
    return candidate.split("?")[0] ?? null;
  }
  const embedded = candidate.indexOf(PUBLIC_ORG_LOGO_PREFIX);
  if (embedded >= 0) {
    return candidate.slice(embedded).split("?")[0] ?? null;
  }
  return null;
}

/** Prefer the S3/org-assets logo over an owner profile photo. */
export function pickOrgAvatarStorageRef(
  logoUrl?: string | null,
  avatarUrl?: string | null,
): string | null {
  const logo = (logoUrl ?? "").trim();
  if (logo) return logo;
  const avatar = (avatarUrl ?? "").trim();
  if (avatar && orgLogoObjectPath(avatar)) return avatar;
  return avatar || null;
}
