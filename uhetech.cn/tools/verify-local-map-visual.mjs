import fs from 'fs/promises';
import vm from 'vm';

const EMPIRE_MAP_PATH = new URL('../empire-map.js', import.meta.url);
const EMPIRE_MAP_CSS_PATH = new URL('../empire-map.css', import.meta.url);
const ROADS_PATH = new URL('../empire-map-local-roads.geojson', import.meta.url);
const CONTOURS_PATH = new URL('../empire-map-local-contours.geojson', import.meta.url);

const SITE_IDS = ['canberra', 'nikenbah', 'sydney'];
const STATE_WIDTH = 1200;
const STATE_HEIGHT = 640;
const DESKTOP_VIEWPORT_SCALE = 0.72;
const MIN_ICON_COVERAGE = 0.15;
const EPSILON = 0.05;

const LOCAL_AREAS_START = 'const AUSTRALIA_LOCAL_DETAIL_AREAS =';
const LOCAL_AREAS_END = ';\n\n  const STAGES';
const ROAD_CLEARANCE_START = 'const LOCAL_ROAD_CLEARANCE_BY_CLASS =';
const ROAD_CLEARANCE_END = ';\n\n  const getPointDistance';
const SYMBOLS_START = 'const FACILITY_TACTICAL_SYMBOLS =';
const SYMBOLS_END = ';\n\n  const getFacilityTacticalSymbolMarkup';

const CONNECTOR_PAIRS = {
  canberra: [
    ['supreme-council', 'capital-defence-gate', 'screening'],
    ['supreme-council', 'imperial-intelligence', 'classified'],
    ['supreme-council', 'revival-command-annex', 'archive'],
  ],
  nikenbah: [
    ['maritime-warning-bureau', 'signal-array', 'sensor'],
    ['maritime-warning-bureau', 'patrol-dispatch', 'dispatch'],
    ['patrol-dispatch', 'coast-watch-bunker', 'screening'],
  ],
  sydney: [
    ['ocma-headquarters', 'colonial-archive-terminal', 'archive'],
    ['ocma-headquarters', 'harbour-dispatch-office', 'dispatch'],
    ['ocma-headquarters', 'botany-logistics-gate', 'screening'],
  ],
};

const readJson = async (url) => JSON.parse(await fs.readFile(url, 'utf8'));

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const extractVmLiteral = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Could not find ${startMarker} in empire-map.js`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Could not find end marker for ${startMarker}`);
  const literalStart = source.indexOf('{', start);
  return vm.runInNewContext(`(${source.slice(literalStart, end)})`);
};

