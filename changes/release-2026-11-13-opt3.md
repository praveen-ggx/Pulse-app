# Release 2026-11-13 — Option 3 (rollback state kept)

Per Vasanth 2026-11-13: keep his rolled-back #100/#105/#106/#107 out of production.
Replaces `release/2026-11-13` (75ea3823) for prod. That branch is not deleted.

## Starting point
- Live: gogopulse.com bundle = Vasanth #103 `afc74f58` (checked 13 Nov 11:09 IST).
- Branch = `vasanth/V1.0.1` `4e2003c8` + merge `origin/V1` `23bf75a9`, then:
  - revert Vasanth #107 (pg errors) `4e2003c8`
  - revert Vasanth #106 (pg snapshot) `18f0c590`
  - revert Vasanth #100 (hub/invoice/POD paging) `7e5f1c79`
- Vasanth #105 is database-only (migration + contract test + regression SQL). Files kept so it can be tested on
  preprod; its migration `20271111143000` is NOT in the prod set, so nothing of #105 reaches prod.
- Every file the reverts touched equals `afc74f58` again, except `features/trips/screens/TripsScreen.tsx`,
  where the remaining diff is only Gowtham #101 (Trip Ops Excel + KM). No #100 identifiers remain.

## In this release (V1 PRs)
- #101, #105 Gowtham V1.0.38: Trip Ops All Trips Excel + KM; every Indian DL layout in Add Driver.
- #102 Praveen V1.0.37: In Transit dates use the Pickup chosen after revoke.
- #106 Vasanth V1.0.21: Hub metric counter (trigger created disabled).
- #107, #109 Nihas V1.0.46/47: Compliance vehicle vault by plate; empty-vault vehicles.
- #110 Nihas V1.0.48: preprod-only set (bookkeeping).
- #111 Nihas V1.0.49: Advance Verification export filter.
- #113 Nihas V1.0.50: shared indent ID for shipper + awarded supplier.

## Not included
- Vasanth #100, #106, #107 (reverted), #105 migration (not in set).
- V1 #104 Vasanth V1.0.20 (stop 23505 logging): **effectively excluded**. It is the same code as Vasanth repo #107,
  so the #107 revert removes it too; its 3 code files equal live `afc74f58` on this branch.
  (Correction 2026-11-13: an earlier version of these notes listed #104 as included.)
- #112 lane offers (normal V1 → preprod → acceptance → prod path; set updated on `nihas/lane-offers-pool-dep`).
- Gowtham #57, #63.

## Migrations (4) — set `prod-2026-11-13-release`
None in prod history (read-only check 13 Nov).
1. `20261112061609` compliance vehicle vault by plate. On preprod.
2. `20261112144350` indent reference for viewer. On preprod.
3. `20261112150640` indent references for viewer (batch). On preprod.
4. `20271111164000` Hub metric counter. On preprod, but `zzz_hub_project` is enabled there outside any recorded
   migration statement. Needs Vasanth GO after the explanation.

The branch also deletes `20271014184500_entity_bank_accounts_beneficiary_branch.sql`, a redundant second file at
version `20271014184500`. That version stays excluded from every database; the
`20271014184500_godrej_dco_payable_classification.sql` file is unchanged.

## Tested
- Release-set Jest tests (4 files, 17 tests).
- Typecheck: 346 errors, equal to `.github/ci-baseline.json` (346), so the gate passes. Prod `V1.0.1` `4e2003c8`
  has 345. The one extra is `ComplianceTripActivityLog.tsx` selecting `vehicle_number, driver_name` from
  `transactions` (columns that don't exist): the #107 revert restores that file to live `afc74f58`, so prod
  behaviour is unchanged. (Correction 2026-11-13: an earlier version of these notes said the actual count was 345.)
- Full Jest: 5,639 passed; 4 suites timed out in the full parallel run and pass when run alone (52/52).

## Not tested
- Prod dry-run. UI click-through of the reverted state.
