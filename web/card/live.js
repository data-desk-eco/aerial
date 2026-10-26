// a live site: the s2 body over the dates this browser's own reads found
// (flaring/live.js), so the card fills in as they land

import flare from './flare.js';
import { series } from '../flaring/live.js';

export default { ...flare, source: 'live', instrument: 'S2 (live)',
    fetch: p => Promise.resolve(series(p.id)) };
