/**
 * Organization service — Supabase only (mobile).
 * Same DB as pulse-unified-base; RLS restricts to own memberships.
 * Uses membership-based query first (RLS on organization_members + organizations).
 * If that returns nothing and the DB has get_organizations_for_user() RPC, tries RPC to backfill owner memberships.
 */
import { supabase } from "@/lib/supabase";
import { isSupabaseCircuitOpen, normalizeInfrastructureErrorMessage } from "@/lib/supabaseHttp.util";
import { uuidv7 } from "@/lib/uuidv7";
import type { MemberSurfaceMap } from "@/lib/memberSurfaces";
import {
  isVerificationFrozen,
  type CurrentOrganization,
  type WorkspaceKyc,
} from "@/types/organization";
import type { PlatformTeamRole } from "@/features/organization/utils/teamInviteRoles.util";

const defaultCapabilities = {
  canPostIndent: true,
  canBid: true,
  canManageAssets: true,
  canUseMarketplace: true,
};

function mapToCurrentOrganization(o: {
  id: string;
  name: string | null;
  operating_model?: string;
  logo_url?: string | null;
}): CurrentOrganization {
  return {
    id: o.id,
    name: o.name ?? "",
    logo_url: o.logo_url ?? null,
    operatingModel: (o.operating_model === "ASSET_BASED" ||
    o.operating_model === "NON_ASSET" ||
    o.operating_model === "HYBRID"
      ? o.operating_model
      : "HYBRID") as CurrentOrganization["operatingModel"],
    sourcingStrategy: "MARKETPLACE_FIRST",
    marketplaceEnabled: true,
    capabilities: defaultCapabilities,
  };
}

function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg === "Network request failed" ||
    /network|fetch.*failed|timeout|json parse|unexpected character|522|520|502|503|504/i.test(msg)
  );
}

/** PostgREST: RPC not in schema / not deployed (avoid noisy 404 in console). */
function isMissingRpcError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const m = String(err.message ?? "").toLowerCase();
  const status = (err as { status?: number; statusCode?: number }).status ??
    (err as { status?: number; statusCode?: number }).statusCode;
  return (
    status === 404 ||
    err.code === "PGRST202" ||
    err.code === "42883" ||
    m.includes("could not find the function") ||
    m.includes("schema cache") ||
    m.includes("does not exist")
  );
}

