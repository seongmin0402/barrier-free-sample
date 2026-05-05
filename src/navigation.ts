import { haversineM } from './routing/geo';
import { speakOnce, stopSpeaking } from './voice';

const DEFAULT_VERTEX_PASS_M = 20;
const FOLLOW_ZOOM = 17;

let watchId: number | null = null;
let userMarker: naver.maps.Marker | null = null;
let passedVertexIndex = 0;
let activePath: { lat: number; lng: number }[] | null = null;
let segmentTexts: string[] = [];
let onNavigationStop: (() => void) | null = null;

export function isNavigationActive(): boolean {
  return watchId !== null;
}

function updateNavPanel(remainingM: number): void {
  const nextEl = document.getElementById('nav-next-text');
  const remainEl = document.getElementById('nav-remain');
  if (!activePath || !nextEl || !remainEl) return;

  const nextIdx = Math.min(
    passedVertexIndex,
    Math.max(0, segmentTexts.length - 1),
  );
  nextEl.textContent = segmentTexts[nextIdx] ?? '다음 안내가 없습니다.';
  remainEl.textContent =
    remainingM >= 1000
      ? `${(remainingM / 1000).toFixed(1)} km`
      : `${Math.round(remainingM)} m`;
}

/** @param notify 콜백 호출 여부. 경로 삭제 시에는 false 로 호출해 버튼 상태 꼬임을 막습니다. */
export function stopLiveNavigation(notify = true): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  userMarker?.setMap(null);
  userMarker = null;
  activePath = null;
  segmentTexts = [];
  stopSpeaking();

  document.getElementById('nav-panel')?.classList.add('hidden');
  document.getElementById('route-summary')?.classList.remove('hidden');

  const btn = document.getElementById('btn-voice') as HTMLButtonElement | null;
  if (btn) {
    btn.textContent = '길안내';
  }

  const cb = notify ? onNavigationStop : null;
  onNavigationStop = null;
  cb?.();
}

export function startLiveNavigation(
  map: naver.maps.Map,
  pathPoints: { lat: number; lng: number }[],
  segments: string[],
  options?: {
    vertexPassM?: number;
    onStop?: () => void;
  },
): void {
  if (pathPoints.length < 2) return;

  stopLiveNavigation(true);
  onNavigationStop = options?.onStop ?? null;

  activePath = pathPoints;
  segmentTexts = segments;
  passedVertexIndex = 0;

  const passM = options?.vertexPassM ?? DEFAULT_VERTEX_PASS_M;

  document.getElementById('nav-panel')?.classList.remove('hidden');
  document.getElementById('route-summary')?.classList.add('hidden');

  const start = pathPoints[0]!;
  userMarker = new naver.maps.Marker({
    map,
    position: new naver.maps.LatLng(start.lat, start.lng),
    zIndex: 300,
    title: '내 위치',
    icon: {
      content: `<div class="user-location-marker"><span class="user-location-dot"></span></div>`,
      anchor: new naver.maps.Point(14, 14),
    },
  });

  map.setZoom(FOLLOW_ZOOM);
  map.panTo(new naver.maps.LatLng(start.lat, start.lng));

  if (segments[0]) speakOnce(segments[0]!);

  const dest = pathPoints[pathPoints.length - 1]!;
  updateNavPanel(haversineM(start, dest));

  const btn = document.getElementById('btn-voice') as HTMLButtonElement | null;
  if (btn) btn.textContent = '안내 종료';

  if (!navigator.geolocation) {
    alert('이 브라우저에서는 위치 정보를 사용할 수 없습니다.');
    stopLiveNavigation(true);
    return;
  }

  let reportedGeoError = false;

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const u = { lat, lng };

      userMarker?.setPosition(new naver.maps.LatLng(lat, lng));
      map.panTo(new naver.maps.LatLng(lat, lng));

      const path = activePath;
      if (!path) return;

      let progressed = true;
      while (progressed) {
        progressed = false;
        if (passedVertexIndex + 1 >= path.length) break;

        const nextV = path[passedVertexIndex + 1]!;
        if (haversineM(u, nextV) < passM) {
          passedVertexIndex += 1;
          progressed = true;

          if (passedVertexIndex >= path.length - 1) {
            speakOnce('목적지에 도착했습니다. 안내를 종료합니다.');
            stopLiveNavigation(true);
            return;
          }

          const msg = segmentTexts[passedVertexIndex];
          if (msg) speakOnce(msg);
        }
      }

      const last = path[path.length - 1]!;
      updateNavPanel(haversineM(u, last));
    },
    (err) => {
      if (!reportedGeoError && err.code !== err.PERMISSION_DENIED) {
        reportedGeoError = true;
        console.warn('geolocation', err);
      }
      if (err.code === err.PERMISSION_DENIED && !reportedGeoError) {
        reportedGeoError = true;
        alert('위치 권한을 허용해야 길안내를 이용할 수 있습니다.');
      }
    },
    { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 },
  );
}
