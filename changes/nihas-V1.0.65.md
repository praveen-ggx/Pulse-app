# nihas/V1.0.65

Branched from V1 `d88e9a4e` on 2026-11-21.

## What
- Trip Detail e-way strip (phone and desktop) follows the Ground Ops document lock: when the database would refuse, Upload / Edit / Remove / Add e-way number are hidden and a note says why and who can unlock it ("ask Compliance to put the trip on hold", or "ask Finance to send the trip back" once the advance is approved / paid).
- Each e-way entry keeps its own "On … by …" stamp (saved time and user). Before, every card showed the row's first save, e.g. a 2nd number added today showed "22 Oct · by Mohamed Asik Hussain". Entries saved before this keep the old display until edited.

## Why
- Ashick (18 / 21 Nov): "unable to save multi e-way bill" from Ground Ops. Prod logs 18–20 Nov: `Ground Ops cannot change this document: trip is in transit` / `cannot add another eway_bill file`. The screen offered the buttons; `guard_trip_document_ground_ops` refused. On Compliance Hold / Finance reject Ground Ops can already edit (database rule unchanged).

## Areas
- features/trips/components/trip-detail/TripDetailScreen.tsx (e-way lock + note)
- features/trips/components/trip-detail/EwayBillVaultTab.tsx, TripMobileVaultPanel.tsx, TripVaultCardGrid.tsx (lockedLabel pass-through, entry stamp on save)
- features/trips/services/ewayBillFields.util.ts (entry updatedAt / updatedBy)

## Migrations
- None.

## Tested
- Preprod click-through as Ground Ops (Zahoor): TRP002328 in transit / advance approved shows the note and no edit buttons; TRP001333 (declined by finance) adds a 3rd e-way number, card shows its own time and "Zahoor", other cards unchanged.
- Jest: features/trips, features/tripCompliance (239 suites); new ewayBillFields per-entry stamp tests. lint 98/98; typecheck 322 (≤ 344; the drop is from the fresh worktree install, baseline left as is).

## Not tested
- Phone-width layout click-through; non–Ground Ops user on a locked trip (code path unchanged: lock applies to Ground Ops only).
