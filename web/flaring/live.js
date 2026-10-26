// live sentinel-2 flaring: burnoff's detector (data-desk-eco/burnoff), wasm
// in a worker per core, reading the l1c jpeg2000 straight off google's
// sentinel-2 mirror, whose json api answers cross-origin ranged reads. no
// catalogue, no proxy, no tiler: a view's mgrs tiles are named in the
// worker, one listing per satellite and year gives each tile's scenes, and
// the detector reads the bytes it needs and decodes only clear sky.
//
// it works back from today. a tile's freshest clear scenes are read over the
// whole view, split across the workers, so a flare is drawn as soon as its
// scene is read; every other scene is read only around the sites found, so a
// site's dates fill in behind it, newest first. a site is the detections
// within SITE_M of its first, and a look at it is clear when its 640 m square
// is under CLEAR cloud, as in the archive.

import { dateInQuarters } from '../shell/util.js';

const BUCKET = 'gcp-public-data-sentinel-2';
const LIST = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`;
export const LIVE_ZOOM = 10;
const DAYS = 365, FRESH = 2, SITE_M = 135, CLEAR = 0.6, MIN_LOOKS = 10;

// ── the pool: jobs run highest priority first, one per worker. a job's
// start, when it has one, fills its args as it leaves the queue, or
// returns false to be dropped ──

const N = Math.min(2 * (navigator.hardwareConcurrency || 4), 16);
// every finished read, for the console: [ms since load, args, ms, flares]
const log = [];
const jobs = [], idle = [];
const pump = w => {
    for (;;) {
        if (!jobs.length) return idle.push(w);
        const i = jobs.reduce((b, j, k) => j.pri > jobs[b].pri ? k : b, 0);
        const [j] = jobs.splice(i, 1);
        if (j.start?.(j) !== false)
            return w.job = j, j.t = performance.now(),
                w.postMessage([0, ...j.args]);
    }
};
for (let i = 0; i < N; i++) {
    const w = new Worker(new URL('../vendor/burnoff/worker.js',
        import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => {
        if (data[0] === 'ahead') return ahead(data[1], data[2]);
        const j = w.job, t = performance.now();
        if (data !== 'ready') log.push([t | 0, j.args, t - j.t | 0,
            data[1].flares?.length]), j.done(data[1]);
        pump(w);
    };
}
const run = job => new Promise(done => {
    if (job.scene) warm(job.scene);
    jobs.push(Object.assign(job, { done }));
    if (idle.length) pump(idle.pop());
});
const day = scene => +scene.date.replaceAll('-', '');

// the detector's reads block its worker, one at a time. the small ones every
// read of a scene starts with, its cloud mask and each band's header, are
// fetched here at once when the read is queued: the browser's http cache
// answers the same ranged read again, a worker's included, in under a ms
const gcs = u => 'https://storage.googleapis.com/download/storage/v1/b/'
    + `${BUCKET}/o/${encodeURIComponent(u.slice(6 + BUCKET.length))}?alt=media`;
const ahead = (u, Range) => fetch(u, Range && { headers: { Range } })
    .then(r => r.arrayBuffer()).catch(() => {});
const warmed = new Set();
function warm({ url }) {
    if (warmed.has(url) || !warmed.add(url)) return;
    const get = (u, range) => ahead(gcs(u), range);
    get(url.replace(/\/IMG_DATA\/.*/, '/QI_DATA/MSK_CLASSI_B00.jp2'));
    for (const b of ['B12', 'B11', 'B8A'])
        get(url.replace('B12.jp2', `${b}.jp2`), 'bytes=0-16383');
}

// ── scenes: a tile's last DAYS, newest first, one per sensing time ──

async function list(prefix) {
    const items = [];
    for (let token = ''; ;) {
        const q = new URLSearchParams({ prefix, maxResults: 1000,
            matchGlob: '**/IMG_DATA/*_B12.jp2',
            fields: 'items(name,size),nextPageToken' });
        if (token) q.set('pageToken', token);
        const r = await (await fetch(`${LIST}?${q}`)).json();
        items.push(...r.items ?? []);
        if (!(token = r.nextPageToken)) return items;
    }
}

const listed = new Map();
const scenes = tile => listed.get(tile) ?? listed.set(tile, (async () => {
    const since = new Date(Date.now() - DAYS * 864e5), now = new Date();
    const dir = `tiles/${tile.slice(0, 2)}/${tile[2]}/${tile.slice(3)}`;
    const years = [...new Set([since, now].map(d => d.getUTCFullYear()))];
    const items = (await Promise.all(['S2A', 'S2B', 'S2C'].flatMap(s =>
        years.map(y => list(`${dir}/${s}_MSIL1C_${y}`))))).flat();
    const by = new Map();
    for (const { name } of items) {
        const t = name.split('_')[2];
        const date = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
        if (new Date(date) >= since)
            by.set(t, { date, tile, url: `gs://${BUCKET}/${name}` });
    }
    return [...by.values()].sort((a, b) => b.date < a.date ? -1 : 1);
})()).get(tile);

