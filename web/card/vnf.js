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
        <p>Gas flaring detected at night by VIIRS and recorded in the Earth
            Observation Group's Nightfire catalogue.</p>
        <p>Radiant heat measures the energy emitted by the flare, in
            megawatts. Flared volume is estimated from radiant heat using
            the JZ-RH method (Zhizhin et al. 2025), in million cubic metres
            per day.</p>
        <p>Persistence is the percentage of cloud-free nights with a
            detection during the selected quarters. It is left blank when
            observation coverage is insufficient.</p>
        <p>Select a night to show a circle at the site. Its size and colour
            indicate radiant heat, not the physical size of the flare.</p>` },
    title: p => siteTitle(p, `Hotspot #${p.id}`),
    fetch: vnfSeries,
    select: footprint,
};
