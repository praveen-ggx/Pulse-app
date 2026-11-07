-- Support S3a — bootstrap the first Admin Console / Platform IAM identity.
--
-- Grants vasanth.raj@gogox.com (auth.users.id d288dc4b-0018-41e2-9692-6755d2c6448c) the existing
-- super_admin role (id c55ff363-92a4-491b-b9b9-718c5124c186), so the Admin Console's new
-- login/session gate (analytics/, S3a) has a real platform identity to resolve against.
--
-- Reuses the catalogue seeded in 20261224000000_platform_iam.sql exactly as-is — no new role,
-- no new permission. Read-only confirmation before this migration was written: the target
-- auth.users row exists, has no existing platform_users row, and super_admin already exists
-- (see docs/SUPPORT_S3A_IMPLEMENTATION_PLAN.md).
--
-- Idempotent: ON CONFLICT DO NOTHING on both inserts (unique on platform_users.user_id; composite
-- PK on platform_role_members(platform_user_id, role_id)) — rerunning this migration cannot create
-- a second identity or a duplicate role grant for this person.

INSERT INTO public.platform_users (user_id, status)
SELECT 'd288dc4b-0018-41e2-9692-6755d2c6448c', 'active'
WHERE EXISTS (
  SELECT 1 FROM auth.users WHERE id = 'd288dc4b-0018-41e2-9692-6755d2c6448c'
)
ON CONFLICT (user_id) DO NOTHING;

-- granted_by is NULL: this grant was made via a reviewed migration, not an in-app "grant role"
-- action performed by another admin, so there is no actor to attribute it to.
INSERT INTO public.platform_role_members (platform_user_id, role_id, granted_by)
SELECT pu.id, 'c55ff363-92a4-491b-b9b9-718c5124c186'::uuid, NULL
FROM public.platform_users pu
WHERE pu.user_id = 'd288dc4b-0018-41e2-9692-6755d2c6448c'
ON CONFLICT (platform_user_id, role_id) DO NOTHING;
