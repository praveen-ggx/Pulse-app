/**
 * Profile avatar upload and signed URL resolution for private bucket.
 * Bucket is private: we store the storage path in profile.avatar_url and resolve to signed URLs for display.
 * Storage bucket must exist in Supabase (e.g. "userprofiles") with RLS allowing authenticated users
 * to upload/update their own path: {user_id}/avatar.jpg
 */
import { getAvatarUriForSeed } from '@/constants/DriverLevels';
import { getUser2DAvatarUriForSeed } from '@/constants/UserAvatars';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverAvatar } from '@/contexts/DriverAvatarContext';
import { supabase } from '@/lib/supabase';
import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export const AVATAR_BUCKET = 'userprofiles';
/** Public bucket + path prefix for org logos (never signed). */
export const PUBLIC_ORG_ASSET_BUCKET = 'org-assets';
export const PUBLIC_ORG_LOGO_PREFIX = 'org-logos/';
export const LEGACY_AVATAR_BUCKET = 'avatars';
const MAX_SIZE = 512;
const QUALITY = 0.85;
/** Signed URL expiry (seconds). Refresh before expiry when displaying. */
const SIGNED_URL_EXPIRY_SEC = 3600;
const SIGNED_URL_CACHE_MS = 55 * 60 * 1000;
// null = confirmed not found; cached for 5min to suppress repeated 400s
const SIGNED_URL_NOT_FOUND_CACHE_MS = 60 * 60 * 1000;

// Bound the signing path independently of the image-load guard in
// hooks/useFailedImageUriGuard. One cache miss costs up to 2 storage.list()
// plus 10 createSignedUrl calls, each holding a Storage->Postgres connection,
// so a systemic failure (bad data migration, revoked bucket policy) must not
// be allowed to turn that into thousands of calls.
const SIGN_FAILURE_THRESHOLD = 20;
const SIGN_BREAKER_COOLOFF_MS = 5 * 60 * 1000;
let consecutiveSignFailures = 0;
let signBreakerOpenUntil = 0;

function noteSignFailure(): void {
  consecutiveSignFailures += 1;
  if (consecutiveSignFailures >= SIGN_FAILURE_THRESHOLD) {
    signBreakerOpenUntil = Date.now() + SIGN_BREAKER_COOLOFF_MS;
    consecutiveSignFailures = 0;
    console.warn(
      '[avatar] sign breaker OPEN - skipping signed-URL calls for 5m',
    );
  }
}

function noteSignSuccess(): void {
  consecutiveSignFailures = 0;
}
const signedAvatarUrlCache = new Map<string, { url: string | null; expiresAt: number }>();
// Deduplicates concurrent calls for the same path (thundering-herd guard)
const inFlightAvatarRequests = new Map<string, Promise<string | null>>();

/** Driver: driver-* cartoons; user-*: same 2D pool as business PartyAvatar. */
function driverDisplayPresetUri(seed: string): string {
  const s = seed.trim();
  if (s.startsWith('user-')) return getUser2DAvatarUriForSeed(s) ?? '';
  return getAvatarUriForSeed(s) ?? '';
}

function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.replace(/\s/g, '');
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const maybeBuffer = (globalThis as { Buffer?: { from: (value: string, enc: string) => Uint8Array } }).Buffer;
  if (maybeBuffer?.from) {
    return maybeBuffer.from(normalized, 'base64');
  }
  throw new Error('Base64 decoding is not available on this device');
}

export interface PickAndUploadAvatarResult {
  /** Storage path to store in profile.avatar_url (e.g. "userId/avatar.jpg"). */
  path: string | null;
  /** Local image uri for instant preview after successful upload. */
  previewUri?: string | null;
  error: Error | null;
}

export interface LocalAvatarPickResult {
  previewUri: string | null;
  base64: string | null;
  error: Error | null;
}

async function readUploadBytes(
  uri: string,
  base64?: string | null,
): Promise<ArrayBuffer | Uint8Array | null> {
  const trimmed = typeof base64 === 'string' ? base64.trim() : '';
  if (trimmed) return base64ToUint8Array(trimmed);
  try {
    const file = new File(uri);
    return await file.arrayBuffer();
  } catch {
    return null;
  }
}

