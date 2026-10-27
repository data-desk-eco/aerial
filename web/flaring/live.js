// live sentinel-2 flaring: burnoff's detector (data-desk-eco/burnoff), wasm
// in a worker per core, reading the l1c jpeg2000 straight off google's
// sentinel-2 mirror, whose json api answers cross-origin ranged reads. no
// catalogue, no proxy, no tiler: the workers name a view's mgrs tiles, one
// listing per satellite and year gives each tile's scenes, and the detector
// reads the bytes it needs and decodes only clear sky.
//
// it works back from today. a tile's newest scenes are read over the view
// until enough of them saw it mostly clear: FRESH over a z10 view, more as
// the view narrows (DEPTH), so a flare is drawn as soon as its scene is
// read, and then a clear one of each month before them;
// every other scene is read only around the sites found,
// so a site's dates fill in behind it, newest first and nearest the view's
// centre first. what a scene has read is kept as squares of a G degree
// grid, so a view inside one already read reads nothing, and a pan reads
// only the squares it uncovers. sites, their looks and the squares read are
// kept in indexeddb, so a reload starts from them. a site is the detections
// within SITE_M of its first, and a look at it is clear when its 640 m
// square is under CLEAR cloud. it is drawn as the archive's sites are, once
// two dates found it and its mean b12 is over aerial's floor, so a new site
// waits for its reads to confirm it, and is named by its clear detections.

import { dateInQuarters, quarterOf } from '../shell/util.js';
import { MODE } from './render.js';
import { viewportBbox } from '../shell/map.js';

