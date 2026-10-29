// live sentinel-2 flaring: burnoff's detector (data-desk-eco/burnoff), wasm
// in a worker per core, reading the l1c jpeg2000 straight off google's
// sentinel-2 mirror, whose json api answers cross-origin ranged reads. no
// catalogue, no proxy, no tiler: the workers name a view's mgrs tiles, one
// listing per satellite and year gives each tile's scenes, and the detector
// reads the bytes it needs and decodes only clear sky.
//
// the search belongs to the ground, not to a view. each square of a G
// degree grid keeps what each scene read of it saw, and a view, from
// LIVE_ZOOM in, asks its squares for every scene: the last RECENT days',
// then those back to DAYS, coarse to fine in time, so most flares are
// drawn early and the last reads only complete the search. a site found
// gets its DAYS read around it as well, a small read, so its card fills in
// before the sweeps reach it. a pan or a zoom re-scores what is wanted, the
// view first, and nothing is read twice. what was read is kept as facts
// (below) in indexeddb, so a reload starts from them. a site is the
// detections within SITE_M of its first, and a look at it is clear when
// its 640 m square is under CLEAR cloud. it is drawn as the archive's sites
// are, once two dates found it and its mean b12 is over aerial's floor, so
// a new site waits for its reads to confirm it, and is named by every
// detection its card lists, cloudy looks too (persistence counts the clear
// ones alone).

import { dateInQuarters, quarterOf } from '../shell/util.js';
import { MODE } from './render.js';
import { viewportBbox } from '../shell/map.js';

