import {
  driverStoryCta,
  resolveDriverParticipation,
} from '@/features/reach/utils/driverParticipation';

const active = (org: string) => ({ organization_id: org, status: 'active', role: 'driver' });

describe('resolveDriverParticipation', () => {
  it('treats an active driver membership as employed', () => {
    expect(resolveDriverParticipation([active('org-a')])).toEqual({
      mode: 'employed',
      fleetOrgId: 'org-a',
    });
  });

  it('is independent with no driver membership', () => {
    expect(resolveDriverParticipation([])).toEqual({ mode: 'independent' });
    expect(
      resolveDriverParticipation([{ organization_id: 'o', status: 'inactive', role: 'driver' }]),
    ).toEqual({ mode: 'independent' });
  });

  it('is invited for a pending driver membership', () => {
    expect(
      resolveDriverParticipation([{ organization_id: 'o', status: 'pending', role: 'driver' }]),
    ).toEqual({ mode: 'invited', fleetOrgId: 'o' });
  });

  it('lets a server-confirmed Marketplace DCO bid despite roster memberships', () => {
    const p = resolveDriverParticipation([active('org-a'), active('org-b')], {
      marketplaceDco: true,
    });
    expect(p).toEqual({ mode: 'independent' });
    expect(driverStoryCta(p, 500).label).toBe('Bid Now');
  });

  it('keeps membership semantics when the server has not confirmed Marketplace DCO', () => {
    expect(resolveDriverParticipation([active('org-a')], { marketplaceDco: false })).toEqual({
      mode: 'employed',
      fleetOrgId: 'org-a',
    });
  });
});
