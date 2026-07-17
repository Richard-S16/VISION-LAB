import { pipeline, RawImage } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/rfdetr_nano-ONNX";

let detectorPromise = null;

let forceWasm = false;

function loadDetector(onProgress) {
  if (!detectorPromise) {
    const progress_callback = (p) => {
      if (p.status === "progress" && typeof p.progress === "number") {
        onProgress(p.progress);
      }
    };
    detectorPromise = (async () => {
      try {
        if (forceWasm) throw new Error("forced wasm (?wasm)");
        // fp32 on WebGPU: fp16 overflows on this model family (silent empty output)
        return await pipeline("object-detection", MODEL_ID, {
          device: "webgpu",
          dtype: "fp32",
          progress_callback,
        });
      } catch (err) {
        console.warn("[detector] WebGPU unavailable, falling back to wasm:", String(err));
        return await pipeline("object-detection", MODEL_ID, {
          device: "wasm",
          dtype: "q8",
          progress_callback,
        });
      }
    })();
    detectorPromise.catch(() => {
      detectorPromise = null; // allow retry after failure
    });
  }
  return detectorPromise;
}

function bitmapToRawImage(bitmap) {
  const width = bitmap.width;
  const height = bitmap.height;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const frame = ctx.getImageData(0, 0, width, height);
  return new RawImage(frame.data, width, height, 4);
}

self.onmessage = async (event) => {
  const msg = event.data;

  if (msg.type === "load") {
    forceWasm = !!msg.forceWasm;
    try {
      const detector = await loadDetector((progress) => {
        self.postMessage({ type: "progress", progress });
      });
      // warmup pass: compiles kernels so the first real detection is fast
      const blank = new OffscreenCanvas(64, 64);
      blank.getContext("2d"); // required before transferToImageBitmap
      await detector(bitmapToRawImage(blank.transferToImageBitmap()), { threshold: 0.99 });
      self.postMessage({ type: "loaded" });
    } catch (err) {
      self.postMessage({ type: "error", error: `${err.message || err} | ${err.stack?.split("\n")[1] ?? ""}` });
    }
    return;
  }

  if (msg.type === "detect") {
    const width = msg.bitmap.width;
    const height = msg.bitmap.height;
    try {
      const detector = await loadDetector(() => {});
      const t0 = performance.now();
      const output = await detector(bitmapToRawImage(msg.bitmap), {
        threshold: msg.threshold,
      });
      self.postMessage({
        type: "result",
        id: msg.id,
        width,
        height,
        latency: performance.now() - t0,
        detections: output,
      });
    } catch (err) {
      self.postMessage({ type: "error", id: msg.id, error: err.message });
    }
  }
};
