// flux — one map, one date window, three layers: s2 flaring, vnf flaring and
// methane plumes. this is the whole app declaration; shell/app.js mounts it
// and everything it names lives in the hook modules. it reads and draws, and
// does nothing else.

import { mount } from './shell/app.js';
import { viewportBbox, boxesWorldmap, ensureMark } from './shell/map.js';
import { canon, padBbox, escapeHtml, formatDate, debounce }
    from './shell/util.js';
import { initArchive, objects } from './shell/archive.js';
import { prefetchData, fc, from } from './shell/data.js';
import { MODE } from './flaring/render.js';
import { DD, MARKS, PIN, RATE_LABEL, AUDIT, flareIcon, plumeIcon }
    from './layers.js';
import { keySections } from './key.js';
import { readS2, readVNF, readSite, quarters, coverage, loadTerminals }
    from './flaring/flares.js';
import { initCard, cardTitle, cardStats, cardHtml, onCardShow, onCardClose,
    refreshCard, reselectCurrentFeature } from './card/index.js';
import { isPlume, label, readPlumes, availableQuartersPlumes,
    readPlume } from './methane/plumes.js';
import { addCandidateLayers } from './methane/candidates.js';
import { initProbabilityOverlay } from './methane/overlay.js';
import { initMask } from './methane/mask.js';
import { SHOWN } from './methane/attribution.js';
import { SITE_LAYERS, SITE_ZOOM, holdSites, drawSites } from './sites.js';

