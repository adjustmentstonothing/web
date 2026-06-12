import * as THREE from "three";
import {
  drawPhoneScreenUI,
  loadPhoneUIFont,
  PHONE_UI_PRESETS,
} from "./PhoneScreenUI.js";
import {
  computeListenTimeline,
  LISTEN_SEQUENCE_DEFAULTS,
} from "./ListenSequence.js";

/** Drop undefined/null so spreads don’t overwrite defaults with `null` → Number(null) === 0 */
export function omitUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));
}

/** Single config for the record screen — edit here; `RotatingPhone` only merges `options.recordBorder` overrides. */
export const RECORD_BORDER_DEFAULTS = {
  /** `listen` | `record` | `play` — top/bottom labels; defaults from `mode` when null */
  uiMode: null,
  topLabel: null,
  bottomLabel: null,
  leftLabel: "Adjustments to Nothing",
  rightLabel: "About",
  /** Top label opacity (e.g. Record / Listen / Play) */
  primaryOpacity: 1,
  /** Bottom label + middle row opacity (record / listen phase 1 & 2 fade-from) */
  secondaryOpacity: 0.3,
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
  /** `record` = looping spin; `listen` = phased sequence (see ListenSequence.js) */
  mode: "record",
  ...LISTEN_SEQUENCE_DEFAULTS,
};

