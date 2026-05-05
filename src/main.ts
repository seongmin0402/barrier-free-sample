import './style.css';
import { loadNaverMapScript } from './naver-loader';
import {
  loadBuildings,
  renderBuildingPanel,
  type Building,
} from './buildings';
import {
  buildGraphFromGeoJSON,
  nearestNodeKey,
  keysToLatLngPath,
  collectSlopeSummary,
  type FeatureCollection,
  type RoutingGraph,
} from './routing/graph';
import { dijkstraGraph, reconstructPath } from './routing/dijkstra';
import { buildVoiceScript, speakLines, stopSpeaking } from './voice';

const CENTER = { lat: 36.4692, lng: 127.141 };
const SNAP_MAX_M = 120;
const BASE = import.meta.env.BASE_URL;

type PoiEntrance = {
  entrance_id: string;
  lat: number;
  lng: number;
  entrance_name: string;
  building_name: string;
  memo?: string;
};

type PoiEv = {
  elevator_id: string;
  lat: number;
  lng: number;
  elevator_name: string;
  building_name: string;
};

type RouteMode = 'none' | 'from' | 'to';

let map: naver.maps.Map;
let routePoly: naver.maps.Polyline | null = null;
let networkLines: naver.maps.Polyline[] = [];
let buildingMarkers: naver.maps.Marker[] = [];
let entranceMarkers: naver.maps.Marker[] = [];
let evMarkers: naver.maps.Marker[] = [];

let routingGraph: RoutingGraph | null = null;
let geoFc: FeatureCollection | null = null;

let routeMode: RouteMode = 'none';
let fromPt: naver.maps.LatLng | null = null;
let toPt: naver.maps.LatLng | null = null;
let fromMarker: naver.maps.Marker | null = null;
let toMarker: naver.maps.Marker | null = null;

let lastPathKeys: string[] = [];
let lastEdgeTo: Map<string, import('./routing/graph').WeightedEdge> | null =
  null;

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function showPanel(html: string): void {
  const panel = document.getElementById('side-panel');
  const body = document.getElementById('panel-body');
  if (!panel || !body) return;
  body.innerHTML = html;
  panel.classList.remove('hidden');
}

function hidePanel(): void {
  document.getElementById('side-panel')?.classList.add('hidden');
}

function iconHtml(inner: string, cls: string): string {
  return `<div class="bf-marker ${cls}">${inner}</div>`;
}

function wireMapTypeButtons(): void {
  const wrap = document.querySelector('.buttons.map-type-buttons');
  if (!wrap) return;

  const btns = wrap.querySelectorAll<HTMLInputElement>('input[type="button"]');
  const typeById = naver.maps.MapTypeId as Record<string, unknown>;

  btns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const mapTypeId = (e.currentTarget as HTMLInputElement).id;
      const nextType = typeById[mapTypeId];
      if (nextType === undefined) return;

      if (map.getMapTypeId() !== nextType) {
        map.setMapTypeId(nextType);
        btns.forEach((b) => b.classList.remove('control-on'));
        (e.currentTarget as HTMLInputElement).classList.add('control-on');
      }
    });
  });
}

function initMap(): void {
  if (!document.getElementById('map')) throw new Error('#map missing');

  map = new naver.maps.Map('map', {
    center: new naver.maps.LatLng(CENTER.lat, CENTER.lng),
    zoom: 16,
    scaleControl: false,
    logoControl: false,
    mapDataControl: false,
    zoomControl: true,
    minZoom: 6,
  });

  naver.maps.Event.addListener(map, 'click', onMapClick);
  wireMapTypeButtons();
}

function onMapClick(e: unknown): void {
  if (routeMode === 'none' || !routingGraph) return;
  const evt = e as { coord: naver.maps.LatLng };
  const ll = evt.coord;
  const lat = typeof ll.lat === 'function' ? ll.lat() : (ll as { lat: number }).lat;
  const lng = typeof ll.lng === 'function' ? ll.lng() : (ll as { lng: number }).lng;

  const snapped = nearestNodeKey(
    routingGraph,
    { lat, lng },
    SNAP_MAX_M,
  );
  if (!snapped) {
    alert(`보행 네트워크에서 ${SNAP_MAX_M}m 안의 지점을 선택해 주세요.`);
    return;
  }

  const c = routingGraph.nodeCoords.get(snapped)!;
  const pos = new naver.maps.LatLng(c.lat, c.lng);

  if (routeMode === 'from') {
    fromPt = pos;
    if (fromMarker) fromMarker.setMap(null);
    fromMarker = new naver.maps.Marker({
      position: pos,
      map,
      title: '출발',
      icon: {
        content: iconHtml('A', 'from'),
      },
    });
  } else if (routeMode === 'to') {
    toPt = pos;
    if (toMarker) toMarker.setMap(null);
    toMarker = new naver.maps.Marker({
      position: pos,
      map,
      title: '도착',
      icon: {
        content: iconHtml('B', 'to'),
      },
    });
  }

  tryComputeRoute();
}

