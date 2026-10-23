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
