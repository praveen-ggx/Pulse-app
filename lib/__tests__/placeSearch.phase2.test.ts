import {
  MAPBOX_FORWARD_SEARCH_TYPES,
  MAPBOX_GEOCODING_V5_SUPPORTED_TYPES,
  NOMINATIM_REVERSE_URL,
  NOMINATIM_USER_AGENT,
  buildNominatimReverseUrl,
  coordsOrUnset,
  customPlaceCoords,
  isUsablePlaceCoordinate,
  shouldCachePlaceSearchResults,
} from "@/lib/maps/placeSearch.util";
import {
  resetPlacesProviderCooldownsForTests,
  resetPlacesSearchMemoryForTests,
  reverseGeocodePlaceInIndia,
  searchPlacesInIndia,
} from "@/lib/placesService";

describe("Mapbox Geocoding v5 types (verified allowlist)", () => {
  it("uses only official v5 types and adds district for India coverage", () => {
    const requested = MAPBOX_FORWARD_SEARCH_TYPES.split(",");
    expect(requested).toEqual(
      expect.arrayContaining([
        "address",
        "place",
        "locality",
        "neighborhood",
        "postcode",
        "district",
      ]),
    );
    for (const type of requested) {
      expect(MAPBOX_GEOCODING_V5_SUPPORTED_TYPES).toContain(type);
    }
  });

  it("does not send poi — Geocoding v5 removed POI data", () => {
    expect(MAPBOX_FORWARD_SEARCH_TYPES.split(",")).not.toContain("poi");
    expect(MAPBOX_FORWARD_SEARCH_TYPES).not.toContain("poi.landmark");
    expect(MAPBOX_GEOCODING_V5_SUPPORTED_TYPES).not.toContain("poi");
  });
});

describe("empty-result caching", () => {
  it("does not treat empty or error-shaped lists as cacheable", () => {
    expect(shouldCachePlaceSearchResults([])).toBe(false);
    expect(shouldCachePlaceSearchResults([{ id: "x" }])).toBe(true);
  });
});

describe("custom text without coordinates", () => {
  it("never invents a 0,0 pin", () => {
    expect(customPlaceCoords()).toEqual({ lat: null, lon: null });
    expect(isUsablePlaceCoordinate(0, 0)).toBe(false);
    expect(isUsablePlaceCoordinate(null, null)).toBe(false);
    expect(coordsOrUnset({ lat: 0, lon: 0 })).toEqual({ lat: null, lon: null });
    expect(coordsOrUnset(customPlaceCoords())).toEqual({ lat: null, lon: null });
    expect(coordsOrUnset({ lat: 12.97, lon: 77.59 })).toEqual({
      lat: 12.97,
      lon: 77.59,
    });
  });
});

describe("Nominatim reverse URL", () => {
  it("uses /reverse, not /search/reverse", () => {
    const url = buildNominatimReverseUrl(12.97, 77.59, { zoom: "16" });
    expect(url.startsWith(`${NOMINATIM_REVERSE_URL}?`)).toBe(true);
    expect(url).not.toContain("/search/reverse");
    expect(url).toContain("lat=12.97");
    expect(url).toContain("lon=77.59");
    expect(url).toContain("zoom=16");
    expect(NOMINATIM_USER_AGENT).not.toContain("example.com");
  });
});

