import fs from 'fs/promises';
import vm from 'vm';

const EMPIRE_MAP_PATH = new URL('../empire-map.js', import.meta.url);
const WEBSITE_DATA_PATH = new URL('../website-data.json', import.meta.url);
const LOCAL_AREAS_START = 'const AUSTRALIA_LOCAL_DETAIL_AREAS =';
const LOCAL_AREAS_END = ';\n\n  const STAGES';
const SITE_IDS = ['canberra', 'nikenbah', 'sydney'];

const readJson = async (url) => JSON.parse(await fs.readFile(url, 'utf8'));

const extractLocalAreas = async () => {
  const source = await fs.readFile(EMPIRE_MAP_PATH, 'utf8');
  const start = source.indexOf(LOCAL_AREAS_START);
  if (start < 0) {
    throw new Error(`Could not find ${LOCAL_AREAS_START} in empire-map.js`);
  }

  const end = source.indexOf(LOCAL_AREAS_END, start);
  if (end < 0) {
    throw new Error('Could not find the end of AUSTRALIA_LOCAL_DETAIL_AREAS in empire-map.js');
  }

  const objectStart = source.indexOf('{', start);
  const literal = source.slice(objectStart, end);
  return vm.runInNewContext(`(${literal})`);
};

const collectEditableDesignFeatures = (siteId, area) => {
  const features = [];
  const add = (feature, group, key = feature?.id) => {
    if (!key) return;
    features.push({
      siteId,
      group,
      key,
      fallbackTitle: feature?.name || String(key).replace(/-/g, ' '),
      fallbackBody: feature?.description || '',
    });
  };

  ['waterBodies', 'zones', 'facilities', 'arcs', 'rings'].forEach((group) => {
    (area[group] || []).forEach((feature) => add(feature, group));
  });

  (area.districts || []).forEach((feature) => add(feature, 'districts', feature.id || feature.name));
  (area.labels || [])
    .filter((feature) => feature?.kind !== 'facility')
    .forEach((feature) => add(feature, 'labels', feature.id || feature.name));

  return features;
};

const isFilledTextEntry = (entry) =>
  Boolean(entry && typeof entry === 'object' && String(entry.title || '').trim() && String(entry.body || entry.details || '').trim());

const main = async () => {
  const [areas, websiteData] = await Promise.all([extractLocalAreas(), readJson(WEBSITE_DATA_PATH)]);
  const textBySite = websiteData.empireMap?.localFeatureText || {};
  const failures = [];
  const summary = {};

  SITE_IDS.forEach((siteId) => {
    const area = areas[siteId];
    if (!area) {
      failures.push(`${siteId}: missing local detail area`);
      return;
    }

    const siteText = textBySite[siteId] || {};
    const features = collectEditableDesignFeatures(siteId, area);
    summary[siteId] = {
      designFeatures: features.length,
      textEntries: Object.keys(siteText).filter((key) => key !== '__site').length,
    };

    if (!isFilledTextEntry(siteText.__site)) {
      failures.push(`${siteId}: missing filled __site overview text`);
    }

    features.forEach((feature) => {
      const entry = siteText[feature.key];
      if (!isFilledTextEntry(entry)) {
        failures.push(`${siteId}/${feature.key} (${feature.group}): missing filled title/body text`);
      }
    });
  });

  if (failures.length) {
    console.error('Local map text coverage failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    console.error(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log('Local map text coverage ok');
  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
