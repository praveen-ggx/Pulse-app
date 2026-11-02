# vasanth DCO Self party tag / AR

## What
- Offline DCO trips can tag a Self party and set a middleman receivable in the existing tag flow.
- Tagged billed amount updates AR; marketplace stays shipper-only.
- Expense receipts match payment receipts and include View trip.
- Trip history cards show Offline / Marketplace / Fleet and a three-column Assigned / Bill to / Yield footer.
- Earnings header spacing tightened.

## Why
DCO Self needs bill-to and receivable tracking without treating assigned-by as the commercial party.

## Areas
- `features/drivers/**` Self, earnings, history, tag/collect, receipts
- `components/driver/TripListAssignerRow.tsx`, `components/ledger/LedgerEntryReceiptCard.tsx`
- `components/mobile-input/FullscreenNumericEntry.tsx`, `PartyAvatar`
- `app/(driver)/add-client.tsx`, `capture-payment`, `receivable`
- `supabase/migrations/20271101154500_*`, `20271101184600_*`, `20271101222100_*`

## Migrations
- `20271101154500_ensure_dco_workspace.sql`
- `20271101184600_ensure_dco_workspace_qualify_returning_id.sql`
- `20271101222100_tag_dco_trip_party.sql`
- Not applied to production. Schema before code — apply these before shipping this commit to gogopulse.com.

## Tested
- Unit: DCO tag notes, receivables billed override, history lane labels
- UI clicked on preprod worktree / local web for tag, receivable keypad, receipts, history footer
- Production deploy not done from this commit
