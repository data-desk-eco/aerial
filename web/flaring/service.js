// burnoff's service (data-desk-eco/burnoff, its serve/ on the jump host),
// asked in the engine: duckdb-wasm-lite links quack's client, so a read is
// one statement, `quack_query` of `FROM sites(w, s, e, n, 'a', 'b')` or the
// same of s3_sites, each answering one row of geojson. ?api= on the page
// names another service, as a quack uri (a local one: quack:localhost:9494).
//
// on v2.0.0-lite.1 the call waits in the engine's worker, so a service read
// holds the archive's reads until it answers; lite.2's `columns := {...}`
// parks it on its fetch instead, the calls on their lanes in flight at once
// (its build has not released). a lane each of four, as live.js has four in
// flight

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
        ${quote(q)}, token := 'burnoff')`,
        { lane: LANES[next++ % LANES.length] });
    return JSON.parse(r.geojson);
}
