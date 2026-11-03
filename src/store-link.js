import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  detectPlatform,
} from "./store-detect.js";

const OVERLAY_ID = "get-app-overlay";

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.className = "get-app-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Get the App");
  overlay.hidden = true;
  overlay.innerHTML = `
    <button type="button" class="get-app-overlay-brand" data-get-app-home>
      Adjustments to Nothing
    </button>
    <div class="get-app-overlay-center">
      <div class="get-app-overlay-block">
        <img
          class="get-app-overlay-qr"
          src="/get-qr.png"
          width="1024"
          height="1024"
          alt="QR code — scan to download Adjustments to Nothing"
        />
        <ul class="get-app-overlay-stores">
          <li><a href="${APP_STORE_URL}" target="_blank" rel="noopener noreferrer">App Store</a></li>
          <li><a href="${PLAY_STORE_URL}" target="_blank" rel="noopener noreferrer">Google Play</a></li>
        </ul>
      </div>
    </div>
    <div class="get-app-overlay-footer">
      <button type="button" class="get-app-overlay-title" data-get-app-close>
        Get the App
      </button>
      <ul class="get-app-overlay-nav" aria-label="Site">
        <li><a href="/privacy-policy/">Privacy Policy</a></li>
        <li><a href="/support/">Support</a></li>
      </ul>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => hideOverlay(overlay);

  const goHomeSplash = (event) => {
    event.stopPropagation();
    close();
    if (document.body.classList.contains("home")) {
      document.dispatchEvent(new CustomEvent("atn:show-phone-scene"));
      return;
    }
    location.assign("/");
  };

  overlay.querySelector("[data-get-app-home]")?.addEventListener("click", goHomeSplash);

  // Black empty areas + "Get the App" → back to intro text (close overlay)
  overlay.addEventListener("click", (event) => {
    if (event.target.closest("a, [data-get-app-home], .get-app-overlay-block")) return;
    close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay.classList.contains("is-open")) {
      close();
    }
  });

  return overlay;
}

function showOverlay(overlay) {
  overlay.hidden = false;
  overlay.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function hideOverlay(overlay) {
  overlay.classList.remove("is-open");
  overlay.hidden = true;
  document.body.style.overflow = "";
}

const platform = detectPlatform();
const storeLinks = document.querySelectorAll("a.subfooter-store");

if (platform === "ios") {
  for (const link of storeLinks) {
    link.href = APP_STORE_URL;
  }
} else if (platform === "android") {
  for (const link of storeLinks) {
    link.href = PLAY_STORE_URL;
  }
} else {
  const overlay = ensureOverlay();
  for (const link of storeLinks) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showOverlay(overlay);
    });
  }
}
