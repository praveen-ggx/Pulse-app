/**
 * Party display: linked-org image first, then contact photo, then seeds (DiceBear),
 * then initials (cash tab / FinancialRow rules).
 */
import { getAvatarUriForSeed } from "@/constants/DriverLevels";
import { getUser2DAvatarUriForSeed } from "@/constants/UserAvatars";
import Theme from "@/constants/Theme";
import {
  AVATAR_BUCKET,
  getSignedAvatarUrl,
  LEGACY_AVATAR_BUCKET,
  extractPathFromStorageUrl,
  resolveOrgLogoPublicUrl,
} from "@/lib/avatarUpload";

/**
 * Org logos live in the PUBLIC S3 `org-assets` bucket under `org-logos/<orgId>/...`.
 * getPublicUrl is a pure string builder — no network call, no Storage->Postgres
 * connection — so these must never go through createSignedUrl.
 */
export const PUBLIC_ORG_ASSET_BUCKET = "org-assets";

function isPublicOrgLogoPath(raw: string): boolean {
  const t = raw.trim();
  return (
    t.includes("org-logos/") ||
    t.startsWith("org-assets/") ||
    t.toLowerCase().startsWith("s3://")
  );
}

export { pickPartyOrganizationImageUrl } from "@/lib/media/partyOrganizationImage.util";

/** Public URL for an org-logo storage ref. Never signs. */
function publicOrgLogoUrl(path: string): string {
  return resolveOrgLogoPublicUrl(path) ?? path;
}

export type PartyEntityType = "client" | "supplier" | "driver" | "vehicle";

/**
 * Http(s) URLs safe to pass to `Image` without signing. Supabase object URLs for
 * avatar buckets are omitted here so `resolvePartyPhotoUriAsync` supplies a signed URL.
 * Bare storage paths are omitted (private bucket — public URL would not load).
 */
function firstDisplayableHttpUrl(raw: string | null | undefined): string | null {
  const u = (raw ?? "").trim();
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) {
    const ref = extractPathFromStorageUrl(u);
    if (ref && (ref.bucket === AVATAR_BUCKET || ref.bucket === LEGACY_AVATAR_BUCKET)) {
      return null;
    }
    return u;
  }
  return null;
}

/** True when the field is a storage object path (or storage http URL), not a seed id. */
function hasPartyPhotoStorageField(raw: string | null | undefined): boolean {
  const u = (raw ?? "").trim();
  if (!u) return false;
  if (u.startsWith("http://") || u.startsWith("https://")) {
    const ref = extractPathFromStorageUrl(u);
    return !!(ref && (ref.bucket === AVATAR_BUCKET || ref.bucket === LEGACY_AVATAR_BUCKET));
  }
  return true;
}

/**
 * Synchronous photo URI — only non-storage http(s) URLs. Storage paths return null
 * so `resolvePartyPhotoUriAsync` can supply a signed URL (private `userprofiles` bucket).
 */
function resolvePartyPhotoPathSync(raw: string | null | undefined): string | null {
  const u = (raw ?? "").trim();
  if (!u) return null;
  const http = firstDisplayableHttpUrl(u);
  if (http) return http;
  // Public org-logo path — resolvable synchronously, no signing round trip.
  if (isPublicOrgLogoPath(u)) return publicOrgLogoUrl(u);
  // Private avatar buckets — never use getPublicUrl (returns 400 in browser).
  if (u.startsWith("http://") || u.startsWith("https://")) {
    const ref = extractPathFromStorageUrl(u);
    if (ref && (ref.bucket === AVATAR_BUCKET || ref.bucket === LEGACY_AVATAR_BUCKET)) {
      return null;
    }
    return null;
  }
  return null;
}

async function resolveOnePartyPhotoRaw(raw: string): Promise<string | null> {
  const t = raw.trim();
  if (!t) return null;
  if (isPublicOrgLogoPath(t)) return publicOrgLogoUrl(t);
  if (t.startsWith("http://") || t.startsWith("https://")) {
    const ref = extractPathFromStorageUrl(t);
    if (ref && (ref.bucket === AVATAR_BUCKET || ref.bucket === LEGACY_AVATAR_BUCKET)) {
      // Private bucket — MUST use a signed URL. Falling back to `t` (public URL) causes 400.
      return (await getSignedAvatarUrl(ref.path)) ?? null;
    }
    return t;
  }
  return (await getSignedAvatarUrl(t)) ?? null;
}

/**
 * Signed (or public) URL for org/contact profile photos only — same priority as
 * `resolvePartyDisplayUri` for photo fields, excluding seeds (those stay synchronous).
 */
export async function resolvePartyPhotoUriAsync(options: {
  organizationImageUrl?: string | null;
  avatarUrl?: string | null;
}): Promise<string | null> {
  const org = (options.organizationImageUrl ?? "").trim();
  if (org) {
    const u = await resolveOnePartyPhotoRaw(org);
    if (u) return u;
  }
  const av = (options.avatarUrl ?? "").trim();
  if (av) {
    return await resolveOnePartyPhotoRaw(av);
  }
  return null;
}

/**
 * Single URI for an Image, or null to show initials (caller uses `partyInitialsFromName` +
 * `partyAvatarBackgroundColor`).
 *
 * Priority: **organization** (linked org profile photo → org seed preset) → **contact**
 * (avatar_url → avatar_seed preset).
 */
