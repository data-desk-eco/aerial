// the s2 hotspot body: the series card over the dates this browser's own
// reads found (flaring/live.js), so it fills in as they land, its title
// saying Loading… until every scene it can has looked at the site (its card
// open, live.js deepen() reads its last 90 days, and a scroll past its
// rows' end 90 more, older()). a
// date draws the pixels the detector found; and only this family has the
// copernicus scene for the selected date, and a csv of the series listed.

import { MODE } from '../flaring/render.js';
import { series, deepen, older } from '../flaring/live.js';
import { map, current, currentDets, selectedDetection, coords, siteTitle }
    from './index.js';
import { pixelFootprint } from './overlays.js';

// the scene itself is one link away, at the day and the place the card is on
function copernicusUrl(date) {
    const { lat, lng } = map.getCenter();
    // maplibre's 512px tiles sit a zoom below copernicus's 256px ones
    const zoom = Math.round(map.getZoom()) + 1;
    return 'https://browser.dataspace.copernicus.eu/?' + new URLSearchParams({
        zoom, lat, lng, datasetId: 'S2_L2A_CDAS', layerId: '6-SWIR',
        fromTime: `${date}T00:00:00.000Z`, toTime: `${date}T23:59:59.999Z`,
        upsampling: 'NEAREST', downsampling: 'NEAREST', dateMode: 'SINGLE',
    });
}

const CSV_COLS = ['facility', 'terminal', 'lat', 'lon', 'date', 'max_b12',
                  'pixels', 'persistence', 'passes', 'observations'];

// the rows the card is listing: a site carries no dates of its own
function downloadCSV() {
    if (!current) return;
    const p = current, [lon, lat] = coords(p);
    const quote = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const fixed = (v, d) => v == null ? '' : Number(v).toFixed(d);
    const rows = currentDets.map(det => [
        quote(p.name), quote(p.terminal),
        fixed(det.raw_lat ?? lat, 6), fixed(det.raw_lon ?? lon, 6),
        det.date, fixed(det.max_b12, 4), det.pixels ?? '',
        fixed(p.persistence, 4), p.passes ?? '', p.observations ?? '',
    ]);
    const csv = [CSV_COLS, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    // the site's id, its colon (no filename takes one) as _
    a.download = `${p.id.replace(/[:/\\]/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

export default {
    source: 'live',
    cfg: MODE.s2,
    instrument: 'S2',
    passLabel: 'Passes',
    title: p => ({ ...siteTitle(p, 'Unknown facility'),
                   note: p.loading && 'Loading…' }),
    fetch: p => (deepen(p.id), Promise.resolve(series(p.id))),
    more: p => older(p.id),
    select: det => det && pixelFootprint(det, MODE.s2),
    actions: `<dd-btn id="open-image-btn">Open image</dd-btn>
              <dd-btn id="download-btn">Download CSV</dd-btn>`,
    wire(el) {
        const on = (id, fn) => el.querySelector(id)
            .addEventListener('click', fn);
        on('#download-btn', downloadCSV);
        on('#open-image-btn', () => selectedDetection && window.open(
            copernicusUrl(selectedDetection.date), '_blank'));
    },
};
