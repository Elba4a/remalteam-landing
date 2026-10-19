// Hero 3D scene: stylised Aseer villa, low-poly ridgelines, extruded RT mark.
// Loaded lazily by index.html only on capable desktops without reduced motion.
import * as THREE from './vendor/three.module.min.js';
import { SVGLoader } from './vendor/SVGLoader.js';

const C = {
  night: 0x1c1d21, gold: 0xc8a46b, earth: 0x49443f, stone: 0x8a857d,
  sand: 0xede7dd, ivory: 0xf7f4ef, ground: 0x2a2724, ridge: 0x2f2d2a, ridgeFar: 0x252528,
};

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });
const box = (w, h, d, m, x = 0, y = 0, z = 0) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; return b;
};
const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

export function start(stage) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.night);
  scene.fog = new THREE.Fog(C.night, 45, 120);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 300);

  // Light: low warm sun from the west, cool sky fill
  scene.add(new THREE.HemisphereLight(0xf2e6d0, 0x1c1d21, 0.7));
  const sun = new THREE.DirectionalLight(0xffd7a0, 2.6);
  sun.position.set(-22, 18, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // Ground: flat plot that rolls into dunes further out
  const g = new THREE.PlaneGeometry(240, 240, 80, 80);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z);
    const k = Math.min(Math.max((d - 18) / 30, 0), 1);
    p.setY(i, k * (Math.sin(x * 0.11) * 1.4 + Math.cos(z * 0.09 + x * 0.04) * 1.8));
  }
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, mat(C.ground));
  ground.receiveShadow = true;
  scene.add(ground);

  // Aseer ridgelines: low-poly cones behind the villa
  const ridges = new THREE.Group();
  const rnd = mulberry(7);
  for (let i = 0; i < 26; i++) {
    const far = i > 12;
    const h = (far ? 22 : 13) + rnd() * (far ? 16 : 10);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(h * (0.9 + rnd() * 0.5), h, 5 + Math.floor(rnd() * 2)), mat(far ? C.ridgeFar : C.ridge));
    const a = -Math.PI * 0.95 + rnd() * Math.PI * 0.9;
    const r = (far ? 85 : 55) + rnd() * 18;
    cone.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
    cone.rotation.y = rnd() * Math.PI;
    ridges.add(cone);
  }
  scene.add(ridges);

  // Villa: two offset volumes, gold fins, lit windows, boundary wall
  const villa = new THREE.Group();
  const mWall = mat(C.sand), mUpper = mat(C.ivory), mEarth = mat(C.earth), mStone = mat(C.stone);
  const mGold = mat(C.gold, { metalness: 0.55, roughness: 0.4, flatShading: false });
  const mGlass = mat(0x151619, { emissive: 0xc8a46b, emissiveIntensity: 0.22, roughness: 0.3 });

  villa.add(box(28, 0.3, 20, mStone, 0, 0.15, 0)); // plot paving

  const lower = new THREE.Group();
  lower.add(box(13, 3.4, 8.5, mWall, 0, 1.7, -1));
  lower.add(box(3.2, 2.6, 0.2, mGlass, -3.2, 1.6, 3.3));
  lower.add(box(3.2, 2.6, 0.2, mGlass, 3.6, 1.6, 3.3));
  lower.add(box(1.5, 2.6, 0.2, mEarth, 0.6, 1.6, 3.32)); // door
  for (let i = 0; i < 6; i++) lower.add(box(0.12, 3.4, 0.35, mGold, 5.4 + i * 0.32, 1.7, 3.4)); // vertical fins
  lower.add(box(14, 0.35, 9.6, mEarth, 0, 3.55, -1)); // slab with canopy
  villa.add(lower);

  const upper = new THREE.Group();
  upper.position.set(-1.6, 3.7, -1.6);
  upper.add(box(9.5, 3.1, 7.5, mUpper, 0, 1.55, 0));
  upper.add(box(5.2, 1.9, 0.2, mGlass, -1.2, 1.6, 3.8));
  upper.add(box(0.2, 1.9, 2.6, mGlass, 4.8, 1.6, 0.5));
  upper.add(box(9.9, 0.25, 7.9, mGold, 0, 3.2, 0)); // gold parapet line
  upper.add(box(9.5, 0.6, 7.5, mUpper, 0, 3.6, 0));
  villa.add(upper);

  // Boundary wall with gate gap
  const wall = new THREE.Group();
  wall.add(box(28, 1.1, 0.35, mEarth, 0, 0.85, -9.8));
  wall.add(box(0.35, 1.1, 19.6, mEarth, -13.8, 0.85, 0));
  wall.add(box(0.35, 1.1, 19.6, mEarth, 13.8, 0.85, 0));
  wall.add(box(10.5, 1.1, 0.35, mEarth, -8.6, 0.85, 9.8));
  wall.add(box(10.5, 1.1, 0.35, mEarth, 8.6, 0.85, 9.8));
  villa.add(wall);

  // Two palms in brand-adjacent muted tones
  for (const [x, z, s] of [[-10, 6, 1], [10.5, -6.5, 0.85]]) villa.add(palm(x, z, s));
  scene.add(villa);

  // Sand-wave motif: three gold strokes across the dunes
  const waves = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const pts = [];
    for (let x = -60; x <= 60; x += 4) pts.push(new THREE.Vector3(x, 0.6, -17 - i * 2.6 + Math.sin(x * 0.08 + i) * 1.6));
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.11 - i * 0.025, 5),
      new THREE.MeshBasicMaterial({ color: C.gold, transparent: true, opacity: 0.9 - i * 0.25 })
    );
    waves.add(tube);
  }
  scene.add(waves);

  // Extruded RT mark floating over the villa
  const markPivot = new THREE.Group();
  markPivot.position.set(-1.6, 12, -1.6);
  scene.add(markPivot);
  new SVGLoader().load('/assets/mark-gold.svg', (data) => {
    const geos = [];
    for (const path of data.paths) for (const shape of SVGLoader.createShapes(path)) {
      geos.push(new THREE.ExtrudeGeometry(shape, { depth: 14, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 0.8, bevelSegments: 2, curveSegments: 6 }));
    }
    const m = new THREE.MeshStandardMaterial({ color: C.gold, metalness: 0.35, roughness: 0.4, emissive: C.gold, emissiveIntensity: 0.12 });
    const grp = new THREE.Group();
    geos.forEach((geo) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; grp.add(mesh); });
    const bb = new THREE.Box3().setFromObject(grp), c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
    grp.children.forEach((mesh) => mesh.geometry.translate(-c.x, -c.y, -c.z));
    const k = 5 / Math.max(s.x, s.y);
    grp.scale.set(k, -k, k); // SVG y points down
    markPivot.add(grp);
  });

  // Input: pointer parallax + hero scroll progress
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => { pointer.tx = e.clientX / innerWidth - 0.5; pointer.ty = e.clientY / innerHeight - 0.5; }, { passive: true });

  let visible = true;
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible) loop(); }).observe(stage);

  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.filmOffset = w > 1200 ? 9 : w > 900 ? 7 : 4; // shift the villa to the left, away from the RTL copy
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  const clock = new THREE.Clock();
  const target = new THREE.Vector3(0, 5.5, 0);
  let running = false, shown = false;

  function loop() {
    if (running) return;
    running = true;
    renderer.setAnimationLoop(frame);
  }
  function frame() {
    if (!visible) { renderer.setAnimationLoop(null); running = false; return; }
    const t = clock.getElapsedTime();
    const sp = Math.min(Math.max(scrollY / stage.clientHeight, 0), 1);
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;

    // Intro: volumes rise from the plot
    lower.scale.y = Math.max(ease(t / 1.2), 0.001);
    upper.scale.y = Math.max(ease((t - 0.5) / 1.2), 0.001);
    upper.position.y = 3.7 * lower.scale.y;
    wall.scale.y = Math.max(ease((t - 0.2) / 1), 0.001);
    markPivot.position.y = 12 + (1 - ease((t - 1.1) / 1.4)) * 10 + Math.sin(t * 0.9) * 0.35 + sp * 6;
    markPivot.rotation.y = Math.sin(t * 0.35) * 0.5 + sp * Math.PI;

    // Slow orbit, pointer parallax, scroll pulls the camera up and back
    const az = 0.6 + Math.sin(t * 0.07) * 0.35 + pointer.x * 0.25;
    const r = 54 + sp * 14;
    camera.position.set(Math.sin(az) * r, 12 + sp * 12 - pointer.y * 4, Math.cos(az) * r);
    target.y = 5.5 + sp * 3;
    camera.lookAt(target);

    renderer.render(scene, camera);
    if (!shown) { shown = true; stage.classList.add('is-3d'); }
  }
  loop();
}

function palm(x, z, s) {
  const grp = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 6, 6), mat(0x5a4c3e));
  trunk.position.y = 3; trunk.rotation.z = 0.06; trunk.castShadow = true;
  grp.add(trunk);
  const leaf = mat(0x5e6247);
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.4, 4), leaf);
    f.position.y = 6.1;
    f.rotation.set(0, (i / 7) * Math.PI * 2, 1.9);
    f.translateY(1.5);
    f.castShadow = true;
    grp.add(f);
  }
  grp.position.set(x, 0.3, z);
  grp.scale.setScalar(s);
  return grp;
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
