/**
 * Invite and Edit member must store identical access for the same toggles:
 * both go through buildMemberPermissions (Edit save, invite RPCs).
 */
import {
  createPendingTeamInvite,
  inviteTeamMember,
} from "../services/members.service";
import { accessSnapshotFromRole } from "../hooks/useMemberAccessDraft";
import { buildMemberPermissions } from "../utils/teamInviteRoles.util";
import { getCapabilitiesFromProfile } from "@/lib/capabilities";
import { applySurfaceToggle } from "@/lib/memberSurfaces";

const mockRpc = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    rpc: mockRpc,
    from: () => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () =>
          Promise.resolve({ data: { operating_model: "HYBRID" }, error: null }),
      };
      return builder;
    },
  }),
}));

const HYBRID = getCapabilitiesFromProfile({ role: "user" }, "HYBRID");

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: {}, error: null });
});

/** A role preset narrowed by hand, as an owner would in the editor. */
function editedFinanceAccess() {
  const base = accessSnapshotFromRole("finance", HYBRID);
  return {
    platformRole: base.platformRole,
    surfaces: applySurfaceToggle(
      base.surfaces,
      "trip_compliance.tab.final_settlement",
      false,
      HYBRID,
    ),
    isDepartmentManager: true,
  };
}

describe("member access parity — Invite vs Edit", () => {
  it("existing-user invite stores exactly what Edit member would save", async () => {
    const edited = editedFinanceAccess();
    await inviteTeamMember("org-1", "user-1", edited.platformRole, {
      surfaces: edited.surfaces,
      isDepartmentManager: edited.isDepartmentManager,
    });

    const sent = mockRpc.mock.calls[0][1].p_permissions;
    expect(sent).toEqual(buildMemberPermissions({ ...edited, orgCaps: HYBRID }));
    expect(sent.surfaces["trip_compliance.tab.final_settlement"]).toBe(false);
    expect(sent.isDepartmentManager).toBe(true);
  });

  it("pending (no account yet) invite stores the same shape", async () => {
    const edited = editedFinanceAccess();
    await createPendingTeamInvite("org-1", {
      phone: "9876543210",
      name: "Test",
      platformRole: edited.platformRole,
      access: { surfaces: edited.surfaces, isDepartmentManager: true },
    });

    expect(mockRpc.mock.calls[0][0]).toBe("create_team_invite_pending");
    expect(mockRpc.mock.calls[0][1].p_permissions).toEqual(
      buildMemberPermissions({ ...edited, orgCaps: HYBRID }),
    );
  });

  it("drops the Department manager flag on roles that can't hold it", () => {
    const admin = accessSnapshotFromRole("admin", HYBRID);
    expect(
      buildMemberPermissions({
        platformRole: "admin",
        surfaces: admin.surfaces,
        isDepartmentManager: true,
        orgCaps: HYBRID,
      }).isDepartmentManager,
    ).toBe(false);
  });

  it("vendor support preset saves Finance → Suppliers only", () => {
    const vs = accessSnapshotFromRole("vendor_support", HYBRID);
    const built = buildMemberPermissions({
      platformRole: "vendor_support",
      surfaces: vs.surfaces,
      orgCaps: HYBRID,
    });
    expect(built.platformRole).toBe("vendor_support");
    expect(built.surfaces?.["finance.subtab.suppliers"]).toBe(true);
    expect(built.surfaces?.["finance.subtab.cash"]).toBeFalsy();
  });
});
