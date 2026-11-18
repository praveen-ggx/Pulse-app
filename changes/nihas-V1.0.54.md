# nihas/V1.0.54

Branched from V1 `f43d7d1c` on 2026-11-18 (right after the prod sync, PR #125).

## What
- Supabase build guard: a Netlify production build on the site whose `SITE_NAME` is exactly `gx-pulse` is locked to preprod. Every other site name, including an unset one, stays locked to production as before.
- The guard prints one line per Netlify build (context, `SITE_NAME`, chosen project), and its refusal messages now include the `SITE_NAME` it saw.

## Why
- PR #125 brought prod's `scripts/supabaseProject.cjs`, which treats any Netlify production context as production Supabase. gx-pulse builds V1 in its production context but points at preprod, so every gx-pulse build since #125 fails ("Supabase target is production but … is preprod") and the site is stuck on `83d800a2`.
- Preprod already has `20271118094500`, so the old gx-pulse bundle's finance approval (3-argument `mark_trip_finance_verified`) is refused until a new build ships.

## Areas
- scripts/supabaseProject.cjs
- scripts/__tests__/supabaseProject.test.ts

## Migrations
- None

## Tested
- `npx jest scripts/__tests__`: 24 passed (12 existing unchanged, 12 new: gx-pulse to preprod, gx-pulse refuses an explicit production target, pulse-gx / gogopulse / unknown / unset names stay production, near-miss names such as `GX-PULSE`, `gx-pulse ` and `my-gx-pulse` cannot reach preprod even with `PULSE_SUPABASE_TARGET=preprod`, deploy previews unchanged).
- `loadSupabaseProject` simulated for both deploy configurations in throwaway directories.

## Not tested
- A real Netlify build. `SITE_NAME` is Netlify's documented site name (the `*.netlify.app` subdomain), so gx-pulse should be `gx-pulse`, but I could not read the site record. The first gx-pulse build log will show the value; if it differs, the build fails safely with the name in the message.
