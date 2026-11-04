// hands: the camera's hands traced over the map, and the camera never shown.
// `h` turns it on and off. each frame goes to hands.worker.js as a
// VideoFrame, transferred, one in flight, and comes back as points; the
// video element is never in the page. a pinch of thumb and index grabs the
// globe and drags it, two pinch, zoom (GAIN times as far as the hands
// spread) and turn, and a drag let go spins on and slows. a finger pointed
// at a flare for HOLD ms opens its card.
// the camera gives ~30 frames a second and jitters; the screen wants 60 or
// more and none. each point goes through a one euro filter (Casiez et al.
// 2012), steady when slow and quick when fast, and the hands are drawn and
// move the map every screen frame, run on from the camera frame's capture
// by the filter's speed, which also covers the time the worker took
import { palette as DD } from './vendor/dd/dd.js';
import { FLARES } from './layers.js';

// the bones as runs of landmarks: thumb, the four fingers, the knuckles
const RUNS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [9, 10, 11, 12],
    [13, 14, 15, 16], [0, 17, 18, 19, 20], [5, 9, 13, 17]];
// a pinch is thumb tip to index tip, in 3d, under IN of the palm (wrist to
// middle knuckle), the middle tip clear of the thumb by CLEAR, for DWELL
// ms; it lets go past OUT. so fingers that cross in the camera's view, a
// hand bunched or curling, or one frame's brush are not a pinch
const IN = .3, OUT = .45, CLEAR = .4, DWELL = 70,
    // a point is the index's tip past REACH of its knuckle's distance from
    // the wrist, the other fingers' within CURL (an open hand's are near 2)
    REACH = 1.6, CURL = 1.3,
    AIM = 20, HOLD = 600,   // a flare within AIM px of the tip, held HOLD ms
    GAIN = 2,               // two pinches zoom this many times their spread
    DECAY = .002,    // the spin's slowing, per ms
    CUT = 1, BETA = 20, DCUT = 2,   // the filter: Hz, Hz per px/ms, Hz
    // a pinch moves the map by the mean of the thumb and index, GRIP, under
    // a slower filter, GCUT and GDCUT Hz: seven points, steadier than the two
    // tips. in the simulation the filter alone takes the step a still hand
    // jitters by from 0.77 px to 0.44, for 5 px more lag at 1 px/ms
    GRIP = [2, 3, 4, 5, 6, 7, 8], GCUT = .5, GDCUT = 1,
    // the most a point runs on past its frame, ms. tuned in a simulation
    // of 30 Hz frames 25 ms late to a 60 Hz screen: against the raw points,
    // a still hand's frame-to-frame jitter is halved and the lag behind a
    // hand at 1 px/ms falls from 46 px to 18, overshooting a stop by 21
    LEAD = 35,
    TIPS = [4, 8, 12, 16, 20];

let on;

addEventListener('keydown', e => {
    const t = e.composedPath()[0];
    if (e.key !== 'h' || e.metaKey || e.ctrlKey || e.altKey ||
        t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))
        return;
    if (on) return stop();
    start().catch(err => { console.warn('hands:', err); stop(); });
});

function stop(s = on) {
    s?.stream?.getTracks().forEach(t => t.stop());
    s?.worker.terminate();
    s?.cv.remove();
    if (on === s) on = null;
}

async function start() {
    const map = window.aerial?.map;
    if (!map) return;
    const s = on = { map, f: {}, P: [], v: [0, 0],
        cv: document.body.appendChild(document.createElement('canvas')),
        worker: new Worker(new URL('./hands.worker.js', import.meta.url),
            { type: 'module' }) };
    s.cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;'
        + 'pointer-events:none;z-index:10';
    const ready = new Promise((r, j) =>
        Object.assign(s.worker, { onmessage: r, onerror: j }));
    s.stream = await navigator.mediaDevices.getUserMedia(
        { video: { width: 640, height: 480, facingMode: 'user' } });
    const v = Object.assign(document.createElement('video'),
        { muted: true, playsInline: true, srcObject: s.stream });
    await Promise.all([v.play(), ready]);
    if (on !== s) return stop(s);
    let busy = false;
    s.worker.onmessage = ({ data }) => {
        busy = false;
        if (on === s) track(s, data, v);
    };
    const tick = now => {
        if (on !== s) return;
        if (!busy) {
            const f = new VideoFrame(v);
            busy = true;
            s.worker.postMessage([f, now], [f]);
        }
        v.requestVideoFrameCallback(tick);
    };
    v.requestVideoFrameCallback(tick);
    const loop = now => on === s && (draw(s, now), requestAnimationFrame(loop));
    requestAnimationFrame(loop);
}

