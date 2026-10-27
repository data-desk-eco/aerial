// what a flaring card draws on the map: the markings greyed under it, and a
// heat halo at the selected detection's own point. neither family publishes
// a scene, so the halo is what a selected date draws, coloured and sized by
// intensity on the family's own scale.

import { sql } from '../shell/data.js';
import { degLat, degLon } from '../shell/util.js';
import { rampRGB, scaleT } from '../flaring/render.js';
import { RAMP, DD } from '../layers.js';

const FOOTPRINT = 'detection-footprint';   // the layer id and its source
const PIXELS = 'detection-pixels';         // the source, and its layers' stem
const UNDER = 'live';   // the lowest flaring layer, which overlays sit under
let map = null;
export const initOverlays = m => { map = m; };

// both flaring layers: imagery under one is imagery under the other
export function greyCircles(grey) {
    for (const id of ['live', 'vnf', 'live-tag', 'vnf-tag'])
        if (map.getLayer(id))
            map.setPaintProperty(id, 'icon-opacity', grey ? 0.35 : 1);
}

function clearFootprint() {
    for (const l of [FOOTPRINT, `${PIXELS}-fill`, `${PIXELS}-line`])
        if (map.getLayer(l)) map.removeLayer(l);
    for (const s of [FOOTPRINT, PIXELS])
        if (map.getSource(s)) map.removeSource(s);
}

export function clearOverlays() {
    clearFootprint();
    dim(false);
    greyCircles(false);
}

// a radial gradient, in under UNDER so both families' markings stay
// above it. the same one again, as a re-rendered card asks, is left as it is
let halo = null;
export function heatFootprint({ lon, lat, val, radiusM, cfg }) {
    const k = [lon, lat, val, radiusM].join();
    if (k === halo && map.getLayer(FOOTPRINT)) return;
    halo = k;
    clearFootprint();
    if (!(val > 0)) return;
    const size = 128, half = size / 2;
    const canvas = Object.assign(document.createElement('canvas'),
        { width: size, height: size });
    const ctx = canvas.getContext('2d');
    const [r, g, b] = rampRGB(scaleT(cfg, val));
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    for (const [stop, alpha] of [[0, 0.85], [0.3, 0.5], [0.7, 0.15], [1, 0]])
        grad.addColorStop(stop, `rgba(${r},${g},${b},${alpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const dLat = degLat(radiusM), dLon = degLon(radiusM, lat);
    map.addSource(FOOTPRINT, { type: 'image', url: canvas.toDataURL(),
        coordinates: [[lon - dLon, lat + dLat], [lon + dLon, lat + dLat],
                      [lon + dLon, lat - dLat], [lon - dLon, lat - dLat]] });
    map.addLayer({ id: FOOTPRINT, type: 'raster', source: FOOTPRINT,
        paint: { 'raster-opacity': 1 } }, UNDER);
    greyCircles(true);
}

// a live detection's own pixels, drawn as the plume mask draws a plume: each
// pixel filled on the family's ramp by its own b12, and a hairline round
// them all, along the edges no two of them share. px is [b12, then each
// corner's lon and lat]
export function pixelFootprint({ px }, cfg) {
    const k = JSON.stringify(px);
    if (k === halo && map.getLayer(`${PIXELS}-fill`)) return;
    halo = k;
    clearFootprint();
    const corner = (c, i) => [c[2 * (i % 4)], c[2 * (i % 4) + 1]];
    const edges = new Map();
    for (const [, ...c] of px)
        for (let i = 0; i < 4; i++) {
            const e = [corner(c, i), corner(c, i + 1)];
            const key = e.map(String).sort().join();
            edges.set(key, edges.has(key) ? null : e);
        }
    const [lo, mid, hi] = cfg.stops;
    map.addSource(PIXELS, { type: 'geojson', data: { type:
        'FeatureCollection', features: [...px.map(([v, ...c]) => ({
            type: 'Feature', properties: { v }, geometry: { type: 'Polygon',
                coordinates: [[0, 1, 2, 3, 0].map(i => corner(c, i))] } })),
        { type: 'Feature', properties: {}, geometry: { type:
            'MultiLineString', coordinates: [...edges.values()]
                .filter(Boolean) } }] } });
    map.addLayer({ id: `${PIXELS}-fill`, type: 'fill', source: PIXELS,
        filter: ['has', 'v'], paint: { 'fill-opacity': 0.5,
            'fill-color': ['interpolate', ['linear'], ['get', 'v'],
                lo, RAMP[0], mid, RAMP[1], hi, RAMP[2]] } }, UNDER);
    map.addLayer({ id: `${PIXELS}-line`, type: 'line', source: PIXELS,
        filter: ['!', ['has', 'v']], paint: { 'line-color': DD.white,
            'line-width': 1, 'line-opacity': 0.8 } }, UNDER);
    greyCircles(true);
}

// the imagery darkened while a card is open, bar the outline of the site the
// detection sits in, which stays lit: the world less that site, in sql. no
// site, no row: nothing is darkened. a new outline replaces the old in
// place: taking the layer down while the statement ran flashed the map. a
// hotspot card dims around the site, not each date's own point, which near
// REACH lit some dates and darkened others; and a failed statement (the
// outlines are re-read after a pan) leaves the dim as it was
const DIM = 'dim', REACH = 0.005;
let dimEpoch = 0, dimmed = null;
export async function dim(lon, lat) {
    const e = ++dimEpoch;
    const [{ g } = {}] = lon === false ? [] : await sql(`SELECT
        ST_AsGeoJSON(ST_Difference(ST_MakeEnvelope(-180, -85, 180, 85),
            ST_Union_Agg(geometry))) AS g
        FROM site_view
        WHERE ST_DWithin(geometry, ST_Point(${+lon}, ${+lat}), ${REACH})
        HAVING count(*) > 0`).catch(() => [{ g: dimmed }]);
    if (e !== dimEpoch || g === dimmed) return;
    dimmed = g;
    if (!g) {
        if (map.getLayer(DIM)) map.removeLayer(DIM);
        if (map.getSource(DIM)) map.removeSource(DIM);
    } else if (map.getSource(DIM)) map.getSource(DIM).setData(JSON.parse(g));
    else {
        map.addSource(DIM, { type: 'geojson', data: JSON.parse(g) });
        map.addLayer({ id: DIM, type: 'fill', source: DIM, minzoom: 7.5,
            paint: { 'fill-color': '#000', 'fill-opacity': 0.65 } },
            ['sites-hit', 'dd-plume-probability', 'plume-mask-image',
             'plume-mask-fill', FOOTPRINT, 'plumes']
                .find(l => map.getLayer(l)));
    }
}
