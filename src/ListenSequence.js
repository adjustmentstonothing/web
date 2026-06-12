/** Timeline for listen mode — see mockup phase 1 / 2 / 3 diagram. */

export const LISTEN_SEQUENCE_DEFAULTS = {
  /** Phase 1 hold (ms) before phase 2 transitions — default 4s */
  listenPhase1Ms: 21500,
  /** Phase 2 length (ms); auto from tracks if null */
  listenPhase2Ms: null,

  /** End of phase 1: Listen fades 100% → dim (ease-out) */
  listenPrimaryDimMs: 500,
  listenPrimaryDimOpacity: 0.1,

  /** Phase 2: top button shows status text (same slot as Listen) */
  listenStatusFadeInMs: 400,
  listenStatusHoldMs: 1600,
  listenStatusFadeOutMs: 400,
  listenStatusText: "Deleted",

  /** Gradient border runs until this far into phase 2 */
  listenBorderAnimPhase2Ms: 1200,

  /** Phase 2: border → full white → fade out */
  listenBorderWhiteFadeInMs: 1000,
  listenBorderWhiteHoldMs: 1000,
  listenBorderWhiteFadeOutMs: 400,

  /** Phase 2 end: secondary UI pause then fade in from `secondaryOpacity` */
  listenSecondaryPauseMs: 300,
  listenSecondaryFadeInMs: 2000,

  /** After status fades out: Listen returns on same button (ease-in-out) */
  listenPrimaryRestoreMs: 2000,
};

function easeInOut(t) {
  const u = Math.max(0, Math.min(1, t));
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

function easeOut(t) {
  const u = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - u, 3);
}

function easeIn(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * u;
}

function statusDuration(opts) {
  return (
    (Number(opts.listenStatusFadeInMs) || 400) +
    (Number(opts.listenStatusHoldMs) || 1600) +
    (Number(opts.listenStatusFadeOutMs) || 400)
  );
}

function phase2Duration(opts) {
  if (opts.listenPhase2Ms != null) return Number(opts.listenPhase2Ms) || 0;
  const status = statusDuration(opts);
  const restore = Number(opts.listenPrimaryRestoreMs) || 2000;
  const secondary =
    (Number(opts.listenSecondaryPauseMs) || 300) +
    (Number(opts.listenSecondaryFadeInMs) || 2000);
  return Math.max(status + restore, secondary);
}

/**
 * @param {number} elapsed ms since sequence start
 * @param {object} opts merged listen + record border opts
 */
export function computeListenTimeline(elapsed, opts = {}) {
  const o = { ...LISTEN_SEQUENCE_DEFAULTS, ...opts };
  let p1 = Number(o.listenPhase1Ms ?? LISTEN_SEQUENCE_DEFAULTS.listenPhase1Ms);
  if (!Number.isFinite(p1)) p1 = LISTEN_SEQUENCE_DEFAULTS.listenPhase1Ms;
  const p2 = phase2Duration(o);
  const p1p2 = p1 + p2;

  const dimMs = Number(o.listenPrimaryDimMs) || 500;
  const dimOp = Number(o.listenPrimaryDimOpacity) ?? 0.1;
  let secOp = Number(o.secondaryOpacity);
  if (!Number.isFinite(secOp)) secOp = 0.3;
  const restOp = secOp;
  const fadeFrom = secOp;
  const statusText = o.listenStatusText || "Deleted";
  const restoreMs = Number(o.listenPrimaryRestoreMs) || 2000;

  const base = {
    phase: 3,
    primaryLabel: null,
    primaryOpacity: 1,
    middleOpacity: 1,
    bottomOpacity: 1,
    ring: {
      showRing: false,
      freezeSpin: true,
      whiteOverlay: 1,
      ringFade: 0,
      useGradient: false,
      W_eff: o.gradientSize,
      edgeSolid: 0,
    },
  };

  if (elapsed >= p1p2) return base;

  if (elapsed >= p1) {
    const t2 = elapsed - p1;
    const sIn = Number(o.listenStatusFadeInMs) || 400;
    const sHold = Number(o.listenStatusHoldMs) || 1600;
    const sOut = Number(o.listenStatusFadeOutMs) || 400;
    const sTotal = sIn + sHold + sOut;
    const restoreStart = sTotal;
    const restoreEnd = sTotal + restoreMs;

    let primaryLabel = null;
    let primaryOpacity = 0;

    if (t2 < sIn) {
      primaryLabel = statusText;
      primaryOpacity = easeOut(t2 / sIn);
    } else if (t2 < sIn + sHold) {
      primaryLabel = statusText;
      primaryOpacity = 1;
    } else if (t2 < sTotal) {
      primaryLabel = statusText;
      primaryOpacity = 1 - easeOut((t2 - sIn - sHold) / sOut);
    } else if (t2 < restoreEnd) {
      primaryLabel = null;
      primaryOpacity = easeInOut((t2 - restoreStart) / restoreMs);
    } else {
      primaryLabel = null;
      primaryOpacity = 1;
    }

    const pauseMs = Number(o.listenSecondaryPauseMs) || 300;
    const fadeMs = Number(o.listenSecondaryFadeInMs) || 2000;
    const secStart = Math.max(0, p2 - pauseMs - fadeMs);
    let middleOpacity = 0;
    let bottomOpacity = 0;
    if (t2 >= secStart) {
      const ts = t2 - secStart;
      if (ts < pauseMs) {
        middleOpacity = fadeFrom;
        bottomOpacity = fadeFrom;
      } else {
        const u = (ts - pauseMs) / fadeMs;
        const op = fadeFrom + (1 - fadeFrom) * easeInOut(u);
        middleOpacity = op;
        bottomOpacity = op;
      }
    }

    const wIn = Number(o.listenBorderWhiteFadeInMs) || 1000;
    const wHold = Number(o.listenBorderWhiteHoldMs) || 1000;
    const wOut = Number(o.listenBorderWhiteFadeOutMs) || 400;
    const wTotal = wIn + wHold + wOut;
    const borderAnimEnd = Number(o.listenBorderAnimPhase2Ms) || 1200;
    const useGradient = t2 < borderAnimEnd;

    let whiteOverlay = 0;
    let ringFade = 1;
    let showRing = false;
    if (t2 < wTotal) {
      showRing = true;
      if (t2 < wIn) {
        whiteOverlay = easeIn(t2 / wIn);
      } else if (t2 < wIn + wHold) {
        whiteOverlay = 1;
      } else {
        whiteOverlay = 1;
        ringFade = 1 - easeOut((t2 - wIn - wHold) / wOut);
      }
    }

    return {
      phase: 2,
      primaryLabel,
      primaryOpacity,
      middleOpacity,
      bottomOpacity,
      ring: {
        showRing,
        freezeSpin: !useGradient,
        whiteOverlay,
        ringFade,
        useGradient,
        W_eff: Number(o.gradientSize) || 116,
        edgeSolid: useGradient ? 1 : 0,
      },
    };
  }

  const dimStart = Math.max(0, p1 - dimMs);
  let primaryOpacity = 1;
  if (elapsed >= dimStart) {
    primaryOpacity = 1 - (1 - dimOp) * easeOut((elapsed - dimStart) / dimMs);
  }

  return {
    phase: 1,
    primaryLabel: null,
    primaryOpacity,
    middleOpacity: restOp,
    bottomOpacity: restOp,
    ring: {
      showRing: true,
      freezeSpin: false,
      ringAlpha: 1,
      whiteMix: 0,
      useGradient: true,
      W_eff: null,
      edgeSolid: null,
    },
  };
}
