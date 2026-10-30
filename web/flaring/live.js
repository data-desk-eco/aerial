// live sentinel-2 flaring from burnoff's service (data-desk-eco/burnoff,
// its serve/ on the jump host), which reads the view's scenes off eodata
// in region, off its store where it holds them. the view, from LIVE_ZOOM
// in, asks for fixed BLOCK degree blocks of sites (f=sites): the last
// RECENT days STEP at a time first, then the rest back to DAYS a month at
// a time, the view's middle first. each site comes with its looks (the
// cloud of the 640 m square under it, a date) and its detections, under an
// id the service gives it the same whatever block or window asks (its
// sites.sql); the fallback's detections join a site within SITE_M.
// the browser's http cache keeps what came back (the service's max-age), so
// a reload starts from it. where
// the service fails, burnoff's detector reads the block here (fallback.js),
// loaded only then.

import { dateInQuarters, quarterOf } from '../shell/util.js';
import { MODE } from './render.js';
import { viewportBbox } from '../shell/map.js';

export const LIVE_ZOOM = 12;
// ?api= on the page names another service
const API = new URLSearchParams(location.search).get('api')
    || 'https://dev.datadesk.eco/burnoff/hotspots';
const DAYS = 180, RECENT = 30, BACK = 90, FIRST = '2022-01-25';
const SITE_M = 100, CLEAR = 0.6, MIN_LOOKS = 10, BLOCK = 0.1, FLY = 4;
const ago = (d, n) => new Date(Date.parse(d) - n * 864e5).toISOString()
    .slice(0, 10);
const today = () => ago(new Date(), 0);

// a site is drawn as the archive's are: lit on LIT dates, over aerial's
// floor on its mean b12, and not lit only in its hemisphere's summer, april
// to august in the north (the archive's `seasonal`): a solar panel or a
// sawtooth roof that catches a high sun
const LIT = 2;
const summer = (d, lat) => (+d.slice(5, 7) + (lat < 0 ? 2 : 8)) % 12 < 5;
const drawn = s => {
    const l = [...s.looks].filter(([, x]) => x.flare);
    return l.length >= LIT && !l.every(([d]) => summer(d, s.lat))
        && l.reduce((a, [, x]) => a + x.flare.max_b12, 0) / l.length
        >= MODE.s2.floor;
};

// ── sites: each a Map of date -> {cloud, flare?}, a date's clearest look
// and brightest flare ──

const sites = [], byId = new Map(), bucket = new Map();
const cell = p => `${Math.floor(p.lon * 100)},${Math.floor(p.lat * 100)}`;
const metres = (a, b) => Math.hypot((a.lon - b.lon) * Math.cos(a.lat
    * Math.PI / 180), a.lat - b.lat) * 111320;
const near = p => {
    const [x, y] = cell(p).split(',').map(Number);
    for (let d = 0; d < 9; d++)
        for (const s of bucket.get(`${x + d % 3 - 1},${y + (d / 3 | 0) - 1}`)
            ?? []) if (metres(s, p) <= SITE_M) return s;
};
const found = (id, lat, lon, any = true) => byId.get(id)
    ?? (any ? near({ lat, lon }) : null) ?? (s => {
    sites.push(s), byId.set(id, s);
    bucket.set(cell(s), [...bucket.get(cell(s)) ?? [], s]);
    return s;
})({ id, lat, lon, looks: new Map() });
function look(s, date, cloud, flare) {
    const l = s.looks.get(date) ?? s.looks.set(date, { cloud }).get(date);
    l.cloud = Math.min(l.cloud, cloud);
    if (flare && !(l.flare?.max_b12 >= flare.max_b12)) l.flare = flare;
}
// a block's sites as the service gives them, or the fallback's scenes
function absorb(fs) {
    for (const { geometry: { coordinates: [lon, lat] }, properties: p } of fs) {
        const s = found(p.id, lat, lon, false), c = new Map(p.looks);
        c.forEach((v, d) => look(s, d, v));
        p.detections.forEach(f => look(s, f.date, c.get(f.date) ?? 0, f));
        s.ok = drawn(s);
    }
}
const land = (box, scenes) => scenes.forEach(x => {
    if (x.error) return console.warn('burnoff:', x.url, x.error);
    for (const f of x.hotspots)
        look(found(`live:${f.lat.toFixed(5)},${f.lon.toFixed(5)}@${x.tile}_${
            x.date}`, f.lat, f.lon), x.date, f.cloud, { ...f, date: x.date });
    if (x.cloud >= 0) sites.forEach(s => inside(s, box) && look(s, x.date,
        x.cloud));
    sites.forEach(s => s.ok = drawn(s));
});
const inside = (p, [w, s, e, n]) =>
    p.lon >= w && p.lon <= e && p.lat >= s && p.lat <= n;

// ── requests: a box's sites from a to b, kept by key in memory; FLY at
// once, the most wanted first ──

// the store an older build kept here, cleared
indexedDB.deleteDatabase('burnoff-live');
const got = new Map(), queue = [];
let fly = 0, moving = false, still, changed = () => {}, read = () => {};
// a request's mean time, ms, learnt as they come back; a block in flight is
// credited its share of it so far, short of done, the bar ticking meanwhile
let mean = 4000, tick;
const get = (box, a, b) => fetch(`${API}?bbox=${box.map(v =>
    v.toFixed(5))}&datetime=${a}/${b}&f=sites`)
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(({ features }) => absorb(features));
// a failed request is made once more, 5 s on (the service restarts on a
// deploy), before the detector here reads the box
const fetchBlock = (box, a, b) => get(box, a, b).catch(() => new Promise(ok =>
    setTimeout(ok, 5000)).then(() => get(box, a, b))).catch(e => (
    console.warn('burnoff: service', e), import('./fallback.js')
        .then(m => m.detect(box, a, b)).then(x => land(box, x))));
