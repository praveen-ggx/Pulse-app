# nihas V1.0.14 — "Individual" business type for KYC (single truck owners)

## What broke / root cause
- A single truck owner picked Sole proprietorship with no GST and was then asked for Udyam or IEC, which an individual usually doesn't have, so they could not finish verification. There was no business type for an individual.

## What
- New business type "Individual" (signup and the verification wizard). It asks only for PAN card, Aadhaar card and address proof. The GST question is hidden and GST is never required.
- Aadhaar is a new upload type. It is stored for manual review and is not sent to OCR.
- Server submit check and admin-approve completeness check use the same rule. The admin console shows "Individual" and an Aadhaar slot.

## Areas
- features/organization (KYC rules, verify wizard, upload), features/auth/signup, analytics KYC matrix, docs/KYC_REQUIREMENT_POLICY.md.

## Migrations
- 20261022123845_individual_registration_type.sql: adds enum value `individual`, upload type `aadhaar_card` (enum + doc_type check), and re-creates submit_business_verification (6-arg) and kyc_missing_required_documents with only the individual branch added. Live bodies on prod and preprod were identical before the change (md5 checked).

## Tested
- Branched from V1 d11310e3.
- Migration applied cleanly to a throwaway local Postgres 15 with stub tables: individual without Aadhaar is blocked ("Aadhaar card must be uploaded"), with PAN + Aadhaar + address proof it submits (MCA pillar NOT_STARTED). Proprietorship without GST still needs Udyam/IEC; with GST still needs the GST certificate.
- New unit tests for individual rules (Pulse + admin matrix) pass. Full jest: 533 suites passed, 4182 tests passed.
- lint 102 (≤104), typecheck 61 (≤89, no errors in touched files), cycles 111, lib-files 178. git diff --check clean. db:preflight: new file non-empty and pending.

## Not tested
- Not clicked through in the app or admin console. Not applied to preprod yet.

## Also in this round: driving licence formats
- What broke: Add driver rejected real Telangana/AP licences, the smart card `DLFAP12810371208` and the old slash format `1043/HW/1997OD`. The party driver form only offered "Standard" and "Letter after RTO" and dropped characters that didn't fit, so these couldn't even be typed.
- What: the licence check accepts both formats. The party driver form (keypad + desktop) has a third option, "Old / smart card": slashes are added automatically, and ABC/123 switches the keypad. Existing formats are unchanged.
- Format picker is now one compact segmented row (Standard / RTO letter / Old card) instead of tall two-line chips; the example shows as the field placeholder. Same picker is used for vehicle number formats.
- Areas: lib/indianDrivingLicenseInput.util.ts, components/party/keypad/IndianDrivingLicenseKeypadFlow.tsx, components/indianVehicle/InputFormatPicker.tsx.
- Migrations: none.
- Tested: Jest licence format tests + drivers/finance/party suites pass; lint and typecheck clean on touched files. Checked on localhost:8081 (Finance → Drivers → Add driver, desktop web): picker fits one row, Old card turns 1043HW1997OD into 1043/HW/1997OD. Mobile keypad not clicked through.

## Also in this round: trip Asset Vault and Ground Ops bank hiding
- What broke: in the vehicle / driver document choosers, Preview opened only the file in the slot (the last upload). Older uploads were kept as rows but never shown, so it looked like uploads replaced each other. Ground Ops could also see Bank Docs and supplier banking (account number, IFSC) in Trip Details.
- What: each chooser row now shows how many files there are ("2 files"), and Preview pages through all of them (same gallery as Trip Details, delete still per file). Trip Details rows show "1 file" / "N files". Ground Ops no longer see the Bank Docs row, the BANK tag, or supplier banking (not even fetched).
- Areas: features/trips/components/trip-detail (TripDetailScreen, useTripDetail, tripDocTypes).
- Migrations: none. UI-only hiding for Bank Docs; database access is unchanged.
- Tested: Jest trips + tripCompliance suites pass (1090 tests); typecheck count unchanged (62). Not clicked through yet.

