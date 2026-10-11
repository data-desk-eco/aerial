// the osm outline of each industrial facility a flare or a plume can come
// from (data-desk/sites), drawn as an area: a thin solid border and an
// inset dash (pdf:67-68). the table holds 88,000 outlines, most of which no
// detection sits in, so it is read for the viewport and an outline is drawn
// only while a drawn detection is inside it or within REACH of its edge. it
// claims nothing about the detection; the reader sees what the flare or
// plume sits inside.

import { lines } from './vendor/dd/dd.js';
import { objects } from './shell/archive.js';
import { sql, from } from './shell/data.js';

const KIND = { refinery: 'Refinery', lng_terminal: 'LNG terminal',
    processing_plant: 'Gas processing plant', gas_terminal: 'Gas terminal',
    oil_terminal: 'Oil terminal', compressor_station: 'Compressor station',
    gas_storage: 'Gas storage', well_pad: 'Well pad',
    oil_gas_facility: 'Oil and gas facility',
    chemical_plant: 'Chemical plant', power_plant: 'Power plant',
    coal_mine: 'Coal mine', coal_terminal: 'Coal terminal',
    coke_plant: 'Coking plant', steel_plant: 'Steelworks',
    cement_plant: 'Cement plant', landfill: 'Landfill',
    wastewater_plant: 'Wastewater plant' };
// below this a refinery is a few pixels and the outlines are noise
export const SITE_ZOOM = 10;
// the layers whose points an outline must hold to be drawn
const HELD_BY = ['detections', 'vnf', 'plumes'];

// an invisible fill under the lines, so the label answers anywhere inside
export const SITE_LAYERS = [
    { id: 'sites-hit', type: 'fill', source: 'sites', minzoom: SITE_ZOOM,
      paint: { 'fill-color': '#000', 'fill-opacity': 0 },
      hover: ({ name, kind, operator: op }) => ({
          heading: name || KIND[kind],
          text: [KIND[kind], op !== name && op].filter(Boolean).join(' · '),
      }) },
    ...[['sites', lines.area()], ['sites-inset', lines.areaInset()]]
        .map(([id, l]) => ({ id, source: 'sites', minzoom: SITE_ZOOM,
                             ...l })),
];

// the outlines that touch the viewport, held in the engine as `site_view`
// until the next pan: the table is hilbert-ordered, so the box prunes to the
// row groups around it
export const holdSites = async ([w, s, e, n]) => sql(`
    CREATE OR REPLACE TABLE site_view AS SELECT id, kind, name, operator,
        geometry FROM ${await from(await objects('sites'))}
    WHERE xmin <= ${+e} AND xmax >= ${+w} AND ymin <= ${+n} AND ymax >= ${+s}`);

// the held outlines that hold a point the map is drawing: `shown(id)` is a
// layer's features as drawn, after the key's filters. the inset dash sits
// right of the stroke's direction, so inside a clockwise ring, which is how
// ST_Normalize winds an outer ring (and each hole the other way)
let epoch = 0;
export async function drawSites(map, shown) {
    if (map.getZoom() < SITE_ZOOM) return;
    const points = HELD_BY.flatMap(id => shown(id))
        .map(f => f.geometry?.coordinates).filter(Boolean);
    const e = ++epoch;
    const rows = points.length ? await sql(`
        SELECT id, kind, name, operator,
            ST_AsGeoJSON(ST_Normalize(geometry)) AS outline
        FROM site_view s WHERE EXISTS (SELECT 1 FROM (VALUES ${points.map(
            ([x, y]) => `(${+x}, ${+y})`)}) AS p(x, y)
            WHERE ST_Contains(s.geometry, ST_Point(p.x, p.y)))`)
        .catch(() => []) : [];   // no site_view yet: nothing to draw
    if (e === epoch) map.getSource('sites')?.setData({
        type: 'FeatureCollection', features: rows.map(
            ({ outline, ...properties }) => ({ type: 'Feature', properties,
                geometry: JSON.parse(outline) })) });
}
