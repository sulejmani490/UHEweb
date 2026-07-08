import fs from 'fs/promises';

const ROADS_PATH = new URL('../empire-map-local-roads.geojson', import.meta.url);
const SITE_REQUIREMENTS = {
  canberra: { minFeatures: 12 },
  nikenbah: { minFeatures: 10 },
  sydney: { minFeatures: 12 },
};
const VALID_ROAD_CLASSES = new Set(['major', 'collector', 'local', 'service', 'imperial', 'restricted']);
const REQUIRED_BASE_CLASSES = ['major', 'collector', 'local'];
const REQUIRED_OVERLAY_CLASSES = ['imperial', 'restricted'];

const readJson = async (url) => JSON.parse(await fs.readFile(url, 'utf8'));

const isFiniteCoordinate = (value) => Number.isFinite(Number(value));

const isValidLineString = (geometry) =>
  geometry?.type === 'LineString' &&
  Array.isArray(geometry.coordinates) &&
  geometry.coordinates.length >= 2 &&
  geometry.coordinates.every(
    (point) => Array.isArray(point) && point.length >= 2 && isFiniteCoordinate(point[0]) && isFiniteCoordinate(point[1])
  );

const main = async () => {
  const data = await readJson(ROADS_PATH);
  const failures = [];
  const summary = Object.fromEntries(
    Object.keys(SITE_REQUIREMENTS).map((siteId) => [
      siteId,
      { features: 0, named: 0, classes: Object.fromEntries([...VALID_ROAD_CLASSES].map((roadClass) => [roadClass, 0])), minPoints: Infinity, maxPoints: 0 },
    ])
  );

  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    failures.push('road file must be a GeoJSON FeatureCollection');
  }
  if (!String(data.source || '').includes('real Australian urban geography')) {
    failures.push('file source should describe the real Australian urban geography basis');
  }

  (data.features || []).forEach((feature, index) => {
    const properties = feature.properties || {};
    const siteId = properties.siteId;
    const roadClass = properties.roadClass;
    const siteSummary = summary[siteId];

    if (!siteSummary) {
      failures.push(`feature ${index}: unknown or missing siteId ${siteId || '(missing)'}`);
      return;
    }
    if (!VALID_ROAD_CLASSES.has(roadClass)) {
      failures.push(`feature ${index}: invalid roadClass ${roadClass || '(missing)'}`);
    }
    if (!String(properties.name || '').trim()) {
      failures.push(`feature ${index}: missing road name`);
    }
    if (!String(properties.source || '').trim()) {
      failures.push(`feature ${index}: missing source attribution`);
    }
    if (!isValidLineString(feature.geometry)) {
      failures.push(`feature ${index}: geometry must be a LineString with at least two finite coordinate pairs`);
    }

    const pointCount = Array.isArray(feature.geometry?.coordinates) ? feature.geometry.coordinates.length : 0;
    siteSummary.features += 1;
    siteSummary.named += String(properties.name || '').trim() ? 1 : 0;
    if (VALID_ROAD_CLASSES.has(roadClass)) siteSummary.classes[roadClass] += 1;
    siteSummary.minPoints = Math.min(siteSummary.minPoints, pointCount);
    siteSummary.maxPoints = Math.max(siteSummary.maxPoints, pointCount);
  });

  Object.entries(SITE_REQUIREMENTS).forEach(([siteId, requirement]) => {
    const siteSummary = summary[siteId];
    if (siteSummary.features < requirement.minFeatures) {
      failures.push(`${siteId}: expected at least ${requirement.minFeatures} road features, found ${siteSummary.features}`);
    }
    REQUIRED_BASE_CLASSES.forEach((roadClass) => {
      if (siteSummary.classes[roadClass] < 1) failures.push(`${siteId}: expected at least one ${roadClass} road`);
    });
    REQUIRED_OVERLAY_CLASSES.forEach((roadClass) => {
      if (siteSummary.classes[roadClass] < 1) failures.push(`${siteId}: expected at least one ${roadClass} overlay road`);
    });
  });

  const printableSummary = Object.fromEntries(
    Object.entries(summary).map(([siteId, siteSummary]) => [
      siteId,
      {
        ...siteSummary,
        minPoints: Number.isFinite(siteSummary.minPoints) ? siteSummary.minPoints : null,
      },
    ])
  );

  if (failures.length) {
    console.error('Local road data verification failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    console.error(JSON.stringify(printableSummary, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log('Local road data ok');
  console.log(JSON.stringify(printableSummary, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