function tryComputeRoute(): void {
  if (!routingGraph || !fromPt || !toPt) return;

  const fromKey = nearestNodeKey(
    routingGraph,
    {
      lat: fromPt.lat(),
      lng: fromPt.lng(),
    },
    SNAP_MAX_M,
  );
  const toKey = nearestNodeKey(
    routingGraph,
    { lat: toPt.lat(), lng: toPt.lng() },
    SNAP_MAX_M,
  );
  if (!fromKey || !toKey) return;

  const excl =
    (document.getElementById('chk-wheelchair') as HTMLInputElement)?.checked ??
    false;
  if (geoFc) {
    routingGraph = buildGraphFromGeoJSON(geoFc, { excludeSteps: excl });
  }

  const res = dijkstraGraph(routingGraph, fromKey, toKey);
  const summaryEl = document.getElementById('route-summary');
  const voiceBtn = document.getElementById('btn-voice') as HTMLButtonElement;

  if (!res) {
    summaryEl!.classList.remove('hidden');
    summaryEl!.textContent =
      '선택한 출발·도착 사이에 보행 네트워크 경로를 찾지 못했습니다. 다른 지점을 찍거나 계단 제외 옵션을 바꿔 보세요.';
    voiceBtn.disabled = true;
    lastPathKeys = [];
    lastEdgeTo = null;
    if (routePoly) routePoly.setMap(null);
    return;
  }

  const path = reconstructPath(res.prev, fromKey, toKey);
  lastPathKeys = path;
  lastEdgeTo = res.edgeTo;

  const edges: import('./routing/graph').EdgeMeta[] = [];
  for (let i = 1; i < path.length; i++) {
    const e = res.edgeTo.get(path[i]!);
    if (e) edges.push(e.meta);
  }
  const sum = collectSlopeSummary(edges);

  const pathLls = keysToLatLngPath(path, routingGraph);
  if (routePoly) routePoly.setMap(null);
  routePoly = new naver.maps.Polyline({
    map,
    path: pathLls,
    strokeWeight: 5,
    strokeColor: '#c62828',
    strokeOpacity: 0.92,
    strokeStyle: 'solid',
    zIndex: 50,
  });

  summaryEl!.classList.remove('hidden');
  summaryEl!.innerHTML = `
    <strong>경로 요약</strong><br/>
    길이 약 ${sum.totalLen.toFixed(0)} m · 가중 비용 합 ${sum.totalCost.toFixed(1)}<br/>
    주의·경사 구간(caution) 약 ${sum.caution.toFixed(0)} m · 어려움(hard) 약 ${sum.hard.toFixed(0)} m
  `;
  voiceBtn.disabled = false;
}

function clearRoute(): void {
  stopSpeaking();
  fromPt = null;
  toPt = null;
  lastPathKeys = [];
  lastEdgeTo = null;
  fromMarker?.setMap(null);
  toMarker?.setMap(null);
  fromMarker = null;
  toMarker = null;
  routePoly?.setMap(null);
  routePoly = null;
  document.getElementById('route-summary')?.classList.add('hidden');
  (document.getElementById('btn-voice') as HTMLButtonElement).disabled = true;
}

function placeBuildingMarkers(buildings: Building[]): void {
  for (const m of buildingMarkers) m.setMap(null);
  buildingMarkers = [];

  for (const b of buildings) {
    const pos = new naver.maps.LatLng(b.lat, b.lng);
    const marker = new naver.maps.Marker({
      map,
      position: pos,
      title: b.building_name,
      icon: {
        content: iconHtml('i', 'info'),
      },
      zIndex: 100,
    });
    naver.maps.Event.addListener(marker, 'click', () => {
      showPanel(renderBuildingPanel(b));
    });
    buildingMarkers.push(marker);
  }
}

function placeEntrances(rows: PoiEntrance[]): void {
  for (const m of entranceMarkers) m.setMap(null);
  entranceMarkers = [];
  for (const r of rows) {
    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(r.lat, r.lng),
      title: `${r.building_name} ${r.entrance_name}`,
      icon: {
        content: iconHtml('출', 'ent'),
      },
      zIndex: 90,
    });
    naver.maps.Event.addListener(marker, 'click', () => {
      showPanel(
        `<h3>${escapeHtml(r.building_name)}</h3><p>${escapeHtml(r.entrance_name)}</p><p>${escapeHtml(r.memo ?? '')}</p>`,
      );
    });
    entranceMarkers.push(marker);
  }
  entranceMarkers.forEach((m) => m.setMap(null));
}

