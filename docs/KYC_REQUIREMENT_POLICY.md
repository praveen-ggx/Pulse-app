# KYC requirement policy

Canonical product rule for organization business verification.

The wizard asks what kind of business you are and whether you are GST
registered. Pulse then tells you exactly which tax fields and documents are
required. That is not a generic checklist.

## Invariant

**KYC Requirement Policy Invariant:** Pulse, Admin Console, and the
verification submission RPC must resolve the same required/optional tax fields
and document slots for the same business type and GST registration state. Any
change to the requirement matrix must update all three consumers in the same
change set.

| Consumer | Source |
|---|---|
| Pulse (wizard, Home, Documents) | `buildKycRequirementProfile()` in `features/organization/utils/kycVerification.util.ts` |
| Admin Console | `requiredKycDocSlots()` in `analytics/src/lib/kycDocumentMatrix.ts` (lockstep mirror — Analytics cannot import Pulse feature modules) |
| Submit RPC | Live `submit_business_verification(uuid, registration_type_enum, text, text, text, boolean)` — the 6-arg signature with `p_gst_not_applicable` |

Lockstep tests: Pulse `kycVerification.util.test.ts` (`requirement matrix lockstep`) and Admin `kycDocumentMatrix.test.ts`.

## Inputs

1. Business type (`registration_type`: individual, proprietorship, partnership, pvt_ltd, public_ltd, llp)
2. GST registered? (`gst_not_applicable` = false means Yes)

`individual` (e.g. a single truck owner, signup business type `INDIVIDUAL`)
needs only PAN card, Aadhaar card (`aadhaar_card`) and address proof. GST is
never required for it, whatever `gst_not_applicable` says. Aadhaar uploads
skip OCR and go to manual review.

## Signature rule

Callers must use the 6-arg RPC and always pass `p_gst_not_applicable`.
Do not reintroduce a 5-arg overload. Two signatures with different KYC rules
is a policy bug.

## Live contract (2026-08-15)

After `20270215221500_drop_legacy_submit_business_verification_5arg.sql`
was applied to the linked remote:

| Signature | Status |
|---|---|
| `submit_business_verification(uuid, registration_type_enum, text, text, text, boolean)` | exists (6 args, `p_gst_not_applicable`) |
| `submit_business_verification(uuid, registration_type_enum, text, text, text)` | does not exist |

`20261114` was not edited. That file is history. The DROP is the live cleanup.

## Status semantics

Unchanged: `unverified` → `pending` → `verified` | `rejected`.
This document does not change freeze, document-update lifecycle, or Admin
approve/reject.
