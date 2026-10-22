import {
  buildKycRequirementProfile,
  effectiveKycRegistrationType,
  formatKycHubRemainingCopy,
  isKycTaxFieldRequired,
  kycOptionalTaxFields,
  kycRequiredDocumentDefs,
  kycStructureRequirementsHint,
  kycTaxIdentifiersComplete,
  kycVerificationReady,
  listKycVerificationGaps,
  listMissingKycRequirements,
  registrationTypeFromBusinessType,
  registrationTypeRequiresCin,
} from '@/features/organization/utils/kycVerification.util';
import type { OrganizationKycDocument } from '@/features/organization/types/organizationKycDocuments.types';
import type { WorkspaceKyc } from '@/types/organization';

function baseKyc(over: Partial<WorkspaceKyc> = {}): WorkspaceKyc {
  return {
    id: 'org-1',
    name: 'Test',
    gstin: null,
    gst_not_applicable: false,
    business_pan: null,
    cin: null,
    msme_number: null,
    tan_number: null,
    iec_number: null,
    verification_status: 'unverified',
    verified_at: null,
    kyc_rejected_reason: null,
    rejection_reasons: null,
    registration_type: null,
    business_type: null,
    address_line: null,
    city: null,
    state: null,
    pincode: null,
    address_pincode: null,
    address_proof_path: null,
    address_proof_type: null,
    frozen_at: null,
    submitted_at: null,
    ...over,
  } as WorkspaceKyc;
}

function doc(type: OrganizationKycDocument['doc_type'], path = 'path'): OrganizationKycDocument {
  return {
    id: type,
    organization_id: 'org-1',
    doc_type: type,
    doc_label: null,
    storage_path: path,
    file_name: 'x.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 1,
    is_mandatory: true,
    status: 'pending',
    verified_at: null,
    rejection_notes: null,
    created_at: '',
    updated_at: '',
  };
}

const address = {
  address_line: '1 St',
  city: 'Coimbatore',
  state: 'Tamil Nadu',
  address_pincode: '641001',
} as const;

describe('kycVerification gaps + GST skip', () => {
  it('lists GSTIN and docs when incomplete', () => {
    const gaps = listKycVerificationGaps(baseKyc({ business_pan: 'LTUPS6014E' }), []);
    expect(gaps).toEqual(
      expect.arrayContaining([
        'Add GSTIN — or mark the business as not registered for GST',
        'Upload GST Registration Certificate',
        'Upload Business PAN',
        'Upload Business Address Proof',
        'Select registration type',
        'Add operating address',
      ]),
    );
    expect(kycVerificationReady(baseKyc({ business_pan: 'LTUPS6014E' }), [])).toBe(false);
  });

  it('treats gst_not_applicable as tax-complete without GSTIN or GST cert for partnership when deed uploaded', () => {
    const kyc = baseKyc({
      gst_not_applicable: true,
      business_pan: 'LTUPS6014E',
      registration_type: 'partnership',
      ...address,
    });
    expect(kycTaxIdentifiersComplete(kyc)).toBe(true);
    const docs = [doc('pan_card'), doc('address_proof'), doc('partnership_deed')];
    expect(listKycVerificationGaps(kyc, docs)).toEqual([]);
    expect(kycVerificationReady(kyc, docs)).toBe(true);
  });

  it('returns no gaps while under review (locked)', () => {
    expect(
      listKycVerificationGaps(
        baseKyc({ verification_status: 'pending', business_pan: 'LTUPS6014E' }),
        [],
      ),
    ).toEqual([]);
  });
});