async function uploadAvatarBytes(
  userId: string,
  uploadBytes: ArrayBuffer | Uint8Array,
  previewUri: string,
): Promise<PickAndUploadAvatarResult> {
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const { error } = await supabase().storage.from(AVATAR_BUCKET).upload(path, uploadBytes, {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) {
    const msg = error.message || 'Upload failed';
    const isRls = /row-level security|policy|rls/i.test(msg);
    console.log('[Avatar Upload Error]', msg, 'isRls:', isRls, 'bucket:', AVATAR_BUCKET, 'path:', path);
    return {
      path: null,
      previewUri: null,
      error: new Error(
        isRls
          ? `Storage permissions blocked for bucket "${AVATAR_BUCKET}" (path: "${path}"). Supabase says: ${msg}. Add/verify RLS policies in docs/AVATAR_STORAGE_RLS.md.`
          : msg,
      ),
    };
  }

  return { path, previewUri, error: null };
}

/** Pick a profile photo locally — upload after auth with `uploadAvatarFromLocal`. */
export async function pickLocalAvatar(): Promise<LocalAvatarPickResult> {
  try {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return { previewUri: null, base64: null, error: new Error('Permission to access photos is required') };
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { previewUri: null, base64: null, error: null };
    }

    const asset = result.assets[0];
    let uri = asset.uri;
    let base64 = typeof asset.base64 === 'string' ? asset.base64.trim() : null;

    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_SIZE, height: MAX_SIZE } }],
        { compress: QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      uri = manipulated.uri;
      if (manipulated.base64) base64 = manipulated.base64;
    } catch {
      // keep original
    }

    return { previewUri: uri, base64, error: null };
  } catch (e) {
    return {
      previewUri: null,
      base64: null,
      error: e instanceof Error ? e : new Error('Failed to pick photo'),
    };
  }
}

export async function uploadAvatarFromLocal(
  userId: string,
  previewUri: string,
  base64?: string | null,
): Promise<PickAndUploadAvatarResult> {
  try {
    const uploadBytes = await readUploadBytes(previewUri, base64);
    if (!uploadBytes || uploadBytes.byteLength === 0) {
      return { path: null, previewUri: null, error: new Error('Could not read image file') };
    }
    return uploadAvatarBytes(userId, uploadBytes, previewUri);
  } catch (e) {
    return {
      path: null,
      previewUri: null,
      error: e instanceof Error ? e : new Error('Failed to upload photo'),
    };
  }
}

/**
 * Request media library permission, pick an image, resize, upload to private Storage bucket.
 * Returns the storage path; caller should call authService.updateProfile({ avatar_url: path }).
 */
export async function pickAndUploadAvatar(userId: string): Promise<PickAndUploadAvatarResult> {
  try {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return { path: null, previewUri: null, error: new Error('Permission to access photos is required') };
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { path: null, previewUri: null, error: null };
    }

    const asset = result.assets[0];
    let uri = asset.uri;

    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_SIZE, height: MAX_SIZE } }],
        { compress: QUALITY, format: ImageManipulator.SaveFormat.JPEG }
      );
      uri = manipulated.uri;
    } catch {
      // Keep original if resize fails
    }

    // Prefer ImagePicker base64 payload because it is stable across Expo runtimes.
    // Fallback to File.arrayBuffer() if base64 is unavailable on the current device.
    const uploadBytes = await readUploadBytes(uri, asset.base64);

    if (!uploadBytes || uploadBytes.byteLength === 0) {
      return { path: null, previewUri: null, error: new Error('Could not read image file') };
    }

    return uploadAvatarBytes(userId, uploadBytes, uri);
  } catch (e) {
    return {
      path: null,
      previewUri: null,
      error: e instanceof Error ? e : new Error('Failed to pick or upload photo'),
    };
  }
}

/**
 * Pick and upload an organization logo.
 * Stores at {userId}/org-logo-{orgId}-{timestamp}.jpg so the existing
 * userprofiles avatar INSERT policy (`folder[1] = auth.uid()`) applies.
 */
