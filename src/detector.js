// RF-DETR detector client.
// Runs the model in a Web Worker (WebGPU, wasm fallback) so inference never
// blocks the render thread. Grabs a downscaled copy of the render canvas and
// transfers it as an ImageBitmap — no pixel copies on the main thread.

const DETECT_MAX_DIM = 480; // model resizes internally; small transfer is enough

export function createDetector() {
  const worker = new Worker(new URL("./detector.worker.js", import.meta.url), {
    type: "module",
  });

  const grab = new OffscreenCanvas(1, 1);
  const grabCtx = grab.getContext("2d");

  let seq = 0;
  let busy = false;
  let threshold = 0.5;
  let onProgressCb = null;
  let loadResolve = null;
  let loadReject = null;
  const pending = new Map();
  const labelHistory = []; // temporal smoothing: majority vote over last 3 frames

  // Single-detection frames only: suppress one-frame label flicker
  // (e.g. laptop -> "airplane" -> laptop while the model rotates).
  function stabilize(detections) {
    if (detections.length !== 1) {
      labelHistory.length = 0;
      return detections;
    }
    const det = detections[0];
    const label = det.categories[0].categoryName;
    labelHistory.push(label);
    if (labelHistory.length > 3) labelHistory.shift();
    if (labelHistory.length === 3) {
      const counts = {};
      for (const l of labelHistory) counts[l] = (counts[l] ?? 0) + 1;
      const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (majority[1] >= 2 && majority[0] !== label) {
        return [
          {
            ...det,
            categories: [{ ...det.categories[0], categoryName: majority[0] }],
          },
        ];
      }
    }
    return [det];
  }

  worker.onmessage = (e) => {
    const msg = e.data;

    if (msg.type === "progress") {
      onProgressCb?.(msg.progress);
      return;
    }
    if (msg.type === "loaded") {
      loadResolve?.();
      loadResolve = loadReject = null;
      return;
    }
    if (msg.type === "result") {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (!entry) return;
      const factor = entry.sourceWidth / msg.width;
      // Adapt to the shape the overlay already understands
      const detections = msg.detections.map((d) => ({
        boundingBox: {
          originX: d.box.xmin * factor,
          originY: d.box.ymin * factor,
          width: (d.box.xmax - d.box.xmin) * factor,
          height: (d.box.ymax - d.box.ymin) * factor,
        },
        categories: [{ categoryName: d.label, score: d.score }],
      }));
      entry.resolve({ detections: stabilize(detections), latency: msg.latency });
      return;
    }
    if (msg.type === "error") {
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id).reject(new Error(msg.error));
        pending.delete(msg.id);
      } else {
        loadReject?.(new Error(msg.error));
        loadResolve = loadReject = null;
      }
    }
  };

  return {
    load(onProgress) {
      onProgressCb = onProgress;
      const forceWasm = new URLSearchParams(location.search).has("wasm");
      worker.postMessage({ type: "load", forceWasm });
      return new Promise((resolve, reject) => {
        loadResolve = resolve;
        loadReject = reject;
      });
    },

    setThreshold(v) {
      threshold = v;
    },

    // call when the displayed model changes
    resetHistory() {
      labelHistory.length = 0;
    },

    get busy() {
      return busy;
    },

    // Returns null when a previous inference is still running (caller skips).
    detect(canvas) {
      if (busy) return Promise.resolve(null);
      busy = true;

      const scale = Math.min(1, DETECT_MAX_DIM / Math.max(canvas.width, canvas.height));
      const w = Math.max(1, Math.round(canvas.width * scale));
      const h = Math.max(1, Math.round(canvas.height * scale));
      grab.width = w;
      grab.height = h;
      grabCtx.drawImage(canvas, 0, 0, w, h);
      const bitmap = grab.transferToImageBitmap();

      const id = ++seq;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, sourceWidth: canvas.width });
        worker.postMessage({ type: "detect", id, bitmap, threshold }, [bitmap]);
      }).finally(() => {
        busy = false;
      });
    },

    dispose() {
      worker.terminate();
    },
  };
}
