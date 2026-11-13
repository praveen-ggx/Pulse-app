# vasanth hotfix 2026-11-14: Compliance and chat first paint

## What
- Compliance paints the first 40 trips as soon as their documents are read, then loads the rest of the queue without hiding the list. Document batches run four at a time.
- Chat shows the inbox as soon as bootstrap returns. Shipper organization names load afterwards, in batches of 40, instead of holding the "Loading chat…" spinner.

## Why
- A 540-trip Compliance queue waited on every trip's documents, fetched one batch after another, before any card appeared.
- `indent_creator_org_names_for_viewer` was called with every trip number at once and statement-timed out, so chat stayed on the spinner after the inbox payload was already available.

## Areas
- `features/tripCompliance/hooks/useComplianceTripsQuery.ts`
- `features/tripCompliance/services/tripComplianceRead.service.ts`
- `features/chat/services/chat.service.ts`
- `features/chat/store/useChatStore.ts`

## Migrations
- None.

## Tested
- `npx jest` compliance pipeline suites: 28 passed.
- Not clicked through.
