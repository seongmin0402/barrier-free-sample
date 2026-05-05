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
import { buildTurnSegments, stopSpeaking } from './voice';
import {
  isNavigationActive,
  startLiveNavigation,
  stopLiveNavigation,
} from './navigation';
import { fetchDrivingRouteJson, pickDrivingPolyline } from './driving-api';

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
let drivingPoly: naver.maps.Polyline | null = null;
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

function syncVoiceButtonAfterNav(): void {
  const voiceBtn = document.getElementById('btn-voice') as HTMLButtonElement;
  voiceBtn.textContent = '길안내';
  voiceBtn.disabled = lastPathKeys.length < 2;
}

function setDrivingControlsEnabled(on: boolean): void {
  const chk = document.getElementById('chk-driving') as HTMLInputElement;
  const sel = document.getElementById('sel-driving-option') as HTMLSelectElement;
  if (chk) {
    chk.disabled = !on;
    if (!on) chk.checked = false;
  }
  if (sel) sel.disabled = !on;
}

function clearDrivingOverlay(): void {
  drivingPoly?.setMap(null);
  drivingPoly = null;
  const st = document.getElementById('driving-status');
  if (st) {
    st.classList.add('hidden');
    st.innerHTML = '';
    delete st.dataset.error;
  }
}

function setDrivingStatus(html: string, isError: boolean): void {
  const st = document.getElementById('driving-status');
  if (!st) return;
  st.classList.remove('hidden');
  st.innerHTML = html;
  if (isError) st.dataset.error = '1';
  else delete st.dataset.error;
}

async function refreshDrivingRoute(): Promise<void> {
  const chk = document.getElementById('chk-driving') as HTMLInputElement;
  const sel = document.getElementById('sel-driving-option') as HTMLSelectElement;
  clearDrivingOverlay();
  if (!chk?.checked || !fromPt || !toPt) return;

  const start = `${fromPt.lng()},${fromPt.lat()}`;
  const goal = `${toPt.lng()},${toPt.lat()}`;
  setDrivingStatus('차량 도로 경로를 불러오는 중…', false);

  try {
    const raw = (await fetchDrivingRouteJson({
      start,
      goal,
      option: sel?.value || 'traoptimal',
    })) as { code?: number; message?: string; messge?: string };
    if (raw.code !== 0) {
      const apiMsg = raw.message ?? raw.messge;
      setDrivingStatus(
        apiMsg ?? `탐색 실패 (코드 ${String(raw.code)})`,
        true,
      );
      return;
    }
    const picked = pickDrivingPolyline(raw);
    if (!picked?.path.length) {
      setDrivingStatus('경로 좌표가 없습니다.', true);
      return;
    }
    drivingPoly = new naver.maps.Polyline({
      map,
      path: picked.path,
      strokeWeight: 5,
      strokeColor: '#1565c0',
      strokeOpacity: 0.85,
      strokeStyle: 'solid',
      zIndex: 45,
    });
    const s = picked.summary;
    const mins =
      s && Number.isFinite(s.duration)
        ? Math.max(1, Math.round(s.duration / 60000))
        : null;
    const distStr =
      s && Number.isFinite(s.distance)
        ? s.distance >= 1000
          ? `${(s.distance / 1000).toFixed(1)} km`
          : `${Math.round(s.distance)} m`
        : '—';
    setDrivingStatus(
      `<strong>네이버 차량 경로</strong> (${picked.routeKey}) · 거리 ${distStr}${
        mins != null ? ` · 약 ${mins}분` : ''
      } · 통행료 ${s != null && Number.isFinite(s.tollFare) ? `${s.tollFare.toLocaleString('ko-KR')}원` : '—'}`,
      false,
    );
  } catch (e) {
    setDrivingStatus(String(e), true);
  }
}

function tryComputeRoute(): void {
  if (!routingGraph || !fromPt || !toPt) return;

  if (isNavigationActive()) stopLiveNavigation(false);
  clearDrivingOverlay();

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
    setDrivingControlsEnabled(false);
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
  setDrivingControlsEnabled(true);
  const drivingChk = document.getElementById('chk-driving') as HTMLInputElement;
  if (drivingChk?.checked) void refreshDrivingRoute();
}

function clearRoute(): void {
  stopSpeaking();
  stopLiveNavigation(false);
  clearDrivingOverlay();
  setDrivingControlsEnabled(false);
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

  document.getElementById('chk-driving')?.addEventListener('change', () => {
    void refreshDrivingRoute();
  });
  document.getElementById('sel-driving-option')?.addEventListener('change', () => {
    const chk = document.getElementById('chk-driving') as HTMLInputElement;
    if (chk?.checked) void refreshDrivingRoute();
  });

  document.getElementById('btn-voice')?.addEventListener('click', () => {
    if (isNavigationActive()) {
      stopLiveNavigation(true);
      return;
    }
    if (!routingGraph || !lastEdgeTo || lastPathKeys.length < 2) return;
    const pathLls = keysToLatLngPath(lastPathKeys, routingGraph);
    const segments = buildTurnSegments(lastPathKeys, lastEdgeTo);
    startLiveNavigation(map, pathLls, segments, {
      onStop: syncVoiceButtonAfterNav,
    });
  });

  document.getElementById('btn-nav-stop')?.addEventListener('click', () => {
    stopLiveNavigation(true);
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
