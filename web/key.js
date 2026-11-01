// the key: a group per measurement, each in its own units, and every row a
// band. active rows OR into the data filter and a row is no statement about
// a family it does not band (`p.kind !== kind || …`), so one key filters
// several sources and switching a group's rows all off takes it off the map.
// S2, S3 and VNF share a group, row for row: one ramp, S2's scale and the
// MW one S3 reads on VNF's stops.

import { PLUME_BANDS, flareBands } from './layers.js';
import { MODE } from './flaring/render.js';

const [s2, vnf, s3] = [MODE.s2, MODE.vnf, MODE.s3].map(flareBands);
const of = (kind, inBand) => p => p.kind !== kind || inBand(p);

// no row for a plume with no rate: it is drawn, in grey, but in no band. the
// null test matters, as `null >= 0` is true
const inPlumeBand = (lo, hi) => p => p.rate_kg_h != null
    && p.rate_kg_h >= lo && (!hi || p.rate_kg_h < hi);

// no infrastructure group: candidates belong to an open plume card alone
export const keySections = () => [{
    label: `S2/S3/VNF hotspots\n(${MODE.s2.unit}/${MODE.vnf.unit})`,
    rows: s2.map(([a, color, inS2], i) => {
        const [b, , inVNF] = vnf[i], [, , inS3] = s3[i];
        const ins = [of('live', inS2), of('s3', inS3), of('vnf', inVNF)];
        return { swatch: { mark: 'flare', color },
            label: a === b ? a : `${a} / ${b}`,
            pred: p => ins.every(f => f(p)) };
    }),
}, {
    label: 'Methane\n(t/hr)',
    rows: PLUME_BANDS.map(([label, lo, hi, color]) => ({
        swatch: { mark: 'diamond', color }, label,
        pred: of('plume', inPlumeBand(lo, hi)),
    })),
}];
