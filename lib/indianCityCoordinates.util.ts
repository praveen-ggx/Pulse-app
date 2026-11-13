/** Lat/lon centroids for common Indian cities — HQ map + trip map fallbacks. */
export const INDIAN_CITY_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  mumbai: { latitude: 19.076, longitude: 72.8777 },
  "navi mumbai": { latitude: 19.033, longitude: 73.0297 },
  vasai: { latitude: 19.3919, longitude: 72.8397 },
  virar: { latitude: 19.4559, longitude: 72.8119 },
  "vasai virar": { latitude: 19.425, longitude: 72.82 },
  "vasai-virar": { latitude: 19.425, longitude: 72.82 },
  kalyan: { latitude: 19.2403, longitude: 73.1305 },
  delhi: { latitude: 28.6139, longitude: 77.209 },
  bangalore: { latitude: 12.9716, longitude: 77.5946 },
  bengaluru: { latitude: 12.9716, longitude: 77.5946 },
  chennai: { latitude: 13.0827, longitude: 80.2707 },
  kolkata: { latitude: 22.5726, longitude: 88.3639 },
  hyderabad: { latitude: 17.385, longitude: 78.4867 },
  ahmedabad: { latitude: 23.0225, longitude: 72.5714 },
  pune: { latitude: 18.5204, longitude: 73.8567 },
  surat: { latitude: 21.1702, longitude: 72.8311 },
  jaipur: { latitude: 26.9124, longitude: 75.7873 },
  lucknow: { latitude: 26.8467, longitude: 80.9462 },
  kanpur: { latitude: 26.4499, longitude: 80.3319 },
  nagpur: { latitude: 21.1458, longitude: 79.0882 },
  indore: { latitude: 22.7196, longitude: 75.8577 },
  thane: { latitude: 19.2183, longitude: 72.9781 },
  bhopal: { latitude: 23.2599, longitude: 77.4126 },
  visakhapatnam: { latitude: 17.6868, longitude: 83.2185 },
  patna: { latitude: 25.5941, longitude: 85.1376 },
  vadodara: { latitude: 22.3072, longitude: 73.1812 },
  ludhiana: { latitude: 30.901, longitude: 75.8573 },
  agra: { latitude: 27.1767, longitude: 78.0081 },
  nashik: { latitude: 19.9975, longitude: 73.7898 },
  meerut: { latitude: 28.9845, longitude: 77.7064 },
  rajkot: { latitude: 22.3039, longitude: 70.8022 },
  varanasi: { latitude: 25.3176, longitude: 82.9739 },
  aurangabad: { latitude: 19.8762, longitude: 75.3433 },
  amritsar: { latitude: 31.634, longitude: 74.8723 },
  coimbatore: { latitude: 11.0168, longitude: 76.9558 },
  mysore: { latitude: 12.2958, longitude: 76.6394 },
  mysuru: { latitude: 12.2958, longitude: 76.6394 },
  mangalore: { latitude: 12.9141, longitude: 74.856 },
  mangaluru: { latitude: 12.9141, longitude: 74.856 },
  // Common logistics / trip-ops cities (Manifest Range fallbacks)
  hosur: { latitude: 12.7409, longitude: 77.8253 },
  bhandara: { latitude: 21.17, longitude: 79.65 },
  ghaziabad: { latitude: 28.6692, longitude: 77.4538 },
  bhiwadi: { latitude: 28.2107, longitude: 76.8606 },
  bhiwandi: { latitude: 19.2813, longitude: 73.0485 },
  thrissur: { latitude: 10.5276, longitude: 76.2144 },
  trichur: { latitude: 10.5276, longitude: 76.2144 },
  nalgonda: { latitude: 17.0575, longitude: 79.267 },
  balasore: { latitude: 21.494, longitude: 86.9336 },
  balsore: { latitude: 21.494, longitude: 86.9336 },
  cuttack: { latitude: 20.4625, longitude: 85.883 },
  raipur: { latitude: 21.2514, longitude: 81.6296 },
  patiala: { latitude: 30.3398, longitude: 76.3869 },
  chittoor: { latitude: 13.2172, longitude: 79.1003 },
  guwahati: { latitude: 26.1445, longitude: 91.7362 },
  siddipet: { latitude: 18.1018, longitude: 78.852 },
  tiruvallur: { latitude: 13.1439, longitude: 79.9085 },
  thiruvallur: { latitude: 13.1439, longitude: 79.9085 },
  tumakuru: { latitude: 13.3379, longitude: 77.1173 },
  tumkur: { latitude: 13.3379, longitude: 77.1173 },
  tirunelveli: { latitude: 8.7139, longitude: 77.7567 },
  kalamassery: { latitude: 10.0533, longitude: 76.3276 },
  nizamabad: { latitude: 18.6725, longitude: 78.0941 },
  tirupati: { latitude: 13.6288, longitude: 79.4192 },
  pollachi: { latitude: 10.658, longitude: 77.0089 },
  karur: { latitude: 10.9601, longitude: 78.0766 },
  vijayawada: { latitude: 16.5062, longitude: 80.648 },
  medchal: { latitude: 17.6297, longitude: 78.4814 },
  pondicherry: { latitude: 11.9416, longitude: 79.8083 },
  puducherry: { latitude: 11.9416, longitude: 79.8083 },
  tiruvannamalai: { latitude: 12.2253, longitude: 79.0747 },
  thiruvannamalai: { latitude: 12.2253, longitude: 79.0747 },
  vandalur: { latitude: 12.8922, longitude: 80.081 },
  kanniyakumari: { latitude: 8.0883, longitude: 77.5385 },
  kanyakumari: { latitude: 8.0883, longitude: 77.5385 },
  udupi: { latitude: 13.3409, longitude: 74.7421 },
  faridabad: { latitude: 28.4089, longitude: 77.3178 },
  kurnool: { latitude: 15.8281, longitude: 78.0373 },
  karaikudi: { latitude: 10.0735, longitude: 78.7804 },
  ranchi: { latitude: 23.3441, longitude: 85.3096 },
  raichur: { latitude: 16.2076, longitude: 77.3463 },
  chengalpattu: { latitude: 12.6819, longitude: 79.9864 },
  jamshedpur: { latitude: 22.8046, longitude: 86.2029 },
  gadwal: { latitude: 16.234, longitude: 77.805 },
  amaravati: { latitude: 16.5131, longitude: 80.5165 },
  tanuku: { latitude: 16.7547, longitude: 81.6815 },
  chidambaram: { latitude: 11.399, longitude: 79.695 },
  bollaram: { latitude: 17.543, longitude: 78.35 },
  zahirabad: { latitude: 17.681, longitude: 77.607 },
  poonamallee: { latitude: 13.047, longitude: 80.095 },
  periyapalayam: { latitude: 13.3, longitude: 80.05 },
};

/** India geographic centroid — last-resort map center. */
export const INDIA_MAP_CENTER = { latitude: 20.5937, longitude: 78.9629 };

function normalizeCityKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resolve a city name to a known India centroid, if available. */
export function lookupIndianCityCoordinate(
  city?: string | null,
): { latitude: number; longitude: number } | null {
  const key = city ? normalizeCityKey(city) : "";
  if (!key) return null;
  if (INDIAN_CITY_COORDINATES[key]) return INDIAN_CITY_COORDINATES[key];
  for (const [name, coords] of Object.entries(INDIAN_CITY_COORDINATES)) {
    if (key.includes(name) || name.includes(key)) return coords;
  }
  return null;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
