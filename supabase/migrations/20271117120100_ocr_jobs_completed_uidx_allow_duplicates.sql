-- Re-scanning the same photo failed with:
--   duplicate key value violates unique constraint "ocr_jobs_fingerprint_engine_completed_uidx"
--
-- The index allows one completed row per (photo fingerprint, engine version).
-- The app intentionally inserts a completed *copy* (is_duplicate = true) when
-- the same photo is attached to another document, and that copy always hit
-- the index. Duplicates point at their source row and must not take the slot.
--
-- Safe: only widens what is allowed; the original single-source rule is kept.

DROP INDEX IF EXISTS public.ocr_jobs_fingerprint_engine_completed_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS ocr_jobs_fingerprint_engine_completed_uidx
  ON public.ocr_jobs (document_fingerprint, engine_version)
  WHERE status = 'completed' AND NOT force_rescan AND NOT is_duplicate;
