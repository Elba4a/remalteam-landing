// Hero 3D scene: contemporary Aseer villa at golden hour (wayfinder landing-hero, direction E).
// Loaded lazily by index.html only on desktops >= 1024px without reduced motion / data saver.
// ?still renders one settled frame at az=0.6 (no orbit, no parallax) for the static fallback render;
// ?still&az=<rad> pins another angle, ?q=<0-5> starts lower on the quality ladder (testing).
import * as THREE from './vendor/three-r170/three.module.min.js';

const P = new URLSearchParams(location.search);
const C = {
  night: 0x1c1d21, gold: 0xc8a46b, earth: 0x49443f, stone: 0x8a857d,
  sand: 0xede7dd, ivory: 0xf7f4ef, ground: 0x2a2724,
};
// Golden-hour light
const L = {
  top: 0x2a2a30, bottom: 0x9a7350, fog: 0x6a5240, sun: 0xffb46e, sunI: 3.2, sunPos: [-26, 9, 26],
  hemi: [0xf2d6b4, 0x3a2e24, 0.6], env: 0.85, glow: 0.45, ridge: [0x3a332d, 0x463c33, 0x54473b],
};
const SCALE = 0.82, AZ = 0.6, INTRO = 2.5;
const tan = (d) => Math.tan(d * Math.PI / 180);
const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

// --- materials -------------------------------------------------------------
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...o });

function stoneTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), rnd = mulberry(3);
  g.fillStyle = '#3d3934'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256;) {
    const h = 22 + Math.floor(rnd() * 18);
    for (let x = -Math.floor(rnd() * 40); x < 256;) {
      const w = 34 + Math.floor(rnd() * 50), v = 0.85 + rnd() * 0.3;
      g.fillStyle = `rgb(${(0x8a * v) | 0},${(0x85 * v) | 0},${(0x7d * v) | 0})`;
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
      x += w;
    }
    y += h;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.45, 0.45);
  return t;
}

let M;
function materials() {
  const stoneMap = stoneTexture();
  M = {
    body: mat(C.sand, { roughness: 0.92 }),
    ivory: mat(C.ivory, { roughness: 0.8 }),
    earth: mat(C.earth, { roughness: 0.9 }),
    stone: mat(0xffffff, { map: stoneMap, bumpMap: stoneMap, bumpScale: 2, roughness: 0.95 }),
    paving: mat(C.stone, { roughness: 0.95 }),
    gold: mat(C.gold, { metalness: 0.55, roughness: 0.32 }),
    wood: mat(0x5a4636, { roughness: 0.8 }),
    lawn: mat(0x4a5536, { roughness: 1 }),
    leaf: mat(0x3b4733, { roughness: 0.9 }),
    bark: mat(0x4a3a2e),
    clear: mat(0x9aa4a8, { metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.28 }),
    room: [0, 1, 2].map(() => mat(0x2a2218, { emissive: 0xffb36b, emissiveIntensity: 0, roughness: 1 })),
    curtain: mat(0xf2e3cc, { emissive: 0xffc58a, emissiveIntensity: 0, roughness: 1 }),
    lamp: mat(0xfff1d6, { emissive: 0xffc27a, emissiveIntensity: 0 }),
    car: mat(0x2b2c30, { metalness: 0.6, roughness: 0.3 }),
  };
}
// Night-glow targets, faded in with the intro dolly (k = 0..1)
const lights = [];
function setGlow(k) {
  M.room.forEach((m, i) => (m.emissiveIntensity = k * L.glow * [0.55, 0.8, 1][i]));
  M.curtain.emissiveIntensity = k * L.glow * 0.35;
  M.lamp.emissiveIntensity = k * 2.5;
  for (const l of lights) l.intensity = k * l.userData.i;
}

