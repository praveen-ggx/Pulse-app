import { orgLogoStoragePath } from "@/features/organization/utils/orgLogoStorage.util";

describe("orgLogoStoragePath", () => {
  it("writes into the signed-in user's avatar folder", () => {
    const orgId = "11111111-2222-3333-4444-555555555555";
    const userId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const path = orgLogoStoragePath(orgId, userId, 1700000000000);
    expect(path).toBe(`${userId}/org-logo-${orgId}-1700000000000.jpg`);
    expect(path.split("/")[0]).toBe(userId);
  });
});
