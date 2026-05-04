import * as THREE from "three";

/** Drop undefined/null so spreads don’t overwrite defaults with `null` → Number(null) === 0 */
export function omitUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));
}

/** Single config for the record screen — edit here; `RotatingPhone` only merges `options.recordBorder` overrides. */
export const RECORD_BORDER_DEFAULTS = {
  imageUrl: "/atn-ui.png",
  maxTextureSize: 2048,
  /** Logical screen size for aspect (must match phone mesh UV / design) */
  screenAspectW: 700,
  screenAspectH: 1516,
  /** Ring band: fraction of canvas width from each edge */
  borderWidthPct: 0.054,
  /** Outer corners: fraction of min(canvas w, h) */
  outerRadiusPct: 0.15,
  /**
   * Max inner corner radius as fraction of min(innerW, innerH); capped by geometry so inner rect fits in ring.
   * Effective inner R = min(innerRadiusPct * min(innerW,innerH), max(0, R_outer - T)).
   */
  innerRadiusPct: 0.11,
  gradientSize: 116,
  gradientSpeed: 560,
  /**
   * Bright wedge direction in the **canvas bitmap** (° clockwise from +x). Combined with `spin` inside
   * `createConicGradient` (not separate `ctx.rotate`) so this value actually affects rendering.
   * Tune here or `recordBorder({ startAngleDeg })`; plus `uv.rotationDeg` on the texture for on-glass look.
   */
  startAngleDeg: -90,
  /** Border fade-in: opacity 0→1 over this many ms */
  introOpacityMs: 1000,
  /** Wedge morph: narrow (spec ~44–56% band) → full `gradientSize`, ease-in over this many ms */
  introGradientMs: 2500,
  /**
   * Half-angle (deg) at t=0 matching narrow spec (12% of circle between 44% and 56% stops ≈ 21.6°).
   * Animates up to `gradientSize` with cubic ease-in.
   */
  introHalfDegStart: 50,
};

/**
 * Offscreen canvas matches the **physical screen aspect** of the GLB (not the PNG file’s pixel ratio).
 * PNG can differ; it’s letterboxed/cropped into the inner content rect.
 *
 * Compositing (bottom → top):
 * 1. Black full canvas
 * 2. UI PNG in the inner rect (border crop in source space, direct `drawImage`)
 * 3. Conic gradient on top, clipped to the ring only — must be **after** PNG so the sweep is visible
 *
 * Inner corner radius must stay ≤ `R_outer − T` or the inner `roundRect` is larger than the ring allows and
 * `evenodd` clip can drop the whole ring (invisible border).
 */
export class RecordBorderScreen {
  constructor(renderer, options = {}) {
    this.opts = {
      ...RECORD_BORDER_DEFAULTS,
      ...omitUndefined(options),
    };

    this._introT0 = typeof performance !== "undefined" ? performance.now() : 0;

    const aw =
      Number(this.opts.screenAspectW) || RECORD_BORDER_DEFAULTS.screenAspectW;
    const ah =
      Number(this.opts.screenAspectH) || RECORD_BORDER_DEFAULTS.screenAspectH;
    const maxTS =
      Number(this.opts.maxTextureSize) || RECORD_BORDER_DEFAULTS.maxTextureSize;
    const scale = maxTS / Math.max(aw, ah);
    const w = Math.max(1, Math.round(aw * scale));
    const h = Math.max(1, Math.round(ah * scale));

    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d", { alpha: false });

    this.spin = 0;
    /** Wall-clock frame delta for spin — Clock.getDelta() is often 0 early frames and freezes the sweep */
    this._prevSpinWallMs = null;

    this.img = new Image();
    this.img.crossOrigin = "anonymous";
    this.imgLoaded = false;
    this.img.onload = () => {
      this.imgLoaded = true;
      this._redraw();
      this.texture.needsUpdate = true;
    };
    this.img.src = this.opts.imageUrl;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    this._redraw();
  }

  getSpinDuration() {
    const H = Math.max(1, this.canvas.height);
    const W = Math.max(1, this.canvas.width);
    const speed = Math.max(1, Number(this.opts.gradientSpeed) || 360);
    return (2 * (H + W)) / speed;
  }

  tick(_deltaTimeSec) {
    const Tspin = this.getSpinDuration();
    if (
      Tspin > 0 &&
      Number.isFinite(Tspin) &&
      typeof performance !== "undefined"
    ) {
      const now = performance.now();
      if (this._prevSpinWallMs == null) this._prevSpinWallMs = now;
      let dt = (now - this._prevSpinWallMs) / 1000;
      this._prevSpinWallMs = now;
      if (dt > 0.25) dt = 0.25;
      this.spin += (dt / Tspin) * Math.PI * 2;
    }
    this._redraw();
    this.texture.needsUpdate = true;
  }

  setParams(partial) {
    Object.assign(this.opts, omitUndefined(partial));
    this._redraw();
    this.texture.needsUpdate = true;
  }

