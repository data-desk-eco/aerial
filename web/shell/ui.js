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

// a line at the map's top right saying what is still being read: the newest
// read's, and an update keeps its place. on a slow line an empty map and a
// loading one look the same. status(k) takes read k down, and the start
// goes once the first reads settle. a line with a share done, p, draws it
// as a bar beneath
const lines = new Map([['start', ['Loading the engine and archive']]]);
export function status(k, text, p) {
    text ? lines.set(k, [text, p]) : lines.delete(k);
    const el = document.getElementById('status'), [t, q] =
        [...lines.values()].at(-1) ?? [''];
    if (el) el.textContent = t, el.style.setProperty('--p', q ?? 0);
}
export const loaded = () => status('start');

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
        <span slot="subtitle">${escapeHtml(config.subtitle || '')}</span>
        <svg id="worldmap"></svg>
        ${config.search ? SEARCH : ''}
        ${config.quarters ? QUARTERS : ''}
    </dd-panel>

    <div class="fx-status" id="status">${
        escapeHtml(lines.get('start'))}</div>

    <dd-key class="fx-key" id="key-panel"></dd-key>

    <dd-panel class="fx-detail" id="detail" collapsible></dd-panel>

    ${logo}

    <div class="fx-modal hidden" id="modal">${config.about ? `
        <dd-panel intro class="fx-modal-content" id="intro">
            <span slot="title">${title}${badge}</span>
            ${config.about}
            <dd-btn data-close>Enter</dd-btn>
        </dd-panel>` : ''}
        <dd-panel intro class="fx-modal-content" id="about-card"></dd-panel>
    </div>`);
    wireModal();
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
    const key = els[1];
    const even = () => {
        // collapsed, the key keeps its expanded width: measured open
        const c = key.hasAttribute('collapsed');
        key.style.width = '';
        key.removeAttribute('collapsed');
        const w = key.getBoundingClientRect().width;
        if (c) key.setAttribute('collapsed', '');
        if (c) key.style.width = `${w}px`;
        for (const e of els) e.style.height = '';
        if (!PHONE.matches || !els.every(e => e.hasAttribute('collapsed')))
            return;
        const h = Math.max(...els.map(e => e.getBoundingClientRect().height));
        for (const e of els) e.style.height = `${h}px`;
    };
    for (const e of els) e.addEventListener('toggle', even);
    PHONE.addEventListener('change', even);
    addEventListener('resize', even);
    document.fonts.ready.then(even);
    key.addEventListener('fx-rendered', even);
}

// one modal at a time, a panel of #modal: its overlay, escape or a
// [data-close] dismisses it. it opens out of the ⓘ on the panel that raised
// it and shuts back into it, so the reader sees what brings it back
const MOTION = matchMedia('(prefers-reduced-motion: reduce)');
let from = null, onShut = null;
function fly(m, shut) {
    const p = [...m.children].find(c => !c.hidden),
        i = from?.shadowRoot?.querySelector('.info');
    if (!p || !i?.offsetWidth || MOTION.matches) return Promise.resolve();
    const a = p.getBoundingClientRect(), b = i.getBoundingClientRect();
    const to = `translate(${b.x + b.width / 2 - a.x - a.width / 2}px, ${
        b.y + b.height / 2 - a.y - a.height / 2}px) scale(${
        b.width / a.width})`;
    return p.animate([{}, { transform: to, opacity: 0 }], { duration: 350,
        easing: 'cubic-bezier(.4, 0, .2, 1)', direction: shut ? 'normal'
        : 'reverse' }).finished.catch(() => {});
}
// `panel` the one to show, `origin` the panel whose ⓘ it flies out of and
// back to, `shut` called when it is dismissed; `still` opens it in place
export function openModal(panel, origin, { shut, still } = {}) {
    const m = document.getElementById('modal');
    for (const c of m.children) c.hidden = c !== panel;
    [from, onShut] = [origin, shut];
    m.classList.remove('hidden');
    if (!still) fly(m);
}
async function closeModal() {
    const m = document.getElementById('modal');
    if (m.classList.contains('hidden') || m.hasAttribute('leaving')) return;
    // the panels come back as it leaves, so it has an ⓘ to fly to
    m.setAttribute('leaving', '');
    onShut?.();
    await fly(m, true);
    m.classList.add('hidden');
    m.removeAttribute('leaving');
}
function wireModal() {
    const m = document.getElementById('modal');
    m.addEventListener('click', e => (e.target === m
        || e.target.closest('[data-close]')) && closeModal());
    // before the card's own escape, which would shut it too
    addEventListener('keydown', e => {
        if (e.key !== 'Escape' || m.classList.contains('hidden')) return;
        e.stopImmediatePropagation();
        closeModal();
    }, true);
}

// enter or the overlay dismisses it, remembered per title (one origin serves
// several maps); ⓘ reopens it (pdf:82)
function wireIntro(title) {
    const intro = document.getElementById('intro'),
        main = document.getElementById('main-panel'),
        seen = `fx-entered:${title}`;
    const open = still => openModal(intro, main,
        { still, shut: () => localStorage.setItem(seen, '1') });
    main.addEventListener('info', () => open());
    if (!localStorage.getItem(seen)) open(true);
}

// ── the key ──

// sections: [{label, choice, rows: [{swatch: {mark, color}, label, toggle:
// id | [ids], pred}]}]. a `toggle` row switches layers; `pred` rows are a
// multi-select per section, active rows ORed into the filter (all on is no
// filter). `choice` ({value, options: [[value, label]], onChange}) heads the
// section's rows with a dd-toggle, one of its options at a time, for an app
// that draws one of two instruments in a section's place. the key element
// collapses itself; set() re-renders.
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
    const choiceHtml = (c, si) => c ? `<dd-toggle class="fx-choice"
        data-section="${si}" value="${escapeHtml(c.value)}">${c.options.map(
        ([v, label]) => `<button value="${escapeHtml(v)}">${
        escapeHtml(label)}</button>`).join('')}</dd-toggle>` : '';
    const render = () => {
        el.innerHTML = sections.map((s, si) => `<dd-key-group label="${
            escapeHtml(s.label)}">${choiceHtml(s.choice, si)}${s.rows.map(
            (r, ri) => rowHtml(r, si, ri)).join('')}</dd-key-group>`).join('');
    };

    // a choice is the app's to act on: it sets the key anew
    el.addEventListener('change', e => {
        const t = e.target.closest('.fx-choice');
        if (t) sections[+t.dataset.section].choice.onChange(t.value);
    });

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
        set: s => { sections = s; render();
            el.dispatchEvent(new Event('fx-rendered')); },
        preds: () => sections.flatMap(s => {
            const rows = s.rows.filter(r => r.pred);
            return rows.some(r => r.off) ? [p => rows.some(r =>
                !r.off && r.pred(p)) || rows.every(r => r.pred(p))] : [];
        }),
    };
}