function placeEv(rows: PoiEv[]): void {
  for (const m of evMarkers) m.setMap(null);
  evMarkers = [];
  for (const r of rows) {
    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(r.lat, r.lng),
      title: r.elevator_name,
      icon: {
        content: iconHtml('EV', 'ev'),
      },
      zIndex: 95,
    });
    naver.maps.Event.addListener(marker, 'click', () => {
      showPanel(
        `<h3>${escapeHtml(r.building_name)}</h3><p>${escapeHtml(r.elevator_name)}</p>`,
      );
    });
    evMarkers.push(marker);
  }
  evMarkers.forEach((m) => m.setMap(null));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function drawNetwork(fc: FeatureCollection): void {
  for (const p of networkLines) p.setMap(null);
  networkLines = [];

  for (const f of fc.features) {
    if (f.geometry?.type !== 'LineString') continue;
    const coords = f.geometry.coordinates as [number, number][];
    const path = coords.map(
      ([lng, lat]) => ({ lat, lng }) as naver.maps.LatLngLiteral,
    );
    const poly = new naver.maps.Polyline({
      map,
      path,
      strokeWeight: 2,
      strokeColor: '#546e7a',
      strokeOpacity: 0.35,
      zIndex: 5,
    });
    poly.setMap(null);
    networkLines.push(poly);
  }
}

function setNetworkVisible(v: boolean): void {
  networkLines.forEach((p) => p.setMap(v ? map : null));
}

async function bootstrap(): Promise<void> {
  const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
  if (!clientId) {
    document.body.innerHTML =
      '<div style="padding:24px;font-family:sans-serif;">환경 변수 <code>VITE_NAVER_MAP_CLIENT_ID</code> 가 필요합니다. <code>.env</code> 를 참고하세요.</div>';
    return;
  }

  await loadNaverMapScript(clientId);
  initMap();

  const buildings = await loadBuildings(BASE);
  placeBuildingMarkers(buildings);

  const entrances = await fetchJson<PoiEntrance[]>('data/entrances.json');
  if (entrances?.length) placeEntrances(entrances);

  const evs = await fetchJson<PoiEv[]>('data/ev.json');
  if (evs?.length) placeEv(evs);

  const net = await fetchJson<FeatureCollection>('data/network.geojson');
  if (net?.features?.length) {
    geoFc = net;
    const excl =
      (document.getElementById('chk-wheelchair') as HTMLInputElement)
        ?.checked ?? false;
    routingGraph = buildGraphFromGeoJSON(net, { excludeSteps: excl });
    drawNetwork(net);
  }

  document.getElementById('panel-close')?.addEventListener('click', hidePanel);

  document.getElementById('btn-mode-none')?.addEventListener('click', () => {
    routeMode = 'none';
    setActiveModeBtn('btn-mode-none');
  });
  document.getElementById('btn-mode-from')?.addEventListener('click', () => {
    routeMode = 'from';
    setActiveModeBtn('btn-mode-from');
  });
  document.getElementById('btn-mode-to')?.addEventListener('click', () => {
    routeMode = 'to';
    setActiveModeBtn('btn-mode-to');
  });
  document.getElementById('btn-route-clear')?.addEventListener('click', () => {
    clearRoute();
  });

  document.getElementById('chk-network')?.addEventListener('change', (e) => {
    setNetworkVisible((e.target as HTMLInputElement).checked);
  });
  document.getElementById('chk-entrances')?.addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).checked;
    entranceMarkers.forEach((m) => m.setMap(v ? map : null));
  });
  document.getElementById('chk-ev')?.addEventListener('change', (e) => {
    const v = (e.target as HTMLInputElement).checked;
    evMarkers.forEach((m) => m.setMap(v ? map : null));
  });

  document.getElementById('chk-wheelchair')?.addEventListener('change', () => {
    if (!geoFc) return;
    const excl =
      (document.getElementById('chk-wheelchair') as HTMLInputElement)
        ?.checked ?? false;
    routingGraph = buildGraphFromGeoJSON(geoFc, { excludeSteps: excl });
    tryComputeRoute();
  });

  document.getElementById('btn-voice')?.addEventListener('click', () => {
    if (!lastEdgeTo || lastPathKeys.length < 2) return;
    const lines = buildVoiceScript(lastPathKeys, lastEdgeTo);
    speakLines(lines);
  });

  window.addEventListener('beforeunload', () => stopSpeaking());
}

function setActiveModeBtn(id: string): void {
  for (const x of ['btn-mode-none', 'btn-mode-from', 'btn-mode-to']) {
    document.getElementById(x)?.classList.toggle('active', x === id);
  }
}

bootstrap().catch((e) => {
  console.error(e);
  document.body.innerHTML += `<pre>${String(e)}</pre>`;
});
