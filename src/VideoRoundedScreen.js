import * as THREE from "three";
import { omitUndefined } from "./RecordBorderScreen.js";

/** iPhone 17 Pro native video size (1206×2622) */
const SCREEN_W = 1206;
const SCREEN_H = 2622;
const SCREEN_W_PT = 402;
const INNER_CORNER_PT = 47.33 * (402 / 393);

export const VIDEO_ROUNDED_DEFAULTS = {
  screenAspectW: SCREEN_W,
  screenAspectH: SCREEN_H,
  cornerRadiusPt: INNER_CORNER_PT,
  maxTextureSize: 2048,
  fit: "cover",
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
  maskBgColor: "#000000",
};

export class VideoRoundedScreen {
  constructor(renderer, options = {}) {
    this.opts = {
      ...VIDEO_ROUNDED_DEFAULTS,
      ...omitUndefined(options),
    };

    const aw =
      Number(this.opts.screenAspectW) || VIDEO_ROUNDED_DEFAULTS.screenAspectW;
    const ah =
      Number(this.opts.screenAspectH) || VIDEO_ROUNDED_DEFAULTS.screenAspectH;
    const maxTS =
      Number(this.opts.maxTextureSize) || VIDEO_ROUNDED_DEFAULTS.maxTextureSize;
    const scale = maxTS / Math.max(aw, ah);
    const w = Math.max(1, Math.round(aw * scale));
    const h = Math.max(1, Math.round(ah * scale));

    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d", { alpha: false });

    this.video = document.createElement("video");
    this.video.src = options.videoUrl;
    this.video.crossOrigin = "anonymous";
    this.video.loop = true;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute("playsinline", "");
    this.video.setAttribute("webkit-playsinline", "");

    this.videoReady = false;
    const playVideo = () => {
      this.video.play().catch(() => {});
    };
    this.video.addEventListener("loadeddata", () => {
      this.videoReady = true;
      playVideo();
      this._redraw();
      this.texture.needsUpdate = true;
    });
    playVideo();

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

  _cornerRadiusPx() {
    const w = this.canvas.width;
    const radiusPt =
      Number(this.opts.cornerRadiusPt) || VIDEO_ROUNDED_DEFAULTS.cornerRadiusPt;
    return (radiusPt / SCREEN_W_PT) * w;
  }

  _videoDestRect() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) return { x: 0, y: 0, w, h };

    const canvasAspect = w / h;
    const videoAspect = vw / vh;
    const scaleX = Number(this.opts.scaleX) || 1;
    const scaleY = Number(this.opts.scaleY) || 1;
    const offsetX = (Number(this.opts.offsetX) || 0) * w;
    const offsetY = (Number(this.opts.offsetY) || 0) * h;

    if (
      Math.abs(videoAspect - canvasAspect) < 0.002 &&
      Math.abs(scaleX - 1) < 1e-6 &&
      Math.abs(scaleY - 1) < 1e-6 &&
      Math.abs(offsetX) < 1e-6 &&
      Math.abs(offsetY) < 1e-6
    ) {
      return { x: 0, y: 0, w, h };
    }

    const fit = this.opts.fit === "contain" ? "contain" : "cover";
    let dw;
    let dh;

    if (fit === "cover") {
      if (videoAspect > canvasAspect) {
        dh = h;
        dw = h * videoAspect;
      } else {
        dw = w;
        dh = w / videoAspect;
      }
    } else if (videoAspect > canvasAspect) {
      dw = w;
      dh = w / videoAspect;
    } else {
      dh = h;
      dw = h * videoAspect;
    }

    dw *= scaleX;
    dh *= scaleY;

    return {
      x: (w - dw) / 2 + offsetX,
      y: (h - dh) / 2 + offsetY,
      w: dw,
      h: dh,
    };
  }

  tick() {
    if (!this.videoReady || this.video.readyState < 2) return;
    this._redraw();
    this.texture.needsUpdate = true;
  }

  setParams(partial) {
    Object.assign(this.opts, omitUndefined(partial));
    this._redraw();
    this.texture.needsUpdate = true;
  }

  getMaskInfo() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    return {
      canvas: { w, h },
      cornerRadiusPx: this._cornerRadiusPx(),
      screenAspect: { w: this.opts.screenAspectW, h: this.opts.screenAspectH },
      videoRectPx: this._videoDestRect(),
      videoSize:
        this.video.videoWidth > 0
          ? { w: this.video.videoWidth, h: this.video.videoHeight }
          : null,
    };
  }

  _redraw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const r = this._cornerRadiusPx();

    ctx.fillStyle = this.opts.maskBgColor || VIDEO_ROUNDED_DEFAULTS.maskBgColor;
    ctx.fillRect(0, 0, w, h);

    if (!this.videoReady || this.video.readyState < 2) return;

    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(0, 0, w, h, r);
    } else {
      this._roundRectPath(ctx, 0, 0, w, h, r);
    }
    ctx.clip();

    const rect = this._videoDestRect();
    ctx.drawImage(this.video, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  _roundRectPath(ctx, x, y, width, height, radius) {
    const rad = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + width - rad, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + rad);
    ctx.lineTo(x + width, y + height - rad);
    ctx.quadraticCurveTo(x + width, y + height, x + width - rad, y + height);
    ctx.lineTo(x + rad, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  dispose() {
    this.video?.pause();
    this.video?.removeAttribute("src");
    this.video?.load();
    this.video = null;
    this.texture?.dispose?.();
    this.texture = null;
  }
}
