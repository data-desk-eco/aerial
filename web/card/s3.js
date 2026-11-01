// the s3 flare body: the series card over data-desk-s3/detections, on
// radiant heat, as vnf's. an slstr look is a 500 m hotspot at about 22:00
// local, not a scene a link opens, so a selected night draws the heat halo
// alone; its third column is the hotspot's planck temperature.

import { MODE } from '../flaring/render.js';
import { s3Series } from '../flaring/flares.js';
import { current, coords, siteTitle } from './index.js';
import { heatFootprint } from './overlays.js';

function footprint(det) {
    if (!det || !current) return;
    const [lon, lat] = coords(current);
    const val = det.rh_mw || 0;
    heatFootprint({ lon, lat, val, cfg: MODE.s3,
                    radiusM: 50 * Math.sqrt(Math.max(val, 0.5)) });
}

export default {
    source: 's3',
    cfg: MODE.s3,
    instrument: 'S3',
    passLabel: 'Nights read',
    title: p => siteTitle(p, 'S3 flare'),
    fetch: s3Series,
    select: footprint,
};
