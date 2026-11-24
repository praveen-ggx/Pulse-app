const mockIn = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ from: () => ({ select: () => ({ in: (...a: unknown[]) => mockIn(...a) }) }) }),
}));
jest.mock("@/features/organization/services/members.service", () => ({ getOrganizationMembersShared: jest.fn() }));

import { fetchActivityUserProfiles } from "../hydrateTripActivityActors.util";

const A = "860a2a68-dbda-4aed-a6db-cb5833c8c1f1";

describe("fetchActivityUserProfiles", () => {
  beforeEach(() => mockIn.mockReset().mockResolvedValue({ data: [], error: null }));

  it("never sends a name to profiles.id IN (...)", async () => {
    await fetchActivityUserProfiles(["Rithwik Anand", A, "Mohamed Asik Hussain"]);
    expect(mockIn).toHaveBeenCalledWith("id", [A]);
  });

  it("skips the query when there is no UUID at all", async () => {
    await fetchActivityUserProfiles(["Rithwik Anand"]);
    expect(mockIn).not.toHaveBeenCalled();
  });
});