export async function getOrganizationsForUser(): Promise<{
  error: Error | null;
  organizations: CurrentOrganization[];
}> {
  let user: { id: string } | null = null;
  try {
    const { data: { session }, error: sessionError } =
      await supabase().auth.getSession();
    if (sessionError) {
      return { error: new Error(sessionError.message), organizations: [] };
    }
    user = session?.user ?? null;
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const err = new Error(normalizeInfrastructureErrorMessage(raw));
    if (__DEV__ && !isNetworkError(err)) {
      console.log("[getOrganizationsForUser] No session:", err.message);
    }
    return { error: err, organizations: [] };
  }
  if (!user) {
    return { error: new Error("Not signed in"), organizations: [] };
  }

  try {
    // 1) Membership-based path first (works with RLS: organization_members + organizations)
    const { data: memberships, error: memError } = await supabase()
      .from("organization_members")
      .select("organization_id, role, status")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (!memError && memberships?.length) {
      const orgIds = [...new Set(memberships.map((m) => m.organization_id))];
      // Try with logo_url first (requires migration 20260503120000_add_org_logo_url); fall back without it.
      let orgsData:
        | {
            id: string;
            name: string;
            slug: string | null;
            owner_id: string | null;
            operating_model: string;
            logo_url?: string | null;
          }[]
        | null = null;
      let orgError: { message: string } | null = null;

      const withLogo = await supabase()
        .from("organizations")
        .select("id, name, slug, owner_id, operating_model, logo_url")
        .in("id", orgIds);

      const isLogoColMissing =
        withLogo.error &&
        /column.*logo_url.*does not exist|undefined column/i.test(withLogo.error.message ?? "");

      if (isLogoColMissing) {
        const fallback = await supabase()
          .from("organizations")
          .select("id, name, slug, owner_id, operating_model")
          .in("id", orgIds);
        orgsData = fallback.data ?? null;
        orgError = fallback.error ?? null;
      } else {
        orgsData = withLogo.data ?? null;
        orgError = withLogo.error ?? null;
      }
      const orgs = orgsData;

      if (!orgError && orgs?.length) {
        void repairMissingOrganizationOwners(
          orgs.filter((o) => o.owner_id == null).map((o) => o.id),
          memberships,
          user.id,
        );
        return {
          error: null,
          organizations: orgs.map(mapToCurrentOrganization),
        };
      }
      if (orgError) {
        return { error: new Error(orgError.message), organizations: [] };
      }
    }

    if (memError) {
      return { error: new Error(memError.message), organizations: [] };
    }

    // 2) No memberships from direct query: try RPC (creates missing owner memberships in some schemas)
    const { data: rpcOrgs, error: rpcError } = await supabase().rpc(
      "get_organizations_for_user",
    );

    if (rpcError) {
      if (isMissingRpcError(rpcError)) {
        if (__DEV__) {
          console.warn(
            "[getOrganizationsForUser] get_organizations_for_user RPC missing; apply supabase/migrations/20260517120000_get_organizations_for_user_rpc.sql or use org memberships only.",
            rpcError.message,
          );
        }
        return { error: null, organizations: [] };
      }
      return { error: new Error(rpcError.message), organizations: [] };
    }

    const rpcList = Array.isArray(rpcOrgs) ? rpcOrgs : rpcOrgs ? [rpcOrgs] : [];
    if (rpcList.length) {
      const organizations: CurrentOrganization[] = rpcList.map(
        (o: { id: string; name?: string | null }) =>
          mapToCurrentOrganization({ id: o.id, name: o.name ?? null }),
      );
      return { error: null, organizations };
    }

    return { error: null, organizations: [] };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { error: err, organizations: [] };
  }
}

export type OrganizationLocation = {
  id: string;
  name?: string | null;
  city: string | null;
  state: string | null;
  address_line: string | null;
  locality?: string | null;
  pincode?: string | null;
};

/** Best-effort: set organizations.owner_id when null but caller is active owner member. */
async function repairMissingOrganizationOwners(
  orgIds: string[],
  memberships: { organization_id: string; role: string; status: string }[],
  userId: string,
): Promise<void> {
  const ownerOrgIds = new Set(
    memberships
      .filter(
        (m) =>
          m.role === "owner" &&
          m.status === "active" &&
          orgIds.includes(m.organization_id),
      )
      .map((m) => m.organization_id),
  );
  if (!ownerOrgIds.size) return;

  await Promise.all(
    [...ownerOrgIds].map(async (orgId) => {
      const { error } = await supabase()
        .from("organizations")
        .update({ owner_id: userId })
        .eq("id", orgId)
        .is("owner_id", null);
      if (error && __DEV__) {
        console.warn("[repairMissingOrganizationOwners]", orgId, error.message);
      }
    }),
  );
}

export async function updateOrganizationName(
  orgId: string,
  name: string,
): Promise<{ error: Error | null }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: new Error("Organisation name cannot be empty") };
  const { data, error } = await supabase()
    .from("organizations")
    .update({ name: trimmed })
    .eq("id", orgId)
    .select("id")
    .maybeSingle();
  if (error) return { error: new Error(error.message) };
  if (!data) {
    return {
      error: new Error(
        "Could not save workspace name. You may not have permission for this workspace.",
      ),
    };
  }
  return { error: null };
}

