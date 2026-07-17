/**
 * 2D overlay canvas sitting on top of the WebGL render canvas.
 * Draws detection boxes: thin full rect + bold corner brackets + label chip.
 * Coordinates from MediaPipe are in render-canvas backing-store pixels,
 * so we scale by (cssSize / backingStoreSize).
 */
export class DetectionOverlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  resize(cssWidth, cssHeight, dpr) {
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(detections, srcWidth, srcHeight) {
    const { ctx, canvas } = this;
    this.clear();
    if (!detections || detections.length === 0) return;

    const scaleX = canvas.width / srcWidth;
    const scaleY = canvas.height / srcHeight;
    const dpr = canvas.width / parseFloat(canvas.style.width);

    ctx.lineJoin = "round";
    ctx.font = `${11 * dpr}px "JetBrains Mono", monospace`;
    ctx.textBaseline = "middle";

    for (const det of detections) {
      const bb = det.boundingBox;
      if (!bb) continue;
      const cat = det.categories[0];
      const label = `${cat.categoryName} ${Math.round(cat.score * 100)}%`;

      const x = bb.originX * scaleX;
      const y = bb.originY * scaleY;
      const w = bb.width * scaleX;
      const h = bb.height * scaleY;

      // thin full rect
      ctx.strokeStyle = "rgba(0, 229, 255, 0.35)";
      ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(x, y, w, h);

      // bold corner brackets
      const arm = Math.min(14 * dpr, w / 4, h / 4);
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath();
      // tl
      ctx.moveTo(x, y + arm); ctx.lineTo(x, y); ctx.lineTo(x + arm, y);
      // tr
      ctx.moveTo(x + w - arm, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + arm);
      // br
      ctx.moveTo(x + w, y + h - arm); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - arm, y + h);
      // bl
      ctx.moveTo(x + arm, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - arm);
      ctx.stroke();

      // label chip above box (flip below if near top)
      const padX = 6 * dpr;
      const chipH = 20 * dpr;
      const textW = ctx.measureText(label).width;
      const chipW = textW + padX * 2;
      let chipY = y - chipH;
      if (chipY < 0) chipY = y;

      ctx.fillStyle = "rgba(0, 229, 255, 0.92)";
      ctx.fillRect(x, chipY, chipW, chipH);
      ctx.fillStyle = "#04161a";
      ctx.fillText(label.toUpperCase(), x + padX, chipY + chipH / 2 + dpr);
    }
  }
}
