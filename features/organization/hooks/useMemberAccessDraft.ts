/**
 * Editable member-access draft (role preset + surfaces + manager flag).
 * Shared by Invite and Edit member so both screens apply toggles identically.
 */
import type { CustomRolePreset } from "@/features/organization/services/organization.service";
import {
  domainsFromMember,
  platformRoleAfterAccessEdit,
  platformRoleFromMember,
  surfacesFromMember,
  type FunctionalRole,
  type MemberDomainFlags,
  type PlatformTeamRole,
  type TeamInvitePermissions,
} from "@/features/organization/utils/teamInviteRoles.util";
import type { Capability } from "@/lib/capabilities";
import {
  applyDomainToggle,
  applySectionToggle,
  applySurfaceToggle,
  defaultSurfacesForRole,
  domainsFromSurfaces,
  hydrateMemberSurfaces,
  MEMBER_SURFACE_CATALOG,
  type MemberSectionKey,
  type MemberSurfaceId,
  type MemberSurfaceMap,
} from "@/lib/memberSurfaces";
import type { OrgMember } from "@/types/organization";
import { useCallback, useMemo, useState } from "react";

export type MemberAccessSnapshot = {
  platformRole: PlatformTeamRole;
  domains: MemberDomainFlags;
  surfaces: MemberSurfaceMap;
  isDepartmentManager: boolean;
  /** Ground Ops only: warehouses whose trips this member sees. */
  warehouseIds: string[];
};

/** Default draft for a role preset (Invite starts here). */
export function accessSnapshotFromRole(
  role: PlatformTeamRole,
  orgCaps: Capability[],
): MemberAccessSnapshot {
  const surfaces = defaultSurfacesForRole(role, orgCaps);
  return {
    platformRole: role,
    domains: domainsFromSurfaces(surfaces),
    surfaces,
    isDepartmentManager: false,
    warehouseIds: [],
  };
}

/** Draft for an existing member row (Edit starts here). Warehouses load separately. */
export function accessSnapshotFromMember(
  member: Pick<OrgMember, "role" | "permissions">,
  orgCaps: Capability[],
  warehouseIds: string[] = [],
): MemberAccessSnapshot {
  return {
    platformRole: platformRoleFromMember(member) ?? "tripops",
    domains: domainsFromMember(member),
    surfaces: surfacesFromMember(member, orgCaps),
    isDepartmentManager:
      (member.permissions as TeamInvitePermissions | null | undefined)
        ?.isDepartmentManager === true,
    warehouseIds,
  };
}

function surfacesEqual(a: MemberSurfaceMap, b: MemberSurfaceMap): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const id = k as MemberSurfaceId;
    if (!!a[id] !== !!b[id]) return false;
  }
  return true;
}

export function accessSnapshotsEqual(
  a: MemberAccessSnapshot,
  b: MemberAccessSnapshot,
): boolean {
  return (
    a.platformRole === b.platformRole &&
    a.domains.finance === b.domains.finance &&
    a.domains.sales === b.domains.sales &&
    a.domains.tripops === b.domains.tripops &&
    a.isDepartmentManager === b.isDepartmentManager &&
    a.warehouseIds.length === b.warehouseIds.length &&
    a.warehouseIds.every((id) => b.warehouseIds.includes(id)) &&
    surfacesEqual(a.surfaces, b.surfaces)
  );
}

type DraftState = MemberAccessSnapshot & { appliedPresetId: string | null };

/** Re-derive domain flags + role label after a surface-level edit. */
function withSurfaces(
  prev: DraftState,
  surfaces: MemberSurfaceMap,
  orgCaps: Capability[],
  relabel: boolean,
): DraftState {
  const domains = domainsFromSurfaces(surfaces);
  return {
    ...prev,
    surfaces,
    domains,
    platformRole: relabel
      ? platformRoleAfterAccessEdit(prev.platformRole, domains, surfaces, orgCaps)
      : prev.platformRole,
    appliedPresetId: null,
  };
}

