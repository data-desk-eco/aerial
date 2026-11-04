// hands: the camera's hands traced over the map, and the camera never shown.
// `h` turns it on and off. each frame goes to hands.worker.js as a
// VideoFrame, transferred, one in flight, and comes back as points; the
// video element is never in the page. a fist grabs the globe by the palm
// and drags it, two fists zoom and turn as two fingers do, an open hand
// lets go, and a drag let go or a fast sweep of an open hand spins it on.
// the camera gives ~30 frames a second and jitters; the screen wants 60 or
// more and none. each point goes through a one euro filter (Casiez et al.
// 2012), steady when slow and quick when fast, and the hands are drawn and
// move the map every screen frame, run on from the camera frame's capture
// by the filter's speed, which also covers the time the worker took
import { palette as DD } from './vendor/dd/dd.js';

// the bones as runs of landmarks: thumb, the four fingers, the knuckles
const RUNS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [9, 10, 11, 12],
    [13, 14, 15, 16], [0, 17, 18, 19, 20], [5, 9, 13, 17]];
// a fist holds when its fingertips come within IN of their knuckles'
// reach from the wrist (an open hand's are near twice it), lets go past OUT
const IN = 1.25, OUT = 1.5,
    SWIPE = 1.5,     // an open hand faster than this, px per ms, spins
    DECAY = .002,    // the spin's slowing, per ms
    CUT = 1, BETA = 20, DCUT = 2,   // the filter: Hz, Hz per px/ms, Hz
    // the most a point runs on past its frame, ms. tuned in a simulation
    // of 30 Hz frames 25 ms late to a 60 Hz screen: against the raw points,
    // a still hand's frame-to-frame jitter is halved and the lag behind a
    // hand at 1 px/ms falls from 46 px to 18, overshooting a stop by 21
    LEAD = 35,
    TIPS = [4, 8, 12, 16, 20], PALM = [0, 5, 9, 13, 17];

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
    const s = on = { map, f: {}, held: {}, P: [], v: [0, 0],
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
    palm = p => [0, 1].map(j => PALM.reduce((a, i) => a + p[i][j], 0) / 5),
    // a step of a low-pass at c Hz over dt ms, from a toward b
    low = (a, b, c, dt) => a.map((v, j) =>
        v + (b[j] - v) / (1 + 1000 / (2 * Math.PI * c * dt)));

// a camera frame, taken at t: each hand's points on the screen, filtered,
// with their speeds in px per ms. a hand not in it is forgotten
function track(s, [t, hands], { videoWidth: vw, videoHeight: vh }) {
    const W = innerWidth, H = innerHeight, k = Math.max(W / vw, H / vh),
        // mirrored, and over the window as the video would cover it
        px = ([x, y]) => [W / 2 + (.5 - x) * vw * k,
            H / 2 + (y - .5) * vh * k];
    s.f = Object.fromEntries(hands.map(([side, h]) => {
        const p = h.map(px), f = s.f[side], dt = t - f?.t;
        if (!(dt > 0)) return [side, { t, x: p, dx: p.map(() => [0, 0]) }];
        const dx = p.map((q, i) => low(f.dx[i],
            [0, 1].map(j => (q[j] - f.x[i][j]) / dt), DCUT, dt));
        return [side, { t, dx, x: p.map((q, i) =>
            low(f.x[i], q, CUT + BETA * Math.hypot(...dx[i]), dt)) }];
    }));
    // a sweep is judged per camera frame, whatever the screen's rate
    if (!s.P.length) for (const [side, { dx }] of Object.entries(s.f)) {
        const u = palm(dx).map(v => -v);
        if (!s.held[side] && Math.hypot(...u) > Math.max(SWIPE,
            Math.hypot(...s.v))) s.v = u, spin(s);
    }
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
    for (const [side, { t, x, dx }] of Object.entries(s.f)
        .sort(([a], [b]) => a < b ? -1 : 1)) {
        const a = Math.min(Math.max(now - t, 0), LEAD),
            p = x.map((q, i) => [q[0] + dx[i][0] * a, q[1] + dx[i][1] * a]),
            d = (a, b) => Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1]),
            curl = TIPS.slice(1).reduce((a, i) => a + d(i, 0) / d(i - 3, 0),
                0) / 4,
            held = s.held[side] = curl < (s.held[side] ? OUT : IN),
            m = palm(p);
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
        s.v = palm(dx).map(v => -v);
        g.fillStyle = DD.orange;
        g.beginPath();
        g.arc(...m, 7, 0, 7);
        g.fill();
    }
    const n = P.length;
    // two fists pin the ground under them where they took hold: each
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

// a let-go drag or a sweep spins on at its speed, in px per ms, and slows,
// one spin at a time, until a hand takes hold
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
