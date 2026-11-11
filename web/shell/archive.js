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

// more than one archive can be open: the public bucket, and the private
// tables behind the access login (/private/), of which only the
// <provider>/<table> names `only` lists are read. each is fetched once,
// and a failure clears its memo, so one that does not answer costs its own
// tables alone
const archives = new Map();   // canonical base -> { only, doc }
const canonical = url =>
    new URL(url, globalThis.location?.href).href.replace(/\/+$/, '');

// the index of `url`; safe at module parse
export function initArchive(url, only) {
    const base = canonical(url);
    const a = archives.get(base) ?? archives.set(base, { only }).get(base);
    return a.doc ??= fetch(`${base}/index.json`)
        .then(r => r.ok ? r.json()
            : Promise.reject(new Error(`archive index: HTTP ${r.status}`)))
        .catch(err => { a.doc = null; throw err; });
}

// an object's bytes, off its archive's index: 0 for a partition the table
// does not hold, undefined where the index says nothing. a hint, listed as
// the archive publishes, so a reader may act on it and must not rely on it
const PATH = /^([^/]+\/[^/]+)\/(?:[^/=]+=([^/]+)\/)?data\.parquet$/;
export async function bytes(url) {
    const base = [...archives.keys()].find(b => url.startsWith(`${b}/`));
    const [, table, value] = base && PATH.exec(url.slice(base.length + 1))
        || [];
    const s = table && (await initArchive(base).catch(() => ({}))).sizes
        ?.[table];
    return value && s ? s[value] ?? 0 : s;
}

// the urls of `table`: one per provider publishing it whole, plus each
// partitioned one addressed at `key` that holds it. a partitioned provider
// is left out with no key, as a url cannot expand a glob. urls, not rows, so
// a provider that has not published costs the caller its own rows alone.
export async function objects(table, { key, provider } = {}) {
    if (!archives.size) throw new Error('archive: call initArchive(base) first');
    const each = await Promise.all([...archives].map(async ([base, a]) => {
        // the public index's failure is the caller's to report; a private
        // one's is the login's, said once where it is opened
        const doc = await (a.only ? initArchive(base).catch(() => ({}))
            : initArchive(base));
        return Object.entries(doc[table] ?? {}).filter(([p, part]) =>
            (!provider || p === provider) && (!part || key != null)
            && (!a.only || a.only.includes(`${p}/${table}`)))
            .map(([p, part]) => `${base}/${p}/${table}/`
                + `${part ? `${part}=${key}/` : ''}data.parquet`);
    }));
    const urls = each.flat(), held = await Promise.all(urls.map(bytes));
    return urls.filter((_, i) => held[i] !== 0);
}