export async function pickAndUploadOrgLogo(orgId: string): Promise<PickAndUploadAvatarResult> {
  try {
    let uri = '';
    let sourceBase64: string | null = null;

    if (Platform.OS === 'web') {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) {
        return { path: null, previewUri: null, error: null };
      }
      uri = picked.assets[0].uri;
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return { path: null, previewUri: null, error: new Error('Permission to access photos is required') };
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) {
        return { path: null, previewUri: null, error: null };
      }
      const asset = result.assets[0];
      uri = asset.uri;
      sourceBase64 = typeof asset.base64 === 'string' ? asset.base64.trim() : null;
    }

    let manipulatedBase64: string | null = null;
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_SIZE, height: MAX_SIZE } }],
        { compress: QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      uri = manipulated.uri;
      if (manipulated.base64) manipulatedBase64 = manipulated.base64;
    } catch {
      // keep original if resize fails
    }

    let uploadBytes: Uint8Array | null = null;
    const base64Source = manipulatedBase64 ?? sourceBase64 ?? '';
    if (base64Source) {
      uploadBytes = base64ToUint8Array(base64Source);
    } else if (uri.startsWith('data:')) {
      const comma = uri.indexOf(',');
      if (comma !== -1) uploadBytes = base64ToUint8Array(uri.slice(comma + 1));
    } else {
      const fromFile = await readUploadBytes(uri, null);
      if (fromFile) {
        uploadBytes = fromFile instanceof Uint8Array ? fromFile : new Uint8Array(fromFile);
      }
    }
    if (!uploadBytes || uploadBytes.byteLength === 0) {
      return { path: null, previewUri: null, error: new Error('Could not read image data') };
    }

    const {
      data: { session },
    } = await supabase().auth.getSession();
    if (!session?.user?.id) {
      return { path: null, previewUri: null, error: new Error('Not signed in') };
    }

    const path = `${session.user.id}/org-logo-${orgId}-${Date.now()}.jpg`;
    const { error } = await supabase().storage.from(AVATAR_BUCKET).upload(path, uploadBytes, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (error) {
      const msg = error.message || 'Upload failed';
      const isRls = /row-level security|policy|rls/i.test(msg);
      console.log('[Org Logo Upload Error]', msg, 'bucket:', AVATAR_BUCKET, 'path:', path);
      return {
        path: null,
        previewUri: null,
        error: new Error(
          isRls
            ? `Storage permissions blocked for bucket "${AVATAR_BUCKET}". ${msg}`
            : msg,
        ),
      };
    }
    invalidateSignedAvatarCache(path);
    return { path, previewUri: uri, error: null };
  } catch (e) {
    return { path: null, previewUri: null, error: e instanceof Error ? e : new Error('Failed to upload org logo') };
  }
}

export { updateOrganizationLogo } from '@/features/organization/services/organization.service';

/**
 * Pick and upload a vehicle profile photo.
 * Stores at {userId}/vehicle-{vehicleId}-{timestamp}.jpg (same bucket RLS as user avatars).
 */
export async function pickAndUploadVehicleAvatar(
  vehicleId: string,
): Promise<PickAndUploadAvatarResult> {
  try {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return { path: null, previewUri: null, error: new Error('Permission to access photos is required') };
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) {
      return { path: null, previewUri: null, error: null };
    }
    const asset = result.assets[0];
    let uri = asset.uri;
    let manipulatedBase64: string | null = null;
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_SIZE, height: MAX_SIZE } }],
        { compress: QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      uri = manipulated.uri;
      if (manipulated.base64) manipulatedBase64 = manipulated.base64;
    } catch {
      // keep original
    }
    const base64Source =
      manipulatedBase64 ?? (typeof asset.base64 === 'string' ? asset.base64.trim() : '');
    const uploadBytes = base64Source
      ? base64ToUint8Array(base64Source)
      : await readUploadBytes(uri, asset.base64);
    if (!uploadBytes || uploadBytes.byteLength === 0) {
      return { path: null, previewUri: null, error: new Error('Could not read image data') };
    }
    const {
      data: { session },
    } = await supabase().auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      return { path: null, previewUri: null, error: new Error('Not signed in') };
    }
    const path = `${userId}/vehicle-${vehicleId}-${Date.now()}.jpg`;
    const { error } = await supabase().storage.from(AVATAR_BUCKET).upload(path, uploadBytes, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (error) {
      return { path: null, previewUri: null, error: new Error(error.message || 'Upload failed') };
    }
    return { path, previewUri: uri, error: null };
  } catch (e) {
    return {
      path: null,
      previewUri: null,
      error: e instanceof Error ? e : new Error('Failed to upload vehicle photo'),
    };
  }
}

