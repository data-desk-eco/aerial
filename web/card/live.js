// a live site: the s2 body over the dates this browser's own reads found
// (flaring/live.js), so the card fills in as they land. a date draws the
// pixels the detector found, where the archive's draw a halo. until every
// scene of the year has looked at the site, its title says it is loading

import flare from './flare.js';
import { series } from '../flaring/live.js';
import { pixelFootprint } from './overlays.js';
import { MODE } from '../flaring/render.js';

export default { ...flare, source: 'live', instrument: 'S2',
    title: p => ({ ...flare.title(p), note: p.loading && 'Loading…' }),
    fetch: p => Promise.resolve(series(p.id)),
    select: det => det?.px ? pixelFootprint(det, MODE.s2) : flare.select(det) };
