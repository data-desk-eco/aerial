// the s3 hotspot body: the series card over the nights burnoff's service
// found (flaring/live.js's s3), as s2's fills in as they land: its card
// open reads its site's last 90 days, and a scroll past its rows' end 90
// more. a night is a hotspot of 500 m pixels at about 22:00 local, not a
// scene a link opens, so it draws the heat halo at the night's own place;
// its third column is planck's temperature, not MCM/d (render.js).

import { MODE } from '../flaring/render.js';
import { s3 } from '../flaring/live.js';
import { current, coords, siteTitle } from './index.js';
import { heatFootprint } from './overlays.js';

function footprint(det) {
    if (!det || !current) return;
    const [lon, lat] = coords(current), val = det.rh_mw || 0;
    heatFootprint({ lon: det.raw_lon ?? lon, lat: det.raw_lat ?? lat, val,
                    cfg: MODE.s3, radiusM: 50 * Math.sqrt(Math.max(val, 0.5)) });
}

export default {
    source: 's3',
    cfg: MODE.s3,
    instrument: 'S3',
    passLabel: 'Nights read',
    title: p => ({ ...siteTitle(p, 'Unknown facility'),
                   note: p.loading && 'Loading…' }),
    fetch: p => (s3.deepen(p.id), Promise.resolve(s3.series(p.id))),
    more: p => s3.older(p.id),
    select: footprint,
};
