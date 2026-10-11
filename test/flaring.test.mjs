// the rules a rate is computed under, held in place: flares.js builds the
// statements, and every case below is one a CLAUDE.md incident is written
// against.
//
//   node --test test/

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { execFileSync } from 'node:child_process';

import { s2, vnf } from '../web/flaring/flares.js';
import { quote } from '../web/shell/util.js';

// the statements run in the duckdb cli, as the engine runs them: spatial
// loaded, geometry (lon, lat), and no terminal near anything, so names stay
// derived
const run = q => JSON.parse(execFileSync('duckdb', ['-json', '-c',
    `LOAD spatial; SET geometry_always_xy = true;
     CREATE TABLE terminals (name VARCHAR, lat DOUBLE, lon DOUBLE); ${q}`])
    .toString() || '[]');
const lit = v => v == null ? 'NULL' : Array.isArray(v) ? `[${v.map(lit)}]`
    : typeof v === 'object' ? `{${Object.entries(v)
        .map(([k, x]) => `'${k}': ${lit(x)}`)}}`
    : /^\d{4}-\d\d-\d\d$/.test(v) ? `DATE ${quote(v)}` : quote(v);
const src = row => `(SELECT unnest(r) FROM (SELECT unnest([${lit(row)}]) r))`;

const KEYS = new Set(['2026_1', '2026_2']);
// a quarter key is a date inside its own quarter, which is how the reducer's
// window predicate and the archive's `quarter` column meet
const Q = (quarter, o = {}) => ({
    quarter, days: 90, observations: 80, clear: 40,
    detections: 20, detections_clear: 10, rh_sum: 100, rh_max: 5, ...o,
});
const thin = { clear: 4, detections_clear: 2 };

const S2 = { id: 'a1', cell: '81013ffffffffff', lat: 25, lon: 52,
             first_seen: '2020-01-01', last_seen: '2026-12-31',
             max_b12: 1, avg_b12: 1, persistence: null };
const site = (quarters, o = {}, keys = KEYS) =>
    run(s2(src({ ...S2, quarters, ...o }), keys))[0];
const VNF = { ...S2, id: 'v1', detail: '', country: '' };
const night = (quarters, keys = KEYS) =>
    run(vnf(src({ ...VNF, quarters }), keys));

// the reducer, read through vnf, whose columns are its sums: `passes` is
// every look, `observations` the clear ones
describe('the reducer', () => {
    it('sums the kept quarters', () => {
        const [p] = night([Q('2026-01-01'), Q('2026-04-01')]);
        assert.equal(p.observations, 80);
        assert.equal(p.detection_count, 20);
        assert.equal(p.max_rh, 5);
    });

    it('keeps only the quarters the window ticks', () => {
        const [p] = night([Q('2026-01-01'), Q('2025-01-01')]);
        assert.equal(p.observations, 40);
    });

    // summing a null as zero turns "we never counted the passes" into "no pass
    // was ever made", which a caller then reads as a measurement
    it('returns null for a field any kept quarter is missing', () => {
        const [p] = night([Q('2026-01-01'), Q('2026-04-01', { clear: null })]);
        assert.equal(p.observations, null);
        assert.equal(p.passes, 160);
    });

    it('an empty window measures nothing rather than zero', () => {
        assert.equal(night([Q('2025-01-01')]).length, 0);
        assert.equal(site([Q('2025-01-01')]).passes, null);
    });

    it('no ticked quarter is no window, and admits them all', () => {
        assert.equal(night([Q('2025-01-01')], new Set())[0].observations, 40);
    });
});

describe('s2', () => {
    // the only numerator that pairs with `clear` is `detections_clear`
    it('divides clear-sky detections by clear-sky looks', () => {
        const p = site([Q('2026-01-01'), Q('2026-04-01')]);
        assert.equal(p.detection_count, 20);
        assert.equal(p.observations, 80);
        assert.equal(p.persistence, 20 / 80);
        assert.equal(p.name, '20 detections');
    });

    // below MIN_LOOKS a rate is noise: report the count and no rate
    it('publishes no rate under the looks floor', () => {
        const p = site([Q('2026-01-01', thin)]);
        assert.equal(p.detection_count, 2);
        assert.equal(p.persistence, null);
    });

    // s2 can write several blobs for one site on one day, so the numerator
    // counts rows where the denominator counts days
    it('clamps a rate the grain can push over 1', () => {
        const p = site([Q('2026-01-01', { detections_clear: 400 })]);
        assert.equal(p.persistence, 1);
    });

    // no cloud mask: every pass is the denominator, and the card says the
    // cloud-free count is unknown rather than claiming one
    it('falls back to every look where no clear count is published', () => {
        const p = site(
            [Q('2026-01-01', { clear: null, detections_clear: null })]);
        assert.equal(p.detection_count, 20);
        assert.equal(p.observations, null);
        assert.equal(p.persistence, 20 / 80);
    });

    // the gate ranks on the window's rate, then the published one, and leaves a
    // site nothing has ever rated unrated — the old slider hid such a site
    it('ranks on the window, then the published rate, then not at all', () => {
        assert.equal(site([Q('2026-01-01')], { persistence: 0.9 }).rank, 0.25);
        assert.equal(site([Q('2026-01-01', thin)], { persistence: 0.9 }).rank,
            0.9);
        assert.equal(site([Q('2026-01-01', thin)]).rank, null);
    });
});

describe('vnf', () => {
    const one = o => night([Q('2026-01-01', o)])[0];

    it('divides clear nights lit by clear nights read', () => {
        assert.equal(one().persistence, 10 / 40);
    });

    // never seen is not unlit: under the coverage floor, or with no clear
    // night at all, vnf publishes no rate, and the layer filter drops it
    it('publishes no rate under the coverage floor', () => {
        assert.equal(one({ observations: 45 }).persistence, null);
    });

    it('publishes no rate for a window holding no clear night', () => {
        assert.equal(one({ clear: 0, detections_clear: 0 }).persistence, null);
    });

    it('keeps a dim site: there is no intensity floor', () => {
        assert.equal(one({ rh_sum: 1, rh_max: 0.1 }).avg_rh, 0.05);
    });
});
