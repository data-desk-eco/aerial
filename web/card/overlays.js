// what a flaring card draws on the map: the markings greyed under it, and a
// heat halo at the selected detection's own point. neither family publishes
// a scene, so the halo is what a selected date draws, coloured and sized by
// intensity on the family's own scale.

import { sql } from '../shell/data.js';
import { degLat, degLon } from '../shell/util.js';
import { rampRGB, scaleT } from '../flaring/render.js';

const FOOTPRINT = 'detection-footprint';   // the layer id and its source
let map = null;
export const initOverlays = m => { map = m; };

// both flaring layers: imagery under one is imagery under the other
export function greyCircles(grey) {
    for (const id of ['detections', 'vnf'])
        if (map.getLayer(id))
            map.setPaintProperty(id, 'icon-opacity', grey ? 0.35 : 1);
}

function clearFootprint() {
    if (map.getLayer(FOOTPRINT)) map.removeLayer(FOOTPRINT);
    if (map.getSource(FOOTPRINT)) map.removeSource(FOOTPRINT);
}

export function clearOverlays() {
    clearFootprint();
    dim(false);
    greyCircles(false);
}

// a radial gradient, in under 'detections' so both families' markings stay
// above it
export function heatFootprint({ lon, lat, val, radiusM, cfg }) {
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
        paint: { 'raster-opacity': 1 } }, 'detections');
    greyCircles(true);
    dim(lon, lat);
}

// the imagery darkened while a card is open, bar the outline of the site the
// detection sits in, which stays lit: the world less that site, in sql. no
// site, no union, a null difference: nothing is darkened
const DIM = 'dim', REACH = 0.005;
let dimEpoch = 0;
export async function dim(lon, lat) {
    const e = ++dimEpoch;
    if (map.getLayer(DIM)) map.removeLayer(DIM);
    if (map.getSource(DIM)) map.removeSource(DIM);
    if (lon === false) return;
    const [{ g } = {}] = await sql(`SELECT ST_AsGeoJSON(ST_Difference(
        ST_MakeEnvelope(-180, -85, 180, 85), ST_Union_Agg(geometry))) AS g
        FROM site_view
        WHERE ST_DWithin(geometry, ST_Point(${+lon}, ${+lat}), ${REACH})`)
        .catch(() => []);   // no site_view yet: no site
    if (e !== dimEpoch || !g) return;
    map.addSource(DIM, { type: 'geojson', data: JSON.parse(g) });
    map.addLayer({ id: DIM, type: 'fill', source: DIM, minzoom: 7.5,
        paint: { 'fill-color': '#000', 'fill-opacity': 0.65 } },
        ['sites-hit', 'dd-plume-probability', 'plume-mask-image',
         'plume-mask-fill', FOOTPRINT, 'plumes'].find(l => map.getLayer(l)));
}