export async function updateOrganizationLogo(
  orgId: string,
  logoPath: string | null,
): Promise<{ error: Error | null }> {
  const normalizedPath =
    logoPath == null ? null : String(logoPath).trim() || null;

  const { error: rpcError } = await supabase().rpc("update_organization_logo", {
    p_org_id: orgId,
    p_logo_url: normalizedPath,
  });

  if (rpcError && !isMissingRpcError(rpcError)) {
    return { error: new Error(rpcError.message) };
  }

  if (rpcError && isMissingRpcError(rpcError)) {
    const { data, error } = await supabase()
      .from("organizations")
      .update({ logo_url: normalizedPath })
      .eq("id", orgId)
      .select("id")
      .maybeSingle();

    if (error) return { error: new Error(error.message) };
    if (!data) {
      return {
        error: new Error(
          "Could not save workspace logo. Apply the latest database migration or ask an admin to fix workspace ownership.",
        ),
      };
    }
  }

  // Confirm write landed — storage upload can succeed while the RPC is rejected,
  // which previously left the UI showing only a one-session local preview.
  const { data: verify, error: verifyError } = await supabase()
    .from("organizations")
    .select("logo_url")
    .eq("id", orgId)
    .maybeSingle();
  if (verifyError) {
    return { error: new Error(verifyError.message) };
  }
  const saved = (verify?.logo_url ?? "").trim() || null;
  const expected = normalizedPath;
  if (saved !== expected) {
    return {
      error: new Error(
        "Logo upload did not save to the organisation. Try again as workspace owner/admin.",
      ),
    };
  }
  return { error: null };
}

export type OperatingModel = "ASSET_BASED" | "NON_ASSET" | "HYBRID";

/** Detect the RPC's 30-day cooldown rejection so the UI can show a friendly message. */
export function looksLikeModelChangeCooldownError(message: string): boolean {
  return /operating_model_change_cooldown/i.test(message);
}

/**
 * Change an org's operating model via the owner-only, cooldown-guarded,
 * audited RPC. The DB is the authority — UI gating is convenience only.
 */
export async function changeOperatingModel(
  orgId: string,
  newModel: OperatingModel,
): Promise<{ error: Error | null; from?: string; to?: string }> {
  const { data, error } = await supabase().rpc("change_operating_model", {
    p_org_id: orgId,
    p_new_model: newModel,
  });
  if (error) return { error: new Error(error.message) };
  const result = (data ?? {}) as { from?: string; to?: string };
  return { error: null, from: result.from, to: result.to };
}