describe("searchPlacesInIndia provider behaviour", () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  const originalGoogle = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

  beforeEach(() => {
    resetPlacesSearchMemoryForTests();
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN = "test-mapbox-token";
    delete process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
    else process.env.EXPO_PUBLIC_MAPBOX_TOKEN = originalToken;
    if (originalGoogle === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
    else process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY = originalGoogle;
    resetPlacesSearchMemoryForTests();
  });

  function mockFetchSequence(
    handlers: Array<(url: string) => Promise<Response> | Response>,
  ) {
    let i = 0;
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const handler = handlers[i] ?? handlers[handlers.length - 1];
      i += 1;
      return handler(url);
    });
    global.fetch = fetchMock as typeof fetch;
    return fetchMock;
  }

  it("asks Mapbox for district (and not poi) on a POI-style query", async () => {
    const fetchMock = mockFetchSequence([
      async (url) => {
        expect(url).toContain("geocoding/v5/mapbox.places/");
        expect(url).toContain("types=");
        expect(decodeURIComponent(url)).toContain("district");
        expect(url).not.toMatch(/types=[^&]*poi/);
        return {
          ok: true,
          json: async () => ({
            features: [
              {
                id: "poi.sipcot",
                place_name: "SIPCOT Industrial Park, Hosur, Tamil Nadu",
                text: "SIPCOT Industrial Park",
                center: [77.82, 12.74],
                place_type: ["poi"],
                context: [
                  { id: "place.hosur", text: "Hosur" },
                  { id: "region.tn", text: "Tamil Nadu" },
                ],
              },
            ],
          }),
        } as Response;
      },
    ]);

    const results = await searchPlacesInIndia("SIPCOT Hosur");
    expect(results).toHaveLength(1);
    expect(results[0].displayName).toContain("SIPCOT");
    expect(results[0].lat).toBeCloseTo(12.74);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("maps.googleapis.com");
  });

  it("does not cache an empty provider miss so a later hit can succeed", async () => {
    const fetchMock = mockFetchSequence([
      async () => ({ ok: true, json: async () => ({ features: [] }) } as Response),
      async () => ({ ok: true, json: async () => [] } as Response),
      async () => ({
        ok: true,
        json: async () => ({
          features: [
            {
              id: "place.tumakuru",
              place_name: "Tumakuru, Karnataka",
              text: "Tumakuru",
              center: [77.1, 13.34],
              place_type: ["place"],
            },
          ],
        }),
      } as Response),
    ]);

    const first = await searchPlacesInIndia("Tumakuru Industrial");
    expect(first.some((p) => p.placeId === "place.tumakuru")).toBe(false);

    resetPlacesProviderCooldownsForTests();
    const second = await searchPlacesInIndia("Tumakuru Industrial");
    expect(second.some((p) => p.placeId === "place.tumakuru")).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
  });

  it("does not cache provider errors and does not call Google Places", async () => {
    const fetchMock = mockFetchSequence([
      async () => ({ ok: false, status: 500, json: async () => ({}) } as Response),
      async () => ({ ok: true, json: async () => [] } as Response),
      // Mapbox is circuit-broken after 5xx; retry is Nominatim only.
      async () => ({
        ok: true,
        json: async () => [
          {
            place_id: 99,
            display_name: "Whitefield, Bengaluru, Karnataka",
            lat: "12.97",
            lon: "77.75",
            address: { city: "Bengaluru", state: "Karnataka" },
          },
        ],
      } as Response),
    ]);

    await searchPlacesInIndia("Whitefield factory");
    resetPlacesProviderCooldownsForTests();
    const recovered = await searchPlacesInIndia("Whitefield factory");
    expect(recovered[0]?.displayName).toContain("Whitefield");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("googleapis"))).toBe(
      false,
    );
  });

  it("dedupes in-flight identical queries without extra HTTP", async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = jest.fn(async () => pending);
    global.fetch = fetchMock as typeof fetch;

    const a = searchPlacesInIndia("Hosur SIPCOT");
    const b = searchPlacesInIndia("Hosur SIPCOT");
    resolveFirst?.({
      ok: true,
      json: async () => ({
        features: [
          {
            id: "place.hosur",
            place_name: "Hosur, Tamil Nadu",
            text: "Hosur",
            center: [77.82, 12.74],
            place_type: ["place"],
          },
        ],
      }),
    } as Response);

    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toEqual(rb);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("reverseGeocodePlaceInIndia URL", () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
    else process.env.EXPO_PUBLIC_MAPBOX_TOKEN = originalToken;
  });

  it("calls nominatim.openstreetmap.org/reverse", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("nominatim.openstreetmap.org/reverse?");
      expect(url).not.toContain("/search/reverse");
      return {
        ok: true,
        json: async () => ({
          display_name: "Hosur, Tamil Nadu",
          address: { city: "Hosur", state: "Tamil Nadu", postcode: "635109" },
        }),
      } as Response;
    });
    global.fetch = fetchMock as typeof fetch;

    const geo = await reverseGeocodePlaceInIndia(12.74, 77.82);
    expect(geo.city).toBe("Hosur");
    expect(fetchMock).toHaveBeenCalled();
  });
});
