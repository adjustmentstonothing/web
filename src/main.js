import {
  LISTEN_SEQUENCE_DEFAULTS,
  listenPhase2DurationMs,
} from "./ListenSequence.js";
import { RotatingPhone } from "./RotatingPhone.js";

const sceneRoot = document.getElementById("scene-root");

let attachDevStats = () => {};
if (import.meta.env.DEV) {
  const { default: Stats } =
    await import("three/examples/jsm/libs/stats.module.js");
  const stats = new Stats();
  stats.dom.id = "stats-dom";
  stats.dom.style.position = "fixed";
  stats.dom.style.top = "12px";
  stats.dom.style.left = "12px";
  stats.dom.style.opacity = "0.6";
  stats.dom.style.zIndex = "20";
  (sceneRoot ?? document.body).appendChild(stats.dom);

  attachDevStats = (phone) => {
    if (!phone?.composer) return;
    const origComposerRender = phone.composer.render.bind(phone.composer);
    phone.composer.render = (deltaTime) => {
      stats.begin();
      origComposerRender(deltaTime);
      stats.end();
    };
  };
}

const uiToggle = document.getElementById("ui-toggle");
if (uiToggle) {
  uiToggle.addEventListener("click", () => {
    document.body.classList.toggle("ui-hidden");
  });
}

const app = document.getElementById("app");

/** `record` | `listen` | `play` — play = canvas UI only (looping record ring) */
const screenMode = "listen";

/** Canvas UI opacity — top label (Record / Listen / Play) */
const uiPrimaryOpacity = 1;
/** Canvas UI opacity — bottom label, middle row, listen phase 1 rest & phase 2 fade-from */
const uiSecondaryOpacity = 0.4;
/** Record ring thickness — fraction of screen width (0.054 ≈ default) */
const borderThickness = 0.05714; // was 0.06; −2px vs screenAspectW 700

/** Listen timeline — tap immediately, then “audio playing” */
const listenIdleMs = 0;
const listenPhase1Ms = 40000;
const listenBorderWhiteFadeInMs =
  LISTEN_SEQUENCE_DEFAULTS.listenBorderWhiteFadeInMs;
const listenPhase2Ms = listenPhase2DurationMs({
  ...LISTEN_SEQUENCE_DEFAULTS,
  secondaryOpacity: uiSecondaryOpacity,
});

/**
 * Silence after delete (~10–20s) + spin sync:
 * full-border and loop end both land on startRotationDeg (−8°).
 * 2 revs by full-border, 3 revs by loop end → silence ≈ 17s.
 */
const ROT_PERIOD_AT_1 = 18;
const startRotationDeg = -8;
const fullBorderMs = listenPhase1Ms + listenBorderWhiteFadeInMs;
const spinRevsTotal = 3;
const spinRevsAtFullBorder = 2;
const listenSequenceTotalMs =
  (fullBorderMs * spinRevsTotal) / spinRevsAtFullBorder;
const listenSilenceMs = Math.max(
  10000,
  listenSequenceTotalMs - listenPhase1Ms - listenPhase2Ms,
);
const spinSpeed =
  (ROT_PERIOD_AT_1 * spinRevsTotal) / (listenSequenceTotalMs / 1000);

const phoneOptions = {
  lazyLoad: false,
  recordBorder: {
    mode: screenMode === "listen" ? "listen" : "record",
    primaryOpacity: uiPrimaryOpacity,
    secondaryOpacity: uiSecondaryOpacity,
    borderWidthPct: borderThickness,
    /** Screen canvas resolution (was 2048 for distribution) */
    maxTextureSize: 4096,
    ...LISTEN_SEQUENCE_DEFAULTS,
    /** No idle — cut in already dimmed (matches −8° start) */
    listenIdleBeforeAnim: false,
    listenIdleMs,
    listenPhase1Ms,
    listenStartDimmed: true,
    /** Skip ring 0→1 fade — was a black flash at start / each loop */
    introOpacityMs: 0,
    listenSilenceMs,
    /** Dim only at end of silence — same duration as cover fade-out */
    listenSilenceDimMs: LISTEN_SEQUENCE_DEFAULTS.listenUiFadeOutMs || 320,
    listenLoop: true,
    uiMode:
      screenMode === "play"
        ? "play"
        : screenMode === "listen"
          ? "listen"
          : screenMode === "record"
            ? "record"
            : undefined,
  },
  speed: spinSpeed, // ~0.88 — 3 revs per loop, end at −8°
  startRotationDeg,
  holdRotationUntilMs: 0,
  /** Keep spinning after delete / full white border */
  freezeRotationOnFullBorder: false,
  twoSided:
    document.getElementById("two-sided")?.classList.contains("active") ?? true,
  thickness: parseFloat(document.getElementById("thickness")?.value ?? "1"),
  gap: parseFloat(document.getElementById("gap")?.value ?? "0"),
  // scale: parseFloat(document.getElementById('scale')?.value ?? '2'),
  scale: 2,
  // brightness: parseFloat(document.getElementById("brightness")?.value ?? "0.9"),
  brightness: 1,
  /** Screen glass reflection — 0 off, 1.3 full; try 0.2–0.5 for a soft highlight */
  screenReflection: 0.2,
  /** 4× WebGL supersample for recording (scale down in post) */
  renderScale: 2,
  /** Crop CSS px off bottom silhouette to remove frame fringe */
  bottomCropPx: 10,
  // softbox: parseFloat(document.getElementById("softbox")?.value ?? "24"),
  softbox: 0,
  envRotationDeg: parseFloat(document.getElementById("env-rot")?.value ?? "73"),
  envBlur: parseFloat(document.getElementById("env-blur")?.value ?? "0.04"),
  envIntensity: parseFloat(document.getElementById("env-int")?.value ?? "2.69"),
  uv: {
    rotationDeg: parseFloat(document.getElementById("uv-rot")?.value ?? "0"),
    offsetX: parseFloat(document.getElementById("uv-ox")?.value ?? "0"),
    offsetY: parseFloat(document.getElementById("uv-oy")?.value ?? "0"),
    repeatX: parseFloat(document.getElementById("uv-rx")?.value ?? "1"),
    repeatY: parseFloat(document.getElementById("uv-ry")?.value ?? "1"),
    centerX: parseFloat(document.getElementById("uv-cx")?.value ?? "0.5"),
    centerY: parseFloat(document.getElementById("uv-cy")?.value ?? "0.5"),
  },
};

