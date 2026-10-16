# gowtham V1.0.5 — Supplier TDS rate with a supporting document per financial year

## What
- Supplier → Documents & Data → Commercial terms → TDS rate: for the selected financial year the card shows a "TDS supporting document" block with a "Mandatory" or "Optional" tag and an Upload / "Add another" button. Uploaded files show right under the rate with View / Verify / Remove.
- 0% is Mandatory: a 0% rate cannot be saved until a supporting document (e.g. Form 15G / 15H or the transporter declaration) is uploaded for that financial year. Every rate above 0 shows "Optional" and saves without a document.
- The saved-rates table shows "Document on file" / "Document missing" for each year with a 0% rate.
- Uploaded TDS files also appear in a new "TDS documents" card in the Document library (uploads stay under Commercial terms).
- Fixed: uploading any document (TDS, PAN, bank…) reloaded the vault and reset the TDS rate box, wiping an unsaved rate and making a just-uploaded TDS file look lost. The box now resets only when the year, the saved rate or edit mode changes.

## Why
- A 0% TDS rate could be saved with nothing on file to back it. Team decision: keep the mandatory upload strictly for 0% and leave all other rates optional, shown as a plain Mandatory / Optional tag because vendors and staff are not tax experts.
- Background: vendors are transport contractors (old s.194C, s.393 of the Income-tax Act, 2025 from 1 Apr 2026), so 0% normally rests on the transporter's 10-carriage declaration with PAN; Form 15G / 15H (Form 121 from 1 Apr 2026) is a fallback.

## Areas
- New features/suppliers/utils/supplierTdsDocuments.util.ts (rate → Mandatory / Optional rule, per-year matching).
- supplierManagement.types.ts: one new doc type `tds_supporting_document` + label.
- supplierVendorOnboarding.util.ts: "TDS documents" library section.
- SupplierVendorOnboardingVault.tsx: TDS document block, save check, table status, library card, TDS box reset fix.
- TDS files are stored per financial year (doc_label "TDS supporting document · FY 2026-27", append mode, so one year never overwrites another).
- DB checked: no unique index on supplier_kyc_documents, org-member RLS allows insert / update / delete, compliance-documents storage policies allow the org folder.

## Migrations
- None (supplier_kyc_documents.doc_type is free text; no schema change).

## Tested
- New jest supplierTdsDocuments.util (0% mandatory, 0.01–100% optional, per-year matching).
- New render test SupplierVendorOnboardingVault.tds: type 0 → upload → file shown with View / Verify / Remove, rate kept, Add another, Save blocked without doc, saves with doc, 2% saves without doc, Remove works. Confirmed it fails on the old reset code.
- Handoff checks: see PR description. Not clicked through in the UI.