const want = (box, a, b, r, pri) => {
    const k = `${box} ${a} ${b}`;
    got.has(k) || queue.push(got.set(k, { box, a, b, r, pri }).get(k)), pump();
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
            mean = Math.max(1e3, mean + (performance.now() - j.t0 - mean) / 8),
            changed(), read(), pump()));
    }
}
export const hold = h => {
    clearTimeout(still), moving = true;
    if (!h) still = setTimeout(() => (moving = false, pump()), 500);
};

// ── the view: its blocks, the recent window first, then by distance ──

let shown = [0, 0, 0, 0], off = true, blocks = [];
// the windows asked for, newest first: RECENT days in STEP days, r 0, then
// back to DAYS in months, r 1, each a step of the view's progress
const STEP = 10;
const windows = () => Array.from({ length: (DAYS - RECENT) / 30
    + RECENT / STEP }, (_, k) => {
    const [x, n] = k < RECENT / STEP ? [k * STEP, STEP]
        : [RECENT + (k - RECENT / STEP) * 30, 30];
    return [ago(today(), x + n - 1), ago(today(), x), +(x >= RECENT), k];
});
export async function view(map) {
    shown = viewportBbox(map), off = map.getZoom() < LIVE_ZOOM;
    const [i0, j0, i1, j1] = shown.map(v => Math.floor(v / BLOCK));
    blocks = [];
    // in reach while the block meets the view; newest first, then nearest
    // the view's middle
    if (!off) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
        for (const [a, b, r, k] of windows()) blocks.push(want([i, j, i + 1,
            j + 1].map(v => +(v * BLOCK).toFixed(4)), a, b, r, function () {
            const [w, s, e, n] = shown, [x, y, X, Y] = this.box;
            return x > e || X < w || y > n || Y < s ? -1e9 : -1e3 * k
                - Math.hypot((x + X - w - e) / 2, (y + Y - s - n) / 2);
        }));
    read(true);
}
// the view's share of blocks in, recent and older; null out past LIVE_ZOOM
export const progress = () => off ? null : [0, 1].map(r => (b =>
    b.reduce((a, j) => a + (j.done || !!j.t0 && 0.9 * (1 - Math.exp(
        (j.t0 - performance.now()) / mean))), 0) / (b.length || 1))(blocks
        .filter(j => j.r === r)));
export const busy = () => !off && progress().some(v => v < 1);
export const onRead = fn => read = fn;
export function onChange(fn) { changed = fn; }

// ── the map's features: a site each, rated over the ticked quarters ──

export function features(keys) {
    return sites.filter(s => s.ok).map(s => {
        const looks = [...s.looks].filter(([d]) => dateInQuarters(d, keys));
        const clear = looks.filter(([, l]) => l.cloud < CLEAR);
        const on = looks.filter(([, l]) => l.flare);
        const n = clear.filter(([, l]) => l.flare).length;
        return { type: 'Feature', geometry: { type: 'Point',
            coordinates: [s.lon, s.lat] }, properties: {
            id: s.id, kind: 'live', lat: s.lat, lon: s.lon,
            loading: s.fetching > 0,
            name: `${on.length} detection${on.length === 1 ? '' : 's'}`,
            max_b12: Math.max(0, ...on.map(([, l]) => l.flare.max_b12)),
            detection_count: on.length, passes: looks.length,
            observations: clear.length,
            persistence: clear.length >= MIN_LOOKS
                ? Math.min(1, n / clear.length) : null } };
    }).filter(f => f.properties.max_b12 > 0);
}
// a link's site: its own id, else the one held near where it was found
const at = id => (([lat, lon]) => ({ lat, lon }))(id.slice(5).split(/[,@]/)
    .map(Number));
export const site = (id, keys) => (f => f.find(f => f.properties.id === id)
    ?? f.find(f => metres(f.properties, at(id)) <= SITE_M) ?? null)(
    features(keys));
export const quarters = b => new Set(sites.filter(p => p.ok && inside(p, b))
    .flatMap(p => [...p.looks].filter(([, l]) => l.flare)
        .map(([d]) => quarterOf(d))));

// ── a card: its site's last BACK days, and BACK more on older(), back to
// FIRST, a request of a small box around it a window ──

const D = 0.004;
let deep;
function history(s, a, b) {
    const k = D / Math.cos(s.lat * Math.PI / 180);
    s.fetching = (s.fetching ?? 0) + 1, s.since = a, changed();
    fetchBlock([s.lon - k, s.lat - D, s.lon + k, s.lat + D], a, b)
        .finally(() => (s.fetching--, s.ok = drawn(s), changed()));
}
export const deepen = id => {
    const s = byId.get(id);
    if (s && s !== deep) deep = s, history(s, ago(today(), BACK), today());
};
export const older = id => deep?.id === id && deep.since > FIRST
    && !deep.fetching && (history(deep, [ago(deep.since, BACK), FIRST]
        .sort()[1], ago(deep.since, 1)), true);
// a site's dated detections, oldest first, as the card lists them
export const series = id => [...byId.get(id)?.looks ?? []]
    .filter(([, l]) => l.flare).sort(([a], [b]) => a < b ? -1 : 1)
    .map(([date, { flare: f }]) => ({ date, max_b12: f.max_b12,
        pixels: f.pixels, raw_lat: f.lat, raw_lon: f.lon, px: f.px }));
globalThis.burnoff = { sites, queue, got };