const BUCKET = 'gcp-public-data-sentinel-2';
const LIST = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`;
export const LIVE_ZOOM = 12;
// six months, the last three every scene first (RECENT): a year read every
// scene of a small z12 view for ~0.9 GB, three months ~0.11 GB
const DAYS = 180, SITE_M = 135, CLEAR = 0.6, MIN_LOOKS = 10;
// the order of the search: a rank for each date of a list, newest first.
// every scene of the last RECENT days, 900, then those back to DAYS in
// turn: the newest of each month, 800, then the middle of the month,
// and halving the gaps (bit-reversed), 10 less a level. a cloudy scene is
// a cheap read, as its mask skips it, and a flare that burns on few days
// is found only by reading the days it burns: at the isab refinery the two
// newest clear looks lit nothing, a year of them five sites. cached by list
const RECENT = 90, ranked = new WeakMap();
function ranks(L, date) {
    if (ranked.has(L)) return ranked.get(L);
    const since = new Date(Date.now() - RECENT * 864e5).toISOString()
        .slice(0, 10), ds = L.map(date), at = new Map();
    const n = Map.groupBy(ds.filter(d => d < since), d => d.slice(0, 7));
    const r = ds.map(d => {
        if (d >= since) return 900;
        const m = d.slice(0, 7), i = at.get(m) ?? 0;
        at.set(m, i + 1);
        return 800 - 10 * (i && Math.ceil(Math.log2(n.get(m).length)) + 1
            - (31 - Math.clz32(i & -i)));
    });
    return ranked.set(L, r), r;
}
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
// a site not yet drawn has its next looks read before any sweep, up to
// SURE of them, so the second lit date that draws it comes at once, not
// after the recent search: a site lit once in that many stays undrawn
// and waits its turn
const SURE = 12;
const G = 0.05;       // the ground's grid, degrees
const GROUP = 0.03;   // a site read takes the sites this close, degrees

// ── the view, and how much a read matters: in view, then within a view's
// width (at least MARGIN degrees) of it, further not yet; within those by
// rank, then in rings out from the centre, so the view's middle is done
// first and a zoom into it finds it done, then the newest scene. a site's
// read ranks just behind the sweeps of its scene's rank, so its history
// fills in coarse to fine beside theirs, and a site not yet drawn first.
// the view is followed at every zoom, though reads over it start at
// LIVE_ZOOM ──

const MARGIN = 0.5;
let shown = [0, 0, 0, 0];
const inside = (p, [w, s, e, n], d = 0) =>
    p.lon >= w - d && p.lon <= e + d && p.lat >= s - d && p.lat <= n + d;
function score(p, rank, day) {
    const [w, s, e, n] = shown, d = Math.max(e - w, n - s, MARGIN);
    const off = Math.hypot(p.lon - (w + e) / 2, p.lat - (s + n) / 2) / d;
    return (inside(p, shown) ? 2e9 : inside(p, shown, d) ? 1e9 : -Infinity)
        + rank * 1e6 + Math.round(10 * (1 - off)) * 9e4 + day;
}
// a box is placed at its point nearest the view's centre, so a square or
// a rectangle the view's edge cuts counts as in view
const pin = ([w, s, e, n]) => {
    const [a, b, c, d] = shown, x = (a + c) / 2, y = (b + d) / 2;
    return { lon: Math.min(Math.max(x, w), e),
        lat: Math.min(Math.max(y, s), n) };
};
const day = scene => Date.parse(scene.date) / 864e5;   // < 1e5

// ── the pool: each worker takes the most wanted read whenever it comes
// free, chosen then from what the ground still wants ──

// a worker holds K scenes in flight: each makes a stage's reads at once,
// with fetch(), and decodes in wasm while the others wait on theirs. four
// workers of eight read 112 sites in 10.7 s, against 19.6 s for sixteen
// that blocked on each read (m2, gs://). each holds a wasm heap that grows
// to its largest read and never shrinks, and sixteen crashed a phone's
// tab, so a touch-first device gets PHONE
const PHONE = 2, K = 8;
const N = matchMedia('(pointer: coarse)').matches ? PHONE
    : Math.min(Math.max((navigator.hardwareConcurrency || 4) / 2, 2), 4);
// every finished read, for the console: [ms since load, args, ms, flares,
// whether a sweep]
const log = [];
// jobs: a sweep's parts not yet sent, and tiles calls. idle holds a worker
// once for each scene it could take on
const pool = [], jobs = [], idle = [];
// while the map moves no read starts, nor until it has been still for
// SETTLE ms, so a run of drags does not set every worker decoding between
// two of them
const SETTLE = 500;
// nor while the view is out past LIVE_ZOOM: a read in flight finishes, and
// the rest wait until it is back
let moving = false, still, off = false, ids = 0;
export const hold = h => {
    clearTimeout(still), moving = true;
    if (!h) still = setTimeout(() => (moving = false, kick()), SETTLE);
};
const pump = w => {
    const j = !moving && next();
    if (!j) return idle.push(w), false;
    w.jobs.set(++ids, j), j.t = performance.now();
    return w.postMessage([ids, ...j.args]), true;
};
const kick = () => { for (let i = idle.length; i-- && pump(idle.pop());); };
// told whenever what the view's progress counts may have changed, and
// (true) when a view is new
let read = () => {};
export const onRead = fn => read = fn;
for (let i = 0; i < N; i++) {
    const w = new Worker(new URL('../vendor/burnoff/worker.js',
        import.meta.url), { type: 'module' });
    w.jobs = new Map(), pool.push(w);
    w.onmessage = ({ data }) => {
        if (data === 'ready') {
            for (let k = 0; k < K; k++) pump(w);
            return;
        }
        const j = w.jobs.get(data[0]), t = performance.now();
        w.jobs.delete(data[0]);
        log.push([t | 0, j.args, t - j.t | 0, data[1].hotspots?.length,
            !!j.sweep]), j.done(data[1]), pump(w);
        if (log.length > 4000) log.splice(0, 2000);
    };
}
const run = job => new Promise(done => jobs.push(Object.assign(job, { done })));
// the next read: a part or tiles call queued, else the most wanted of the
// squares' sweeps and the sites' reads
function next() {
    for (;;) {
        let i = -1, b = -Infinity;
        // out past LIVE_ZOOM only an open card's history is read
        jobs.forEach((j, k) => (!off || j.deep) && j.pri > b
            && (b = j.pri, i = k));
        if (i >= 0) return jobs.splice(i, 1)[0];
        const [p, go] = off ? reads() : [sweeps(), reads()]
            .reduce((a, c) => c[0] > a[0] ? c : a);
        if (!(p > -Infinity)) return;
        go();
    }
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

// listed holds each tile's listing as it is made, lists the scenes once in;
// a listing that failed is made again when next asked. all, the tile's
// every scene the detector reads, from baseline n0400 (FIRST) on, under
// the key tile + '*'
const listed = new Map(), lists = new Map(), FIRST = '2022-01-25';
const scenes = (tile, all) => listed.get(tile + (all ? '*' : ''))
    ?? listed.set(tile + (all ? '*' : ''), (async () => {
    const since = new Date(all ? FIRST : Date.now() - DAYS * 864e5);
    const now = new Date();
    const dir = `tiles/${tile.slice(0, 2)}/${tile[2]}/${tile.slice(3)}`;
    const years = Array.from({ length: now.getUTCFullYear()
        - since.getUTCFullYear() + 1 }, (_, i) => since.getUTCFullYear() + i);
    const items = (await Promise.all(['S2A', 'S2B', 'S2C'].flatMap(s =>
        years.map(y => list(`${dir}/${s}_MSIL1C_${y}`))))).flat();
    const by = new Map();
    for (const { name } of items) {
        const t = name.split('_')[2];
        const date = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
        if (new Date(date) >= since && +name.match(/_N(\d{4})_/)?.[1] >= 400)
            by.set(t, { date, tile, url: `gs://${BUCKET}/${name}` });
    }
    return [...by.values()].sort((a, b) => b.date < a.date ? -1 : 1);
})().then(l => (lists.set(tile + (all ? '*' : ''), l), stale = true, kick(),
    l), () => void listed.delete(tile + (all ? '*' : ''))))
    .get(tile + (all ? '*' : ''));

