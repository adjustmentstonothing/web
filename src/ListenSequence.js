/** Timeline for listen mode — see mockup phase 0 / 1 / 2 / 3 diagram. */

export const LISTEN_SEQUENCE_DEFAULTS = {
  /**
   * Phase 0: full home UI (no border) before mocked Listen tap.
   * Off by default; enable with `listenIdleBeforeAnim: true`.
   */
  listenIdleBeforeAnim: false,
  /** Hold full UI this long, then mock Listen tap + sequence */
  listenIdleMs: 1000,

  /** Phase 1 hold (ms) before phase 2 transitions — playing + border spin */
  listenPhase1Ms: 21500,
  /** Phase 2 length (ms); auto from tracks if null */
  listenPhase2Ms: null,

  /**
   * Phase 1 after mocked Listen tap (native table):
   * t=0 gradient + Listen → dim (easeOut 320ms); cover UI → dim (linear 320ms);
   * break 80ms; Listen → 100% (easeIn 1200ms).
   * Dim target = secondaryOpacity (native 10%; web default 40%).
   */
  listenBtnFadeOutMs: 320,
  listenBtnBreakMs: 80,
  listenBtnFadeInMs: 1200,
  listenUiFadeOutMs: 320,
  /**
   * Start already dimmed (cover at secondaryOpacity; Listen at dim then fade in).
   * Use when cutting in mid-approach (e.g. startRotationDeg negative).
   */
  listenStartDimmed: false,

  /** End of phase 1 → delete: Listen 100% → dim (ease-out), then phase 2 */
  listenPrimaryDimMs: 500,
  /** null = use secondaryOpacity */
  listenPrimaryDimOpacity: null,

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

  /**
   * After delete restore: silence hold at full UI; dim only at the end
   * (standard fade-out) right before loop restart.
   */
  listenSilenceMs: 15000,
  /** null = use listenUiFadeOutMs */
  listenSilenceDimMs: null,
  /** Auto-restart when silence ends (seamless with startRotationDeg) */
  listenLoop: true,

  /** Bright wedge at sequence start — 0° = top-left on screen (record mode uses -90°) */
  listenStartAngleDeg: 40,
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

function idleDuration(opts) {
  if (!opts.listenIdleBeforeAnim) return 0;
  const ms = Number(opts.listenIdleMs);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

function silenceDuration(opts) {
  const ms = Number(opts.listenSilenceMs);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

/** Elapsed ms when post-delete border reaches full white — freeze model rotation here. */
export function listenFullBorderAtMs(opts = {}) {
  const o = { ...LISTEN_SEQUENCE_DEFAULTS, ...opts };
  const idle = idleDuration(o);
  let p1 = Number(o.listenPhase1Ms ?? LISTEN_SEQUENCE_DEFAULTS.listenPhase1Ms);
  if (!Number.isFinite(p1)) p1 = LISTEN_SEQUENCE_DEFAULTS.listenPhase1Ms;
  const wIn = Number(o.listenBorderWhiteFadeInMs) || 1000;
  return idle + p1 + wIn;
}

/** Phase 2 (delete) duration ms. */
export function listenPhase2DurationMs(opts = {}) {
  return phase2Duration({ ...LISTEN_SEQUENCE_DEFAULTS, ...opts });
}

/** Full listen sequence length including post-delete silence. */
export function listenSequenceDurationMs(opts = {}) {
  const o = { ...LISTEN_SEQUENCE_DEFAULTS, ...opts };
  const idle = idleDuration(o);
  let p1 = Number(o.listenPhase1Ms ?? LISTEN_SEQUENCE_DEFAULTS.listenPhase1Ms);
  if (!Number.isFinite(p1)) p1 = LISTEN_SEQUENCE_DEFAULTS.listenPhase1Ms;
  return idle + p1 + phase2Duration(o) + silenceDuration(o);
}

/**
 * @param {number} elapsed ms since sequence start
 * @param {object} opts merged listen + record border opts
 */
export function computeListenTimeline(elapsed, opts = {}) {
  const o = { ...LISTEN_SEQUENCE_DEFAULTS, ...opts };
  const idle = idleDuration(o);
  let p1 = Number(o.listenPhase1Ms ?? LISTEN_SEQUENCE_DEFAULTS.listenPhase1Ms);
  if (!Number.isFinite(p1)) p1 = LISTEN_SEQUENCE_DEFAULTS.listenPhase1Ms;
  const p2 = phase2Duration(o);
  const silenceMs = silenceDuration(o);
  const p1Start = idle;
  const p2Start = idle + p1;
  const p3Start = idle + p1 + p2;
  const loopEnd = p3Start + silenceMs;

  let secOp = Number(o.secondaryOpacity);
  if (!Number.isFinite(secOp)) secOp = 0.3;
  const restOp = secOp;
  const fadeFrom = secOp;
  let dimOp = Number(o.listenPrimaryDimOpacity);
  if (!Number.isFinite(dimOp)) dimOp = restOp;
  const dimMs = Number(o.listenPrimaryDimMs) || 500;
  const statusText = o.listenStatusText || "Deleted";
  const restoreMs = Number(o.listenPrimaryRestoreMs) || 2000;

  const btnOutMs = Number(o.listenBtnFadeOutMs) || 320;
  const btnBreakMs = Number(o.listenBtnBreakMs) || 80;
  const btnInMs = Number(o.listenBtnFadeInMs) || 1200;
  const uiOutMs = Number(o.listenUiFadeOutMs) || 320;

  const dimmedEnd = {
    phase: 3,
    primaryLabel: null,
    primaryOpacity: restOp,
    middleOpacity: restOp,
    bottomOpacity: restOp,
    animElapsed: Math.max(0, elapsed - idle),
    ring: {
      showRing: false,
      freezeSpin: false,
      whiteOverlay: 0,
      ringFade: 0,
      useGradient: false,
      W_eff: 0,
      edgeSolid: 0,
    },
  };

  // Phase 0 — full home UI, then mocked Listen tap starts phase 1
  if (idle > 0 && elapsed < idle) {
    return {
      phase: 0,
      primaryLabel: null,
      primaryOpacity: 1,
      middleOpacity: 1,
      bottomOpacity: 1,
      animElapsed: 0,
      ring: {
        showRing: false,
        freezeSpin: true,
        whiteOverlay: 0,
        ringFade: 0,
        useGradient: false,
        W_eff: 0,
        edgeSolid: 0,
      },
    };
  }

  // Phase 3 — silence after delete: hold full UI, dim only at end before loop
  if (elapsed >= p3Start) {
    if (silenceMs <= 0 || elapsed >= loopEnd) return dimmedEnd;
    let silenceDimMs = Number(o.listenSilenceDimMs);
    if (!Number.isFinite(silenceDimMs) || silenceDimMs < 0) {
      silenceDimMs = Number(o.listenUiFadeOutMs) || 320;
    }
    const t3 = elapsed - p3Start;
    const dimStart = Math.max(0, silenceMs - silenceDimMs);
    let op = 1;
    if (t3 >= dimStart && silenceDimMs > 0) {
      op = 1 - (1 - restOp) * easeOut((t3 - dimStart) / silenceDimMs);
    } else if (t3 >= dimStart) {
      op = restOp;
    }
    return {
      ...dimmedEnd,
      primaryOpacity: op,
      middleOpacity: op,
      bottomOpacity: op,
    };
  }

  if (elapsed >= p2Start) {
    const t2 = elapsed - p2Start;
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
    let middleOpacity = fadeFrom;
    let bottomOpacity = fadeFrom;
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
      animElapsed: elapsed - idle,
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

  // Phase 1 — mocked Listen tap (table), then hold, then pre-delete dim.
  // listenStartDimmed: cover already at restOp; Listen starts dim → fade in only.
  const t1 = elapsed - p1Start;
  const startDimmed = Boolean(o.listenStartDimmed);
  const outMs = startDimmed ? 0 : btnOutMs;
  const breakMs = startDimmed ? 0 : btnBreakMs;
  const breakEnd = outMs + breakMs;
  const btnInEnd = breakEnd + btnInMs;
  const dimStart = Math.max(btnInEnd, p1 - dimMs);

  let primaryOpacity = 1;
  if (t1 < outMs) {
    primaryOpacity = 1 - (1 - restOp) * easeOut(t1 / outMs);
  } else if (t1 < breakEnd) {
    primaryOpacity = restOp;
  } else if (t1 < btnInEnd) {
    const u = btnInMs <= 0 ? 1 : (t1 - breakEnd) / btnInMs;
    primaryOpacity = restOp + (1 - restOp) * easeIn(u);
  } else if (t1 >= dimStart) {
    const u = dimMs <= 0 ? 1 : (t1 - dimStart) / dimMs;
    primaryOpacity = 1 - (1 - dimOp) * easeOut(u);
  } else {
    primaryOpacity = 1;
  }

  // Cover: UI except Listen → restOp (already dimmed if listenStartDimmed)
  let middleOpacity = restOp;
  let bottomOpacity = restOp;
  if (!startDimmed && t1 < uiOutMs) {
    const u = t1 / uiOutMs; // linear
    const op = 1 - (1 - restOp) * u;
    middleOpacity = op;
    bottomOpacity = op;
  }

  return {
    phase: 1,
    primaryLabel: null,
    primaryOpacity,
    middleOpacity,
    bottomOpacity,
    animElapsed: t1,
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
