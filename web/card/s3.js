// the s3 hotspot body: the series card over the nights burnoff's service
// found (liveBody). a night is a hotspot of 500 m pixels at about 22:00
// local, not a scene a link opens: it draws a pixel a hotspot, as s2's
// pixels are drawn, centred on its place and on vnf's MW stops by its
// radiant heat (a saturated one, which has none, at the top); its third
// column is planck's temperature, not MCM/d (render.js).

import { MODE } from '../flaring/render.js';
import { s3 } from '../flaring/live.js';
import { liveBody } from './index.js';
import { pixelFootprint } from './overlays.js';

const top = MODE.s3.stops.at(-1);

export default {
    source: 's3',
    cfg: MODE.s3,
    instrument: 'S3',
    passLabel: 'Nights read',
    about: { title: 'Sentinel-3 hotspot', html: `
        <p>Heat detected in night-time Sentinel-3 imagery by Burnoff,
            using the SLSTR instrument. Aerial shows sites detected on at
            least two nights. The infrared pixels are 500 m across, so a
            hotspot's position does not identify an individual flare stack.</p>
        <p>Radiant heat is measured in megawatts. Temperature is estimated
            from the infrared signal using Planck's law.</p>
        <p>Persistence is the percentage of clear nights with a detection
            during the selected quarters. A night counts as clear when
            cloud cover is below 50%; at least 10 clear nights are required.</p>
        <p>Select a night to see the hotspot pixels, coloured by radiant
            heat.</p>
        <p><a href="https://github.com/data-desk-eco/burnoff/blob/main/METHOD.md#sentinel-3-night"
            target="_blank" rel="noopener">Burnoff detection method</a></p>` },
    ...liveBody(s3),
    select: det => det?.px && pixelFootprint({ px: det.px.map(([v, ...c]) =>
        [v ?? top, ...c]) }, MODE.s3),
};
