import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mediaDir = path.join(root, 'media');
const mapPath = path.join(mediaDir, 'station-map.json');

function fail(msg) {
  console.error(`[validate-station-map] ${msg}`);
  process.exitCode = 1;
}

if (!fs.existsSync(mapPath)) {
  fail(`Missing ${mapPath}`);
  process.exit(1);
}

let map;
try {
  map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
} catch (e) {
  fail(`Invalid JSON in station-map.json: ${e?.message || e}`);
  process.exit(1);
}

const scenes = map?.scenes;
if (!scenes || typeof scenes !== 'object') {
  fail('station-map.json missing "scenes" object');
  process.exit(1);
}

const start = map?.startScene;
if (!start || !scenes[start]) {
  fail(`startScene "${start}" missing or not found in scenes`);
}

let sceneCount = 0;
for (const [sceneId, scene] of Object.entries(scenes)) {
  sceneCount++;
  const image = scene?.image;
  if (!image) {
    fail(`Scene "${sceneId}" missing image`);
    continue;
  }

  const imagePath = path.join(mediaDir, image);
  if (!fs.existsSync(imagePath)) {
    fail(`Scene "${sceneId}" image not found: ${image}`);
  }

  const hs = Array.isArray(scene?.hotspots) ? scene.hotspots : [];
  for (const h of hs) {
    const hasRect = typeof h?.x === 'number' && typeof h?.y === 'number' && typeof h?.w === 'number' && typeof h?.h === 'number';
    const hasPoly = Array.isArray(h?.points) && h.points.length >= 3 && h.points.every(p => typeof p?.x === 'number' && typeof p?.y === 'number');

    if (!hasRect && !hasPoly) {
      fail(`Hotspot "${h?.id || '(no id)'}" in scene "${sceneId}" missing rect (x,y,w,h) or polygon (points[])`);
    }

    if (!h?.targetScene && !h?.action) {
      fail(`Hotspot "${h?.id || '(no id)'}" in scene "${sceneId}" missing targetScene or action`);
    }

    if (h?.targetScene && !scenes[h.targetScene]) {
      fail(`Hotspot "${h?.id || '(no id)'}" in scene "${sceneId}" targets missing scene: ${h.targetScene}`);
    }
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`[validate-station-map] OK (${sceneCount} scenes)`);