// ── facts: what was read, keyed by what was read and not by whom or for
// which view, so two sets of them merge as a union, and a store of many
// users' reads could fill these maps as a reload does. under detector V:
//   ground: [square, [[scene url, cloud]...]]: a sweep read the scene over
//     the square, "i,j" of the G grid (i = floor(lon / G), j = floor(lat /
//     G)); cloud is the obscured share of the 640 m cell at its centre, -1
//     off the scene. the hotspots it found are the sites' flares, and a
//     site in the square that has no look from the scene takes that cloud
//   sites: {id, lat, lon, tile, looks: [[date, {cloud, flare?}]...]}: each
//     look at a site, a sweep's or a read of its own: the obscured share of
//     the 640 m cell under it, and the hotspot within SITE_M it found. a
//     site within SITE_M of one held is merged into it, a date's first look
//     kept, with its brightest flare
// the search and the sites' reads are chosen and counted from these alone,
// so what absorb() takes in is not read again. facts(bbox) gives a box's ──

const V = 2;
const sites = [], byId = new Map(), bucket = new Map();
const ground = new Map();   // square -> Map(scene url -> cloud at its centre)
const bad = new Set();      // scenes a read failed on, taken as read
const dirty = { sites: new Set(), ground: new Set() };
// the version is 1 + the detector's, and moves with it or the stores'
// shape, so a reload forgets what an older one read (3: detector 2, the
// b8a heat test, its sweeps kept by square)
const db = new Promise(ok => {
    const q = indexedDB.open('burnoff-live', V + 1);
    q.onupgradeneeded = () => {
        [...q.result.objectStoreNames].forEach(s =>
            q.result.deleteObjectStore(s));
        ['sites', 'ground'].forEach(s => q.result.createObjectStore(s));
    };
    q.onsuccess = () => ok(q.result);
    q.onerror = () => ok(null);
});
const all = (t, s) => Promise.all(['getAllKeys', 'getAll'].map(f =>
    new Promise(ok => t.objectStore(s)[f]().onsuccess = e =>
        ok(e.target.result))));
