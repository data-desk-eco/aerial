import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../web/shell/map.js', import.meta.url),
    'utf8').replace(/^import .*;$/gm, '').replaceAll('export ', '');
const { viewOutline } = runInNewContext(source + '\n({ viewOutline });');
// a flat map 10 px a degree across the antimeridian, its surface ending
// at lat 60, the right half under the table
const wrap = l => ((l + 180) % 360 + 360) % 360 - 180, map = {
    getPadding: () => ({ top: 0, right: 500, bottom: 0, left: 0 }),
    getContainer: () => ({ clientWidth: 1000, clientHeight: 500 }),
    unproject: ([x, y]) => ({ lng: wrap(170 + x / 10),
        lat: Math.min(60, 70 - y / 10) }),
    project: ({ lng, lat }) => ({ x: (((lng - 170) % 360 + 360) % 360) * 10,
        y: (70 - lat) * 10 }),
};
const o = JSON.parse(JSON.stringify(viewOutline(map, 4))).map(p => p.map(v => Math.round(v * 10) / 10));
test('outline leaves out the table and unwraps the antimeridian', () => {
    assert.deepEqual(o[8], [220, 20]);
    assert.deepEqual(o[12], [170, 20]);
    assert.ok(o.every(([x]) => x >= 170 && x <= 220));
});
test('an edge off the surface is pulled onto it, toward the middle', () => {
    assert.deepEqual(o[2], [195, 60]);
    assert.ok(o[0][0] > 170 && o[0][1] === 60);
});