// --- geometry kit ----------------------------------------------------------
// Chamfered box: extruded rectangle with a ~5cm bevel so edges catch the env light.
function bgeo(w, h, d, b = Math.min(0.05, w / 5, h / 5, d / 5)) {
  const s = new THREE.Shape(), W = w / 2 - b, H = h / 2 - b;
  s.moveTo(-W, -H); s.lineTo(W, -H); s.lineTo(W, H); s.lineTo(-W, H);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(d - 2 * b, 0.001), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -(d - 2 * b) / 2);
  return g;
}
// Battered wall: narrow the top by `deg` degrees on every side.
function taper(g, deg) {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox, h = max.y - min.y, inset = tan(deg) * h;
  const hw = (max.x - min.x) / 2, hd = (max.z - min.z) / 2, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - min.y) / h;
    p.setX(i, p.getX(i) * (1 - (inset / hw) * t));
    p.setZ(i, p.getZ(i) * (1 - (inset / hd) * t));
  }
  g.computeVertexNormals();
  return g;
}
function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o;
}
const box = (w, h, d, m, x, y, z, b) => mesh(bgeo(w, h, d, b), m, x, y, z);
function at(o, x, y, z, ry = 0) { o.position.set(x, y, z); o.rotation.y = ry; return o; }

// Window on a +z face: reflective glass in front of a warm lit room, curtain, light frame, sill.
let wi = 0;
function win(w, h, { mull = false, frame = M.ivory, ft = 0.12, fd = 0.22, sill = true } = {}) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.PlaneGeometry(w, h), M.room[wi++ % 3], 0, 0, -0.3));
  g.add(mesh(new THREE.PlaneGeometry(w * 0.28, h * 0.96), M.curtain, (wi % 2 ? -1 : 1) * w * 0.34, 0, -0.18));
  g.add(mesh(new THREE.PlaneGeometry(w, h), M.clear, 0, 0, -0.02));
  g.add(box(w + ft * 2, ft, fd, frame, 0, h / 2 + ft / 2, 0));
  g.add(box(w + ft * 2, ft, fd, frame, 0, -h / 2 - ft / 2, 0));
  g.add(box(ft, h, fd, frame, -w / 2 - ft / 2, 0, 0));
  g.add(box(ft, h, fd, frame, w / 2 + ft / 2, 0, 0));
  if (sill) g.add(box(w + ft * 2 + 0.16, 0.07, fd + 0.14, frame, 0, -h / 2 - ft - 0.03, 0.07));
  if (mull) g.add(box(w, 0.06, 0.08, frame, 0, h * 0.18, 0));
  return g;
}
// Rigaf: thin projecting slate bands every `step` m on a battered volume.
function rigaf(w, d, h, { y0 = 0.4, step = 0.5, deg = 0, proj = 0.18 } = {}) {
  const ys = []; for (let y = y0; y < h - 0.3; y += step) ys.push(y);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.07, 1), M.earth, ys.length);
  const inset = tan(deg), mx = new THREE.Matrix4();
  ys.forEach((y, i) => {
    const s = 2 * inset * y;
    mx.compose(new THREE.Vector3(0, y - h / 2, 0), new THREE.Quaternion(), new THREE.Vector3(w - s + proj * 2, 1, d - s + proj * 2));
    im.setMatrixAt(i, mx);
  });
  im.castShadow = im.receiveShadow = true;
  return im;
}
// Row of extruded triangles (Al-Qatt / shurrafat / marw), centred on x, facing +z.
function tris(len, size, m, { depth = 0.04, down = false } = {}) {
  const s = new THREE.Shape(); s.moveTo(-size / 2, 0); s.lineTo(size / 2, 0); s.lineTo(0, down ? -size * 0.9 : size * 0.9);
  const n = Math.floor(len / size), g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  const im = new THREE.InstancedMesh(g, m, n), mx = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { mx.makeTranslation((i - (n - 1) / 2) * size, 0, 0); im.setMatrixAt(i, mx); }
  im.castShadow = true;
  return im;
}
// Vertical louvers / bars facing +z.
function louvers(w, h, m, pitch) {
  const n = Math.floor(w / pitch), im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, h, 0.18), m, n), mx = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { mx.makeTranslation((i - (n - 1) / 2) * pitch, 0, 0); im.setMatrixAt(i, mx); }
  im.castShadow = true;
  return im;
}
function juniper(x, z, s = 1) {
  const g = new THREE.Group(), r = mulberry((x * 31 + z * 17) | 0);
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6), M.bark, 0, 0.6, 0));
  for (let i = 0; i < 4; i++) {
    const k = 1 - i * 0.22, b = mesh(new THREE.IcosahedronGeometry(0.9 * k, 1), M.leaf, (r() - 0.5) * 0.4, 1.4 + i * 0.95, (r() - 0.5) * 0.4);
    b.scale.set(1, 1.25, 1); g.add(b);
  }
  g.position.set(x, 0.3, z); g.scale.setScalar(s); return g;
}
function lamp(v, x, y, z, i = 14, dist = 9) {
  v.add(mesh(new THREE.BoxGeometry(0.16, 0.32, 0.12), M.lamp, x, y, z));
  const l = new THREE.PointLight(0xffb25e, 0, dist, 2); l.userData.i = i * Math.max(L.glow, 0.5);
  l.position.set(x, y, z + 0.4); v.add(l); lights.push(l);
}
function bollard(v, x, z) {
  v.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 10), M.earth, x, 0.65, z));
  v.add(mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.12, 10), M.lamp, x, 0.95, z));
}
// Transparent front fence: low wall + slim bars, gate gap between lit pillars. Returns the pillar xs.
function fence(v, len, z, gapX, gapW, cx0) {
  const half = len / 2;
  for (const [a, b] of [[cx0 - half, gapX - gapW / 2], [gapX + gapW / 2, cx0 + half]]) {
    const w = b - a, cx = (a + b) / 2;
    v.add(box(w, 0.6, 0.35, M.body, cx, 0.6, z));
    v.add(at(louvers(w - 0.2, 1.1, M.earth, 0.18), cx, 1.45, z));
    v.add(box(w, 0.08, 0.12, M.earth, cx, 2.02, z));
  }
  return [-1, 1].map((sx) => {
    const px = gapX + sx * (gapW / 2 + 0.25);
    v.add(box(0.5, 2.3, 0.5, M.ivory, px, 1.45, z));
    v.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), M.lamp, px, 2.75, z));
    return px;
  });
}
function car(v, x, z, ry) {
  const g = new THREE.Group();
  g.add(box(4.5, 0.75, 1.85, M.car, 0, 0.75, 0, 0.15));
  g.add(box(2.6, 0.62, 1.6, M.car, -0.3, 1.42, 0, 0.18));
  g.add(mesh(new THREE.BoxGeometry(2.5, 0.5, 1.62), M.clear, -0.3, 1.44, 0));
  for (const wx of [-1.45, 1.45]) for (const wz of [-0.85, 0.85]) {
    const w = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16), M.earth, wx, 0.4, wz); w.rotation.x = Math.PI / 2; g.add(w);
  }
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.12, 1.4), M.lamp, 2.26, 0.85, 0));
  g.position.set(x, 0.3, z); g.rotation.y = ry; v.add(g);
}
function pergola(v, w, d, x, y, z) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) v.add(box(0.18, 2.6, 0.18, M.wood, x + sx * (w / 2 - 0.1), y + 1.3, z + sz * (d / 2 - 0.1)));
  v.add(box(w, 0.2, 0.2, M.wood, x, y + 2.6, z + d / 2 - 0.1));
  v.add(box(w, 0.2, 0.2, M.wood, x, y + 2.6, z - d / 2 + 0.1));
  const sl = louvers(w - 0.2, d, M.wood, 0.3); sl.rotation.x = Math.PI / 2; v.add(at(sl, x, y + 2.75, z)); sl.rotation.x = Math.PI / 2;
}
function steps(v, w, n, x, z) {
  for (let i = 0; i < n; i++) v.add(box(w, 0.16 * (n - i), 0.35, M.paving, x, 0.3 + 0.08 * (n - i), z + i * 0.35));
}
function path(v, x, z0, z1, w = 1.6) {
  for (let z = z0; z < z1; z += 0.9) v.add(box(w, 0.06, 0.75, M.ivory, x, 0.33, z + 0.4));
}

