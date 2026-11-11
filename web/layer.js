// ?layer=<provider>/<table>[,…]: tables of the archive drawn on request,
// public or private. a private table is read through /private/ (the
// data-private meta tag), behind the data desk login, and only the tables
// named are read from it. a `detections` table joins the plumes
// (methane/plumes.js reads every detections object the archives give);
// any other table draws its `geometry`: points a waypoint, one mark for
// each kind, and shapes an outline, named on hover by `name` (or its first
// column) over its other text columns.

import { hover, lines } from './vendor/dd/dd.js';
import { ensureMark } from './shell/map.js';
import { sql, from } from './shell/data.js';
import { initArchive, objects } from './shell/archive.js';
import { DD, PIN } from './layers.js';

const NAMES = new URLSearchParams(location.search).get('layer')
    ?.split(',').filter(Boolean) ?? [];
// a link that names no view opens on the layers
const FIT = !/map=/.test(location.hash);
const PRIVATE = document.querySelector('meta[name="data-private"]')?.content;

// the private index, once: where the login is not held yet the edge
// redirects, and the page goes through the login and comes back to itself
if (NAMES.length && PRIVATE) {
    initArchive(PRIVATE, NAMES).catch(() => {});
    fetch(`${PRIVATE}/index.json`, { redirect: 'manual' }).then(r => {
        if (r.type === 'opaqueredirect' || r.status === 401)
            location.assign(`${PRIVATE}/?to=${encodeURIComponent(
                location.pathname + location.search + location.hash)}`);
    }).catch(() => {});
}

const MARKS = [`waypoint-${DD.white}`, `triangle-${DD.cyan}`,
    `waypoint-${DD.cyan}`];
const HIDE = new Set(['id', 'provider', 'cell', 'g']);
const text = (p, heading) => Object.entries(p).filter(([k, v]) =>
    !HIDE.has(k) && typeof v === 'string' && v !== heading
    && !/^https?:/.test(v)).map(([, v]) => v).join(' · ');

async function draw(map, name, i) {
    const [provider, table] = name.split('/');
    const objs = await objects(table, { provider });
    if (!objs.length) return console.warn(`?layer=${name}: no such table`);
    const src = await from(objs), id = `layer-${i}`;
    // a table with no kind column is one kind
    const [rows, [box], [{ kinds = [] } = {}]] = await Promise.all([
        sql(`SELECT * EXCLUDE (geometry), ST_AsGeoJSON(geometry) AS g
            FROM ${src} WHERE geometry IS NOT NULL`),
        sql(`SELECT min(ST_XMin(geometry)) AS w, min(ST_YMin(geometry)) AS s,
            max(ST_XMax(geometry)) AS e, max(ST_YMax(geometry)) AS n
            FROM ${src}`),
        sql(`SELECT list(DISTINCT kind ORDER BY kind) AS kinds FROM ${src}
            WHERE kind IS NOT NULL`).catch(() => []),
    ]);
    MARKS.forEach(m => ensureMark(map, m));
    map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection',
        features: rows.map(({ g, ...p }) => ({ type: 'Feature',
            properties: p, geometry: JSON.parse(g) })) } });
    const point = ['==', ['geometry-type'], 'Point'];
    map.addLayer({ id: `${id}-hit`, type: 'fill', source: id,
        filter: ['in', ['geometry-type'], ['literal', ['Polygon',
            'MultiPolygon']]],
        paint: { 'fill-color': '#000', 'fill-opacity': 0 } });
    map.addLayer({ id: `${id}-line`, source: id, filter: ['!', point],
        ...lines.area() });
    map.addLayer({ id, type: 'symbol', source: id, filter: point,
        layout: { ...PIN, 'icon-size': 1.4, 'icon-image': kinds.length > 1
            ? ['match', ['get', 'kind'], ...kinds.flatMap((k, j) =>
                [k, MARKS[j % MARKS.length]]), MARKS[0]] : MARKS[0] } });
    const label = p => {
        const heading = p.name ?? Object.values(p)[0];
        return { heading, text: text(p, heading) };
    };
    hover(map, id, label);
    hover(map, `${id}-hit`, label);
    if (FIT && box.w != null)
        map.fitBounds([[box.w, box.s], [box.e, box.n]],
            { padding: 80, maxZoom: 12, duration: 0 });
}
// every named table that is not plumes, each on its own: one that does not
// load costs its own layer
export function initLayers(map) {
    NAMES.filter(n => !n.endsWith('/detections')).forEach((n, i) =>
        draw(map, n, i).catch(err => console.error(`?layer=${n}:`, err)));
}
