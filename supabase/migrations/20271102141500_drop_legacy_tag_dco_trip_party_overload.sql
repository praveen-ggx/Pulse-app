SET LOCAL lock_timeout = '5s';

-- Forward-only. The original 20271101222100 (first commit, bb373be4) created
-- tag_dco_trip_party(uuid, uuid) without the trip operating_mode / Self-workspace
-- checks. Its later in-place edit drops that overload, and 370fc2fa appended the same
-- DROP to 20271102134500 — but an environment that already applied either file in an
-- earlier form never re-runs it, so the unchecked overload can survive next to the
-- 3-arg replacement. A 2-arg named-argument RPC call would resolve to it.
-- Idempotent: a no-op where the overload is already gone or never existed.

DROP FUNCTION IF EXISTS public.tag_dco_trip_party(uuid, uuid);
