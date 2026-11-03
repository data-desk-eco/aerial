// the osm outline of each industrial facility a flare or a plume can come
// from (data-desk/sites), drawn as an area: a thin solid border and an
// inset dash (pdf:67-68). the table holds 88,000 outlines, most of which no
// detection sits in, so it is read for a box around the viewport and an
// outline is drawn only while a drawn detection is inside it or within REACH
// of its edge. it claims nothing about the detection; the reader sees what
// the flare or plume sits inside.

import { lines } from './vendor/dd/dd.js';
import { objects } from './shell/archive.js';
import { sql, from } from './shell/data.js';
import { ensureLabel } from './shell/map.js';
import { dimSite } from './card/overlays.js';

// each kind under its sector, the subtitle's first word
const SECTORS = {
    'Oil and gas': { refinery: 'Refinery', lng_terminal: 'LNG terminal',
        processing_plant: 'Gas processing plant', gas_terminal: 'Gas terminal',
        oil_terminal: 'Oil terminal', compressor_station: 'Compressor station',
        gas_storage: 'Gas storage', well_pad: 'Well pad',
        oil_gas_facility: 'Oil and gas facility' },
    Coal: { coal_mine: 'Coal mine', coal_terminal: 'Coal terminal' },
    Power: { power_plant: 'Power plant' },
    Industry: { chemical_plant: 'Chemical plant', coke_plant: 'Coking plant',
        steel_plant: 'Steelworks', cement_plant: 'Cement plant' },
    Waste: { landfill: 'Landfill', wastewater_plant: 'Wastewater plant' },
};
const KIND = Object.fromEntries(Object.entries(SECTORS).flatMap(([s, ks]) =>
    Object.entries(ks).map(([k, label]) => [k, [s, label]])));
// a heading over its parts, each said once: a part the heading or an
// earlier part already says, or that says one of them, is left out
const once = (heading, parts) => {
    const said = [heading.toLowerCase()];
    return { heading, text: parts.filter(v => {
        const l = v?.toLowerCase();
        return l && !said.some(s => s.includes(l) || l.includes(s))
            && said.push(l);
    }).join(' · ') };
};
// a facility's name over its sector, kind and operator
const siteLabel = ({ name, kind, operator }) => {
    const [sector, k] = KIND[kind] ?? [];
    return once(name || k || '', [sector, k, operator]);
};

// below this a refinery is a few pixels and the outlines are noise
export const SITE_ZOOM = 10;
// the layers whose points an outline must hold to be drawn
const HELD_BY = ['live', 's3', 'vnf', 'plumes'];
// how far outside its outline a detection still holds it, in degrees (~500 m):
// a vnf pixel is 375 m, and a cluster's centre need not fall inside
const REACH = 0.005;
const isPoint = ['==', ['geometry-type'], 'Point'];

// an invisible fill under the lines, so the outline answers anywhere
// inside; and its label up and right of its vertex furthest up and right,
// drawn while it is lit (shade). the label is set at 300, lighter than the
// ui's 370, as a canvas sets inter at its text optical size, which is
// heavier than the page's
export const SITE_LAYERS = [
    { id: 'sites-hit', type: 'fill', source: 'sites', minzoom: SITE_ZOOM,
      paint: { 'fill-color': '#000', 'fill-opacity': 0 } },
    ...[['sites', lines.area()], ['sites-inset', lines.areaInset()]]
        .map(([id, l]) => ({ id, source: 'sites', minzoom: SITE_ZOOM,
                             filter: ['!', isPoint], ...l })),
    { id: 'sites-label', type: 'symbol', source: 'sites', minzoom: SITE_ZOOM,
      filter: ['in', ['get', 'id'], ['literal', []]],
      layout: { 'icon-image': ['concat', 'site-', ['get', 'id']],
                'icon-anchor': 'bottom-left', 'icon-offset': [4, -4],
                'icon-allow-overlap': true, 'icon-ignore-placement': true } },
];

// the outlines in the viewport's box padded a viewport each way, held in the
// engine as `site_view` until the view leaves it, so a pan inside reads
// nothing and an outline never hangs on the screen's edge. the table is
// hilbert-ordered, so the box prunes to the row groups around it. true when
// it was read again
let held = [0, 0, 0, 0];
const inside = ([x, y], [w, s, e, n], d = 0) =>
    x >= w - d && x <= e + d && y >= s - d && y <= n + d;
export async function holdSites([w, s, e, n]) {
    if (inside([w, s], held) && inside([e, n], held)) return false;
    const x = e - w, y = n - s, box = [w - x, s - y, e + x, n + y];
    await sql(`CREATE OR REPLACE TABLE site_view AS SELECT id, kind, name,
        operator, geometry FROM ${await from(await objects('sites'))}
        WHERE xmin <= ${box[2]} AND xmax >= ${box[0]}
          AND ymin <= ${box[3]} AND ymax >= ${box[1]}`);
    return !!(held = box);
}

