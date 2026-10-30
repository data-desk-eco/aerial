// the detail card: the shell renders the header and calls these hooks; the
// body is the one the feature's `kind` selects (an s2 site, a vnf flare or a
// plume). the flaring bodies share the series card here: information rows,
// chart, dated rows. dispatch is on the feature, so a card opened from "also
// here" is the kind it names.

import { showDetail, closeDetail } from '../shell/detail.js';
import { dateInQuarters, formatDate } from '../shell/util.js';
import { renderChart } from './chart.js';
import { initOverlays, greyCircles, clearOverlays, dim }
    from './overlays.js';
import flare from './flare.js';
import vnf from './vnf.js';
import plume from './plume.js';

const BODIES = { live: flare, vnf, plume };
const bodyOf = p => BODIES[p.kind] ?? BODIES.live;

export let map = null;
let quarterKeys = () => new Set();

export let current = null;        // the open feature's properties
export let currentDets = [];      // the series the card lists (csv reads it)
export let selectedDetection = null;
let shownBody = null;
let skipAuto = false;             // a re-render keeps the selected date

export function initCard(deps) {
    ({ map, quarterKeys } = deps);
    initOverlays(map);
    for (const b of Object.values(BODIES)) b.init?.(deps);

    // j/k and the arrows step the dated rows, but not in a text field; escape
    // is the shell's
    const STEP = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 };
    document.addEventListener('keydown', e => {
        const dir = STEP[e.key];
        if (!dir || e.target.matches('input,textarea,select,[contenteditable]')
            || !document.getElementById('detail')
            .classList.contains('visible')) return;
        e.preventDefault();
        const items = [...document.querySelectorAll('.event-item')];
        if (!items.length) return;
        const at = items.findIndex(el => el.hasAttribute('active'));
        const next = Math.max(0, Math.min(items.length - 1, at + dir));
        if (next === at) return;
        items[next].click();
        items[next].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

export const coords = p => [Number(p.lon), Number(p.lat)];
const featureOf = p => ({ type: 'Feature', properties: p,
    geometry: { type: 'Point', coordinates: coords(p) } });

// "Near <terminal>" where one is close enough to name the site
const near = name =>
    `Near ${String(name).replace(/\s*Terminal\b/gi, '').trim()}`;
export const siteTitle = (p, fallback) =>
    ({ text: (p.terminal ? near(p.name) : p.name) || fallback });

// ── detail hooks ──

export const cardTitle = p => bodyOf(p).title(p);
// the statistics sit under the heading rule (pdf:89)
export const cardStats = p => (bodyOf(p).stats ?? seriesStats)(p, bodyOf(p));
export const cardHtml = p => (bodyOf(p).html ?? seriesHtml)(p, bodyOf(p));

export function onCardShow(p, el) {
    const b = bodyOf(p);
    // a re-render keeps the date the reader had selected
    const keep = skipAuto ? selectedDetection?.date : null;
    // a selection that crosses families never fires onClose, so the
    // outgoing body takes its own map state down here
    if (shownBody && shownBody !== b) closeBody(shownBody);
    shownBody = b;
    current = p;
    selectedDetection = null;
    (b.show ?? seriesShow)(p, el, b, keep);
    document.activeElement?.blur();
}

const closeBody = b => (b.close ?? clearOverlays)();

export function onCardClose() {
    if (shownBody) closeBody(shownBody);
    shownBody = null;
    current = null;
    currentDets = [];
    selectedDetection = null;
}

// ── selection across re-renders ──

const rerender = fn => { skipAuto = true; fn(); skipAuto = false; };
const reopen = p => rerender(() => showDetail(featureOf(p), true, moved));

// a new quarter window: the card's own layer re-reads and reselect re-renders
// it once, forced, since its series is windowed even where the properties
// have not moved. rendering here as well drew the old numbers first
let moved = false;
export const refreshCard = () => { moved = true; };

// load-bearing: every refresh path ends here. a dot carries the numbers for
// the ticked quarters alone and an open card holds a copy, so re-open it on
// the rebuilt feature, or close it if it was filtered out of a viewport that
// reaches it (a #flare= card the first viewport never read stays open).
// only on the card's own layer: another's refresh says nothing about it, and
// before its own has landed (a permalink) it would close a card it holds
export function reselectCurrentFeature(id) {
    if (!current || shownBody?.source !== id) return;
    const features = map.getSource(shownBody.source)?._data?.features || [];
    // on the id as a string: an 11 m coordinate match once swapped two
    // sites' cards, and ids are VARCHAR everywhere
    const match = features
        .find(f => String(f.properties.id) === String(current.id));
    if (match) { reopen(match.properties); moved = false; }
    else if (map.getBounds().contains(coords(current))) closeDetail();
}

// ── the series card: information rows, chart, dated rows, actions ──

const pct = v => `${Math.round(v * 100)}%`;

// the feature carries the window's numbers, so nothing here recomputes a
// rate. "(clear)" only where a cloud mask says which passes were clear; a
// live site counts every detection it lists
const seriesStats = (p, b) => [
    ['Instrument', b.instrument],
    [p.observations == null || p.kind === 'live'
        ? 'Detections' : 'Detections (clear)',
        p.detection_count],
    ['Persistence', p.persistence != null ? pct(p.persistence) : '—'],
    [b.passLabel, p.passes ?? '—'],
    [p.passes && p.observations != null
        ? `Cloud-free (${pct(p.observations / p.passes)})`
        : 'Cloud-free obs.', p.observations ?? '—'],
].map(([k, v]) => `<dd-row><span>${k}</span><span>${v}</span></dd-row>`)
    .join('');

function seriesHtml(p, b) {
    const cfg = b.cfg;
    return `
        <div class="intensity-chart" id="intensity-chart"></div>
        <div class="events" style="--dd-cols:${cfg.cols}">
            <dd-row inset class="events-header"><span>Date</span>
                <span>${cfg.col2}</span><span>${cfg.col3}</span></dd-row>
            <div class="events-list" id="events-list"></div>
        </div>
        ${b.actions ? `<dd-btns class="panel-actions">${b.actions}</dd-btns>`
            : ''}`;
}

function seriesShow(p, el, b, keep) {
    greyCircles(true);
    dim(...coords(p));
    // the series is read per site on open, then windowed to the ticked
    // quarters; a failed read lists nothing rather than loading for good
    const qKeys = quarterKeys();
    el.querySelector('#events-list').innerHTML =
        '<div class="events-empty">Loading…</div>';
    b.fetch(p)
        .then(dets => dets.filter(d => dateInQuarters(d.date, qKeys)))
        .catch(err => (console.error('detection series:', err), []))
        .then(dets => { if (current === p) renderEvents(el, dets, b, keep); });
    b.wire?.(el);
    // a scroll down past the dated rows' end asks for older dates (an s2
    // site's history is read 90 days at a time). on a phone the card scrolls
    // and not the list, so either may be the one at its end
    const end = e => e.scrollTop + e.clientHeight >= e.scrollHeight - 1;
    const list = el.querySelector('#events-list'), more = () => b.more
        && end(list) && end(el.shadowRoot.querySelector('.box'))
        && b.more(p);
    // braced: an on-handler returning false cancels the scroll itself
    let y = 0;
    el.onwheel = e => { e.deltaY > 0 && more(); };
    el.ontouchstart = e => { y = e.touches[0].clientY; };
    el.ontouchmove = e => { e.touches[0].clientY < y - 30 && more(); };
}

function renderEvents(el, detections, b, keep) {
    currentDets = detections;
    const list = el.querySelector('#events-list');
    list.innerHTML = '';
    // the series comes oldest first; the list reads newest first
    const sorted = detections.toReversed();
    const dateToItem = new Map();
    let firstItem = null;

    for (const det of sorted) {
        const item = document.createElement('dd-row');
        item.className = 'event-item';
        item.toggleAttribute('selectable', true);
        item.dataset.date = det.date;
        item.innerHTML = `<span>${formatDate(det.date)}</span>`
            + `<span>${b.cfg.formatVal(det)}</span>`
            + `<span>${b.cfg.formatCount(det)}</span>`;
        item.onclick = () => selectDetection(det, item, b);
        list.appendChild(item);
        dateToItem.set(det.date, { det, item });
        firstItem ??= { det, item };
    }

    const chart = el.querySelector('#intensity-chart');
    renderChart(chart, detections, b.cfg, det => {
        const entry = dateToItem.get(det.date);
        if (entry) {
            selectDetection(entry.det, entry.item, b);
            entry.item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });

    // a phone has no room for a scroller in a scroller (ios will not hand
    // the gesture on): there the list runs whole and the card scrolls
    const rows = window.innerWidth <= 768 ? 0 : 10;
    const items = list.querySelectorAll('.event-item');
    if (items.length && !rows) list.style.maxHeight = '';
    else if (items.length) {
        const n = Math.min(items.length, rows);
        const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
        // unrounded, or the list scrolls by a fraction and clips the top row
        const h = items[0].getBoundingClientRect().height;
        list.style.maxHeight = `${Math.ceil(h * n + gap * (n - 1))}px`;
    } else {
        chart.innerHTML = '';
        list.innerHTML = '<div class="events-empty">No detections</div>';
    }

    const pick = dateToItem.get(keep) ?? firstItem;
    if (pick) selectDetection(pick.det, pick.item, b);
}

function selectDetection(det, item, b) {
    document.querySelectorAll('.event-item')
        .forEach(el => el.removeAttribute('active'));
    item.setAttribute('active', '');
    selectedDetection = det;
    b.select(det);
}