// --- the villa -------------------------------------------------------------
function villa(v) {
  v.add(box(30, 0.3, 24, M.paving, 0, 0.15, 1));
  v.add(box(9, 0.08, 6.5, M.lawn, -9.5, 0.34, 7.6));
  v.add(box(5.2, 0.06, 10, M.earth, 11.5, 0.33, 7.5));                      // driveway

  // Ground floor: all stone, marw triangles over the windows
  v.add(box(15, 3.6, 10, M.stone, 0, 2.1, -2));
  v.add(box(15.2, 0.18, 10.2, M.ivory, 0, 3.99, -2));
  for (const x of [-2.2, -4.9]) {
    v.add(at(win(1.4, 2.0, { mull: true }), x, 2.3, 3.03));
    v.add(at(tris(1.6, 0.42, M.ivory, { depth: 0.12 }), x, 3.42, 3.05));
  }
  v.add(at(win(2.4, 2.0, { mull: true }), 7.53, 2.3, -1, Math.PI / 2));

  // Porch: canopy on two stone columns with gold Qatt, steps, double timber door, wall lamps
  v.add(box(4.8, 0.28, 2.7, M.ivory, 2.5, 3.5, 4.3));
  for (const x of [0.4, 4.6]) v.add(box(0.32, 3.2, 0.32, M.stone, x, 1.9, 5.4));
  v.add(at(tris(4.4, 0.3, M.gold, { down: true }), 2.5, 3.34, 5.66));
  v.add(at(tris(4.4, 0.3, M.gold), 2.5, 3.34, 5.66));
  steps(v, 3.4, 3, 2.5, 3.2);
  v.add(box(0.86, 2.5, 0.12, M.wood, 2.06, 2.05, 3.04));
  v.add(box(0.86, 2.5, 0.12, M.wood, 2.94, 2.05, 3.04));
  for (const x of [2.36, 2.64]) v.add(box(0.05, 0.5, 0.08, M.gold, x, 2.1, 3.12));
  v.add(box(2.1, 0.14, 0.26, M.ivory, 2.5, 3.37, 3.08));
  v.add(box(0.14, 2.6, 0.26, M.ivory, 1.55, 2.05, 3.08));
  v.add(box(0.14, 2.6, 0.26, M.ivory, 3.45, 2.05, 3.08));
  lamp(v, 1.15, 2.7, 3.1); lamp(v, 3.85, 2.7, 3.1);

  // Battered upper floor with rigaf + white coping and shurrafat; front terrace on the ground-floor roof
  const up = { w: 10, h: 3.3, d: 8, x: -2, z: -2.5, y0: 4.08 };
  v.add(mesh(taper(bgeo(up.w, up.h, up.d), 2), M.body, up.x, up.y0 + up.h / 2, up.z));
  v.add(at(rigaf(up.w, up.d, up.h, { y0: 0.5, deg: 2, step: 0.55 }), up.x, up.y0 + up.h / 2, up.z));
  const tw = up.w - 2 * tan(2) * up.h, td = up.d - 2 * tan(2) * up.h;
  v.add(box(tw + 0.2, 0.18, td + 0.2, M.ivory, up.x, up.y0 + up.h + 0.09, up.z));
  v.add(at(tris(tw, 0.5, M.ivory, { depth: 0.2 }), up.x, up.y0 + up.h + 0.18, up.z + td / 2 - 0.1));
  v.add(at(tris(td, 0.5, M.ivory, { depth: 0.2 }), up.x + tw / 2 - 0.1, up.y0 + up.h + 0.18, up.z, Math.PI / 2));
  const fz = up.z + up.d / 2 + 0.12;
  v.add(at(win(3.6, 2.4), -3.6, 5.45, fz));                                 // sliding door
  v.add(at(win(1.4, 1.7, { mull: true }), 0.9, 5.7, fz));
  v.add(at(win(1.6, 1.7), up.x + tw / 2 + 0.03, 5.7, -2.5, Math.PI / 2));
  lamp(v, -1.5, 6.4, fz + 0.05, 10, 7);
  v.add(box(9.6, 1.0, 0.25, M.body, -2.6, 4.58, 2.86));                     // terrace parapet with Qatt
  v.add(box(9.8, 0.12, 0.35, M.ivory, -2.6, 5.12, 2.86));
  v.add(at(tris(9.2, 0.3, M.gold), -2.6, 4.5, 3.0));
  v.add(at(tris(9.2, 0.3, M.gold, { down: true }), -2.6, 4.5, 3.0));

  pergola(v, 4.2, 5.6, 4.9, 4.08, -1.2);

  // Battered stair tower with rigaf + white crown and shurrafat
  const H = 9.6, W = 3.4, X = -8.4, Z = -5.6, deg = 3;
  v.add(mesh(taper(bgeo(W, H, W), deg), M.body, X, 0.3 + H / 2, Z));
  v.add(at(rigaf(W, W, H, { y0: 0.6, deg }), X, 0.3 + H / 2, Z));
  const top = W - 2 * tan(deg) * H;
  v.add(box(top + 0.2, 0.2, top + 0.2, M.ivory, X, 0.3 + H + 0.1, Z));
  for (const r of [0, Math.PI / 2]) v.add(at(tris(top, 0.45, M.ivory, { depth: 0.18 }), X + (r ? top / 2 - 0.09 : 0), 0.3 + H + 0.2, Z + (r ? 0 : top / 2 - 0.09), r));
  v.add(at(win(0.5, 1.3, { ft: 0.14, fd: 0.4, sill: false }), X, 7.2, Z + (W - 2 * tan(deg) * 6.9) / 2 + 0.05));

  // Carport + car, garden, path, transparent front fence with the RT plate on the gate pillar
  v.add(box(5.6, 0.22, 6.6, M.ivory, 11.5, 3.0, 0.6));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) v.add(box(0.2, 2.6, 0.2, M.earth, 11.5 + sx * 2.6, 1.6, 0.6 + sz * 3.1));
  car(v, 11.5, 0.8, -Math.PI / 2);
  path(v, 2.5, 5.0, 12.2);
  for (const z of [7, 9.5, 12]) { bollard(v, 1.3, z); bollard(v, 3.7, z); }
  const [px] = fence(v, 24, 12.6, 2.5, 2.6, -3);
  v.add(box(0.35, 1.0, 22, M.body, -14.8, 0.8, 1));
  for (const [x, z, s] of [[-12.5, 9.5, 0.9], [-13, -8, 1.1], [7.6, 10.4, 0.7], [-6.8, 10.6, 0.55], [-11, 5, 0.6], [14, -9, 1]]) v.add(juniper(x, z, s));
  return { footprint: [24, 16], plate: [px, 1.9, 12.86] };
}