describe('structure-driven KYC document matrix', () => {
  it('builds dynamic required defs from registrationType + gstNotApplicable', () => {
    const types = kycRequiredDocumentDefs('pvt_ltd', true).map((d) => d.type);
    expect(types).toContain('pan_card');
    expect(types).toContain('address_proof');
    expect(types).toContain('incorporation_certificate');
    expect(types).not.toContain('gst_certificate');
  });

  it('requires proprietorship activity proof when GST skipped', () => {
    const defs = kycRequiredDocumentDefs('proprietorship', true);
    const activity = defs.find((d) => d.type === 'msme_certificate');
    expect(activity?.acceptTypes).toEqual(
      expect.arrayContaining(['msme_certificate', 'iec_certificate', 'gst_certificate']),
    );

    const kyc = baseKyc({
      gst_not_applicable: true,
      business_pan: 'LTUPS6014E',
      registration_type: 'proprietorship',
      ...address,
    });
    expect(listMissingKycRequirements(kyc, [doc('pan_card'), doc('address_proof')]).docs).toContain(
      'msme_certificate',
    );
    expect(
      listKycVerificationGaps(kyc, [
        doc('pan_card'),
        doc('address_proof'),
        doc('iec_certificate'),
      ]),
    ).toEqual([]);
    // GST cert counts as activity proof even when GST skipped
    expect(
      kycVerificationReady(kyc, [
        doc('pan_card'),
        doc('address_proof'),
        doc('gst_certificate'),
      ]),
    ).toBe(true);
  });

  it('does not require activity proof for proprietorship when GST is provided', () => {
    const defs = kycRequiredDocumentDefs('proprietorship', false);
    expect(defs.some((d) => d.acceptTypes?.includes('iec_certificate'))).toBe(false);
    expect(defs.map((d) => d.type)).toContain('gst_certificate');
  });

  it('requires partnership deed and not CIN', () => {
    expect(registrationTypeRequiresCin('partnership')).toBe(false);
    const kyc = baseKyc({
      gstin: '33AAAAA0000A1Z5',
      business_pan: 'LTUPS6014E',
      registration_type: 'partnership',
      ...address,
    });
    const missing = listMissingKycRequirements(kyc, [
      doc('gst_certificate'),
      doc('pan_card'),
      doc('address_proof'),
    ]);
    expect(missing.docs).toContain('partnership_deed');
    expect(missing.fields).not.toContain('cin');
  });

  it('requires CIN + incorporation for pvt_ltd; accepts legacy cin_certificate', () => {
    expect(registrationTypeRequiresCin('pvt_ltd')).toBe(true);
    const kyc = baseKyc({
      gst_not_applicable: true,
      business_pan: 'LTUPS6014E',
      registration_type: 'pvt_ltd',
      cin: 'U12345MH2024PTC123456',
      ...address,
    });
    expect(
      listMissingKycRequirements(kyc, [doc('pan_card'), doc('address_proof')]).docs,
    ).toContain('incorporation_certificate');
    expect(
      kycVerificationReady(kyc, [
        doc('pan_card'),
        doc('address_proof'),
        doc('cin_certificate'),
      ]),
    ).toBe(true);
  });

  it('requires LLP incorporation + agreement; CIN not required', () => {
    expect(registrationTypeRequiresCin('llp')).toBe(false);
    const kyc = baseKyc({
      gstin: '33AAAAA0000A1Z5',
      business_pan: 'LTUPS6014E',
      registration_type: 'llp',
      ...address,
    });
    const missing = listMissingKycRequirements(kyc, [
      doc('gst_certificate'),
      doc('pan_card'),
      doc('address_proof'),
      doc('incorporation_certificate'),
    ]);
    expect(missing.fields).not.toContain('cin');
    expect(missing.docs).toContain('llp_agreement');
    expect(
      kycVerificationReady(kyc, [
        doc('gst_certificate'),
        doc('pan_card'),
        doc('address_proof'),
        doc('incorporation_certificate'),
        doc('llp_agreement'),
      ]),
    ).toBe(true);
  });

  it('uses signup business_type when registration_type is null', () => {
    expect(registrationTypeFromBusinessType('SOLE_PROPRIETOR')).toBe('proprietorship');
    expect(
      effectiveKycRegistrationType({
        registration_type: null,
        business_type: 'SOLE_PROPRIETOR',
      }),
    ).toBe('proprietorship');

    const kyc = baseKyc({
      registration_type: null,
      business_type: 'SOLE_PROPRIETOR',
      business_pan: 'LTUPS6014E',
      ...address,
    });
    expect(listMissingKycRequirements(kyc, []).fields).not.toContain('registration_type');
    expect(kycRequiredDocumentDefs(kyc).map((d) => d.type)).toEqual(
      expect.arrayContaining(['pan_card', 'address_proof', 'gst_certificate']),
    );
    expect(kycStructureRequirementsHint(effectiveKycRegistrationType(kyc), false)).toMatch(
      /Proprietorship/,
    );
  });
});