export async function getOrganizationLocationsByIds(orgIds: string[]): Promise<{
  error: Error | null;
  locations: OrganizationLocation[];
}> {
  const uniqueIds = [...new Set(orgIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return { error: null, locations: [] };

  if (isSupabaseCircuitOpen()) return { error: null, locations: [] };

  const { data, error } = await supabase()
    .from("organizations")
    .select("id, city, state, address_line")
    .in("id", uniqueIds);

  if (error) return { error: new Error(error.message), locations: [] };
  return { error: null, locations: (data ?? []) as OrganizationLocation[] };
}

export async function getOrganizationLocationsByNames(orgNames: string[]): Promise<{
  error: Error | null;
  locations: OrganizationLocation[];
}> {
  const escapeLike = (value: string) => value.replace(/[%_\\]/g, '\\$&');
  const uniqueNames = [...new Set(orgNames.map((name) => name.trim()).filter(Boolean))];
  if (uniqueNames.length === 0) return { error: null, locations: [] };

  if (isSupabaseCircuitOpen()) return { error: null, locations: [] };

  // Single round trip instead of one `.ilike` query per name (which fanned out
  // N concurrent queries proportional to caller input). Preserves the prior
  // case-insensitive match via an OR of ilike filters, and de-dupes to one row
  // per name to match the previous `.limit(1)` per-name behavior.
  const orFilter = uniqueNames
    .map((name) => `name.ilike.${escapeLike(name)}`)
    .join(",");

  const { data, error } = await supabase()
    .from("organizations")
    .select("id, name, city, state, address_line")
    .or(orFilter);

  if (error) {
    return { error: new Error(error.message ?? "Failed to fetch organization locations"), locations: [] };
  }

  const rows = (data ?? []) as OrganizationLocation[];
  const seenByName = new Set<string>();
  const locations: OrganizationLocation[] = [];
  for (const row of rows) {
    const key = (row.name ?? "").trim().toLowerCase();
    if (seenByName.has(key)) continue;
    seenByName.add(key);
    locations.push(row);
  }
  return { error: null, locations };
}

// ─── Workspace Profile Fields ─────────────────────────────────────────────────

export type OrgProfileFields = {
  address_line: string | null;
  city: string | null;
  state: string | null;
  profile_website: string | null;
};

export async function getOrgProfileFields(orgId: string): Promise<{
  error: Error | null;
  profile: OrgProfileFields | null;
}> {
  const { data, error } = await supabase()
    .from('organizations')
    .select('address_line, city, state, profile_website')
    .eq('id', orgId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), profile: null };
  return { error: null, profile: (data as OrgProfileFields) ?? null };
}

export type OrgVerificationBannerFields = {
  verification_status: import('@/types/organization').KycVerificationStatus;
  created_at: string | null;
};

/** Lightweight — for the post-signup/persistent verification reminder banner. Do not use for the KYC panel itself (use getWorkspaceKyc). */
export async function getOrgVerificationBannerFields(orgId: string): Promise<{
  error: Error | null;
  fields: OrgVerificationBannerFields | null;
}> {
  const { data, error } = await supabase()
    .from('organizations')
    .select('verification_status, created_at')
    .eq('id', orgId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), fields: null };
  return { error: null, fields: (data as OrgVerificationBannerFields) ?? null };
}

// ─── Workspace KYC ────────────────────────────────────────────────────────────

const WORKSPACE_KYC_SELECT =
  'id,name,logo_url,business_pan,gstin,gst_not_applicable,cin,msme_number,tan_number,iec_number,verification_status,verified_at,kyc_rejected_reason,rejection_reasons,registration_type,business_type,address_line,city,state,pincode,address_pincode,address_proof_path,address_proof_type,frozen_at,submitted_at';

export async function getWorkspaceKyc(orgId: string): Promise<{
  error: Error | null;
  kyc: WorkspaceKyc | null;
}> {
  const { data, error } = await supabase()
    .from('organizations')
    .select(WORKSPACE_KYC_SELECT)
    .eq('id', orgId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), kyc: null };
  return { error: null, kyc: (data as unknown as WorkspaceKyc) ?? null };
}