const mid = q => [(q[0][0] + q.at(-1)[0]) / 2, (q[0][1] + q.at(-1)[1]) / 2],
    span = q => Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]),
    turn = q => Math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]),
    mean = (p, I) => [0, 1].map(j => I.reduce((a, i) => a + p[i][j], 0)
        / I.length),
    // a step of a low-pass at c Hz over dt ms, from a toward b
    low = (a, b, c, dt) => a.map((v, j) =>
        v + (b[j] - v) / (1 + 1000 / (2 * Math.PI * c * dt))),
    // a step of the one euro filter at least c Hz, its speed's at e Hz:
    // point x, speed dx, to q
    euro = (x, dx, q, dt, c = CUT, e = DCUT) => {
        const d = low(dx, [0, 1].map(j => (q[j] - x[j]) / dt), e, dt);
        return [low(x, q, c + BETA * Math.hypot(...d), dt), d];
    };

// whether a hand (its landmarks in the frame's 0-1, z on x's scale) pinches,
// given its last state f, at t
function grip(f, h, t, vw, vh) {
    const D = (a, b) => Math.hypot((h[a][0] - h[b][0]) * vw,
            (h[a][1] - h[b][1]) * vh, (h[a][2] - h[b][2]) * vw),
        r = D(4, 8) / D(0, 9);
    if (f?.held) return { held: r < OUT };
    const ok = r < IN && D(4, 12) > CLEAR * D(0, 9),
        since = ok ? f?.since ?? t : null, ext = i => D(0, i) / D(0, i - 3);
    return { held: ok && t - since >= DWELL, since,
        point: ext(8) > REACH && [12, 16, 20].every(i => ext(i) < CURL) };
}

// a camera frame, taken at t: each hand's points on the screen, filtered,
// with their speeds in px per ms, and its grip. a hand not in it is
// forgotten
function track(s, [t, hands], { videoWidth: vw, videoHeight: vh }) {
    const W = innerWidth, H = innerHeight, k = Math.max(W / vw, H / vh),
        // mirrored, and over the window as the video would cover it
        px = ([x, y]) => [W / 2 + (.5 - x) * vw * k,
            H / 2 + (y - .5) * vh * k];
    s.f = Object.fromEntries(hands.map(([side, h]) => {
        const p = h.map(px), f = s.f[side], dt = t - f?.t,
            g = grip(f, h, t, vw, vh), c = mean(p, GRIP);
        if (!(dt > 0)) return [side, { t, x: p, dx: p.map(() => [0, 0]),
            c, dc: [0, 0], ...g }];
        const e = p.map((q, i) => euro(f.x[i], f.dx[i], q, dt)),
            [cx, dc] = euro(f.c, f.dc, c, dt, GCUT, GDCUT);
        return [side, { t, x: e.map(e => e[0]), dx: e.map(e => e[1]),
            c: cx, dc, ...g }];
    }));
}

