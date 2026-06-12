/** Layout + typography from public/mockup/ui.png (393pt-wide reference). */

export const PHONE_UI_FONT_URL = "/fonts/GT-Standard-L-Standard-Regular.woff2";
export const PHONE_UI_FONT_FAMILY = "GT Standard";

export const PHONE_UI_LAYOUT = {
  designWidthPt: 393,
  topMarginPct: 0.122,
  bottomMarginPct: 0.102,
  sideMarginPx: 30,
  middleY: 0.5,
};

/** Breakpoints: widthPt → heading / body sizes (pt) */
export const PHONE_UI_TYPOGRAPHY = [
  { maxWidthPt: 360, headingPt: 24, bodyPt: 16 },
  { maxWidthPt: 392, headingPt: 25, bodyPt: 17 },
  { maxWidthPt: Infinity, headingPt: 26, bodyPt: 18 },
];

/** Top / bottom labels per screen mode */
export const PHONE_UI_PRESETS = {
  listen: { top: "Listen", bottom: "Record" },
  record: { top: "Record", bottom: "Listen" },
  play: { top: "Play", bottom: "Record" },
};

let _fontPromise = null;

export function loadPhoneUIFont() {
  if (_fontPromise) return _fontPromise;
  _fontPromise = (async () => {
    if (typeof document === "undefined" || !document.fonts?.load) return false;
    try {
      const face = new FontFace(
        PHONE_UI_FONT_FAMILY,
        `url(${PHONE_UI_FONT_URL})`,
        { weight: "400", style: "normal" },
      );
      await face.load();
      document.fonts.add(face);
      return true;
    } catch {
      try {
        await document.fonts.load(`400 16px "${PHONE_UI_FONT_FAMILY}"`);
        return document.fonts.check(`400 16px "${PHONE_UI_FONT_FAMILY}"`);
      } catch {
        return false;
      }
    }
  })();
  return _fontPromise;
}

export function typographyForWidthPt(widthPt) {
  for (const row of PHONE_UI_TYPOGRAPHY) {
    if (widthPt <= row.maxWidthPt) return row;
  }
  return PHONE_UI_TYPOGRAPHY[PHONE_UI_TYPOGRAPHY.length - 1];
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number }} rect inner content rect (px)
 * @param {object} options
 */
export function drawPhoneScreenUI(ctx, rect, options = {}) {
  const { x, y, w, h } = rect;
  const uiMode = options.uiMode || "listen";
  const preset = PHONE_UI_PRESETS[uiMode] || PHONE_UI_PRESETS.listen;
  const top = options.topLabel ?? preset.top;
  const bottom = options.bottomLabel ?? preset.bottom;
  const left = options.leftLabel ?? "Adjustments to Nothing";
  const right = options.rightLabel ?? "About";

  const scale = w / PHONE_UI_LAYOUT.designWidthPt;
  const widthPt = PHONE_UI_LAYOUT.designWidthPt;
  const type = typographyForWidthPt(widthPt);
  const headingPx = type.headingPt * scale;
  const bodyPx = type.bodyPt * scale;
  const sideMargin = PHONE_UI_LAYOUT.sideMarginPx * scale;

  const fontStack = options.fontFamily
    ? options.fontFamily
    : `"${PHONE_UI_FONT_FAMILY}", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;

  const primaryOpacity = Number(options.primaryOpacity ?? 1);
  const middleOpacity = Number(
    options.middleOpacity ?? options.secondaryOpacity ?? 1,
  );
  const bottomOpacity = Number(
    options.bottomOpacity ?? options.secondaryOpacity ?? 1,
  );
  const bottomText = options.bottomLabel ?? bottom;

  ctx.save();
  ctx.fillStyle = options.color || "#ffffff";
  ctx.textBaseline = "middle";

  ctx.font = `400 ${headingPx}px ${fontStack}`;
  ctx.textAlign = "center";
  ctx.globalAlpha = primaryOpacity;
  ctx.fillText(top, x + w / 2, y + h * PHONE_UI_LAYOUT.topMarginPct);

  if (bottomOpacity > 0.001) {
    ctx.globalAlpha = bottomOpacity;
    ctx.fillText(
      bottomText,
      x + w / 2,
      y + h * (1 - PHONE_UI_LAYOUT.bottomMarginPct),
    );
  }

  if (middleOpacity > 0.001) {
    ctx.font = `400 ${bodyPx}px ${fontStack}`;
    ctx.globalAlpha = middleOpacity;
    ctx.textAlign = "left";
    ctx.fillText(left, x + sideMargin, y + h * PHONE_UI_LAYOUT.middleY);
    ctx.textAlign = "right";
    ctx.fillText(right, x + w - sideMargin, y + h * PHONE_UI_LAYOUT.middleY);
  }

  ctx.restore();
}
