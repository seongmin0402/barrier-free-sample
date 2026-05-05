/**
 * barrier_free_data CSV → public/data/buildings.json
 * entrances_template.csv → public/data/entrances.json
 * EV.csv → public/data/ev.json
 *
 * Env: BARRIER_CSV, ENTRANCES_CSV, EV_CSV
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const defaultBarrier = path.join(
  'C:',
  'Users',
  'seongmin',
  'Downloads',
  'barrier_free_data_1777947068096.csv',
);
const defaultEnt = path.join(
  'C:',
  'Users',
  'seongmin',
  'Desktop',
  'entrances_template.csv',
);
const defaultEv = path.join('C:', 'Users', 'seongmin', 'Desktop', 'EV.csv');

const BARRIER_CSV = process.env.BARRIER_CSV || defaultBarrier;
const ENTRANCES_CSV = process.env.ENTRANCES_CSV || defaultEnt;
const EV_CSV = process.env.EV_CSV || defaultEv;

function readCsv(p) {
  if (!fs.existsSync(p)) {
    console.warn('[build-buildings] missing:', p);
    return [];
  }
  const text = fs.readFileSync(p, 'utf8');
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (parsed.errors?.length) {
    console.warn('[build-buildings] parse warnings:', parsed.errors.slice(0, 3));
  }
  return parsed.data || [];
}

function parseBool(v) {
  if (v === true || v === false) return v;
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function parseFloorPhotos(jsonStr) {
  if (!jsonStr || String(jsonStr).trim() === '') return [];
  try {
    const arr = JSON.parse(String(jsonStr));
    if (!Array.isArray(arr)) return [];
    return arr.map((g) => {
      const files = g.imageFiles || [];
      const urls = files.map((f) => f.url).filter(Boolean);
      return { floor: String(g.floor ?? ''), urls };
    });
  } catch {
    return [];
  }
}

function buildBuildings(rows) {
  const list = [];
  for (const row of rows) {
    if (!row.lat || !row.lng || !row.building_name) continue;
    list.push({
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      building_name: String(row.building_name),
      floor: String(row.floor ?? ''),
      wheelchair_access: parseBool(row.wheelchair_access),
      elevator_available: parseBool(row.elevator_available),
      braille_available: parseBool(row.braille_available),
      toilet_available: parseBool(row.toilet_available),
      auto_door_available: parseBool(row.auto_door_available),
      threshold_present: parseBool(row.threshold_present),
      parking_capacity: String(row.parking_capacity ?? ''),
      parking_distance_entrance_m: String(row.parking_distance_entrance_m ?? ''),
      ramp_available: parseBool(row.ramp_available),
      description: String(row.description ?? ''),
      floorPhotos: parseFloorPhotos(row.floorPhotoGroupsJson),
    });
  }
  return list;
}

function buildEntrances(rows) {
  const list = [];
  for (const row of rows) {
    if (!row.lat || !row.lng) continue;
    list.push({
      entrance_id: String(row.entrance_id ?? ''),
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      entrance_name: String(row.entrance_name ?? ''),
      building_name: String(row.building_name ?? ''),
      memo: String(row.memo ?? ''),
    });
  }
  return list;
}

function buildEv(rows) {
  const list = [];
  for (const row of rows) {
    if (!row.lat || !row.lng) continue;
    list.push({
      elevator_id: String(row.elevator_id ?? ''),
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      elevator_name: String(row.elevator_name ?? ''),
      building_name: String(row.building_name ?? ''),
    });
  }
  return list;
}

const outDir = path.join(root, 'public', 'data');
fs.mkdirSync(outDir, { recursive: true });

const buildings = buildBuildings(readCsv(BARRIER_CSV));
fs.writeFileSync(
  path.join(outDir, 'buildings.json'),
  JSON.stringify(buildings),
);
console.log('[build-buildings] buildings.json:', buildings.length);

const entrances = buildEntrances(readCsv(ENTRANCES_CSV));
fs.writeFileSync(
  path.join(outDir, 'entrances.json'),
  JSON.stringify(entrances),
);
console.log('[build-buildings] entrances.json:', entrances.length);

const evs = buildEv(readCsv(EV_CSV));
fs.writeFileSync(path.join(outDir, 'ev.json'), JSON.stringify(evs));
console.log('[build-buildings] ev.json:', evs.length);
