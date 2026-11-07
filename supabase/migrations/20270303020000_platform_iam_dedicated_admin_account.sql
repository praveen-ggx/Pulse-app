-- Support S3a correction — move the Admin Console's bootstrap identity from a personal,
-- Google-linked business account (vasanth.raj@gogox.com) to a dedicated Platform Admin account
-- (platform-admin@gogox.com), so Admin Console identity is never tangled with a personal login
-- or any business-side membership.
--
-- Read-only confirmation before this migration was written: the target auth.users row exists
-- (id 14c33b15-f32a-4ad3-9b0a-45099538b1d1), has a password set, and has no existing
-- platform_users row. super_admin (c55ff363-92a4-491b-b9b9-718c5124c186) already exists and is
-- reused as-is -- no new role or permission.

-- ── 1. Bootstrap the dedicated admin identity ────────────────────────────────────────────────
-- Idempotent: ON CONFLICT DO NOTHING on both inserts, safe to rerun.

INSERT INTO public.platform_users (user_id, status)
SELECT '14c33b15-f32a-4ad3-9b0a-45099538b1d1', 'active'
WHERE EXISTS (
  SELECT 1 FROM auth.users WHERE id = '14c33b15-f32a-4ad3-9b0a-45099538b1d1'
)
ON CONFLICT (user_id) DO NOTHING;

-- granted_by is NULL: this grant was made via a reviewed migration, not an in-app "grant role"
-- action performed by another admin, so there is no actor to attribute it to.
INSERT INTO public.platform_role_members (platform_user_id, role_id, granted_by)
SELECT pu.id, 'c55ff363-92a4-491b-b9b9-718c5124c186'::uuid, NULL
FROM public.platform_users pu
WHERE pu.user_id = '14c33b15-f32a-4ad3-9b0a-45099538b1d1'
ON CONFLICT (platform_user_id, role_id) DO NOTHING;

-- ── 2. Remove the old personal-account bootstrap ─────────────────────────────────────────────
-- Deleting the platform_users row cascades to platform_role_members (ON DELETE CASCADE), so
-- this one statement fully removes vasanth.raj@gogox.com's Admin Console identity and its
-- super_admin grant together. auth.users itself is untouched -- this only removes Platform IAM
-- membership, not the person's ability to authenticate at all (they simply land on "not
-- provisioned" if they ever sign into the console again, same as any other non-admin account).

DELETE FROM public.platform_users
WHERE user_id = 'd288dc4b-0018-41e2-9692-6755d2c6448c';
