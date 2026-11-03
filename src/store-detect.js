export const APP_STORE_URL =
  "https://apps.apple.com/ch/app/adjustments-to-nothing/id6790154820?l=en-GB";

export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.adjustmentstonothing.app";

export const GET_URL = "/get/";

/** @returns {"ios" | "android" | "other"} */
export function detectPlatform() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS 13+ can report as Mac with touch
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}
