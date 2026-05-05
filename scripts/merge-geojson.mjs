/**
 * Merge 4.geojson + wep.geojson + bokang.geojson into public/data/network.geojson
 * Dedup by properties["@id"] || properties.id || properties.osm_id
 *
 * Env overrides:
 *   GEO_4, GEO_WEP, GEO_BOKANG — source file paths
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const default4 = path.join(
  'C:',
  'Users',
  'seongmin',
  'Desktop',
  '경사도',
  '최종',
  '4.geojson',
);
const defaultWep = path.join(
  'C:',
  'Users',
  'seongmin',
  'Desktop',
  '경사도',
  '최종',
  'wep.geojson',
);
const defaultBokang = path.join(
  'C:',
  'Users',
  'seongmin',
  'Desktop',
  '경사도',
  '최종',
  '경사도보강',
  'bokang.geojson',
);

const p4 = process.env.GEO_4 || default4;
const pWep = process.env.GEO_WEP || defaultWep;
const pBokang = process.env.GEO_BOKANG || defaultBokang;

function readFc(p) {
  if (!fs.existsSync(p)) {
    console.warn('[merge-geojson] missing file:', p);
    return { type: 'FeatureCollection', features: [] };
  }
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

function featureId(f, label) {
  const pr = f.properties || {};
  const id = pr['@id'] ?? pr.id ?? pr.osm_id ?? pr.osmId;
  if (id != null && id !== '') return `id:${String(id)}`;
  const g = f.geometry;
  const head =
    g?.type === 'LineString' && g.coordinates?.[0]
      ? g.coordinates[0].join(',')
      : '';
  return `${label}:${head}:${pr.fid ?? ''}`;
}

const seen = new Set();
const out = {
  type: 'FeatureCollection',
  name: 'merged_network',
  features: [],
};

function addFrom(fc, label) {
  const list = fc.features || [];
  let added = 0;
  let skipped = 0;
  for (const f of list) {
    const k = featureId(f, label);
    if (seen.has(k)) {
      skipped += 1;
      continue;
    }
    seen.add(k);
    f.properties = { ...(f.properties || {}), _source: label };
    out.features.push(f);
    added += 1;
  }
  console.log(`[merge-geojson] ${label}: +${added} features, skipped ${skipped} dupes`);
}

addFrom(readFc(p4), '4');
addFrom(readFc(pWep), 'wep');
addFrom(readFc(pBokang), 'bokang');

const outDir = path.join(root, 'public', 'data');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'network.geojson');
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('[merge-geojson] wrote', outPath, 'features:', out.features.length);