const loaded = db.then(async d => {
    if (!d) return;
    const t = d.transaction(['sites', 'ground']);
    const [[ks, gs], [, ss]] = await Promise.all([all(t, 'ground'),
        all(t, 'sites')]);
    absorb({ v: V, ground: ks.map((k, i) => [k, gs[i]]), sites: ss });
    dirty.sites.clear(), dirty.ground.clear();
}).catch(() => {});
let flushing = null;
const save = (store, k) => {
    dirty[store].add(k);
    flushing ??= setTimeout(flush, 2000);
};
const record = ({ id, lat, lon, tile, looks }) =>
    ({ id, lat, lon, tile, looks: [...looks] });
async function flush() {
    flushing = null;
    const d = await db;
    if (!d) return;
    const t = d.transaction(['sites', 'ground'], 'readwrite');
    dirty.sites.forEach(id => t.objectStore('sites').put(record(byId.get(id)),
        id));
    dirty.ground.forEach(k => t.objectStore('ground').put([...ground.get(k)],
        k));
    dirty.sites.clear(), dirty.ground.clear();
}
const area = k => {
    const [i, j] = k.split(',').map(Number);
    return [i * G, j * G, (i + 1) * G, (j + 1) * G];
};
export const facts = b => ({ v: V,
    ground: squares(b).filter(k => ground.has(k))
        .map(k => [k, [...ground.get(k)]]),
    sites: sites.filter(s => inside(s, b)).map(record) });
export function absorb({ v, ground: g = [], sites: ss = [] }) {
    if (v !== V) return;
    for (const [k, us] of g) {
        const m = ground.get(k) ?? ground.set(k, new Map()).get(k);
        for (const [u, c] of us) m.has(u) || (m.set(u, c), save('ground', k));
    }
    for (const r of ss) {
        const s = byId.get(r.id) ?? near(r) ?? add({ id: r.id, lat: r.lat,
            lon: r.lon, tile: r.tile });
        r.looks.forEach(([d, l]) => look(s, d, l.cloud, l.flare));
        s.ok = drawn(s);
    }
    stale = true, changed(), kick(), read();
}

// ── sites: what the reads found, and every look at each ──

