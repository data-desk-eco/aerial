// the key: a group per measurement, each in its own units, and every row a
// band. active rows OR into the data filter and a row is no statement about
// a family it does not band (`p.kind !== kind || …`), so one key filters
// several sources and switching a group's rows all off takes it off the map.
// S2 and VNF share a group, row for row: one ramp, two scales.

import { PLUME_BANDS, flareBands } from './layers.js';
import { MODE } from './flaring/render.js';

const [s2, vnf] = [MODE.s2, MODE.vnf].map(flareBands);
const of = (kind, inBand) => p => p.kind !== kind || inBand(p);

// no row for a plume with no rate: it is drawn, in grey, but in no band. the
// null test matters, as `null >= 0` is true
const inPlumeBand = (lo, hi) => p => p.rate_kg_h != null
    && p.rate_kg_h >= lo && (!hi || p.rate_kg_h < hi);

// no infrastructure group: candidates belong to an open plume card alone
export const keySections = () => [
    {
        label: `S2/VNF flaring\n(${MODE.s2.unit}/${MODE.vnf.unit})`,
        rows: s2.map(([a, color, inS2], i) => {
            const [b, , inVNF] = vnf[i];
            const [x, y] = [of('flare', inS2), of('vnf', inVNF)];
            return { swatch: { mark: 'flare', color }, label: `${a} / ${b}`,
                pred: p => x(p) && y(p) };
        }),
    },
    {
        label: 'Methane\n(t/hr)',
        rows: PLUME_BANDS.map(([label, lo, hi, color]) => ({
            swatch: { mark: 'diamond', color }, label,
            pred: of('plume', inPlumeBand(lo, hi)),
        })),
    },
];
