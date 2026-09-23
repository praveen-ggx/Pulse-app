-- Phase 7B corrective migration — migration-ordering repair, not a feature
-- change. `20260901103540_block_cross_org_invites.sql` references the
-- implicit composite row type of `public.organization_team_invites` (as a
-- function RETURNS type and a variable declaration) and calls
-- `public.normalize_phone_canon()`, but both are first created by
-- `20261107010000_organization_team_phone_invites.sql` — over two months
-- later by file timestamp. On a from-scratch replay this fails immediately
-- with SQLSTATE 42P13 ("cannot change return type of existing function" is
-- the wrong error text for this one — the actual error here is "type
-- public.organization_team_invites does not exist", 42P13/42704 family: a
-- RETURNS clause must resolve its type at CREATE FUNCTION time). On the real
-- remote databases (production, pre-prod) this was never a problem — both
-- migrations are already recorded as applied and the table already exists —
-- so this is purely a from-scratch-replay ordering defect, not a live-data
-- or live-schema issue.
--
-- This migration establishes ONLY the exact prerequisites
-- `20260901103540` needs, verbatim from the canonical November definition
-- (20261107010000), so November's own `CREATE TABLE IF NOT EXISTS` /
-- `CREATE OR REPLACE FUNCTION` statements remain no-ops here and stay the
-- sole owner of: secondary (non-unique) indexes, COMMENT, RLS enablement,
-- RLS policies, GRANTs, the realtime-publication registration, and every
-- other function in that file (claim_pending_team_invites,
-- get_org_team_pending_invites, cancel_team_invite_pending,
-- get_user_profile_by_phone, get_my_team_invites, accept_team_invite,
-- reject_team_invite, handle_new_user, and November's own
-- create_team_invite_pending — which CREATE OR REPLACEs over whatever
-- version 20260901103540 creates first, exactly as it already does on the
-- real remote databases).
--
-- Two prerequisites, not one: `idx_org_team_invites_pending_phone` (the
-- UNIQUE partial index on (organization_id, invitee_phone_canon) WHERE
-- status = 'pending') is NOT a secondary/performance index here — it is a
-- hard functional requirement, because 20260901103540's
-- create_team_invite_pending does
-- `INSERT ... ON CONFLICT (organization_id, invitee_phone_canon)
--  WHERE status = 'pending' DO UPDATE ...`, and Postgres requires a
-- matching unique index/constraint to resolve that ON CONFLICT target.
-- Without it, replay would proceed past today's failure only to hit a new
-- one: "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". `idx_org_team_invites_org_status` (the plain non-unique
-- index) has no such requirement and is correctly left to November.
--
-- Table definition (all columns, PK, FK, defaults, CHECK) copied verbatim
-- from 20261107010000 lines 25-41 — not simplified, not reduced to only the
-- columns 20260901103540 touches, per explicit instruction to derive from
-- the canonical definition rather than invent one.

CREATE TABLE IF NOT EXISTS public.organization_team_invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invited_by          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_name        text NOT NULL,
  invitee_phone       text NOT NULL,
  invitee_phone_canon text NOT NULL,
  invitee_email       text,
  role                text NOT NULL,
  permissions         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  accepted_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

-- Required for 20260901103540's INSERT ... ON CONFLICT (...) WHERE
-- status = 'pending' to resolve at all (see note above) — copied verbatim
-- from 20261107010000 line 43-45, same name, so November's own
-- `CREATE UNIQUE INDEX IF NOT EXISTS` is a no-op once this has run.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_team_invites_pending_phone
  ON public.organization_team_invites (organization_id, invitee_phone_canon)
  WHERE status = 'pending';

-- Called inside 20260901103540's precheck_team_invite_contact body — not
-- resolved until first execution, but establishing it here keeps this
-- migration's prerequisite set complete and matches the canonical
-- definition exactly (20261107010000 lines 6-18).
CREATE OR REPLACE FUNCTION public.normalize_phone_canon(p_phone text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
AS $$
  SELECT CASE
    WHEN length(d) >= 12 AND left(d, 2) = '91' THEN right(d, 10)
    WHEN length(d) >= 10 THEN right(d, 10)
    ELSE d
  END
  FROM (SELECT regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') AS d) s
  WHERE coalesce(p_phone, '') <> '';
$$;