let changed = () => {};
const cell = p => `${Math.floor(p.lon * 100)},${Math.floor(p.lat * 100)}`;
function add(s) {
    s.looks = new Map(), s.at = 0, sites.push(s), byId.set(s.id, s);
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

// a read over a box: each site the box held gets its look, and a flare
// joins the site it is near or starts one. a read that failed is not
// asked again
function land(scene, held, r) {
    if (r.error) return bad.add(scene.url),
        console.warn('burnoff:', scene.url, r.error);
    const touched = new Set(held);
    held.forEach((s, i) => r.cloud[i] >= 0 && look(s, scene.date, r.cloud[i]));
    for (const f of r.hotspots) {
        const s = near(f) ?? add({ id: `live:${f.lat.toFixed(5)},${
            f.lon.toFixed(5)}`, lat: f.lat, lon: f.lon, tile: scene.tile });
        look(s, scene.date, f.cloud, f), touched.add(s);
    }
    touched.forEach(s => s.ok = drawn(s));
    changed();
}
function look(s, date, cloud, flare) {
    if (!s.looks.has(date)) s.looks.set(date, { cloud }), save('sites', s.id);
    const l = s.looks.get(date);
    if (flare && !(l.flare?.max_b12 >= flare.max_b12))
        l.flare = flare, save('sites', s.id);
}

// the next scene of a site's tile to look at it, in the search's order,
// and its rank, past those in flight unless all: null once there is none,
// undefined while the tile is listed. a scene its square was swept in
// looked at it, as a flare there would have started a site then: its
// look is the square's cloud, if the square's centre was on the scene.
// at passes those done, which only grow
const order = new WeakMap();
function due(s, all) {
    const L = lists.get(s.tile + (s.deep ? '*' : ''));
    if (!L) return void scenes(s.tile, s.deep);
    const r = ranks(L, x => x.date), g = ground.get(sq(Math.floor(s.lon / G),
        Math.floor(s.lat / G)));
    const q = order.get(L) ?? order.set(L, L.map((_, i) => i)
        .sort((a, b) => r[b] - r[a] || a - b)).get(L);
    const no = x => !s.looks.has(x.date) && !bad.has(x.url)
        && !(g?.get(x.url) >= 0 && (look(s, x.date, g.get(x.url)), true));
    while (s.at < q.length && !no(L[q[s.at]])) s.at++;
    for (let i = s.at; i < q.length; i++)
        if (no(L[q[i]]) && (all || !s.fly?.has(L[q[i]].date)))
            return [L[q[i]], r[q[i]]];
    return null;
}
// the most wanted site read: a site in reach and its due scene, taking the
// sites of its tile within GROUP of it that scene has not looked at, so a
// cluster of sites is one read
function reads() {
    let b = -Infinity, a, x;
    for (const s of off ? sites.filter(s => s.deep) : sites) {
        const y = (s.deep || score(s, 901, 0) > b - 1e5) && due(s);
        const p = !y ? b : !s.deep ? score(s, !s.ok && s.looks.size < SURE
            ? 901 : y[1] - 6, day(y[0])) : y[1] >= 900 ? 4e9 + day(y[0])
            : 2e9 + (y[1] - 6) * 1e6 + 95e4 + day(y[0]);
        if (p > b) b = p, a = s, x = y[0];
    }
    return [b, () => {
        const held = sites.filter(t => t.tile === a.tile && !t.looks.has(x.date)
            && !t.fly?.has(x.date) && Math.abs(t.lat - a.lat) < GROUP
            && Math.abs(t.lon - a.lon) < GROUP);
        held.forEach(t => (t.fly ??= new Set()).add(x.date));
        run({ pri: b, deep: a.deep, scene: x, args: ['detect', x.url,
            ...box(held, SITE_M / 111320), 0, 1,
            held.flatMap(t => [t.lon, t.lat])] }).then(r => {
            held.forEach(t => t.fly.delete(x.date)), land(x, held, r);
            read(), kick();
        });
    }];
}
const box = (ps, d) => [Math.min(...ps.map(p => p.lon)) - d,
    Math.min(...ps.map(p => p.lat)) - d, Math.max(...ps.map(p => p.lon)) + d,
    Math.max(...ps.map(p => p.lat)) + d];

// ── the ground: each square of the grid, the tiles its corners and centre
// fall in, and its looks, a date's scenes of those tiles ──

const sq = (i, j) => `${i},${j}`;
const on = new Map();       // square -> its tiles
const dated = new Map();    // square -> its looks, newest first
const target = new Set();   // the squares a view has asked for
const flying = new Set();   // `${scene url} ${square}` of sweeps in flight
// the sweeps wanted, by scene, until a sweep lands, a tile is listed or the
// view moves (stale)
let stale = true, cands = new Map();
async function tiles(i0, j0, i1, j1) {
    const pts = [], keys = [];
    for (let j = j0; j <= j1 + 1; j++)
        for (let i = i0; i <= i1 + 1; i++) pts.push(i * G, j * G);
    for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++)
            if (!on.has(sq(i, j))) keys.push([i, j]),
                pts.push((i + .5) * G, (j + .5) * G);
    if (!keys.length) return;
    const p = run({ pri: Infinity, args: ['tiles', pts] });
    kick();
    const t = await p, nx = i1 - i0 + 2, c0 = nx * (j1 - j0 + 2);
    const at = (i, j) => t[(j - j0) * nx + i - i0];
    keys.forEach(([i, j], k) => on.set(sq(i, j), [...new Set([at(i, j),
        at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), t[c0 + k]])]));
}
function looks(k) {
    if (dated.has(k)) return dated.get(k);
    const ls = on.get(k)?.map(t => lists.get(t) ?? void scenes(t));
    if (!ls?.every(Boolean)) return null;
    const L = [...Map.groupBy(ls.flat(), s => s.date)]
        .sort(([a], [b]) => a < b ? 1 : -1);
    return dated.set(k, L), L;
}

