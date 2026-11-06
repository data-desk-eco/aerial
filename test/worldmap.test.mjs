import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../web/shell/map.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replaceAll('export ', '');
const { worldmapBounds } = runInNewContext(source + '\n({ worldmapBounds });');
const full = [[-180, -90], [180, 90]];
const map = {
    getPadding: () => ({ top: 0, right: 500, bottom: 0, left: 0 }),
    getContainer: () => ({ clientWidth: 1000, clientHeight: 500 }),
    getCenter: () => ({ lng: 150 }),
    unproject: ([x, y]) => ({ lng: 100 + x / 10, lat: 50 - y / 10 }),
    project: ({ lng, lat }) => ({ x: (lng - 100) * 10, y: (50 - lat) * 10 }),
    getBounds: () => ({ toArray: () => full }),
};
const bounds = m => JSON.parse(JSON.stringify(worldmapBounds(m)));
test('mini-map excludes the area behind the table', () => {
    assert.deepEqual(bounds(map), [[100, 0], [150, 50]]);
});
test('mini-map retains globe bounds when a corner is off the surface', () => {
    assert.deepEqual(bounds({ ...map, project: () => ({ x: NaN, y: NaN }) }), full);
});
test('mini-map unwraps corners around the map centre', () => {
    const crossing = { ...map, getCenter: () => ({ lng: 180 }),
        unproject: ([x, y]) => ({ lng: x ? -160 : 170, lat: 50 - y / 10 }),
        project: ({ lng, lat }) => ({ x: lng < 0 ? 500 : 0, y: (50 - lat) * 10 }) };
    assert.deepEqual(bounds(crossing), [[170, 0], [200, 50]]);
});