describe('structure-driven tax fields', () => {
  it('always requires PAN; GSTIN only when GST is registered; CIN only for limited companies', () => {
    expect(isKycTaxFieldRequired('gstin', 'proprietorship')).toBe(true);
    expect(isKycTaxFieldRequired('gstin', 'proprietorship', true)).toBe(false);
    expect(isKycTaxFieldRequired('business_pan', 'llp')).toBe(true);
    expect(isKycTaxFieldRequired('cin', 'pvt_ltd')).toBe(true);
    expect(isKycTaxFieldRequired('cin', 'public_ltd')).toBe(true);
    expect(isKycTaxFieldRequired('cin', 'partnership')).toBe(false);
    expect(isKycTaxFieldRequired('iec_number', 'proprietorship')).toBe(false);
    expect(kycOptionalTaxFields('pvt_ltd')).not.toContain('cin');
    expect(kycOptionalTaxFields('proprietorship')).toEqual(
      expect.arrayContaining(['cin', 'msme_number', 'tan_number', 'iec_number']),
    );
  });

  it('builds one requirement profile for wizard, documents, and home', () => {
    const withGst = buildKycRequirementProfile(
      baseKyc({ registration_type: 'pvt_ltd', gst_not_applicable: false }),
    );
    expect(withGst.requiredTaxFields).toEqual(['gstin', 'business_pan', 'cin']);
    expect(withGst.optionalTaxFields).not.toContain('cin');
    expect(withGst.requiredDocuments.map((d) => d.type)).toEqual(
      expect.arrayContaining(['gst_certificate', 'pan_card', 'address_proof', 'incorporation_certificate']),
    );

    const skipped = buildKycRequirementProfile(
      baseKyc({ registration_type: 'pvt_ltd', gst_not_applicable: true }),
    );
    expect(skipped.gstRequired).toBe(false);
    expect(skipped.requiredTaxFields).toEqual(['business_pan', 'cin']);
    expect(skipped.requiredDocuments.map((d) => d.type)).not.toContain('gst_certificate');
  });

  it('speaks remaining work in human copy', () => {
    expect(formatKycHubRemainingCopy(2, 4)).toBe('2 details and 4 documents remaining');
    expect(formatKycHubRemainingCopy(0, 4)).toBe('4 documents remaining');
    expect(formatKycHubRemainingCopy(1, 0)).toBe('1 detail remaining');
    expect(formatKycHubRemainingCopy(0, 0)).toBe('Ready to review');
  });

  it('keeps at least one mandatory document for every structure', () => {
    const types: Array<WorkspaceKyc['registration_type']> = [
      'proprietorship',
      'partnership',
      'pvt_ltd',
      'public_ltd',
      'llp',
      null,
    ];
    for (const registrationType of types) {
      for (const gstSkip of [false, true]) {
        const defs = kycRequiredDocumentDefs(
          baseKyc({ registration_type: registrationType, gst_not_applicable: gstSkip }),
        );
        expect(defs.length).toBeGreaterThanOrEqual(1);
        expect(defs.every((d) => d.mandatory)).toBe(true);
        expect(defs.some((d) => d.type === 'pan_card')).toBe(true);
      }
    }
  });
});

/**
 * Lockstep table: Pulse UI profile vs Admin `requiredKycDocSlots`.
 * Live `submit_business_verification` (6-arg, gst_not_applicable) matches this
 * set. The leftover 5-arg overload is dropped by
 * 20270215221500_drop_legacy_submit_business_verification_5arg.sql.
 */
