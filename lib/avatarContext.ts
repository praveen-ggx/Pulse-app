/**
 * Global Avatar Resolution System
 *
 * Context-aware display picture logic:
 *
 *   Driver       (any context)   → own avatar_url → avatar_seed (driver preset) → initials
 *   Organization (any context)   → logo_url → ownerAvatarSeed (user-2D) → ownerAvatarUrl → initials
 *   User         (personal)      → avatar_url → avatar_seed (user-2D) → initials
 *   User         (business)      → org logo_url → orgOwnerAvatarSeed (user-2D) → avatar_url → initials
 *
 * Storage reality: Supabase avatar bucket is private → URLs need async signing.
 * This module returns both a synchronous preset URI (always renderable) and
 * the raw storage path so callers can upgrade to a signed URL asynchronously.
 */

import { getAvatarUriForSeed, ALL_PRESET_AVATARS, getPresetImageSourceForSeed } from '@/constants/DriverLevels';
import { getUser2DAvatarUriForSeed, getUser2DPresetImageSourceForSeed, USER_2D_AVATARS } from '@/constants/UserAvatars';
import {
  getSignedAvatarUrl,
  peekSignedAvatarUrl,
  AVATAR_BUCKET,
  LEGACY_AVATAR_BUCKET,
  extractPathFromStorageUrl,
} from '@/lib/avatarUpload';

// ─────────────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────────────

/** Who is being represented in the UI. */
export type AvatarPartyType = 'driver' | 'organization' | 'user';

/**
 * Which UI context the avatar appears in.
 *
 * `personal`  — profile settings, internal team chat, account header
 * `business`  — customer-facing comms, dispatch cards, invoices, B2B network, fleet pages
 */
export type AvatarContext = 'personal' | 'business';

/** Direct party (driver/courier). Always shows their own picture. */
export type DriverParty = {
  type: 'driver';
  name: string;
  /** profile.avatar_url — private Supabase storage path or URL */
  avatarUrl?: string | null;
  /** profile.avatar_seed — maps to a driver cartoon preset */
  avatarSeed?: string | null;
};

/** Company / fleet operator. Always shows company branding. */
export type OrgParty = {
  type: 'organization';
  id?: string;
  name: string;
  /** organizations.logo_url — private Supabase storage path or URL */
  logoUrl?: string | null;
  /**
   * Org owner's profile.avatar_seed — maps to a user-2D preset.
   * Used when no logo is available. Same seed the business-app profile renders
   * so both apps show the same image for the same org.
   */
  ownerAvatarSeed?: string | null;
  /** Org owner's profile.avatar_url — private storage, async-resolved */
  ownerAvatarUrl?: string | null;
};

/**
 * Dispatcher / admin / employee.
 * In `personal` context → own picture.
 * In `business` context → org logo (falls back to own picture).
 */
export type UserParty = {
  type: 'user';
  name: string;
  /** profile.avatar_url */
  avatarUrl?: string | null;
  /** profile.avatar_seed → user-2D preset */
  avatarSeed?: string | null;
  // ── Org fields (populate for business context) ──────────────────────────
  /** organizations.logo_url */
  orgLogoUrl?: string | null;
  /**
   * Org owner's profile.avatar_seed.
   * When the user IS the owner this equals their own avatarSeed.
   * When the user is a member this is a different person's seed.
   */
  orgOwnerAvatarSeed?: string | null;
};

export type AvatarParty = DriverParty | OrgParty | UserParty;

/**
 * What `getDisplayAvatar` returns.
 *
 * `syncUri`     — immediately renderable (preset/seed). Use as placeholder.
 * `storagePath` — raw private storage path to sign async; null when syncUri is already optimal.
 * `initials`    — 1-2 char fallback if both image paths fail.
 * `initialsBackground` — deterministic hex colour for the initials circle.
 */
