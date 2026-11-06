// the map: maplibre on the dd dark basemap with a globe, markings loaded on
// demand, the graded satellite underlay and the mollweide worldmap.

import { style, mark, marks, imagery } from '../vendor/dd/dd.js';
import { drawWorldmap } from '../vendor/dd/worldmap.js';

// any `<name>-<#hex>` a layer names loads when maplibre asks for it, so
// layers need not wait; ensureMark preloads the ids only expressions name
export function createMap(opts = {}) {
    const map = new maplibregl.Map({ container: 'map', style, ...opts });
    map.on('style.load', () => map.setProjection({ type: 'globe' }));
    marks(map);
    return map;
}

export function ensureMark(map, id) {
    const [, name, color] = id.match(/^([a-z]+)-(#[0-9A-Fa-f]{6})$/) ?? [];
    if (name) mark(map, name, color).catch(() => {});
}

// a dd-label as an image `id`, its heading underlined over its text (pdf:73),
// set in the page's own inter as the shell's 11px text is: gl text takes
// only sdf glyphs, and the basemap serves no inter. drawn at the screen's
// pixel ratio, so it is as sharp
export async function ensureLabel(map, id, { heading = '', text = '',
        color = '#fff', weight = 370 }) {
    const r = devicePixelRatio || 1, lh = 13.3,
        font = `${weight} 11px Inter, sans-serif`;
    await document.fonts.load(font, heading + text).catch(() => {});
    if (map.hasImage(id)) return;
    const g = document.createElement('canvas').getContext('2d');
    g.font = font;
    const at = s => g.measureText(s).width, u = heading ? lh + 2 : 0;
    const w = Math.ceil(Math.max(at(heading), at(text)) * r) || 1,
        h = Math.ceil((u + (text ? lh : 0) + 1) * r);
    Object.assign(g.canvas, { width: w, height: h });
    g.scale(r, r);
    Object.assign(g, { font, fillStyle: color, textBaseline: 'top' });
    g.fillText(heading, 0, 1);
    if (heading) g.fillRect(0, lh + 1, at(heading), 1);
    g.fillText(text, 0, u + 1);
    map.addImage(id, g.getImageData(0, 0, w, h), { pixelRatio: r });
}

// the dd satellite underlay: esri, graded to the guidelines' gradient map
// (pdf:62), fading in over the basemap from z7.5
export const addSatellite = map => imagery(map, { id: 'satellite' });

// what the reader sees: the canvas less its padding, which the table drawer
// sets over the right of it
export function viewportBbox(map) {
    const { top, right, bottom, left } = map.getPadding(),
        c = map.getContainer(),
        sw = map.unproject([left, c.clientHeight - bottom]),
        ne = map.unproject([c.clientWidth - right, top]);
    return [sw.lng, sw.lat, ne.lng, ne.lat];
}

// the uncovered view's edge as lon/lat, n points a side: an edge point
// off the surface (space past the globe's horizon, or past mercator's
// poles) is pulled toward the middle until it lands, so the ring is the
// horizon where the view holds it. lons run on unwrapped, never jumping
export function viewOutline(map, n = 32) {
    const { top, right, bottom, left } = map.getPadding(),
        c = map.getContainer(), r = c.clientWidth - right,
        b = c.clientHeight - bottom, m = [(left + r) / 2, (top + b) / 2],
        at = ([x, y], t) => [m[0] + (x - m[0]) * t, m[1] + (y - m[1]) * t],
        on = p => { const q = map.project(map.unproject(p));
            return Math.hypot(q.x - p[0], q.y - p[1]) < 1; },
        side = (x0, y0, x1, y1) => Array.from({ length: n }, (_, i) =>
            [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
    let w;
    return [...side(left, top, r, top), ...side(r, top, r, b),
        ...side(r, b, left, b), ...side(left, b, left, top)].map(p => {
        let lo = 0, hi = 1;
        if (!on(p)) for (let i = 0; i < 16; i++)
            on(at(p, (lo + hi) / 2)) ? lo = (lo + hi) / 2 : hi = (lo + hi) / 2;
        const { lng, lat } = map.unproject(on(p) ? p : at(p, lo));
        w = w === undefined ? lng : w + ((lng - w + 540) % 360) - 180;
        return [w, lat];
    });
}

// mollweide, as vendor/dd/worldmap.js draws it: x in ±2√2, y in ±√2
const mollweide = (lon, lat) => {
    const f = Math.max(-89.9, Math.min(89.9, lat)) * Math.PI / 180;
    let t = f;
    for (let i = 0; i < 8; i++) t -= (2 * t + Math.sin(2 * t)
        - Math.PI * Math.sin(f)) / (2 + 2 * Math.cos(2 * t));
    return [2 * Math.SQRT2 / Math.PI * lon * Math.PI / 180 * Math.cos(t),
        -Math.SQRT2 * Math.sin(t)];
};

// the worldmap with the view's own outline on it (pdf:83), not a box, and
// what it holds lit: drawn a turn either way and clipped to the ellipse,
// so a view across the antimeridian closes as the view does. a view round
// a pole runs a whole turn, and its fill closes over the pole it holds
export function wireWorldmap(map, el) {
    const update = () => {
        const g = el.querySelector('.boxes'), o = viewOutline(map),
            [x, y] = o[0], t = o.at(-1)[0] - x,
            p = o.reduce((s, q) => s + q[1], 0) > 0 ? 90 : -90,
            ring = Math.abs(t) > 180 ? [...o, [x + Math.sign(t) * 360, y]]
                : [...o, o[0]],
            d = r => [-720, -360, 0, 360, 720].map(k => 'M' + r.map(([u, v]) =>
                mollweide(u + k, v).map(n => n.toFixed(3))).join('L')).join(''),
            at = (f, s) => '<path clip-path="url(#wm-clip)" fill="' + f
                + '" fill-opacity="0.2" stroke="' + s + '" stroke-width="1.25"'
                + ' vector-effect="non-scaling-stroke" d="';
        if (g) g.innerHTML = '<clipPath id="wm-clip"><ellipse rx="'
            + 2 * Math.SQRT2 + '" ry="' + Math.SQRT2 + '"/></clipPath>'
            + at('#FFFFFF', 'none') + d(Math.abs(t) > 180 ? [...ring,
                [ring.at(-1)[0], p], [x, p]] : ring) + '"/>'
            + at('none', '#FFFFFF') + d(ring) + '"/>';
    };
    drawWorldmap(el).then(update);
    for (const e of ['move', 'resize']) map.on(e, update);
}
