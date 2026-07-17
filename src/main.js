import { createBabylonScene } from "./scene.js";
import { createDetector } from "./detector.js";
import { DetectionOverlay } from "./overlay.js";
import { hud } from "./hud.js";

const renderCanvas = document.getElementById("renderCanvas");
const overlayCanvas = document.getElementById("overlayCanvas");
const overlay = new DetectionOverlay(overlayCanvas);

const MIN_INTERVAL = 300; // ms between inferences (~3 detections/sec)

let engine = null;
let sceneHandle = null;
let detector = null;
let detecting = false;
let lastRun = 0;
let inflight = false;

async function boot() {
  try {
    hud.setLoaderStage("loading 3d model…", 0.15);
    sceneHandle = await createBabylonScene(renderCanvas);
    engine = sceneHandle.engine;

    hud.setLoaderStage("compiling shaders…", 0.55);
    await sceneHandle.scene.whenReadyAsync();
    engine.runRenderLoop(() => sceneHandle.scene.render());

    const syncOverlay = () => {
      overlay.resize(
        renderCanvas.clientWidth,
        renderCanvas.clientHeight,
        window.devicePixelRatio || 1
      );
    };
    syncOverlay();
    window.addEventListener("resize", () => {
      engine.resize();
      syncOverlay();
    });

    hud.bindControls({
      onThreshold: (v) => detector?.setThreshold(v),
      onDetectToggle: toggleDetect,
      onUpload: handleUpload,
      onReset: handleReset,
    });

    hud.setLoaderStage("ready", 1);
    hud.hideLoader();
    hud.setStatus("READY");
    hud.setDetectState("idle");
  } catch (err) {
    console.error(err);
    hud.setLoaderStage(`error: ${err.message}`, 0);
    hud.setStatus("ERROR", "error");
  }
}

async function toggleDetect() {
  if (detecting) {
    detecting = false;
    overlay.clear();
    hud.setDetectState("idle");
    hud.setStatus("READY");
    return;
  }

  try {
    if (!detector) {
      hud.setDetectState("loading");
      detector = createDetector();
      // first load downloads the model (~54 MB), then browser-cached
      await detector.load((p) => hud.setDetectProgress(p));
    }
    detecting = true;
    lastRun = 0;
    hud.setDetectState("live");
    hud.setStatus("LIVE", "live");
    requestAnimationFrame(detectionTick);
  } catch (err) {
    console.error(err);
    detector = null;
    hud.setDetectState("idle");
    hud.setStatus("ERROR", "error");
  }
}

async function detectionTick() {
  if (!detecting) return;
  requestAnimationFrame(detectionTick);

  const now = performance.now();
  if (inflight || !detector || now - lastRun < MIN_INTERVAL) return;
  lastRun = now;
  inflight = true;

  try {
    const result = await detector.detect(renderCanvas);
    if (result && detecting) {
      window.__lastDetections = result.detections; // debug/test hook
      overlay.draw(result.detections, renderCanvas.width, renderCanvas.height);
      hud.updateStats({
        latency: result.latency,
        fps: engine.getFps(),
        count: result.detections.length,
      });
    }
  } catch (err) {
    console.error("inference failed:", err);
  } finally {
    inflight = false;
  }
}

async function handleUpload(files) {
  try {
    hud.setStatus("LOADING", "paused");
    await sceneHandle.loadFiles(files);
    overlay.clear(); // stale boxes reference the old model
    detector?.resetHistory();
    hud.setStatus(detecting ? "LIVE" : "READY", detecting ? "live" : undefined);
  } catch (err) {
    console.error(err);
    hud.setStatus("ERROR", "error");
  }
}

async function handleReset() {
  try {
    hud.setStatus("LOADING", "paused");
    await sceneHandle.loadDefault();
    overlay.clear();
    detector?.resetHistory();
    hud.setStatus(detecting ? "LIVE" : "READY", detecting ? "live" : undefined);
  } catch (err) {
    console.error(err);
    hud.setStatus("ERROR", "error");
  }
}

boot();
