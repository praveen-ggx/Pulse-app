-- Prerequisite for 20261112144350 on a clean replay.
--
-- indent_reference_for_viewer is a SQL function, so PostgreSQL checks
-- indents.award_revoked_at when the function is created. The column is added
-- in 20270925214500, which sorts later. That later file uses
-- ADD COLUMN IF NOT EXISTS and still owns the comment, the clear-on-award
-- trigger, and revoke_indent_award. This file only adds the nullable column.
-- An environment that already has it is unchanged.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.indents
  ADD COLUMN IF NOT EXISTS award_revoked_at timestamptz;
