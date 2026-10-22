import {
  orgLogoObjectPath,
  pickOrgAvatarStorageRef,
} from "../orgAvatarRef.util";

const ORG_ID = "6447fa19-a9e2-4f20-8ae1-065d5f30c430";
const KEY = `org-logos/${ORG_ID}/org-logo-${ORG_ID}-1788175371238.jpg`;

describe("org S3 / org-assets avatar refs", () => {
  it("accepts the stored org-logos object key", () => {
    expect(orgLogoObjectPath(KEY)).toBe(KEY);
  });

  it("strips an org-assets/ prefix from the stored key", () => {
    expect(orgLogoObjectPath(`org-assets/${KEY}`)).toBe(KEY);
  });

  it("parses s3://org-assets/<key> URIs", () => {
    expect(orgLogoObjectPath(`s3://org-assets/${KEY}`)).toBe(KEY);
  });

  it("parses Supabase public object URLs", () => {
    expect(
      orgLogoObjectPath(
        `https://proj.supabase.co/storage/v1/object/public/org-assets/${KEY}`,
      ),
    ).toBe(KEY);
  });

  it("parses S3 https URLs that embed org-logos/", () => {
    expect(
      orgLogoObjectPath(
        `https://org-assets.s3.ap-south-1.amazonaws.com/${KEY}?X-Amz=1`,
      ),
    ).toBe(KEY);
  });

  it("does not treat private userprofiles paths as org logos", () => {
    expect(orgLogoObjectPath("user-123/avatar.jpg")).toBeNull();
    expect(
      orgLogoObjectPath(
        "https://proj.supabase.co/storage/v1/object/sign/userprofiles/user-123/avatar.jpg?token=x",
      ),
    ).toBeNull();
  });

  it("prefers the S3 logo over an owner profile photo", () => {
    expect(pickOrgAvatarStorageRef(KEY, "owner-1/avatar.jpg")).toBe(KEY);
    expect(pickOrgAvatarStorageRef(null, KEY)).toBe(KEY);
    expect(pickOrgAvatarStorageRef(null, "owner-1/avatar.jpg")).toBe(
      "owner-1/avatar.jpg",
    );
  });
});