export type MemberAccessDraft = ReturnType<typeof useMemberAccessDraft>;

export function useMemberAccessDraft(
  initial: MemberAccessSnapshot,
  orgCaps: Capability[],
) {
  const [state, setState] = useState<DraftState>({
    ...initial,
    appliedPresetId: null,
  });

  const reset = useCallback((next: MemberAccessSnapshot) => {
    setState({ ...next, appliedPresetId: null });
  }, []);

  const selectRole = useCallback(
    (role: PlatformTeamRole) => {
      setState((prev) => ({
        ...accessSnapshotFromRole(role, orgCaps),
        isDepartmentManager: prev.isDepartmentManager,
        warehouseIds: prev.warehouseIds,
        appliedPresetId: null,
      }));
    },
    [orgCaps],
  );

  const applyPreset = useCallback(
    (preset: CustomRolePreset) => {
      // Re-intersect with the org's current capabilities — a preset saved under
      // a richer operating model must not re-grant surfaces the org lost.
      const surfaces = hydrateMemberSurfaces({ ...preset.surfaces }, orgCaps);
      const domains = domainsFromSurfaces(surfaces);
      setState((prev) => ({
        ...prev,
        surfaces,
        domains,
        platformRole: platformRoleAfterAccessEdit(
          preset.platformRole,
          domains,
          surfaces,
          orgCaps,
        ),
        appliedPresetId: preset.id,
      }));
    },
    [orgCaps],
  );

  const toggleDomain = useCallback(
    (key: FunctionalRole, next: boolean) => {
      // Turning a domain off can't leave an admin labelled as such; zero
      // domains degrades to `restricted`, not a silent tripops grant.
      setState((prev) =>
        withSurfaces(prev, applyDomainToggle(prev.surfaces, key, next, orgCaps), orgCaps, !next),
      );
    },
    [orgCaps],
  );

  const toggleSurface = useCallback(
    (id: MemberSurfaceId, next: boolean) => {
      setState((prev) =>
        withSurfaces(prev, applySurfaceToggle(prev.surfaces, id, next, orgCaps), orgCaps, true),
      );
    },
    [orgCaps],
  );

  /** Sections span domains, so domains + label are re-derived from the result. */
  const toggleSection = useCallback(
    (section: MemberSectionKey, next: boolean) => {
      setState((prev) =>
        withSurfaces(prev, applySectionToggle(prev.surfaces, section, next, orgCaps), orgCaps, true),
      );
    },
    [orgCaps],
  );

  const setIsDepartmentManager = useCallback((next: boolean) => {
    setState((prev) => ({ ...prev, isDepartmentManager: next }));
  }, []);

  const toggleWarehouse = useCallback((id: string, next: boolean) => {
    setState((prev) => ({
      ...prev,
      warehouseIds: next
        ? Array.from(new Set([...prev.warehouseIds, id]))
        : prev.warehouseIds.filter((w) => w !== id),
    }));
  }, []);

  const enabledSurfaceCount = useMemo(
    () => MEMBER_SURFACE_CATALOG.filter((s) => state.surfaces[s.id] === true).length,
    [state.surfaces],
  );

  const snapshot = useMemo<MemberAccessSnapshot>(
    () => ({
      platformRole: state.platformRole,
      domains: state.domains,
      surfaces: state.surfaces,
      isDepartmentManager: state.isDepartmentManager,
      warehouseIds: state.warehouseIds,
    }),
    [
      state.platformRole,
      state.domains,
      state.surfaces,
      state.isDepartmentManager,
      state.warehouseIds,
    ],
  );

  return {
    ...snapshot,
    snapshot,
    appliedPresetId: state.appliedPresetId,
    enabledSurfaceCount,
    reset,
    selectRole,
    applyPreset,
    toggleDomain,
    toggleSurface,
    toggleSection,
    setIsDepartmentManager,
    toggleWarehouse,
  };
}
