export type OrganizationKycDocType =
  | 'gst_certificate'
  | 'pan_card'
  | 'cin_certificate'
  | 'address_proof'
  | 'msme_certificate'
  | 'iec_certificate'
  | 'incorporation_certificate'
  | 'partnership_deed'
  | 'llp_agreement'
  | 'aadhaar_card'
  | 'other';

export type OrganizationKycDocStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export type OrganizationKycDocument = {
  id: string;
  organization_id: string;
  doc_type: OrganizationKycDocType;
  doc_label: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  is_mandatory: boolean;
  status: OrganizationKycDocStatus;
  verified_at: string | null;
  rejection_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationKycDocDefinition = {
  type: OrganizationKycDocType;
  label: string;
  hint: string;
  mandatory: boolean;
  /**
   * Any of these uploaded doc_types satisfy this slot.
   * Defaults to `[type]`. Used for CIN↔incorporation backward compat
   * and proprietorship “activity proof” (Udyam | IEC | GST cert).
   */
  acceptTypes?: OrganizationKycDocType[];
  /**
   * When set, the upload row offers chips to choose which acceptType to store.
   * Defaults to `acceptTypes` when length > 1 and the primary type is included.
   */
  uploadChoices?: OrganizationKycDocType[];
};

/** Always-required base uploads (GST cert filtered when gst_not_applicable). */
export const ORG_KYC_REQUIRED_DOCUMENTS: OrganizationKycDocDefinition[] = [
  {
    type: 'gst_certificate',
    label: 'GST certificate',
    hint: 'GST registration certificate (PDF or image)',
    mandatory: true,
  },
  {
    type: 'pan_card',
    label: 'PAN card',
    hint: 'Business PAN card copy',
    mandatory: true,
  },
  {
    type: 'address_proof',
    label: 'Address proof',
    hint: 'Lease, utility bill, or government document',
    mandatory: true,
  },
];

/** Fallback optional catalogue; prefer kycOptionalDocumentDefs() for structure-aware UI. */
export const ORG_KYC_OPTIONAL_DOCUMENTS: OrganizationKycDocDefinition[] = [
  {
    type: 'cin_certificate',
    label: 'CIN / incorporation certificate',
    hint: 'Certificate of incorporation (if applicable)',
    mandatory: false,
    acceptTypes: ['cin_certificate', 'incorporation_certificate'],
  },
  {
    type: 'msme_certificate',
    label: 'MSME / Udyam',
    hint: 'Udyam registration certificate',
    mandatory: false,
  },
  {
    type: 'iec_certificate',
    label: 'IEC',
    hint: 'Import Export Code certificate',
    mandatory: false,
  },
];

export const ORG_KYC_DOC_LABELS: Record<OrganizationKycDocType, string> = {
  gst_certificate: 'GST certificate',
  pan_card: 'PAN card',
  cin_certificate: 'CIN certificate',
  address_proof: 'Address proof',
  msme_certificate: 'MSME / Udyam',
  iec_certificate: 'IEC',
  incorporation_certificate: 'Incorporation certificate',
  partnership_deed: 'Partnership deed',
  llp_agreement: 'LLP agreement',
  aadhaar_card: 'Aadhaar card',
  other: 'Other',
};

/** CIN certificate and incorporation certificate are treated as equivalent. */
export const INCORPORATION_DOC_TYPES: OrganizationKycDocType[] = [
  'incorporation_certificate',
  'cin_certificate',
];

export const ACTIVITY_PROOF_DOC_TYPES: OrganizationKycDocType[] = [
  'msme_certificate',
  'iec_certificate',
  'gst_certificate',
];
