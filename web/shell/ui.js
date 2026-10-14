// the dom from config, on the dd elements: the main panel (title, worldmap,
// search, quarters), the key, the detail panel, the intro and the
// logo. the elements own the chrome; this places them and fills them.

import '../vendor/dd/dd.js';
import { escapeHtml } from './util.js';

export const logo = '<dd-logo class="fx-logo" '
    + 'href="https://research.datadesk.eco/"></dd-logo>';

const SEARCH = `<input type="search" class="fx-search" id="search"
    placeholder="Address or lat, lon" spellcheck="false" autocomplete="off">`;
const QUARTERS = `<div class="fx-quarters" id="quarters"></div>`;

// the subtitle says the first reads are still out, and the app takes it
// down (ctx.loaded()) once they settle: on a slow line an empty map and a
// loading one look the same, and the subtitle shows contracted too
export const loaded = () => document.getElementById('loading')?.remove();

export function buildShell(config) {
    const title = escapeHtml(config.title);
    // on the panel heading too, so it outlives the intro
    const badge = config.badge ? ` <span class="fx-badge">${
        escapeHtml(config.badge)}</span>` : '';
    document.body.insertAdjacentHTML('afterbegin', `
    <div id="map"></div>

    <dd-panel class="fx-main" id="main-panel" collapsible${
        config.about ? ' info' : ''}>
        <span slot="title">${title}${badge}</span>
        <span slot="subtitle">${escapeHtml(config.subtitle || '')}<span
            class="fx-secondary" id="loading"> Loading…</span></span>
        <svg id="worldmap"></svg>
        ${config.search ? SEARCH : ''}
        ${config.quarters ? QUARTERS : ''}
    </dd-panel>

    <dd-key class="fx-key" id="key-panel"></dd-key>

    <dd-panel class="fx-detail" id="detail" collapsible></dd-panel>

    ${logo}

    ${config.about ? `
    <div class="fx-modal" id="about-modal">
        <dd-panel intro class="fx-modal-content">
            <span slot="title">${title}${badge}</span>
            ${config.about}
            <dd-btn id="enter-btn">Enter</dd-btn>
        </dd-panel>
    </div>` : ''}`);
    if (config.about) wireIntro(config.title || '');
    evenTops();
}

// on a phone the main panel and the key sit side by side at the top, and
// contracted they come out a pixel or two apart, the taller one depending on
// how the engine rounds a line. measured, not computed: both take the taller
const PHONE = matchMedia('(max-width: 768px)');
function evenTops() {
    const els = ['main-panel', 'key-panel'].map(id =>
        document.getElementById(id));
    const even = () => {
        for (const e of els) e.style.height = '';
        if (!PHONE.matches || !els.every(e => e.hasAttribute('collapsed')))
            return;
        const h = Math.max(...els.map(e => e.getBoundingClientRect().height));
        for (const e of els) e.style.height = `${h}px`;
    };
    for (const e of els) e.addEventListener('toggle', even);
    PHONE.addEventListener('change', even);
    document.fonts.ready.then(even);
}

// enter or the overlay dismisses it, remembered per title (one origin serves
// several maps); ⓘ reopens it (pdf:82)
function wireIntro(title) {
    const modal = document.getElementById('about-modal');
    const seen = `fx-entered:${title}`;
    const dismiss = () => {
        modal.classList.add('hidden');
        localStorage.setItem(seen, '1');
    };
    modal.addEventListener('click', e => e.target === modal && dismiss());
    document.getElementById('enter-btn').addEventListener('click', dismiss);
    document.getElementById('main-panel')
        .addEventListener('info', () => modal.classList.remove('hidden'));
    if (localStorage.getItem(seen)) modal.classList.add('hidden');
}

// ── the key ──

// sections: [{label, rows: [{swatch: {mark, color}, label, toggle: id |
// [ids], pred}]}]. a `toggle` row switches layers; `pred` rows are a
// multi-select per section, active rows ORed into the filter (all on is no
// filter). the key element collapses itself; set() re-renders.
//
// a section's rows partition one family, and a row is no statement about a
// feature outside it — so a feature every row admits is outside the section,
// and survives the whole section going off. that is how one key filters a map
// of several sources.
export function initKey(map, onFilter) {
    let sections = [];
    const el = document.getElementById('key-panel');
    const visible = id => map.getLayoutProperty(id, 'visibility') !== 'none';
    const rowHtml = (r, si, ri) => {
        const ids = [].concat(r.toggle || []), s = r.swatch || {};
        const on = r.pred ? !r.off : !ids.length || visible(ids[0]);
        return `<dd-key-row mark="${s.mark || ''}" color="${s.color || ''}"${
            on ? '' : ' inactive'}${ids.length || r.pred ? ' class="fx-toggle"'
            : ''}${ids.length ? ` data-layers="${ids.join(' ')}"` : ''}${
            r.pred ? ` data-row="${si}.${ri}"` : ''}>${
            escapeHtml(r.label)}</dd-key-row>`;
    };
    const render = () => {
        el.innerHTML = sections.map((s, si) => `<dd-key-group label="${
            escapeHtml(s.label)}">${s.rows.map((r, ri) => rowHtml(r, si, ri))
            .join('')}</dd-key-group>`).join('');
    };

    el.addEventListener('click', e => {
        const t = e.target.closest('.fx-toggle');
        if (t?.dataset.row) {
            const [si, ri] = t.dataset.row.split('.').map(Number);
            const r = sections[si].rows[ri];
            r.off = !r.off;
            onFilter?.();
        } else if (t) {
            const ids = t.dataset.layers.split(' ');
            const to = visible(ids[0]) ? 'none' : 'visible';
            for (const id of ids) map.setLayoutProperty(id, 'visibility', to);
        } else return;
        render();
    });

    // groups side by side where the stack would not clear the main panel
    // (ruling 2026-07-08): four stacked are 465px tall
    const wide = matchMedia('(max-height: 1040px) and (min-width: 769px)');
    const flow = () => el.toggleAttribute('row', wide.matches);
    wide.addEventListener('change', flow);
    flow();

    return {
        set: s => { sections = s; render(); },
        preds: () => sections.flatMap(s => {
            const rows = s.rows.filter(r => r.pred);
            return rows.some(r => r.off) ? [p => rows.some(r =>
                !r.off && r.pred(p)) || rows.every(r => r.pred(p))] : [];
        }),
    };
}
