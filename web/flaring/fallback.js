// the live layer's fallback, loaded only when burnoff's service fails:
// its detector here, wasm in a worker per core (vendor/burnoff), reading
// the l1c jpeg2000 off google's sentinel-2 mirror, whose json api answers
// cross-origin ranged reads. detect(bbox, a, b) gives each scene's look
// over the box from a to b: its date, the cloud at the box's centre and
// its hotspots

const BUCKET = 'gcp-public-data-sentinel-2';
const LIST = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`;
// four workers of eight scenes each; a phone's tab crashed on more
const K = 8, N = matchMedia('(pointer: coarse)').matches ? 2
    : Math.min(Math.max((navigator.hardwareConcurrency || 4) / 2, 2), 4);
const queue = [], done = new Map();
let ids = 0;
const pool = Array.from({ length: N }, () => {
    const w = new Worker(new URL('../vendor/burnoff/worker.js',
        import.meta.url), { type: 'module' });
    w.n = 0, w.onmessage = ({ data }) => {
        if (data === 'ready') return w.ready = true, pump();
        w.n--, done.get(data[0])(data[1]), done.delete(data[0]), pump();
    };
    return w;
});
function pump() {
    for (const w of pool)
        while (w.ready && w.n < K && queue.length) {
            const [args, ok] = queue.shift();
            done.set(++ids, ok), w.n++, w.postMessage([ids, ...args]);
        }
}
const call = (...args) => new Promise(ok => (queue.push([args, ok]), pump()));

// a tile's scenes of a year, from baseline n0400 on, one a sensing time
const lists = new Map();
async function list(prefix) {
    const items = [];
    for (let token = ''; ;) {
        const q = new URLSearchParams({ prefix, maxResults: 1000,
            matchGlob: '**/IMG_DATA/*_B12.jp2',
            fields: 'items(name),nextPageToken' });
        if (token) q.set('pageToken', token);
        const r = await (await fetch(`${LIST}?${q}`)).json();
        items.push(...r.items ?? []);
        if (!(token = r.nextPageToken)) return items;
    }
}
const year = (tile, y) => {
    const k = `${tile}/${y}`, dir = `tiles/${tile.slice(0, 2)}/${tile[2]}/${
        tile.slice(3)}`;
    lists.has(k) || lists.set(k, Promise.all(['S2A', 'S2B', 'S2C'].map(s =>
        list(`${dir}/${s}_MSIL1C_${y}`))).then(l => [...new Map(l.flat()
        .filter(({ name }) => +name.match(/_N(\d{4})_/)?.[1] >= 400)
        .map(({ name }) => [name.split('_')[2], name])).values()]
        .map(name => ({ tile, url: `gs://${BUCKET}/${name}`, date:
            name.split('_')[2].replace(/(....)(..)(..).*/, '$1-$2-$3') })),
        e => (lists.delete(k), Promise.reject(e))));
    return lists.get(k);
};

export async function detect([w, s, e, n], a, b) {
    const tiles = new Set(await call('tiles', [w, s, e, s, w, n, e, n,
        (w + e) / 2, (s + n) / 2]));
    const ys = [];
    for (let y = +a.slice(0, 4); y <= +b.slice(0, 4); y++) ys.push(y);
    const scenes = (await Promise.all([...tiles].flatMap(t =>
        ys.map(y => year(t, y))))).flat()
        .filter(x => x.date >= a && x.date <= b);
    return Promise.all(scenes.map(x => call('detect', x.url, w, s, e, n, 0, 1,
        [(w + e) / 2, (s + n) / 2]).then(r => ({ ...x, error: r.error,
        cloud: r.cloud?.[0], hotspots: r.hotspots ?? [] }))));
}
