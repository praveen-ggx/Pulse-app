import { describe, expect, it } from 'vitest';
import { requiredKycDocSlots } from '@/lib/kycDocumentMatrix';

describe('admin requiredKycDocSlots', () => {
  it('requires COI for pvt_ltd', () => {
    const types = requiredKycDocSlots('pvt_ltd', true).map((s) => s.type);
    expect(types).toContain('PAN Card');
    expect(types).toContain('Address Proof');
    expect(types).toContain('COI');
    expect(types).not.toContain('GST Certificate');
  });

  it('requires activity proof for proprietorship without GST', () => {
    const slot = requiredKycDocSlots('proprietorship', true).find(
      (s) => s.type === 'Activity Proof',
    );
    expect(slot?.satisfyWith).toEqual(
      expect.arrayContaining(['MSME / Udyam', 'IEC', 'GST Certificate']),
    );
  });

  it.each([false, true])('individual needs only PAN, address proof and Aadhaar (gstSkip=%s)', (gstSkip) => {
    expect(requiredKycDocSlots('individual', gstSkip).map((s) => s.type)).toEqual([
      'PAN Card',
      'Address Proof',
      'Aadhaar',
    ]);
  });

  it('requires partnership deed', () => {
    expect(requiredKycDocSlots('partnership', false).map((s) => s.type)).toContain(
      'Partnership Deed',
    );
  });

  it('requires LLP COI + agreement', () => {
    const types = requiredKycDocSlots('llp', false).map((s) => s.type);
    expect(types).toEqual(
      expect.arrayContaining(['GST Certificate', 'COI', 'LLP Agreement']),
    );
  });

  it('always requires PAN Card for every structure', () => {
    for (const type of [null, 'proprietorship', 'partnership', 'pvt_ltd', 'public_ltd', 'llp']) {
      expect(requiredKycDocSlots(type, true).some((s) => s.type === 'PAN Card')).toBe(true);
      expect(requiredKycDocSlots(type, false).some((s) => s.type === 'PAN Card')).toBe(true);
    }
  });

  it('matches Pulse type × GST required-document set (lockstep with buildKycRequirementProfile)', () => {
    const cases: Array<{
      type: string;
      gstSkip: boolean;
      slots: string[];
    }> = [
      { type: 'proprietorship', gstSkip: false, slots: ['GST Certificate', 'PAN Card', 'Address Proof'] },
      { type: 'proprietorship', gstSkip: true, slots: ['PAN Card', 'Address Proof', 'Activity Proof'] },
      { type: 'partnership', gstSkip: false, slots: ['GST Certificate', 'PAN Card', 'Address Proof', 'Partnership Deed'] },
      { type: 'partnership', gstSkip: true, slots: ['PAN Card', 'Address Proof', 'Partnership Deed'] },
      { type: 'pvt_ltd', gstSkip: false, slots: ['GST Certificate', 'PAN Card', 'Address Proof', 'COI'] },
      { type: 'pvt_ltd', gstSkip: true, slots: ['PAN Card', 'Address Proof', 'COI'] },
      { type: 'public_ltd', gstSkip: false, slots: ['GST Certificate', 'PAN Card', 'Address Proof', 'COI'] },
      { type: 'public_ltd', gstSkip: true, slots: ['PAN Card', 'Address Proof', 'COI'] },
      { type: 'llp', gstSkip: false, slots: ['GST Certificate', 'PAN Card', 'Address Proof', 'COI', 'LLP Agreement'] },
      { type: 'llp', gstSkip: true, slots: ['PAN Card', 'Address Proof', 'COI', 'LLP Agreement'] },
    ];
    for (const row of cases) {
      expect(requiredKycDocSlots(row.type, row.gstSkip).map((s) => s.type)).toEqual(row.slots);
    }
  });
});
