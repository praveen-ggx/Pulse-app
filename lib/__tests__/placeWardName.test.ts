import { cleanOsmAreaName } from '@/lib/maps/placeSearch.util';
import { enrichPlaceSelectionSync } from '@/lib/placeCityState.util';

describe('cleanOsmAreaName — OSM ward numbers are not place names', () => {
  it.each([
    ['Ward 185', ''],
    ['Ward 30', ''],
    ['ward no. 33', ''],
    ['Ward No 12A', ''],
    ['Zone 3', ''],
    ['Zone 10 Kodambakkam', 'Kodambakkam'],
    ['Zone 3 Madhavaram', 'Madhavaram'],
    ['Velayudam Colony', 'Velayudam Colony'],
    ['United India Colony', 'United India Colony'],
    ['Wardha', 'Wardha'],
    ['Zonal Office Road', 'Zonal Office Road'],
    ['', ''],
    [null, ''],
  ])('%p → %p', (input, expected) => {
    expect(cleanOsmAreaName(input as string | null)).toBe(expected);
  });
});

describe('enrichPlaceSelectionSync — ward locality falls back to the place name', () => {
  it('Madhavaram search hit whose OSM neighbourhood is "Ward 30"', () => {
    const out = enrichPlaceSelectionSync({
      displayName:
        'Madhavaram, Zone 3 Madhavaram, Chennai, Chennai District, Tamil Nadu, 600060, India',
      lat: 13.1488,
      lon: 80.2306,
      city: 'Chennai',
      state: 'Tamil Nadu',
      locality: 'Ward 30',
    });
    expect(out.label).not.toMatch(/ward/i);
    expect(out.label).toBe('Madhavaram, Tamil Nadu');
  });

  it('real neighbourhood is kept as before', () => {
    const out = enrichPlaceSelectionSync({
      displayName: 'Velayudam Colony, Chennai, Tamil Nadu, India',
      lat: 13.05,
      lon: 80.21,
      city: 'Chennai',
      state: 'Tamil Nadu',
      locality: 'Velayudam Colony',
    });
    expect(out.label).toBe('Velayudam Colony, Tamil Nadu');
  });
});
