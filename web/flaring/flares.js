// vnf flaring, in the engine. eog/flares is a row per site with its
// quarterly history nested in `quarters`, small enough to be held as an
// engine buffer (shell/data.js), so a window is one statement: summed, the
// site rated and named, and the rows out as the map's properties. the
// per-date series is read per site on card open, off the object its cell
// names, which the engine computes from the site's position. the sentinels
// are live (live.js), not read here.

import { sql, from } from '../shell/data.js';
import { objects } from '../shell/archive.js';
import { quote, quarterKey } from '../shell/util.js';

// the share of the window's nights the sky was read; below it a platform
// was grounded, and there is no rate
const COVERAGE_MIN = 0.8;

// no keys is no window, and admits every quarter
const ticked = (d, keys) => keys.size
    ? `${quarterKey(d)} IN (${[...keys].map(quote).join(', ')})` : 'true';

// the one reducer `quarters` goes through, so no caller can
// redefine persistence without changing how it reads. `clear` is the
// cloud-free count a rate divides by, and `detections_clear` the only
// numerator that pairs with it; `observations` is every look. `n` counts the
// quarters kept: 0 means the window measured nothing, not zero.
//
// a field is null unless every kept quarter carried it: summing a null as 0
// turns "we never counted the passes" into "no pass was ever made".
const SUMS = ['days', 'observations', 'clear', 'detections',
              'detections_clear', 'rh_sum'];
const reduce = keys => `(SELECT count(*) AS n, ${SUMS.map(k => `
    CASE WHEN count(q.${k}) = count(*)
        THEN coalesce(sum(q.${k}), 0)::DOUBLE END AS ${k}`).join(',')},
    coalesce(max(q.rh_max), 0) AS rh_max
    FROM unnest(f.quarters) AS u(q) WHERE ${ticked('q.quarter', keys)})`;

// a site's window. a site is named by its provider alone: a detection
// meets a facility only on the map, or through a ch4id attribution
const site = (src, keys, where, cols) => `
    SELECT f.id, f.lat, f.lon, ${cols}, w.*
    FROM ${src} AS f, LATERAL ${reduce(keys)} AS w WHERE ${where}`;

// vnf sites, brightest first. both counts are clear nights, so the ratio is
// a rate; null, not 0, where too little was read or no night was clear:
// never seen is not unlit. there is no intensity floor. `lit` keeps a site
// lit on any night, cloudy ones included: a flare caught only under cloud
// still burned
export const vnf = (src, keys, where = 'true', lit = false) => `
    SELECT coalesce(nullif(detail, ''), 'Flare #' || id) AS name,
        'vnf' AS kind, lat, lon, id,
        coalesce(detail, '') AS detail, coalesce(country, '') AS country,
        CASE WHEN detections > 0 THEN rh_sum / detections ELSE 0 END
            AS avg_rh,
        rh_max AS max_rh, detections_clear AS detection_count,
        observations AS passes, clear AS observations,
        CASE WHEN observations >= ${COVERAGE_MIN} * days AND clear > 0
            THEN detections_clear / clear END AS persistence
    FROM (${site(src, keys, where, 'f.detail, f.country')})
    WHERE n > 0 ${lit ? 'AND detections > 0' : ''}
    ORDER BY rh_max DESC`;

// ── reads ──

// a table partitioned past the prefetch cap names no single object, and that
// has to be the loud kind of broken rather than a blank map
const src = provider => objects('flares', { provider }).then(([u]) => u ? from(u)
    : Promise.reject(new Error(`${provider}/flares names no object: it has `
        + 'partitioned, and this reader must address it by cell')));

// the whole world: a window's rates are the same wherever the map looks
const inWindow = ({ startDate, endDate }) =>
    `f.last_seen >= ${quote(startDate)} AND f.first_seen <= ${quote(endDate)}`;

// a vnf site with no rate is dropped: no clear night is a finding. here, not
// in a layer filter, as a cluster counts what its source holds
export const readVNF = async (range, keys) => sql(`SELECT * FROM (${vnf(
    await src('eog'), keys, inWindow(range), true)})
    WHERE persistence IS NOT NULL`);

// #flare= names a vnf site, where it names no live one (live.js)
export const readSite = async (id, keys) => (await sql(vnf(await src('eog'),
    keys, `f.id = ${quote(String(id))}`)))[0] ?? null;

// the quarter keys with any detection in the box over [start, end]
export const quarters = async (provider, [w, s, e, n], start, end) =>
    new Set((await sql(`SELECT DISTINCT ${quarterKey('q.quarter')} AS k
        FROM ${await src(provider)} AS f, unnest(f.quarters) AS u(q)
        WHERE q.detections > 0 AND q.quarter BETWEEN ${quote(start)}
            AND ${quote(end)} AND f.lon BETWEEN ${+w} AND ${+e}
            AND f.lat BETWEEN ${+s} AND ${+n}`)).map(r => r.k));

// one site's per-date history, oldest first, off the object its cell
// names. the cell is the engine's, off the site's position, as the archive's
// is: nothing carries it. a reopened card is read again from the ranges the
// engine kept
const series = (provider, cols, also = () => '') => async p => {
    if (!p.id) return [];
    const [{ cell }] = await sql(`SELECT
        h3_latlng_to_cell_string(${+p.lat}, ${+p.lon}, 1) AS cell`,
        { lane: 'card' });
    const [u] = await objects('detections', { provider, key: cell });
    if (!u) return [];
    return sql(`SELECT left(date::VARCHAR, 10) AS date, ${cols}
        FROM ${await from(u)} WHERE site_id = ${quote(String(p.id))}
        ${also(cell)} ORDER BY date`, { lane: 'card' });
};

// every row is a night the site was seen lit, so there is nothing to filter
export const vnfSeries = series('eog', 'coalesce(rh_mw, 0)::DOUBLE AS rh_mw');