// a square's search: the share of its recent scenes read, of the rest, of
// all, and the scenes it still wants, with their rank; null until its
// tiles are listed. a look is a date's scenes of its tiles, read once all
// are. each scene read moves a share, cloudy or clear, and none falls
function square(k) {
    const L = looks(k);
    if (!L) return null;
    const g = ground.get(k), r = ranks(L, ([d]) => d), want = new Map();
    const got = s => g?.has(s.url) || bad.has(s.url);
    const n = [0, 0, 0, 0];
    L.forEach(([, ss], i) => {
        const a = r[i] < 900 ? 2 : 0, rd = ss.every(got);
        n[a]++, n[a + 1] += rd;
        rd || ss.forEach(s => got(s) || flying.has(`${s.url} ${k}`)
            || want.set(s, r[i]));
    });
    const [a, x, b, y] = n;
    return [a ? x / a : 1, b ? y / b : 1, L.length ? (x + y) / L.length : 1,
        want];
}

// the sweep most wanted: the squares in reach that a view asked for name
// the scenes they want, gathered by scene, and the scene the most wanted
// square wants is read over every square wanting it
function sweeps() {
    if (stale) {
        stale = false, cands = new Map();
        for (const k of target) {
            const c = pin(area(k));
            if (!(score(c, 0, 0) > 0)) continue;
            for (const [s, t] of square(k)?.[3] ?? []) {
                const x = cands.get(s.url) ?? cands.set(s.url, { s, ks: [],
                    p: -Infinity }).get(s.url);
                x.ks.push(k), x.p = Math.max(x.p, score(c, t, day(s)));
            }
        }
    }
    let b;
    for (const x of cands.values()) if (!(b?.p >= x.p)) b = x;
    return b ? [b.p, () => (cands.delete(b.s.url), sweep(b.s, b.ks))]
        : [-Infinity];
}

// a scene read over squares, as rectangles mostly of them, each split
// across the workers by 6.4 km cell columns, with the centre of each
// square for its cloud. a square keeps what it saw unless a part was
// dropped
function sweep(scene, ks) {
    ks.forEach(k => flying.add(`${scene.url} ${k}`));
    for (const r of rects(ks.map(k => k.split(',').map(Number)))) (async () => {
        const [w, s, e, n] = [r.i0 * G, r.j0 * G, (r.i1 + 1) * G,
            (r.j1 + 1) * G];
        // one part: parts split a scene across workers by cell columns, but
        // each read a margin of whole 6.4 km cells beside its own, and a
        // worker holds K scenes anyway
        const parts = 1;
        const held = sites.filter(p => inside(p, [w, s, e, n]));
        const pts = [...held.flatMap(p => [p.lon, p.lat]),
            ...r.sq.flatMap(([i, j]) => [(i + .5) * G, (j + .5) * G])];
        const got = await Promise.all(Array.from({ length: parts }, (_, k) =>
            run({ get pri() { return score(pin(this.sweep), 0, 0); }, scene,
                  sweep: [w, s, e, n],
                  args: ['detect', scene.url, w, s, e, n, k, parts, pts] })));
        r.sq.forEach(([i, j]) => flying.delete(`${scene.url} ${sq(i, j)}`));
        if (!got.some(g => g.dropped)) {
            got.forEach(g => land(scene, held, g));
            if (!bad.has(scene.url)) r.sq.forEach(([i, j], k) => {
                const m = ground.get(sq(i, j))
                    ?? ground.set(sq(i, j), new Map()).get(sq(i, j));
                m.set(scene.url, Math.max(...got.map(g =>
                    g.cloud[held.length + k]))), save('ground', sq(i, j));
            });
        }
        stale = true, read(), kick();
    })();
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

// ── the view: it asks its squares for their scenes, and what is now far
// from it stops, its sweeps in flight at their next stage ──

const squares = (b = shown) => {
    const [i0, j0, i1, j1] = b.map(v => Math.floor(v / G)), ks = [];
    for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) ks.push(sq(i, j));
    return ks;
};
export async function view(map) {
    await loaded;
    shown = viewportBbox(map), off = map.getZoom() < LIVE_ZOOM, stale = true;
    const far = j => j.sweep && !(score(pin(j.sweep), 0, 0) > 0);
    for (let i = jobs.length; i--;)
        if (far(jobs[i])) jobs.splice(i, 1)[0].done({ dropped: true });
    for (const w of pool) for (const [id, j] of w.jobs)
        if (far(j)) w.postMessage([id, 'drop']);
    if (off) return read(true);
    const ks = squares();
    ks.forEach(k => target.add(k)), kick();
    await tiles(...shown.map(v => Math.floor(v / G)));
    await Promise.all([...new Set(ks.flatMap(k => on.get(k) ?? []))]
        .map(scenes));
    stale = true, kick(), read(true), changed();
}

