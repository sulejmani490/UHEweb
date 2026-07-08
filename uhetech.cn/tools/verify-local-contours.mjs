import fs from 'fs/promises';

const CONTOUR_PATH = new URL('../empire-map-local-contours.geojson', import.meta.url);
const SITE_REQUIREMENTS = {
  canberra: { interval: 20, minFeatures: 8 },
  nikenbah: { interval: 5, minFeatures: 8 },
  sydney: { interval: 10, minFeatures: 8 },
};
const EXPECTED_SOURCE_FRAGMENT = 'Mapzen Terrain Tiles';

const readJson = async (url) => JSON.parse(await fs.readFile(url, 'utf8'));

const isFiniteCoordinate = (value) => Number.isFinite(Number(value));

const countLineStrings = (geometry) => {
  if (!geometry) return 0;
  if (geometry.type === 'LineString') return Array.isArray(geometry.coordinates) ? 1 : 0;
  if (geometry.type === 'MultiLineString') return Array.isArray(geometry.coordinates) ? geometry.coordinates.length : 0;
  return 0;
};

const hasValidCoordinates = (geometry) => {
  if (!geometry || geometry.type !== 'MultiLineString' || !Array.isArray(geometry.coordinates)) return false;
  return geometry.coordinates.some((line) =>
    Array.isArray(line) &&
    line.length >= 2 &&
    line.every((point) => Array.isArray(point) && point.length >= 2 && isFiniteCoordinate(point[0]) && isFiniteCoordinate(point[1]))
  );
};

const main = async () => {
  const data = await readJson(CONTOUR_PATH);
  const failures = [];
  const summary = Object.fromEntries(
    Object.keys(SITE_REQUIREMENTS).map((siteId) => [
      siteId,
      { features: 0, indexFeatures: 0, lineStrings: 0, minElevation: Infinity, maxElevation: -Infinity, intervals: new Set() },
    ])
  );

  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    failures.push('contour file must be a GeoJSON FeatureCollection');
  }

  const fileSource = data.metadata?.source || data.source || '';
  if (!String(fileSource).includes(EXPECTED_SOURCE_FRAGMENT)) {
    failures.push('file source must identify Mapzen Terrain Tiles / AWS Open Data');
  }

  (data.features || []).forEach((feature, index) => {
    const properties = feature.properties || {};
    const siteId = properties.siteId;
    const siteSummary = summary[siteId];
    if (!siteSummary) {
      failures.push(`feature ${index}: unknown or missing siteId ${siteId || '(missing)'}`);
      return;
    }

    const elevation = Number(properties.elevation);
    const interval = Number(properties.contourInterval);
    if (!Number.isFinite(elevation)) failures.push(`feature ${index}: missing numeric elevation`);
    if (interval !== SITE_REQUIREMENTS[siteId].interval) {
      failures.push(`feature ${index}: ${siteId} contourInterval ${interval} does not match expected ${SITE_REQUIREMENTS[siteId].interval}`);
    }
    if (!String(properties.source || '').includes(EXPECTED_SOURCE_FRAGMENT)) {
      failures.push(`feature ${index}: missing source attribution`);
    }
    if (!hasValidCoordinates(feature.geometry)) {
      failures.push(`feature ${index}: geometry must be a non-empty MultiLineString with finite coordinates`);
    }

    siteSummary.features += 1;
    siteSummary.indexFeatures += properties.index ? 1 : 0;
    siteSummary.lineStrings += countLineStrings(feature.geometry);
    siteSummary.intervals.add(interval);
    if (Number.isFinite(elevation)) {
      siteSummary.minElevation = Math.min(siteSummary.minElevation, elevation);
      siteSummary.maxElevation = Math.max(siteSummary.maxElevation, elevation);
    }
  });

  Object.entries(SITE_REQUIREMENTS).forEach(([siteId, requirement]) => {
    const siteSummary = summary[siteId];
    if (siteSummary.features < requirement.minFeatures) {
      failures.push(`${siteId}: expected at least ${requirement.minFeatures} contour features, found ${siteSummary.features}`);
    }
    if (siteSummary.indexFeatures < 1) {
      failures.push(`${siteId}: expected at least one index contour`);
    }
  });

  const printableSummary = Object.fromEntries(
    Object.entries(summary).map(([siteId, siteSummary]) => [
      siteId,
      {
        ...siteSummary,
        intervals: [...siteSummary.intervals],
        minElevation: Number.isFinite(siteSummary.minElevation) ? siteSummary.minElevation : null,
        maxElevation: Number.isFinite(siteSummary.maxElevation) ? siteSummary.maxElevation : null,
      },
    ])
  );

  if (failures.length) {
    console.error('Local contour data verification failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    console.error(JSON.stringify(printableSummary, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log('Local contour data ok');
  console.log(JSON.stringify(printableSummary, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
