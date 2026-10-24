import {
  searchExistingDriversByPhone,
  type DriverRow,
  type ExistingDriverMatch,
} from "@/features/drivers/services/drivers.service";

export function normalizeIndianMobileLast10(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/** True when this platform driver is an active asset row in the caller's fleet roster. */
export function isDriverMatchInOrgFleet(
  match: ExistingDriverMatch,
  fleetDrivers: readonly DriverRow[],
): boolean {
  if (!match?.user_id || fleetDrivers.length === 0) return false;
  const matchPhone = normalizeIndianMobileLast10(match.phone);
  return fleetDrivers.some((d) => {
    if (d.left_at) return false;
    if (d.tracking_only) return false;
    if (d.user_id && d.user_id === match.user_id) return true;
    if (matchPhone.length >= 10) {
      return normalizeIndianMobileLast10(d.phone ?? "") === matchPhone;
    }
    return false;
  });
}

/**
 * Phone lookup RPC may omit avatars; profiles SELECT is RLS-self-only.
 * Fleet roster (`get_drivers_with_profiles`) already has avatars — merge them
 * onto matches so Recommended Driver shows the real photo when employed here.
 */
export function enrichDriverMatchesWithFleetAvatars(
  matches: readonly ExistingDriverMatch[],
  fleetDrivers: readonly DriverRow[],
): ExistingDriverMatch[] {
  if (matches.length === 0) return matches as ExistingDriverMatch[];
  if (fleetDrivers.length === 0) return matches as ExistingDriverMatch[];

  return matches.map((match) => {
    const hasAvatar =
      Boolean((match.avatar_url ?? "").trim()) ||
      Boolean((match.avatar_seed ?? "").trim());
    if (hasAvatar) return match;

    const matchPhone = normalizeIndianMobileLast10(match.phone);
    const fleet =
      (match.user_id
        ? fleetDrivers.find((d) => d.user_id && d.user_id === match.user_id)
        : undefined) ??
      (matchPhone.length >= 10
        ? fleetDrivers.find(
            (d) => normalizeIndianMobileLast10(d.phone ?? "") === matchPhone,
          )
        : undefined);

    if (!fleet) return match;
    const avatarUrl = (fleet.avatar_url ?? "").trim() || null;
    const avatarSeed = (fleet.avatar_seed ?? "").trim() || null;
    if (!avatarUrl && !avatarSeed) return match;
    return {
      ...match,
      avatar_url: avatarUrl ?? match.avatar_url,
      avatar_seed: avatarSeed ?? match.avatar_seed,
    };
  });
}

const lookupInflight = new Map<
  string,
  Promise<{
    error: Error | null;
    matches: ExistingDriverMatch[];
    last10: string;
  }>
>();

/**
 * Resolve driver profile(s) by phone.
 * `get_driver_invitee_by_phone` already canonicalizes last-10 / +91 / 91,
 * so one RPC is enough. Concurrent callers for the same last-10 share one request.
 */
export async function lookupDriversByPhoneVariants(raw: string): Promise<{
  error: Error | null;
  matches: ExistingDriverMatch[];
  last10: string;
}> {
  const last10 = normalizeIndianMobileLast10(raw);
  if (last10.length < 10) {
    return { error: null, matches: [], last10 };
  }

  const existing = lookupInflight.get(last10);
  if (existing) return existing;

  const pending = searchExistingDriversByPhone(last10)
    .then(({ error, matches }) => {
      const seen = new Set<string>();
      const unique: ExistingDriverMatch[] = [];
      for (const m of matches) {
        if (!m.user_id || seen.has(m.user_id)) continue;
        seen.add(m.user_id);
        unique.push(m);
      }
      return { error, matches: unique, last10 };
    })
    .finally(() => {
      lookupInflight.delete(last10);
    });

  lookupInflight.set(last10, pending);
  return pending;
}
