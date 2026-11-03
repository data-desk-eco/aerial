// the s3 hotspot body: the series card over the nights burnoff's service
// found (flaring/live.js's s3), as s2's fills in as they land: its card
// open reads its site's last 90 days, and a scroll past its rows' end 90
// more. a night is a hotspot of 500 m pixels at about 22:00 local, not a
// scene a link opens: it draws a pixel a hotspot, as s2's pixels are drawn,
// centred on its place and on vnf's MW stops by its radiant heat (a
// saturated one, which has none, at the top); its third column is planck's
// temperature, not MCM/d (render.js).

import { MODE } from '../flaring/render.js';
import { s3 } from '../flaring/live.js';
import { siteTitle } from './index.js';
import { pixelFootprint } from './overlays.js';

const top = MODE.s3.stops.at(-1);

export default {
    source: 's3',
    cfg: MODE.s3,
    instrument: 'S3',
    passLabel: 'Nights read',
    about: { title: 'Sentinel-3 hotspot', html: `
        <p>A site where burnoff found heat in Sentinel-3's night-time
            infrared (SLSTR) on at least two nights. Sentinel-3 passes at
            about 22:00 local time, in 500 m pixels.</p>
        <p>Radiant heat is in megawatts, on the scale VIIRS Nightfire uses;
            temperature is from a Planck fit. Persistence is the share of
            clear nights with a detection in the ticked quarters.</p>
        <p>A flare is tens of metres across, so a selected night draws one
            pixel at the hotspot's corrected place, coloured by its radiant
            heat.</p>` },
    title: p => ({ ...siteTitle(p, 'Unknown facility'),
                   note: p.loading && 'Loading…' }),
    fetch: p => (s3.deepen(p.id), Promise.resolve(s3.series(p.id))),
    more: p => s3.older(p.id),
    select: det => det?.px && pixelFootprint({ px: det.px.map(([v, ...c]) =>
        [v ?? top, ...c]) }, MODE.s3),
};
