// live flaring from burnoff's service (data-desk-eco/burnoff, its serve/ on
// the jump host, over quack: service.js), which reads the view's scenes off
// eodata in region, off its store where it holds them: sentinel-2 by day
// (`sites`) and sentinel-3 by night (`s3_sites`), an instrument each, made
// by live(spec). the view, from the instrument's zoom in, asks for fixed
// block degree blocks of sites: the last RECENT days STEP at a time first,
// then the rest back to DAYS a month at a time, the view's middle first.
// each site comes with its looks (the cloud of the square under it, a date)
// and its detections, named by its detections' mean place rounded (the
// service's sites.sql, s3sites.sql). the mean can cross a rounding edge as
// the store fills, so a site joins one held within the spec's idM, never
// two of one answer, which the service keeps apart. the browser's http cache
// is no help over quack, so a reload asks again, and the service answers
// from its store. where the service fails, an instrument with a fallback
// (s2's: burnoff's detector here, fallback.js, loaded only then) reads the
// block itself.

import { dateInQuarters, quarterOf } from '../shell/util.js';
import { MODE } from './render.js';
import { viewportBbox } from '../shell/map.js';
import { call } from './service.js';

const DAYS = 180, RECENT = 30, BACK = 90, STEP = 10, FLY = 4;
const ago = (d, n) => new Date(Date.parse(d) - n * 864e5).toISOString()
    .slice(0, 10);
// ?asof= on the page reads as if on that date, for a service that holds
// only the past (a local one off a mirror that stops short of today)
const ASOF = new URLSearchParams(location.search).get('asof');
const today = () => ASOF ?? ago(new Date(), 0);
const metres = (a, b) => Math.hypot((a.lon - b.lon) * Math.cos(a.lat
    * Math.PI / 180), a.lat - b.lat) * 111320;
const inside = (p, [w, s, e, n]) =>
    p.lon >= w && p.lon <= e && p.lat >= s && p.lat <= n;

// ── the instruments ──

// s2: a site is drawn as the archive's are: lit on LIT dates, over aerial's
// floor on its mean b12, and not lit only in its hemisphere's summer, april
// to august in the north (the archive's `seasonal`): a solar panel or a
// sawtooth roof that catches a high sun. a look is clear under 0.6 cloud
const LIT = 2;
const summer = (d, lat) => (+d.slice(5, 7) + (lat < 0 ? 2 : 8)) % 12 < 5;
const S2 = {
    fn: 'sites', kind: 's2', label: 'S2', zoom: 12, block: 0.1,
    idM: 40, siteM: 100, clear: 0.6, minLooks: 10, first: '2022-01-25',
    card: 0.004, value: f => f?.max_b12,
    drawn: s => {
        const l = [...s.looks].filter(([, x]) => x.flare);
        return l.length >= LIT && !l.every(([d]) => summer(d, s.lat))
            && l.reduce((a, [, x]) => a + x.flare.max_b12, 0) / l.length
            >= MODE.s2.floor;
    },
    props: on => ({ max_b12: Math.max(0, ...on.map(f => f.max_b12)) }),
    row: f => ({ max_b12: f.max_b12, pixels: f.pixels, raw_lat: f.lat,
                 raw_lon: f.lon, px: f.px }),
    fallback: () => import('./fallback.js'),
};
// s3: a site is drawn lit on LIT nights; a night is clear where the 0.02°
// square under the site was half clear or more (docs/s3.md: lit nights are
// no cloudier). its sites come 250 m to the id and move as nights come,
// up to 1 km on a site of few nights, and distinct ones stand 790 m or more
// apart: they join within 600 m. its radiant heat reads on vnf's scale
const S3 = {
    fn: 's3_sites', kind: 's3', label: 'S3', zoom: 9, block: 0.5,
    idM: 600, siteM: 600, clear: 0.5, minLooks: 10, first: '2018-06-01',
    card: 0.01, value: f => f?.rh,
    drawn: s => [...s.looks.values()].filter(x => x.flare).length >= LIT,
    props: on => ({ max_rh: Math.max(0, ...on.map(f => f.rh)),
                    avg_rh: on.reduce((a, f) => a + f.rh, 0)
                        / (on.length || 1) }),
    row: f => ({ rh_mw: f.rh, temp_k: f.temperature, pixels: f.pixels,
                 raw_lat: f.lat, raw_lon: f.lon, px: f.px }),
};

