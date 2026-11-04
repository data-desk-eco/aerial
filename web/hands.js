// hands: the camera's hands traced over the map, and the camera never shown.
// `h` turns it on and off. each frame goes to hands.worker.js as a
// VideoFrame, transferred, one in flight, and comes back as points; the
// video element is never in the page. a pinch of thumb and index grabs the
// globe and drags it, two pinch, zoom and turn as two fingers do, and a
// drag let go spins on and slows.
// the camera gives ~30 frames a second and jitters; the screen wants 60 or
// more and none. each point goes through a one euro filter (Casiez et al.
// 2012), steady when slow and quick when fast, and the hands are drawn and
// move the map every screen frame, run on from the camera frame's capture
// by the filter's speed, which also covers the time the worker took
import { palette as DD } from './vendor/dd/dd.js';

// the bones as runs of landmarks: thumb, the four fingers, the knuckles
const RUNS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [9, 10, 11, 12],
    [13, 14, 15, 16], [0, 17, 18, 19, 20], [5, 9, 13, 17]];
// a pinch is thumb tip to index tip, in 3d, under IN of the palm (wrist to
// middle knuckle), the middle tip clear of the thumb by CLEAR, for DWELL
// ms; it lets go past OUT. so fingers that cross in the camera's view, a
// hand bunched or curling, or one frame's brush are not a pinch
const IN = .25, OUT = .45, CLEAR = .5, DWELL = 100,
    DECAY = .002,    // the spin's slowing, per ms
    CUT = 1, BETA = 20, DCUT = 2,   // the filter: Hz, Hz per px/ms, Hz
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
    pair = (p, a = 4, b = 8) => [0, 1].map(j => (p[a][j] + p[b][j]) / 2),
    // a step of a low-pass at c Hz over dt ms, from a toward b
    low = (a, b, c, dt) => a.map((v, j) =>
        v + (b[j] - v) / (1 + 1000 / (2 * Math.PI * c * dt)));

// whether a hand (its landmarks in the frame's 0-1, z on x's scale) pinches,
// given its last state f, at t
function grip(f, h, t, vw, vh) {
    const D = (a, b) => Math.hypot((h[a][0] - h[b][0]) * vw,
            (h[a][1] - h[b][1]) * vh, (h[a][2] - h[b][2]) * vw),
        r = D(4, 8) / D(0, 9);
    if (f?.held) return { held: r < OUT };
    const ok = r < IN && D(4, 12) > CLEAR * D(0, 9),
        since = ok ? f?.since ?? t : null;
    return { held: ok && t - since >= DWELL, since };
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
            g = grip(f, h, t, vw, vh);
        if (!(dt > 0))
            return [side, { t, x: p, dx: p.map(() => [0, 0]), ...g }];
        const dx = p.map((q, i) => low(f.dx[i],
            [0, 1].map(j => (q[j] - f.x[i][j]) / dt), DCUT, dt));
        return [side, { t, dx, ...g, x: p.map((q, i) =>
            low(f.x[i], q, CUT + BETA * Math.hypot(...dx[i]), dt)) }];
    }));
}

// a screen frame: the hands as they are now, drawn, and the map moved
function draw(s, now) {
    const { cv, map, P: was } = s, W = innerWidth, H = innerHeight,
        r = devicePixelRatio, g = cv.getContext('2d'), P = [];
    if (cv.width !== W * r || cv.height !== H * r)
        cv.width = W * r, cv.height = H * r;
    g.setTransform(r, 0, 0, r, 0, 0);
    g.clearRect(0, 0, W, H);
    g.lineWidth = 1.5;
    g.lineJoin = 'round';
    for (const [, { t, x, dx, held }] of Object.entries(s.f)
        .sort(([a], [b]) => a < b ? -1 : 1)) {
        const a = Math.min(Math.max(now - t, 0), LEAD),
            p = x.map((q, i) => [q[0] + dx[i][0] * a, q[1] + dx[i][1] * a]),
            m = pair(p);
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
        if (!held) continue;
        P.push(m);
        s.v = pair(dx).map(v => -v);
        g.beginPath();
        g.arc(...m, 11, 0, 7);
        g.stroke();
    }
    const n = P.length;
    // two pinches pin the ground under them where they took hold: each
    // frame closes the gap between that ground and the hands, a few steps,
    // as zoom and bearing turn about the centre and the globe pans unevenly
    if (n > 1 && n !== was.length) s.A = P.map(p => map.unproject(p));
    if (n && n === was.length) {
        const [x, y] = mid(P), [x0, y0] = mid(was),
            at = () => s.A.map(a => map.project(a)).map(p => [p.x, p.y]);
        if (n > 1) for (let i = 0; i < 3; i++) {
            const Q = at(), a = turn(P) - turn(Q);
            map.jumpTo({ zoom: map.getZoom() + Math.log2(span(P) / span(Q)),
                bearing: map.getBearing() - 180 / Math.PI
                    * Math.atan2(Math.sin(a), Math.cos(a)) });
            const [qx, qy] = mid(at());
            map.panBy([qx - x, qy - y], { duration: 0 });
        }
        else if (x !== x0 || y !== y0)
            map.panBy([x0 - x, y0 - y], { duration: 0 });
    }
    if (!n && was.length === 1) spin(s);
    s.P = P;
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