const phone = new RotatingPhone(app, phoneOptions);
attachDevStats(phone);

/** Console: `recordBorder({ borderWidthPct: 0.03 })` or `recordBorder({ mode: 'listen' })` */
window.recordBorder = (p) => phone.setRecordBorderParams(p);
/** Console: `recordReplay()` — restart listen / record intro sequence */
window.recordReplay = () => phone.resetRecordBorderSequence();
/** Console: `phoneUi({ uiMode: 'play' })` or `phoneUi({ topLabel: 'Listen' })` */
window.phoneUi = (p) => phone.setRecordBorderParams(p);
/** Console: `screenInsets()` — ring inset px, inner rect, source crop px */
window.screenInsets = () => phone.getRecordBorderInsetInfo();
/** Console: `screenReflection(0.35)` — glass highlight 0=off … ~1.3=full */
window.screenReflection = (v) => phone.setScreenReflection(v);

const bind = (id, fn) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", (e) => fn(parseFloat(e.target.value)));
};

bind("speed", (v) => phone.setSpeed(v));
bind("thickness", (v) => phone.setThickness(v));
bind("gap", (v) => phone.setGap(v));
bind("scale", (v) => phone.setScale(v));
bind("brightness", (v) => phone.setBrightness(v));
bind("softbox", (v) => phone.setSoftbox(v));

const envRotOut = document.getElementById("env-rot-v");
bind("env-rot", (v) => {
  phone.setEnvRotationDeg(v);
  if (envRotOut) envRotOut.textContent = v + "°";
});
const envBlurOut = document.getElementById("env-blur-v");
bind("env-blur", (v) => {
  phone.setEnvBlur(v);
  if (envBlurOut) envBlurOut.textContent = v.toFixed(2);
});
const envIntOut = document.getElementById("env-int-v");
bind("env-int", (v) => {
  phone.setEnvIntensity(v);
  if (envIntOut) envIntOut.textContent = v.toFixed(2);
});

const twoSidedBtn = document.getElementById("two-sided");
if (twoSidedBtn) {
  twoSidedBtn.addEventListener("click", () => {
    const active = twoSidedBtn.classList.toggle("active");
    phone.setTwoSided(active);
  });
}

const uvIds = {
  rot: ["uv-rot", "rotationDeg"],
  ox: ["uv-ox", "offsetX"],
  oy: ["uv-oy", "offsetY"],
  rx: ["uv-rx", "repeatX"],
  ry: ["uv-ry", "repeatY"],
  cx: ["uv-cx", "centerX"],
  cy: ["uv-cy", "centerY"],
};
const uvOut = {
  rot: document.getElementById("uv-rot-v"),
  ox: document.getElementById("uv-ox-v"),
  oy: document.getElementById("uv-oy-v"),
  rx: document.getElementById("uv-rx-v"),
  ry: document.getElementById("uv-ry-v"),
  cx: document.getElementById("uv-cx-v"),
  cy: document.getElementById("uv-cy-v"),
};
function applyUVFromUI() {
  const next = {};
  for (const [key, [id, prop]] of Object.entries(uvIds)) {
    const el = document.getElementById(id);
    if (el) next[prop] = parseFloat(el.value);
  }
  phone.setUV(next);
  if (uvOut.rot) uvOut.rot.textContent = next.rotationDeg + "°";
  if (uvOut.ox) uvOut.ox.textContent = next.offsetX.toFixed(2);
  if (uvOut.oy) uvOut.oy.textContent = next.offsetY.toFixed(2);
  if (uvOut.rx) uvOut.rx.textContent = next.repeatX.toFixed(2);
  if (uvOut.ry) uvOut.ry.textContent = next.repeatY.toFixed(2);
  if (uvOut.cx) uvOut.cx.textContent = next.centerX.toFixed(2);
  if (uvOut.cy) uvOut.cy.textContent = next.centerY.toFixed(2);
}
for (const [, [id]] of Object.entries(uvIds)) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", applyUVFromUI);
}

const introCapture = document.getElementById("intro-capture");
const homeMain = document.querySelector(".home-main");

if (document.body.classList.contains("home")) {
  const showStaticHome = () => {
    document.body.classList.add("home-revealed");
    phone.setPaused(true);
  };

  const showPhoneScene = () => {
    if (!document.body.classList.contains("home-revealed")) return;
    document.body.classList.remove("home-revealed");
    // Resume + resize after layout settles so the phone doesn't jump
    requestAnimationFrame(() => {
      phone.setPaused(false);
      requestAnimationFrame(() => phone.resize());
    });
  };

  introCapture?.addEventListener("pointerdown", showStaticHome);
  homeMain?.addEventListener("pointerdown", showPhoneScene);
  document.addEventListener("atn:show-phone-scene", showPhoneScene);
}