// a screen frame: the hands as they are now, drawn, and the map moved
function draw(s, now) {
    const { cv, map, P: was } = s, W = innerWidth, H = innerHeight,
        r = devicePixelRatio, g = cv.getContext('2d'), P = [];
    let tip;
    if (cv.width !== W * r || cv.height !== H * r)
        cv.width = W * r, cv.height = H * r;
    g.setTransform(r, 0, 0, r, 0, 0);
    g.clearRect(0, 0, W, H);
    g.lineWidth = 1.5;
    g.lineJoin = 'round';
    for (const [, { t, x, dx, c, dc, held, point }] of Object.entries(s.f)
        .sort(([a], [b]) => a < b ? -1 : 1)) {
        const a = Math.min(Math.max(now - t, 0), LEAD),
            run = (q, d) => [q[0] + d[0] * a, q[1] + d[1] * a],
            p = x.map((q, i) => run(q, dx[i]));
        g.strokeStyle = g.fillStyle = DD.white;
        g.globalAlpha = .7;
        g.beginPath();
        for (const run of RUNS) run.forEach((i, j) =>
            g[j ? 'lineTo' : 'moveTo'](...p[i]));
        g.stroke();
        g.globalAlpha = 1;
        p.forEach(([x, y], i) => {
            g.beginPath();
            g.arc(x, y, TIPS.includes(i) ? 3.5 : 2, 0, 7);
            g.fill();
        });
        if (point) tip ??= p[8];
        if (!held) continue;
        P.push(run(c, dc));
        s.v = dc.map(v => -v);
        g.beginPath();
        g.arc(...mean(p, [4, 8]), 11, 0, 7);
        g.stroke();
    }
    aim(s, tip, now, g);
    const n = P.length;
    // two pinches zoom from where they took hold, GAIN times their spread,
    // and pin the ground under their middle and the turn of the ground
    // under each: each frame closes the gap a few steps, as the bearing
    // turns about the centre and the globe pans unevenly
    if (n > 1 && n !== was.length) s.A = P.map(p => map.unproject(p)),
        s.Z = [map.getZoom(), span(P), map.unproject(mid(P))];
    if (n && n === was.length) {
        const [x, y] = mid(P), [x0, y0] = mid(was), [z, w, M] = s.Z ?? [],
            at = () => s.A.map(a => map.project(a)).map(p => [p.x, p.y]);
        if (n > 1) map.jumpTo({ zoom: z + GAIN * Math.log2(span(P) / w) });
        if (n > 1) for (let i = 0; i < 3; i++) {
            const a = turn(P) - turn(at());
            map.jumpTo({ bearing: map.getBearing() - 180 / Math.PI
                * Math.atan2(Math.sin(a), Math.cos(a)) });
            const q = map.project(M);
            map.panBy([q.x - x, q.y - y], { duration: 0 });
        }
        else if (x !== x0 || y !== y0)
            map.panBy([x0 - x, y0 - y], { duration: 0 });
    }
    if (!n && was.length === 1) spin(s);
    s.P = P;
}

// the flare nearest a pointing tip, within AIM px: a ring round it fills
// over HOLD ms, then its card opens as a click on it would open it, once
// until the finger leaves it
function aim(s, tip, now, g) {
    const { map } = s, [x, y] = tip ?? [], near = tip && map
        .queryRenderedFeatures([[x - AIM, y - AIM], [x + AIM, y + AIM]],
            { layers: FLARES.filter(l => map.getLayer(l)) })
        .map(f => [f, map.project(f.geometry.coordinates)])
        .sort(([, a], [, b]) => Math.hypot(a.x - x, a.y - y)
            - Math.hypot(b.x - x, b.y - y))[0],
        id = near && String(near[0].properties.id);
    if (tip) {
        g.beginPath();
        g.arc(x, y, 6, 0, 7);
        g.stroke();
    }
    if (id !== s.aim?.id) s.aim = id && { id, t: now };
    if (!s.aim) return;
    const q = near[1], k = Math.min((now - s.aim.t) / HOLD, 1);
    g.globalAlpha = .4;
    g.beginPath();
    g.arc(q.x, q.y, 14, 0, 7);
    g.stroke();
    g.globalAlpha = 1;
    g.beginPath();
    g.arc(q.x, q.y, 14, -Math.PI / 2, (k * 4 - 1) * Math.PI / 2);
    g.stroke();
    if (k < 1 || s.aim.done) return;
    s.aim.done = true;
    map.fire('click', { point: q, lngLat: map.unproject(q),
        originalEvent: {} });
}

// a let-go drag spins on at its speed, in px per ms, and slows, one spin
// at a time, until a hand takes hold
function spin(s) {
    if (s.spinning) return;
    s.spinning = true;
    let t = performance.now();
    const f = now => {
        if (on !== s || s.P.length || Math.hypot(...s.v) < .02)
            return s.spinning = false;
        s.v = s.v.map(v => v * Math.exp(-DECAY * (now - t)));
        s.map.panBy(s.v.map(v => v * (now - t)), { duration: 0 });
        t = now;
        requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
}
