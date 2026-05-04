import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import {
  RecordBorderScreen,
  RECORD_BORDER_DEFAULTS,
  omitUndefined,
} from "./RecordBorderScreen.js";

RectAreaLightUniformsLib.init();

const DEFAULTS = {
  speed: 1,
  screenImageUrl: "/atn-ui.png",
  /** When true, screen is CanvasTexture: PNG + rotating conic ring (see RecordBorderScreen) */
  useRecordBorder: true,
  modelUrl: "/iphone_doubleside.glb",
  hdrUrl: "/studio.hdr",
  twoSided: false,
  thickness: 1,
  gap: 0,
  scale: 0.8,
  brightness: 0.9,
  softbox: 24,
  envRotationDeg: 73,
  envBlur: 0.04,
  envIntensity: 2.69,
  uv: {
    rotationDeg: -90,
    offsetX: 0,
    offsetY: 0,
    /** 1 = full texture on screen; values >1 zoom in and crop edges (bad for full-viewport ring) */
    repeatX: 1,
    repeatY: 1,
    centerX: 0.5,
    centerY: 0.5,
  },
};

export class RotatingPhone {
  constructor(container, options = {}) {
    if (!container) throw new Error('RotatingPhone: container is required');
    this.container = container;
    this.opts = {
      ...DEFAULTS,
      ...options,
      uv: { ...DEFAULTS.uv, ...(options.uv || {}) },
      recordBorder: {
        ...RECORD_BORDER_DEFAULTS,
        ...omitUndefined(options.recordBorder || {}),
      },
    };

    this.speedMultiplier = this.opts.speed;
    this.gapRatio = this.opts.gap;
    this.fitScreenFraction = this.opts.scale;
    this.screenBrightness = this.opts.brightness;
    this.envRotationY = (this.opts.envRotationDeg * Math.PI) / 180;
    this.envBlur = this.opts.envBlur;
    this.envIntensityFactor = this.opts.envIntensity;

    this.modelSize = new THREE.Vector3(0.08, 0.16, 0.008);
    this._cameraFitSize = new THREE.Vector3();
    this.modelLoaded = false;
    this.loadedModel = null;
    this.mirrorInstance = null;
    this.screenMat = null;
    this.envRT = null;
    this.hdrTexture = null;
    this.disposed = false;
    this._twoSided = this.opts.twoSided;
    this._baseEnvIntensity = new WeakMap();

    this.BASE_ROT_SPEED = (2 * Math.PI) / 18;

    this._initRenderer();
    this._initScene();
    this._initComposer();
    this._initLights();
    this._initScreenTexture();
    this._initEnv();
    this._loadModel();

    this._onResize = this._onResize.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibility);

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(this._onResize);
      this._resizeObserver.observe(this.container);
    }

    this.clock = new THREE.Clock();
    this._animate = this._animate.bind(this);
    this._rafId = requestAnimationFrame(this._animate);
  }

  _initRenderer() {
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    const dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(this.container.clientWidth || window.innerWidth, this.container.clientHeight || window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.localClippingEnabled = true;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    this.container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this._planeFront = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this._planeBack = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(22, w / h, 0.01, 100);
    this.camera.position.set(0, 0, 0.6);

    this.rotator = new THREE.Group();
    this.scene.add(this.rotator);
  }

  _initComposer() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const dpr = this.renderer.getPixelRatio();
    const renderTarget = new THREE.WebGLRenderTarget(w * dpr, h * dpr, {
      samples: 4,
    });
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new SMAAPass(w * dpr, h * dpr));
  }

  _initLights() {
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(2, 3, 2.5);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x88a8ff, 1.0);
    rimLight.position.set(-3, 1.5, -2);
    this.scene.add(rimLight);

    this.softbox = new THREE.RectAreaLight(0xffffff, this.opts.softbox, 0.35, 0.45);
    this.softbox.position.set(0, 0.45, 0.15);
    this.softbox.lookAt(0, 0, 0);
    this.scene.add(this.softbox);
  }

  _initEnv() {
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmrem.compileCubemapShader();

    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(this.renderer), 0.04).texture;

    this.envHolder = new THREE.Scene();
    this.envSphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.MeshBasicMaterial({ side: THREE.BackSide }),
    );
    this.envHolder.add(this.envSphere);

    new RGBELoader().load(this.opts.hdrUrl, (hdr) => {
      if (this.disposed) { hdr.dispose?.(); return; }
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      this.hdrTexture = hdr;
      this.envSphere.material.map = hdr;
      this.envSphere.material.needsUpdate = true;
      this._regenerateEnv();
    });
  }

  _regenerateEnv() {
    if (!this.hdrTexture) return;
    this.envSphere.rotation.y = this.envRotationY;
    const newRT = this.pmrem.fromScene(this.envHolder, this.envBlur);
    if (this.envRT) this.envRT.dispose();
    this.envRT = newRT;
    this.scene.environment = newRT.texture;
  }

  _initScreenTexture() {
    if (this.opts.useRecordBorder) {
      this.recordScreen = new RecordBorderScreen(this.renderer, {
        ...this.opts.recordBorder,
        imageUrl: this.opts.screenImageUrl,
      });
      this.screenTex = this.recordScreen.texture;
    } else {
      const texture = new THREE.TextureLoader().load(
        this.opts.screenImageUrl,
        undefined,
        undefined,
        (err) => console.error('[RotatingPhone] screen image load failed', err),
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.screenTex = texture;
    }

    this._applyUV(this.opts.uv);
  }

  _applyUV(uv) {
    if (!this.screenTex) return;
    const u = { ...DEFAULTS.uv, ...uv };
    this.screenTex.rotation = (u.rotationDeg * Math.PI) / 180;
    this.screenTex.offset.set(u.offsetX, u.offsetY);
    this.screenTex.repeat.set(u.repeatX, u.repeatY);
    this.screenTex.center.set(u.centerX, u.centerY);
    this.screenTex.needsUpdate = true;
    this.opts.uv = u;
  }

  setUV(uv) {
    this._applyUV({ ...this.opts.uv, ...uv });
  }

  /** Live-tune record border (screenAspectW/H, borderWidthPct, outerRadiusPct, …) */
  setRecordBorderParams(partial) {
    if (!this.recordScreen) return;
    const clean = omitUndefined(partial);
    this.recordScreen.setParams(clean);
    Object.assign(this.opts.recordBorder, clean);
  }

  /** Debug: ring inset px, inner content rect, source crop px — see RecordBorderScreen.getInsetInfo */
  getRecordBorderInsetInfo() {
    return this.recordScreen?.getInsetInfo?.() ?? null;
  }

  _loadModel() {
    const loader = new GLTFLoader();
    loader.load(
      this.opts.modelUrl,
      (gltf) => {
        if (this.disposed) return;
        const model = gltf.scene;

        model.updateMatrixWorld(true);
        const rawSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());

        const longestAxis =
          rawSize.x >= rawSize.y && rawSize.x >= rawSize.z ? 'x'
          : rawSize.y >= rawSize.x && rawSize.y >= rawSize.z ? 'y'
          : 'z';
        const shortestAxis =
          rawSize.x <= rawSize.y && rawSize.x <= rawSize.z ? 'x'
          : rawSize.y <= rawSize.x && rawSize.y <= rawSize.z ? 'y'
          : 'z';

        if (longestAxis === 'z' && shortestAxis === 'y') {
          model.rotation.x = -Math.PI / 2;
        } else if (longestAxis === 'x' && shortestAxis === 'y') {
          model.rotation.z = Math.PI / 2;
        } else if (longestAxis === 'z' && shortestAxis === 'x') {
          model.rotation.y = Math.PI / 2;
          model.rotation.x = -Math.PI / 2;
        }

        model.updateMatrixWorld(true);
        const rotatedSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());

        const TARGET_HEIGHT = 0.16;
        const scale = TARGET_HEIGHT / rotatedSize.y;
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);

        const scaledCenter = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
        model.position.sub(scaledCenter);
        model.updateMatrixWorld(true);

        this.modelSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());

        this._baseModelPosition = model.position.clone();
        model.position.z -= this.modelSize.z * (1 - this.opts.thickness) / 2;
        model.updateMatrixWorld(true);

        this._tweakMaterials(model);

        this.rotator.add(model);
        this.loadedModel = model;
        this.modelLoaded = true;
        this._applyEnvIntensity(this.envIntensityFactor);
        if (this._twoSided) this._applyTwoSided(true);
        this._syncCameraFitSize();
        this._fitCamera();
      },
      undefined,
      (err) => console.error('[RotatingPhone] load failed', err),
    );
  }

  _tweakMaterials(model) {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const screenTex = this.screenTex;
    const brightness = this.screenBrightness;
    model.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mat = obj.material;
      try {
        if (mat.envMapIntensity !== undefined) mat.envMapIntensity = 1.0;
        if (mat.map) mat.map.anisotropy = maxAniso;
        mat.dithering = true;
      } catch (e) { /* noop */ }

      switch (mat.name) {
        case 'Screen_BG':
        case 'Screen_BG.001': {
          const uv = obj.geometry.attributes.uv;
          if (uv) {
            let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
            for (let i = 0; i < uv.count; i++) {
              const u = uv.getX(i), v = uv.getY(i);
              if (u < umin) umin = u; if (u > umax) umax = u;
              if (v < vmin) vmin = v; if (v > vmax) vmax = v;
            }
            const du = umax - umin, dv = vmax - vmin;
            if (du > 1e-6 && dv > 1e-6) {
              const arr = uv.array.slice();
              for (let i = 0; i < uv.count; i++) {
                arr[i * 2] = (uv.getX(i) - umin) / du;
                arr[i * 2 + 1] = (uv.getY(i) - vmin) / dv;
              }
              obj.geometry.setAttribute('uv', new THREE.BufferAttribute(arr, 2));
            }
          }
          const newMat = new THREE.MeshPhysicalMaterial({
            color: 0x000000,
            emissive: 0xffffff,
            emissiveMap: screenTex,
            emissiveIntensity: brightness,
            metalness: 0.0,
            roughness: 0.08,
            clearcoat: 1.0,
            clearcoatRoughness: 0.03,
            ior: 1.5,
            envMapIntensity: 1.3,
            dithering: true,
          });
          obj.material = newMat;
          if (mat.name === 'Screen_BG') {
            this.screenMat = newMat;
            this.screenMesh = obj;
          } else {
            this.screenMatBack = newMat;
          }
          break;
        }
        case 'Screen_Rim':
        case 'Screen_Rim.001': {
          mat.roughness = Math.min(mat.roughness ?? 0.4, 0.35);
          if (mat.envMapIntensity !== undefined) mat.envMapIntensity = 1.3;
          break;
        }
        case 'Rim_Buttons': {
          if (mat.map) { mat.map.dispose?.(); mat.map = null; }
          mat.color.setHex(0x23252a);
          mat.metalness = 1.0;
          mat.roughness = 0.3;
          if (mat.envMapIntensity !== undefined) mat.envMapIntensity = 1.4;
          mat.needsUpdate = true;
          break;
        }
        case 'Rim_Frame_Only': {
          if (mat.map) { mat.map.dispose?.(); mat.map = null; }
          mat.color.setHex(0x23252a);
          mat.metalness = 1.0;
          mat.roughness = 0.3;
          if (mat.envMapIntensity !== undefined) mat.envMapIntensity = 1.4;
          mat.needsUpdate = true;
          break;
        }
        case 'Plastic':
        case 'Material.001':
        case 'Material.002':
        case 'Material.003': {
          if (mat.map) { mat.map.dispose?.(); mat.map = null; }
          mat.color.setHex(0x1d1f23);
          mat.metalness = mat.metalness ?? 0.0;
          mat.roughness = Math.max(mat.roughness ?? 0.4, 0.35);
          if (mat.envMapIntensity !== undefined) mat.envMapIntensity = 1.0;
          mat.needsUpdate = true;
          break;
        }
        case 'Screen_Glass':
        case 'Glass_Camera_Logo':
        case 'Flash_Glass_002':
        case 'Camera_Pixel_Glass_002': {
          const g = new THREE.MeshPhysicalMaterial({
            color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
            map: mat.map ?? null,
            normalMap: mat.normalMap ?? null,
            roughnessMap: mat.roughnessMap ?? null,
            metalnessMap: mat.metalnessMap ?? null,
            transparent: true,
            opacity: Math.max(mat.opacity ?? 0.3, 0.15),
            roughness: 0.05,
            metalness: 0.0,
            clearcoat: 1.0,
            clearcoatRoughness: 0.03,
            ior: 1.5,
            envMapIntensity: 1.4,
            depthWrite: false,
            side: mat.side ?? THREE.FrontSide,
            dithering: true,
          });
          obj.material = g;
          break;
        }
      }
    });
  }

  _syncCameraFitSize() {
    if (!this.rotator || !this.loadedModel) return;
    this.rotator.updateMatrixWorld(true);
    new THREE.Box3().setFromObject(this.rotator).getSize(this._cameraFitSize);
    if (this._cameraFitSize.lengthSq() < 1e-12) {
      this._cameraFitSize.copy(this.modelSize);
    }
  }

  _fitCamera() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const fov = this.camera.fov * (Math.PI / 180);
    const aspect = w / h;
    const effFit = this.fitScreenFraction;
    const fit = this.modelLoaded ? this._cameraFitSize : this.modelSize;
    const marginH = 2.1 / effFit;
    const marginW = 1.75 / effFit;
    const dH = (fit.y * marginH) / (2 * Math.tan(fov / 2));
    const dW = (fit.x * marginW) / (2 * Math.tan(fov / 2) * aspect);
    const d = Math.max(dH, dW) * 1.05;
    this.camera.position.set(0, 0, d);
    this.camera.lookAt(0, 0, 0);
  }

  _applyClippingToTree(root, planes) {
    if (!root) return;
    const apply = (m) => { m.clippingPlanes = planes; m.clipShadows = !!planes; };
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      if (Array.isArray(obj.material)) obj.material.forEach(apply);
      else apply(obj.material);
    });
  }

  _applyTwoSided(active) {
    if (active && !this.mirrorInstance) {
      if (!this.loadedModel) return;

      const clone = this.loadedModel.clone(true);

      let backScreenMat = null;
      const cloneMat = (m) => {
        const c = m.clone();
        c.clippingPlanes = [this._planeBack];
        c.clipShadows = true;
        if (m === this.screenMat) backScreenMat = c;
        return c;
      };
      clone.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const firstMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        if (firstMat?.name === 'Rim_Buttons') {
          obj.visible = false;
          return;
        }
        if (firstMat?.name === 'Rim_Frame_Only') {
          obj.visible = true;
        }
        if (Array.isArray(obj.material)) obj.material = obj.material.map(cloneMat);
        else obj.material = cloneMat(obj.material);
      });
      this.screenMatBack = backScreenMat;

      this._yRotQuat = this._yRotQuat || new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      clone.position.copy(this.loadedModel.position).applyQuaternion(this._yRotQuat);
      clone.quaternion.copy(this.loadedModel.quaternion).premultiply(this._yRotQuat);
      clone.scale.copy(this.loadedModel.scale);

      const gap = this.gapRatio * this.modelSize.z;
      clone.position.z -= gap;
      this._planeBack.constant = -gap;

      this.rotator.add(clone);
      this.mirrorInstance = clone;

      this._applyClippingToTree(this.loadedModel, [this._planeFront]);
      this._syncCameraFitSize();
      this._fitCamera();
    } else if (!active && this.mirrorInstance) {
      this.mirrorInstance.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose?.());
        else m.dispose?.();
      });
      this.rotator.remove(this.mirrorInstance);
      this.mirrorInstance = null;
      this.screenMatBack = null;
      this._applyClippingToTree(this.loadedModel, null);
      this._syncCameraFitSize();
      this._fitCamera();
    }
  }

  _updateTwoSidedOffset() {
    if (!this.mirrorInstance) return;
    this._yRotQuat = this._yRotQuat || new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    this.mirrorInstance.position.copy(this.loadedModel.position).applyQuaternion(this._yRotQuat);
    this.mirrorInstance.quaternion.copy(this.loadedModel.quaternion).premultiply(this._yRotQuat);
    this.mirrorInstance.scale.copy(this.loadedModel.scale);
    const gap = this.gapRatio * this.modelSize.z;
    this.mirrorInstance.position.z -= gap;
    this._planeBack.constant = -gap;
    this._syncCameraFitSize();
    this._fitCamera();
  }

  _applyEnvIntensity(factor) {
    this.envIntensityFactor = factor;
    if (!this.loadedModel) return;
    this.loadedModel.traverse((obj) => {
      if (obj.isMesh && obj.material && obj.material.envMapIntensity !== undefined) {
        if (!this._baseEnvIntensity.has(obj.material)) {
          this._baseEnvIntensity.set(obj.material, obj.material.envMapIntensity);
        }
        obj.material.envMapIntensity = this._baseEnvIntensity.get(obj.material) * factor;
      }
    });
  }

  // ---------- Public API ----------

  setSpeed(value) {
    this.speedMultiplier = Number(value) || 0;
  }

  setTwoSided(active) {
    this._twoSided = !!active;
    this._applyTwoSided(this._twoSided);
  }

  setGap(ratio) {
    this.gapRatio = Number(ratio) || 0;
    this._updateTwoSidedOffset();
  }

  setScale(fraction) {
    this.fitScreenFraction = Number(fraction) || 1;
    this._fitCamera();
  }

  setThickness(value) {
    const t = Math.max(0.01, Number(value) || 0.01);
    this.opts.thickness = t;
    if (!this.loadedModel || !this._baseModelPosition) return;
    const m = this.loadedModel;
    m.position.copy(this._baseModelPosition);
    m.position.z -= this.modelSize.z * (1 - t) / 2;
    m.updateMatrixWorld(true);
    if (this.mirrorInstance) this._updateTwoSidedOffset();
    else {
      this._syncCameraFitSize();
      this._fitCamera();
    }
  }

  setBrightness(value) {
    this.screenBrightness = Number(value) || 0;
    if (this.screenMat) this.screenMat.emissiveIntensity = this.screenBrightness;
    if (this.screenMatBack) this.screenMatBack.emissiveIntensity = this.screenBrightness;
  }

  setSoftbox(intensity) {
    this.softbox.intensity = Number(intensity) || 0;
  }

  setEnvRotationDeg(deg) {
    this.envRotationY = (Number(deg) || 0) * Math.PI / 180;
    this._regenerateEnv();
  }

  setEnvBlur(value) {
    this.envBlur = Number(value) || 0;
    this._regenerateEnv();
  }

  setEnvIntensity(factor) {
    this._applyEnvIntensity(Number(factor) || 0);
  }

  resize() { this._onResize(); }

  _onResize() {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const ndpr = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(ndpr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(ndpr);
      this.composer.setSize(w, h);
    }
    this._fitCamera();
  }

  _onVisibility() {
    if (document.hidden) this.clock.stop();
    else { this.clock.start(); this.clock.getDelta(); }
  }

  _animate() {
    if (this.disposed) return;
    const dt = this.clock.getDelta();
    if (this.modelLoaded) {
      this.rotator.rotation.y += this.BASE_ROT_SPEED * this.speedMultiplier * dt;
    }
    if (this.mirrorInstance) {
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(this.rotator.quaternion);
      this._planeFront.normal.copy(n);
      this._planeBack.normal.copy(n).negate();
    }
    if (this.recordScreen) this.recordScreen.tick(dt);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this._rafId = requestAnimationFrame(this._animate);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this._rafId);

    window.removeEventListener('resize', this._onResize);
    document.removeEventListener("visibilitychange", this._onVisibility);
    this._resizeObserver?.disconnect();

    this.scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose?.();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose?.());
        else m?.dispose?.();
      }
    });

    if (this.recordScreen) {
      this.recordScreen.dispose();
      this.recordScreen = null;
      this.screenTex = null;
    } else {
      this.screenTex?.dispose?.();
    }
    this.envRT?.dispose?.();
    this.hdrTexture?.dispose?.();
    this.pmrem?.dispose?.();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export default RotatingPhone;
