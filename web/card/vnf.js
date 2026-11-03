// the vnf flare body: the series card over eog/detections, on radiant heat.
// a nightfire look is a point, not a scene, so a selected night draws the
// heat halo alone; no image, and no csv (the series is eog's to publish).

import { MODE } from '../flaring/render.js';
import { vnfSeries } from '../flaring/flares.js';
import { current, coords, siteTitle } from './index.js';
import { heatFootprint } from './overlays.js';

function footprint(det) {
    if (!det || !current) return;
    const [lon, lat] = coords(current);
    const val = det.rh_mw || 0;
    heatFootprint({ lon, lat, val, cfg: MODE.vnf,
                    radiusM: 50 * Math.sqrt(Math.max(val, 0.5)) });
}

export default {
    source: 'vnf',
    cfg: MODE.vnf,
    instrument: 'VNF',
    passLabel: 'Nights read',
    about: { title: 'VIIRS Nightfire', html: `
        <p>A flaring site from the Earth Observation Group's VIIRS Nightfire
            catalogue, built from the VIIRS instrument's night-time
            detections.</p>
        <p>Radiant heat is in megawatts. Flared volume, in million cubic
            metres a day, is estimated from it with JZ-RH (Zhizhin et al.
            2025). Persistence is the share of cloud-free nights with a
            detection in the ticked quarters; where too few nights were
            seen, no rate is given.</p>
        <p>A selected night draws a halo at the site, sized and coloured by
            its radiant heat.</p>` },
    title: p => siteTitle(p, `Hotspot #${p.id}`),
    fetch: vnfSeries,
    select: footprint,
};
