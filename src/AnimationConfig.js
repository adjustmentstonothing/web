import {
  LISTEN_SEQUENCE_DEFAULTS,
  listenPhase2DurationMs,
} from "./ListenSequence.js";

/**
 * Top-level sequence mode — flip this to switch Record vs Listen.
 * `record` | `listen` | `play`
 */
export const screenMode = "record";

/**
 * Render / load profile:
 * - `production` — fast website load (lower GPU / texture cost)
 * - `video` — max quality for screenshots / capture (heavier)
 */
export const renderProfile = "production"; // "production" | "video"

export const RENDER_PROFILES = {
  production: {
    lazyLoad: false,
    renderScale: 1,
    maxTextureSize: 2048,
    softbox: 0,
    screenReflection: 0.2,
    bottomCropPx: 1,
    /** Cap devicePixelRatio before renderScale */
    maxPixelRatio: 2,
  },
  video: {
    lazyLoad: false,
    renderScale: 2,
    maxTextureSize: 4096,
    softbox: 0,
    screenReflection: 0.2,
    bottomCropPx: 10,
    maxPixelRatio: 2,
  },
};

export function resolveRenderProfile(profile = renderProfile) {
  return (
    RENDER_PROFILES[profile] ??
    RENDER_PROFILES.production ??
    RENDER_PROFILES.video
  );
}

/** Default border conic spin (°/s). Higher = faster racing wedge. */
// const DEFAULT_GRADIENT_SPEED = 1260;
const DEFAULT_GRADIENT_SPEED = 860;

/**
 * Record sequence — rotation + border knobs.
 * - startRotationDeg   — yaw at start (held if rotationSpeed is 0)
 * - rotationSpeed      — phone spin rate (1 ≈ one rev / 18s). 0 = still.
 * - gradientSpeed      — border wedge spin (°/s)
 * - introHalfDegStart  — wedge half-angle at t=0 (full size ≈ gradientSize 116)
 * - introGradientMs    — ms to morph from introHalfDegStart → gradientSize (0 = already full)
 */
export const RECORD_CONFIG = {
  startRotationDeg: 0,
  rotationSpeed: 0.43,
  gradientSpeed: DEFAULT_GRADIENT_SPEED,
  /** Closer to 116 = less “short line” flash; try 90–116 */
  introHalfDegStart: 100,
  introGradientMs: 2500,
};

/**
 * Listen sequence — flip `animationVariant` or edit the active preset.
 *
 * Knobs:
 * - startRotationDeg      — yaw at sequence start (loop ends here too)
 * - fullBorderSpinDeg     — degrees traveled until full-border / Deleted
 * - rotationSpeed         — phone spin rate; 0 = hold still at startRotationDeg
 * - gradientSpeed         — border wedge spin (°/s)
 * - listenPhase1Ms        — Listen/audio length when rotationSpeed is 0
 * - totalSpinDeg          — total degrees by loop end (360 → back to start)
 * - listenBtnFadeInMs     — 0 = Listen on immediately; 1200 = fade in
 */
export const animationVariant = "short"; // "full" | "short"

/** Base period (s) for rotationSpeed=1 → one full revolution. */
const ROT_PERIOD_AT_1 = 18;

/** Floor so dim / delete UI still has room if speed is very high. */
const MIN_PHASE1_MS = 2000;

/** Fallback Listen hold when rotationSpeed is 0. */
const DEFAULT_STATIC_PHASE1_MS = 20000;

export const ANIMATION_PRESETS = {
  full: {
    startRotationDeg: -8,
    fullBorderSpinDeg: 720,
    rotationSpeed: 0.88,
    gradientSpeed: DEFAULT_GRADIENT_SPEED,
    totalSpinDeg: 1080,
    listenBtnFadeInMs: 1200,
    freezeRotationOnFullBorder: false,
  },
  short: {
    startRotationDeg: 0,
    fullBorderSpinDeg: 180,
    rotationSpeed: 0.43,
    gradientSpeed: DEFAULT_GRADIENT_SPEED,
    listenPhase1Ms: 20000,
    totalSpinDeg: 360,
    listenBtnFadeInMs: 0,
    freezeRotationOnFullBorder: false,
  },
};

export function resolveRecordConfig(cfg = RECORD_CONFIG) {
  const startRotationDeg = Number(cfg.startRotationDeg) || 0;
  let rotationSpeed = Number(cfg.rotationSpeed);
  if (!Number.isFinite(rotationSpeed) || rotationSpeed < 0) {
    rotationSpeed = 0.8;
  }
  const introHalfDegStart = Number(cfg.introHalfDegStart);
  const introGradientMs = Number(cfg.introGradientMs);
  let gradientSpeed = Number(cfg.gradientSpeed);
  if (!Number.isFinite(gradientSpeed) || gradientSpeed <= 0) {
    gradientSpeed = DEFAULT_GRADIENT_SPEED;
  }
  return {
    mode: "record",
    startRotationDeg,
    rotationSpeed,
    spinSpeed: rotationSpeed,
    gradientSpeed,
    freezeRotationOnFullBorder: false,
    staticHold: rotationSpeed === 0,
    ...(Number.isFinite(introHalfDegStart) ? { introHalfDegStart } : {}),
    ...(Number.isFinite(introGradientMs) ? { introGradientMs } : {}),
  };
}