/** Image file extensions supported for avatar object discovery. */
const AVATAR_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

function hasImageExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return AVATAR_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

async function findLatestAvatarPathForUserFolder(
  bucket: string,
  userIdFolder: string
): Promise<string | null> {
  const folder = userIdFolder.trim();
  if (!folder) return null;

  const { data, error } = await supabase()
    .storage
    .from(bucket)
    .list(folder, {
      limit: 100,
      sortBy: { column: "updated_at", order: "desc" },
    });

  if (error || !Array.isArray(data) || data.length === 0) return null;

  const files = data.filter((entry) => {
    const name = (entry?.name ?? "").trim();
    return name.length > 0 && !name.endsWith("/") && hasImageExtension(name);
  });
  if (files.length === 0) return null;

  files.sort((a, b) => {
    const aTime = Date.parse(a.updated_at ?? a.created_at ?? "") || 0;
    const bTime = Date.parse(b.updated_at ?? b.created_at ?? "") || 0;
    return bTime - aTime;
  });

  const top = files[0]?.name?.trim();
  return top ? `${folder}/${top}` : null;
}

async function buildAvatarPathCandidates(path: string): Promise<string[]> {
  const p = path.trim();
  if (!p) return [];
  // Paths with query params are never valid storage object keys (e.g. Expo dev-server URLs).
  if (p.includes("?")) return [];
  if (p.includes("/")) return [p];
  // Bare filename (has image extension but no folder) — try it directly in both buckets.
  // Old profiles occasionally stored filenames without a user-folder prefix.
  if (hasImageExtension(p)) return [p];

  // Legacy records sometimes stored only the user-id folder in avatar_url.
  // In that case discover the newest image object under that folder first.
  const discoveredPrimary = await findLatestAvatarPathForUserFolder(AVATAR_BUCKET, p);
  const discoveredLegacy = await findLatestAvatarPathForUserFolder(LEGACY_AVATAR_BUCKET, p);
  const fallbackConventional = [`${p}/avatar.jpg`, `${p}/avatar.jpeg`, `${p}/avatar.png`];

  const deduped = new Set<string>();
  if (discoveredPrimary) deduped.add(discoveredPrimary);
  if (discoveredLegacy) deduped.add(discoveredLegacy);
  for (const candidate of fallbackConventional) deduped.add(candidate);
  return Array.from(deduped);
}

function orgLogoObjectPathLocal(raw: string): string | null {
  let candidate = raw;
  if (candidate.toLowerCase().startsWith("s3://")) {
    const withoutScheme = candidate.slice(5);
    const slash = withoutScheme.indexOf("/");
    candidate =
      slash > 0 ? withoutScheme.slice(slash + 1) || withoutScheme : withoutScheme;
  }
  const idx = candidate.indexOf(PUBLIC_ORG_LOGO_PREFIX);
  if (idx >= 0) return candidate.slice(idx).split("?")[0] ?? null;
  if (candidate.startsWith(`${PUBLIC_ORG_ASSET_BUCKET}/`)) {
    return candidate.slice(PUBLIC_ORG_ASSET_BUCKET.length + 1).split("?")[0] ?? null;
  }
  return null;
}

