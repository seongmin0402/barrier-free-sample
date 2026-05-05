import type { RoutingGraph, WeightedEdge } from './graph';

export type DijkstraResult = {
  prev: Map<string, string>;
  dist: Map<string, number>;
  edgeTo: Map<string, WeightedEdge>;
};

export function dijkstraGraph(
  graph: RoutingGraph,
  from: string,
  to: string,
): DijkstraResult | null {
  const { adj, nodeCoords } = graph;
  const nodes = [...nodeCoords.keys()];
  if (!nodeCoords.has(from) || !nodeCoords.has(to)) return null;

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const edgeTo = new Map<string, WeightedEdge>();
  const visited = new Set<string>();

  for (const k of nodes) dist.set(k, Infinity);
  dist.set(from, 0);

  while (true) {
    let u: string | null = null;
    let bestD = Infinity;
    for (const k of nodes) {
      if (visited.has(k)) continue;
      const d = dist.get(k) ?? Infinity;
      if (d < bestD) {
        bestD = d;
        u = k;
      }
    }
    if (u === null || bestD === Infinity) break;
    visited.add(u);
    if (u === to) break;

    for (const e of adj.get(u) ?? []) {
      const nd = bestD + e.weight;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, u);
        edgeTo.set(e.to, e);
      }
    }
  }

  if ((dist.get(to) ?? Infinity) === Infinity) return null;
  return { prev, dist, edgeTo };
}

export function reconstructPath(
  prev: Map<string, string>,
  from: string,
  to: string,
): string[] {
  const path: string[] = [];
  let cur: string | undefined = to;
  while (cur && cur !== from) {
    path.push(cur);
    cur = prev.get(cur);
  }
  if (cur !== from) return [];
  path.push(from);
  path.reverse();
  return path;
}
