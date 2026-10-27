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

// a label as an image `tag-<text>`, set in the page's own inter as the
// shell's 11px text is: gl text takes only sdf glyphs, and the basemap
// serves no inter. drawn at the screen's pixel ratio, so it is as sharp
export async function ensureTag(map, text, color) {
    const id = `tag-${text}`, r = devicePixelRatio || 1;
    const font = '300 11px Inter';
    await document.fonts.load(font, text).catch(() => {});
    const g = document.createElement('canvas').getContext('2d');
    g.font = font;
    const w = Math.ceil(g.measureText(text).width * r), h = Math.ceil(14 * r);
    Object.assign(g.canvas, { width: w, height: h });
    g.scale(r, r);
    Object.assign(g, { font, fillStyle: color, textBaseline: 'top' });
    g.fillText(text, 0, 1);
    if (!map.hasImage(id))
        map.addImage(id, g.getImageData(0, 0, w, h), { pixelRatio: r });
}

// the dd satellite underlay: esri, graded to the guidelines' gradient map
// (pdf:62), fading in over the basemap from z7.5
export const addSatellite = map => imagery(map, { id: 'satellite' });

export function viewportBbox(map) {
    const b = map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

// the worldmap with the live viewport as its box (pdf:83)
export function wireWorldmap(map, el) {
    const update = () => setBoxes(el, [viewportBbox(map)]);
    drawWorldmap(el).then(update);
    map.on('move', update);
}

// the worldmap with points: d is an svg path of zero-length segments in its
// own mollweide units, each drawn a pixel square
export const pointsWorldmap = (el, d) => drawWorldmap(el).then(() =>
    el.insertAdjacentHTML('beforeend', `<path d="${d}" fill="none"
        stroke="#FFFFFF" stroke-width="1" stroke-linecap="square"
        vector-effect="non-scaling-stroke"/>`));