/**
 * Offscreen canvas matches the **physical screen aspect** of the GLB.
 *
 * Compositing (bottom → top):
 * 1. Black full canvas
 * 2. Canvas UI (PhoneScreenUI) in the inner rect
 * 3. Conic gradient on top, clipped to the ring only
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

    loadPhoneUIFont().then(() => {
      this._redraw();
      this.texture.needsUpdate = true;
    });

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

  _listenTimeline() {
    return computeListenTimeline(this._elapsedMs(), this.opts);
  }

  tick(_deltaTimeSec) {
    const freezeSpin =
      this.opts.mode === "listen" && this._listenTimeline().ring.freezeSpin;
    const Tspin = this.getSpinDuration();
    if (
      !freezeSpin &&
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

  resetSequence() {
    this._introT0 = typeof performance !== "undefined" ? performance.now() : 0;
    this.spin = 0;
    this._prevSpinWallMs = null;
    this._redraw();
    this.texture.needsUpdate = true;
  }

  _resolvedUiMode() {
    if (this.opts.uiMode && PHONE_UI_PRESETS[this.opts.uiMode]) {
      return this.opts.uiMode;
    }
    if (this.opts.mode === "listen") return "listen";
    if (this.opts.mode === "record") return "record";
    return "listen";
  }

  setParams(partial) {
    const clean = omitUndefined(partial);
    const listenKeys = Object.keys(LISTEN_SEQUENCE_DEFAULTS);
    const listenTimingChanged =
      this.opts.mode === "listen" &&
      listenKeys.some((k) => k in clean);
    if (
      (clean.mode && clean.mode !== this.opts.mode) ||
      listenTimingChanged
    ) {
      this.resetSequence();
    }
    if (clean.screenAspectW != null || clean.screenAspectH != null) {
      this.setScreenAspect(
        Number(clean.screenAspectW ?? this.opts.screenAspectW),
        Number(clean.screenAspectH ?? this.opts.screenAspectH),
      );
      delete clean.screenAspectW;
      delete clean.screenAspectH;
    }
    Object.assign(this.opts, clean);
    this._redraw();
    this.texture.needsUpdate = true;
  }

  /** Resize offscreen canvas when the GLB screen mesh aspect changes. */
  setScreenAspect(aspectW, aspectH) {
    const aw = Number(aspectW) || RECORD_BORDER_DEFAULTS.screenAspectW;
    const ah = Number(aspectH) || RECORD_BORDER_DEFAULTS.screenAspectH;
    const maxTS =
      Number(this.opts.maxTextureSize) || RECORD_BORDER_DEFAULTS.maxTextureSize;
    const scale = maxTS / Math.max(aw, ah);
    const w = Math.max(1, Math.round(aw * scale));
    const h = Math.max(1, Math.round(ah * scale));
    this.opts.screenAspectW = aw;
    this.opts.screenAspectH = ah;
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
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
    return {
      screenAspect: { w: this.opts.screenAspectW, h: this.opts.screenAspectH },
      canvas: { w, h },
      ringInsetPx: T,
      innerContentRectPx: { x: T, y: T, w: innerW, h: innerH },
    };
  }

  _elapsedMs() {
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    return now - this._introT0;
  }

  _easeInOut(t) {
    const u = Math.max(0, Math.min(1, t));
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }

  _easeOut(t) {
    const u = Math.max(0, Math.min(1, t));
    return 1 - Math.pow(1 - u, 3);
  }

  _introState(elapsed = this._elapsedMs()) {
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

  _listenRingState() {
    const elapsed = this._elapsedMs();
    const tl = this._listenTimeline();
    const ring = tl.ring;
    if (!ring.showRing) {
      return {
        phase: `listen-${tl.phase}`,
        showRing: false,
        freezeSpin: true,
        ringAlpha: 0,
        W_eff: 0,
        edgeSolid: 0,
        whiteOverlay: 0,
      };
    }

    const fade = ring.ringFade ?? 1;
    const overlay = ring.whiteOverlay ?? 0;
    const intro = this._introState(elapsed);

    if (tl.phase === 1) {
      return {
        phase: "listen-1",
        showRing: true,
        freezeSpin: false,
        ringAlpha: intro.ringAlpha * fade,
        W_eff: intro.W_eff,
        edgeSolid: intro.edgeSolid,
        whiteOverlay: 0,
        drawGradient: true,
      };
    }

    return {
      phase: ring.useGradient ? "listen-2-layered" : "listen-2-white",
      showRing: true,
      freezeSpin: !ring.useGradient,
      ringAlpha: intro.ringAlpha * fade,
      W_eff: ring.useGradient ? intro.W_eff : this.opts.gradientSize,
      edgeSolid: ring.useGradient ? intro.edgeSolid : 0,
      whiteOverlay: overlay,
      drawGradient: ring.useGradient || overlay < 1,
    };
  }

  _ringState() {
    if (this.opts.mode === "listen") return this._listenRingState();
    const intro = this._introState();
    return {
      phase: "record",
      showRing: true,
      freezeSpin: false,
      ringAlpha: intro.ringAlpha,
      W_eff: intro.W_eff,
      edgeSolid: intro.edgeSolid,
      whiteOverlay: 0,
    };
  }

  _clipRingPath(ctx, w, h, T, innerW, innerH, R_outer, R_inner) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(0, 0, w, h, R_outer);
      ctx.roundRect(T, T, innerW, innerH, R_inner);
    } else {
      this._roundRectPath(ctx, 0, 0, w, h, R_outer);
      this._roundRectPath(ctx, T, T, innerW, innerH, R_inner);
    }
    ctx.clip("evenodd");
  }

  _drawConicRing(ctx, w, h, state) {
    const { ringAlpha, W_eff, edgeSolid } = state;
    const edge = `rgba(0,0,0,${edgeSolid})`;
    const L = 1.5 * Math.max(w, h);
    const cx = w / 2;
    const cy = h / 2;
    let startDeg = Number(this.opts.startAngleDeg);
    if (this.opts.mode === "listen") {
      const listenDeg = Number(this.opts.listenStartAngleDeg);
      if (Number.isFinite(listenDeg)) startDeg = listenDeg;
    }
    const baseDeg = Number.isFinite(startDeg)
      ? startDeg
      : RECORD_BORDER_DEFAULTS.startAngleDeg;
    const baseRad = (baseDeg * Math.PI) / 180;

    ctx.save();
    ctx.globalAlpha = ringAlpha;
    ctx.translate(cx, cy);
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

  _drawSolidRing(ctx, w, h, alpha) {
    const L = 1.5 * Math.max(w, h);
    const cx = w / 2;
    const cy = h / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-L / 2, -L / 2, L, L);
    ctx.restore();
  }

  _drawRingGradient(ctx, w, h, T, innerW, innerH, R_outer, R_inner) {
    const state = this._ringState();
    if (!state.showRing) return;

    ctx.save();
    this._clipRingPath(ctx, w, h, T, innerW, innerH, R_outer, R_inner);

    const overlay = state.whiteOverlay ?? 0;
    if (overlay > 0) {
      if (state.drawGradient !== false) {
        this._drawConicRing(ctx, w, h, state);
      }
      this._drawSolidRing(ctx, w, h, state.ringAlpha * overlay);
    } else {
      this._drawConicRing(ctx, w, h, state);
    }

    ctx.restore();
  }

  _redraw() {
    const ctx = this.ctx;
    const { w, h, T, innerW, innerH, R_outer, R_inner } = this._layout();

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(T, T, innerW, innerH, R_inner);
    } else {
      this._roundRectPath(ctx, T, T, innerW, innerH, R_inner);
    }
    ctx.clip();

    const uiOpts = {
      uiMode: this._resolvedUiMode(),
      topLabel: this.opts.topLabel,
      bottomLabel: this.opts.bottomLabel,
      leftLabel: this.opts.leftLabel,
      rightLabel: this.opts.rightLabel,
      primaryOpacity: this.opts.primaryOpacity,
      secondaryOpacity: this.opts.secondaryOpacity,
    };
    if (this.opts.mode === "listen") {
      const tl = this._listenTimeline();
      uiOpts.primaryOpacity = tl.primaryOpacity;
      uiOpts.middleOpacity = tl.middleOpacity;
      uiOpts.bottomOpacity = tl.bottomOpacity;
      if (tl.primaryLabel) uiOpts.topLabel = tl.primaryLabel;
    } else if (this._resolvedUiMode() === "record") {
      uiOpts.primaryOpacity = this.opts.secondaryOpacity;
      uiOpts.middleOpacity = this.opts.secondaryOpacity;
      uiOpts.bottomOpacity = this.opts.primaryOpacity;
    }
    drawPhoneScreenUI(ctx, { x: T, y: T, w: innerW, h: innerH }, uiOpts);
    ctx.restore();

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
  }
}
