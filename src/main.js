import Stats from 'three/examples/jsm/libs/stats.module.js';
import { RotatingPhone } from './RotatingPhone.js';

const stats = new Stats();
stats.dom.id = 'stats-dom';
stats.dom.style.position = 'fixed';
stats.dom.style.top = '12px';
stats.dom.style.left = '12px';
stats.dom.style.opacity = '0.6';
stats.dom.style.zIndex = '20';
const sceneRoot = document.getElementById('scene-root');
(sceneRoot ?? document.body).appendChild(stats.dom);

const uiToggle = document.getElementById('ui-toggle');
if (uiToggle) {
  uiToggle.addEventListener('click', () => {
    document.body.classList.toggle('ui-hidden');
  });
}

const app = document.getElementById('app');

const phoneOptions = {
  // speed: parseFloat(document.getElementById("speed")?.value ?? "1"),
  speed: 0.6,
  twoSided:
    document.getElementById("two-sided")?.classList.contains("active") ?? true,
  thickness: parseFloat(document.getElementById("thickness")?.value ?? "1"),
  gap: parseFloat(document.getElementById("gap")?.value ?? "0"),
  // scale: parseFloat(document.getElementById('scale')?.value ?? '0.8'),
  scale: 1,
  // brightness: parseFloat(document.getElementById("brightness")?.value ?? "0.9"),
  brightness: 1,
  // softbox: parseFloat(document.getElementById("softbox")?.value ?? "24"),
  softbox: 0,
  envRotationDeg: parseFloat(document.getElementById("env-rot")?.value ?? "73"),
  envBlur: parseFloat(document.getElementById("env-blur")?.value ?? "0.04"),
  envIntensity: parseFloat(document.getElementById("env-int")?.value ?? "2.69"),
  uv: {
    rotationDeg: parseFloat(document.getElementById("uv-rot")?.value ?? "-90"),
    offsetX: parseFloat(document.getElementById("uv-ox")?.value ?? "0"),
    offsetY: parseFloat(document.getElementById("uv-oy")?.value ?? "0"),
    repeatX: parseFloat(document.getElementById("uv-rx")?.value ?? "1"),
    repeatY: parseFloat(document.getElementById("uv-ry")?.value ?? "1"),
    centerX: parseFloat(document.getElementById("uv-cx")?.value ?? "0.5"),
    centerY: parseFloat(document.getElementById("uv-cy")?.value ?? "0.5"),
  },
};

const phone = new RotatingPhone(app, phoneOptions);

/** Console: `recordBorder({ borderWidthPct: 0.03 })` or `recordBorder({ screenAspectW: 700, screenAspectH: 1516 })` */
window.recordBorder = (p) => phone.setRecordBorderParams(p);
/** Console: `screenInsets()` — ring inset px, inner rect, source crop px */
window.screenInsets = () => phone.getRecordBorderInsetInfo();

const origComposerRender = phone.composer.render.bind(phone.composer);
phone.composer.render = (deltaTime) => {
  stats.begin();
  origComposerRender(deltaTime);
  stats.end();
};

const bind = (id, fn) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', (e) => fn(parseFloat(e.target.value)));
};

bind('speed', (v) => phone.setSpeed(v));
bind('thickness', (v) => phone.setThickness(v));
bind('gap', (v) => phone.setGap(v));
bind('scale', (v) => phone.setScale(v));
bind('brightness', (v) => phone.setBrightness(v));
bind('softbox', (v) => phone.setSoftbox(v));

const envRotOut = document.getElementById('env-rot-v');
bind('env-rot', (v) => {
  phone.setEnvRotationDeg(v);
  if (envRotOut) envRotOut.textContent = v + '°';
});
const envBlurOut = document.getElementById('env-blur-v');
bind('env-blur', (v) => {
  phone.setEnvBlur(v);
  if (envBlurOut) envBlurOut.textContent = v.toFixed(2);
});
const envIntOut = document.getElementById('env-int-v');
bind('env-int', (v) => {
  phone.setEnvIntensity(v);
  if (envIntOut) envIntOut.textContent = v.toFixed(2);
});

const twoSidedBtn = document.getElementById('two-sided');
if (twoSidedBtn) {
  twoSidedBtn.addEventListener('click', () => {
    const active = twoSidedBtn.classList.toggle('active');
    phone.setTwoSided(active);
  });
}

const uvIds = {
  rot: ['uv-rot', 'rotationDeg'],
  ox: ['uv-ox', 'offsetX'],
  oy: ['uv-oy', 'offsetY'],
  rx: ['uv-rx', 'repeatX'],
  ry: ['uv-ry', 'repeatY'],
  cx: ['uv-cx', 'centerX'],
  cy: ['uv-cy', 'centerY'],
};
const uvOut = {
  rot: document.getElementById('uv-rot-v'),
  ox: document.getElementById('uv-ox-v'),
  oy: document.getElementById('uv-oy-v'),
  rx: document.getElementById('uv-rx-v'),
  ry: document.getElementById('uv-ry-v'),
  cx: document.getElementById('uv-cx-v'),
  cy: document.getElementById('uv-cy-v'),
};
function applyUVFromUI() {
  const next = {};
  for (const [key, [id, prop]] of Object.entries(uvIds)) {
    const el = document.getElementById(id);
    if (el) next[prop] = parseFloat(el.value);
  }
  phone.setUV(next);
  if (uvOut.rot) uvOut.rot.textContent = next.rotationDeg + '°';
  if (uvOut.ox) uvOut.ox.textContent = next.offsetX.toFixed(2);
  if (uvOut.oy) uvOut.oy.textContent = next.offsetY.toFixed(2);
  if (uvOut.rx) uvOut.rx.textContent = next.repeatX.toFixed(2);
  if (uvOut.ry) uvOut.ry.textContent = next.repeatY.toFixed(2);
  if (uvOut.cx) uvOut.cx.textContent = next.centerX.toFixed(2);
  if (uvOut.cy) uvOut.cy.textContent = next.centerY.toFixed(2);
}
for (const [, [id]] of Object.entries(uvIds)) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', applyUVFromUI);
}

const introCapture = document.getElementById('intro-capture');
const homeSceneRoot = document.getElementById('scene-root');
if (introCapture && homeSceneRoot && document.body.classList.contains('home')) {
  let teardownDone = false;
  const teardownScene = () => {
    if (teardownDone) return;
    teardownDone = true;
    phone.dispose();
    stats.dom.remove();
    homeSceneRoot.remove();
  };

  introCapture.addEventListener(
    'pointerdown',
    () => {
      document.body.classList.add('home-revealed');
      introCapture.remove();
      requestAnimationFrame(() => {
        teardownScene();
      });
    },
    { once: true },
  );
}
