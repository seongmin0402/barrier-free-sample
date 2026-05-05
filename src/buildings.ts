export type FloorPhotoGroup = {
  floor: string;
  urls: string[];
};

export type Building = {
  lat: number;
  lng: number;
  building_name: string;
  floor: string;
  wheelchair_access: boolean;
  elevator_available: boolean;
  braille_available: boolean;
  toilet_available: boolean;
  auto_door_available: boolean;
  threshold_present: boolean;
  parking_capacity: string;
  parking_distance_entrance_m: string;
  ramp_available: boolean;
  description: string;
  floorPhotos: FloorPhotoGroup[];
};

export async function loadBuildings(baseUrl: string): Promise<Building[]> {
  const url = `${baseUrl}data/buildings.json`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn('buildings.json not found');
    return [];
  }
  return (await res.json()) as Building[];
}

export function renderBuildingPanel(b: Building): string {
  const flags: [string, boolean][] = [
    ['휠체어 접근', b.wheelchair_access],
    ['승강기', b.elevator_available],
    ['점자', b.braille_available],
    ['장애인 화장실', b.toilet_available],
    ['자동문', b.auto_door_available],
    ['턱 있음', b.threshold_present],
    ['경사로', b.ramp_available],
  ];
  const flagHtml = flags
    .map(
      ([label, v]) =>
        `<span class="flag ${v ? 'on' : 'off'}">${label}: ${v ? '예' : '아니오'}</span>`,
    )
    .join('');

  const photos = b.floorPhotos
    .map((g) => {
      const imgs = g.urls
        .map(
          (u) =>
            `<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><img src="${escapeHtml(u)}" alt="${escapeHtml(g.floor)}" loading="lazy" /></a>`,
        )
        .join('');
      return `<section class="floor-block"><h4>${escapeHtml(g.floor)}</h4><div class="thumb-grid">${imgs}</div></section>`;
    })
    .join('');

  return `
    <h2>${escapeHtml(b.building_name)}</h2>
    <p class="meta">층수 정보: ${escapeHtml(b.floor)}</p>
    <div class="flags">${flagHtml}</div>
    <p class="meta">주차: ${escapeHtml(String(b.parking_capacity))}대 / 입구까지 약 ${escapeHtml(String(b.parking_distance_entrance_m))}m</p>
    <div class="description"><pre>${escapeHtml(b.description)}</pre></div>
    <h3>층별 사진</h3>
    ${photos || '<p>등록된 사진 없음</p>'}
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