describe('requirement matrix lockstep (type × GST)', () => {
  const cases: Array<{
    type: NonNullable<WorkspaceKyc['registration_type']>;
    gstSkip: boolean;
    tax: string[];
    docs: string[];
  }> = [
    {
      type: 'proprietorship',
      gstSkip: false,
      tax: ['gstin', 'business_pan'],
      docs: ['gst_certificate', 'pan_card', 'address_proof'],
    },
    {
      type: 'proprietorship',
      gstSkip: true,
      tax: ['business_pan'],
      docs: ['pan_card', 'address_proof', 'msme_certificate'],
    },
    {
      type: 'partnership',
      gstSkip: false,
      tax: ['gstin', 'business_pan'],
      docs: ['gst_certificate', 'pan_card', 'address_proof', 'partnership_deed'],
    },
    {
      type: 'partnership',
      gstSkip: true,
      tax: ['business_pan'],
      docs: ['pan_card', 'address_proof', 'partnership_deed'],
    },
    {
      type: 'pvt_ltd',
      gstSkip: false,
      tax: ['gstin', 'business_pan', 'cin'],
      docs: ['gst_certificate', 'pan_card', 'address_proof', 'incorporation_certificate'],
    },
    {
      type: 'pvt_ltd',
      gstSkip: true,
      tax: ['business_pan', 'cin'],
      docs: ['pan_card', 'address_proof', 'incorporation_certificate'],
    },
    {
      type: 'public_ltd',
      gstSkip: false,
      tax: ['gstin', 'business_pan', 'cin'],
      docs: ['gst_certificate', 'pan_card', 'address_proof', 'incorporation_certificate'],
    },
    {
      type: 'public_ltd',
      gstSkip: true,
      tax: ['business_pan', 'cin'],
      docs: ['pan_card', 'address_proof', 'incorporation_certificate'],
    },
    {
      type: 'llp',
      gstSkip: false,
      tax: ['gstin', 'business_pan'],
      docs: [
        'gst_certificate',
        'pan_card',
        'address_proof',
        'incorporation_certificate',
        'llp_agreement',
      ],
    },
    {
      type: 'llp',
      gstSkip: true,
      tax: ['business_pan'],
      docs: ['pan_card', 'address_proof', 'incorporation_certificate', 'llp_agreement'],
    },
  ];

  it.each(cases)('$type gstSkip=$gstSkip', ({ type, gstSkip, tax, docs }) => {
    const profile = buildKycRequirementProfile(
      baseKyc({ registration_type: type, gst_not_applicable: gstSkip }),
    );
    expect(profile.requiredTaxFields).toEqual(tax);
    expect(profile.requiredDocuments.map((d) => d.type)).toEqual(docs);
    expect(profile.optionalTaxFields.includes('cin')).toBe(type !== 'pvt_ltd' && type !== 'public_ltd');
    expect(profile.requiredDocuments.some((d) => d.type === 'gst_certificate')).toBe(!gstSkip);
  });
});

describe('individual registration type', () => {
  it('maps signup INDIVIDUAL to individual', () => {
    expect(registrationTypeFromBusinessType('INDIVIDUAL')).toBe('individual');
  });

  it.each([false, true])('needs only PAN, Aadhaar and address proof (gstSkip=%s)', (gstSkip) => {
    const profile = buildKycRequirementProfile(
      baseKyc({ registration_type: 'individual', gst_not_applicable: gstSkip }),
    );
    expect(profile.gstRequired).toBe(false);
    expect(profile.requiredTaxFields).toEqual(['business_pan']);
    expect(profile.requiredDocuments.map((d) => d.type)).toEqual([
      'pan_card',
      'address_proof',
      'aadhaar_card',
    ]);
    expect(isKycTaxFieldRequired('gstin', 'individual', gstSkip)).toBe(false);
  });

  it('is ready to submit without GST or Udyam', () => {
    const kyc = baseKyc({
      registration_type: 'individual',
      business_pan: 'ABCPE1234F',
      address_line: '1 Main Rd',
      city: 'Chennai',
      state: 'TN',
    });
    const docs = [doc('pan_card'), doc('address_proof'), doc('aadhaar_card')];
    expect(kycTaxIdentifiersComplete(kyc)).toBe(true);
    expect(listKycVerificationGaps(kyc, docs)).toEqual([]);
    expect(listKycVerificationGaps(kyc, [doc('pan_card'), doc('address_proof')])).toEqual([
      'Upload Aadhaar card',
    ]);
  });
});
