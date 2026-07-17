const $ = (id) => document.getElementById(id);

export const hud = {
  // --- loader ---------------------------------------------------------------
  setLoaderStage(text, progress) {
    $("loaderLog").textContent = text;
    $("loaderBar").style.width = `${Math.round(progress * 100)}%`;
  },

  hideLoader() {
    const loader = $("loader");
    loader.classList.add("done");
    setTimeout(() => loader.remove(), 700);
  },

  // --- status chip ----------------------------------------------------------
  setStatus(text, state) {
    $("statusText").textContent = text;
    const chip = $("statusChip");
    chip.classList.remove("live", "paused", "error");
    if (state) chip.classList.add(state);
  },

  // --- stats ----------------------------------------------------------------
  updateStats({ latency, fps, count }) {
    $("statLatency").innerHTML = `${Math.round(latency)}<small>ms</small>`;
    $("statFps").innerHTML = `${Math.round(fps)}<small>fps</small>`;
    $("statCount").textContent = count;
  },

  // --- detect button ----------------------------------------------------------
  // state: "idle" | "loading" | "live"
  setDetectState(state) {
    const btn = $("detectBtn");
    btn.classList.remove("loading", "live");
    btn.disabled = false;
    if (state === "idle") {
      btn.textContent = "DETECT";
    } else if (state === "loading") {
      btn.classList.add("loading");
      btn.textContent = "LOAD 0%";
      btn.disabled = true;
    } else {
      btn.classList.add("live");
      btn.textContent = "STOP";
    }
  },

  setDetectProgress(progress) {
    $("detectBtn").textContent = `LOAD ${Math.round(progress)}%`;
  },

  // --- controls ---------------------------------------------------------------
  bindControls({ onThreshold, onDetectToggle, onUpload, onReset }) {
    const slider = $("threshold");
    slider.addEventListener("input", () => {
      const value = slider.value / 100;
      $("thresholdValue").textContent = `${slider.value}%`;
      onThreshold(value);
    });

    $("detectBtn").addEventListener("click", onDetectToggle);

    const fileInput = $("modelFileInput");
    $("uploadBtn").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      if (fileInput.files.length) onUpload(fileInput.files);
      fileInput.value = "";
    });

    $("resetBtn").addEventListener("click", onReset);

    // drag & drop anywhere
    const dropzone = $("dropzone");
    let dragDepth = 0;
    window.addEventListener("dragenter", (e) => {
      e.preventDefault();
      dragDepth++;
      dropzone.classList.add("visible");
    });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("dragleave", (e) => {
      e.preventDefault();
      if (--dragDepth <= 0) {
        dragDepth = 0;
        dropzone.classList.remove("visible");
      }
    });
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      dragDepth = 0;
      dropzone.classList.remove("visible");
      if (e.dataTransfer.files.length) onUpload(e.dataTransfer.files);
    });
  },
};
