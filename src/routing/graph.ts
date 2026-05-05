import { haversineM, nodeKey, segmentLengthM } from './geo';

type GeoJsonProperties = Record<string, unknown> | null;

type LineString = {
  type: 'LineString';
  coordinates: [number, number][];
};

type Feature = {
  type: 'Feature';
  geometry: LineString | null;
  properties?: GeoJsonProperties;
};

export type FeatureCollection = {
  type: 'FeatureCollection';
  features: Feature[];
};

export type EdgeMeta = {
  slope_grade?: string | null;
  highway?: string | null;
  length_m: number;
  forwardCostPart: number;
};

export type WeightedEdge = {
  to: string;
  weight: number;
  meta: EdgeMeta;
};

export type RoutingGraph = {
  adj: Map<string, WeightedEdge[]>;
  nodeCoords: Map<string, { lng: number; lat: number }>;
};

function getNum(p: GeoJsonProperties, ...keys: string[]): number {
  if (!p || typeof p !== 'object') return NaN;
  const o = p as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = parseFloat(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return NaN;
}

export function buildGraphFromGeoJSON(
  fc: FeatureCollection,
  options?: { excludeSteps?: boolean },
): RoutingGraph {
  const adj = new Map<string, WeightedEdge[]>();
  const nodeCoords = new Map<string, { lng: number; lat: number }>();

  const addEdge = (from: string, edge: WeightedEdge) => {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(edge);
  };

  const excludeSteps = options?.excludeSteps ?? false;

  for (const f of fc.features) {
    if (!f || f.geometry?.type !== 'LineString') continue;
    const line = f.geometry as LineString;
    const coords = line.coordinates as [number, number][];
    if (!coords || coords.length < 2) continue;

    const p = f.properties as Record<string, unknown> | null;
    const highway = (p?.highway as string) || null;
    const roadPenalty = getNum(p ?? {}, 'road_penalty');
    if (excludeSteps && (highway === 'steps' || roadPenalty >= 9999)) continue;

    const lengthM =
      getNum(p ?? {}, 'length_m') ||
      coords.reduce((sum, c, i) => {
        if (i === 0) return sum;
        return sum + segmentLengthM(coords[i - 1]!, c);
      }, 0);

    const costForward = getNum(p ?? {}, 'cost');
    const costReverse = getNum(p ?? {}, 'reverse_cost');
    const cf = Number.isFinite(costForward) ? costForward : lengthM;
    const cr = Number.isFinite(costReverse) ? costReverse : lengthM;

    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i]!;
      const b = coords[i + 1]!;
      const segLen = segmentLengthM(a, b);
      const ratio =
        lengthM > 0 ? segLen / lengthM : segLen / (coords.length - 1 || 1);
      const wF = cf * ratio;
      const wR = cr * ratio;
      const keyA = nodeKey(a[0], a[1]);
      const keyB = nodeKey(b[0], b[1]);
      nodeCoords.set(keyA, { lng: a[0], lat: a[1] });
      nodeCoords.set(keyB, { lng: b[0], lat: b[1] });

      const slope = (p?.slope_grade as string) || null;
      const metaAB: EdgeMeta = {
        slope_grade: slope,
        highway,
        length_m: segLen,
        forwardCostPart: wF,
      };
      const metaBA: EdgeMeta = {
        slope_grade: slope,
        highway,
        length_m: segLen,
        forwardCostPart: wR,
      };

      addEdge(keyA, { to: keyB, weight: wF, meta: metaAB });
      addEdge(keyB, { to: keyA, weight: wR, meta: metaBA });
    }
  }

  return { adj, nodeCoords };
}

/** 근접 노드 탐색 (대략적인 위경도 박스로 후보 축소) */
export function nearestNodeKey(
  graph: RoutingGraph,
  point: { lat: number; lng: number },
  maxMeters: number,
): string | null {
  const latDelta = maxMeters / 111000;
  const lngDelta = maxMeters / (111000 * Math.cos((point.lat * Math.PI) / 180) || 1);
  let best: string | null = null;
  let bestD = Infinity;
  for (const [k, c] of graph.nodeCoords) {
    if (
      Math.abs(c.lat - point.lat) > latDelta ||
      Math.abs(c.lng - point.lng) > lngDelta
    ) {
      continue;
    }
    const d = haversineM(point, { lat: c.lat, lng: c.lng });
    if (d < bestD && d <= maxMeters) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

export function collectSlopeSummary(edges: EdgeMeta[]): {
  hard: number;
  caution: number;
  totalLen: number;
  totalCost: number;
} {
  let hard = 0;
  let caution = 0;
  let totalLen = 0;
  let totalCost = 0;
  for (const e of edges) {
    totalLen += e.length_m;
    totalCost += e.forwardCostPart;
    const g = e.slope_grade;
    if (g === 'hard') hard += e.length_m;
    else if (g === 'caution') caution += e.length_m;
  }
  return { hard, caution, totalLen, totalCost };
}

export function keysToLatLngPath(
  keys: string[],
  graph: RoutingGraph,
): { lat: number; lng: number }[] {
  return keys.map((k) => {
    const c = graph.nodeCoords.get(k);
    if (!c) return { lat: 0, lng: 0 };
    return { lat: c.lat, lng: c.lng };
  });
}
