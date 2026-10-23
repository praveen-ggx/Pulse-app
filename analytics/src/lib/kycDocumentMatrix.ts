/**
 * Admin-side KYC document matrix — mirrors
 * `buildKycRequirementProfile` in
 * features/organization/utils/kycVerification.util.ts.
 * Keep required/optional slots in lockstep with that function.
 * Analytics cannot import Pulse feature modules; this file is the admin mirror.
 * Invariant: same type + GST state → same slots as Pulse and the 6-arg
 * submit_business_verification RPC. See docs/KYC_REQUIREMENT_POLICY.md.
 */

import type { DocumentType } from '@/types/admin';

export type RegistrationTypeDb =
  | 'individual'
  | 'proprietorship'
  | 'partnership'
  | 'pvt_ltd'
  | 'public_ltd'
  | 'llp';

export type RequiredDocSlot = {
  /** Primary admin DocumentType for the tab / Missing placeholder. */
  type: DocumentType;
  /** Any of these uploaded DocumentTypes satisfy the slot. */
  satisfyWith: DocumentType[];
  label: string;
};

const ALWAYS_BASE: RequiredDocSlot[] = [
  {
    type: 'PAN Card',
    satisfyWith: ['PAN Card'],
    label: 'PAN Card',
  },
  {
    type: 'Address Proof',
    satisfyWith: ['Address Proof'],
    label: 'Address Proof',
  },
];

/** Structure-driven required document slots for admin review. */
export function requiredKycDocSlots(
  registrationType: string | null | undefined,
  gstNotApplicable: boolean,
): RequiredDocSlot[] {
  const slots: RequiredDocSlot[] = [...ALWAYS_BASE];

  // Individuals are never asked for GST.
  if (!gstNotApplicable && registrationType !== 'individual') {
    slots.unshift({
      type: 'GST Certificate',
      satisfyWith: ['GST Certificate'],
      label: 'GST Certificate',
    });
  }

  switch (registrationType) {
    case 'individual':
      slots.push({
        type: 'Aadhaar',
        satisfyWith: ['Aadhaar'],
        label: 'Aadhaar card',
      });
      break;
    case 'proprietorship':
      if (gstNotApplicable) {
        slots.push({
          type: 'Activity Proof',
          satisfyWith: ['MSME / Udyam', 'IEC', 'GST Certificate'],
          label: 'Activity proof (Udyam or IEC)',
        });
      }
      break;
    case 'partnership':
      slots.push({
        type: 'Partnership Deed',
        satisfyWith: ['Partnership Deed'],
        label: 'Partnership deed',
      });
      break;
    case 'pvt_ltd':
    case 'public_ltd':
      slots.push({
        type: 'COI',
        satisfyWith: ['COI'],
        label: 'Incorporation / CIN certificate',
      });
      break;
    case 'llp':
      slots.push(
        {
          type: 'COI',
          satisfyWith: ['COI'],
          label: 'Incorporation certificate',
        },
        {
          type: 'LLP Agreement',
          satisfyWith: ['LLP Agreement'],
          label: 'LLP agreement',
        },
      );
      break;
    default:
      break;
  }

  return slots;
}

export function registrationTypeRequiresCin(
  registrationType: string | null | undefined,
): boolean {
  return registrationType === 'pvt_ltd' || registrationType === 'public_ltd';
}

/** Map DB organization_kyc_documents.doc_type → admin DocumentType. */
export function mapDbDocTypeToAdmin(docType: string): DocumentType {
  switch (docType) {
    case 'gst_certificate':
      return 'GST Certificate';
    case 'pan_card':
      return 'PAN Card';
    case 'address_proof':
    case 'address_proof_lease':
    case 'address_proof_utility_bill':
    case 'address_proof_other':
      return 'Address Proof';
    case 'cin_certificate':
    case 'incorporation_certificate':
      return 'COI';
    case 'partnership_deed':
      return 'Partnership Deed';
    case 'llp_agreement':
      return 'LLP Agreement';
    case 'msme_certificate':
      return 'MSME / Udyam';
    case 'iec_certificate':
      return 'IEC';
    case 'aadhaar_card':
      return 'Aadhaar';
    default:
      return 'Address Proof';
  }
}