export function live(spec) {
    const { kind, label, block, idM, siteM, first } = spec;

    // ── sites: each a Map of date -> {cloud, flare?}, a date's clearest
    // look and brightest flare ──

    const sites = [], byId = new Map(), bucket = new Map();
    const cell = p => `${Math.floor(p.lon * 100)},${Math.floor(p.lat * 100)}`;
    // the nearest held within r, other than those `skip` names
    const near = (p, r, skip) => {
        const [x, y] = cell(p).split(',').map(Number);
        let best, d0 = r;
        for (let d = 0; d < 9; d++)
            for (const s of bucket.get(`${x + d % 3 - 1},${y + (d / 3 | 0)
                - 1}`) ?? []) {
                const m = metres(s, p);
                if (m <= d0 && !skip?.has(s)) best = s, d0 = m;
            }
        return best;
    };
    const found = (id, lat, lon, r = siteM, skip) => (s => skip?.has(s)
        ? undefined : s)(byId.get(id)) ?? near({ lat, lon }, r, skip)
        ?? (s => {
            sites.push(s), byId.set(id, s);
            bucket.set(cell(s), [...bucket.get(cell(s)) ?? [], s]);
            return s;
        })({ id, lat, lon, looks: new Map() });
    function look(s, date, cloud, flare) {
        const l = s.looks.get(date) ?? s.looks.set(date, { cloud })
            .get(date);
        l.cloud = Math.min(l.cloud, cloud);
        if (flare && !(spec.value(l.flare) >= spec.value(flare)))
            l.flare = flare;
    }
    // a block's sites as the service gives them, two of one answer never
    // one held site
    function absorb(fs) {
        const took = new Set();
        for (const { geometry: { coordinates: [lon, lat] },
                     properties: p } of fs) {
            const s = found(p.id, lat, lon, idM, took), c = new Map(p.looks);
            took.add(s);
            c.forEach((v, d) => look(s, d, v));
            p.detections.forEach(f => look(s, f.date, c.get(f.date) ?? 0,
                f));
            s.ok = spec.drawn(s);
        }
    }
    // the fallback's scenes
    const land = (box, scenes) => scenes.forEach(x => {
        if (x.error) return console.warn('burnoff:', x.url, x.error);
        for (const f of x.hotspots)
            look(found(`live:${f.lat.toFixed(5)},${f.lon.toFixed(5)}@${
                x.tile}_${x.date}`, f.lat, f.lon), x.date, f.cloud,
                { ...f, date: x.date });
        if (x.cloud >= 0) sites.forEach(s => inside(s, box) && look(s,
            x.date, x.cloud));
        sites.forEach(s => s.ok = spec.drawn(s));
    });

    // ── requests: a box's sites from a to b, kept by key in memory; FLY
    // at once, the most wanted first ──

    const got = new Map(), queue = [];
    let fly = 0, moving = false, still, changed = () => {}, read = () => {};
    // a request's mean time, ms, learnt as they come back; a block in
    // flight is credited its share of it so far, short of done, the bar
    // ticking meanwhile
    let mean = 4000, tick;
    const get = (box, a, b) => call(spec.fn, box, a, b)
        .then(({ features }) => absorb(features));
    // a failed request is made once more, 5 s on (the service restarts on
    // a deploy), before the fallback reads the box, if there is one
    const fetchBlock = (box, a, b) => get(box, a, b).catch(() =>
        new Promise(ok => setTimeout(ok, 5000)).then(() => get(box, a, b)))
        .catch(e => (console.warn(`burnoff ${label}: service`, e),
            spec.fallback ? spec.fallback().then(m => m.detect(box, a, b))
                .then(x => land(box, x)) : undefined));
    const want = (box, a, b, r, pri) => {
        const k = `${box} ${a} ${b}`;
        got.has(k) || queue.push(got.set(k, { box, a, b, r, pri }).get(k)),
        pump();
        return got.get(k);
    };
    function pump() {
        while (!moving && fly < FLY && queue.length) {
            queue.sort((x, y) => x.pri() - y.pri());
            // out of reach, or older while the view's recent are not all in
            const x = queue.at(-1);
            if (x.pri() < -1e8 || x.r && [...got.values()].some(j => !j.r
                && !j.done && j.pri() > -1e8)) return;
            const j = queue.pop();
            fly++, j.t0 = performance.now(), tick ??= setInterval(() => fly
                ? read() : (clearInterval(tick), tick = null), 250);
            fetchBlock(j.box, j.a, j.b).finally(() => (fly--, j.done = true,
                mean = Math.max(1e3, mean + (performance.now() - j.t0 - mean)
                    / 8), changed(), read(), pump()));
        }
    }
    const hold = h => {
        clearTimeout(still), moving = true;
        if (!h) still = setTimeout(() => (moving = false, pump()), 500);
    };

    // ── the view: its blocks, the recent window first, then by distance ──

    let shown = [0, 0, 0, 0], off = true, blocks = [];
    // the windows asked for, newest first: RECENT days in STEP days, r 0,
    // then back to DAYS in months, r 1, each a step of the view's progress
    const windows = () => Array.from({ length: (DAYS - RECENT) / 30
        + RECENT / STEP }, (_, k) => {
        const [x, n] = k < RECENT / STEP ? [k * STEP, STEP]
            : [RECENT + (k - RECENT / STEP) * 30, 30];
        return [ago(today(), x + n - 1), ago(today(), x), +(x >= RECENT), k];
    });
    // the view, or none: an instrument not drawn asks for nothing
    function view(map) {
        shown = map ? viewportBbox(map) : shown;
        off = !map || map.getZoom() < spec.zoom;
        const [i0, j0, i1, j1] = shown.map(v => Math.floor(v / block));
        blocks = [];
        // in reach while the block meets the view; newest first, then
        // nearest the view's middle
        if (!off) for (let j = j0; j <= j1; j++)
            for (let i = i0; i <= i1; i++)
                for (const [a, b, r, k] of windows()) blocks.push(want([i, j,
                    i + 1, j + 1].map(v => +(v * block).toFixed(4)), a, b, r,
                    function () {
                        const [w, s, e, n] = shown, [x, y, X, Y] = this.box;
                        return off || x > e || X < w || y > n || Y < s ? -1e9
                            : -1e3 * k - Math.hypot((x + X - w - e) / 2,
                                (y + Y - s - n) / 2);
                    }));
        read(true);
    }
    // the view's share of blocks in, recent and older; null out of reach
    const progress = () => off ? null : [0, 1].map(r => (b =>
        b.reduce((a, j) => a + (j.done || !!j.t0 && 0.9 * (1 - Math.exp(
            (j.t0 - performance.now()) / mean))), 0) / (b.length || 1))(
        blocks.filter(j => j.r === r)));
    const busy = () => !off && progress().some(v => v < 1);

    // ── the map's features: a site each, rated over the ticked quarters ──

    function features(keys) {
        return sites.filter(s => s.ok).map(s => {
            const looks = [...s.looks].filter(([d]) =>
                dateInQuarters(d, keys));
            const clear = looks.filter(([, l]) => l.cloud < spec.clear);
            const on = looks.filter(([, l]) => l.flare);
            const n = clear.filter(([, l]) => l.flare).length;
            return { type: 'Feature', geometry: { type: 'Point',
                coordinates: [s.lon, s.lat] }, properties: {
                id: s.id, kind, lat: s.lat, lon: s.lon,
                loading: s.fetching > 0,
                name: `${on.length} detection${on.length === 1 ? '' : 's'}`,
                ...spec.props(on.map(([, l]) => l.flare)),
                detection_count: on.length, passes: looks.length,
                observations: clear.length,
                persistence: clear.length >= spec.minLooks
                    ? Math.min(1, n / clear.length) : null } };
        }).filter(f => f.properties[MODE[kind].prop] > 0);
    }
    // a link's site: its own id, else the one held near where it was found
    const at = id => (([lat, lon]) => ({ lat, lon }))(id.slice(id
        .indexOf(':') + 1).split(/[,@]/).map(Number));
    const site = (id, keys) => (f => f.find(f => f.properties.id === id)
        ?? f.find(f => metres(f.properties, at(id)) <= siteM) ?? null)(
        features(keys));
    const quarters = b => new Set(sites.filter(p => p.ok && inside(p, b))
        .flatMap(p => [...p.looks].filter(([, l]) => l.flare)
            .map(([d]) => quarterOf(d))));

    // ── a card: its site's last BACK days, and BACK more on older(), back
    // to first, a request of a small box around it a window ──

    let deep;
    function history(s, a, b) {
        const D = spec.card, k = D / Math.cos(s.lat * Math.PI / 180);
        s.fetching = (s.fetching ?? 0) + 1, s.since = a, changed();
        fetchBlock([s.lon - k, s.lat - D, s.lon + k, s.lat + D], a, b)
            .finally(() => (s.fetching--, s.ok = spec.drawn(s), changed()));
    }
    const deepen = id => {
        const s = byId.get(id);
        if (s && s !== deep) deep = s, history(s, ago(today(), BACK),
            today());
    };
    const older = id => deep?.id === id && deep.since > first
        && !deep.fetching && (history(deep, [ago(deep.since, BACK), first]
            .sort()[1], ago(deep.since, 1)), true);
    // a site's dated detections, oldest first, as the card lists them
    const series = id => [...byId.get(id)?.looks ?? []]
        .filter(([, l]) => l.flare).sort(([a], [b]) => a < b ? -1 : 1)
        .map(([date, { flare: f }]) => ({ date, ...spec.row(f) }));

    // ── the page: redraw() at most once a second while reads land, and
    // never while the map moves; and the view's search in the status line
    // as it changes, or a view is new, taken down once it is done, but only
    // if this view saw it short of done: a view already searched says
    // nothing. reads further out change nothing it says, and do not hold
    // it up. just out of reach, a line says to zoom in ──

    function watch(map, status, redraw) {
        let soon, said, ran;
        const draw = () => map.isMoving() ? map.once('moveend', draw)
            : (soon = null, redraw());
        changed = () => soon ??= setTimeout(draw, 1000);
        read = fresh => {
            const z = map.getZoom(), p = z >= spec.zoom && progress();
            status('zoom' + kind, z < spec.zoom && z >= spec.zoom - 2
                ? `Zoom in to detect ${label} hotspots` : null);
            if (z < spec.zoom) return said = null, status(kind);
            if (!p) return;
            const [a, b] = p, say = a < 1
                ? `Recent ${label} hotspots: ${pct(a)}%`
                : `Older ${label} hotspots: ${pct(b)}%`;
            if (fresh) ran = a < 1 || b < 1;
            if (!ran || !busy()) return said = null, status(kind);
            if (fresh || say !== said)
                said = say, status(kind, say, a < 1 ? a : b);
        };
    }

    return { kind, view, busy, hold, watch, features, site, quarters,
             deepen, older, series, debug: { sites, queue, got } };
}

// padded with figure spaces, as wide as a digit in tabular figures
// (shell.css), so the line keeps its width
const pct = v => String(Math.floor(100 * v)).padStart(3, '\u2007');

export const s2 = live(S2), s3 = live(S3);
globalThis.burnoff = { s2: s2.debug, s3: s3.debug };
