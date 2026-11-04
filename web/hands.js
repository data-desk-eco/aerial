// hands: the camera's hands traced over the map, and the camera never shown.
// `h` turns it on and off. each frame goes to hands.worker.js as a
// VideoFrame, transferred, one in flight, and comes back as points; the
// video element is never in the page. a pinch (thumb tip to index tip)
// grabs the globe and drags it, two pinch, zoom and turn as two fingers do,
// and a drag let go spins on and slows
import { palette as DD } from './vendor/dd/dd.js';

// the bones as runs of landmarks: thumb, the four fingers, the knuckles
const RUNS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [9, 10, 11, 12],
    [13, 14, 15, 16], [0, 17, 18, 19, 20], [5, 9, 13, 17]];
const IN = .3, OUT = .45,   // a pinch holds under IN of the palm, lets go
    DECAY = .002,           // past OUT; the spin's slowing, per ms
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
    const s = on = { map, held: {}, sm: {}, P: [], v: [0, 0],
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
        if (on === s) frame(s, data, v);
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
}

const mid = q => [(q[0][0] + q.at(-1)[0]) / 2, (q[0][1] + q.at(-1)[1]) / 2],
    span = q => Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]),
    turn = q => Math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]);

function frame(s, hands, { videoWidth: vw, videoHeight: vh }) {
    const { cv, map, P: was } = s, W = innerWidth, H = innerHeight,
        r = devicePixelRatio, k = Math.max(W / vw, H / vh),
        g = cv.getContext('2d'), now = performance.now(), P = [],
        // mirrored, and over the window as the video would cover it
        px = ([x, y]) => [W / 2 + (.5 - x) * vw * k,
            H / 2 + (y - .5) * vh * k];
    if (cv.width !== W * r || cv.height !== H * r)
        cv.width = W * r, cv.height = H * r;
    g.setTransform(r, 0, 0, r, 0, 0);
    g.clearRect(0, 0, W, H);
    g.lineWidth = 1.5;
    g.lineJoin = 'round';
    for (const [side, h] of hands.sort(([a], [b]) => a < b ? -1 : 1)) {
        const p = h.map(px),
            d = (a, b) => Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1]),
            held = s.held[side] = d(4, 8) < (s.held[side] ? OUT : IN) * d(0, 9),
            m = mid([p[4], p[8]]), o = s.sm[side];
        s.sm[side] = held ? o ? [(o[0] + m[0]) / 2, (o[1] + m[1]) / 2] : m
            : null;
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
        P.push(s.sm[side]);
        g.fillStyle = DD.orange;
        g.beginPath();
        g.arc(...s.sm[side], 7, 0, 7);
        g.fill();
    }
    const n = P.length, dt = now - s.t;
    // two pinches pin the ground under them where they took hold: each
    // frame closes the gap between that ground and the hands, a few steps,
    // as zoom and bearing turn about the centre and the globe pans unevenly
    if (n > 1 && n !== was.length) s.A = P.map(p => map.unproject(p));
    if (n && n === was.length && dt > 0) {
        const [x, y] = mid(P), [x0, y0] = mid(was), d = [x0 - x, y0 - y],
            at = () => s.A.map(a => map.project(a)).map(p => [p.x, p.y]);
        if (n > 1) for (let i = 0; i < 3; i++) {
            const Q = at(), a = turn(P) - turn(Q);
            map.jumpTo({ zoom: map.getZoom() + Math.log2(span(P) / span(Q)),
                bearing: map.getBearing() - 180 / Math.PI
                    * Math.atan2(Math.sin(a), Math.cos(a)) });
            const [qx, qy] = mid(at());
            map.panBy([qx - x, qy - y], { duration: 0 });
        }
        else map.panBy(d, { duration: 0 });
        s.v = s.v.map((v, i) => (v + d[i] / dt) / 2);
    } else s.v = n ? [0, 0] : s.v;
    if (!n && was.length === 1) spin(s);
    s.P = P;
    s.t = now;
}

// a let-go drag spins on at its last speed, in px per ms, and slows
function spin(s, t = performance.now()) {
    requestAnimationFrame(now => {
        if (on !== s || s.P.length) return;
        s.v = s.v.map(v => v * Math.exp(-DECAY * (now - t)));
        if (Math.hypot(...s.v) < .02) return;
        s.map.panBy(s.v.map(v => v * (now - t)), { duration: 0 });
        spin(s, now);
    });
}
