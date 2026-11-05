// burnoff's service (data-desk-eco/burnoff, its serve/ on the jump host),
// over duckdb's quack protocol: `FROM s2_sites(w, s, e, n, 'a', 'b')` and the
// same of s3_sites, each one row of geojson. the client (vendor/quack) is
// loaded with the first call. it queues a connection's statements, so a few
// connections serve the reads in flight, each made when first wanted and
// made again after a failure. ?api= on the page names another service
// (a local one: http://localhost:9494)

const API = new URLSearchParams(location.search).get('api')
    || 'https://dev.datadesk.eco';
const N = 4;
const pool = Array.from({ length: N }, () => ({ busy: 0, client: null }));
let sdk;

const connect = c => c.client ??= (sdk ??= import(
    '../vendor/quack/index.js')).then(({ QuackClient }) =>
    // fetch bound to the page: the client calls it as its own method,
    // which a browser refuses (illegal invocation)
    QuackClient.connect(API, { authToken: 'burnoff', timeoutMs: 30000,
        fetch: (...a) => fetch(...a) }))
    .catch(e => (c.client = null, Promise.reject(e)));

const date = d => /^\d{4}-\d\d-\d\d$/.test(d) ? d : '..';
// fn's answer over [w, s, e, n] from a to b, as geojson
export async function call(fn, box, a, b) {
    const c = pool.reduce((x, y) => y.busy < x.busy ? y : x);
    c.busy++;
    try {
        const q = await connect(c);
        const r = await q.query(`FROM ${fn}(${box.map(v => (+v).toFixed(5))
            .join(', ')}, '${date(a)}', '${date(b)}')`);
        return JSON.parse(r.rows()[0].geojson);
    } catch (e) {
        c.client = null;   // the next call connects again
        throw e;
    } finally {
        c.busy--;
    }
}