// the held outlines that hold a point the map is drawing, each with the ids
// of the points it holds and its vertex furthest up and right for its
// label: `shown(id)` is
// a layer's features as drawn, after the key's filters, and only those in
// the held box are asked about: the window's plumes are 40k the world over,
// and all of them made this 10 s against 5 ms. the inset dash sits right of
// the stroke's direction, so inside a clockwise ring, which is how
// ST_Normalize winds an outer ring (and each hole the other way)
let epoch = 0, drawn = null, holds = new Map();
const str = v => `'${String(v).replace(/'/g, "''")}'`;
export async function drawSites(map, shown) {
    if (map.getZoom() < SITE_ZOOM) return;
    const points = HELD_BY.flatMap(id => shown(id)).filter(f =>
        f.geometry && inside(f.geometry.coordinates, held, REACH));
    const e = ++epoch;
    const rows = points.length ? await sql(`
        WITH h AS (SELECT s.id, list(p.id) AS held
            FROM site_view s JOIN (VALUES ${points.map(({ properties: { id },
                geometry: { coordinates: [x, y] } }) =>
                `(${str(id)}, ${+x}, ${+y})`)}) AS p(id, x, y)
            ON ST_DWithin(s.geometry, ST_Point(p.x, p.y), ${REACH})
            GROUP BY s.id)
        SELECT id, kind, name, operator, held, ST_Area(geometry) AS area,
            ST_AsGeoJSON(ST_Normalize(geometry)) AS outline,
            ST_AsGeoJSON((SELECT arg_max(v.geom, ST_X(v.geom) + ST_Y(v.geom))
                FROM (SELECT unnest(ST_Dump(ST_Points(geometry))) AS v)))
                AS corner
        FROM site_view JOIN h USING (id)`)
        .catch(() => []) : [];   // no site_view yet: nothing to draw
    // the same outlines again are left as they are: re-setting them flashed
    // the lines at every key toggle and every live read
    const k = rows.map(r => r.id + r.held).sort().join();
    if (e !== epoch || k === drawn) return;
    await Promise.all(rows.map(r => ensureLabel(map, `site-${r.id}`,
        { ...siteLabel(r), weight: 300 })));
    if (e !== epoch) return;
    drawn = k;
    holds = new Map(rows.map(r => [String(r.id), r.held.map(String)]));
    show(lit);   // a held facility's detections, anew
    map.getSource('sites')?.setData({ type: 'FeatureCollection',
        features: rows.flatMap(({ outline, corner, held: _, ...p }) =>
            [outline, corner].map(g => ({ type: 'Feature', properties: p,
                geometry: JSON.parse(g) }))) });
}

// ── emphasis ──

// a hovered outline, or a detection inside one, lights that facility and
// every detection it holds, shows its label and fades the rest, and a
// click on an outline holds it lit until a click elsewhere or on it again;
// an open flaring card greys the flaring markings, so its imagery shows
// through. one writer of the opacities, so neither undoes the other
const FADE = 0.35;
const GREYED = ['live', 's3', 'vnf', 'live-tag', 's3-tag', 'vnf-tag'];
const MARKINGS = [...GREYED, 'plumes'];
const OPACITY = { 'sites': 'line-opacity', 'sites-inset': 'line-opacity',
    ...Object.fromEntries(MARKINGS.map(id => [id, 'icon-opacity'])) };
let map = null, grey = false, lit = null, pinned = null;
function shade() {
    if (!map) return;
    const on = ids => ['in', ['get', 'id'], ['literal', ids]];
    for (const [id, prop] of Object.entries(OPACITY)) {
        const base = grey && GREYED.includes(id) ? FADE : 1,
            ids = lit && (id.startsWith('sites') ? lit.sites : lit.held);
        if (map.getLayer(id)) map.setPaintProperty(id, prop,
            ids ? ['case', on(ids), 1, FADE] : base);
    }
    if (map.getLayer('sites-label')) map.setFilter('sites-label',
        ['all', isPoint, on(lit?.sites ?? [])]);
}
export const greyMarkings = g => { grey = g; shade(); };

// the topmost of the markings and the outlines under the point
const under = ({ point }) => map.getZoom() >= SITE_ZOOM && map
    .queryRenderedFeatures(point, { layers: [...MARKINGS, 'sites-hit']
        .filter(l => map.getLayer(l)) })[0];
const light = sites => sites.length ? { sites,
    held: sites.flatMap(s => holds.get(s) ?? []) } : null;
// the same again repaints nothing; a held facility stays lit
function show(next) {
    next = pinned ? light([pinned]) : next;
    if (JSON.stringify(next) === JSON.stringify(lit)) return;
    lit = next;
    shade();
}
// the facility under the pointer, or the facilities holding the detection
// under it; anything a click selects takes the pointer
function hovered(e) {
    const f = under(e), id = f && String(f.properties.id);
    map.getCanvas().style.cursor = f ? 'pointer' : '';
    show(light(!f ? [] : f.layer.id === 'sites-hit' ? [id]
        : [...holds].filter(([, h]) => h.includes(id)).map(([s]) => s)));
}
// a click on an outline holds it and dims the imagery around it, or lets
// it go if it was held; a marking opens its card and leaves the hold as it
// is; anywhere else lets go
function clicked(e) {
    const f = under(e);
    if (f && f.layer.id !== 'sites-hit') return;
    const id = f && String(f.properties.id);
    const was = pinned;
    pinned = id && id !== pinned ? id : null;
    // the imagery dims around it, as around a card's site
    if (pinned || was) dimSite(pinned);
    show(light(id ? [id] : []));
}
export function initEmphasis(m) {
    map = m;
    map.on('mousemove', hovered);
    map.on('click', clicked);
    map.getCanvas().addEventListener('mouseleave', () => show(null));
}
