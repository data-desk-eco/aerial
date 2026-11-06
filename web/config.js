// aerial — one map, one date window, four layers: s2 and s3 hotspots, vnf
// flaring and methane plumes. this is the whole app declaration;
// shell/app.js mounts it and everything it names lives in the hook modules.
// it reads and draws, and does nothing else.

import { mount } from './shell/app.js';
import { drawWorldmap } from './vendor/dd/worldmap.js';
import { viewportBbox, ensureMark, ensureLabel }
    from './shell/map.js';
import { canon, padBbox, formatDate, debounce }
    from './shell/util.js';
import { initArchive, objects } from './shell/archive.js';
import { prefetchData, fc } from './shell/data.js';
import { MODE } from './flaring/render.js';
import { MARKS, PIN, AUDIT, FLARES, FAMILIES, flareIcon, plumeIcon,
    tagLayer } from './layers.js';
import { NEAR, HEAT_LAYERS, initHeat } from './heat.js';
import { ABOUT } from './about.js';
import { keySections } from './key.js';
import { readVNF, readSite, quarters } from './flaring/flares.js';
import { initCard, cardTitle, cardStats, cardHtml, cardAbout, onCardShow,
    onCardClose, refreshCard, reselectCurrentFeature } from './card/index.js';
import { isPlume, label, readPlumes, availableQuartersPlumes,
    readPlume } from './methane/plumes.js';
import { addCandidateLayers } from './methane/candidates.js';
import { initProbabilityOverlay } from './methane/overlay.js';
import { initMask } from './methane/mask.js';
import { loadAttributions } from './methane/attribution.js';
import { SITE_LAYERS, SITE_ZOOM, holdSites, drawSites, initEmphasis }
    from './sites.js';
import { s2, s3 } from './flaring/live.js';

// the bucket every layer reads. index.json names each table's objects, so no
// module names one
const ARCHIVE = document.querySelector('meta[name="data-bucket"]').content;
initArchive(ARCHIVE);

const ATTRIBUTIONS = `${ARCHIVE}/data-desk/attributions/data.parquet`;

const VIEW = { center: [52.688, 26.989], zoom: 6.19 };

// every object small enough to hold is fetched whole at page parse, racing
// the engine download (shell/data.js); what is past the cap stays ranged.
// only what the first paint draws from: the attributions (1.4 MB, a card's
// and the table's) wait for it, as on a phone line they were its own wait
const prefetchAll = urls => urls.then(us => us.forEach(prefetchData))
    .catch(() => {});
prefetchAll(objects('flares', { provider: 'eog' }));
prefetchAll(objects('detections'));

// the span the quarter grid covers, which bounds the availability reads
const YEAR = new Date().getFullYear();
const GRID_START = `${YEAR - 3}-01-01`, GRID_END = `${YEAR}-12-31`;

let CTX, readyResolve;
const whenReady = new Promise(r => readyResolve = r);

// ── the layers ──

// the sentinels are live layers, off burnoff's service (flaring/live.js):
// s2 by day and s3 by night
const each = f => [s2, s3].forEach(f);

// a source this app re-reads has to pass the key's live predicates itself:
// the shell applies them when a row is toggled, not when the data changes.
// ctx.sources holds the unfiltered set, which the shell and the card read.
function put(id, features) {
    const all = CTX.sources[id] = { type: 'FeatureCollection', features };
    CTX.map.getSource(id)?.setData(CTX.preds.length ? { ...all,
        features: features.filter(f => CTX.preds.every(p => p(f.properties))) }
        : all);
}
// the surface, the outlines and the table follow a layer only when its
// set of points changes: a live layer is re-set at every read
const drawn = {};
function setSource(id, features) {
    put(id, features);
    const k = features.map(({ properties: p }) =>
        `${p.id}:${p[MODE[p.kind]?.prop]}`).join();
    if (k === drawn[id]) return;
    drawn[id] = k;
    dispatchEvent(new Event('fx-filters'));   // the table drawer re-renders
}
const shown = id => (CTX.sources[id]?.features ?? [])
    .filter(f => f.geometry && (CTX.preds ?? []).every(p => p(f.properties)));

// a layer's read for the ticked window: features, or null to leave it as it
// is. every family is read whole, as a window's rates are the same wherever
// the map looks: a pan reads nothing, and maplibre draws what is in view
const READS = {
    vnf: async range => fc(await readVNF(range, CTX.quarters.keys()))
        .features,
    plumes: async ({ startDate, endDate }) =>
        CTX.fc(await readPlumes(startDate, endDate)).features,
    // what burnoff's service found
    s2: async () => s2.features(CTX.quarters.keys()),
    s3: async () => s3.features(CTX.quarters.keys()),
    // every outline around the view, held in the engine; drawSites draws
    // the ones a detection holds, so there is no source to set
    sites: async () => {
        if (CTX.map.getZoom() < SITE_ZOOM) return null;
        if (await holdSites(viewportBbox(CTX.map)))
            dispatchEvent(new Event('fx-filters'));
        return null;
    },
};