// legacy deep links: #vnf/123 -> #vnf=123, which resolveSite reads
if (/^#vnf\/[^/=&]+$/.test(location.hash))
    history.replaceState(null, '', location.hash.replace('/', '='));

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
prefetchAll(objects('flares'));
prefetchAll(objects('detections'));

// the span the quarter grid covers, which bounds the availability reads
const YEAR = new Date().getFullYear();
const GRID_START = `${YEAR - 3}-01-01`, GRID_END = `${YEAR}-12-31`;

let CTX, readyResolve;
const whenReady = new Promise(r => readyResolve = r);

// ── the three layers ──

// far out every family is one clustered source, `everything`: 60k markers
// placed each frame made the globe crawl. from NEAR in, each family's own
// layer draws every point. a cluster's label is a count, since a summed
// value would mash t/hr, ppm·m, b12 and radiant heat
const FAMILIES = ['detections', 'vnf', 'plumes'], NEAR = 5;

// a source this app re-reads has to pass the key's live predicates itself:
// the shell applies them when a row is toggled, not when the data changes.
// ctx.sources holds the unfiltered set, which the shell and the card read.
function put(id, features) {
    const all = CTX.sources[id] = { type: 'FeatureCollection', features };
    CTX.map.getSource(id)?.setData(CTX.preds.length ? { ...all,
        features: features.filter(f => CTX.preds.every(p => p(f.properties))) }
        : all);
}
function setSource(id, features) {
    put(id, features);
    put('everything', FAMILIES.flatMap(f => CTX.sources[f].features));
    dispatchEvent(new Event('fx-filters'));   // the table drawer re-renders
}

// a layer's read for the ticked window: features, or null to leave it as it
// is. every family is read whole, as a window's rates are the same wherever
// the map looks: a pan reads nothing, and maplibre draws what is in view
const READS = {
    detections: async range => fc(await readS2(range, CTX.quarters.keys(),
        MODE.s2.floor)).features,
    vnf: async range => fc(await readVNF(range, CTX.quarters.keys()))
        .features,
    plumes: async ({ startDate, endDate }) =>
        CTX.fc(await readPlumes(startDate, endDate)).features,
    // every outline around the view, held in the engine; drawSites draws
    // the ones a detection holds, so there is no source to set
    sites: async () => {
        if (CTX.map.getZoom() < SITE_ZOOM) return null;
        if (await holdSites(viewportBbox(CTX.map)))
            dispatchEvent(new Event('fx-filters'));
        return null;
    },
};
const FAILED = { detections: 'Flare archive unavailable',
                 vnf: 'VNF read failed', plumes: 'Plume read failed',
                 sites: 'Site outlines unavailable' };

// every path ends in reselectCurrentFeature: an open card holds a copy of the
// numbers for the window it was opened in, so it is re-opened from the new
// features. a read overtaken by a newer one draws nothing. a failure is said
// on the panel, as an empty map says nothing.
const refresh = id => {
    let epoch = 0;
    return async () => {
        const range = CTX.quarters.range(), e = ++epoch;
        if (!range) return;
        try {
            const features = await READS[id](range);
            if (!features || e !== epoch) return;
            setSource(id, features);
            reselectCurrentFeature(id);
        } catch (err) {
            console.error(`${id} read failed:`, err);
            CTX.quarters.hint(FAILED[id]);
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
    const flares = (await Promise.all(['data-desk', 'eog'].map(p =>
        quarters(p, pad, GRID_START, GRID_END).catch(err =>
            (console.error('quarter availability:', err), null)))))
        .filter(Boolean);
    const avail = flares.length && new Set([...flares.flatMap(s => [...s]),
        ...await availableQuartersPlumes(pad, GRID_START, GRID_END)]);
    const btns = [...q.buttons()];
    const ticked = b => b.hasAttribute('active');
    q.hint(avail && !btns.some(b => ticked(b) && avail.has(q.key(b)))
        ? 'No data for the selected quarters here' : '');
    btns.forEach(b => b.toggleAttribute('unavailable',
        !!avail && !avail.has(q.key(b))));
}
const scheduleDots = debounce(quarterDots, 300);

// ── deep links ──

// #site= names a flare of either family (flares.js asks both)
async function resolveSite(id) {
    await whenReady;
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
const link = (href, text) => `<a href="${href}" target="_blank">${text}</a>`;

mount({
    title: 'Flux',
    subtitle: 'Emissions explorer',
    badge: 'Beta',
    search: true,
    audit: AUDIT,
    map: { ...VIEW, minZoom: 1.5, maxZoom: 18 },
    about: `
        <div class="region-row">
            <div class="fx-fine"><div class="fx-secondary">Regions covered:
                </div><div>Data Desk archive</div></div>
            <svg id="modal-worldmap"></svg>
        </div>
        <details class="methods fx-fine">
            <summary class="fx-secondary"><svg viewBox="0 0 8 4"><path
                d="M.5.5 4 3.5l3.5-3"/></svg>Methods &amp; data</summary>
            <div class="methods-list fx-secondary">
                <p>Faruolo et al. (2024) ${link(
                    'https://doi.org/10.1088/1748-9326/ad82fb',
                    'The DAFI v2 algorithm for gas flare detection')}</p>
                <p>Elvidge et al. (2013) ${link(
                    'https://doi.org/10.3390/rs5094423',
                    'VIIRS Nightfire: Satellite pyrometry at night')}</p>
                <p>Jacob et al. (2022) ${link(
                    'https://doi.org/10.5194/acp-22-9617-2022',
                    'Quantifying methane emissions from the global scale ' +
                    'down to point sources')}</p>
                <p>Global Energy Monitor ${link('https://globalenergymonitor'
                    + '.org/projects/global-gas-infrastructure-tracker/',
                    'Global Gas Infrastructure Tracker')}</p>
                <p>Design by ${link('https://mikaeldahlen.com/',
                    'Mikael Dahlén')}</p>
            </div>
        </details>`,

    data: {
        files: { attributions: ATTRIBUTIONS },
    },

    // every source starts empty and ready() fires the first reads, so no
    // layer is held behind another's
    sources: async ctx => {
        CTX = ctx;
        // before the layers, or maplibre logs the expression-only ids missing
        MARKS.forEach(id => ensureMark(ctx.map, id));
        return {
            sites: empty,
            detections: empty,
            vnf: empty,
            plumes: empty,
            everything: { data: empty, cluster: true,
                          clusterMaxZoom: NEAR - 1, clusterRadius: 40 },
        };
    },

    // the outlines first, so every detection draws over them
    layers: [
        ...SITE_LAYERS,
        {
            id: 'detections', type: 'symbol', source: 'detections',
            minzoom: NEAR,
            layout: { ...PIN, 'icon-image': flareIcon(MODE.s2) },
        },
        {
            // above s2, so the card's heat footprint stays under both
            id: 'vnf', type: 'symbol', source: 'vnf', minzoom: NEAR,
            layout: { ...PIN, 'icon-image': flareIcon(MODE.vnf) },
        },
        {
            // no value label: colour already says how much, and the card
            // carries the number
            id: 'plumes', type: 'symbol', source: 'plumes', minzoom: NEAR,
            hover: p => ({ heading: label(p.provider), text: [p.confidence
                && `${p.confidence} confidence`, p.date && formatDate(p.date)]
                .filter(Boolean).join(' · ') }),
            layout: { ...PIN, 'icon-image': plumeIcon },
        },
        {
            // a cluster is a grouping, so it is off both ramps, and its
            // label is a count, never dropped for a collision. a point no
            // cluster took is a cluster of one, so far out is all clusters
            id: 'clusters', type: 'symbol', source: 'everything',
            maxzoom: NEAR,
            layout: { ...PIN, ...RATE_LABEL,
                'icon-image': `quantitative-${DD.white}`,
                'text-field': ['to-string',
                    ['coalesce', ['get', 'point_count'], 1]],
                'text-allow-overlap': true },
            paint: { 'text-color': DD.white },
        },
    ],

    quarters: {
        onChange: () => {
            Object.values(SCHEDULED).forEach(fn => fn());
            scheduleDots();
            refreshCard();
        },
    },

    key: () => keySections(),

    // a tab per family, each the rows its layer is drawing. attributions are
    // ch4id's contract, not feature properties, so they sit out the filters
    table: [
        {
            label: 'Attributions', filter: false,
            rows: async ({ sql }) => sql(`SELECT id, source_label,
                source_kind, operator, confidence, lat, lon
                FROM ${await from('attributions')} WHERE ${SHOWN}
                ORDER BY source_label`),
            cols: ['id', 'source_label', 'source_kind', 'operator',
                   'confidence', 'lat', 'lon'],
        },
        { label: 'Plumes', rows: props('plumes'),
          cols: ['id', 'provider', 'date', 'rate_kg_h', 'satellite', 'sector',
                 'lat', 'lon'] },
        { label: 'Flares (VNF)', rows: props('vnf'),
          cols: ['id', 'name', 'country', 'max_rh', 'detection_count',
                 'observations', 'persistence', 'lat', 'lon'] },
        { label: 'Flares (S2)', rows: props('detections'),
          cols: ['id', 'name', 'max_b12', 'detection_count', 'observations',
                 'persistence', 'lat', 'lon'] },
    ],

    detail: {
        layers: ['detections', 'vnf', 'plumes'],
        // #vnf= is a legacy spelling of #site=; a hash with both takes #site=
        hashKeys: { site: resolveSite, vnf: resolveSite, plume: resolvePlume },
        hashKey: p => isPlume(p) ? 'plume' : 'site',
        idProp: 'id',
        flyZoom: 15, highlightZoom: 10,
        title: cardTitle,
        stats: cardStats,
        html: cardHtml,
        onShow: onCardShow,
        onClose: onCardClose,
    },

    ready: ctx => {
        initCard({ map: ctx.map, archive: ARCHIVE,
                   quarterKeys: () => ctx.quarters.keys() });
        initProbabilityOverlay(ctx.map);
        initMask(ctx.map, ARCHIVE);
        addCandidateLayers(ctx.map);
        boxesWorldmap(document.getElementById('modal-worldmap'),
            coverage, 0.06);

        ctx.map.on('moveend', () => { scheduleDots(); SCHEDULED.sites(); });

        // an outline is drawn while a drawn detection is inside it: after
        // any layer is re-set, and after the key re-filters them
        const shown = id => (ctx.sources[id]?.features ?? [])
            .filter(f => (ctx.preds ?? []).every(p => p(f.properties)));
        addEventListener('fx-filters', debounce(() => drawSites(ctx.map, shown),
            100));
        // the dots wait for the first paint: their plume index is a read
        // still on the network, and ahead of it it held the layers
        const first = Promise.allSettled([REFRESH.detections(),
            REFRESH.vnf(), REFRESH.plumes(), REFRESH.sites()]);
        // what no first paint draws waits for it, rather than sharing a
        // phone's line with it. a flare drawn before the terminals land is
        // renamed by this
        first.then(() => {
            ctx.loaded();
            quarterDots();
            prefetchData(ATTRIBUTIONS);
            loadTerminals().then(() => {
                REFRESH.detections(); REFRESH.vnf(); });
        });
        readyResolve();
    },
});
