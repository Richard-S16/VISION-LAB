https://github.com/user-attachments/assets/d2f4681c-adcb-4fd5-b423-2a55605b93f1
Uploading VISION_LAB — Live Object Detection - Brave 2026-07-17 16-17-18.mp4…


# VISION/LAB

Live object detection on a 3D stage — **Babylon.js** renders the model, **RF-DETR** (WebGPU) detects what's in frame, all in the browser. No server, no cloud: everything runs locally after the first model download.

![status](https://img.shields.io/badge/status-working-00e5ff)

## Features

- **3D stage** — glTF model with image-based studio lighting, contact shadow, auto-rotate, orbit/zoom controls
- **On-demand detection** — press `DETECT` to start the live loop, `STOP` to end it. Nothing runs until you ask
- **RF-DETR nano** — 2025 transformer detector (~48 mAP on COCO, 80 classes), runs on **WebGPU fp32**, falls back to **wasm q8** automatically
- **Zero-lag rendering** — inference lives in a Web Worker; the render thread stays at full fps while detecting
- **Load your own model** — upload button or drag-and-drop a `.glb` (or `.gltf` + `.bin` + textures) anywhere onto the page; reset button restores the default car
- **Flicker filter** — temporal majority-vote suppresses one-frame label glitches while the model rotates
- Confidence threshold slider, live latency / fps / object-count HUD

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

Production build:

```bash
npm run build    # outputs to dist/
npm run preview  # serve the build locally
```

First click on `DETECT` downloads the detection model (~108 MB fp32, or ~29 MB q8 on the wasm fallback) from the Hugging Face hub. It's cached by the browser afterwards — subsequent loads are instant.

## Controls

| Control | Action |
|---|---|
| `DETECT` / `STOP` | toggle the live detection loop (model loads on first use) |
| Confidence slider | minimum detection score (25–95 %) |
| ⬆ upload | open a file picker — select one `.glb`, **or** a `.gltf` together with its `.bin` and texture files |
| ↺ reset | restore the default car model |
| drag & drop | drop model files anywhere on the page |
| mouse | drag = orbit, wheel = zoom (auto-rotate resumes after 2 s idle) |

## How it works

```
renderCanvas (Babylon.js, WebGL2)
     │  grab: downscale to ≤480 px, transferToImageBitmap
     ▼
detector.worker.js (Web Worker)
     │  @huggingface/transformers pipeline
     │  onnx-community/rfdetr_nano-ONNX · WebGPU fp32 → wasm q8 fallback
     ▼
{label, score, box} ──► overlayCanvas (2D bounding boxes + labels)
```

- **~3 detections/sec** (300 ms interval, non-overlapping — a slow inference never queues up)
- Detection input is downscaled before transfer; boxes are scaled back to full canvas coordinates
- The shadow map is baked once per model (light and model are static) and re-baked on model swap
- `preserveDrawingBuffer` is enabled solely so the detector can read rendered pixels

### Why WebGPU **fp32**, not fp16?

fp16 kernels silently overflow on the RT-DETR model family — inference "succeeds" but returns zero detections. fp32 on WebGPU is correct and still GPU-fast. The wasm fallback (q8) is also correct, just slower (~1–2 s per frame vs. well under 1 s on GPU).

### Label smoothing

With a rotating 3D model, single frames occasionally mislabel the object (e.g. laptop → "airplane" from the rear). Single-detection frames pass through a 3-frame majority vote: a label that contradicts the last two frames is replaced by the majority label (box and score are kept).

## Project structure

```
├── index.html            # UI shell: HUD, controls, dropzone, loader
├── public/CarConcept.glb # default concept-car model
└── src/
    ├── main.js           # boot, DETECT toggle, detection loop, upload/reset
    ├── scene.js          # Babylon scene, lighting, model load/dispose/normalize
    ├── detector.js       # worker client: canvas grab, result adapter, smoothing
    ├── detector.worker.js# transformers.js pipeline (WebGPU fp32 / wasm q8)
    ├── overlay.js        # DPR-aware bounding-box canvas drawing
    ├── hud.js            # HUD stats, buttons, drag-and-drop
    └── style.css         # dark studio-tech theme
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Detection never starts / errors on click | Check the browser console. On machines without WebGPU the wasm fallback engages automatically — first load still needs the one-time model download |
| Want to force the CPU path for comparison | open `http://localhost:5173?wasm` |
| Boxes lag ~1 s behind | Expected: RF-DETR is a transformer; on iGPU each pass takes ~0.7–1 s. Rendering stays at full fps regardless |
| Model won't load on upload | For `.gltf`, select **all** its files together (`.gltf` + `.bin` + textures). A single `.glb` is self-contained |

## Credits

- [Babylon.js](https://www.babylonjs.com/) — 3D rendering (Apache-2.0)
- [RF-DETR](https://github.com/roboflow/rf-detr) by Roboflow — detection model (Apache-2.0), ONNX conversion by [onnx-community](https://huggingface.co/onnx-community/rfdetr_nano-ONNX)
- [Transformers.js](https://huggingface.co/docs/transformers.js) — in-browser inference runtime (Apache-2.0)
- [Vite](https://vite.dev/) — build tooling