// every path ends in reselectCurrentFeature: an open card holds a copy of the
// numbers for the window it was opened in, so it is re-opened from the new
// features. a read overtaken by a newer one draws nothing. a failure goes to
// the console.
const LOG = { vnf: 'VIIRS Nightfire sites', plumes: 'methane plumes',
              sites: 'facility outlines' };
const refresh = id => {
    let epoch = 0;
    return async () => {
        const range = CTX.quarters.range(), e = ++epoch;
        if (!range) return;
        if (LOG[id]) CTX.status(id, `Loading ${LOG[id]}`);
        try {
            const features = await READS[id](range);
            if (!features || e !== epoch) return;
            setSource(id, features);
            reselectCurrentFeature(id);
        } catch (err) {
            console.error(`${id} read failed:`, err);
        } finally {
            if (e === epoch && LOG[id]) CTX.status(id);
        }
    };
};
const REFRESH = Object.fromEntries(Object.keys(READS)
    .map(id => [id, refresh(id)]));
// scheduled, never run on the event: a quarter click can come in bursts
const SCHEDULED = Object.fromEntries(Object.entries(REFRESH)
    .map(([id, fn]) => [id, debounce(fn, 200)]));

// ── quarter availability ──

// a dot greys when no layer holds data for it here. a family that cannot say
// (below its zoom floor, not read yet) answers null and greys nothing, and
// each answers from the floor it draws at.
async function quarterDots() {
    const q = CTX.quarters, pad = padBbox(viewportBbox(CTX.map));
    const vnf = await quarters('eog', pad, GRID_START, GRID_END).catch(err =>
        (console.error('quarter availability:', err), null));
    const avail = vnf && new Set([...vnf, ...s2.quarters(pad),
        ...s3.quarters(pad), ...await availableQuartersPlumes(pad, GRID_START, GRID_END)]);
    [...q.buttons()].forEach(b => b.toggleAttribute('unavailable',
        !!avail && !avail.has(q.key(b))));
}
const scheduleDots = debounce(quarterDots, 300);

// ── deep links ──

// #flare= names a live site (live:<lat>,<lon>@<tile>_<date>, s3:<lat>,<lon>)
// or a vnf one. a live site is the service's answer, so the link waits
// until its view's reads hold it, or are done, a minute at most
const until = async (x, id) => {
    for (let t = 0; t < 120; t++) {
        const f = x.site(id, CTX.quarters.keys());
        if (f || t > 4 && !x.busy()) return f;
        await new Promise(r => setTimeout(r, 500));
    }
    return null;
};
async function resolveFlare(id) {
    await whenReady;
    if (id.startsWith('live:')) return until(s2, id);
    if (id.startsWith('s3:')) return until(s3, id);
    const row = await readSite(id, CTX.quarters.keys());
    return row && fc([row]).features[0];
}

// #plume=, off the loaded features (on the canonical id, so a link from
// before the archive namespaced ids still lands), else a read of its own
async function resolvePlume(id) {
    await whenReady;
    return CTX.sources.plumes?.features
        .find(f => canon(f.properties.id) === canon(id)) ?? readPlume(id);
}

// ── mount ──

const empty = { type: 'FeatureCollection', features: [] };
const props = id => ({ sources }) =>
    sources[id].features.map(f => f.properties);

