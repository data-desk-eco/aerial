// the hand landmarker off the main thread: a frame and its capture time in,
// the time and each hand's 21 points (x, y in the frame's 0-1) and side out.
// a module worker, so the wasm is the es module build; the gpu delegate
// draws to an offscreen canvas, and where webgl2 is refused there, the cpu
import { FilesetResolver, HandLandmarker }
    from './vendor/mediapipe/vision_bundle.mjs';

const base = new URL('./vendor/mediapipe/', import.meta.url).href,
    files = await FilesetResolver.forVisionTasks(base + 'wasm', true),
    make = delegate => HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: base + 'hand_landmarker.task',
            delegate },
        runningMode: 'VIDEO', numHands: 2 }),
    hl = await make('GPU').catch(() => make('CPU'));

onmessage = ({ data: [frame, t] }) => {
    const { landmarks, handedness } = hl.detectForVideo(frame, t);
    frame.close();
    postMessage([t, landmarks.map((h, i) =>
        [handedness[i][0].categoryName, h.map(p => [p.x, p.y])])]);
};
postMessage(null);
