import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

// Run the actual tracker without loading the browser's design components.
const source = readFileSync(new URL('../web/hands.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/m, '')
    .replaceAll('import.meta.url', JSON.stringify(import.meta.url));
const { track } = runInNewContext(source + '\n({ track });', {
    addEventListener() {}, innerWidth: 640, innerHeight: 480,
});
const video = { videoWidth: 640, videoHeight: 480 };
function hand(x, closed = false, mirror = 1) {
    const h = Array.from({ length: 21 }, () => [x, .5, 0]);
    h[0] = [x, .7, 0];
    h[9] = [x, .55, 0];
    h[5] = [x + mirror * .03, .55, 0];
    h[7] = [x + mirror * .03, .43, 0];
    h[8] = [x + mirror * .03, .39, 0];
    h[4] = [x + mirror * (closed ? .03 : .16), .40, 0];
    h[12] = [x - mirror * .04, .35, 0];
    return h;
}
const frame = (s, t, hands) => track(s, [t, hands], video);

for (const mirror of [-1, 1]) test(`pinch lifecycle, mirror ${mirror}`, () => {
    const s = { f: {} };
    frame(s, 100, [['Left', hand(.5, false, mirror)]]);
    frame(s, 130, [['Right', hand(.5, true, mirror)]]);
    assert.equal(Object.values(s.f)[0].held, false);
    frame(s, 210, [['Left', hand(.5, true, mirror)]]);
    assert.equal(Object.values(s.f)[0].held, true);
    frame(s, 250, [['Right', hand(.5, false, mirror)]]);
    assert.equal(Object.values(s.f)[0].held, false);
});

for (const side of ['Left', 'Right']) test(`new ${side} label preserves the other hand's pinch`, () => {
    const s = { f: {} };
    frame(s, 100, [[side, hand(.25)]]);
    frame(s, 130, [[side, hand(.25, true)]]);
    frame(s, 210, [[side, hand(.25, true)]]);
    const key = Object.keys(s.f)[0];
    assert.equal(s.f[key].held, true);
    // The new hand arrives first with the same label as the tracked hand.
    frame(s, 240, [[side, hand(.75)], [side, hand(.25, true)]]);
    assert.equal(Object.keys(s.f).length, 2);
    assert.equal(s.f[key].held, true);
    assert.equal(s.f[key].open, 100);
    frame(s, 270, [[side, hand(.25, true)], [side, hand(.75)]]);
    assert.equal(s.f[key].held, true);
});
