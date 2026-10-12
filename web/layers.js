// marking, ramp and colour policy for every layer, in one home so no layer
// quietly spends colour on something else. shape categorises — whether a
// feature burned or leaked — and colour is measurement alone, never provider
// or category (pdf:71, 75, 76).
//
// one ramp, the guidelines' intensity ramp, red -> orange -> white, each
// family on its own stops: b12 reflectance, radiant heat and a plume's rate
// are different numbers, so the key gives each its units, and shape says
// which is which — the flare marking burned, the diamond leaked.

import { palette } from './vendor/dd/dd.js';

export const DD = palette;
export const RAMP = [DD.red, DD.orange, DD.white];   // low → high intensity

// `mark` stepped through `colors` at `breaks`, one more colour than break
const stepIcon = (mark, value, breaks, colors) =>
    ['step', value, `${mark}-${colors[0]}`,
     ...breaks.flatMap((b, i) => [b, `${mark}-${colors[i + 1]}`])];

// a site the producer gives no value for coalesces to the foot of the ramp,
// which flattens the colour rather than hiding the site
export const flareIcon = cfg => {
    const v = ['coalesce', ['get', cfg.prop], cfg.stops[0]];
    const at = s => cfg.log ? Math.log(s + 1) : s;
    return stepIcon('flare', cfg.log ? ['ln', ['+', v, 1]] : v,
        cfg.stops.slice(1).map(at), RAMP);
};

// the key's flaring bands, off the stops the step breaks at, so a row selects
// exactly the features drawn in its colour. the bottom band is a negation for
// the reason flareIcon coalesces
export const flareBands = cfg => {
    const [, mid, hi] = cfg.stops, v = p => p[cfg.prop];
    return [
        [`${hi}+`, RAMP[2], p => v(p) >= hi],
        [`${mid}`, RAMP[1], p => v(p) >= mid && v(p) < hi],
        [`<${mid}`, RAMP[0], p => !(v(p) >= mid)],
    ];
};

const PLUME_STOPS = [1000, 10000];   // kg/h, the key's bands too

// no rate is not a low rate: an unquantified plume is drawn grey, off the
// ramp and out of every band
export const plumeIcon = ['case',
    ['!=', ['typeof', ['get', 'rate_kg_h']], 'number'],
    `diamond-${DD.grey}`,
    stepIcon('diamond', ['get', 'rate_kg_h'], PLUME_STOPS, RAMP)];

// [label in t/hr, lo kg/h, hi kg/h, colour], off the same stops
const [LO, HI] = PLUME_STOPS, t = kg => kg / 1000;
export const PLUME_BANDS = [
    [`${t(HI)}+`, HI, null, RAMP[2]],
    [`${t(LO)}–${t(HI)}`, LO, HI, RAMP[1]],
    [`< ${t(LO)}`, 0, LO, RAMP[0]],
];

// white is the default state. the two structure shapes that cannot be told
// apart wrongly at icon size, and neither the plume's diamond
export const MARK = {
    candidate: `triangle-${DD.white}`,    // infrastructure near the plume
    attributed: `square-${DD.white}`,    // the attributed source among them
};

// where aerial departs from the guidelines on purpose, written down so
// vendor/dd/audit.js passes everything else (`make audit`): gl text for the cluster counts, which wants inter
// glyphs the basemap does not serve; the heat halo and the probability
// surface, which are data, not imagery; and the intro heading at 600, the
// title weight of datadesk.eco, where the guidelines' 750 read heavy
export const AUDIT = {
    skip: '.fx-modal-content [slot=title], .fx-modal-content [slot=title] *',
    glyphs: ['clusters'],
    graded: ['detection-footprint', 'dd-plume-probability',
        'plume-mask-image'],
};

export const DASH = [2, 2];

// marking ids only expressions name, which styleimagemissing never sees
export const MARKS = [...RAMP.map(c => `flare-${c}`),
    ...[...RAMP, DD.grey].map(c => `diamond-${c}`),
    `quantitative-${DD.white}`,
    ...Object.values(MARK)];

// every marking pins its icon: a detection sits where it was measured, so
// overlap never moves or drops one
export const PIN = {
    'icon-size': ['interpolate', ['linear'], ['zoom'], 2, 0.55, 10, 0.8, 14, 1],
    'icon-allow-overlap': true, 'icon-ignore-placement': true,
};
// a label up-and-right at 11px (pdf:77). gl text needs sdf glyphs and the
// basemap serves no inter, so this is the nearest grotesque it does
export const RATE_LABEL = {
    'text-font': ['Montserrat Regular'], 'text-size': 11,
    'text-anchor': 'bottom-left', 'text-offset': [0.7, -0.7],
};