export async function updateWorkspaceKyc(
  orgId: string,
  fields: {
    business_pan?: string | null;
    gstin?: string | null;
    gst_not_applicable?: boolean;
    cin?: string | null;
    msme_number?: string | null;
    tan_number?: string | null;
    iec_number?: string | null;
    address_line?: string | null;
    city?: string | null;
    state?: string | null;
  },
): Promise<{ error: Error | null; kyc: WorkspaceKyc | null }> {
  // update_workspace_kyc RPC uses COALESCE — it cannot clear gstin or cin.
  // Null those via a direct organizations update (same pattern as GST skip).
  const clearingGstinForSkip =
    fields.gst_not_applicable === true && fields.gstin === null;
  const clearingCin = fields.cin === null || fields.cin === '';

  const coreFields = {
    business_pan: fields.business_pan,
    gstin: clearingGstinForSkip ? undefined : fields.gstin,
    cin: clearingCin ? undefined : fields.cin,
  };
  const hasCoreUpdate = Object.values(coreFields).some((v) => v !== undefined);
  const hasExtUpdate =
    fields.msme_number !== undefined ||
    fields.tan_number !== undefined ||
    fields.iec_number !== undefined ||
    fields.gst_not_applicable !== undefined ||
    fields.address_line !== undefined ||
    fields.city !== undefined ||
    fields.state !== undefined ||
    clearingGstinForSkip ||
    clearingCin;

  if (hasCoreUpdate) {
    const { data, error } = await supabase().rpc('update_workspace_kyc', {
      p_org_id: orgId,
      p_pan: fields.business_pan ?? null,
      p_gstin: fields.gstin ?? null,
      p_cin: fields.cin ?? null,
    });
    if (error) return { error: new Error(error.message), kyc: null };
    if (!hasExtUpdate) return { error: null, kyc: (data as WorkspaceKyc) ?? null };
  }

  if (hasExtUpdate) {
    const touchingAddress =
      fields.address_line !== undefined ||
      fields.city !== undefined ||
      fields.state !== undefined;
    if (touchingAddress) {
      const { data: statusRow, error: statusErr } = await supabase()
        .from('organizations')
        .select('verification_status')
        .eq('id', orgId)
        .maybeSingle();
      if (statusErr) return { error: new Error(statusErr.message), kyc: null };
      const status = ((statusRow as { verification_status?: string } | null)
        ?.verification_status ?? 'unverified') as WorkspaceKyc['verification_status'];
      if (isVerificationFrozen(status)) {
        return {
          error: new Error(
            'Registered office is locked after verification. Upload a new address proof for Pulse admin to change it.',
          ),
          kyc: null,
        };
      }
    }
    const patch: Record<string, unknown> = {};
    if (fields.msme_number !== undefined) {
      patch.msme_number = fields.msme_number?.trim().toUpperCase() || null;
    }
    if (fields.tan_number !== undefined) {
      patch.tan_number = fields.tan_number?.trim().toUpperCase() || null;
    }
    if (fields.iec_number !== undefined) {
      patch.iec_number = fields.iec_number?.trim() || null;
    }
    if (fields.gst_not_applicable !== undefined) {
      patch.gst_not_applicable = fields.gst_not_applicable;
    }
    if (clearingGstinForSkip) patch.gstin = null;
    if (clearingCin) patch.cin = null;
    if (fields.address_line !== undefined) {
      patch.address_line = fields.address_line?.trim() || null;
    }
    if (fields.city !== undefined) patch.city = fields.city?.trim() || null;
    if (fields.state !== undefined) patch.state = fields.state?.trim() || null;
    const { error } = await supabase().from('organizations').update(patch).eq('id', orgId);
    if (error) return { error: new Error(error.message), kyc: null };
  }

  const { data: fresh, error: fetchErr } = await supabase()
    .from('organizations')
    .select(WORKSPACE_KYC_SELECT)
    .eq('id', orgId)
    .maybeSingle();
  if (fetchErr) return { error: new Error(fetchErr.message), kyc: null };
  return { error: null, kyc: (fresh as unknown as WorkspaceKyc) ?? null };
}

// ─── Custom member-permission presets (organizations.settings.customRoles) ────

/**
 * A saved permission template an admin can re-apply to any member, so custom
 * roles don't require re-toggling 15+ surfaces each time. Stored in the org's
 * `settings` JSONB — writes are gated by the existing owner/admin UPDATE policy.
 */
export type CustomRolePreset = {
  id: string;
  name: string;
  surfaces: MemberSurfaceMap;
  /** Role label persisted alongside the member row when this preset is applied. */
  platformRole: PlatformTeamRole;
  created_at: string;
};

type OrgSettings = {
  customRoles?: CustomRolePreset[];
  groundOpsDocUploadEnabled?: boolean;
};

/** Drops malformed rows rather than throwing — settings is free-form JSONB. */
function parseCustomRoles(raw: unknown): CustomRolePreset[] {
  const list = (raw as OrgSettings | null)?.customRoles;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (r): r is CustomRolePreset =>
      !!r &&
      typeof r === "object" &&
      typeof (r as CustomRolePreset).id === "string" &&
      typeof (r as CustomRolePreset).name === "string" &&
      !!(r as CustomRolePreset).surfaces &&
      typeof (r as CustomRolePreset).surfaces === "object",
  );
}

