import { quote } from './util.js';
import { bytes } from './archive.js';

// one lazy duckdb-wasm engine serves every parquet read and raw statement.
// its client runs in engine.js, a worker, so a read costs the main thread
// only the structured clone of its rows.
let files = {}, engine, seq = 0;
const pending = new Map();

const db = () => engine ??= (() => {
    const w = new Worker(new URL('./engine.js', import.meta.url),
        { type: 'module' });
    w.onmessage = ({ data: [n, v, err] }) => {
        const [ok, fail] = pending.get(n);
        pending.delete(n);
        err == null ? ok(v) : fail(new Error(err));
    };
    return w;
})();
const call = (op, args, transfer = []) => new Promise((ok, fail) => {
    pending.set(++seq, [ok, fail]);
    db().postMessage([seq, op, ...args], transfer);
});

// the engine is ~7 MB over the wire, so it starts here, downloading while
// the map loads its style and tiles rather than after
export function initData({ files: f = {}, prefetch = [] } = {}) {
    files = f;
    call('ready', []).catch(() => {});
    for (const name of prefetch) prefetchData(name);
}

// an object the index says is small enough to hold is fetched whole, racing
// the engine download, and registered as an engine buffer, so every
// statement over it runs at memory speed (cold first points ~4.7 s to ~2.2).
// past the cap, with no size stated, or on a failed fetch, it falls back to
// its url and the ranged read it would have had anyway, whose ranges the
// engine keeps
const PREFETCH_CAP = 8 << 20;
const buffers = new Map();
let bufSeq = 0;
export function prefetchData(name) {
    const u = url(name);
    if (!buffers.has(u)) buffers.set(u, bytes(u).then(async n => {
        if (!(n <= PREFETCH_CAP)) return null;
        const res = await fetch(u);
        if (!res.ok) return null;
        const data = new Uint8Array(await res.arrayBuffer());
        const buf = `prefetch${bufSeq++}.parquet`;
        await call('register', [buf, data], [data.buffer]);
        return buf;
    }).catch(() => null));
    return buffers.get(u);
}
// a read of a prefetched object waits for its buffer, not the network
const viaBuffer = async source => Array.isArray(source)
    ? Promise.all(source.map(viaBuffer))
    : (buffers.has(source) ? await buffers.get(source) : null) ?? source;

const ident = name => `"${String(name).replaceAll('"', '""')}"`;
// canonical, so a prefetch and a later read key one object one way
const url = name => {
    if (Array.isArray(name)) return name.map(url);
    const value = files[name] ?? name;
    return Array.isArray(value) ? value.map(url)
        : new URL(value, globalThis.location?.href).href;
};
const list = s => Array.isArray(s) ? `[${s.map(quote).join(', ')}]` : quote(s);

// what a statement reads `name` from: its engine buffer where it was
// prefetched, else its url, ranged. several objects are one union by name
export async function from(name) {
    const source = await viaBuffer(url(name));
    return `read_parquet(${list(source)}${Array.isArray(source)
        ? ', union_by_name = true' : ''})`;
}

// a connection per lane (engine.js): a lane may wait behind itself, never
// behind anything else, so a card open cannot hold a pan
export const sql = (statement, { lane } = {}) =>
    call('sql', [statement, lane]);

// `where` is {column: [lo, hi]}, either end open, and never null
export async function read(name, { columns, where, lane } = {}) {
    const select = columns?.length ? columns.map(ident).join(', ') : '*';
    const tests = Object.entries(where ?? {}).flatMap(([column, [lo, hi]]) => {
        const col = ident(column);
        return [`${col} IS NOT NULL`,
            ...(lo == null ? [] : [`${col} >= ${quote(lo)}`]),
            ...(hi == null ? [] : [`${col} <= ${quote(hi)}`])];
    });
    const filter = tests.length ? ` WHERE ${tests.join(' AND ')}` : '';
    return sql(`SELECT ${select} FROM ${await from(name)}${filter}`,
        { lane });
}

export const fc = rows => ({ type: 'FeatureCollection',
    features: rows.map(properties => ({ type: 'Feature', properties,
        geometry: { type: 'Point',
                    coordinates: [properties.lon, properties.lat] } })) });
