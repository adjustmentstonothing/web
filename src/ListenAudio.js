/**
 * Listen-sequence audio: starts with the animation (autoplay), fade in,
 * stop before "Deleted" (phase 2).
 */
export class ListenAudio {
  /**
   * @param {{
   *   url?: string,
   *   element?: HTMLAudioElement,
   *   fadeInMs?: number,
   *   fadeOutMs?: number,
   *   volume?: number,
   * }} opts
   */
  constructor(opts) {
    this.fadeInMs = Number(opts.fadeInMs) || 500;
    this.fadeOutMs = Number.isFinite(Number(opts.fadeOutMs))
      ? Math.max(0, Number(opts.fadeOutMs))
      : 500;
    const vol = Number(opts.volume);
    this.maxVolume = Number.isFinite(vol)
      ? Math.max(0, Math.min(1, vol))
      : 1;

    if (opts.element) {
      this.audio = opts.element;
    } else {
      this.audio = new Audio(opts.url);
    }
    this.audio.preload = "auto";
    this.audio.loop = false;
    this.audio.playsInline = true;
    this.audio.setAttribute("playsinline", "");
    this.audio.setAttribute("webkit-playsinline", "");
    if (opts.url && !this.audio.src) this.audio.src = opts.url;
    this.audio.volume = 0;
    try {
      this.audio.load();
    } catch {
      /* ignore */
    }

    this._playStarted = false;
    this._playAttempt = null;
    this._disposed = false;
    this._wantsPhase1 = false;
    this._nextAutoplayRetryAt = 0;
    this._gestureRetry = null;
  }

  isPlaying() {
    const a = this.audio;
    return Boolean(!a.paused && !a.ended && a.currentTime > 0);
  }

  /** Kick playback for a new sequence (animation start / loop). */
  onSequenceStart() {
    if (this._disposed) return;
    this._wantsPhase1 = true;
    this._playStarted = false;
    this._playAttempt = null;
    this._nextAutoplayRetryAt = 0;
    this._beginPlayback();
  }

  /** User-gesture fallback when the browser blocks autoplay. */
  unlockAndStart() {
    if (this._disposed) return false;
    this._wantsPhase1 = true;
    this._playStarted = false;
    this._playAttempt = null;
    this._nextAutoplayRetryAt = 0;
    this._beginPlayback();
    return true;
  }

  /**
   * @param {{ phase: number, animElapsed: number, phase1Ms: number }} ctx
   */
  sync(ctx) {
    if (this._disposed) return;
    const phase = ctx?.phase;

    if (phase !== 1) {
      this._wantsPhase1 = false;
      this._stopForPhase();
      return;
    }

    this._wantsPhase1 = true;
    const t = Math.max(0, Number(ctx.animElapsed) || 0);
    const p1 = Math.max(0, Number(ctx.phase1Ms) || 0);
    const fadeOutStart = Math.max(0, p1 - this.fadeOutMs);
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    if (!this.isPlaying() && !this._playAttempt) {
      if (!this._playStarted || now >= this._nextAutoplayRetryAt) {
        this._beginPlayback();
      }
    }

    let vol = this.maxVolume;
    if (t < this.fadeInMs) {
      vol = this.maxVolume * (this.fadeInMs <= 0 ? 1 : t / this.fadeInMs);
    } else if (t >= fadeOutStart && this.fadeOutMs > 0) {
      const u = (t - fadeOutStart) / this.fadeOutMs;
      vol = this.maxVolume * Math.max(0, 1 - u);
    }
    if (!Number.isFinite(vol)) vol = 0;
    this.audio.volume = Math.max(0, Math.min(1, vol));
  }

  reset() {
    if (this._disposed) return;
    this._playStarted = false;
    this._playAttempt = null;
    this._wantsPhase1 = false;
    this._nextAutoplayRetryAt = 0;
    try {
      this.audio.pause();
      this.audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    this.audio.volume = 0;
  }

  pause() {
    if (this._disposed) return;
    try {
      this.audio.pause();
    } catch {
      /* ignore */
    }
  }

  resume() {
    if (this._disposed || !this._wantsPhase1) return;
    this._beginPlayback();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._teardownGestureRetry();
    try {
      this.audio.pause();
    } catch {
      /* ignore */
    }
  }

  _beginPlayback() {
    if (this._disposed || this._playAttempt) return;
    const a = this.audio;

    const attempt = () => {
      try {
        if (a.currentTime > 0.05 && this._playStarted) {
          /* keep position on resume-style retry */
        } else {
          a.currentTime = 0;
        }
      } catch {
        /* ignore */
      }
      // Keep muted=false so fade-in volume is audible when autoplay is allowed
      a.muted = false;
      const p = a.play();
      this._playAttempt = Promise.resolve(p)
        .then(() => {
          this._playAttempt = null;
          this._playStarted = true;
          this._nextAutoplayRetryAt = 0;
          this._teardownGestureRetry();
        })
        .catch(() => {
          this._playAttempt = null;
          this._playStarted = false;
          this._nextAutoplayRetryAt =
            (typeof performance !== "undefined"
              ? performance.now()
              : Date.now()) + 750;
          this._armGestureRetry();
        });
    };

    if (a.readyState >= 2) {
      attempt();
      return;
    }

    this._playAttempt = new Promise((resolve) => {
      const done = () => {
        a.removeEventListener("canplay", done);
        a.removeEventListener("error", done);
        resolve();
      };
      a.addEventListener("canplay", done, { once: true });
      a.addEventListener("error", done, { once: true });
    }).then(() => {
      this._playAttempt = null;
      if (this._disposed || !this._wantsPhase1) return;
      attempt();
    });
  }

  _stopForPhase() {
    if (!this._playStarted && this.audio.paused) return;
    this._playStarted = false;
    this._playAttempt = null;
    try {
      this.audio.pause();
      this.audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    this.audio.volume = 0;
  }

  _armGestureRetry() {
    if (this._disposed || this._gestureRetry) return;
    this._gestureRetry = () => {
      this._teardownGestureRetry();
      if (this._wantsPhase1) this.unlockAndStart();
    };
    window.addEventListener("pointerdown", this._gestureRetry, true);
    window.addEventListener("keydown", this._gestureRetry, true);
  }

  _teardownGestureRetry() {
    if (!this._gestureRetry) return;
    window.removeEventListener("pointerdown", this._gestureRetry, true);
    window.removeEventListener("keydown", this._gestureRetry, true);
    this._gestureRetry = null;
  }
}
