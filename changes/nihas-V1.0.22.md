# nihas V1.0.22 — List reads no longer silently stop at 1000 rows (Compliance docs missing); LR duplicate check fails closed

## What broke / root cause
- Prod PostgREST returns at most 1000 rows per request (`max_rows`) with HTTP 206 and no error. The Compliance list read every trip document for all 391 trips in one request: 1445 rows on prod, 1000 returned, so 103 trips showed "No file in this slot yet" / Trip 0/5 (e.g. GOGOVAN TRP001533 / SAT812GOGTRIP001534, reported by Amilthan). Verified 2026-10-27 by replaying the app's own request on prod (read-only).
- Same pattern in reads GOGOVAN (853 trips) is about to cross: vehicle/driver documents on the Compliance list (~998 rows), trip party counts (`.limit(2000)` capped at 1000), org-wide duplicate-LR check, finance commerce trip reads, Bulk Payment document check.
- Duplicate-LR check failed open: if the org index could not be read (trip page error, LR chunk error, trip→org lookup error) it reported "no duplicate" and the LR was saved unchecked.

## What
- `lib/pagination.ts`: `readAllPages` — keyset pagination on the uuid primary key `id` (`gt(id, cursor)` + `order(id)` + `limit`), stops only on an empty page (works even if `max_rows` < page size; costs one extra empty request per read), any page error or non-advancing cursor → error and no rows. `chunkIdsForRead` — 100 ids per `.in()` (≈800 uuids → HTTP 400).
- Keyset + chunked: Compliance trip documents, `getDocumentsForEntities`, `getTripPartyCountsForOrg` (now selects `id` as the cursor), org LR duplicate index, ledger commerce trip reads. Filters / org scope unchanged on every page.
- Concurrency: each page is its own snapshot. Deletes no longer shift later pages; a row inserted before the cursor or updated into/out of the filter mid-read can be missed/included until the next refetch.
- LR duplicate check: write paths (upload LR, update LR number, LR range upsert, e-LR generate) use `checkOrgDuplicateLrNumbersForTrip`, which throws when the index cannot be read completely; the save is refused with "Couldn't check whether this LR number is already used…". Failures are not cached. UI pre-checks / typing hints keep the tolerant `find*` (the service save re-checks). A trip the user cannot see still skips the check (unchanged).
- Bulk Payment validation reuses `fetchTripDocumentsForTrips`: typed E-way numbers and legacy type names (e.g. "Lorry Receipt", "E-Way Bill") now count as on the Compliance list. Eligibility is unchanged (still compliance + finance verification / POD received); only the block reason text for unverified advance rows changes (no more false "E-way Bill missing").
- E-way "On file" with an empty preview is by design (typed numbers, no file) — not changed.

## Areas
- lib/pagination.ts, features/tripCompliance/services (read, bulk payment), features/compliance/services/documents.service.ts, features/trips/services (trips, orgLrDuplicate, orgLrNumber, tripDocuments, tripDocumentLrPod, elrGenerate), features/finance/services/ledgerAggregationRpc.service.ts, tests (+ lib/__tests__/fakePostgrest.ts).

## Migrations
- None.

## Tested
- Fake PostgREST with a 1000-row cap: readAllPages (0…2542 rows, cap 300 < page size, tenant filter on every page, delete/insert between pages, page error, stuck cursor); trip documents (391 trips / 1445 rows); entity documents (1300 rows, other org + replaced excluded); party counts (1500 trips, deleted + other org excluded); LR index (1200 trips, duplicate on #1150); LR write gates fail closed; Bulk Payment typed E-way / legacy types / unchanged eligibility.
- e-LR generate: strict check failure → no PDF, no upload (Jest).
- Localhost against prod, keyset build, read-only with an in-page write guard (no table writes): requests use `limit=500` + `id=gt.` cursor; TRP001533 Trip 4/5 with Memo, LR, E-way, Invoice, RC; party-counts query 855 trips in 3 requests, per-client counts = DB (query level — the Network screen is not reachable with the tester's role); strict LR check refuses when the org index request fails, advisory returns null, control finds AI2880 on another trip; Bulk Payment validation: TRP001087 (typed E-way only) → "Compliance verification not completed", TRP001533 → "Advance not approved yet".
- Not tested: the real LR save against prod (blocked by permission — covered by Jest write-gate tests), finance commerce totals in UI.
- A real HTTP 503 opens the app's shared circuit breaker; LR saves are then refused until it recovers (fail-closed, visible as the "Couldn't check…" message).
- TypeScript (clean worktree, 8 GB heap): HEAD 408 → with changes 406, no new errors. Main checkout shows 584 because of git-ignored Expo types.
- Not changed: finance commerce reads still return empty on error (separate PR).