/** Public URL for an org-logo storage ref. Never signs. */
export function resolveOrgLogoPublicUrl(
  raw: string | null | undefined,
): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const path = orgLogoObjectPathLocal(trimmed);
  if (path) {
    return supabase()
      .storage
      .from(PUBLIC_ORG_ASSET_BUCKET)
      .getPublicUrl(path).data.publicUrl;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      if (
        parsed.hostname.includes("amazonaws.com") ||
        parsed.hostname.includes("cloudfront.net")
      ) {
        return trimmed;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function extractPathFromStorageUrl(
  rawUrl: string
): { bucket: string; path: string } | null {
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const objectIdx = segments.indexOf('object');
    if (objectIdx < 0 || objectIdx + 2 >= segments.length) return null;
    const accessType = segments[objectIdx + 1]; // public | sign | authenticated
    if (!['public', 'sign', 'authenticated'].includes(accessType)) return null;
    const bucket = segments[objectIdx + 2] ?? '';
    const pathParts = segments.slice(objectIdx + 3);
    if (!bucket || pathParts.length === 0) return null;
    return {
      bucket,
      path: decodeURIComponent(pathParts.join('/')),
    };
  } catch {
    return null;
  }
}

/**
 * Synchronously resolve a storage path to a public URL.
 * Use this when the bucket is PUBLIC — no network round-trip needed.
 * Returns null if path is empty. Passes through full HTTP(S) URLs unchanged.
 */
export function resolveAvatarPublicUrl(path: string | null | undefined): string | null {
  const p = (path ?? '').trim();
  if (!p) return null;
  const orgLogo = resolveOrgLogoPublicUrl(p);
  if (orgLogo) return orgLogo;
  if (p.startsWith('http://') || p.startsWith('https://')) {
    const ref = extractPathFromStorageUrl(p);
    if (ref && (ref.bucket === AVATAR_BUCKET || ref.bucket === LEGACY_AVATAR_BUCKET)) {
      return null;
    }
    return p;
  }
  // `userprofiles` is private — public URLs 400; callers must use getSignedAvatarUrl.
  return null;
}

/**
 * Get a signed URL for an avatar storage path (private bucket).
 * Returns null if path is empty or signed URL fails.
 * Accepts path as "userId" or "userId/avatar.jpg".
 */
export async function getSignedAvatarUrl(path: string): Promise<string | null> {
  const cacheKey = path.trim();
  // Org logos live in the PUBLIC S3 `org-assets` bucket. Never sign them.
  const orgLogoUrl = resolveOrgLogoPublicUrl(cacheKey);
  if (orgLogoUrl) return orgLogoUrl;
  // Breaker open: fall back to initials rather than re-probing Storage.
  if (Date.now() < signBreakerOpenUntil) return null;

  if (cacheKey) {
    const cached = signedAvatarUrlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }
    // Deduplicate concurrent callers for the same path (thundering-herd guard).
    // Without this, 87 list-rows mounting simultaneously each start their own
    // storage.list() + createSignedUrl chain before the first one can populate the cache.
    const inFlight = inFlightAvatarRequests.get(cacheKey);
    if (inFlight) return inFlight;
  }

  const promise = (async (): Promise<string | null> => {
    const candidates = await buildAvatarPathCandidates(path);
    if (candidates.length === 0) {
      if (cacheKey) signedAvatarUrlCache.set(cacheKey, { url: null, expiresAt: Date.now() + SIGNED_URL_NOT_FOUND_CACHE_MS });
      return null;
    }

    for (const candidate of candidates) {
      const primary = await supabase()
        .storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(candidate, SIGNED_URL_EXPIRY_SEC);
      if (!primary.error && primary.data?.signedUrl) {
        const url = primary.data.signedUrl;
        noteSignSuccess();
        if (cacheKey) signedAvatarUrlCache.set(cacheKey, { url, expiresAt: Date.now() + SIGNED_URL_CACHE_MS });
        return url;
      }
      noteSignFailure();
      if (Date.now() < signBreakerOpenUntil) break;

    }

    // Backward compatibility: old avatars may still be in the previous bucket.
    for (const candidate of candidates) {
      const legacy = await supabase()
        .storage
        .from(LEGACY_AVATAR_BUCKET)
        .createSignedUrl(candidate, SIGNED_URL_EXPIRY_SEC);
      if (!legacy.error && legacy.data?.signedUrl) {
        const url = legacy.data.signedUrl;
        noteSignSuccess();
        if (cacheKey) signedAvatarUrlCache.set(cacheKey, { url, expiresAt: Date.now() + SIGNED_URL_CACHE_MS });
        return url;
      }
      noteSignFailure();
      if (Date.now() < signBreakerOpenUntil) break;
    }

    // Cache the not-found result so repeated calls don't hammer storage again.
    if (cacheKey) signedAvatarUrlCache.set(cacheKey, { url: null, expiresAt: Date.now() + SIGNED_URL_NOT_FOUND_CACHE_MS });
    return null;
  })();

  if (cacheKey) {
    inFlightAvatarRequests.set(cacheKey, promise);
    void promise.finally(() => inFlightAvatarRequests.delete(cacheKey));
  }

  return promise;
}

