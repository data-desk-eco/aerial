// the archive publishes what it contains. <base>/index.json maps table ->
// provider -> the partition key that provider's table is addressed by, or
// null when it is one data.parquet:
//
//   <base>/<provider>/<table>/data.parquet                   key null
//   <base>/<provider>/<table>/<key>=<value>/data.parquet     key named
//
// so a reader names exact objects: no bucket-wide glob, no one read that a
// missing object fails, no provider list in the app. json, not parquet, so
// the fetch overlaps the engine download. its `sizes` member is what each
// object weighs, by partition value where there are partitions.

let base, doc;

// fetch the index once; safe at module parse. a failure clears the memo.
// the base is canonical, as every url a reader holds is (shell/data.js)
export function initArchive(url) {
    base = new URL(url, globalThis.location?.href).href.replace(/\/+$/, '');
    return doc ??= fetch(`${base}/index.json`)
        .then(r => r.ok ? r.json()
            : Promise.reject(new Error(`archive index: HTTP ${r.status}`)))
        .catch(err => { doc = null; throw err; });
}

// an object's bytes, off the index: 0 for a partition the table does not
// hold, undefined where the index says nothing. a hint, listed as the
// archive publishes, so a reader may act on it and must not rely on it
const PATH = /^([^/]+\/[^/]+)\/(?:[^/=]+=([^/]+)\/)?data\.parquet$/;
export async function bytes(url) {
    const [, table, value] = url.startsWith(`${base}/`)
        && PATH.exec(url.slice(base.length + 1)) || [];
    const s = table && (await initArchive(base)).sizes?.[table];
    return value && s ? s[value] ?? 0 : s;
}

// the urls of `table`: one per provider publishing it whole, plus each
// partitioned one addressed at `key` that holds it. a partitioned provider
// is left out with no key, as a url cannot expand a glob. urls, not rows, so
// a provider that has not published costs the caller its own rows alone.
export async function objects(table, { key, provider } = {}) {
    // through initArchive, not the memo, so a failed fetch retries and says
    // what went wrong rather than "call initArchive first"
    if (!base) throw new Error('archive: call initArchive(base) first');
    const urls = Object.entries((await initArchive(base))[table] ?? {})
        .filter(([p, part]) =>
            (!provider || p === provider) && (!part || key != null))
        .map(([p, part]) => `${base}/${p}/${table}/`
            + `${part ? `${part}=${key}/` : ''}data.parquet`);
    const held = await Promise.all(urls.map(bytes));
    return urls.filter((_, i) => held[i] !== 0);
}
