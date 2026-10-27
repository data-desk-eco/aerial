// aerial — one map, one date window, three layers: s2 flaring, vnf flaring and
// methane plumes. this is the whole app declaration; shell/app.js mounts it
// and everything it names lives in the hook modules. it reads and draws, and
// does nothing else.

import { mount } from './shell/app.js';
import { drawWorldmap } from './vendor/dd/worldmap.js';
import { viewportBbox, ensureMark, ensureTag }
    from './shell/map.js';
import { canon, padBbox, formatDate, debounce }
    from './shell/util.js';
import { initArchive, objects } from './shell/archive.js';
import { prefetchData, fc, from } from './shell/data.js';
import { MODE } from './flaring/render.js';
import { DD, MARKS, PIN, AUDIT, RAMP, band, flareIcon, plumeIcon, TAGS,
    tagLayer } from './layers.js';
import { keySections } from './key.js';
import { readVNF, readSite, quarters, loadTerminals }
    from './flaring/flares.js';
import { initCard, cardTitle, cardStats, cardHtml, onCardShow, onCardClose,
    refreshCard, reselectCurrentFeature } from './card/index.js';
import { isPlume, label, readPlumes, availableQuartersPlumes,
    readPlume } from './methane/plumes.js';
import { addCandidateLayers } from './methane/candidates.js';
import { initProbabilityOverlay } from './methane/overlay.js';
import { initMask } from './methane/mask.js';
import { loadAttributions } from './methane/attribution.js';
import { SITE_LAYERS, SITE_ZOOM, holdSites, drawSites } from './sites.js';
import { view as liveView, features as liveFeatures, site as liveSite,
    quarters as liveQuarters, onChange as onLive, hold as holdLive,
    busy as liveBusy } from './flaring/live.js';

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

// ── the three layers ──

// on this branch s2 is the live layer alone: burnoff's detector reading
// sentinel-2 in the browser (flaring/live.js) stands in for the archive's
// sites, which are not read

// far out every family is one clustered source, `everything`: 60k markers
// placed each frame made the globe crawl. from NEAR in, each family's own
// layer draws every point. a cluster's label is a count, since a summed
// value would mash t/hr, ppm·m, b12 and radiant heat
const FAMILIES = ['live', 'vnf', 'plumes'], NEAR = 5;
// a cluster's colour: the mean band of what it holds, shifted up so a mixed
// cluster reads at its brighter end
const BAND = band(MODE);
const COUNT = ['coalesce', ['get', 'point_count'], 1];
const MEAN = ['case', ['has', 'point_count'],
    ['/', ['get', 'b'], ['get', 'point_count']], BAND];

// a source this app re-reads has to pass the key's live predicates itself:
// the shell applies them when a row is toggled, not when the data changes.
// ctx.sources holds the unfiltered set, which the shell and the card read.
function put(id, features) {
    const all = CTX.sources[id] = { type: 'FeatureCollection', features };
    CTX.map.getSource(id)?.setData(CTX.preds.length ? { ...all,
        features: features.filter(f => CTX.preds.every(p => p(f.properties))) }
        : all);
}
// the clusters, the outlines and the table follow a layer only when its
// set of points changes: the live layer is re-set at every read, and
// re-clustering 60k points each time made the map judder. the clusters are
// drawn only below NEAR, so nearer in they are re-set on the way out
const drawn = {};
let stale = false;
const cluster = () => (stale = false, put('everything',
    FAMILIES.flatMap(f => CTX.sources[f].features)));
function setSource(id, features) {
    put(id, features);
    const k = features.map(f => `${f.properties.id}:${f.properties[
        f.properties.kind === 'vnf' ? MODE.vnf.prop : MODE.s2.prop]}`).join();
    if (k === drawn[id]) return;
    drawn[id] = k;
    CTX.map.getZoom() < NEAR ? cluster() : stale = true;
    dispatchEvent(new Event('fx-filters'));   // the table drawer re-renders
}

// a layer's read for the ticked window: features, or null to leave it as it
// is. every family is read whole, as a window's rates are the same wherever
// the map looks: a pan reads nothing, and maplibre draws what is in view
const READS = {
    vnf: async range => fc(await readVNF(range, CTX.quarters.keys()))
        .features,
    plumes: async ({ startDate, endDate }) =>
        CTX.fc(await readPlumes(startDate, endDate)).features,
    // what burnoff found in this browser's own reads of sentinel-2
    live: async () => liveFeatures(CTX.quarters.keys()),
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
    const avail = vnf && new Set([...vnf, ...liveQuarters(pad),
        ...await availableQuartersPlumes(pad, GRID_START, GRID_END)]);
    [...q.buttons()].forEach(b => b.toggleAttribute('unavailable',
        !!avail && !avail.has(q.key(b))));
}
const scheduleDots = debounce(quarterDots, 300);

