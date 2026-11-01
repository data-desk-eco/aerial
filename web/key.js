// the key: a group per measurement, each in its own units, and every row a
// band. active rows OR into the data filter and a row is no statement about
// a family it does not band (`p.kind !== kind || …`), so one key filters
// several sources and switching a group's rows all off takes it off the map.
// a sentinel and VNF share a group, row for row: one ramp, two scales. the
// group's choice says which sentinel is drawn, S2 by day or S3 by night;
// S3 reads on VNF's stops, so its rows carry one label.

import { PLUME_BANDS, flareBands } from './layers.js';
import { MODE } from './flaring/render.js';

const [s2, vnf, s3] = [MODE.s2, MODE.vnf, MODE.s3].map(flareBands);
const SENTINEL = { s2: ['flare', s2], s3: ['s3', s3] };
const of = (kind, inBand) => p => p.kind !== kind || inBand(p);

// no row for a plume with no rate: it is drawn, in grey, but in no band. the
// null test matters, as `null >= 0` is true
const inPlumeBand = (lo, hi) => p => p.rate_kg_h != null
    && p.rate_kg_h >= lo && (!hi || p.rate_kg_h < hi);

// no infrastructure group: candidates belong to an open plume card alone
export const keySections = (sentinel = 's2', onSentinel) => {
    const [kind, bands] = SENTINEL[sentinel], unit = MODE[sentinel].unit;
    return [{
        label: `${sentinel.toUpperCase()}/VNF flaring\n(${unit === MODE.vnf.unit
            ? unit : `${unit}/${MODE.vnf.unit}`})`,
        choice: onSentinel && { value: sentinel, onChange: onSentinel,
            options: [['s2', 'S2 day'], ['s3', 'S3 night']] },
        rows: bands.map(([a, color, inS], i) => {
            const [b, , inVNF] = vnf[i];
            const [x, y] = [of(kind, inS), of('vnf', inVNF)];
            return { swatch: { mark: 'flare', color },
                label: a === b ? a : `${a} / ${b}`,
                pred: p => x(p) && y(p) };
        }),
    },
    {
        label: 'Methane\n(t/hr)',
        rows: PLUME_BANDS.map(([label, lo, hi, color]) => ({
            swatch: { mark: 'diamond', color }, label,
            pred: of('plume', inPlumeBand(lo, hi)),
        })),
    }];
};
