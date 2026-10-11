// candidate sources around an open plume card, and nowhere else: one radius
// read of every provider's `infrastructure` table, cleared on close. drawn
// white over an invisible fat hit layer — a triangle per candidate, a diamond
// for the attributed source — since colour on this map is measurement.

import { hover } from '../vendor/dd/dd.js';
import { objects } from '../shell/archive.js';
import { sql, from, fc, prefetchData } from '../shell/data.js';
import { quote, fmtMetres } from '../shell/util.js';
import { MARK, PIN } from '../layers.js';

const MAX_SHOW = 300;
const AREAS = ['pipeline', 'field', 'oilfield', 'gas_field', 'offshore_field',
               'licence_area', 'licence_block'];

// ch4id's ids are OSM:w<id>; older attributions carry OSM:way/<id>
const normId = id =>
    id.replace(/^OSM:(way|node|relation)\//, (_, t) => `OSM:${t[0]}`);

let map, shown = [], epoch = 0;

const render = features => map.getSource('candidates')
    ?.setData({ type: 'FeatureCollection', features: shown = features });

// the objects a rect lies in: the engine names the h3 cells it overlaps,
// and the index each provider's object in each, whole or one per cell
const within = async rect => [...new Set((await Promise.all((await sql(`
    SELECT unnest(h3_polygon_wkt_to_cells_experimental_string(
        ST_AsText(ST_MakeEnvelope(${rect})), 1, 'overlap')) AS cell`,
    { lane: 'card' })).map(({ cell }) =>
        objects('infrastructure', { key: cell })))).flat())];

// the nearest MAX_SHOW within the radius, and the attributed ids wherever
// they are, nearest first: one statement over the objects the rect lies in,
// each fetched whole where the index says it is small, on the columns every
// provider shares. rows are hilbert-clustered on lon/lat, so the rect
// prunes, and it stretches to the attribution's assessed source point so a
// distant attributed feature still loads. every bound folds to a constant,
// which is what lets it push down. resolves to what it drew, or nothing if
// stale
export async function selectPlume(lon, lat, radiusKm, rec) {
    const r = radiusKm * 1000, now = ++epoch;
    const hl = (rec?.attributed_ids || []).map(id => quote(normId(id)));
    const [ax, ay] = rec?.lat != null ? [+rec.lon, +rec.lat] : [lon, lat];
    const dLat = `${r} / 111320`;
    const dLon = `${r} / (111320 * greatest(0.05, cos(radians(${lat}))))`;
    const w = `least(${lon} - ${dLon}, ${ax} - 0.02)`;
    const e = `greatest(${lon} + ${dLon}, ${ax} + 0.02)`;
    const s = `least(${lat} - ${dLat}, ${ay} - 0.02)`;
    const n = `greatest(${lat} + ${dLat}, ${ay} + 0.02)`;
    const rows = await within(`${w}, ${s}, ${e}, ${n}`).then(async urls => {
        urls.forEach(prefetchData);
        return urls.length ? sql(`
        SELECT id, kind, name, operator, status, fuel, detail, lon, lat,
            ST_Distance_Sphere(ST_Point(lon, lat), ST_Point(${lon}, ${lat}))
                AS dist,
            list_contains([${hl}]::VARCHAR[], id) AS hl
        FROM ${await from(urls)}
        WHERE lon BETWEEN ${w} AND ${e} AND lat BETWEEN ${s} AND ${n}
          AND kind NOT IN (${AREAS.map(quote).join(', ')})
        QUALIFY hl OR (dist <= ${r}
            AND row_number() OVER (ORDER BY dist) <= ${MAX_SHOW})
        ORDER BY dist`, { lane: 'card' }) : [];
    }).catch(err => (console.warn('candidates unavailable:', err), []));
    if (now !== epoch) return;
    render(fc(rows).features);
    return shown;
}

// the epoch bump keeps a closed card from being refilled by its own read
export function clearSelection() {
    epoch++;
    render([]);
}

export function addCandidateLayers(m, before = 'plumes') {
    map = m;
    map.addSource('candidates', { type: 'geojson',
        data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
        id: 'candidates-hit', type: 'circle', source: 'candidates',
        paint: { 'circle-radius': 22, 'circle-opacity': 0,
                 'circle-stroke-width': 0 },
    }, before);
    // the attributed one is told apart by shape and size, not a tint
    map.addLayer({
        id: 'candidates', type: 'symbol', source: 'candidates',
        layout: {
            ...PIN,
            'icon-image': ['case', ['get', 'hl'], MARK.attributed,
                           MARK.candidate],
            'icon-size': ['case', ['get', 'hl'], 1.4, 0.9],
        },
    }, before);

    hover(map, 'candidates-hit', p => {
        const kind = (p.kind || '').replace(/_/g, ' ');
        const title = p.name || kind;
        const detail = [kind, p.operator, p.status,
            p.fuel, p.detail, p.dist != null && fmtMetres(p.dist)]
            .filter(v => v && v !== title).join(' · ');
        return { heading: title, text: `${detail}\n${p.id}` };
    });
}