const BUCKET = 'gcp-public-data-sentinel-2';
const LIST = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`;
export const LIVE_ZOOM = 10;
const DAYS = 365, FRESH = 2, SITE_M = 135, CLEAR = 0.6, MIN_LOOKS = 10;
// km² of clear looks a view is swept to: FRESH over a z10 view, ~40 at
// z13, most of the year nearer in. a read costs by its area, and a flare
// found only around the sites the newest looks lit was missed where it
// burns on few days: at the isab refinery the two newest clear looks lit
// nothing, a year of them five sites
const DEPTH = 12000;
// a site is drawn as the archive's are: lit on LIT dates, and over the
// floor aerial holds the archive's sites to on their mean b12. nor is one
// lit only in its hemisphere's summer, april to august in the north (the
// archive's `seasonal`): a solar panel or a sawtooth roof that catches a
// high sun. of the sites the detector's heat test left lit in a year, that
// was 71 of 114 in madrid, 33 of 87 in london, and 7 of 308 by a viirs
// flare in the permian
const LIT = 2;
const summer = (d, lat) => (+d.slice(5, 7) + (lat < 0 ? 2 : 8)) % 12 < 5;
const drawn = s => {
    const l = [...s.looks].filter(([, x]) => x.flare);
    return l.length >= LIT && !l.every(([d]) => summer(d, s.lat))
        && l.reduce((a, [, x]) => a + x.flare.max_b12, 0) / l.length
        >= MODE.s2.floor;
};
const G = 0.05;       // the coverage grid, degrees
const GROUP = 0.03;   // a site read takes the sites this close, degrees

// ── the view, and how much a place in it matters: in view, a site not
// yet drawn first, then the rest, nearest the centre first; within a
// view's width (at least MARGIN degrees) of it, after; further, not yet.
// the view is followed at every zoom, though reads over it start at
// LIVE_ZOOM ──

const MARGIN = 0.5;
let shown = [0, 0, 0, 0];
const inside = (p, [w, s, e, n], d = 0) =>
    p.lon >= w - d && p.lon <= e + d && p.lat >= s - d && p.lat <= n + d;
function weight(p) {
    const [w, s, e, n] = shown, d = Math.max(e - w, n - s, MARGIN);
    const off = Math.hypot(p.lon - (w + e) / 2, p.lat - (s + n) / 2) / d;
    return inside(p, shown) ? (p.looks && !p.ok ? 2e8 : 1e8) + 1 - off / 2
        : inside(p, shown, d) ? 1 - off / 4 : -Infinity;
}
// a site's weight changes only with the view or its being drawn, so each
// is kept until either changes (ver), and so is the most a set of sites
// waiting on a scene weighs, until the set changes too (v = -1): the
// next read is chosen every time a read lands, over every scene waiting
let ver = 0;
const weigh = p => p.v === ver ? p.w : (p.v = ver, p.w = weight(p));
const most = set => set.v === ver ? set.w
    : (set.v = ver, set.w = Math.max(...[...set].map(weigh)));

// ── the pool: jobs run highest priority first, one per worker, and one
// whose priority is -Infinity waits. a job's start, when it has one, fills
// its args as it leaves the queue, or returns false to be dropped ──

// two workers per core, but each holds a wasm heap that grows to its
// largest read and never shrinks: 25-40 MB over a phone's view, up to
// 135 MB over a desktop's at z10, and sixteen crashed a phone's tab. a
// touch-first device gets PHONE, as a mobile tab is killed long before
// the device runs out; elsewhere at most two per GB the browser reports
// (chrome's deviceMemory, which stops at 8)
const PHONE = 4;
const N = matchMedia('(pointer: coarse)').matches ? PHONE
    : Math.min(2 * (navigator.hardwareConcurrency || 4),
        2 * (navigator.deviceMemory || 8), 16);
// every finished read, for the console: [ms since load, args, ms, flares,
// whether a sweep]
const log = [];
const jobs = [], idle = [];
// while the map moves no job starts, nor until it has been still for
// SETTLE ms, so a run of drags does not set every worker decoding between
// two of them
const SETTLE = 500;
// nor while the view is out past LIVE_ZOOM: a read in flight finishes, and
// the rest wait until it is back
let moving = false, still, off = false;
export const hold = h => {
    clearTimeout(still), moving = true;
    if (!h) still = setTimeout(() => (moving = false, kick()), SETTLE);
};
const pump = w => {
    for (;;) {
        let i = -1, best = -Infinity;
        if (!moving && !off) jobs.forEach((j, k) => {
            const p = j.pri;
            if (p > best) best = p, i = k;
        });
        if (i < 0) return idle.push(w);
        const [j] = jobs.splice(i, 1);
        if (j.start?.(j) !== false)
            return w.job = j, j.t = performance.now(),
                w.postMessage([0, ...j.args]);
    }
};
// reads still to make in reach of the view, or in flight: a worker not
// idle is reading, or not yet ready to
export const busy = () => !off
    && (idle.length < N || jobs.some(j => j.pri > -Infinity));
// told the date of each scene read as it lands
let read = () => {};
export const onRead = fn => read = fn;
const kick = () => {
    while (!moving && !off && idle.length && jobs.some(j => j.pri > -Infinity))
        pump(idle.pop());
};
for (let i = 0; i < N; i++) {
    const w = new Worker(new URL('../vendor/burnoff/worker.js',
        import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => {
        if (data[0] === 'ahead') return ahead(data[1], data[2]);
        const j = w.job, t = performance.now();
        if (data !== 'ready') log.push([t | 0, j.args, t - j.t | 0,
            data[1].hotspots?.length, !!j.sweep]), j.done(data[1]),
            j.scene && read(j.scene.date);
        if (log.length > 4000) log.splice(0, 2000);
        pump(w);
    };
}
const run = job => new Promise(done => {
    if (job.scene) warm(job.scene);
    jobs.push(Object.assign(job, { done }));
    kick();
});
const day = scene => +scene.date.replaceAll('-', '');

// the detector's reads block its worker, one at a time. the small ones every
// read of a scene starts with, its cloud mask and each band's header, are
// fetched at once when the read is queued, and so is every read a worker
// posts before making it: the browser's http cache answers the same ranged
// read again, a worker's included, in under a ms. a worker of its own
// fetches them, as tens of mb a minute through the page's thread made the
// map judder
const gcs = u => 'https://storage.googleapis.com/download/storage/v1/b/'
    + `${BUCKET}/o/${encodeURIComponent(u.slice(6 + BUCKET.length))}?alt=media`;
const fetcher = new Worker(new URL('./ahead.js', import.meta.url));
const ahead = (u, range) => fetcher.postMessage([u, range]);
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

// ── memory: sites and the squares each scene read, in indexeddb ──

const sites = [], byId = new Map(), bucket = new Map();
const cover = new Map();   // scene url -> Map(square -> cloud at its centre)
const dirty = { sites: new Set(), cover: new Set() };
// the version is the detector's: bumped when what it finds changes, so a
// reload forgets what an older one found (2: the b8a heat test)
const db = new Promise(ok => {
    const q = indexedDB.open('burnoff-live', 2);
    q.onupgradeneeded = () => ['sites', 'cover'].forEach(s => {
        if (q.result.objectStoreNames.contains(s))
            q.result.deleteObjectStore(s);
        q.result.createObjectStore(s);
    });
    q.onsuccess = () => ok(q.result);
    q.onerror = () => ok(null);
});
const all = (t, s) => Promise.all(['getAllKeys', 'getAll'].map(f =>
    new Promise(ok => t.objectStore(s)[f]().onsuccess = e =>
        ok(e.target.result))));
const loaded = db.then(async d => {
    if (!d) return;
    const t = d.transaction(['sites', 'cover']);
    const [[, ss], [us, cs]] = await Promise.all([all(t, 'sites'),
        all(t, 'cover')]);
    ss.map(s => add({ ...s, looks: new Map(s.looks) }))
        .forEach(s => s.ok = drawn(s));
    us.forEach((u, i) => cover.set(u, new Map(cs[i])));
    changed();
}).catch(() => {});
let flushing = null;
const save = (store, k) => {
    dirty[store].add(k);
    flushing ??= setTimeout(flush, 2000);
};
async function flush() {
    flushing = null;
    const d = await db;
    if (!d) return;
    const t = d.transaction(['sites', 'cover'], 'readwrite');
    for (const id of dirty.sites) {
        const { probed, ok, v, w, wait, reads, ...s } = byId.get(id);
        t.objectStore('sites').put({ ...s, looks: [...s.looks] }, id);
    }
    for (const u of dirty.cover)
        t.objectStore('cover').put([...cover.get(u)], u);
    dirty.sites.clear(), dirty.cover.clear();
}

// ── sites: what the reads found, and every look at each ──

let changed = () => {};
const cell = p => `${Math.floor(p.lon * 100)},${Math.floor(p.lat * 100)}`;
function add(s) {
    sites.push(s), byId.set(s.id, s);
    const k = cell(s);
    bucket.set(k, [...bucket.get(k) ?? [], s]);
    return s;
}
const metres = (a, b) => Math.hypot((a.lon - b.lon) * Math.cos(a.lat
    * Math.PI / 180), a.lat - b.lat) * 111320;
const near = p => {
    const [x, y] = cell(p).split(',').map(Number);
    for (let d = 0; d < 9; d++)
        for (const s of bucket.get(`${x + d % 3 - 1},${y + (d / 3 | 0) - 1}`)
            ?? []) if (metres(s, p) <= SITE_M) return s;
};

// a read over a box: each site the box held gets its look, a flare joins
// the site it is near or starts one, and a new site is read in every other
// scene of its tile
function land(scene, held, r) {
    if (r.error) return console.warn('burnoff:', scene.url, r.error);
    const touched = new Set(held);
    held.forEach((s, i) => r.cloud[i] >= 0 && look(s, scene, r.cloud[i]));
    for (const f of r.hotspots) {
        let s = near(f);
        if (!s) probe(s = add({ id: `live:${f.lat.toFixed(5)},${
            f.lon.toFixed(5)}`, lat: f.lat, lon: f.lon, tile: scene.tile,
            looks: new Map() }));
        const l = look(s, scene, s.looks.get(scene.date)?.cloud ?? f.cloud);
        if (!(l.flare?.max_b12 >= f.max_b12)) l.flare = f, save('sites', s.id);
        touched.add(s);
    }
    touched.forEach(s => s.ok !== (s.ok = drawn(s)) && ver++);
    changed();
}
function look(s, scene, cloud) {
    if (!s.looks.has(scene.date))
        s.looks.set(scene.date, { cloud }), save('sites', s.id);
    return s.looks.get(scene.date);
}

// every scene of a site's tile that has not looked at it. a read takes the
// most wanted site waiting on its scene and those within GROUP of it, so a
// cluster of sites is one read. a site counts the scenes it waits on (wait)
// and its reads in flight (reads): its card says it is still loading
// until both are 0
const pending = new Map();   // scene url -> the sites waiting on it
async function probe(s) {
    s.probed = true;
    const all = await scenes(s.tile);
    s.wait = s.reads = 0;
    for (const scene of all)
        if (!s.looks.has(scene.date) && ++s.wait)
            pending.has(scene.url) ? (pending.get(scene.url).add(s).v = -1)
                : (pending.set(scene.url, new Set([s])), queue(scene));
    changed();
}
function queue(scene) {
    let held;
    run({ get pri() {
        const wait = pending.get(scene.url);
        return wait ? day(scene) + most(wait) : -Infinity;
    }, scene, start: job => {
        const wait = pending.get(scene.url);
        if (!wait) return false;
        const a = [...wait].reduce((a, s) => weight(s) > weight(a) ? s : a);
        held = [...wait].filter(t => Math.abs(t.lat - a.lat) < GROUP
            && Math.abs(t.lon - a.lon) < GROUP);
        held.forEach(t => (wait.delete(t), t.wait--)), wait.v = -1;
        wait.size ? queue(scene) : pending.delete(scene.url);
        held = held.filter(t => !t.looks.has(scene.date));
        held.forEach(t => t.reads++);
        job.args = ['detect', scene.url, ...box(held, SITE_M / 111320), 0, 1,
            held.flatMap(t => [t.lon, t.lat])];
        return held.length > 0 || (changed(), false);
    } }).then(r => (held.forEach(t => t.reads--), land(scene, held, r),
        changed()));
}
const box = (ps, d) => [Math.min(...ps.map(p => p.lon)) - d,
    Math.min(...ps.map(p => p.lat)) - d, Math.max(...ps.map(p => p.lon)) + d,
    Math.max(...ps.map(p => p.lat)) + d];

// ── a view: the squares of the grid it covers, each with the tiles its
// corners and centre fall in (the tile its centre is in owns it) ──

let epoch = 0;
const owner = new Map();   // square -> [the tile owning it, every tile on it]
const sq = (i, j) => `${i},${j}`;
async function owners(i0, j0, i1, j1) {
    const pts = [], keys = [];
    for (let j = j0; j <= j1 + 1; j++)
        for (let i = i0; i <= i1 + 1; i++) pts.push(i * G, j * G);
    for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++)
            if (!owner.has(sq(i, j))) keys.push([i, j]),
                pts.push((i + .5) * G, (j + .5) * G);
    if (!keys.length) return;
    const t = await run({ pri: Infinity, args: ['tiles', pts] });
    const nx = i1 - i0 + 2, c0 = nx * (j1 - j0 + 2);
    const at = (i, j) => t[(j - j0) * nx + i - i0];
    keys.forEach(([i, j], k) => owner.set(sq(i, j), [t[c0 + k],
        [...new Set([at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1),
            t[c0 + k]])]]));
}

export async function view(map) {
    await loaded;
    const e = ++epoch;
    shown = viewportBbox(map), ver++, off = map.getZoom() < LIVE_ZOOM;
    // the old view's whole-scene reads that have not started are dropped,
    // and its sites' reads wait unless they are near this one
    for (let i = jobs.length; i--;)
        if (jobs[i].sweep) jobs.splice(i, 1)[0].done({ dropped: true });
    sites.filter(s => !s.probed && weight(s) > -Infinity).forEach(probe);
    kick();
    if (map.getZoom() < LIVE_ZOOM) return;
    const [i0, j0, i1, j1] = shown.map(v => Math.floor(v / G));
    await owners(i0, j0, i1, j1);
    if (e !== epoch) return;
    const by = new Map();      // tile -> [its squares, those it owns]
    for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
            const [own, on] = owner.get(sq(i, j));
            for (const t of on) {
                if (!by.has(t)) by.set(t, [[], []]);
                by.get(t)[0].push([i, j]);
                if (t === own) by.get(t)[1].push([i, j]);
            }
        }
    const km2 = (i1 - i0 + 1) * (j1 - j0 + 1) * (G * 111) ** 2
        * Math.cos((j0 + j1 + 1) * G * Math.PI / 360);
    const need = Math.max(FRESH, Math.round(DEPTH / km2));
    for (const [tile, [all, own]] of by) (async () => {
        // a look saw the view when most of the squares its tile owns were
        // clear. scenes are read in order until n looks did, a quarter of n
        // at a time, two at least: most of a scene's reads finish at once,
        // cloud or no data, and a few hold the rest of the workers' time.
        // the index reached
        const saw = c => c != null && own.filter(([i, j]) => c.get(sq(i, j))
            >= 0 && c.get(sq(i, j)) < CLEAR).length >= own.length / 2;
        const until = async (list, n, low) => {
            let at = 0, seen = 0;
            const flight = [];
            for (; at < list.length && seen < n && e === epoch; at++) {
                flight.push(sweep(list[at], all, low).then(c =>
                    seen += saw(c)));
                if (flight.length >= Math.max(2, n >> 2)) await flight.shift();
            }
            return at;
        };
        // the newest looks first; then one clear look in each month of the
        // rest of the year, as a flare that went out before them was found
        // only near a lit site
        const list = await scenes(tile), at = await until(list, need);
        Map.groupBy(list.slice(at), s => s.date.slice(0, 7))
            .forEach(m => until(m, 1, true));
    })();
}

// the squares a scene has not read yet, read; its squares' clouds, or null
// if a read was dropped. they are read as rectangles mostly of them, each
// split across the workers by 6.4 km cell columns, with the centre of each
// square for its cloud. a low sweep waits behind the newest looks' sweeps,
// and the view's site reads behind it
async function sweep(scene, squares, low) {
    const c = cover.get(scene.url) ?? new Map();
    const rs = await Promise.all(rects(squares.filter(([i, j]) =>
        !c.has(sq(i, j)))).map(async r => {
        const [w, s, e, n] = [r.i0 * G, r.j0 * G, (r.i1 + 1) * G,
            (r.j1 + 1) * G];
        const km = (e - w) * 111 * Math.cos((s + n) * Math.PI / 360);
        const parts = Math.max(1, Math.min(N, Math.round(km / 12.8)));
        const held = sites.filter(p => inside(p, [w, s, e, n]));
        const pts = [...held.flatMap(p => [p.lon, p.lat]),
            ...r.sq.flatMap(([i, j]) => [(i + .5) * G, (j + .5) * G])];
        const mid = { lon: (w + e) / 2, lat: (s + n) / 2 };
        const got = await Promise.all(Array.from({ length: parts }, (_, k) =>
            run({ get pri() {
                return (low ? 5e8 : 1e9) + day(scene)
                    + (weight(mid) % 1e8 || 0);
            }, scene, sweep: true,
                  args: ['detect', scene.url, w, s, e, n, k, parts, pts] })));
        if (got.some(g => g.dropped)) return null;
        got.forEach(g => land(scene, held, g));
        if (got.some(g => g.error)) return [];
        return r.sq.map(([i, j], k) => [sq(i, j), Math.max(...got.map(g =>
            g.cloud[held.length + k]))]);
    }));
    if (rs.includes(null)) return null;
    if (rs.flat().length) {
        rs.flat().forEach(([k, v]) => c.set(k, v));
        cover.set(scene.url, c), save('cover', scene.url);
    }
    return c;
}

// squares as rectangles at least half full of them, by halving the long
// side of any that is not
function rects(squares) {
    if (!squares.length) return [];
    const is = squares.map(s => s[0]), js = squares.map(s => s[1]);
    const r = { i0: Math.min(...is), i1: Math.max(...is), j0: Math.min(...js),
        j1: Math.max(...js), sq: squares };
    const wi = r.i1 - r.i0 + 1, wj = r.j1 - r.j0 + 1;
    if (squares.length * 2 >= wi * wj) return [r];
    const [a, m] = wi >= wj ? [0, r.i0 + (wi >> 1)] : [1, r.j0 + (wj >> 1)];
    return [...rects(squares.filter(s => s[a] < m)),
        ...rects(squares.filter(s => s[a] >= m))];
}

// ── the map's features: a site each, rated over the ticked quarters ──

// fn redraws the layer: at once for the sites a reload restored, which land
// before the map is ready to be told, and after every read
export function onChange(fn) { changed = fn; loaded.then(fn); }
globalThis.burnoff = { sites, jobs, log, cover, workers: N };

// a site's feature, once the sites a reload restores are in (a #flare= link)
export const site = (id, keys) => loaded.then(() =>
    features(keys).find(f => f.properties.id === id) ?? null);

// the quarters a drawn site in a lon/lat box was lit in
export const quarters = ([w, s, e, n]) => new Set(sites.filter(p => p.ok
    && p.lon >= w && p.lon <= e && p.lat >= s && p.lat <= n)
    .flatMap(p => [...p.looks].filter(([, l]) => l.flare)
        .map(([d]) => quarterOf(d))));

export function features(keys) {
    return sites.filter(s => s.ok).map(s => {
        const looks = [...s.looks].filter(([d]) => dateInQuarters(d, keys));
        const clear = looks.filter(([, l]) => l.cloud < CLEAR);
        const on = looks.filter(([, l]) => l.flare);
        const n = clear.filter(([, l]) => l.flare).length;
        return { type: 'Feature', geometry: { type: 'Point',
            coordinates: [s.lon, s.lat] }, properties: {
            id: s.id, kind: 'live', lat: s.lat, lon: s.lon,
            loading: !(s.wait === 0 && s.reads === 0),
            name: `${n} detection${n === 1 ? '' : 's'}`,
            max_b12: Math.max(0, ...on.map(([, l]) => l.flare.max_b12)),
            detection_count: n, passes: looks.length,
            observations: clear.length,
            persistence: clear.length >= MIN_LOOKS
                ? Math.min(1, n / clear.length) : null } };
    }).filter(f => f.properties.max_b12 > 0);
}

// a site's dated detections, oldest first, as the card lists them
export const series = id => [...byId.get(id)?.looks ?? []]
    .filter(([, l]) => l.flare).sort(([a], [b]) => a < b ? -1 : 1)
    .map(([date, { flare: f }]) => ({ date, max_b12: f.max_b12,
        pixels: f.pixels, raw_lat: f.lat, raw_lon: f.lon, px: f.px }));