// ── sites: what the reads found, and every look at each ──

const sites = [];
let changed = () => {};
const metres = (a, b) => Math.hypot((a.lon - b.lon) * Math.cos(a.lat
    * Math.PI / 180), a.lat - b.lat) * 111320;
const near = p => sites.find(s => metres(s, p) <= SITE_M);

// a scene read over a box: each site the box held gets its look, a flare
// joins the site it is near or starts one, and a new site is read in every
// other scene of its tile
function land(scene, held, r) {
    if (r.error) return console.warn('burnoff:', scene.url, r.error);
    held.forEach((s, i) => r.cloud[i] >= 0 && look(s, scene, r.cloud[i]));
    for (const f of r.flares) {
        let s = near(f);
        if (!s) {
            const id = `live:${f.lat.toFixed(5)},${f.lon.toFixed(5)}`;
            sites.push(s = { id, lat: f.lat, lon: f.lon, tile: scene.tile,
                looks: new Map() });
            probe(s);
        }
        const l = look(s, scene, s.looks.get(scene.date)?.cloud ?? f.cloud);
        if (!(l.flare?.max_b12 >= f.max_b12)) l.flare = f;
    }
    changed();
}
const look = (s, scene, cloud) => s.looks.get(scene.date)
    ?? s.looks.set(scene.date, { cloud }).get(scene.date);

// every scene of a site's tile that has not looked at it, newest first. a
// read takes every site waiting on its scene within GROUP of the first, so
// a cluster of sites is one read
const pending = new Map();   // scene url -> the sites waiting on it
const GROUP = 0.03;          // degrees
async function probe(s) {
    for (const scene of await scenes(s.tile))
        if (!s.looks.has(scene.date))
            pending.get(scene.url)?.add(s)
                ?? (pending.set(scene.url, new Set([s])), queue(scene));
}
function queue(scene) {
    let held;
    // newest first, the view's own sites before any other
    run({ get pri() {
        const [s] = pending.get(scene.url) ?? [];
        return day(scene) + (s && inside(s) ? 1e8 : 0);
    }, scene, start: job => {
        const wait = pending.get(scene.url), [a] = wait;
        held = [...wait].filter(t => Math.abs(t.lat - a.lat) < GROUP
            && Math.abs(t.lon - a.lon) < GROUP);
        held.forEach(t => wait.delete(t));
        wait.size ? queue(scene) : pending.delete(scene.url);
        held = held.filter(t => !t.looks.has(scene.date));
        job.args = ['detect', scene.url, ...box(held, SITE_M / 111320), 0, 1,
            held.flatMap(t => [t.lon, t.lat])];
        return held.length > 0;
    } }).then(r => land(scene, held, r));
}
const box = (ps, d) => [Math.min(...ps.map(p => p.lon)) - d,
    Math.min(...ps.map(p => p.lat)) - d, Math.max(...ps.map(p => p.lon)) + d,
    Math.max(...ps.map(p => p.lat)) + d];

