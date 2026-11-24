# nihas/V1.0.85

Branched from V1 `c21ae5c8` on 2026-11-24.

## What
- Driver screens: a free-text name in an assigner field (e.g. `status_updated_by` = "Sivakozhunthu") is no longer sent to `profiles.id IN (...)`. Only UUIDs are used; a name is skipped and the next valid id is tried.

## Why
- Prod logs 2026-11-24: 9 × `22P02 invalid input syntax for type uuid: "Sivakozhunthu"` in one second (400 on `/rest/v1/profiles`). One bad id fails the whole list, so every assigner name on that screen load was lost.