const extractNumberConstant = (source, name) => {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)\\s*;`));
  if (!match) throw new Error(`Could not find numeric constant ${name}`);
  return Number(match[1]);
};

const normalizeLng = (lng) => {
  let normalized = Number(lng);
  while (normalized < -180) normalized += 360;
  while (normalized > 180) normalized -= 360;
  return normalized;
};

const getLongitudeScaleAtLatitude = (lat) =>
  Math.max(0.56, Math.cos((Number(lat) * Math.PI) / 180));

const getLocalDetailProjection = (area) => {
  const bounds = area.bounds || {
    minLng: area.center[0] - area.spanLng / 2,
    maxLng: area.center[0] + area.spanLng / 2,
    minLat: area.center[1] - area.spanLat / 2,
    maxLat: area.center[1] + area.spanLat / 2,
  };
  const paddingX = Math.max(18, STATE_WIDTH * 0.025);
  const paddingY = Math.max(16, STATE_HEIGHT * 0.035);
  const spanLng = bounds.maxLng - bounds.minLng;
  const spanLat = bounds.maxLat - bounds.minLat;
  const lngScale = getLongitudeScaleAtLatitude(area.center?.[1] || (bounds.minLat + bounds.maxLat) / 2);
  const projectedSpanLng = spanLng * lngScale;
  const scale = Math.max(
    (STATE_WIDTH - paddingX * 2) / projectedSpanLng,
    (STATE_HEIGHT - paddingY * 2) / spanLat
  );
  const mapWidth = projectedSpanLng * scale;
  const mapHeight = spanLat * scale;
  const offsetX = (STATE_WIDTH - mapWidth) / 2;
  const offsetY = (STATE_HEIGHT - mapHeight) / 2;

  return ([lng, lat]) => [
    offsetX + (normalizeLng(lng) - bounds.minLng) * lngScale * scale,
    offsetY + (bounds.maxLat - lat) * scale,
  ];
};

const getPolygonCentroid = (coordinates = []) => {
  const usableCoordinates = coordinates.filter((coord) => Array.isArray(coord) && coord.length >= 2);
  if (!usableCoordinates.length) return null;
  const total = usableCoordinates.reduce(
    (sum, coord) => ({
      lng: sum.lng + Number(coord[0] || 0),
      lat: sum.lat + Number(coord[1] || 0),
    }),
    { lng: 0, lat: 0 }
  );
  return [
    total.lng / usableCoordinates.length,
    total.lat / usableCoordinates.length,
  ];
};

const getProjectedBounds = (coordinates = [], projector) => {
  const points = coordinates
    .filter((coord) => Array.isArray(coord) && coord.length >= 2)
    .map((coord) => projector(coord));
  if (!points.length) return null;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
};

const getProjectedPolygonBounds = (polygon = []) => {
  if (!polygon.length) return null;
  const xs = polygon.map((point) => point[0]);
  const ys = polygon.map((point) => point[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

const isPointInPolygon = (point, polygon = []) => {
  if (!point || polygon.length < 3) return false;
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

const getPointDistance = (a, b) =>
  Math.hypot((Number(a?.[0]) || 0) - (Number(b?.[0]) || 0), (Number(a?.[1]) || 0) - (Number(b?.[1]) || 0));

const getPointToSegmentDistance = (point, start, end) => {
  const [px, py] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1);
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
};

const isPointNearPolygonEdge = (point, polygon, clearance) => {
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (getPointToSegmentDistance(point, start, end) <= clearance) return true;
  }
  return false;
};

const buildRoadAvoidanceAreas = (area, projector) =>
  (area?.facilities || [])
    .map((facility) => {
      const polygon = (facility.coordinates || [])
        .filter((coord) => Array.isArray(coord) && coord.length >= 2)
        .map((coord) => projector(coord));
      const bounds = getProjectedPolygonBounds(polygon);
      if (!bounds || polygon.length < 3) return null;
      return { id: facility.id, polygon, bounds };
    })
    .filter(Boolean);

const isRoadPointBlocked = (point, avoidanceAreas, roadClass, roadClearance) => {
  if (!point || !avoidanceAreas?.length) return false;
  const clearance = roadClearance[roadClass] || roadClearance.local;
  return avoidanceAreas.some((area) => {
    const { bounds, polygon } = area;
    if (
      point[0] < bounds.minX - clearance ||
      point[0] > bounds.maxX + clearance ||
      point[1] < bounds.minY - clearance ||
      point[1] > bounds.maxY + clearance
    ) {
      return false;
    }
    return isPointInPolygon(point, polygon) || isPointNearPolygonEdge(point, polygon, clearance);
  });
};

const buildAvoidedRoadSegments = (coordinates, projector, avoidanceAreas, roadClass, roadClearance, samplePx) => {
  const projected = (coordinates || [])
    .filter((coord) => Array.isArray(coord) && coord.length >= 2)
    .map((coord) => projector(coord));
  if (projected.length < 2) return [];
  if (!avoidanceAreas?.length) return [projected];

  const segments = [];
  let current = [];
  const appendPoint = (point) => {
    const last = current[current.length - 1];
    if (!last || getPointDistance(last, point) > 0.35) current.push(point);
  };
  const flushSegment = () => {
    if (current.length >= 2) segments.push(current);
    current = [];
  };

  for (let lineIndex = 0; lineIndex < projected.length - 1; lineIndex += 1) {
    const start = projected[lineIndex];
    const end = projected[lineIndex + 1];
    const length = getPointDistance(start, end);
    const steps = Math.max(2, Math.ceil(length / samplePx));
    for (let step = 0; step <= steps; step += 1) {
      if (lineIndex > 0 && step === 0) continue;
      const t = step / steps;
      const point = [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
      ];
      if (isRoadPointBlocked(point, avoidanceAreas, roadClass, roadClearance)) {
        flushSegment();
      } else {
        appendPoint(point);
      }
    }
  }

  flushSegment();
  return segments;
};

const assertRoadSegmentsClear = (segments, avoidanceAreas, roadClass, roadClearance, samplePx) => {
  const conflicts = [];
  segments.forEach((segment) => {
    for (let index = 0; index < segment.length - 1; index += 1) {
      const start = segment[index];
      const end = segment[index + 1];
      const length = getPointDistance(start, end);
      const steps = Math.max(2, Math.ceil(length / (samplePx / 2)));
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const point = [
          start[0] + (end[0] - start[0]) * t,
          start[1] + (end[1] - start[1]) * t,
        ];
        if (isRoadPointBlocked(point, avoidanceAreas, roadClass, roadClearance)) {
          conflicts.push(point);
          if (conflicts.length >= 3) return conflicts;
        }
      }
    }
  });
  return conflicts;
};

const getFacilityMarkerScale = (facility, projector, constants) => {
  const bounds = getProjectedBounds(facility?.coordinates, projector);
  if (!bounds) return constants.minScale;
  const occupiedRange = Math.max(bounds.width, bounds.height);
  const targetSize = occupiedRange * constants.targetCoverage;
  return clamp(
    targetSize / constants.visualSize,
    constants.minScale,
    constants.maxScale
  );
};

const getSvgViewportCompensation = (viewportScale) =>
  clamp(0.72 / viewportScale, 1, 2.35);

const getDesktopScreenScale = (markerScale, constants, zoom = 1, viewportScale = DESKTOP_VIEWPORT_SCALE) => {
  const responsiveCompensation = getSvgViewportCompensation(viewportScale);
  const visibleSymbolPx = constants.minFrameSize * markerScale * responsiveCompensation * viewportScale;
  const desktopMinBoost = clamp(constants.desktopMinPx / Math.max(visibleSymbolPx, 1), 1, 2.6);
  return clamp((responsiveCompensation * desktopMinBoost) / zoom, 0.42, 3.2);
};

const getFacilityConnectorRadius = (markerScale = 1, screenScale = 1, constants) =>
  Math.max(
    7.4,
    (constants.visualSize * markerScale * screenScale) / 2 + 2.2
  );

const getConnectorEndpoint = (origin, target) => {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const radius = origin.markerRadius || 7.4;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: origin.x + Math.sign(dx || 1) * radius,
      y: origin.y,
    };
  }
  return {
    x: origin.x,
    y: origin.y + Math.sign(dy || 1) * radius,
  };
};

const getFacilityCenterMap = (facilities = [], projector, constants, screenScaleForMarker = 1) =>
  new Map(
    facilities
      .map((facility) => {
        const centroid = getPolygonCentroid(facility.coordinates);
        if (!centroid) return null;
        const [x, y] = projector(centroid);
        const markerScale = getFacilityMarkerScale(facility, projector, constants);
        const screenScale = typeof screenScaleForMarker === 'function'
          ? screenScaleForMarker(markerScale)
          : screenScaleForMarker;
        const markerRadius = getFacilityConnectorRadius(markerScale, screenScale, constants);
        return [facility.id, { x, y, type: facility.type || 'facility', markerScale, screenScale, markerRadius }];
      })
      .filter(Boolean)
  );

const getConnectorPolyline = (from, to) => {
  const start = getConnectorEndpoint(from, to);
  const end = getConnectorEndpoint(to, from);
  const midX = (start.x + end.x) / 2;
  return [
    [start.x, start.y],
    [midX, start.y],
    [midX, end.y],
    [end.x, end.y],
  ];
};

const getFrameBounds = (pathData) => {
  const match = String(pathData || '').match(/^M(-?[0-9.]+),(-?[0-9.]+) H(-?[0-9.]+) V(-?[0-9.]+) H(-?[0-9.]+) Z$/);
  if (!match) return null;
  const [, x1, y1, x2, y2] = match.map(Number);
  return {
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
};

const verifySourceContracts = (source, css, failures) => {
  if (!source.includes('const roadPath = buildAvoidedRoadPath(coordinates, projector, avoidanceAreas, roadClass);')) {
    failures.push('renderLocalRoads must use buildAvoidedRoadPath before drawing roads');
  }
  if (!source.includes("'data-line-count': String(lineCount)")) {
    failures.push('renderLocalContours must expose data-line-count for contour density auditing');
  }
  if (!source.includes("lineCount > 2500") || !source.includes("lineCount < 180")) {
    failures.push('renderLocalContours must distinguish dense and sparse contour classes');
  }
  if (!source.includes("classList.toggle('is-local-low-zoom'") || !source.includes("classList.toggle('is-local-high-zoom'")) {
    failures.push('local zoom state classes must be toggled for contour detail management');
  }
  if (!source.includes("node.setAttribute('aria-hidden', nextView === 'overview' ? 'false' : 'true');")) {
    failures.push('overview city sites must update aria-hidden when entering/leaving local detail');
  }
  if (!source.includes("node.tabIndex = nextView === 'overview' ? 0 : -1;")) {
    failures.push('overview city sites must leave keyboard focus order in local detail');
  }
  if (!source.includes('const getLocalDebugSnapshot = () =>')) {
    failures.push('map runtime must expose a local debug snapshot helper for browser-level verification');
  }
  if (!source.includes('getDebugSnapshot: getLocalDebugSnapshot')) {
    failures.push('window.EmpireMap must export getDebugSnapshot for runtime map verification');
  }
  if (!source.includes('selectAustraliaSite,')) {
    failures.push('window.EmpireMap must export selectAustraliaSite for runtime map verification');
  }
  if (source.includes('empire-map-australia-local-paper') || css.includes('empire-map-australia-local-paper')) {
    failures.push('local detail maps must not render the old city paper rectangle backdrop');
  }

  const detailSiteBlock = css.match(/\.empire-map-shell\.is-australia-detail \.empire-map-australia-sites,[\s\S]*?\.empire-map-shell\.is-australia-detail \.empire-map-australia-site \{([\s\S]*?)\}/);
  if (!detailSiteBlock) {
    failures.push('CSS must hide the australia site layer in local detail mode');
  } else {
    const block = detailSiteBlock[1];
    if (!/opacity:\s*0\s*;/.test(block)) failures.push('detail city site hide rule must set opacity: 0');
    if (!/visibility:\s*hidden\s*;/.test(block)) failures.push('detail city site hide rule must set visibility: hidden');
    if (!/pointer-events:\s*none\s*;/.test(block)) failures.push('detail city site hide rule must disable pointer events');
  }

  [
    '.empire-map-australia-contour--dense.is-visible',
    '.empire-map-shell.is-local-low-zoom .empire-map-australia-contour--dense:not(.empire-map-australia-contour--index).is-visible',
    '.empire-map-shell.is-local-high-zoom .empire-map-australia-contour--index.is-visible',
  ].forEach((selector) => {
    if (!css.includes(selector)) failures.push(`CSS is missing contour visual rule: ${selector}`);
  });
};

const verifySymbols = (symbols, constants, failures, summary) => {
  const frameSummaries = Object.entries(symbols).map(([type, symbol]) => {
    const bounds = getFrameBounds(symbol.frame);
    if (!bounds) {
      failures.push(`${type}: tactical symbol frame must be a parseable square path`);
      return { type, width: null, height: null };
    }
    if (Math.abs(bounds.width - bounds.height) > EPSILON) {
      failures.push(`${type}: tactical symbol frame is not square (${bounds.width}x${bounds.height})`);
    }
    if (Math.abs(bounds.width - constants.visualSize) > EPSILON) {
      failures.push(`${type}: frame size ${bounds.width} must match visual size ${constants.visualSize}`);
    }
    if (!Array.isArray(symbol.glyph) || !symbol.glyph.length) {
      failures.push(`${type}: tactical symbol must contain at least one glyph path`);
    }
    return { type, width: bounds.width, height: bounds.height };
  });

  const uniqueSizes = new Set(frameSummaries.map((frame) => `${frame.width}x${frame.height}`));
  if (uniqueSizes.size !== 1) failures.push(`tactical symbol frames must be uniform, found ${[...uniqueSizes].join(', ')}`);
  summary.symbols = {
    count: frameSummaries.length,
    frameSizes: [...uniqueSizes],
  };
};

const verifyFacilities = (areas, constants, failures, summary) => {
  summary.facilities = {};
  SITE_IDS.forEach((siteId) => {
    const area = areas[siteId];
    const projector = getLocalDetailProjection(area);
    const siteSummary = {
      facilities: 0,
      minCoverage: Infinity,
      minDesktopFramePx: Infinity,
      maxMarkerScale: 0,
    };

    (area.facilities || []).forEach((facility) => {
      const bounds = getProjectedBounds(facility.coordinates, projector);
      if (!bounds) {
        failures.push(`${siteId}/${facility.id}: missing projected bounds`);
        return;
      }
      const occupiedRange = Math.max(bounds.width, bounds.height);
      const markerScale = getFacilityMarkerScale(facility, projector, constants);
      const iconCoverage = (constants.visualSize * markerScale) / Math.max(occupiedRange, 1);
      const screenScale = getDesktopScreenScale(markerScale, constants);
      const desktopFramePx = constants.minFrameSize * markerScale * screenScale * DESKTOP_VIEWPORT_SCALE;

      siteSummary.facilities += 1;
      siteSummary.minCoverage = Math.min(siteSummary.minCoverage, iconCoverage);
      siteSummary.minDesktopFramePx = Math.min(siteSummary.minDesktopFramePx, desktopFramePx);
      siteSummary.maxMarkerScale = Math.max(siteSummary.maxMarkerScale, markerScale);

      if (iconCoverage + EPSILON < MIN_ICON_COVERAGE) {
        failures.push(`${siteId}/${facility.id}: marker covers ${(iconCoverage * 100).toFixed(1)}%, below ${(MIN_ICON_COVERAGE * 100).toFixed(0)}%`);
      }
      if (desktopFramePx + EPSILON < constants.desktopMinPx) {
        failures.push(`${siteId}/${facility.id}: desktop frame ${desktopFramePx.toFixed(1)}px below ${constants.desktopMinPx}px`);
      }
    });

    summary.facilities[siteId] = {
      ...siteSummary,
      minCoverage: Number.isFinite(siteSummary.minCoverage) ? Number(siteSummary.minCoverage.toFixed(3)) : null,
      minDesktopFramePx: Number.isFinite(siteSummary.minDesktopFramePx) ? Number(siteSummary.minDesktopFramePx.toFixed(1)) : null,
      maxMarkerScale: Number(siteSummary.maxMarkerScale.toFixed(3)),
    };
  });
};

const verifyConnectors = (areas, constants, failures, summary) => {
  summary.connectors = {};
  SITE_IDS.forEach((siteId) => {
    const area = areas[siteId];
    const projector = getLocalDetailProjection(area);
    const baseCenterMap = getFacilityCenterMap(area.facilities, projector, constants, 1);
    const desktopCenterMap = getFacilityCenterMap(
      area.facilities,
      projector,
      constants,
      (markerScale) => getDesktopScreenScale(markerScale, constants)
    );
    const sitePairs = CONNECTOR_PAIRS[siteId] || [];
    let checked = 0;

    sitePairs.forEach(([fromId, toId]) => {
      const from = baseCenterMap.get(fromId);
      const to = baseCenterMap.get(toId);
      const desktopFrom = desktopCenterMap.get(fromId);
      const desktopTo = desktopCenterMap.get(toId);
      if (!from || !to || !desktopFrom || !desktopTo) {
        failures.push(`${siteId}: connector ${fromId} -> ${toId} references a missing facility`);
        return;
      }

      [
        ['base', from, to],
        ['desktop', desktopFrom, desktopTo],
      ].forEach(([mode, modeFrom, modeTo]) => {
        const start = getConnectorEndpoint(modeFrom, modeTo);
        const end = getConnectorEndpoint(modeTo, modeFrom);
        const startDistance = Math.hypot(start.x - modeFrom.x, start.y - modeFrom.y);
        const endDistance = Math.hypot(end.x - modeTo.x, end.y - modeTo.y);
        if (startDistance + EPSILON < modeFrom.markerRadius) {
          failures.push(`${siteId}/${fromId}->${toId} ${mode}: connector starts inside origin marker`);
        }
        if (endDistance + EPSILON < modeTo.markerRadius) {
          failures.push(`${siteId}/${fromId}->${toId} ${mode}: connector ends inside target marker`);
        }
        if (Math.hypot(modeTo.x - modeFrom.x, modeTo.y - modeFrom.y) <= modeFrom.markerRadius + modeTo.markerRadius + 2) {
          failures.push(`${siteId}/${fromId}->${toId} ${mode}: connector markers are too close to draw a clean link`);
        }

        const connectorPolyline = getConnectorPolyline(modeFrom, modeTo);
        [...baseCenterMap.entries()].forEach(([facilityId, center]) => {
          if (facilityId === fromId || facilityId === toId) return;
          for (let index = 0; index < connectorPolyline.length - 1; index += 1) {
            const distance = getPointToSegmentDistance([center.x, center.y], connectorPolyline[index], connectorPolyline[index + 1]);
            if (distance < center.markerRadius - EPSILON) {
              failures.push(`${siteId}/${fromId}->${toId} ${mode}: connector crosses ${facilityId} marker`);
              break;
            }
          }
        });
      });
      checked += 1;
    });

    summary.connectors[siteId] = {
      expected: sitePairs.length,
      checked,
    };
  });
};

const verifyRoadAvoidance = (areas, roadData, roadClearance, samplePx, failures, summary) => {
  summary.roads = {};
  SITE_IDS.forEach((siteId) => {
    const area = areas[siteId];
    const projector = getLocalDetailProjection(area);
    const avoidanceAreas = buildRoadAvoidanceAreas(area, projector);
    const roadFeatures = (roadData.features || []).filter(
      (feature) => feature?.properties?.siteId === siteId && feature?.geometry?.type === 'LineString'
    );
    let checked = 0;
    let clipped = 0;

    roadFeatures.forEach((feature, index) => {
      const roadClass = feature.properties?.roadClass || 'local';
      const coordinates = feature.geometry.coordinates || [];
      const sourceBlocked = coordinates
        .map((coord) => projector(coord))
        .some((point) => isRoadPointBlocked(point, avoidanceAreas, roadClass, roadClearance));
      const segments = buildAvoidedRoadSegments(coordinates, projector, avoidanceAreas, roadClass, roadClearance, samplePx);
      const conflicts = assertRoadSegmentsClear(segments, avoidanceAreas, roadClass, roadClearance, samplePx);
      checked += 1;
      if (sourceBlocked || segments.length > 1) clipped += 1;
      if (conflicts.length) {
        failures.push(`${siteId}/road ${feature.properties?.name || index}: avoided road still intersects a facility clearance`);
      }
    });

    summary.roads[siteId] = {
      checked,
      clipped,
      avoidanceAreas: avoidanceAreas.length,
    };
  });
};

const verifyContours = (contourData, failures, summary) => {
  summary.contours = Object.fromEntries(
    SITE_IDS.map((siteId) => [siteId, { dense: 0, sparse: 0, middle: 0, index: 0 }])
  );

  (contourData.features || []).forEach((feature) => {
    const siteId = feature.properties?.siteId;
    if (!summary.contours[siteId] || feature.geometry?.type !== 'MultiLineString') return;
    const lineCount = Array.isArray(feature.geometry.coordinates) ? feature.geometry.coordinates.length : 0;
    if (lineCount > 2500) summary.contours[siteId].dense += 1;
    else if (lineCount < 180) summary.contours[siteId].sparse += 1;
    else summary.contours[siteId].middle += 1;
    if (feature.properties?.index) summary.contours[siteId].index += 1;
  });

  Object.entries(summary.contours).forEach(([siteId, siteSummary]) => {
    if (siteSummary.dense < 1) failures.push(`${siteId}: expected at least one dense contour feature`);
    if (siteSummary.sparse < 1) failures.push(`${siteId}: expected at least one sparse contour feature`);
    if (siteSummary.index < 1) failures.push(`${siteId}: expected at least one index contour feature`);
  });
};

const main = async () => {
  const [source, css, roadData, contourData] = await Promise.all([
    fs.readFile(EMPIRE_MAP_PATH, 'utf8'),
    fs.readFile(EMPIRE_MAP_CSS_PATH, 'utf8'),
    readJson(ROADS_PATH),
    readJson(CONTOURS_PATH),
  ]);

  const areas = extractVmLiteral(source, LOCAL_AREAS_START, LOCAL_AREAS_END);
  const roadClearance = extractVmLiteral(source, ROAD_CLEARANCE_START, ROAD_CLEARANCE_END);
  const symbols = extractVmLiteral(source, SYMBOLS_START, SYMBOLS_END);
  const constants = {
    visualSize: extractNumberConstant(source, 'FACILITY_SYMBOL_VISUAL_SIZE'),
    minFrameSize: extractNumberConstant(source, 'FACILITY_SYMBOL_MIN_FRAME_SIZE'),
    targetCoverage: extractNumberConstant(source, 'FACILITY_SYMBOL_TARGET_COVERAGE'),
    minScale: extractNumberConstant(source, 'FACILITY_SYMBOL_MIN_SCALE'),
    maxScale: extractNumberConstant(source, 'FACILITY_SYMBOL_MAX_SCALE'),
    desktopMinPx: extractNumberConstant(source, 'FACILITY_SYMBOL_DESKTOP_MIN_PX'),
  };
  const roadSamplePx = extractNumberConstant(source, 'LOCAL_ROAD_AVOIDANCE_SAMPLE_PX');

  const failures = [];
  const summary = {};

  verifySourceContracts(source, css, failures);
  verifySymbols(symbols, constants, failures, summary);
  verifyFacilities(areas, constants, failures, summary);
  verifyConnectors(areas, constants, failures, summary);
  verifyRoadAvoidance(areas, roadData, roadClearance, roadSamplePx, failures, summary);
  verifyContours(contourData, failures, summary);

  if (failures.length) {
    console.error('Local map visual verification failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    console.error(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log('Local map visual constraints ok');
  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