/**
 * Resolve listen preset → phone options for rotation + listen timeline.
 * @param {string} variant
 * @param {{ secondaryOpacity?: number }} [ui]
 */
export function resolveAnimationConfig(variant = animationVariant, ui = {}) {
  const preset =
    ANIMATION_PRESETS[variant] ??
    ANIMATION_PRESETS.short ??
    ANIMATION_PRESETS.full;

  const secondaryOpacity = Number(ui.secondaryOpacity);
  const secOp = Number.isFinite(secondaryOpacity) ? secondaryOpacity : 0.3;

  const startRotationDeg = Number(preset.startRotationDeg) || 0;

  let fullBorderSpinDeg = Number(preset.fullBorderSpinDeg);
  if (!Number.isFinite(fullBorderSpinDeg) || fullBorderSpinDeg < 0) {
    fullBorderSpinDeg = 180;
  }

  let rotationSpeed = Number(preset.rotationSpeed);
  if (!Number.isFinite(rotationSpeed) || rotationSpeed < 0) {
    rotationSpeed = 0.43;
  }

  let gradientSpeed = Number(preset.gradientSpeed);
  if (!Number.isFinite(gradientSpeed) || gradientSpeed <= 0) {
    gradientSpeed = DEFAULT_GRADIENT_SPEED;
  }

  const staticHold = rotationSpeed === 0 || fullBorderSpinDeg === 0;
  const fullBorderRotationDeg = staticHold
    ? startRotationDeg
    : startRotationDeg + fullBorderSpinDeg;

  let totalSpinDeg = Number(preset.totalSpinDeg);
  if (staticHold) {
    totalSpinDeg = 0;
  } else if (
    !Number.isFinite(totalSpinDeg) ||
    totalSpinDeg < fullBorderSpinDeg
  ) {
    totalSpinDeg = Math.ceil(fullBorderSpinDeg / 360) * 360;
  }

  const listenBorderWhiteFadeInMs =
    Number(LISTEN_SEQUENCE_DEFAULTS.listenBorderWhiteFadeInMs) || 1000;

  let listenPhase1Ms;
  let degPerSec = 0;
  let listenSequenceTotalMs;

  if (staticHold) {
    const fixed = Number(preset.listenPhase1Ms);
    listenPhase1Ms =
      Number.isFinite(fixed) && fixed >= MIN_PHASE1_MS
        ? fixed
        : DEFAULT_STATIC_PHASE1_MS;
    listenSequenceTotalMs =
      listenPhase1Ms +
      listenPhase2DurationMs({
        ...LISTEN_SEQUENCE_DEFAULTS,
        secondaryOpacity: secOp,
      }) +
      (Number(LISTEN_SEQUENCE_DEFAULTS.listenSilenceMs) || 15000);
  } else {
    degPerSec = (360 / ROT_PERIOD_AT_1) * rotationSpeed;
    const idealFullBorderMs = (fullBorderSpinDeg / degPerSec) * 1000;
    listenPhase1Ms = idealFullBorderMs - listenBorderWhiteFadeInMs;
    if (!Number.isFinite(listenPhase1Ms) || listenPhase1Ms < MIN_PHASE1_MS) {
      listenPhase1Ms = MIN_PHASE1_MS;
    }
    listenSequenceTotalMs = (totalSpinDeg / degPerSec) * 1000;
  }

  const listenPhase2Ms = listenPhase2DurationMs({
    ...LISTEN_SEQUENCE_DEFAULTS,
    secondaryOpacity: secOp,
    ...(preset.listenBtnFadeInMs != null
      ? { listenBtnFadeInMs: preset.listenBtnFadeInMs }
      : {}),
  });

  const listenSilenceMs = staticHold
    ? Math.max(
        Number(LISTEN_SEQUENCE_DEFAULTS.listenUiFadeOutMs) || 320,
        Number(preset.listenSilenceMs) ||
          LISTEN_SEQUENCE_DEFAULTS.listenSilenceMs ||
          15000,
      )
    : Math.max(
        Number(LISTEN_SEQUENCE_DEFAULTS.listenUiFadeOutMs) || 320,
        listenSequenceTotalMs - listenPhase1Ms - listenPhase2Ms,
      );

  if (staticHold) {
    listenSequenceTotalMs = listenPhase1Ms + listenPhase2Ms + listenSilenceMs;
  }

  return {
    mode: "listen",
    preset,
    listenIdleMs: 0,
    listenPhase1Ms,
    listenSilenceMs,
    listenBtnFadeInMs: preset.listenBtnFadeInMs,
    startRotationDeg,
    fullBorderRotationDeg,
    fullBorderSpinDeg: staticHold ? 0 : fullBorderSpinDeg,
    totalSpinDeg,
    rotationSpeed,
    spinSpeed: rotationSpeed,
    gradientSpeed,
    freezeRotationOnFullBorder:
      staticHold || Boolean(preset.freezeRotationOnFullBorder),
    staticHold,
    /** Debug */
    fullBorderMs: listenPhase1Ms + listenBorderWhiteFadeInMs,
    listenSequenceTotalMs,
    degPerSec,
  };
}

/** Resolve config for the active `screenMode`. */
export function resolveActiveAnimationConfig(ui = {}) {
  if (screenMode === "listen") {
    return resolveAnimationConfig(animationVariant, ui);
  }
  return resolveRecordConfig(RECORD_CONFIG);
}
