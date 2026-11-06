// burnoff's service (data-desk-eco/burnoff, its serve/ on the jump host),
// asked in the engine: duckdb-wasm-lite links quack's client, so a read is
// one statement, `quack_query` of `FROM s2_sites(w, s, e, n, 'a', 'b')` or
// the same of s3_sites, each one row of geojson. `columns` parks the call on
// its fetch, so the archive's reads run meanwhile and the four lanes' calls
// are in flight at once, as live.js has four. ?api= on the page names
// another service, as a quack uri (a local one: quack:localhost:9494)

import { sql } from '../shell/data.js';
import { quote } from '../shell/util.js';

const API = new URLSearchParams(location.search).get('api')
    || 'quack:dev.datadesk.eco:443';
const LANES = ['service0', 'service1', 'service2', 'service3'];
let next = 0;

const date = d => /^\d{4}-\d\d-\d\d$/.test(d) ? d : '..';
// fn's answer over [w, s, e, n] from a to b, as geojson
export async function call(fn, box, a, b) {
    const q = `FROM ${fn}(${box.map(v => (+v).toFixed(5)).join(', ')}, '${
        date(a)}', '${date(b)}')`;
    const [r] = await sql(`SELECT geojson FROM quack_query(${quote(API)},
        ${quote(q)}, token := 'burnoff', columns := {'geojson': 'VARCHAR'})`,
        { lane: LANES[next++ % LANES.length] });
    return JSON.parse(r.geojson);
}