  _layout() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const T = this.opts.borderWidthPct * w;
    const innerW = w - 2 * T;
    const innerH = h - 2 * T;
    const R_outer = this.opts.outerRadiusPct * Math.min(w, h);
    const innerRDesired = this.opts.innerRadiusPct * Math.min(innerW, innerH);
    /** Inner path must sit inside outer − T or evenodd ring clip yields empty / broken paths */
    const R_inner = Math.min(innerRDesired, Math.max(0, R_outer - T));
    return { w, h, T, innerW, innerH, R_outer, R_inner };
  }

  getInsetInfo() {
    const { w, h, T, innerW, innerH } = this._layout();
    let borderSourceCropPx = null;
    if (this.imgLoaded && this.img?.naturalWidth > 0) {
      const iw = this.img.naturalWidth;
      const ih = this.img.naturalHeight;
      const tx = (T / w) * iw;
      const ty = (T / h) * ih;
      borderSourceCropPx = {
        left: tx,
        top: ty,
        w: iw - 2 * tx,
        h: ih - 2 * ty,
      };
    }
    return {
      screenAspect: { w: this.opts.screenAspectW, h: this.opts.screenAspectH },
      canvas: { w, h },
      ringInsetPx: T,
      innerContentRectPx: { x: T, y: T, w: innerW, h: innerH },
      borderSourceCropPx,
    };
  }

  _introState() {
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const elapsed = now - this._introT0;
    const tOp = this.opts.introOpacityMs;
    const tGr = this.opts.introGradientMs;
    const ringAlpha = tOp > 0 ? Math.min(1, elapsed / tOp) : 1;
    const u = tGr > 0 ? Math.min(1, elapsed / tGr) : 1;
    const morphEaseIn = u * u * u;
    const W0 = this.opts.introHalfDegStart;
    const W1 = this.opts.gradientSize;
    const W_eff = W0 + (W1 - W0) * morphEaseIn;
    const edgeSolid = morphEaseIn;
    return { elapsed, ringAlpha, morphEaseIn, W_eff, edgeSolid };
  }

  _drawRingGradient(ctx, w, h, T, innerW, innerH, R_outer, R_inner) {
    const { ringAlpha, W_eff, edgeSolid } = this._introState();
    const edge = `rgba(0,0,0,${edgeSolid})`;

    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(0, 0, w, h, R_outer);
      ctx.roundRect(T, T, innerW, innerH, R_inner);
    } else {
      this._roundRectPath(ctx, 0, 0, w, h, R_outer);
      this._roundRectPath(ctx, T, T, innerW, innerH, R_inner);
    }
    ctx.clip("evenodd");

    ctx.globalAlpha = ringAlpha;

    const L = 1.5 * Math.max(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const startDeg = Number(this.opts.startAngleDeg);
    const baseDeg = Number.isFinite(startDeg)
      ? startDeg
      : RECORD_BORDER_DEFAULTS.startAngleDeg;
    const baseRad = (baseDeg * Math.PI) / 180;

    ctx.translate(cx, cy);
    /**
     * One rotation for both start angle and spin. Splitting `rotate(spin)` + `gradient(baseRad)` makes
     * `startAngleDeg` look ignored; baking only `phase` into `createConicGradient` broke motion on some GPUs.
     */
    ctx.rotate(baseRad + this.spin);
    const g = ctx.createConicGradient(0, 0, 0);
    const a = W_eff / 360;
    const c0 = Math.max(0, 0.5 - a);
    const c1 = Math.min(1, 0.5 + a);
    g.addColorStop(0, edge);
    g.addColorStop(c0, edge);
    g.addColorStop(0.5, "#ffffff");
    g.addColorStop(c1, edge);
    g.addColorStop(1, edge);

    ctx.fillStyle = g;
    ctx.fillRect(-L / 2, -L / 2, L, L);
    ctx.restore();
  }

  _redraw() {
    const ctx = this.ctx;
    const { w, h, T, innerW, innerH, R_outer, R_inner } = this._layout();

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);

    if (this.imgLoaded && this.img.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(T, T, innerW, innerH, R_inner);
      } else {
        this._roundRectPath(ctx, T, T, innerW, innerH, R_inner);
      }
      ctx.clip();

      const iw = this.img.naturalWidth;
      const ih = this.img.naturalHeight;
      const tx = (T / w) * iw;
      const ty = (T / h) * ih;
      const sw = iw - 2 * tx;
      const sh = ih - 2 * ty;
      ctx.drawImage(this.img, tx, ty, sw, sh, T, T, innerW, innerH);
      ctx.restore();
    }

    this._drawRingGradient(ctx, w, h, T, innerW, innerH, R_outer, R_inner);
  }

  _roundRectPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  dispose() {
    this.texture?.dispose?.();
    this.texture = null;
    this.img = null;
  }
}