mount({
    title: 'Aerial',
    subtitle: 'Emissions explorer',
    badge: 'Beta',
    search: true,
    audit: AUDIT,
    map: { ...VIEW, minZoom: 1.5, maxZoom: 18 },
    about: ABOUT,

    data: {
        files: { attributions: ATTRIBUTIONS },
    },

    // every source starts empty and ready() fires the first reads, so no
    // layer is held behind another's
    sources: async ctx => {
        CTX = ctx;
        // before the layers, or maplibre logs the expression-only ids missing
        MARKS.forEach(id => ensureMark(ctx.map, id));
        await Promise.all(FLARES.map(id => ensureLabel(ctx.map,
            `tag-${id}`, { text: id.toUpperCase(), weight: 300 })));
        return Object.fromEntries(['sites', ...FAMILIES, 'heat']
            .map(id => [id, empty]));
    },

    // the outlines first, so every detection draws over them
    layers: [
        ...SITE_LAYERS,
        // drawn from NEAR, and a surface below it (heat.js); vnf above
        // the sentinels, so the card's heat footprint stays under
        ...FLARES.map(id => ({ id, type: 'symbol', source: id, minzoom: NEAR,
            layout: { ...PIN, 'icon-image': flareIcon(MODE[id]) } })),
        ...FLARES.map(tagLayer),
        {
            // no value label: colour already says how much, and the card
            // carries the number
            id: 'plumes', type: 'symbol', source: 'plumes', minzoom: NEAR,
            hover: p => ({ heading: label(p.provider), text: [p.confidence
                && `${p.confidence} confidence`, p.date && formatDate(p.date)]
                .filter(Boolean).join(' · ') }),
            layout: { ...PIN, 'icon-image': plumeIcon },
        },
        ...HEAT_LAYERS,
    ],

    quarters: {
        onChange: () => {
            Object.values(SCHEDULED).forEach(fn => fn());
            scheduleDots();
            refreshCard();
        },
    },

    key: keySections,

    // a tab per family, each the rows its layer is drawing. an attribution
    // is listed while its plume is, under the plume's date: the plume
    // carries the window and the filters, so the row is filtered as the
    // plume and never as itself
    table: [
        {
            label: 'Attributions', filter: false,
            rows: ({ sources, preds = [] }) => loadAttributions().then(m =>
                sources.plumes.features.map(f => f.properties)
                    .filter(p => preds.every(f => f(p)))
                    .flatMap(p => (a => a ? [{ ...a, date: p.date }] : [])(
                        m.get(canon(p.id))))),
            cols: ['date', 'id', 'source_label', 'operator', 'confidence',
                   'lat', 'lon'],
            open: r => resolvePlume(r.id),
        },
        { label: 'Plumes', rows: props('plumes'),
          cols: ['id', 'provider', 'date', 'rate_kg_h', 'satellite', 'sector',
                 'lat', 'lon'] },
        { label: 'Hotspots (VNF)', rows: props('vnf'),
          cols: ['id', 'name', 'country', 'max_rh', 'detection_count',
                 'observations', 'persistence', 'lat', 'lon'] },
        { label: 'Hotspots (S2)', rows: props('s2'),
          empty: () => s2.busy() && 'Detections loading',
          cols: ['id', 'max_b12', 'detection_count', 'observations',
                 'persistence', 'lat', 'lon'] },
        { label: 'Hotspots (S3)', rows: props('s3'),
          empty: () => s3.busy() && 'Detections loading',
          cols: ['id', 'max_rh', 'detection_count', 'observations',
                 'persistence', 'lat', 'lon'] },
    ],

    detail: {
        layers: FAMILIES,
        hashKeys: { flare: resolveFlare, plume: resolvePlume },
        hashKey: p => isPlume(p) ? 'plume' : 'flare',
        idProp: 'id',
        flyZoom: p => isPlume(p) ? 13 : 15, highlightZoom: 10,
        title: cardTitle,
        stats: cardStats,
        html: cardHtml,
        about: cardAbout,
        onShow: onCardShow,
        onClose: onCardClose,
    },

    ready: ctx => {
        initCard({ map: ctx.map, archive: ARCHIVE,
                   quarterKeys: () => ctx.quarters.keys() });
        initProbabilityOverlay(ctx.map);
        drawWorldmap(document.getElementById('modal-worldmap'));
        initMask(ctx.map, ARCHIVE);
        addCandidateLayers(ctx.map);
        initEmphasis(ctx.map);

        // no live read starts while the map moves, so its frames keep the
        // cores the workers would take
        ctx.map.on('movestart', () => each(x => x.hold(true)));
        ctx.map.on('moveend', () => { scheduleDots(); SCHEDULED.sites();
            each(x => (x.hold(false), x.view(ctx.map))); });
        initHeat(ctx.map, () => FAMILIES.flatMap(shown),
            fs => put('heat', fs));
        each(x => x.watch(ctx.map, ctx.status, () => (REFRESH[x.kind](),
            dispatchEvent(new Event('fx-rows')))));

        // an outline is drawn while a drawn detection is inside it: after
        // any layer is re-set, and after the key re-filters them
        addEventListener('fx-filters', debounce(() => drawSites(ctx.map, shown),
            100));
        // the dots wait for the first paint: their plume index is a read
        // still on the network, and ahead of it it held the layers
        each(x => x.view(ctx.map));
        const first = Promise.allSettled([REFRESH.vnf(), REFRESH.plumes(),
            REFRESH.sites()]);
        // what no first paint draws waits for it, rather than sharing a
        // phone's line with it
        first.then(() => {
            ctx.loaded();
            quarterDots();
            prefetchData(ATTRIBUTIONS);
        });
        readyResolve();
    },
});
