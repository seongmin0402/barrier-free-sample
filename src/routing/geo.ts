/** Haversine distance in meters (WGS84) */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const lat1 = toR(a.lat);
  const lat2 = toR(b.lat);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function segmentLengthM(
  p: [number, number],
  q: [number, number],
): number {
  return haversineM({ lat: p[1], lng: p[0] }, { lat: q[1], lng: q[0] });
}

export function nodeKey(lng: number, lat: number): string {
  return `${lng.toFixed(6)},${lat.toFixed(6)}`;
}

export function parseNodeKey(key: string): { lng: number; lat: number } {
  const [lng, lat] = key.split(',').map(Number);
  return { lng, lat };
}