export function resolvePartyDisplayUri(options: {
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  entityType?: PartyEntityType;
}): string | null {
  const orgPhoto = resolvePartyPhotoPathSync(options.organizationImageUrl);
  if (orgPhoto) return orgPhoto;
  const contactPhoto = resolvePartyPhotoPathSync(options.avatarUrl);
  if (contactPhoto) return contactPhoto;

  const hasPhotoField =
    hasPartyPhotoStorageField(options.organizationImageUrl) ||
    hasPartyPhotoStorageField(options.avatarUrl);
  if (hasPhotoField) return null;

  const orgSeed = (options.organizationAvatarSeed ?? "").trim();
  if (orgSeed) {
    if (orgSeed.startsWith("user-")) return getUser2DAvatarUriForSeed(orgSeed);
    return (options.entityType ?? "client") === "driver"
      ? getAvatarUriForSeed(orgSeed)
      : getUser2DAvatarUriForSeed(orgSeed);
  }
  const seed = (options.avatarSeed ?? "").trim();
  if (!seed) return null;
  if (seed.startsWith("user-")) return getUser2DAvatarUriForSeed(seed);
  return (options.entityType ?? "client") === "driver"
    ? getAvatarUriForSeed(seed)
    : getUser2DAvatarUriForSeed(seed);
}

const PARTY_AVATAR_COLORS = [
  "#EEF2FF",
  "#E0E7FF",
  "#ECFEFF",
  "#E0F2FE",
  "#ECFDF5",
  "#F0FDF4",
  "#FEF3C7",
  "#FFF7ED",
  "#F3F4F6",
  "#E5E7EB",
];

/** True when we should not render initials / DiceBear fallback (blank, em dash, hyphen-only, etc.). */
export function isBlankOrPlaceholderPartyName(name: string | null | undefined): boolean {
  const t = (name ?? "").trim();
  if (!t) return true;
  if (/^[\s\u2014\u2013\-–]+$/.test(t)) return true;
  const lower = t.toLowerCase();
  return (
    lower === "unknown" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "none" ||
    lower === "misc / unlinked" ||
    lower.startsWith("misc /")
  );
}

/**
 * Whether `PartyAvatar` should render anything: image URI from branding/contact/seed,
 * or non-placeholder initials fallback.
 */
export function partyAvatarHasRenderableOutput(options: {
  name: string;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  entityType?: PartyEntityType;
}): boolean {
  const uri = resolvePartyDisplayUri(options);
  if (uri) return true;
  if (
    hasPartyPhotoStorageField(options.organizationImageUrl) ||
    hasPartyPhotoStorageField(options.avatarUrl)
  ) {
    return true;
  }
  return !isBlankOrPlaceholderPartyName(options.name);
}

/** Max 2 chars, uppercase — same rules as `FinancialRow` / `FinanceKanbanTab`. */
export function partyInitialsFromName(name: string): string {
  const t = (name ?? "").trim();
  if (!t) return "—";
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase().slice(0, 2);
  }
  return t.slice(0, 2).toUpperCase();
}

export function partyAvatarBackgroundColor(seed: string): string {
  let n = 0;
  for (let i = 0; i < seed.length; i += 1) {
    n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PARTY_AVATAR_COLORS[n % PARTY_AVATAR_COLORS.length];
}

function parseCssColorToRgb(input: string): { r: number; g: number; b: number } | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0]! + hex[0]!, 16);
      const g = parseInt(hex[1]! + hex[1]!, 16);
      const b = parseInt(hex[2]! + hex[2]!, 16);
      if ([r, g, b].every((n) => Number.isFinite(n))) return { r, g, b };
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].every((n) => Number.isFinite(n))) return { r, g, b };
    }
    return null;
  }
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s);
  if (m) {
    const r = Math.round(Number(m[1]));
    const g = Math.round(Number(m[2]));
    const b = Math.round(Number(m[3]));
    if ([r, g, b].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)) {
      return { r, g, b };
    }
  }
  return null;
}

/** sRGB relative luminance (WCAG), inputs 0–255. */
function relativeLuminance256(r: number, g: number, b: number): number {
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function luminanceFromCssColor(css: string): number | null {
  const rgb = parseCssColorToRgb(css);
  if (!rgb) return null;
  return relativeLuminance256(rgb.r, rgb.g, rgb.b);
}

/** WCAG contrast ratio for two relative luminances (0–1). */
function contrastRatio(L1: number, L2: number): number {
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Text color for initials on a solid avatar background (picks light vs dark for best contrast).
 * Use with `partyAvatarBackgroundColor` / any hex or `rgb()` fill from Theme.
 */
export function partyAvatarInitialsTextColor(backgroundColor: string): string {
  const Lbg = luminanceFromCssColor(backgroundColor);
  if (Lbg == null) return Theme.textOnPrimary;
  const Ldark = luminanceFromCssColor(Theme.primaryText);
  const Llight = luminanceFromCssColor(Theme.textOnPrimary);
  if (Ldark == null || Llight == null) return Theme.textOnPrimary;
  const ratioDark = contrastRatio(Lbg, Ldark);
  const ratioLight = contrastRatio(Lbg, Llight);
  return ratioDark >= ratioLight ? Theme.primaryText : Theme.textOnPrimary;
}