// RT mark as a decal (SVGLoader would cost ~15KB on the wire for one small plate).
function plate(v, [x, y, z]) {
  const w = 0.4, m = new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.4, metalness: 0.5, roughness: 0.35, emissive: C.gold, emissiveIntensity: 0.15 });
  const done = new THREE.TextureLoader().loadAsync('/assets/mark-gold.svg').then((t) => {
    t.colorSpace = THREE.SRGBColorSpace; m.map = t; m.emissiveMap = t; m.needsUpdate = true;
  }, () => {});
  v.add(mesh(new THREE.PlaneGeometry(w, w * 152.48 / 187.98), m, x, y, z));
  return done;
}

// --- stage -----------------------------------------------------------------
function envMap(renderer) {
  const s = new THREE.Scene();
  const panel = (c, i, x, y, z, w, h) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  s.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(L.bottom).multiplyScalar(0.6), side: THREE.BackSide })));
  panel(L.top, 2.2 * L.env, 0, 5.9, 0, 10, 10);                                    // sky dome
  panel(L.sun, 6 * L.env, -5.9, 1, 1.5, 4, 2.5);                                   // sun-side softbox
  panel(L.bottom, 1.4 * L.env, 5.9, 0.5, -1, 6, 3);                                // horizon bounce
  panel(C.earth, 0.8, 0, -5.9, 0, 10, 10);                                         // ground bounce
  const pm = new THREE.PMREMGenerator(renderer), t = pm.fromScene(s, 0.04).texture; pm.dispose();
  return t;
}
function skyTexture() {
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#' + L.top.toString(16).padStart(6, '0'));
  gr.addColorStop(1, '#' + L.bottom.toString(16).padStart(6, '0'));
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function contactShadow(w, d) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.32; return m;
}
// Ridgeline rings: seamless sine silhouettes all the way round, fading into fog.
function ridges() {
  const grp = new THREE.Group(), rnd = mulberry(7);
  [[75, 9], [100, 16], [135, 26]].forEach(([r, h], k) => {
    const N = 240, pos = [], idx = [], ph = [rnd() * 9, rnd() * 9, rnd() * 9];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const n = 0.5 + 0.5 * (Math.sin(a * 3 + ph[0]) * 0.5 + Math.sin(a * 8 + ph[1]) * 0.3 + Math.sin(a * 19 + ph[2]) * 0.2);
      pos.push(Math.cos(a) * r, -3, Math.sin(a) * r, Math.cos(a) * r, h * (0.3 + 0.7 * n * n), Math.sin(a) * r);
      if (i < N) { const j = i * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    grp.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: L.ridge[k], side: THREE.DoubleSide })));
  });
  return grp;
}
function ground() {
  const g = new THREE.PlaneGeometry(320, 320, 64, 64); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), k = Math.min(Math.max((Math.hypot(x, z) - 20) / 40, 0), 1);
    p.setY(i, k * (Math.sin(x * 0.07) * 1.6 + Math.cos(z * 0.06 + x * 0.03) * 2));
  }
  g.computeVertexNormals();
  const o = new THREE.Mesh(g, mat(C.ground, { roughness: 1 })); o.receiveShadow = true;
  return o;
}

