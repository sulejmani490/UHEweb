import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import zlib from 'zlib';

const TERRAIN_BASE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/skadi';
const TILE_CACHE_DIR = path.join(os.tmpdir(), 'uhetech-local-contours');
const OUTPUT_PATH = new URL('../empire-map-local-contours.geojson', import.meta.url);
const HGT_NODATA = -32768;

const SITES = [
  {
    id: 'canberra',
    name: '堪培拉',
    bounds: { minLng: 148.98, maxLng: 149.28, minLat: -35.42, maxLat: -35.20 },
    interval: 20,
    indexInterval: 100,
    minContour: 0,
    sampleSpacingMeters: 95,
  },
  {
    id: 'nikenbah',
    name: '奈克姆近郊',
    bounds: { minLng: 152.70, maxLng: 153.03, minLat: -25.42, maxLat: -25.18 },
    interval: 5,
    indexInterval: 25,
    minContour: 0,
    sampleSpacingMeters: 105,
  },
  {
    id: 'sydney',
    name: '悉尼',
    bounds: { minLng: 151.02, maxLng: 151.34, minLat: -34.02, maxLat: -33.76 },
    interval: 10,
    indexInterval: 50,
    minContour: 0,
    sampleSpacingMeters: 95,
  },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const latBand = (lat) => `${lat < 0 ? 'S' : 'N'}${String(Math.abs(lat)).padStart(2, '0')}`;

const lonBand = (lng) => `${lng < 0 ? 'W' : 'E'}${String(Math.abs(lng)).padStart(3, '0')}`;

const tileName = (lat, lng) => `${latBand(lat)}${lonBand(lng)}`;

const tileUrl = (lat, lng) => {
  const name = tileName(lat, lng);
  return `${TERRAIN_BASE_URL}/${latBand(lat)}/${name}.hgt.gz`;
};

const downloadBuffer = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const readTile = async (lat, lng) => {
  const name = tileName(lat, lng);
  await fs.mkdir(TILE_CACHE_DIR, { recursive: true });
  const cachePath = path.join(TILE_CACHE_DIR, `${name}.hgt`);

  let buffer;
  try {
    buffer = await fs.readFile(cachePath);
  } catch {
    const gzBuffer = await downloadBuffer(tileUrl(lat, lng));
    buffer = await new Promise((resolve, reject) => {
      zlib.gunzip(gzBuffer, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
    await fs.writeFile(cachePath, buffer);
  }

  const sampleCount = buffer.length / 2;
  const side = Math.sqrt(sampleCount);
  if (!Number.isInteger(side)) {
    throw new Error(`${name}.hgt has unexpected size ${buffer.length}`);
  }

  return { lat, lng, name, side, buffer };
};

const tilesForBounds = async (bounds) => {
  const tiles = new Map();
  const minLatTile = Math.floor(bounds.minLat);
  const maxLatTile = Math.floor(bounds.maxLat);
  const minLngTile = Math.floor(bounds.minLng);
  const maxLngTile = Math.floor(bounds.maxLng);

  for (let lat = minLatTile; lat <= maxLatTile; lat += 1) {
    for (let lng = minLngTile; lng <= maxLngTile; lng += 1) {
      const tile = await readTile(lat, lng);
      tiles.set(tile.name, tile);
    }
  }

  return tiles;
};

const elevationFromTile = (tile, lng, lat) => {
  const { side, buffer } = tile;
  const row = clamp((tile.lat + 1 - lat) * (side - 1), 0, side - 1);
  const col = clamp((lng - tile.lng) * (side - 1), 0, side - 1);
  const row0 = Math.floor(row);
  const col0 = Math.floor(col);
  const row1 = clamp(row0 + 1, 0, side - 1);
  const col1 = clamp(col0 + 1, 0, side - 1);
  const rowT = row - row0;
  const colT = col - col0;

  const valueAt = (r, c) => {
    const value = buffer.readInt16BE((r * side + c) * 2);
    return value <= HGT_NODATA ? null : value;
  };

  const v00 = valueAt(row0, col0);
  const v10 = valueAt(row0, col1);
  const v01 = valueAt(row1, col0);
  const v11 = valueAt(row1, col1);
  if ([v00, v10, v01, v11].some((value) => value === null)) return null;

  const north = v00 + (v10 - v00) * colT;
  const south = v01 + (v11 - v01) * colT;
  return north + (south - north) * rowT;
};

const sampleElevation = (tiles, lng, lat) => {
  const tileLat = Math.floor(lat);
  const tileLng = Math.floor(lng);
  const tile = tiles.get(tileName(tileLat, tileLng));
  if (!tile) return null;
  return elevationFromTile(tile, lng, lat);
};

const metersAcross = (bounds) => {
  const midLat = ((bounds.minLat + bounds.maxLat) / 2) * Math.PI / 180;
  return {
    width: (bounds.maxLng - bounds.minLng) * 111_320 * Math.cos(midLat),
    height: (bounds.maxLat - bounds.minLat) * 110_540,
  };
};

const buildGrid = async (site) => {
  const tiles = await tilesForBounds(site.bounds);
  const sizeMeters = metersAcross(site.bounds);
  const cols = clamp(Math.ceil(sizeMeters.width / site.sampleSpacingMeters) + 1, 90, 280);
  const rows = clamp(Math.ceil(sizeMeters.height / site.sampleSpacingMeters) + 1, 90, 280);
  const lons = Array.from({ length: cols }, (_, col) =>
    site.bounds.minLng + ((site.bounds.maxLng - site.bounds.minLng) * col) / (cols - 1)
  );
  const lats = Array.from({ length: rows }, (_, row) =>
    site.bounds.maxLat - ((site.bounds.maxLat - site.bounds.minLat) * row) / (rows - 1)
  );

  const values = lats.map((lat) =>
    Float32Array.from(lons.map((lng) => sampleElevation(tiles, lng, lat) ?? Number.NaN))
  );

  const finiteValues = values.flatMap((row) => Array.from(row).filter(Number.isFinite));
  return {
    rows,
    cols,
    lons,
    lats,
    values,
    minElevation: Math.min(...finiteValues),
    maxElevation: Math.max(...finiteValues),
  };
};

const crosses = (a, b, level) =>
  Number.isFinite(a) &&
  Number.isFinite(b) &&
  a !== b &&
  ((a < level && b >= level) || (b < level && a >= level));

const interpolate = (pointA, valueA, pointB, valueB, level) => {
  const t = clamp((level - valueA) / (valueB - valueA), 0, 1);
  return [
    Number((pointA[0] + (pointB[0] - pointA[0]) * t).toFixed(6)),
    Number((pointA[1] + (pointB[1] - pointA[1]) * t).toFixed(6)),
  ];
};

const makeContourSegments = (grid, level) => {
  const segments = [];

  for (let row = 0; row < grid.rows - 1; row += 1) {
    for (let col = 0; col < grid.cols - 1; col += 1) {
      const p0 = [grid.lons[col], grid.lats[row]];
      const p1 = [grid.lons[col + 1], grid.lats[row]];
      const p2 = [grid.lons[col + 1], grid.lats[row + 1]];
      const p3 = [grid.lons[col], grid.lats[row + 1]];
      const v0 = grid.values[row][col];
      const v1 = grid.values[row][col + 1];
      const v2 = grid.values[row + 1][col + 1];
      const v3 = grid.values[row + 1][col];

      const intersections = [];
      if (crosses(v0, v1, level)) intersections.push(interpolate(p0, v0, p1, v1, level));
      if (crosses(v1, v2, level)) intersections.push(interpolate(p1, v1, p2, v2, level));
      if (crosses(v3, v2, level)) intersections.push(interpolate(p3, v3, p2, v2, level));
      if (crosses(v0, v3, level)) intersections.push(interpolate(p0, v0, p3, v3, level));

      if (intersections.length === 2) {
        segments.push(intersections);
      } else if (intersections.length === 4) {
        segments.push([intersections[0], intersections[1]]);
        segments.push([intersections[2], intersections[3]]);
      }
    }
  }

  return segments;
};

const contourLevels = (grid, interval, minContour = -Infinity) => {
  const start = Math.max(Math.ceil(grid.minElevation / interval) * interval, minContour);
  const end = Math.floor(grid.maxElevation / interval) * interval;
  const levels = [];
  for (let level = start; level <= end; level += interval) {
    levels.push(level);
  }
  return levels;
};

const generateSiteContours = async (site) => {
  const grid = await buildGrid(site);
  const levels = contourLevels(grid, site.interval, site.minContour);

  return levels.flatMap((level) => {
    const segments = makeContourSegments(grid, level)
      .filter((line) => line.length === 2 && (line[0][0] !== line[1][0] || line[0][1] !== line[1][1]));
    if (!segments.length) return [];
    return [
      {
        type: 'Feature',
        properties: {
          siteId: site.id,
          siteName: site.name,
          elevation: level,
          contourInterval: site.interval,
          index: level % site.indexInterval === 0,
          source: 'Mapzen Terrain Tiles / AWS Open Data elevation-tiles-prod Skadi HGT',
        },
        geometry: {
          type: 'MultiLineString',
          coordinates: segments,
        },
      },
    ];
  });
};

const main = async () => {
  const features = [];
  for (const site of SITES) {
    console.log(`Generating contours for ${site.name}...`);
    features.push(...await generateSiteContours(site));
  }

  const output = {
    type: 'FeatureCollection',
    name: 'empire-map-local-contours-real-dem',
    source: 'Generated from Mapzen Terrain Tiles on AWS Open Data, Skadi HGT tiles.',
    generatedAt: new Date().toISOString(),
    features,
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${features.length} contour levels to ${OUTPUT_PATH.pathname}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