export async function getCustomRolePresets(orgId: string): Promise<{
  error: Error | null;
  presets: CustomRolePreset[];
}> {
  const { error, settings } = await readOrgSettings(orgId);
  if (error) return { error, presets: [] };
  return { error: null, presets: parseCustomRoles(settings) };
}

/** Reads the whole bag so writes can merge instead of clobbering sibling keys. */
async function readOrgSettings(orgId: string): Promise<{
  error: Error | null;
  settings: OrgSettings;
}> {
  const { data, error } = await supabase()
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), settings: {} };
  const raw = data?.settings;
  return {
    error: null,
    settings: raw && typeof raw === "object" ? (raw as OrgSettings) : {},
  };
}

/**
 * Append (or replace by name) a preset. Read-modify-write on the JSONB bag —
 * last write wins, which is acceptable for an owner-only, low-frequency edit.
 */
export async function saveCustomRolePreset(
  orgId: string,
  preset: { name: string; surfaces: MemberSurfaceMap; platformRole: PlatformTeamRole },
): Promise<{ error: Error | null; presets: CustomRolePreset[] }> {
  const name = preset.name.trim();
  if (!name) return { error: new Error("Preset name is required"), presets: [] };

  const { error: readErr, settings } = await readOrgSettings(orgId);
  if (readErr) return { error: readErr, presets: [] };
  const existing = parseCustomRoles(settings);

  const next: CustomRolePreset = {
    id: uuidv7(),
    name,
    surfaces: preset.surfaces,
    platformRole: preset.platformRole,
    created_at: new Date().toISOString(),
  };
  const merged = [
    ...existing.filter((p) => p.name.toLowerCase() !== name.toLowerCase()),
    next,
  ];

  const { data, error } = await supabase()
    .from("organizations")
    .update({ settings: { ...settings, customRoles: merged } })
    .eq("id", orgId)
    .select("settings")
    .maybeSingle();
  if (error) return { error: new Error(error.message), presets: existing };
  if (!data) {
    return {
      error: new Error(
        "Could not save the preset. Only the workspace owner or an admin can do this.",
      ),
      presets: existing,
    };
  }
  return { error: null, presets: parseCustomRoles(data.settings) };
}

export async function deleteCustomRolePreset(
  orgId: string,
  presetId: string,
): Promise<{ error: Error | null; presets: CustomRolePreset[] }> {
  const { error: readErr, settings } = await readOrgSettings(orgId);
  if (readErr) return { error: readErr, presets: [] };
  const existing = parseCustomRoles(settings);
  const merged = existing.filter((p) => p.id !== presetId);

  const { data, error } = await supabase()
    .from("organizations")
    .update({ settings: { ...settings, customRoles: merged } })
    .eq("id", orgId)
    .select("settings")
    .maybeSingle();
  if (error) return { error: new Error(error.message), presets: existing };
  return { error: null, presets: parseCustomRoles(data?.settings) };
}

export async function getGroundOpsDocUploadEnabled(orgId: string): Promise<boolean> {
  const { error, settings } = await readOrgSettings(orgId);
  if (error) return false;
  return settings.groundOpsDocUploadEnabled === true;
}

export async function setGroundOpsDocUploadEnabled(
  orgId: string,
  enabled: boolean,
): Promise<{ error: Error | null }> {
  const { error: readErr, settings } = await readOrgSettings(orgId);
  if (readErr) return { error: readErr };

  const { error } = await supabase()
    .from("organizations")
    .update({ settings: { ...settings, groundOpsDocUploadEnabled: enabled } })
    .eq("id", orgId)
    .select("settings")
    .maybeSingle();
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
