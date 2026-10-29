# nihas V1.0.19 — Type errors cleared in e-LR and invoicing (typecheck 144 → 99)

## What broke / root cause
- `lib/database.types.ts` had duplicate fields from a bad merge (e.g. `primary_region`). Regenerated from the prod public schema. Note: the Supabase client is created without the `Database` type, so query results are loosely typed and the regen alone only cleared 4 errors.
- e-LR prefill: the read helper inferred every row as `null`, so all 21 field reads type-checked as `never` (no runtime checks on the shape).
- Invoice editor (SourceInvoiceEditorScreen) saved `createdBy: user?.id`; the auth user has `uid`, not `id`, so invoices saved from that screen never recorded who created them.
- Manual invoice: a client with no trips has no list label, so the draft could be saved with a blank client name; contact person and phone were dropped from the manual invoice client block.
- Saved e-LR drafts restored any text into choice fields (GST choice, weight unit, source document type).

## What
- Regenerated database types (prod, public schema).
- e-LR prefill helper keeps the row type. e-LR draft restore accepts only valid choices (else empty). Small type-only fixes in the e-LR form and completion message.
- Invoice editor records `createdBy` from `user.uid`.
- Manual invoice: client name falls back to the client's saved name; saving is blocked (existing "Select a client" alert) if there is still no name. Contact person and phone now come from the client record.
- Typed filters instead of `.filter(Boolean)` for selected invoice trips; Create Invoice button no longer passes the click event as options.
- `.github/ci-baseline.json` typecheck 144 → 99.

## Areas
- lib/database.types.ts, features/trips/services/{elrPrefill.service,elrCompletion.util,elrDraft.storage}.ts, features/trips/components/trip-detail/ElrCompletionForm.tsx, features/invoicing/{InvoicingExecuteScreen.tsx,screens/SourceInvoiceEditorScreen.tsx,utils/manualInvoice.util.ts}.

## Migrations
- None.

## Tested
- Full Jest (4615 passed), navigation-policy, ci-baseline typecheck 99 / lint 146 / cycles 92 / lib-files 179 in a clean worktree, git diff --check. New Jest case for invalid draft choices. Not clicked through: e-LR prefill, manual invoice, invoice editor save on preprod.