/** Drop cached signed URL so the next resolve picks up a new upload. */
export function invalidateSignedAvatarCache(path?: string | null): void {
  const key = (path ?? '').trim();
  if (!key) return;
  signedAvatarUrlCache.delete(key);
  inFlightAvatarRequests.delete(key);
}

async function resolveDriverAvatarDisplayUrl(
  avatarUrl: string,
  userId?: string | null,
): Promise<string | null> {
  const raw = avatarUrl.trim();
  if (!raw) return null;

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const storageRef = extractPathFromStorageUrl(raw);
    if (
      storageRef &&
      (storageRef.bucket === AVATAR_BUCKET || storageRef.bucket === LEGACY_AVATAR_BUCKET)
    ) {
      return await getSignedAvatarUrl(storageRef.path);
    }
    return raw;
  }

  const signed = await getSignedAvatarUrl(raw);
  if (signed) return signed;

  const uid = (userId ?? '').trim();
  if (uid && uid !== raw) {
    return await getSignedAvatarUrl(uid);
  }
  return null;
}

/**
 * Resolve profile.avatar_url to a displayable URI: signed storage path, http URL,
 * or bundled preset from **profile.avatar_seed** (DB), not stale AsyncStorage alone.
 */
export function useDriverAvatarUri(): { avatarUri: string; loading: boolean } {
  const { profile } = useAuth();
  const { avatarSeed: contextSeed, setAvatarSeed, previewUri, setPreviewUri } = useDriverAvatar();
  const profileSeed = profile?.avatar_seed?.trim() ?? '';
  const effectiveSeed = profileSeed || contextSeed;
  const presetUri = driverDisplayPresetUri(effectiveSeed);
  const storedPhoto = profile?.avatar_url?.trim() ?? '';
  const [avatarUri, setAvatarUri] = useState<string>(presetUri);
  const [loading, setLoading] = useState(false);
  const lastStoredPhotoRef = useRef('');

  useEffect(() => {
    if (profileSeed && profileSeed !== contextSeed) {
      setAvatarSeed(profileSeed);
    }
  }, [profileSeed, contextSeed, setAvatarSeed]);

  const resolve = useCallback(async () => {
    if (!storedPhoto) {
      setAvatarUri(presetUri);
      setLoading(false);
      lastStoredPhotoRef.current = '';
      return;
    }

    if (lastStoredPhotoRef.current !== storedPhoto) {
      invalidateSignedAvatarCache(storedPhoto);
      lastStoredPhotoRef.current = storedPhoto;
    }

    setLoading(true);
    const signed = await resolveDriverAvatarDisplayUrl(storedPhoto, profile?.uid);
    // Never leave an empty URI while a photo path exists — map markers fall back
    // to driver-1 and look “wrong.” Prefer signed URL, else preset until re-resolve.
    setAvatarUri(signed ?? presetUri);
    if (signed) setPreviewUri(null);
    setLoading(false);
  }, [storedPhoto, presetUri, profile?.uid, setPreviewUri]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  const resolved = storedPhoto ? avatarUri : avatarUri || presetUri;

  return {
    avatarUri: previewUri?.trim() || resolved,
    loading: Boolean(storedPhoto) && loading && !previewUri?.trim(),
  };
}
