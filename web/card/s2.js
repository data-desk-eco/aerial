// the s2 hotspot body: the series card over the dates burnoff's service
// found (liveBody). a date draws the pixels the detector found; and only
// this family has the copernicus scene for the selected date, and a csv of
// the series listed.

import { MODE } from '../flaring/render.js';
import { s2 } from '../flaring/live.js';
import { map, current, currentDets, selectedDetection, coords, liveBody }
    from './index.js';
import { pixelFootprint } from './overlays.js';
import { fmtCoords } from '../shell/util.js';

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

const CSV_COLS = ['lat', 'lon', 'date', 'max_b12',
                  'pixels', 'persistence', 'passes', 'observations'];

// the rows the card is listing: a site carries no dates of its own
function downloadCSV() {
    if (!current) return;
    const p = current, [lon, lat] = coords(p);
    const fixed = (v, d) => v == null ? '' : Number(v).toFixed(d);
    const rows = currentDets.map(det => [
        fixed(det.raw_lat ?? lat, 6), fixed(det.raw_lon ?? lon, 6),
        det.date, fixed(det.max_b12, 4), det.pixels ?? '',
        fixed(p.persistence, 4), p.passes ?? '', p.observations ?? '',
    ]);
    const csv = [CSV_COLS, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    // the site's place, as the card's title gives it
    a.download = `${fmtCoords(lat, lon).replace(/°|,/g, '')
        .replace(' ', '_')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

export default {
    source: 's2',
    cfg: MODE.s2,
    instrument: 'S2',
    passLabel: 'Passes',
    about: { title: 'Sentinel-2 hotspot', html: `
        <p>Heat detected in daytime Sentinel-2 imagery by Burnoff. The
            infrared bands used here have 20 m pixels. Aerial shows sites
            detected on at least two dates and excludes summer-only
            detections to reduce false positives from reflected sunlight.</p>
        <p>Intensity is the brightest pixel's value in the B12 shortwave
            infrared band. It is not a measurement of gas volume.</p>
        <p>Persistence is the percentage of clear passes with a detection
            during the selected quarters. A pass counts as clear when cloud
            cover is below 60%; at least 10 clear passes are required.</p>
        <p>Select a date to see the detected pixels on the map. Open image
            shows the satellite scene in Copernicus Browser.</p>
        <p><a href="https://github.com/data-desk-eco/burnoff/blob/main/METHOD.md#sentinel-2-day"
            target="_blank" rel="noopener">Burnoff detection method</a></p>` },
    ...liveBody(s2),
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