export type AvatarResolution = {
  syncUri: string;
  storagePath: string | null;
  initials: string;
  initialsBackground: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

const INITIALS_COLORS = [
  '#EEF2FF', '#E0E7FF', '#ECFEFF', '#E0F2FE', '#ECFDF5',
  '#F0FDF4', '#FEF3C7', '#FFF7ED', '#F3F4F6', '#E5E7EB',
];

function initialsBackground(seed: string): string {
  return INITIALS_COLORS[hashStr(seed) % INITIALS_COLORS.length]!;
}

function initials(name: string): string {
  const t = (name ?? '').trim();
  if (!t) return '?';
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

/** Stable fallback preset for a driver using driver cartoon pool. */
function driverFallbackUri(name: string): string {
  const idx = hashStr(name || '?') % ALL_PRESET_AVATARS.length;
  return getAvatarUriForSeed(ALL_PRESET_AVATARS[idx]!.seed) ?? '';
}

/** Stable fallback preset for a user/org using user-2D pool. */
function userFallbackUri(seed: string): string {
  const idx = hashStr(seed || '?') % USER_2D_AVATARS.length;
  return getUser2DAvatarUriForSeed(USER_2D_AVATARS[idx]!.seed) ?? '';
}

/**
 * Is this URL a private Supabase avatar bucket path that needs signing?
 * Returns the bare path (e.g. `users/abc/avatar.jpg`) or null if not a private path.
 */
function extractPrivatePath(raw: string | null | undefined): string | null {
  const u = (raw ?? '').trim();
  if (!u) return null;
  if (u.startsWith('http://') || u.startsWith('https://')) {
    const ref = extractPathFromStorageUrl(u);
    if (ref && (ref.bucket === AVATAR_BUCKET || ref.bucket === LEGACY_AVATAR_BUCKET)) {
      return ref.path;
    }
    return null; // public URL — usable directly
  }
  // Bare storage path (not prefixed with https)
  return u;
}

/**
 * If the URL is a displayable public/signed https URL, return it. Otherwise null.
 */
function publicHttpUrl(raw: string | null | undefined): string | null {
  const u = (raw ?? '').trim();
  if (!u) return null;
  if (!u.startsWith('http://') && !u.startsWith('https://')) return null;
  const ref = extractPathFromStorageUrl(u);
  if (ref && (ref.bucket === AVATAR_BUCKET || ref.bucket === LEGACY_AVATAR_BUCKET)) {
    return null; // private — needs signing
  }
  return u;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core resolution
// ─────────────────────────────────────────────────────────────────────────────

/** Driver seeds use assets/drivers; legacy user-N seeds use assets/avatars. */
function driverSeedSyncUri(seed: string): string {
  const s = seed.trim();
  if (s.startsWith('user-')) return getUser2DAvatarUriForSeed(s) ?? '';
  return getAvatarUriForSeed(s) ?? '';
}

function driverSeedImageSource(seed: string | null | undefined): ImageSourcePropType {
  const s = (seed ?? '').trim();
  if (s.startsWith('user-')) return getUser2DPresetImageSourceForSeed(s) ?? { uri: '' };
  return getPresetImageSourceForSeed(s || undefined) ?? { uri: '' };
}

function resolvePresetImageSource(
  party: AvatarParty,
  context: AvatarContext,
): ImageSourcePropType | null {
  switch (party.type) {
    case 'driver':
      return driverSeedImageSource(party.avatarSeed);
    case 'organization': {
      const seed = (party.ownerAvatarSeed ?? '').trim();
      return seed ? getUser2DPresetImageSourceForSeed(seed) : null;
    }
    case 'user': {
      if (context === 'business') {
        const orgSeed = (party.orgOwnerAvatarSeed ?? '').trim();
        if (orgSeed) return getUser2DPresetImageSourceForSeed(orgSeed);
      }
      const seed = (party.avatarSeed ?? '').trim();
      return seed ? getUser2DPresetImageSourceForSeed(seed) : null;
    }
  }
}

function isNetworkImageUri(uri: string): boolean {
  const u = uri.trim();
  return (
    u.startsWith('http://') ||
    u.startsWith('https://') ||
    u.startsWith('data:') ||
    u.startsWith('blob:')
  );
}

function resolveDriver(party: DriverParty): AvatarResolution {
  const privatePath = extractPrivatePath(party.avatarUrl);
  const directUrl = publicHttpUrl(party.avatarUrl);
  const seedUri = party.avatarSeed ? driverSeedSyncUri(party.avatarSeed) : null;

  return {
    syncUri: (seedUri ?? directUrl ?? driverFallbackUri(party.name)) ?? '',
    storagePath: privatePath,
    initials: initials(party.name),
    initialsBackground: initialsBackground(party.name),
  };
}

function resolveOrg(party: OrgParty): AvatarResolution {
  const logoPath = extractPrivatePath(party.logoUrl);
  const logoPublic = publicHttpUrl(party.logoUrl);
  const ownerSeedUri = party.ownerAvatarSeed
    ? getUser2DAvatarUriForSeed(party.ownerAvatarSeed)
    : null;
  const ownerPath = extractPrivatePath(party.ownerAvatarUrl);
  const colorSeed = party.id ?? party.name;

  // Sync: owner seed gives the most consistent representation across apps.
  // Private paths (logo, ownerUrl) will be upgraded async.
  const syncUri =
    logoPublic ??
    ownerSeedUri ??
    userFallbackUri(colorSeed);

  // Prefer org logo path over owner avatar path for async upgrade.
  const storagePath = logoPath ?? ownerPath ?? null;

  return {
    syncUri: syncUri ?? '',
    storagePath,
    initials: initials(party.name),
    initialsBackground: initialsBackground(colorSeed),
  };
}

function resolveUserPersonal(party: UserParty): AvatarResolution {
  const privatePath = extractPrivatePath(party.avatarUrl);
  const directUrl = publicHttpUrl(party.avatarUrl);
  const seedUri = party.avatarSeed ? getUser2DAvatarUriForSeed(party.avatarSeed) : null;

  return {
    syncUri: (seedUri ?? directUrl ?? userFallbackUri(party.name)) ?? '',
    storagePath: privatePath,
    initials: initials(party.name),
    initialsBackground: initialsBackground(party.name),
  };
}

function resolveUserBusiness(party: UserParty): AvatarResolution {
  const logoPath = extractPrivatePath(party.orgLogoUrl);
  const logoPublic = publicHttpUrl(party.orgLogoUrl);
  const orgSeedUri = party.orgOwnerAvatarSeed
    ? getUser2DAvatarUriForSeed(party.orgOwnerAvatarSeed)
    : null;
  const personalSeedUri = party.avatarSeed
    ? getUser2DAvatarUriForSeed(party.avatarSeed)
    : null;
  const personalPath = extractPrivatePath(party.avatarUrl);

  // Business context: org branding takes precedence over personal picture.
  // Sync fallback chain: org owner seed → personal seed → hash-stable preset.
  const syncUri =
    logoPublic ??
    orgSeedUri ??
    personalSeedUri ??
    userFallbackUri(party.name);

  // Async: prefer org logo, fall back to personal avatar.
  const storagePath = logoPath ?? personalPath ?? null;

  return {
    syncUri: syncUri ?? '',
    storagePath,
    initials: initials(party.name),
    initialsBackground: initialsBackground(party.name),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine the correct display avatar given a party and the UI context.
 *
 * Returns an `AvatarResolution` with:
 *  - `syncUri`      — a preset/seed URI to render immediately (no network call)
 *  - `storagePath`  — a Supabase storage path to sign asynchronously for the best image
 *  - `initials`     — 2-char fallback text
 *  - `initialsBackground` — stable background colour
 *
 * @example
 * // Dispatcher acting on behalf of their company
 * const av = getDisplayAvatar(
 *   { type: 'user', name: 'Nihas N', avatarSeed: 'user-7',
 *     orgLogoUrl: org.logo_url, orgOwnerAvatarSeed: profile.avatar_seed },
 *   'business',
 * );
 * // → shows org logo (or owner seed avatar if no logo)
 */
export function getDisplayAvatar(
  party: AvatarParty,
  context: AvatarContext = 'personal',
): AvatarResolution {
  switch (party.type) {
    case 'driver':       return resolveDriver(party);
    case 'organization': return resolveOrg(party);
    case 'user':
      return context === 'business'
        ? resolveUserBusiness(party)
        : resolveUserPersonal(party);
  }
}

/**
 * Async upgrade: resolve the best possible URI for a party.
 * Signs private Supabase storage paths. Falls back gracefully.
 *
 * Use this after the component has mounted with `syncUri` already displayed.
 */
export async function getDisplayAvatarAsync(
  party: AvatarParty,
  context: AvatarContext = 'personal',
): Promise<string> {
  const resolution = getDisplayAvatar(party, context);
  if (!resolution.storagePath) return resolution.syncUri;

  try {
    const signed = await getSignedAvatarUrl(resolution.storagePath);
    return signed ?? resolution.syncUri;
  } catch {
    return resolution.syncUri;
  }
}

/**
 * Build an `OrgParty` from raw invite row fields (driver app context).
 * Use when displaying an org that sent a fleet invite.
 */
export function orgPartyFromInvite(fields: {
  from_organization_id?: string | null;
  from_org_name?: string | null;
  from_org_logo_url?: string | null;
  from_org_avatar_seed?: string | null;
  from_org_avatar_url?: string | null;
}): OrgParty {
  return {
    type: 'organization',
    id: fields.from_organization_id ?? undefined,
    name: fields.from_org_name?.trim() || 'Organisation',
    logoUrl: fields.from_org_logo_url,
    ownerAvatarSeed: fields.from_org_avatar_seed,
    ownerAvatarUrl: fields.from_org_avatar_url,
  };
}

/**
 * Build a `UserParty` for a dispatcher/admin who is acting on behalf of their org.
 * Pass `context: 'business'` to show the org logo instead of their personal avatar.
 */
export function userPartyFromProfile(fields: {
  name: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  orgLogoUrl?: string | null;
  orgOwnerAvatarSeed?: string | null;
}): UserParty {
  return {
    type: 'user',
    name: fields.name,
    avatarUrl: fields.avatarUrl,
    avatarSeed: fields.avatarSeed,
    orgLogoUrl: fields.orgLogoUrl,
    orgOwnerAvatarSeed: fields.orgOwnerAvatarSeed ?? fields.avatarSeed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// React hook — handles async upgrade internally
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';

/**
 * React hook that returns the best available URI for a party.
 * Renders immediately from `syncUri` then upgrades to signed URL asynchronously.
 *
 * @example
 * const { uri, initials, bg } = useAvatarUri(
 *   { type: 'user', name: 'Nihas N', avatarSeed: 'user-7', orgLogoUrl: org.logo_url },
 *   'business',
 * );
 */
export function useAvatarUri(
  party: AvatarParty,
  context: AvatarContext = 'personal',
): {
  uri: string;
  imageSource: ImageSourcePropType | null;
  initials: string;
  bg: string;
} {
  const resolution = getDisplayAvatar(party, context);
  const presetImageSource = useMemo(
    () => resolvePresetImageSource(party, context),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      party.type,
      (party as DriverParty | UserParty).avatarSeed,
      (party as OrgParty).ownerAvatarSeed,
      (party as UserParty).orgOwnerAvatarSeed,
      context,
    ],
  );
  const cachedSigned = resolution.storagePath
    ? peekSignedAvatarUrl(resolution.storagePath)
    : null;
  const [uri, setUri] = useState(cachedSigned ?? resolution.syncUri);

  useEffect(() => {
    let cancelled = false;
    setUri(
      (resolution.storagePath ? peekSignedAvatarUrl(resolution.storagePath) : null) ??
        resolution.syncUri,
    );

    if (resolution.storagePath) {
      getSignedAvatarUrl(resolution.storagePath)
        .then((signed) => {
          if (!cancelled && signed) setUri(signed);
        })
        .catch(() => {});
    }

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    party.type,
    (party as DriverParty | UserParty).avatarUrl,
    (party as DriverParty | UserParty).avatarSeed,
    (party as OrgParty).logoUrl,
    (party as OrgParty).ownerAvatarSeed,
    (party as UserParty).orgLogoUrl,
    context,
  ]);

  const networkUri = uri.trim() && isNetworkImageUri(uri) ? uri.trim() : '';
  const imageSource: ImageSourcePropType | null =
    networkUri ? { uri: networkUri } : presetImageSource;

  return {
    uri: networkUri || uri,
    imageSource,
    initials: resolution.initials,
    bg: resolution.initialsBackground,
  };
}