// ── deep links ──

// #flare= names a live site (live:<lat>,<lon>) or a vnf one
async function resolveFlare(id) {
    await whenReady;
    if (id.startsWith('live:')) return liveSite(id, CTX.quarters.keys());
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
    title: 'Aerial',
    subtitle: 'Emissions explorer',
    badge: 'Beta',
    search: true,
    audit: AUDIT,
    map: { ...VIEW, minZoom: 1.5, maxZoom: 18 },
    about: `
        <div class="region-row">
            <div class="fx-fine"><div class="fx-secondary">Coverage:</div>
                Refineries<br>Oil and gas<br>Landfills and wastewater<br>
                Heavy industry and power</div>
            <svg id="modal-worldmap"></svg>
        </div>
        <div class="fx-intro">
            <p>Aerial is a research tool designed for facility-level
                attribution of satellite emissions observations. Use it to
                investigate a specific facility or to browse point source
                emissions globally.</p>
            <p>In addition to Data Desk's Sentinel-2 hotspot detections, the map
                aggregates methane plumes and detections published by ${link('https://methanedata.unep.org/',
                'UN IMEO')}, ${link('https://data.carbonmapper.org/',
                'Carbon Mapper')}, ${link(
                'https://earth.sron.nl/methane-emissions/', 'SRON')} and
                ${link('https://eogdata.mines.edu/products/vnf/', 'EOG')}
                and overlays them on facility boundaries derived from
                ${link('https://globalenergymonitor.org/projects/'
                + 'global-gas-infrastructure-tracker/',
                'Global Energy Monitor')}, ${link(
                'https://doi.org/10.5281/zenodo.7466757', 'EDF')},
                ${link('https://edx.netl.doe.gov/dataset/'
                + 'global-oil-gas-features-database', 'NETL')} and
                ${link('https://www.openstreetmap.org/copyright',
                'OpenStreetMap')} data.</p>
            <p>Firm attribution of an observation to a facility requires
                further research. Experimentally, we use a system of
                ${link('https://github.com/data-desk-eco/bricolage',
                'research agents')} running DeepSeek-V4.1-Flash to publish
                attributions for all newly observed high-resolution methane
                plumes.</p>
            <p class="fx-fine fx-secondary">Design by ${link(
                'https://mikaeldahlen.com/', 'Mikael Dahlén')}.</p>
        </div>
        <details class="methods fx-fine">
            <summary class="fx-secondary"><svg viewBox="0 0 8 4"><path
                d="M.5.5 4 3.5l3.5-3"/></svg>Sources</summary>
            <div class="methods-list fx-secondary">
                <p>Aybar, C. et al. (2022). CloudSEN12, a global dataset for semantic understanding of cloud and cloud shadow in Sentinel-2. <i>Scientific Data 9, 782</i>. ${link(
                    'https://doi.org/10.1038/s41597-022-01878-2', 'doi.org/10.1038/s41597-022-01878-2')}</p>
                <p>Batchu, V. V. et al. (2026). Global monitoring of methane point sources using deep learning on hyperspectral radiance measurements from EMIT. <i>Proceedings of the National Academy of Sciences</i>. ${link(
                    'https://doi.org/10.1073/pnas.2612145123', 'doi.org/10.1073/pnas.2612145123')}</p>
                <p>Duren, R. M. et al. (2025). The Carbon Mapper emissions monitoring system. <i>Atmospheric Measurement Techniques 18, 6933–6975</i>. ${link(
                    'https://doi.org/10.5194/amt-18-6933-2025', 'doi.org/10.5194/amt-18-6933-2025')}</p>
                <p>Elvidge, C. D. et al. (2013). VIIRS Nightfire: satellite pyrometry at night. <i>Remote Sensing 5, 4423–4449</i>. ${link(
                    'https://doi.org/10.3390/rs5094423', 'doi.org/10.3390/rs5094423')}</p>
                <p>Global Energy Monitor (2026).
                    Global Energy Monitor trackers: oil and gas, LNG,
                    pipelines, coal, steel, cement and power. <i>Datasets</i>.
                    ${link('https://globalenergymonitor.org/',
                    'globalenergymonitor.org')}</p>
                <p>Haklay, M. and Weber, P. (2008). OpenStreetMap: user-generated street maps. <i>IEEE Pervasive Computing 7, 12–18</i>. ${link(
                    'https://doi.org/10.1109/MPRV.2008.80', 'doi.org/10.1109/MPRV.2008.80')}</p>
                <p>Jervis, D. et al. (2025). Global energy sector methane emissions estimated by using facility-level satellite observations. <i>Science</i>. ${link(
                    'https://doi.org/10.1126/science.adv3183', 'doi.org/10.1126/science.adv3183')}</p>
                <p>Marchese, F. et al. (2019). A multi-channel algorithm for mapping volcanic thermal anomalies by means of Sentinel-2 MSI and Landsat-8 OLI data. <i>Remote Sensing 11, 2876</i>. ${link(
                    'https://doi.org/10.3390/rs11232876', 'doi.org/10.3390/rs11232876')}</p>
                <p>Mateo-García, G. et al. (2025). Artificial intelligence for methane detection: from continuous monitoring to verified mitigation. <i>arXiv:2511.21777</i>. ${link(
                    'https://arxiv.org/abs/2511.21777', 'arxiv.org/abs/2511.21777')}</p>
                <p>Omara, M. et al. (2023). Developing a spatially explicit global oil and gas infrastructure database for characterizing methane emission sources at high resolution. <i>Earth System Science Data 15, 3761–3790</i>. ${link(
                    'https://doi.org/10.5194/essd-15-3761-2023', 'doi.org/10.5194/essd-15-3761-2023')}</p>
                <p>Raasveldt, M. and Mühleisen, H. (2019). DuckDB: an embeddable analytical database. <i>Proceedings of the 2019 International Conference on Management of Data (SIGMOD), 1981–1984</i>. ${link(
                    'https://doi.org/10.1145/3299869.3320212', 'doi.org/10.1145/3299869.3320212')}</p>
                <p>Rose, K. et al. (2018). Development of an open global oil and gas infrastructure inventory and geodatabase. <i>NETL-TRS-6-2018, National Energy Technology Laboratory</i>. ${link(
                    'https://doi.org/10.18141/1427573', 'doi.org/10.18141/1427573')}</p>
                <p>Schuit, B. J. et al. (2023). Automated detection and monitoring of methane super-emitters using satellite data. <i>Atmospheric Chemistry and Physics 23, 9071–9098</i>. ${link(
                    'https://doi.org/10.5194/acp-23-9071-2023', 'doi.org/10.5194/acp-23-9071-2023')}</p>
                <p>US EPA (2026). Greenhouse Gas Reporting Program facilities. <i>Envirofacts</i>. ${link(
                    'https://www.epa.gov/ghgreporting', 'www.epa.gov/ghgreporting')}</p>
                <p>Varon, D. J. et al. (2018). Quantifying methane point sources from fine-scale satellite observations of atmospheric methane plumes. <i>Atmospheric Measurement Techniques 11, 5673–5686</i>. ${link(
                    'https://doi.org/10.5194/amt-11-5673-2018', 'doi.org/10.5194/amt-11-5673-2018')}</p>
                <p>Zhizhin, M. et al. (2026). VIIRS Nightfire super-resolution method for multiyear cataloging of natural gas flaring sites: 2012–2025. <i>Remote Sensing 18, 314</i>. ${link(
                    'https://doi.org/10.3390/rs18020314', 'doi.org/10.3390/rs18020314')}</p>
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
        await Promise.all(Object.values(TAGS)
            .map(t => ensureTag(ctx.map, t, DD.white)));
        return {
            sites: empty,
            live: empty,
            vnf: empty,
            plumes: empty,
            everything: { data: empty, cluster: true,
                          clusterProperties: { b: ['+', BAND] },
                          clusterMaxZoom: NEAR - 1, clusterRadius: 15 },
        };
    },

    // the outlines first, so every detection draws over them
    layers: [
        ...SITE_LAYERS,
        {
            // read from z10, drawn from NEAR and clustered below it
            id: 'live', type: 'symbol', source: 'live', minzoom: NEAR,
            layout: { ...PIN, 'icon-image': flareIcon(MODE.s2) },
        },
        {
            // above s2, so the card's heat footprint stays under both
            id: 'vnf', type: 'symbol', source: 'vnf', minzoom: NEAR,
            layout: { ...PIN, 'icon-image': flareIcon(MODE.vnf) },
        },
        tagLayer('live'), tagLayer('vnf'),
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
            // a hairline ring sized on a log of its count and coloured by
            // the mean band of what it holds. a point no cluster took is a
            // cluster of one, so far out is all clusters
            id: 'clusters', type: 'circle', source: 'everything',
            maxzoom: NEAR,
            paint: { 'circle-color': 'transparent',
                'circle-stroke-width': 0.6,
                'circle-stroke-color': ['step', MEAN,
                    RAMP[0], 0.4, RAMP[1], 1, RAMP[2]],
                'circle-radius': ['interpolate', ['linear'],
                    ['ln', COUNT], 0, 1.5, Math.log(1e4), 18] },
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

    // a tab per family, each the rows its layer is drawing. an attribution
    // is listed while its plume is: the plume carries the window and the
    // filters, so the row is filtered as the plume and never as itself
    table: [
        {
            label: 'Attributions', filter: false,
            rows: ({ sources, preds = [] }) => loadAttributions().then(m =>
                sources.plumes.features.map(f => f.properties)
                    .filter(p => preds.every(f => f(p)))
                    .flatMap(p => m.get(canon(p.id)) ?? [])),
            cols: ['id', 'source_label', 'source_kind', 'operator',
                   'confidence', 'lat', 'lon'],
            open: r => resolvePlume(r.id),
        },
        { label: 'Plumes', rows: props('plumes'),
          cols: ['id', 'provider', 'date', 'rate_kg_h', 'satellite', 'sector',
                 'lat', 'lon'] },
        { label: 'Hotspots (VNF)', rows: props('vnf'),
          cols: ['id', 'name', 'country', 'max_rh', 'detection_count',
                 'observations', 'persistence', 'lat', 'lon'] },
        { label: 'Hotspots (S2)', rows: props('live'),
          empty: () => liveBusy() && 'Detections loading',
          cols: ['id', 'name', 'max_b12', 'detection_count', 'observations',
                 'persistence', 'lat', 'lon'] },
    ],

    detail: {
        layers: ['live', 'vnf', 'plumes'],
        hashKeys: { flare: resolveFlare, plume: resolvePlume },
        hashKey: p => isPlume(p) ? 'plume' : 'flare',
        idProp: 'id',
        flyZoom: p => isPlume(p) ? 13 : 15, highlightZoom: 10,
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
        drawWorldmap(document.getElementById('modal-worldmap'));
        initMask(ctx.map, ARCHIVE);
        addCandidateLayers(ctx.map);

        // no live read starts while the map moves, so its frames keep the
        // cores the workers would take
        ctx.map.on('movestart', () => holdLive(true));
        ctx.map.on('moveend', () => { scheduleDots(); SCHEDULED.sites();
            holdLive(false); liveView(ctx.map); });
        ctx.map.on('zoomend', () => stale && ctx.map.getZoom() < NEAR
            && cluster());
        // the live reads land a scene at a time: redrawn at most once a
        // second while they do, and never while the map moves
        let soon;
        const redraw = () => ctx.map.isMoving() ? ctx.map.once('moveend',
            redraw) : (soon = null, REFRESH.live(),
            dispatchEvent(new Event('fx-rows')));
        onLive(() => soon ??= setTimeout(redraw, 1000));

        // an outline is drawn while a drawn detection is inside it: after
        // any layer is re-set, and after the key re-filters them
        const shown = id => (ctx.sources[id]?.features ?? [])
            .filter(f => (ctx.preds ?? []).every(p => p(f.properties)));
        addEventListener('fx-filters', debounce(() => drawSites(ctx.map, shown),
            100));
        // the dots wait for the first paint: their plume index is a read
        // still on the network, and ahead of it it held the layers
        liveView(ctx.map);
        const first = Promise.allSettled([REFRESH.vnf(), REFRESH.plumes(),
            REFRESH.sites()]);
        // what no first paint draws waits for it, rather than sharing a
        // phone's line with it. a flare drawn before the terminals land is
        // renamed by this
        first.then(() => {
            ctx.loaded();
            quarterDots();
            prefetchData(ATTRIBUTIONS);
            loadTerminals().then(() => REFRESH.vnf());
        });
        readyResolve();
    },
});
