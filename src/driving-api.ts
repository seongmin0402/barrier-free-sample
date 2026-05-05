/** 브라우저 → 동일 출처 `/api/driving` 프록시 → 네이버 driving API */

export type DrivingSummary = {
  distance: number;
  duration: number;
  tollFare: number;
  taxiFare: number;
  fuelPrice: number;
};

export function drivingProxyUrl(query: string): string {
  const base =
    (import.meta.env.VITE_DRIVING_API_URL as string | undefined)?.trim() || '';
  const q = query.startsWith('?') ? query : `?${query}`;
  if (base.startsWith('http')) return `${base}${q}`;
  const path = base ? (base.startsWith('/') ? base : `/${base}`) : '/api/driving';
  return `${window.location.origin}${path}${q}`;
}

export async function fetchDrivingRouteJson(params: {
  start: string;
  goal: string;
  option?: string;
}): Promise<unknown> {
  const u = new URLSearchParams();
  u.set('start', params.start);
  u.set('goal', params.goal);
  if (params.option) u.set('option', params.option);
  const url = drivingProxyUrl(u.toString());
  const res = await fetch(url);
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Directions 응답이 JSON이 아닙니다 (${res.status})`);
  }
  if (!res.ok) {
    const err = (data as { error?: string })?.error ?? text;
    throw new Error(typeof err === 'string' ? err : `HTTP ${res.status}`);
  }
  return data;
}

export function pickDrivingPolyline(data: unknown): {
  path: { lat: number; lng: number }[];
  summary: DrivingSummary | null;
  routeKey: string;
} | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as {
    code?: number;
    route?: Record<string, { path?: [number, number][]; summary?: DrivingSummary }[]>;
  };
  if (d.code !== 0 || !d.route || typeof d.route !== 'object') return null;

  for (const routeKey of Object.keys(d.route)) {
    const units = d.route[routeKey];
    const first = units?.[0];
    const rawPath = first?.path;
    if (!rawPath?.length) continue;
    const path = rawPath.map(([lng, lat]) => ({ lat, lng }));
    return {
      path,
      summary: first?.summary ?? null,
      routeKey,
    };
  }
  return null;
}
