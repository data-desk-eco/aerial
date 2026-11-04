// the map: maplibre on the dd dark basemap with a globe, markings loaded on
// demand, the graded satellite underlay and the mollweide worldmap.

import { style, mark, marks, imagery } from '../vendor/dd/dd.js';
import { drawWorldmap, setBoxes } from '../vendor/dd/worldmap.js';

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
    const r = devicePixelRatio || 1, font = `${weight} 11px Inter`, lh = 13.3;
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

// the worldmap with the view's true extent as its box (pdf:83): getBounds
// follows the globe's horizon, where an off-globe corner unprojects to
// nonsense, and a box across the antimeridian is split in two. no minimum:
// a deep zoom is a dot
export function wireWorldmap(map, el) {
    const update = () => {
        const [[w, s], [e, n]] = map.getBounds().toArray(),
            a = ((w + 180) % 360 + 360) % 360 - 180, b = a + e - w;
        setBoxes(el, e - w >= 360 ? [[-180, s, 180, n]]
            : b > 180 ? [[a, s, 180, n], [-180, s, b - 360, n]]
            : [[a, s, b, n]], 0);
    };
    drawWorldmap(el).then(update);
    map.on('move', update).on('resize', update);
}
