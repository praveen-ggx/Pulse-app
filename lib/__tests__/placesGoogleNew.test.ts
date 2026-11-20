import {
  isPendingGooglePlace,
  resetPlacesProviderCooldownsForTests,
  resetPlacesSearchMemoryForTests,
  resolvePlaceSelection,
  searchPlacesInIndia,
} from '@/lib/placesService';

const json = (body: unknown, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);

const AUTOCOMPLETE = {
  suggestions: [
    {
      placePrediction: {
        placeId: 'ChIJmadhavaram',
        text: { text: 'Madhavaram, Chennai, Tamil Nadu, India' },
        structuredFormat: {
          mainText: { text: 'Madhavaram' },
          secondaryText: { text: 'Chennai, Tamil Nadu, India' },
        },
      },
    },
  ],
};

const DETAILS = {
  formattedAddress: 'Madhavaram, Chennai, Tamil Nadu, India',
  location: { latitude: 13.1487898, longitude: 80.2305586 },
  addressComponents: [
    { longText: 'Madhavaram', types: ['sublocality_level_1', 'sublocality'] },
    { longText: 'Chennai', types: ['locality'] },
    { longText: 'Tiruvallur', types: ['administrative_area_level_3'] },
    { longText: 'Tamil Nadu', types: ['administrative_area_level_1'] },
    { longText: '600060', types: ['postal_code'] },
  ],
};

describe('Google Places API (New) search', () => {
  const originalFetch = global.fetch;
  const originalMapbox = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  const originalGoogle = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

  beforeEach(() => {
    resetPlacesSearchMemoryForTests();
    resetPlacesProviderCooldownsForTests();
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN = 'test-mapbox-token';
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY = 'test-google-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalMapbox === undefined) delete process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
    else process.env.EXPO_PUBLIC_MAPBOX_TOKEN = originalMapbox;
    if (originalGoogle === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
    else process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY = originalGoogle;
  });

  it('uses Google first and makes no per-result detail calls while typing', async () => {
    const fetchMock = jest.fn((url: string) =>
      url.includes('places:autocomplete') ? json(AUTOCOMPLETE) : json({ features: [] }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const results = await searchPlacesInIndia('Madhavaram');
    expect(results[0].displayName).toBe('Madhavaram, Chennai, Tamil Nadu, India');
    expect(isPendingGooglePlace(results[0])).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('places.googleapis.com/v1/places:autocomplete');
  });

  it('picking a Google result fetches its exact location and Google area names', async () => {
    global.fetch = jest.fn((url: string) =>
      url.includes('places:autocomplete') ? json(AUTOCOMPLETE) : json(DETAILS),
    ) as unknown as typeof fetch;

    const [hit] = await searchPlacesInIndia('Madhavaram');
    const picked = await resolvePlaceSelection(hit);
    expect(picked.lat).toBeCloseTo(13.14879);
    expect(picked.lon).toBeCloseTo(80.23056);
    expect(picked.locality).toBe('Madhavaram');
    expect(picked.city).toBe('Chennai');
    expect(picked.state).toBe('Tamil Nadu');
    expect(picked.pincode).toBe('600060');
    expect(picked.displayName).toBe('Madhavaram, Chennai, Tamil Nadu, India');
    expect(isPendingGooglePlace(picked)).toBe(false);
  });

  it('falls back to Mapbox when Google details fail', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('places:autocomplete')) return json(AUTOCOMPLETE);
      if (url.includes('places.googleapis.com')) return json({}, false, 403);
      return json({
        features: [
          {
            id: 'mb1',
            text: 'Madhavaram',
            place_name: 'Madhavaram, Chennai, Tamil Nadu, India',
            place_type: ['locality'],
            center: [80.23, 13.148],
            context: [{ id: 'region.1', text: 'Tamil Nadu' }],
          },
        ],
      });
    }) as unknown as typeof fetch;

    const [hit] = await searchPlacesInIndia('Madhavaram');
    resetPlacesProviderCooldownsForTests();
    const picked = await resolvePlaceSelection(hit);
    expect(picked.lat).toBeCloseTo(13.148);
    expect(picked.lon).toBeCloseTo(80.23);
  });

  it('falls back to Mapbox search when Google autocomplete fails', async () => {
    global.fetch = jest.fn((url: string) =>
      url.includes('places.googleapis.com')
        ? json({}, false, 403)
        : json({
            features: [
              {
                id: 'mb1',
                text: 'Madhavaram',
                place_name: 'Madhavaram, Chennai, Tamil Nadu, India',
                place_type: ['locality'],
                center: [80.23, 13.148],
                context: [],
              },
            ],
          }),
    ) as unknown as typeof fetch;
    const results = await searchPlacesInIndia('Madhavaram');
    expect(results[0].lat).toBeCloseTo(13.148);
    expect(isPendingGooglePlace(results[0])).toBe(false);
  });

  it('non-Google results pass through unchanged', async () => {
    const place = { placeId: 'mb1', displayName: 'X, Tamil Nadu', lat: 13, lon: 80 };
    await expect(resolvePlaceSelection(place)).resolves.toBe(place);
  });
});