// ── a view: its tiles, and each tile's newest scenes read whole until
// FRESH of them saw the view mostly clear (a scene can hold no data here at
// all, at the edge of its swath) ──

let epoch = 0, shown = [0, 0, 0, 0];
const inside = s => s.lon >= shown[0] && s.lon <= shown[2]
    && s.lat >= shown[1] && s.lat <= shown[3];
const swept = new Map();     // scene url + view: whether it saw it clear
export async function view(map) {
    if (map.getZoom() < LIVE_ZOOM) return;
    const b = map.getBounds(), e = ++epoch;
    const bbox = shown = [b.getWest(), b.getSouth(), b.getEast(),
        b.getNorth()];
    // the old view's whole-scene reads that have not started are dropped
    for (let i = jobs.length; i--;)
        if (jobs[i].sweep) jobs.splice(i, 1)[0].done({ dropped: true });
    const tiles = await run({ pri: Infinity, args: ['tiles', ...bbox] });
    // two scenes at a time: most of a scene's parts finish at once, cloud
    // or no data, and a few hold the rest of the workers' time
    for (const tile of tiles) (async () => {
        let clear = 0;
        const flight = [];
        for (const scene of await scenes(tile)) {
            if (e !== epoch || clear >= FRESH) return;
            const key = scene.url + bbox.map(v => v.toFixed(2));
            flight.push((swept.has(key) ? Promise.resolve(swept.get(key))
                : sweep(scene, bbox).then(ok => (ok != null
                    && swept.set(key, ok), ok))).then(ok => clear += !!ok));
            if (flight.length > 1) await flight.shift();
        }
    })();
}

// a scene over the box, split across the workers: whether it saw it
// clear, or null if a part was dropped
async function sweep(scene, bbox) {
    const held = sites.filter(inside);
    const pts = held.flatMap(s => [s.lon, s.lat]);
    const rs = await Promise.all(Array.from({ length: N }, (_, i) =>
        run({ pri: 1e9 + day(scene), scene, sweep: true,
              args: ['detect', scene.url, ...bbox, i, N, pts] })
            .then(r => r.dropped ? null : (land(scene, held, r), r.clear))));
    if (rs.includes(null)) return null;
    const seen = rs.filter(c => c >= 0);
    return seen.length > 0 && seen.reduce((a, c) => a + c) / seen.length >= .5;
}

// ── the map's features: a site each, rated over the ticked quarters ──

export function onChange(fn) { changed = fn; }
globalThis.burnoff = { sites, jobs, log };

export function features(keys) {
    return sites.map(s => {
        const looks = [...s.looks].filter(([d]) => dateInQuarters(d, keys));
        const clear = looks.filter(([, l]) => l.cloud < CLEAR);
        const lit = looks.filter(([, l]) => l.flare);
        const n = clear.filter(([, l]) => l.flare).length;
        return { type: 'Feature', geometry: { type: 'Point',
            coordinates: [s.lon, s.lat] }, properties: {
            id: s.id, kind: 'live', lat: s.lat, lon: s.lon,
            name: `${lit.length} detection${lit.length === 1 ? '' : 's'}`,
            max_b12: Math.max(0, ...lit.map(([, l]) => l.flare.max_b12)),
            detection_count: n, passes: looks.length,
            observations: clear.length,
            persistence: clear.length >= MIN_LOOKS
                ? Math.min(1, n / clear.length) : null } };
    }).filter(f => f.properties.max_b12 > 0);
}

// a site's dated detections, oldest first, as the card lists them
export const series = id => [...sites.find(s => s.id === id)?.looks ?? []]
    .filter(([, l]) => l.flare).sort(([a], [b]) => a < b ? -1 : 1)
    .map(([date, { flare: f }]) => ({ date, max_b12: f.max_b12,
        pixels: f.pixels, raw_lat: f.lat, raw_lon: f.lon }));