// the view's progress: the mean over its squares of the share of their
// recent scenes read, and of the rest; null until its squares are listed.
// they count what was read, the same at every zoom, so neither falls while
// the view is still nor on ground already read, and the view's middle is
// read first, so a zoom into it seldom finds less done
export function progress() {
    if (off) return null;
    const ks = squares(), f = [0, 0];
    for (const k of ks) {
        const x = square(k);
        if (!x) return null;
        f[0] += x[0], f[1] += x[1];
    }
    return f.map(v => v / ks.length);
}
// the view's search not yet done; the sites' reads keep no one waiting
export const busy = () => {
    const p = !off && progress();
    return !off && (!p || p[0] < 1 || p[1] < 1);
};

// ── the map's features: a site each, rated over the ticked quarters ──

// fn redraws the layer: at once for the sites a reload restored, which land
// before the map is ready to be told, and after every read
export function onChange(fn) { changed = fn; loaded.then(fn); }
globalThis.burnoff = { sites, jobs, log, ground, target, workers: N,
    progress, facts, absorb };

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
            loading: due(s, true) !== null,
            name: `${on.length} detection${on.length === 1 ? '' : 's'}`,
            max_b12: Math.max(0, ...on.map(([, l]) => l.flare.max_b12)),
            detection_count: on.length, passes: looks.length,
            observations: clear.length,
            persistence: clear.length >= MIN_LOOKS
                ? Math.min(1, n / clear.length) : null } };
    }).filter(f => f.properties.max_b12 > 0);
}

// the site whose card was opened last reads every scene of its tile the
// detector can, back to FIRST, at any zoom and wherever the view is: its
// history to the full extent, newest first and then coarse to fine, a small
// read a scene. its last RECENT days come before anything else, so the card
// fills at once; its older scenes rank as a sure site's in view, first of
// them, so they wait on the view's recent ones and a card left open does
// not hold the view at 0%
let deep;
export const deepen = id => {
    const s = byId.get(id);
    if (!s || s === deep) return;
    if (deep) deep.deep = false, deep.at = 0;
    deep = s, s.deep = true, s.at = 0, stale = true, kick();
};
// a site's dated detections, oldest first, as the card lists them
export const series = id => [...byId.get(id)?.looks ?? []]
    .filter(([, l]) => l.flare).sort(([a], [b]) => a < b ? -1 : 1)
    .map(([date, { flare: f }]) => ({ date, max_b12: f.max_b12,
        pixels: f.pixels, raw_lat: f.lat, raw_lon: f.lon, px: f.px }));
