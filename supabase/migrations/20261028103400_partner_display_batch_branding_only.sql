SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.get_connection_partner_display_batch(p_linked_organization_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '4s'
AS $function$
  WITH wanted AS (
    SELECT DISTINCT id
    FROM unnest(p_linked_organization_ids) AS u(id)
    WHERE id IS NOT NULL
    LIMIT 24
  )
  SELECT coalesce(
    jsonb_object_agg(
      o.id::text,
      jsonb_build_object(
        'organizationName', o.name,
        'contactPerson',    p.full_name,
        'phone',            p.phone,
        'email',            p.email,
        'logoUrl',          NULLIF(TRIM(o.logo_url), ''),
        'ownerAvatarUrl',   NULLIF(TRIM(p.avatar_url), ''),
        'orgAvatarSeed',    NULLIF(TRIM(p.avatar_seed), ''),
        'avatarUrl',        COALESCE(NULLIF(TRIM(o.logo_url), ''), p.avatar_url),
        'avatarSeed',       NULLIF(TRIM(p.avatar_seed), ''),
        'ownerId',          o.owner_id,
        'orgCreatedAt',     o.created_at,
        'ownerSignedUpAt',  p.created_at,
        'tripCount',        NULL,
        'averageRating',    NULL,
        'ratingCount',      NULL,
        'verificationStatus', o.verification_status::text,
        'vehicleCount',     NULL,
        'networkIndentCount', NULL
      )
    ),
    '{}'::jsonb
  )
  FROM public.organizations o
  JOIN public.profiles p ON p.id = o.owner_id
  JOIN wanted w ON w.id = o.id;
$function$;

COMMENT ON FUNCTION public.get_connection_partner_display_batch(uuid[]) IS
  'Batch partner branding JSON keyed by org id. Stats are omitted so the 4s timeout is not spent counting trips under hub load.';

REVOKE ALL ON FUNCTION public.get_connection_partner_display_batch(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_connection_partner_display_batch(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_connection_partner_display_batch(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
