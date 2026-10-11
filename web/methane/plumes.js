// the plume reader: every provider's detections for one date window, read
// straight from the archive's detections tables with the window as a date
// predicate, so row-group statistics keep a re-read cheap. it reads, and
// knows nothing about the map.

import { read, sql, from, fc } from '../shell/data.js';
import { objects } from '../shell/archive.js';
import { quote, quarterKey, canon } from '../shell/util.js';

// every column rides into the geojson, so the projection stays narrow.
// not `bounds`: nature trace's wkt footprints are 7.6 of its 9.4 MB (6.5 as
// geometry), and only a data desk card's overlay needs one, so plumeBounds
// reads it on the card
const COLS = ['id', 'kind', 'provider', 'date', 'lat', 'lon', 'rate_kg_h',
    'rate_std_kg_h', 'satellite', 'sector', 'link', 'overlay'];
// extension columns: nature trace's ppm·m enhancement (not a mass rate) and
// grading, and the producer's wind at the plume. a provider without them
// omits them, so they are only selected over the union, which fills null
const EXT = ['observed_enh', 'confidence', 'cluster_size',
    'wind_ms', 'wind_from_deg'];
// `detections` holds flares too, and an untrusted retrieval rides along
// with valid = false
const PLUMES = "kind = 'plume' AND valid";
// nature trace grades every plume high or medium; only high is shown. on the
// union alone, which fills the null of the providers that do not grade
const CONFIDENT = "coalesce(confidence, 'high') = 'high'";
export const isPlume = p => p.kind === 'plume';

// colour never means provider here; the label is the only editorial part
const LABEL = { 'carbon-mapper': 'Carbon Mapper', imeo: 'IMEO / MARS',
    sron: 'SRON', 'data-desk': 'Data Desk' };
export const label = p => LABEL[p] ?? p;

// t/hr, or null where the provider published no rate
export const rateT = p => p.rate_kg_h == null ? null
    : (Number(p.rate_kg_h) / 1000).toFixed(1);
// nature trace's ppm·m enhancement, kept apart so it is never read as t/hr
export const enhT = p => p.observed_enh == null ? null
    : Number(p.observed_enh).toFixed(0);

const plumeObjects = () => objects('detections')
        .catch(err => (console.warn('archive index:', err), []));

const statement = async (objs, cols, where) =>
    `SELECT ${cols.join(', ')} FROM ${await from(objs)} WHERE ${PLUMES}
    AND ${where}`;

// one unioned read; if it fails, each object on its own on the base columns,
// so a missing provider costs only its own rows
async function readAll(where) {
    const objs = await plumeObjects();
    try {
        return await sql(await statement(objs, [...COLS, ...EXT],
            `${CONFIDENT} AND ${where}`));
    } catch (err) {
        console.warn('plume union read failed, reading per object:', err);
    }
    const reads = await Promise.allSettled(
        objs.map(async u => sql(await statement(u, COLS, where))));
    for (const r of reads)
        if (r.status === 'rejected')
            console.warn('a detections source did not load:', r.reason);
    return reads.flatMap(r => r.value ?? []);
}

// the display read. it does not wait on the attributions: the card reads
// them, and nothing on the map does
export const readPlumes = (start, end) =>
    readAll(`date BETWEEN ${quote(start)} AND ${quote(end)}`);

// one plume's footprint, off its own provider's object, on the card lane
export async function plumeBounds({ id, provider }) {
    const objs = await objects('detections', { provider });
    if (!objs.length) return null;
    const [row] = await read(objs, { lane: 'card', columns: ['bounds'],
        where: { id: [String(id), String(id)] } });
    return row?.bounds ?? null;
}

// availability has to answer for quarters outside the ticked window, so the
// grid's span of plumes is held in the engine for the session, three columns
// of it, and every pan asks that
let index = null;
const plumeIndex = (start, end) => index ??= plumeObjects()
    .then(async objs => sql(`CREATE TABLE plume_index AS ${await statement(
        objs, ['date', 'lat', 'lon'], `${CONFIDENT} AND date BETWEEN ${quote(
        start)} AND ${quote(end)}`)}`))
    .catch(err => console.warn('plume availability:', err));

export async function availableQuartersPlumes([w, s, e, n], start, end) {
    await plumeIndex(start, end);
    return new Set((await sql(`SELECT DISTINCT ${quarterKey('date')} AS k
        FROM plume_index WHERE lon BETWEEN ${+w} AND ${+e}
        AND lat BETWEEN ${+s} AND ${+n}`).catch(() => [])).map(r => r.k));
}

// a link naming a plume outside the window: one row, on an id equality the
// engine pushes down
export async function readPlume(id) {
    // canon(), in sql: an attribution spells the id its own way
    const [row] = await readAll(`regexp_replace(lower(replace(id, '_', ':')),
        '^[a-z]+:', '') = ${quote(canon(id))}`);
    return row ? fc([row]).features[0] : null;
}