## Also in this round: Ground Ops Reached pickup / Start trip
- What broke: Ground Ops could not move a trip forward (no simulate access, and the database blocks their trip writes), and Assigned trips never showed on their Document Upload page.
- What: trip detail (Manifest Pulse) shows Ground Ops "Reached Pickup" (Assigned → at pickup) and "Start Trip" (at pickup → in transit), same buttons and dialog as Trip Ops simulate. Start Trip checks all Required documents first (LR, E-way bill, Invoice, Memo, RC, Insurance, Fitness, Driving licence; rejected or expired don't count) and stays disabled with the missing list until they are attached. "Undo" reverses only their own last step. Uses the database functions already on preprod and prod (they re-check role, warehouse and step). Trip Ops simulate unchanged. Document Upload lists Assigned trips for Ground Ops only.
- Areas: TripDetailScreen, new groundOpsPickup.service.ts and groundOpsTransitGate.util.ts, compliance queue filter, RBAC changelog.
- Migrations: none (uses 20270919100000, already applied on preprod and prod).
- Tested: new unit tests (8) + trips / tripCompliance / lib Jest (1815 pass); typecheck 62 (unchanged), cycles and lib-files no regression. Not clicked through as a Ground Ops login yet.
- Mobile trip detail (Journey tab) had no simulate buttons at all, so Ground Ops on a phone saw nothing. The same buttons (Reached Pickup / Start Trip / Undo for Ground Ops; Simulate / Revoke Last for Trip Ops) now sit under View details, and the confirm dialog is shared by both layouts.
- Start Trip blocked trips whose Insurance / Fitness / Driving licence were uploaded without an expiry date (preprod trip SAT812GOGTRIP001426): the check reused Compliance's "verified slot" rule, which needs an expiry date for those types. It now checks "attached" — a file on the slot that is not rejected, replaced or expired; a missing expiry date no longer blocks.
- Document Upload Resubmit: the "Upload missing documents first" alert now names what blocks it, e.g. "LR (rejected — replace it), Invoice (rejected — replace it)", instead of a generic line. Rule unchanged: every required trip document must be on file and not rejected.

## Also in this round: Resubmit fix, expiry dates, Ground Ops money hidden
- What broke: Ground Ops could never Resubmit a held trip once every file was on it. The screen relabels held trips "pending documents" so they stay in Ground Ops' list, and the Resubmit check read that label as "files missing" (preprod SAT812GOGTRIP001344). Insurance / FC / licence uploaded from the trip vault had no expiry date and there was no way to add one. Ground Ops saw money on the indent Review Hub (client rate, supplier target, margin, bids) and on Trips History (Due to get / Due to pay).
- What:
  - Resubmit judges the files themselves (trip docs not missing/rejected; vehicle/driver docs present, not expired, with expiry where required); the alert names what blocks it.
  - Expiry: new date picker (6 months / 1 / 2 / 5 years, year jump, large day grid; bottom sheet on phones). Document Upload rows show "Expiry date missing" with "Add expiry" (saves the date, no re-upload). Trip-vault upload of Insurance / Fitness / licence now requires an expiry date.
  - Ground Ops Start Trip dialog: checklist of all 8 required documents (attached / missing), "Upload in Document Upload" opens that trip on the right tab.
  - Ground Ops money hidden: indent Review Hub strips client rate, supplier target, margin, vendor rate and stop charges before render and does not load bids (bids pane says who handles bidding); desktop and mobile layouts. Trips History drops the four receivable/payable tiles; POD tiles fill the row.
- Areas: tripCompliance (ComplianceDocumentWorkspace), trip-detail (TripDetailScreen, GroundOpsTransitChecklist), components/ExpiryDatePicker, indents (IndentDetailScreen, IndentReviewHubCard, IndentMobileLoadDetail, IndentGroundOpsBiddingPanel, indentCommercialsRedaction.util), trips hub (TripsScreen, TripsHubBentoMetrics).
- Migrations: none. Money is hidden in the app only; the indent row and stop charges still reach a Ground Ops browser (database-side lock not done).
- Tested: full Jest 536 suites / 4203 tests pass; lint 102, typecheck 62, cycles and lib-files no regression; navigation-policy 64 pass. Clicked through on localhost (preprod) as Ground Ops: Resubmit opens on SAT812GOGTRIP001344; Review Hub SAT812GOGIND002430 shows no amounts and no bid requests; History tiles; Start Trip checklist and its link on TRP001421. Mobile layouts not clicked through on a phone.