const frame = () => new Promise((r) => requestAnimationFrame(r));

export async function start(stage) {
  const still = P.has('still');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  let dpr = 1.75;
  renderer.setPixelRatio(Math.min(devicePixelRatio, dpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.prepend(renderer.domElement);

  // Frame 1: build the world. Frame 2: PMREM environment. Keeps each long task short.
  materials();
  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(L.fog, 50, 150);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 400);
  scene.add(new THREE.HemisphereLight(...L.hemi));
  const sun = new THREE.DirectionalLight(L.sun, L.sunI);
  sun.position.set(...L.sunPos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 90 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun, ground(), ridges());
  const r = mulberry(11);                                       // junipers behind and left of the plot only (copy sits right)
  for (let i = 0; i < 26; i++) scene.add(juniper(-40 + r() * 52, -14 - r() * 26, 0.55 + r() * 0.4));
  for (let i = 0; i < 8; i++) scene.add(juniper(-18 - r() * 16, -10 + r() * 24, 0.5 + r() * 0.4));
  const v = new THREE.Group();
  const { footprint, plate: pl } = villa(v);
  const markReady = plate(v, pl);
  const cs = contactShadow(footprint[0] * 1.5, footprint[1] * 1.5);
  v.scale.setScalar(SCALE); cs.scale.multiplyScalar(SCALE);
  scene.add(v, cs);
  setGlow(0);
  await frame();
  scene.environment = envMap(renderer);
  await frame();

  let level = 0, frozen = false, R = 50;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!still) addEventListener('pointermove', (e) => { pointer.tx = e.clientX / innerWidth - 0.5; pointer.ty = e.clientY / innerHeight - 0.5; }, { passive: true });
  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Push the villa left, clear of the RTL copy. At 1024-1200 the copy takes ~55% of the width, so the
    // camera also backs off (spec's 9.8 offset alone overlapped the copy by up to 126px at max orbit).
    camera.filmOffset = w > 1200 ? 12.6 : 12;
    R = w > 1200 ? 50 : 64;
    camera.updateProjectionMatrix();
    if (frozen) renderer.render(scene, camera); // setSize clears the canvas
  };
  new ResizeObserver(resize).observe(stage); resize();

  const target = new THREE.Vector3(0, 5, 0);
  const place = (t) => {
    const k = ease(t / INTRO);
    setGlow(k);
    const az = still ? (+P.get('az') || AZ) : AZ + Math.sin(t * 0.07) * 0.18 + pointer.x * 0.24;
    const d = R * (1 + 0.35 * (1 - k));                         // dolly-in from ~1.35x
    camera.position.set(Math.sin(az) * d, 5 + 7 * d / R - pointer.y * 4, Math.cos(az) * d);
    camera.lookAt(target);
  };
  const show = () => stage.classList.add('is-3d');

  if (still) {
    await markReady;
    renderer.domElement.style.transition = 'none';
    place(INTRO);
    renderer.render(scene, camera);
    show();
    await frame(); renderer.render(scene, camera);
    // Right-most projected villa point in CSS px (conservative per-mesh bounds), for the 24px copy-clearance check
    const b = new THREE.Box3(), p = new THREE.Vector3(), rc = stage.getBoundingClientRect();
    let mx = -1, mn = 1;
    v.traverse((o) => { if (!o.isMesh) return; b.setFromObject(o); for (let i = 0; i < 8; i++) { const x = p.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera).x; mx = Math.max(mx, x); mn = Math.min(mn, x); } });
    document.documentElement.dataset.heroRight = Math.round(rc.left + (mx + 1) / 2 * rc.width);
    document.documentElement.dataset.heroLeft = Math.round(rc.left + (mn + 1) / 2 * rc.width);
    document.documentElement.dataset.heroStill = 'ready';     // signal for the fallback render script
    return;
  }

  // Quality ladder: each ~2s window under 50 FPS drops one step; the last step freezes on one frame.
  const ladder = [
    () => { sun.shadow.mapSize.set(1024, 1024); sun.shadow.map?.dispose(); sun.shadow.map = null; },
    () => { renderer.shadowMap.type = THREE.PCFShadowMap; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); },
    () => { dpr = 1.25; renderer.setPixelRatio(Math.min(devicePixelRatio, dpr)); resize(); },
    () => { lights.forEach((l) => (l.visible = false)); },
    () => { frozen = true; },
  ];
  const down = () => { if (level < ladder.length) ladder[level++](); stage.dataset.q = level; };
  for (let q = +P.get('q') || 0; level < q && level < ladder.length;) down();

  // Own clock: only advances while running, so pausing never jumps the orbit.
  let t = 0, last = 0, win0 = 0.3, n = 0, running = false, onScreen = true;
  const tick = (now) => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0; last = now;
    t += dt;
    pointer.x += (pointer.tx - pointer.x) * 0.05; pointer.y += (pointer.ty - pointer.y) * 0.05;
    place(t);
    renderer.render(scene, camera);
    if (t === 0) show();
    if (t > win0) { n++; if (t > win0 + 2) { if (n / (t - win0) < 50 && !frozen) down(); win0 = t; n = 0; } }
    if (frozen && t >= INTRO) queueMicrotask(stop);           // after three re-queues this frame's rAF
  };
  const run = () => { if (running || frozen && t >= INTRO) return; running = true; last = 0; renderer.setAnimationLoop(tick); };
  const stop = () => { running = false; renderer.setAnimationLoop(null); };
  const sync = () => (onScreen && !document.hidden ? run() : stop());
  new IntersectionObserver((e) => { onScreen = e[0].isIntersecting; sync(); }).observe(stage);
  document.addEventListener('visibilitychange', sync);
  sync();
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
