import {
  Engine,
  Scene,
  SceneLoader,
  ArcRotateCamera,
  Vector3,
  Color4,
  DirectionalLight,
  ShadowGenerator,
  MeshBuilder,
  BackgroundMaterial,
  ImportMeshAsync,
  RenderTargetTexture,
} from "@babylonjs/core";
import { FilesInputStore } from "@babylonjs/core/Misc/filesInputStore";
import "@babylonjs/loaders/glTF";

const MODEL_ROOT = "";
const MODEL_FILE = "CarConcept.glb";
const TARGET_SIZE = 4; // normalized largest dimension, world units

function importMesh(rootUrl, sceneFilename, scene) {
  return new Promise((resolve, reject) => {
    SceneLoader.ImportMesh(
      "",
      rootUrl,
      sceneFilename,
      scene,
      (meshes) => resolve({ meshes }),
      null,
      (_scene, message) => reject(new Error(message))
    );
  });
}

export async function createBabylonScene(canvas) {
  // preserveDrawingBuffer: required so the detector can read WebGL pixels.
  // adaptToDeviceRatio off: smaller backing store = faster fill + cheaper
  // detection grabs on high-DPI displays.
  const engine = new Engine(
    canvas,
    true,
    { preserveDrawingBuffer: true, stencil: true },
    false
  );

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.028, 0.035, 0.047, 1);

  // --- Camera ---------------------------------------------------------------
  const camera = new ArcRotateCamera(
    "camera",
    -Math.PI / 2 - Math.PI / 6,
    1.05,
    TARGET_SIZE * 1.9,
    new Vector3(0, TARGET_SIZE * 0.35, 0),
    scene
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = TARGET_SIZE * 1.1;
  camera.upperRadiusLimit = TARGET_SIZE * 4;
  camera.lowerBetaLimit = 0.35;
  camera.upperBetaLimit = 1.45;
  camera.wheelDeltaPercentage = 0.01;
  camera.pinchDeltaPercentage = 0.01;
  camera.useAutoRotationBehavior = true;
  camera.autoRotationBehavior.idleRotationSpeed = 0.12;
  camera.autoRotationBehavior.idleRotationWaitTime = 2000;

  // --- Lighting -------------------------------------------------------------
  // Image-based studio lighting (HDR from Babylon CDN)
  scene.createDefaultEnvironment({
    createGround: false,
    createSkybox: false,
  });
  scene.environmentIntensity = 0.8;

  // Key light for the contact shadow
  const key = new DirectionalLight("key", new Vector3(-0.4, -1, -0.35), scene);
  key.position = new Vector3(4, 10, 4);
  key.intensity = 0.9;

  const shadowGen = new ShadowGenerator(1024, key);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.blurKernel = 32;
  shadowGen.darkness = 0.35;
  // Light and model are static between loads: bake the shadow map once per
  // model instead of re-rendering it every frame.
  shadowGen.getShadowMap().refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;

  // Shadow-catcher ground
  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: TARGET_SIZE * 6, height: TARGET_SIZE * 6 },
    scene
  );
  const shadowMat = new BackgroundMaterial("shadowOnly", scene);
  shadowMat.shadowOnly = true;
  ground.material = shadowMat;
  ground.receiveShadow = true;

  // --- Model management -----------------------------------------------------
  let modelMeshes = [];

  function applyModel(meshes) {
    for (const mesh of modelMeshes) mesh.dispose();
    modelMeshes = meshes;

    // Normalize: center at origin, scale largest dimension to TARGET_SIZE
    const root = meshes[0];
    const bounds = root.getHierarchyBoundingVectors(true);
    const size = bounds.max.subtract(bounds.min);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    root.scaling.scaleInPlace(TARGET_SIZE / maxDim);

    const nb = root.getHierarchyBoundingVectors(true);
    const center = nb.max.add(nb.min).scale(0.5);
    root.position.subtractInPlace(new Vector3(center.x, nb.min.y, center.z));

    // aim the camera at the model's vertical center (works for flat and tall models)
    camera.target.y = (nb.max.y - nb.min.y) * 0.45;

    for (const mesh of meshes) {
      if (mesh.getTotalVertices() > 0) shadowGen.addShadowCaster(mesh);
    }
    shadowGen.getShadowMap().resetRefreshCounter();
  }

  async function loadDefault() {
    const result = await ImportMeshAsync(MODEL_ROOT + MODEL_FILE, scene);
    applyModel(result.meshes);
  }

  // Accepts a FileList/Array containing one .glb, or a .gltf plus its
  // sibling resources (.bin, textures) selected together.
  async function loadFiles(files) {
    const list = [...files];
    const model = list.find((f) => /\.(glb|gltf)$/i.test(f.name));
    if (!model) throw new Error("no .glb or .gltf file in selection");

    for (const f of list) {
      FilesInputStore.FilesToLoad[f.name.toLowerCase()] = f;
    }
    try {
      const result = await importMesh("file:", model.name, scene);
      applyModel(result.meshes);
    } finally {
      for (const f of list) {
        delete FilesInputStore.FilesToLoad[f.name.toLowerCase()];
      }
    }
  }

  await loadDefault();

  return { engine, scene, camera, loadDefault, loadFiles };
}
