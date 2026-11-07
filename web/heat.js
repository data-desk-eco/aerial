// far out every family is one surface, `heat`: 60k markers placed each
// frame made the globe crawl. from NEAR in, each family's own layer draws
// every point. no value is summed, since that would mash t/hr, b12 and
// radiant heat: a cell is coloured by the mean band it holds.
//
// in the engine, every point lights the 3×3 of mercator cells around its
// own, one grid of 2^12 to the world at every zoom (4 px at z4, NEAR's
// last), so a region keeps its shape as the map zooms. a cell is the mean
// band of what lights it, rounded: the brightest made it white all over. a
// row's cells of one band are one rectangle, and the outline is every cell
// edge only one cell has, joined where they run on. drawn below NEAR, so
// nearer in it is redone on the way out

import { sql } from './shell/data.js';
import { debounce } from './shell/util.js';
import { MODE } from './flaring/render.js';
import { RAMP, band } from './layers.js';

export const NEAR = 5;
const BAND = band(MODE), N = 2 ** 12;
const lon = i => `(${i}) / ${N} * 360 - 180`;
const lat = j => `degrees(atan(sinh(pi() * (1 - 2 * (${j}) / ${N}))))`;
const run = (t, by) => `SELECT *, ${t} - row_number() OVER
    (PARTITION BY ${by} ORDER BY ${t}) AS g`;
// the points go in as one string a column, which parses as one literal
// where 60k rows of VALUES would parse as 60k; the lite build has no csv
const col = (vs, type) => `unnest(string_split('${vs.join()}', ',')
    ::${type}[])`;
const surface = ([x, y, b]) => `
WITH p AS (SELECT ${col(x, 'DOUBLE')} AS x, ${col(y, 'DOUBLE')} AS y,
        ${col(b, 'INT')} AS b),
c AS (SELECT floor((x + 180) / 360 * ${N})::INT + dx AS i,
        floor((1 - ln(tan(radians(y)) + 1 / cos(radians(y))) / pi()) / 2
            * ${N})::INT + dy AS j,
        round(avg(b))::INT AS b
    FROM p, range(-1, 2) a(dx), range(-1, 2) d(dy)
    WHERE abs(y) < 85 GROUP BY ALL),
f AS (SELECT b, j, min(i) AS t0, max(i) + 1 AS t1
    FROM (${run('i', 'j, b')} FROM c) GROUP BY b, j, g),
e AS (SELECT q[1] AS o, q[2] AS k, q[3] AS t
    FROM (SELECT unnest([[0, j, i], [0, j + 1, i], [1, i, j],
        [1, i + 1, j]]) AS q FROM c)
    GROUP BY ALL HAVING count(*) = 1),
s AS (SELECT o, k, min(t) AS t0, max(t) + 1 AS t1
    FROM (${run('t', 'o, k')} FROM e) GROUP BY o, k, g)
SELECT b, ${lon('t0')} AS x0, ${lat('j')} AS y0, ${lon('t1')} AS x1,
    ${lat('j + 1')} AS y1 FROM f
UNION ALL
SELECT NULL, ${lon('if(o = 0, t0, k)')}, ${lat('if(o = 0, k, t0)')},
    ${lon('if(o = 0, t1, k)')}, ${lat('if(o = 0, k, t1)')} FROM s`;
const feature = ({ b, x0, y0, x1, y1 }) => ({ type: 'Feature',
    properties: { b }, geometry: b == null
        ? { type: 'LineString', coordinates: [[x0, y0], [x1, y1]] }
        : { type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1],
            [x0, y1], [x0, y0]]] } });

// its fill and its outline, on the ramp at 0.6: the land shows through a
// little, where white at the plume mask's 0.5 read as grey. the fill is a
// strip per row, and antialiased edges under 1 drew each seam as a line:
// the outline layer gives the surface its edge
export const HEAT_LAYERS = [
    { id: 'heat-fill', type: 'fill', source: 'heat', maxzoom: NEAR,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-antialias': false, 'fill-opacity': 0.6,
          'fill-color': ['step', ['get', 'b'],
              RAMP[0], 1, RAMP[1], 2, RAMP[2]] } },
    { id: 'heat-line', type: 'line', source: 'heat', maxzoom: NEAR,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': RAMP[2], 'line-width': 1,
          'line-opacity': 0.8 } },
];

// redrawn from `points()` whenever the drawn points change, or on the way
// out past NEAR after they changed nearer in; `put` sets its features
export function initHeat(map, points, put) {
    let stale = false, asked = null, epoch = 0;
    async function heat() {
        stale = false;
        const fs = points(), q = surface([0, 1].map(i => fs.map(f =>
            +f.geometry.coordinates[i])).concat([fs.map(f =>
            BAND(f.properties))]));
        if (q === asked) return;
        const e = ++epoch;
        asked = q;
        const rows = !fs.length ? [] : await sql(q).catch(err =>
            (console.error('surface failed:', err), null));
        if (rows && e === epoch) put(rows.map(feature));
    }
    map.on('zoomend', () => stale && map.getZoom() < NEAR && heat());
    addEventListener('fx-filters', debounce(() => map.getZoom() < NEAR
        ? heat() : stale = true, 100));
}
