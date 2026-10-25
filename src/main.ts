import * as THREE from "three";
import { Sound } from "./audio";
import { CELL, H, HEIGHT, MAP, MONSTER_START, PATROL, START, W, cellToWorld } from "./map";

const $ = (id: string) => document.getElementById(id)!;
const sound = new Sound();

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020202);
scene.fog = new THREE.FogExp2(0x05060a, 0.035);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 80);
camera.rotation.order = "YXZ";
scene.add(camera);
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const ambient = new THREE.AmbientLight(0x6a7088, 1.6);
scene.add(ambient);

const flashlight = new THREE.SpotLight(0xfff2cc, 0, 22, 0.5, 0.5, 1.2);
flashlight.position.set(0.15, -0.1, 0);
flashlight.target.position.set(0, 0, -1);
camera.add(flashlight, flashlight.target);

// ---------- procedural textures ----------
function canvasTex(draw: (g: CanvasRenderingContext2D) => void, rx: number, ry: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.magFilter = THREE.NearestFilter;
  return t;
}
function speckle(g: CanvasRenderingContext2D, n: number, a: number) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() * 60;
    g.fillStyle = `rgba(${v},${v},${v},${a})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
}
const wallTex = canvasTex((g) => {
  g.fillStyle = "#3b4a3a";
  g.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 16) { g.fillStyle = "#33412f"; g.fillRect(x, 0, 6, 128); }
  g.fillStyle = "#1a120d";
  g.fillRect(0, 96, 128, 32);
  speckle(g, 900, 0.5);
}, 1, 1);
const floorTex = canvasTex((g) => {
  g.fillStyle = "#3a2616";
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) { g.fillStyle = "#1c110a"; g.fillRect(0, y, 128, 2); }
  speckle(g, 800, 0.5);
}, W * 2, H * 2);
const ceilTex = canvasTex((g) => { g.fillStyle = "#222018"; g.fillRect(0, 0, 128, 128); speckle(g, 500, 0.4); }, W, H);

const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2c16, roughness: 0.9 });
const metalMat = new THREE.MeshStandardMaterial({ color: 0x556068, roughness: 0.5, metalness: 0.6 });

// ---------- world / grid ----------
const solid: boolean[][] = MAP.map((r) => [...r].map((ch) => ch === "#" || ch === "D" || ch === "E"));
const isSolid = (cx: number, cy: number) => cx < 0 || cy < 0 || cx >= W || cy >= H || solid[cy][cx];

{
  const walls: THREE.Matrix4[] = [];
  MAP.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === "#") walls.push(new THREE.Matrix4().makeTranslation(cellToWorld(x), HEIGHT / 2, cellToWorld(y)));
  }));
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, HEIGHT, CELL), wallMat, walls.length);
  walls.forEach((m, i) => im.setMatrixAt(i, m));
  scene.add(im);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((W * CELL) / 2, 0, (H * CELL) / 2);
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL), new THREE.MeshStandardMaterial({ map: ceilTex }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set((W * CELL) / 2, HEIGHT, (H * CELL) / 2);
  scene.add(ceil);
}

// ceiling lights, each controlled by a wall switch (the fuse box turns everything on)
const lamps: THREE.PointLight[] = [];
const lampOn: boolean[] = [];
const bulbMats: THREE.MeshBasicMaterial[] = [];
for (const [x, y] of [[10, 3], [4, 7], [15, 7], [5, 11], [18, 11], [3, 3]]) {
  const l = new THREE.PointLight(0xffc880, 0, 18, 1.4);
  l.position.set(cellToWorld(x), 2.6, cellToWorld(y));
  scene.add(l);
  lamps.push(l);
  lampOn.push(false);
  const bm = new THREE.MeshBasicMaterial({ color: 0x554433 });
  bulbMats.push(bm);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1), bm);
  bulb.position.copy(l.position);
  scene.add(bulb);
}

// ---------- funny wall paintings (procedurally drawn) ----------
const paintDraws: ((g: CanvasRenderingContext2D) => void)[] = [
  // pumpkin
  (g) => {
    g.fillStyle = "#3a1a55"; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#f08a10"; g.beginPath(); g.ellipse(128, 145, 90, 75, 0, 0, 7); g.fill();
    g.fillStyle = "#2f8a2f"; g.fillRect(120, 55, 16, 28);
    g.fillStyle = "#ffe14a";
    g.beginPath(); g.moveTo(80, 120); g.lineTo(110, 120); g.lineTo(95, 95); g.fill();
    g.beginPath(); g.moveTo(146, 120); g.lineTo(176, 120); g.lineTo(161, 95); g.fill();
    g.beginPath(); g.moveTo(75, 160); g.quadraticCurveTo(128, 230, 181, 160); g.lineTo(165, 165); g.lineTo(150, 180); g.lineTo(128, 165); g.lineTo(106, 180); g.lineTo(91, 165); g.fill();
  },
  // ghost saying BOO
  (g) => {
    g.fillStyle = "#1c4a5a"; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#f4f4ff"; g.beginPath(); g.moveTo(60, 230); g.lineTo(60, 110); g.arc(128, 110, 68, Math.PI, 0); g.lineTo(196, 230);
    for (let i = 0; i < 4; i++) g.quadraticCurveTo(186 - i * 34, 195, 162 - i * 34, 230);
    g.fill();
    g.fillStyle = "#111"; g.beginPath(); g.ellipse(105, 110, 14, 20, 0, 0, 7); g.ellipse(151, 110, 14, 20, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(128, 160, 18, 24, 0, 0, 7); g.fill();
    g.fillStyle = "#ffe14a"; g.font = "bold 40px Georgia"; g.fillText("BOO!", 78, 48);
  },
  // skeleton with moustache and monocle
  (g) => {
    g.fillStyle = "#5a2a2a"; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#f2ecd8"; g.beginPath(); g.ellipse(128, 110, 70, 80, 0, 0, 7); g.fill(); g.fillRect(95, 170, 66, 50);
    g.fillStyle = "#111"; g.beginPath(); g.ellipse(100, 105, 18, 22, 0, 0, 7); g.ellipse(156, 105, 18, 22, 0, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(156, 105, 6, 0, 7); g.fill();
    g.strokeStyle = "#d4a62a"; g.lineWidth = 4; g.beginPath(); g.arc(156, 105, 28, 0, 7); g.stroke(); g.beginPath(); g.moveTo(180, 125); g.lineTo(200, 200); g.stroke();
    g.fillStyle = "#222"; g.beginPath(); g.moveTo(128, 150); g.quadraticCurveTo(90, 125, 60, 160); g.quadraticCurveTo(100, 160, 128, 160); g.quadraticCurveTo(156, 160, 196, 160); g.quadraticCurveTo(166, 125, 128, 150); g.fill();
    g.fillStyle = "#111"; for (let i = 0; i < 5; i++) g.fillRect(104 + i * 11, 185, 6, 30);
  },
  // happy bat
  (g) => {
    g.fillStyle = "#6a2a8a"; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#fff6c0"; g.beginPath(); g.arc(200, 55, 32, 0, 7); g.fill();
    g.fillStyle = "#15101a";
    g.beginPath(); g.moveTo(128, 120); g.quadraticCurveTo(70, 40, 10, 110); g.quadraticCurveTo(50, 110, 55, 150); g.quadraticCurveTo(90, 120, 110, 160); g.fill();
    g.beginPath(); g.moveTo(128, 120); g.quadraticCurveTo(186, 40, 246, 110); g.quadraticCurveTo(206, 110, 201, 150); g.quadraticCurveTo(166, 120, 146, 160); g.fill();
    g.beginPath(); g.ellipse(128, 145, 28, 38, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(106, 112); g.lineTo(112, 90); g.lineTo(124, 108); g.moveTo(150, 112); g.lineTo(144, 90); g.lineTo(132, 108); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(118, 135, 7, 0, 7); g.arc(138, 135, 7, 0, 7); g.fill();
    g.fillStyle = "#111"; g.beginPath(); g.arc(120, 136, 3, 0, 7); g.arc(136, 136, 3, 0, 7); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 3; g.beginPath(); g.arc(128, 150, 12, 0.2, Math.PI - 0.2); g.stroke();
  },
  // wanted poster of the Concierge
  (g) => {
    g.fillStyle = "#d8c08a"; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#5a3a1a"; g.font = "bold 40px Georgia"; g.fillText("WANTED", 55, 42);
    g.font = "bold 18px Georgia"; g.fillText("FOR BAD SERVICE!", 56, 66);
    g.fillStyle = "#9fb09c"; g.beginPath(); g.ellipse(128, 140, 42, 55, 0, 0, 7); g.fill();
    g.fillStyle = "#aa1111"; g.fillRect(92, 78, 72, 28);
    g.fillStyle = "#111"; g.beginPath(); g.arc(112, 130, 9, 0, 7); g.arc(144, 130, 9, 0, 7); g.fill();
    g.fillStyle = "#c6ff3a"; g.beginPath(); g.arc(112, 130, 4, 0, 7); g.arc(144, 130, 4, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.fillRect(104, 160, 48, 12);
    g.fillStyle = "#111"; for (let i = 0; i < 7; i++) g.fillRect(105 + i * 7, 160, 2, 12);
    g.fillStyle = "#5a3a1a"; g.font = "bold 20px Georgia"; g.fillText("REWARD: 1 CANDY", 52, 228);
  },
  // cool spider
  (g) => {
    g.fillStyle = "#245a3a"; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "#ffffff66"; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(256, i * 52); g.stroke(); }
    g.strokeStyle = "#111"; g.lineWidth = 7;
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(128, 140); g.lineTo(128 + sx * (50 + i * 10), 90 + i * 28); g.lineTo(128 + sx * (80 + i * 10), 160 + i * 22); g.stroke(); }
    g.fillStyle = "#111"; g.beginPath(); g.ellipse(128, 160, 34, 42, 0, 0, 7); g.arc(128, 110, 26, 0, 7); g.fill();
    g.fillStyle = "#222"; g.fillRect(98, 100, 60, 16);
    g.fillStyle = "#6cf"; g.fillRect(101, 103, 24, 10); g.fillRect(131, 103, 24, 10);
    g.strokeStyle = "#fff"; g.lineWidth = 3; g.beginPath(); g.arc(128, 122, 10, 0.2, Math.PI - 0.2); g.stroke();
  },
  // Mona Ghoulisa
  (g) => {
    g.fillStyle = "#6a5a2a"; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#2a3a2a"; g.beginPath(); g.ellipse(128, 120, 62, 80, 0, 0, 7); g.fill();
    g.fillStyle = "#b9d6a8"; g.beginPath(); g.ellipse(128, 125, 44, 58, 0, 0, 7); g.fill();
    g.fillStyle = "#111"; g.beginPath(); g.ellipse(110, 115, 8, 5, 0, 0, 7); g.ellipse(146, 115, 8, 5, 0, 0, 7); g.fill();
    g.strokeStyle = "#7a3a3a"; g.lineWidth = 4; g.beginPath(); g.moveTo(108, 152); g.quadraticCurveTo(128, 166, 148, 152); g.stroke();
    g.fillStyle = "#3a2a4a"; g.fillRect(70, 190, 116, 66);
    g.fillStyle = "#fff"; g.font = "italic 16px Georgia"; g.fillText("Mona Ghoulisa", 74, 244);
  },
];
const paintMats = paintDraws.map((draw) => {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 1 });
});
{
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x6a4a1a, roughness: 0.5, metalness: 0.3 });
  const geo = new THREE.PlaneGeometry(0.85, 0.85);
  const frameGeo = new THREE.BoxGeometry(1.0, 1.0, 0.06);
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  MAP.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== "#") return;
    dirs.forEach(([dx, dy], di) => {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || MAP[ny][nx] !== ".") return;
      if ((x * 73 + y * 151 + di * 31) % 4 !== 0) return;
      const grp = new THREE.Group();
      const fr = new THREE.Mesh(frameGeo, frameMat);
      const pic = new THREE.Mesh(geo, paintMats[(x * 7 + y * 13 + di) % paintMats.length]);
      pic.position.z = 0.035;
      grp.add(fr, pic);
      grp.position.set(cellToWorld(x) + dx * (CELL / 2 + 0.03), 1.7, cellToWorld(y) + dy * (CELL / 2 + 0.03));
      grp.rotation.y = Math.atan2(dx, dy);
      grp.rotation.z = (((x + y + di) % 5) - 2) * 0.04; // slightly crooked for comedy
      scene.add(grp);
    });
  }));
}

// ---------- game state ----------
const inv = new Set<string>();
const flags = { power: false, codeKnown: false, safeOpen: false, boilerOpen: false, hasLight: false, flashOn: false, won: false, dead: false };
let battery = 100;

// ---------- interactables ----------
interface Ent { label: () => string | null; use: () => void; obj: THREE.Object3D; }
const ents: Ent[] = [];
const addEnt = (e: Ent) => { e.obj.traverse((o) => (o.userData.ent = e)); ents.push(e); scene.add(e.obj); };
const removeEnt = (e: Ent) => { scene.remove(e.obj); ents.splice(ents.indexOf(e), 1); };

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function placeAt(o: THREE.Object3D, cx: number, cy: number, y = 0) {
  o.position.set(cellToWorld(cx), y, cellToWorld(cy));
  return o;
}
function furniture(cx: number, cy: number, o: THREE.Object3D, e: Omit<Ent, "obj">) {
  solid[cy][cx] = true;
  addEnt({ ...e, obj: placeAt(o, cx, cy) });
}

let msgTimer = 0;
function say(t: string, ms = 4000) {
  $("msg").textContent = t;
  clearTimeout(msgTimer);
  msgTimer = window.setTimeout(() => ($("msg").textContent = ""), ms);
}

const pickupModels: THREE.Object3D[] = [];
function M(color: number, rough: number, metal: number, emissive = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: emissive ? 0.8 : 0 });
}
function cylMesh(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 20) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  c.position.set(x, y, z);
  return c;
}

// Models lie along the X axis (like on a table); y is up.
function buildModel(id: string): THREE.Group {
  const g = new THREE.Group();
  if (id === "flashlight") {
    const body = M(0x1d2a38, 0.35, 0.7), chrome = M(0xc8ccd0, 0.15, 1), rubber = M(0x0e0e0e, 0.9, 0);
    const parts = new THREE.Group();
    parts.add(cylMesh(0.05, 0.05, 0.3, body, -0.05, 0, 0));
    for (let i = 0; i < 7; i++) parts.add(cylMesh(0.054, 0.054, 0.012, rubber, -0.14 + i * 0.03, 0, 0)); // grip rings
    parts.add(cylMesh(0.052, 0.052, 0.03, chrome, -0.21, 0, 0));
    parts.add(cylMesh(0.054, 0.054, 0.04, chrome, -0.225, 0, 0)); // tail cap
    parts.add(cylMesh(0.085, 0.055, 0.1, chrome, 0.14, 0, 0)); // head
    parts.add(cylMesh(0.09, 0.09, 0.015, rubber, 0.195, 0, 0)); // bezel
    const lens = cylMesh(0.075, 0.075, 0.012, new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 0.9, roughness: 0.05 }), 0.2, 0, 0);
    parts.add(lens);
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.015, 0.025), M(0xcc2222, 0.5, 0.2));
    sw.position.set(-0.1, 0.055, 0);
    parts.add(sw);
    parts.rotation.z = 0;
    parts.position.y = 0.09;
    g.add(parts);
  } else if (id === "battery") {
    const parts = new THREE.Group();
    parts.add(cylMesh(0.06, 0.06, 0.26, M(0xc9a227, 0.35, 0.6), 0, 0, 0)); // gold casing
    parts.add(cylMesh(0.0605, 0.0605, 0.15, M(0x111111, 0.6, 0.1), 0, 0, 0)); // black label
    parts.add(cylMesh(0.0608, 0.0608, 0.03, M(0xdd2222, 0.5, 0.1), 0, 0.04, 0)); // red stripe
    parts.add(cylMesh(0.025, 0.025, 0.03, M(0xd0d0d0, 0.2, 1), 0, 0.14, 0)); // + terminal
    parts.rotation.z = Math.PI / 2;
    parts.position.y = 0.065;
    g.add(parts);
  } else if (id === "fuse") {
    const parts = new THREE.Group();
    parts.add(cylMesh(0.05, 0.05, 0.22, M(0xe8e2d2, 0.25, 0.1), 0, 0, 0)); // ceramic
    parts.add(cylMesh(0.056, 0.056, 0.05, M(0xb87333, 0.3, 0.9), 0, 0.115, 0)); // copper caps
    parts.add(cylMesh(0.056, 0.056, 0.05, M(0xb87333, 0.3, 0.9), 0, -0.115, 0));
    parts.add(cylMesh(0.008, 0.008, 0.2, M(0xaaaaaa, 0.2, 1), 0, 0, 0)); // wire
    parts.rotation.z = Math.PI / 2;
    parts.position.y = 0.06;
    g.add(parts);
  } else {
    g.add(box(0.3, 0.1, 0.3, M(0xcccccc, 0.5, 0.2), 0, 0.05, 0));
  }
  return g;
}

function pickup(cx: number, cy: number, id: string, name: string, color: number, text?: string, size = 0.45) {
  const o = new THREE.Group();
  const model = buildModel(id);
  const s = id === "flashlight" ? 2.2 : 2.6;
  model.scale.setScalar(s);
  const holder = new THREE.Group();
  holder.position.y = 0.55;
  holder.add(model);
  o.add(holder);
  pickupModels.push(holder);
  // little dark pedestal so items read as "placed" rather than floating in the void
  o.add(cylMesh(0.32, 0.36, 0.08, M(0x2a1c10, 0.9, 0), 0, 0.04, 0, 16));
  const glow = new THREE.PointLight(color, 1.6, 4, 1.6);
  glow.position.y = 1.0;
  o.add(glow);
  // generous invisible hit area so small items are easy to aim at
  const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(size, 0.5)), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 0.6;
  o.add(hit);
  const e: Ent = {
    obj: placeAt(o, cx, cy), label: () => `[E] Take ${name}`,
    use: () => {
      removeEnt(e); pickupModels.splice(pickupModels.indexOf(holder), 1); sound.pickup();
      if (id === "flashlight") { flags.hasLight = true; flags.flashOn = true; }
      else if (id === "battery") battery = Math.min(100, battery + 50);
      else inv.add(id);
      say(text ?? `Picked up: ${name}`);
    },
  };
  addEnt(e);
}

// light switches on walls: [wall x, wall y, direction toward the room, lamp index]
let sparkyWarned = false;
function addSwitch(wx: number, wy: number, dx: number, dy: number, lamp: number) {
  const g = new THREE.Group();
  const plate = box(0.16, 0.26, 0.03, M(0xe8e0cc, 0.6, 0), 0, 0, 0);
  const lever = box(0.04, 0.1, 0.04, M(0x222222, 0.5, 0.3), 0, 0.04, 0.03);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.018), new THREE.MeshBasicMaterial({ color: 0xff3322 }));
  led.position.set(0, -0.09, 0.02);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.4), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.z = 0.15;
  g.add(plate, lever, led, hit);
  g.position.set(cellToWorld(wx) + dx * (CELL / 2 + 0.03) + Math.abs(dy) * 0.6, 1.3, cellToWorld(wy) + dy * (CELL / 2 + 0.03) + Math.abs(dx) * 0.6);
  g.rotation.y = Math.atan2(dx, dy);
  const e: Ent = {
    obj: g,
    label: () => `[E] Light switch (${lampOn[lamp] ? "ON" : "OFF"})`,
    use: () => {
      lampOn[lamp] = !lampOn[lamp];
      lever.rotation.x = lampOn[lamp] ? -0.5 : 0.5;
      (led.material as THREE.MeshBasicMaterial).color.set(lampOn[lamp] ? 0x33ff66 : 0xff3322);
      sound.click();
      sparky.lure(g.position, true);
      if (!sparkyWarned) {
        sparkyWarned = true;
        eyeSay("Careful! Sparky LOVES electricity - he heard that switch! If he comes close: FREEZE and don't move!", 9000);
      }
    },
  };
  addEnt(e);
}
[[0, 2, 1, 0, 5], [6, 2, 1, 0, 0], [0, 7, 1, 0, 1], [15, 9, 0, -1, 2], [0, 11, 1, 0, 3], [23, 11, -1, 0, 4]]
  .forEach(([x, y, dx, dy, l]) => addSwitch(x, y, dx, dy, l));

// wardrobes (hiding spots)
const wardrobes: { cx: number; cy: number }[] = [];
function wardrobe(cx: number, cy: number) {
  wardrobes.push({ cx, cy });
  const g = new THREE.Group();
  g.add(box(1.6, 2.5, 1.2, woodMat, 0, 1.25, 0), box(0.04, 2.3, 0.05, new THREE.MeshStandardMaterial({ color: 0x111111 }), 0, 1.25, 0.61));
  furniture(cx, cy, g, { label: () => (hidden ? null : "[E] Hide"), use: () => tryHide(cx, cy) });
}
[[14, 1], [7, 5], [22, 7], [9, 12], [13, 10]].forEach(([x, y]) => wardrobe(x, y));

// quest 1: flashlight
pickup(2, 5, "flashlight", "flashlight", 0xddcc66, "A flashlight! Press F to toggle it. The battery won't last forever.");
pickup(3, 8, "battery", "battery", 0x44cc44);
pickup(14, 12, "battery", "battery", 0x44cc44);

// quest 2: the ledger in the library gives the safe code
furniture(2, 11, (() => { const g = new THREE.Group(); g.add(box(1.8, 1, 1.2, woodMat, 0, 0.5, 0), box(0.6, 0.05, 0.45, new THREE.MeshStandardMaterial({ color: 0xcdbd8a, emissive: 0x332a10 }), 0, 1.03, 0)); return g; })(), {
  label: () => "[E] Read ledger",
  use: () => { flags.codeKnown = true; sound.click(); say("\"Guest of room 13 refused to leave. The safe code is 4271. Burn this page.\"", 7000); },
});

// quest 3: lobby safe
furniture(11, 1, (() => { const g = new THREE.Group(); g.add(box(1.2, 1.4, 1, metalMat, 0, 0.7, 0)); return g; })(), {
  label: () => (flags.safeOpen ? null : "[E] Open safe"),
  use: () => {
    if (flags.safeOpen) return;
    openPad("Safe code", "4271", () => { flags.safeOpen = true; inv.add("boilerkey"); sound.pickup(); say("The safe opens. Inside: an old boiler room key."); });
  },
});

// boiler door (D at 15,4)
const boilerDoor = placeAt(box(0.3, 2.8, CELL, new THREE.MeshStandardMaterial({ color: 0x3a1f1f }), 0, 1.4, 0), 15, 4);
addEnt({
  obj: boilerDoor, label: () => (flags.boilerOpen ? null : "[E] Boiler room door"),
  use: () => {
    if (!inv.has("boilerkey")) { sound.error(); say("Locked."); return; }
    flags.boilerOpen = true; solid[4][15] = false; scene.remove(boilerDoor); sound.door(); say("The door groans open.");
  },
});
// quest 4: fuse in the boiler room
pickup(21, 1, "fuse", "fuse", 0xe0a040, "A heavy ceramic fuse. Somewhere there must be a fuse box.");

// quest 5: kitchen fuse box
furniture(22, 11, (() => { const g = new THREE.Group(); g.add(box(0.9, 1.2, 0.4, metalMat, 0, 1.3, 0)); return g; })(), {
  label: () => (flags.power ? null : "[E] Fuse box"),
  use: () => {
    if (flags.power) return;
    if (!inv.has("fuse")) { sound.error(); say("The fuse box is missing a fuse."); return; }
    inv.delete("fuse"); flags.power = true; sound.power();
    lampOn.fill(true); ambient.intensity = 2.2;
    say("Power surges through the hotel. Something upstairs screams.", 5000);
    monster.alertTo(player.pos);
    sparky.lure(new THREE.Vector3(cellToWorld(22), 1.3, cellToWorld(11)), true);
    setTimeout(() => eyeSay("Uh-oh! SPARKY heard the power surge! If he floats toward you: FREEZE! Stand still and he won't notice you.", 9000), 2500);
  },
});

// quest 6: freezer with the brass key (needs power)
furniture(14, 12, (() => { const g = new THREE.Group(); g.add(box(1.6, 1.4, 1.2, new THREE.MeshStandardMaterial({ color: 0xaab4bb, roughness: 0.4 }), 0, 0.7, 0)); return g; })(), {
  label: () => (inv.has("brasskey") ? null : "[E] Freezer"),
  use: () => {
    if (!flags.power) { sound.error(); say("Dead silent. It has no power."); return; }
    if (inv.has("brasskey")) return;
    inv.add("brasskey"); sound.pickup(); say("Frozen to a hook: a brass key engraved 'FRONT DOOR'.");
  },
});

// quest 7: front door
const exitDoor = placeAt(box(CELL, 2.8, 0.3, new THREE.MeshStandardMaterial({ color: 0x5a3a1a }), 0, 1.4, 0), 5, 13);
addEnt({
  obj: exitDoor, label: () => "[E] Front door",
  use: () => {
    if (!inv.has("brasskey")) { sound.error(); say("Bolted shut. It needs a key."); return; }
    sound.door(); win();
  },
});

// ---------- player ----------
const player = { pos: new THREE.Vector3(cellToWorld(START.x), 1.6, cellToWorld(START.y)), yaw: Math.PI, pitch: 0, stepDist: 0, noise: 0 };
let hidden = false;
let grace = 0;
let hideReturn = new THREE.Vector3();
const keys: Record<string, boolean> = {};

function collide(x: number, z: number, r = 0.4) {
  const minX = Math.floor((x - r) / CELL), maxX = Math.floor((x + r) / CELL);
  const minY = Math.floor((z - r) / CELL), maxY = Math.floor((z + r) / CELL);
  for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) if (isSolid(cx, cy)) return true;
  return false;
}

function lineOfSight(ax: number, az: number, bx: number, bz: number, skipEnd = false) {
  const ex = Math.floor(bx / CELL), ey = Math.floor(bz / CELL);
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const cx = Math.floor((ax + (bx - ax) * t) / CELL), cy = Math.floor((az + (bz - az) * t) / CELL);
    if (skipEnd && cx === ex && cy === ey) continue;
    if (isSolid(cx, cy)) return false;
  }
  return true;
}

function tryHide(cx: number, cy: number) {
  if (monster.state === "chase" && monster.dist() < 6 && monster.canSee()) {
    sound.error(); say("It's watching you - too late to hide!"); return;
  }
  hidden = true;
  hideReturn.copy(player.pos);
  player.pos.set(cellToWorld(cx), 1.6, cellToWorld(cy));
  flashlight.visible = false;
  sound.door();
  say("You hold your breath. Press E to leave.", 3000);
}
function leaveHide() {
  hidden = false;
  player.pos.copy(hideReturn);
  flashlight.visible = true;
  sound.door();
}

// ---------- monster ----------
type MState = "patrol" | "investigate" | "chase";
class Monster {
  mesh = new THREE.Group();
  pos = new THREE.Vector3(cellToWorld(MONSTER_START.x), 0, cellToWorld(MONSTER_START.y));
  state: MState = "patrol";
  path: { x: number; y: number }[] = [];
  target = new THREE.Vector3();
  patrolIdx = 0;
  repath = 0;
  lostT = 0;
  growlT = 0;
  phase = 0;
  bellT = 0;
  body = new THREE.Group();
  head = new THREE.Group();
  armL = new THREE.Group();
  armR = new THREE.Group();
  legL = new THREE.Group();
  legR = new THREE.Group();
  bell = new THREE.Group();
  mouth!: THREE.Mesh;
  eyeMat = new THREE.MeshBasicMaterial({ color: 0xc6ff3a });
  eyeLight = new THREE.PointLight(0xc6ff3a, 0.8, 5);

  // A tall, gaunt ghost bellhop built from smooth primitives, carrying a ringing bell.
  constructor() {
    const mat = (color: number, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    const coat = mat(0x3a0d16, 0.9), coatDark = mat(0x1a0a0e, 0.9), shirt = mat(0xd9d4c4), skin = mat(0x9fb09c, 0.7);
    const gold = mat(0xd4a62a, 0.3, 0.8), teethMat = mat(0xf2ecd0, 0.4);
    const part = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      return mesh;
    };
    const cyl = (rt: number, rb: number, h: number) => new THREE.CylinderGeometry(rt, rb, h, 14);
    const sph = (r: number) => new THREE.SphereGeometry(r, 16, 12);

    // torso: tapered jacket, tailcoat skirt, shirt front, bow tie, gold buttons
    this.body.position.y = 0;
    this.body.add(part(cyl(0.3, 0.2, 0.95), coat, 0, 1.55, 0));
    const skirt = part(cyl(0.2, 0.36, 0.7), coat, 0, 0.95, -0.02);
    this.body.add(skirt);
    this.body.add(part(new THREE.BoxGeometry(0.2, 0.7, 0.04), shirt, 0, 1.55, 0.2));
    const bow = new THREE.Group();
    bow.add(part(new THREE.ConeGeometry(0.1, 0.18, 8), mat(0xaa1111), -0.1, 0, 0), part(new THREE.ConeGeometry(0.1, 0.18, 8), mat(0xaa1111), 0.1, 0, 0));
    bow.children[0].rotation.z = Math.PI / 2; bow.children[1].rotation.z = -Math.PI / 2;
    bow.position.set(0, 1.98, 0.2);
    this.body.add(bow);
    for (const y of [1.7, 1.5, 1.3]) this.body.add(part(sph(0.03), gold, 0.12, y, 0.22), part(sph(0.03), gold, -0.12, y, 0.22));
    this.body.add(part(cyl(0.12, 0.14, 0.15), skin, 0, 2.08, 0));

    // head: long skull-like face, sunken eyes, wide grin, bellhop cap
    this.head.position.set(0, 2.32, 0);
    const skull = part(sph(0.22), skin);
    skull.scale.set(0.95, 1.25, 1);
    this.head.add(skull);
    this.head.add(part(new THREE.ConeGeometry(0.04, 0.14, 8), skin, 0, -0.03, 0.24).rotateX(Math.PI / 2) as THREE.Object3D);
    for (const sx of [-1, 1]) {
      this.head.add(part(sph(0.07), mat(0x0a0a0a), sx * 0.09, 0.05, 0.17));
      this.head.add(part(sph(0.035), this.eyeMat, sx * 0.09, 0.05, 0.22));
    }
    this.mouth = part(new THREE.BoxGeometry(0.22, 0.05, 0.05), mat(0x120000), 0, -0.13, 0.2);
    this.head.add(this.mouth);
    for (let i = -4; i <= 4; i++) this.head.add(part(new THREE.BoxGeometry(0.022, 0.045, 0.03), teethMat, i * 0.024, -0.12, 0.225));
    const cap = part(cyl(0.17, 0.21, 0.2), mat(0xaa1111, 0.6), 0, 0.3, 0);
    cap.rotation.z = 0.08;
    this.head.add(cap, part(new THREE.TorusGeometry(0.19, 0.012, 6, 20), gold, 0, 0.22, 0).rotateX(Math.PI / 2) as THREE.Object3D);
    this.eyeLight.position.set(0, 0.05, 0.4);
    this.head.add(this.eyeLight);
    this.body.add(this.head);

    // very long arms ending in spidery fingers; right hand holds a brass bell
    const makeArm = (g: THREE.Group, side: number) => {
      g.position.set(side * 0.4, 1.95, 0);
      g.add(part(cyl(0.07, 0.05, 1.0), coat, 0, -0.5, 0));
      g.add(part(cyl(0.052, 0.045, 0.5), skin, 0, -1.2, 0));
      for (let f = -1; f <= 1; f++) g.add(part(cyl(0.012, 0.008, 0.28), skin, f * 0.035, -1.55, 0.02));
      this.body.add(g);
    };
    makeArm(this.armL, -1);
    makeArm(this.armR, 1);
    this.bell.position.set(0, -1.5, 0.12);
    this.bell.add(part(new THREE.CylinderGeometry(0.05, 0.14, 0.2, 14), gold, 0, -0.1, 0), part(sph(0.025), gold, 0, -0.22, 0));
    this.armR.add(this.bell);

    // legs
    for (const [g, side] of [[this.legL, -1], [this.legR, 1]] as [THREE.Group, number][]) {
      g.position.set(side * 0.14, 0.95, 0);
      g.add(part(cyl(0.09, 0.06, 0.95), coatDark, 0, -0.47, 0), part(new THREE.BoxGeometry(0.13, 0.08, 0.28), mat(0x050505, 0.3), 0, -0.93, 0.07));
      this.mesh.add(g);
    }
    this.mesh.add(this.body);
    scene.add(this.mesh);
  }
  dist() { return Math.hypot(this.pos.x - player.pos.x, this.pos.z - player.pos.z); }
  canSee() {
    if (hidden) return false;
    return this.dist() < 11 && lineOfSight(this.pos.x, this.pos.z, player.pos.x, player.pos.z);
  }
  alertTo(p: THREE.Vector3) { this.state = "investigate"; this.target.copy(p); this.repath = 0; }

  bfs(sx: number, sy: number, tx: number, ty: number) {
    const prev = new Map<number, number>();
    const q = [sy * W + sx];
    prev.set(q[0], -1);
    while (q.length) {
      const cur = q.shift()!;
      const cx = cur % W, cy = (cur / W) | 0;
      if (cx === tx && cy === ty) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, k = ny * W + nx;
        if (isSolid(nx, ny) || prev.has(k)) continue;
        prev.set(k, cur);
        q.push(k);
      }
    }
    const goal = ty * W + tx;
    if (!prev.has(goal)) return [];
    const out: { x: number; y: number }[] = [];
    for (let k = goal; k !== -1; k = prev.get(k)!) out.unshift({ x: k % W, y: (k / W) | 0 });
    return out;
  }

  stunT = 0;
  stun(sec: number) {
    this.stunT = sec; this.body.rotation.z = 0;
    this.state = "patrol"; this.path = [];
    this.patrolIdx = (this.patrolIdx + 3) % PATROL.length;
    sound.growl();
  }

  update(dt: number) {
    if (this.stunT > 0) {
      this.stunT -= dt;
      // dizzy spin: whole body twirls while arms flail
      const t = performance.now() / 1000;
      this.mesh.rotation.y += dt * 9;
      this.armL.rotation.set(-2.6 + Math.sin(t * 14) * 0.4, 0, 0.5);
      this.armR.rotation.set(-2.6 - Math.sin(t * 14) * 0.4, 0, -0.5);
      this.head.rotation.set(0.5, Math.sin(t * 25) * 0.5, Math.sin(t * 18) * 0.3);
      this.body.rotation.x = 0.1;
      this.body.rotation.z = Math.sin(t * 10) * 0.2;
      this.legL.rotation.x = Math.sin(t * 16) * 0.8; this.legR.rotation.x = -Math.sin(t * 16) * 0.8;
      this.mouth.scale.y = 2;
      this.bell.rotation.z = Math.sin(t * 30) * 0.8;
      if (Math.random() < dt * 6) sound.bell(Math.max(0, 1 - this.dist() / 16));
      if (this.stunT <= 0) { this.body.rotation.z = 0; this.head.rotation.set(0, 0, 0); }
      return;
    }
    const sees = this.canSee();
    const heard = !hidden && this.dist() < player.noise;
    if (sees) {
      if (this.state !== "chase") { sound.growl(); sound.sting(); }
      this.state = "chase"; this.lostT = 0; this.target.copy(player.pos);
    } else if (heard && this.state === "patrol") {
      this.state = "investigate"; this.target.copy(player.pos); this.repath = 0; sound.growl();
    } else if (this.state === "chase") {
      this.lostT += dt;
      if (this.lostT > 5) { this.state = "investigate"; this.repath = 0; }
    }

    if (this.state === "investigate" && Math.hypot(this.pos.x - this.target.x, this.pos.z - this.target.z) < 1.2) {
      this.state = "patrol";
      this.patrolIdx = (this.patrolIdx + 1) % PATROL.length;
    }
    if (this.state === "patrol") {
      const p = PATROL[this.patrolIdx];
      this.target.set(cellToWorld(p.x), 0, cellToWorld(p.y));
      if (Math.hypot(this.pos.x - this.target.x, this.pos.z - this.target.z) < 1.2) this.patrolIdx = (this.patrolIdx + 1) % PATROL.length;
    }

    this.repath -= dt;
    if (this.repath <= 0) {
      this.repath = 0.35;
      this.path = this.bfs(Math.floor(this.pos.x / CELL), Math.floor(this.pos.z / CELL), Math.floor(this.target.x / CELL), Math.floor(this.target.z / CELL));
    }
    const speed = this.state === "chase" ? 3.6 : this.state === "investigate" ? 2.3 : 1.5;
    const next = this.path.length > 1 ? this.path[1] : null;
    let tx = this.target.x, tz = this.target.z;
    if (next && !(this.state === "chase" && sees && lineOfSight(this.pos.x, this.pos.z, this.target.x, this.target.z))) {
      tx = cellToWorld(next.x); tz = cellToWorld(next.y);
    }
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.05) {
      this.pos.x += (dx / d) * Math.min(speed * dt, d);
      this.pos.z += (dz / d) * Math.min(speed * dt, d);
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }
    this.mesh.position.set(this.pos.x, Math.sin(performance.now() / 400) * 0.08, this.pos.z);

    this.growlT -= dt;
    if (this.state !== "patrol" && this.growlT <= 0 && this.dist() < 10) { sound.growl(); this.growlT = 6; }

    this.animate(dt, d > 0.05 ? speed : 0);
    if (!hidden && grace <= 0 && this.dist() < 1.1) caught();
  }

  animate(dt: number, speed: number) {
    const chase = this.state === "chase";
    this.phase += speed * dt * 2.6;
    const t = performance.now() / 1000;
    const swing = Math.min(1, speed / 2) * (chase ? 0.9 : 0.6);
    this.legL.rotation.x = Math.sin(this.phase) * swing;
    this.legR.rotation.x = -Math.sin(this.phase) * swing;
    const armRaise = chase ? -1.3 : 0;
    this.armL.rotation.x = armRaise - Math.sin(this.phase) * swing * 0.5 + Math.sin(t * 1.3) * 0.05;
    this.armR.rotation.x = armRaise + Math.sin(this.phase) * swing * 0.5 + Math.sin(t * 1.1) * 0.05;
    this.armL.rotation.z = 0.08 + Math.sin(t * 2) * 0.03;
    this.armR.rotation.z = -0.08 - Math.sin(t * 2) * 0.03;
    this.body.rotation.x = chase ? 0.3 : 0.08;
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.06;
    this.head.rotation.z = Math.sin(t * 0.9) * 0.18;
    this.head.rotation.y = Math.sin(t * 0.6) * 0.3;
    this.mouth.scale.y = chase ? 1.6 + Math.sin(t * 20) * 0.3 : 1;
    this.eyeLight.intensity = chase ? 2 : 0.8;
    (this.eyeMat as THREE.MeshBasicMaterial).color.set(chase ? 0xff3b1a : 0xc6ff3a);
    // bell rings as he moves; the faster he goes the more often
    if (speed > 0) {
      this.bellT -= dt;
      if (this.bellT <= 0) {
        this.bellT = chase ? 0.45 : 1.1;
        sound.bell(Math.max(0, 1 - this.dist() / 16));
      }
    }
    this.bell.rotation.z = Math.sin(this.phase * 2) * 0.5 * (speed > 0 ? 1 : 0.1);
  }
}
const monster = new Monster();

// ---------- the Rolling Eye: a flying helper that guides the player ----------
const eyeRoot = new THREE.Group();
const eyeBall = new THREE.Group();
const eyeBlink = new THREE.Group();
{
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffeedd, emissiveIntensity: 0.5, roughness: 0.3 });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), white);
  const iris = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), new THREE.MeshStandardMaterial({ color: 0x22cc66, emissive: 0x22cc66, emissiveIntensity: 0.6 }));
  iris.position.z = 0.1; iris.scale.z = 0.5;
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  pupil.position.z = 0.14; pupil.scale.z = 0.5;
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  shine.position.set(0.025, 0.03, 0.16);
  eyeBall.add(globe, iris, pupil, shine);
  // little red veins for style
  const vein = new THREE.MeshBasicMaterial({ color: 0xcc3333 });
  for (let i = 0; i < 4; i++) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.1, 0.004), vein);
    const a = i * 1.6 + 0.4;
    v.position.set(Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.07);
    v.rotation.z = a + Math.PI / 2;
    eyeBall.add(v);
  }
  eyeBlink.add(eyeBall);
  eyeRoot.add(eyeBlink);
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xe8e8ff, emissive: 0x8888cc, emissiveIntensity: 0.6, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const w = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), wingMat);
    m.scale.set(1.3, 0.7, 1); m.position.x = side * 0.17;
    w.add(m); w.position.x = side * 0.14;
    w.userData.side = side;
    eyeRoot.add(w);
  }
  const glow = new THREE.PointLight(0x88ffaa, 2.2, 6, 1.5);
  eyeRoot.add(glow);
  scene.add(eyeRoot);
}
const eyeState = { pos: new THREE.Vector3(), hintT: 0, pathT: 0, wp: new THREE.Vector3(), wpLook: new THREE.Vector3(), blinkT: 3, chatT: 20, warnT: 0, line: 0, lineT: 0 };
const eyeLines = [
  "Psst! I'm the Rolling Eye! Press H if you get lost!",
  "Eyes on the prize! Mine are literally on everything.",
  "I'd help more, but I have no hands. Or a body. Or a plan.",
  "Fun fact: the Concierge is scared of his own bell. Probably.",
  "Hold your breath in a wardrobe. I won't peek. (I will.)",
  "Click or press Q to flash him! Zap!",
];
function eyeSay(t: string, ms = 4500) {
  const el = $("eyeSay");
  el.textContent = "👁 " + t;
  el.style.opacity = "1";
  clearTimeout((eyeSay as any).t);
  (eyeSay as any).t = window.setTimeout(() => (el.style.opacity = "0"), ms);
  sound.squeak();
}
function pathToObjective() {
  const g = objectiveSpot();
  const pcx = Math.floor(player.pos.x / CELL), pcy = Math.floor(player.pos.z / CELL);
  let best: { x: number; y: number }[] = [];
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const p = monster.bfs(pcx, pcy, g.x + dx, g.y + dy);
    if (p.length && (!best.length || p.length < best.length)) best = p;
  }
  return best;
}
function askEye() {
  if (hidden) return;
  eyeState.hintT = 8;
  eyeSay(["Follow me! I know a shortcut!", "This way! Try to keep up, slowpoke!", "Roll roll roll! Follow the eyeball!"][eyeState.line++ % 3]
    + " Goal: " + objective(), 7000);
}
function eyeUpdate(dt: number) {
  const e = eyeState, t = performance.now() / 1000;
  eyeRoot.visible = !hidden;
  e.pathT -= dt;
  if (e.pathT <= 0) {
    e.pathT = 0.5;
    const path = pathToObjective();
    const a = path[Math.min(3, path.length - 1)], b = path[Math.min(1, path.length - 1)];
    if (a) {
      e.wp.set(cellToWorld(a.x), 1.5, cellToWorld(a.y));
      e.wpLook.set(cellToWorld(b.x), 1.5, cellToWorld(b.y));
    } else { e.wp.copy(player.pos); e.wpLook.copy(player.pos); }
  }
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  const goal = new THREE.Vector3();
  if (e.hintT > 0) { e.hintT -= dt; goal.copy(e.wp); }
  else goal.set(player.pos.x + rx * 0.75 + fx * 0.9, player.pos.y + 0.35, player.pos.z + rz * 0.75 + fz * 0.9);
  goal.y += Math.sin(t * 2.2) * 0.07;
  eyeRoot.position.lerp(goal, 1 - Math.exp(-(e.hintT > 0 ? 3 : 7) * dt));
  e.pos.copy(eyeRoot.position);

  // pupil looks at the Concierge when he is close, otherwise where you should go
  const look = new THREE.Vector3();
  if (monster.dist() < 8 && !hidden) look.set(monster.pos.x, 1.8, monster.pos.z);
  else look.copy(e.hintT > 0 ? e.wpLook : e.wp);
  eyeBall.lookAt(look);
  // rolling wobble and blinking
  eyeBlink.rotation.z = Math.sin(t * 3) * 0.2;
  e.blinkT -= dt;
  const blink = e.blinkT < 0.12 ? Math.max(0.1, Math.abs(e.blinkT - 0.06) / 0.06) : 1;
  if (e.blinkT < 0) e.blinkT = 2 + Math.random() * 3;
  eyeBlink.scale.y = blink;
  eyeRoot.children.forEach((c) => { if (c.userData.side) c.rotation.z = c.userData.side * Math.sin(t * 22) * 0.6; });
  eyeRoot.rotation.y = Math.atan2(player.pos.x - eyeRoot.position.x, player.pos.z - eyeRoot.position.z);

  // chatter and warnings
  e.warnT -= dt;
  if (e.warnT <= 0 && !hidden && (monster.state === "chase" || (monster.dist() < 6 && monster.stunT <= 0)) && monster.stunT <= 0) {
    e.warnT = 12;
    eyeSay(["EEK! He's coming! Hide in a wardrobe!", "Yikes, bell guy at 12 o'clock! Flash him!", "I didn't see anything! RUN!"][Math.floor(Math.random() * 3)], 4000);
  }
  e.chatT -= dt;
  if (e.chatT <= 0) { e.chatT = 30 + Math.random() * 20; eyeSay(eyeLines[e.lineT++ % eyeLines.length], 5000); }
}



// ---------- Sparky: an electric ghost drawn to powered things (flashlight, flashes, power surges) ----------
const WANDER = [{ x: 9, y: 3 }, { x: 3, y: 3 }, { x: 20, y: 8 }, { x: 12, y: 7 }, { x: 4, y: 8 }, { x: 6, y: 11 }, { x: 18, y: 11 }, { x: 9, y: 3 }, { x: 20, y: 3 }];
class Sparky {
  mesh = new THREE.Group();
  state: "wander" | "investigate" | "sniff" | "hunt" | "flee" = "wander";
  stillT = 0;
  pos = new THREE.Vector3(cellToWorld(9), 1.3, cellToWorld(4));
  target = new THREE.Vector3();
  path: { x: number; y: number }[] = [];
  repath = 0; wanderIdx = 0; stateT = 0; loseT = 0; zapCd = 0; buzzT = 0;
  bolts: THREE.Mesh[] = [];
  cable: THREE.Mesh[] = [];
  pupils: THREE.Mesh[] = [];
  light = new THREE.PointLight(0x66ccff, 3, 9, 1.4);
  coreMat = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x39b8ff, emissiveIntensity: 1.2, roughness: 0.3 });

  constructor() {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), this.coreMat);
    this.mesh.add(core, this.light);
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), white);
      eye.position.set(sx * 0.12, 0.08, 0.26);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), black);
      pupil.position.set(sx * 0.12, 0.08, 0.34);
      this.pupils.push(pupil);
      this.mesh.add(eye, pupil);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 14, Math.PI), new THREE.MeshBasicMaterial({ color: 0x063a5a }));
    smile.position.set(0, -0.08, 0.3);
    smile.rotation.z = Math.PI;
    this.mesh.add(smile);
    const boltMat = new THREE.MeshBasicMaterial({ color: 0xeaffff });
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.03), boltMat);
      this.mesh.add(b);
      this.bolts.push(b);
    }
    // wiggly power cable tail with a plug at the end
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), cableMat);
      this.mesh.add(c);
      this.cable.push(c);
    }
    const plug = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.12), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.5 }));
    plug.name = "plug";
    this.mesh.add(plug);
    this.light.intensity = 3;
    scene.add(this.mesh);
  }

  awake() { return true; }
  dist() { return Math.hypot(this.pos.x - player.pos.x, this.pos.z - player.pos.z); }
  // an electrical event (switch, flash, surge) at p: Sparky floats over to investigate
  lure(p: THREE.Vector3, loud = false) {
    if (this.state === "flee" || this.state === "hunt") return;
    this.state = "investigate"; this.stateT = 0; this.path = []; this.repath = 0;
    this.target.set(p.x, 1.3, p.z);
    if (loud) sound.zap();
  }

  zap() {
    sound.zap();
    battery = Math.max(0, battery - 30);
    flags.flashOn = false; zapT = 4; this.zapCd = 4;
    const z = $("zap");
    z.style.transition = "none"; z.style.opacity = "0.85";
    requestAnimationFrame(() => { z.style.transition = "opacity 0.9s"; z.style.opacity = "0"; });
    say("ZZZAP! Sparky munched your battery and shorted your flashlight!", 4500);
    this.state = "flee"; this.stateT = 7; this.path = [];
    let best = WANDER[0], bd = -1;
    for (const w of WANDER) { const d = Math.hypot(cellToWorld(w.x) - player.pos.x, cellToWorld(w.y) - player.pos.z); if (d > bd) { bd = d; best = w; } }
    this.target.set(cellToWorld(best.x), 1.3, cellToWorld(best.y));
  }

  update(dt: number) {
    this.zapCd = Math.max(0, this.zapCd - dt);
    const flashOn = flags.hasLight && flags.flashOn && battery > 0 && !hidden;
    const d0 = this.dist();
    const moving = player.noise > 0;
    const sensed = !hidden && d0 < 10 && (d0 < 4 || lineOfSight(this.pos.x, this.pos.z, player.pos.x, player.pos.z));

    if (this.state === "flee") {
      this.stateT -= dt;
      if (this.stateT <= 0) { this.state = "wander"; this.path = []; }
    } else {
      // a lit flashlight is an electrical beacon: he comes to look, and attacks if close
      if (flashOn && d0 < 18 && this.state !== "hunt") this.lure(player.pos);
      if (this.state === "investigate" || this.state === "sniff") {
        if (flashOn && sensed && d0 < 7) { this.state = "hunt"; this.stillT = 0; sound.zap(); }
        else if (moving && sensed && d0 < 7) { this.state = "hunt"; this.stillT = 0; sound.zap(); }
      }
      if (this.state === "investigate" && Math.hypot(this.pos.x - this.target.x, this.pos.z - this.target.z) < 1.2) {
        this.state = "sniff"; this.stateT = 5;
      }
      if (this.state === "sniff") {
        this.stateT -= dt;
        if (this.stateT <= 0) { this.state = "wander"; this.path = []; }
      }
      if (this.state === "hunt") {
        // standing perfectly still with the light off makes you invisible to him
        this.stillT = !moving && !flashOn ? this.stillT + dt : 0;
        if (this.stillT > 1.5 || hidden) { this.state = "sniff"; this.stateT = 4; this.target.set(player.pos.x, 1.3, player.pos.z); say("Sparky lost you. Stay still...", 2500); }
      }
    }

    if (this.state === "hunt") this.target.set(player.pos.x, 1.3, player.pos.z);
    else if (this.state === "wander") {
      const w = WANDER[this.wanderIdx];
      this.target.set(cellToWorld(w.x), 1.3, cellToWorld(w.y));
      if (Math.hypot(this.pos.x - this.target.x, this.pos.z - this.target.z) < 1.2 || (this.path.length === 0 && this.repath <= 0 && Math.random() < 0.02)) this.wanderIdx = (this.wanderIdx + 1 + Math.floor(Math.random() * 3)) % WANDER.length;
    }
    freezeHint = !hidden && (this.state === "investigate" || this.state === "sniff") && d0 < 10;

    this.repath -= dt;
    if (this.repath <= 0) {
      this.repath = 0.4;
      this.path = monster.bfs(Math.floor(this.pos.x / CELL), Math.floor(this.pos.z / CELL), Math.floor(this.target.x / CELL), Math.floor(this.target.z / CELL));
      if (!this.path.length && this.state === "wander") this.wanderIdx = (this.wanderIdx + 1) % WANDER.length;
    }
    const speed = this.state === "sniff" ? 0 : this.state === "hunt" ? 2.7 : this.state === "flee" ? 3.2 : this.state === "investigate" ? 2 : 1.3;
    const next = this.path.length > 1 ? this.path[1] : null;
    let tx = this.target.x, tz = this.target.z;
    if (next && !(lineOfSight(this.pos.x, this.pos.z, tx, tz) && Math.hypot(tx - this.pos.x, tz - this.pos.z) < CELL * 1.5)) { tx = cellToWorld(next.x); tz = cellToWorld(next.y); }
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.05) { this.pos.x += (dx / d) * Math.min(speed * dt, d); this.pos.z += (dz / d) * Math.min(speed * dt, d); }
    const t = performance.now() / 1000;
    this.mesh.position.set(this.pos.x, 1.3 + Math.sin(t * 3) * 0.12, this.pos.z);
    const face = this.state === "hunt" || this.state === "sniff" ? Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z) : Math.atan2(dx, dz);
    this.mesh.rotation.y = face;
    const pulse = 1 + Math.sin(t * 12) * 0.08;
    this.mesh.scale.setScalar(pulse);
    this.coreMat.emissiveIntensity = this.state === "hunt" ? 2 + Math.sin(t * 30) * 0.8 : this.state === "sniff" ? 1.8 : 1.2;
    this.light.intensity = (this.state === "hunt" ? 5 : 3) * (0.7 + Math.random() * 0.5);
    this.bolts.forEach((b, i) => {
      const a = (i / this.bolts.length) * Math.PI * 2 + t * 2;
      const r = 0.45 + Math.random() * 0.2;
      b.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      b.rotation.z = a + (Math.random() - 0.5) * 1.2;
      b.scale.y = 0.4 + Math.random() * 1.2;
      b.visible = this.state === "hunt" || Math.random() < 0.6;
    });
    this.cable.forEach((c, i) => c.position.set(Math.sin(t * 5 + i) * 0.1, -0.1 - i * 0.04 + Math.sin(t * 3 + i * 0.7) * 0.03, -0.35 - i * 0.14));
    const plug = this.mesh.getObjectByName("plug")!;
    plug.position.set(Math.sin(t * 5 + 7) * 0.1, -0.4, -0.35 - 7 * 0.14);
    this.pupils.forEach((p, i) => { p.position.x = (i === 0 ? -0.12 : 0.12) + Math.sin(t * 2) * 0.015; });

    this.buzzT -= dt;
    if (this.buzzT <= 0 && d0 < 12) { this.buzzT = this.state === "hunt" ? 0.5 : 1.4; sound.crackle(Math.max(0, 1 - d0 / 12)); }

    if (!hidden && this.zapCd <= 0 && this.state === "hunt" && d0 < 1.1) this.zap();
  }
}
const sparky = new Sparky();
let zapT = 0;
let freezeHint = false;

// ---------- UI helpers ----------
let padOpen = false;
let padCb: (() => void) | null = null;
let padCode = "";
function openPad(title: string, code: string, ok: () => void) {
  padOpen = true; padCb = ok; padCode = code;
  $("padTitle").textContent = title;
  ($("padIn") as HTMLInputElement).value = "";
  $("pad").style.display = "block";
  document.exitPointerLock();
  setTimeout(() => $("padIn").focus(), 50);
}
function closePad() {
  padOpen = false;
  $("pad").style.display = "none";
  renderer.domElement.requestPointerLock();
}
$("padOk").onclick = () => {
  if (($("padIn") as HTMLInputElement).value === padCode) { const cb = padCb; closePad(); cb?.(); }
  else { sound.error(); say("Wrong code."); closePad(); }
};
$("padCancel").onclick = closePad;
$("padIn").addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") $("padOk").click(); });


const QUESTS = 7;
function questsDone() {
  return [flags.hasLight, flags.codeKnown, flags.safeOpen, flags.boilerOpen, inv.has("fuse") || flags.power, flags.power, inv.has("brasskey")].filter(Boolean).length;
}
let lastQuests = 0;
function checkQuests() {
  const n = questsDone();
  if (n > lastQuests) {
    lastQuests = n;
    sound.questDone();
    if (n < QUESTS) eyeSay(`Quest done! ${n}/${QUESTS}. Next: ${objective()}`, 5500);
  }
}

function objective() {
  if (!flags.hasLight) return "Find the glowing flashlight straight ahead, get close and press E.";
  if (!flags.codeKnown) return "Search the hotel for a clue to the lobby safe (try the library, south-west).";
  if (!inv.has("boilerkey") && !flags.boilerOpen) return "Open the safe in the lobby.";
  if (!inv.has("fuse") && !flags.power) return "Open the boiler room (east of the lobby) and find a fuse.";
  if (!flags.power) return "Install the fuse in the kitchen fuse box (south-east).";
  if (!inv.has("brasskey")) return "Search the kitchen freezer for the front-door key.";
  return "Escape through the front door (south-west).";
}

let started = false, running = false;
function win() {
  flags.won = true; running = false; document.exitPointerLock();
  const m = Math.floor(playT / 60), sec = Math.floor(playT % 60);
  $("ovTitle").textContent = "LEVEL COMPLETE!";
  $("ovTitle").style.color = "#5f5";
  $("ovText").innerHTML = `<span style="font-size:80px">🎃🚪🎉</span><br><br>You unlocked the front door and ran out into the night. You escaped Hotel Hollowmere!<br><br><b>Quests solved: ${QUESTS}/${QUESTS}</b><br><b>Time: ${m}:${String(sec).padStart(2, "0")}</b><br><br><i>Level 2 (the upper floors) is coming soon.</i><br><br><b>Click to play again</b>`;
  $("overlay").style.display = "flex";
  $("overlay").onclick = () => location.reload();
  sound.questDone(); setTimeout(() => sound.questDone(), 350);
}
// Kid-friendly: being caught drags you back to the cell instead of ending the game.
function caught() {
  sound.sting();
  grace = 6;
  $("blood").style.opacity = "0.7";
  setTimeout(() => ($("blood").style.opacity = "0"), 600);
  player.pos.set(cellToWorld(START.x), 1.6, cellToWorld(START.y));
  monster.pos.set(cellToWorld(MONSTER_START.x), 0, cellToWorld(MONSTER_START.y));
  monster.state = "patrol";
  monster.path = [];
  say("The Concierge dragged you back to your cell! Listen for his bell and hide in a wardrobe.", 5000);
}

// ---------- self defense: light flash ----------
let flashCd = 0;
let playT = 0;
function lightFlash() {
  if (!running || padOpen || hidden || !flags.hasLight) return;
  if (flashCd > 0) { sound.error(); return; }
  if (battery < 15) { say("Not enough battery for a flash!"); sound.error(); return; }
  battery -= 15; flashCd = 8; sound.flash();
  sparky.lure(player.pos, true);
  const fl = $("flash");
  fl.style.transition = "none"; fl.style.opacity = "0.9";
  requestAnimationFrame(() => { fl.style.transition = "opacity 0.8s"; fl.style.opacity = "0"; });
  const dx = monster.pos.x - player.pos.x, dz = monster.pos.z - player.pos.z;
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const d = Math.hypot(dx, dz);
  if (d < 8 && (dx * dir.x + dz * dir.z) / d > 0.6 && lineOfSight(player.pos.x, player.pos.z, monster.pos.x, monster.pos.z)) {
    monster.stun(5); grace = Math.max(grace, 2);
    say("ZAP! The Concierge is blinded! Run!", 3000);
  }
}
addEventListener("mousedown", () => lightFlash());

// ---------- input ----------
$("overlay").onclick = () => {
  if (!started) { started = true; sound.start(); }
  renderer.domElement.requestPointerLock();
};
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (flags.won || flags.dead) return;
  if (locked) { running = true; $("overlay").style.display = "none"; }
  else if (!padOpen) { running = false; $("ovText").innerHTML = "Paused. <i>Click to continue</i>"; $("overlay").style.display = "flex"; }
});
addEventListener("mousemove", (e) => {
  if (!running || padOpen) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch - e.movementY * 0.0022));
});
addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "KeyM" && running) bigMap = !bigMap;
  if (!running || padOpen) return;
  if (e.code === "KeyF" && flags.hasLight && !hidden) {
    if (zapT > 0) { sound.error(); say("Flashlight is short-circuited for a moment!", 1500); }
    else { flags.flashOn = !flags.flashOn; sound.click(); if (flags.flashOn && sparky.dist() < 16) sparky.lure(player.pos); }
  }
  if (e.code === "KeyQ") lightFlash();
  if (e.code === "KeyH") askEye();
  if (e.code === "KeyE") {
    if (hidden) { leaveHide(); return; }
    if (target) target.use();
  }
});
addEventListener("keyup", (e) => (keys[e.code] = false));

// ---------- minimap ----------
const mini = $("mini") as HTMLCanvasElement;
let bigMap = false;
function objectiveSpot(): { x: number; y: number } {
  if (!flags.hasLight) return { x: 2, y: 5 };
  if (!flags.codeKnown) return { x: 2, y: 11 };
  if (!inv.has("boilerkey") && !flags.boilerOpen) return { x: 11, y: 1 };
  if (!inv.has("fuse") && !flags.power) return flags.boilerOpen ? { x: 21, y: 1 } : { x: 15, y: 4 };
  if (!flags.power) return { x: 22, y: 11 };
  if (!inv.has("brasskey")) return { x: 14, y: 12 };
  return { x: 5, y: 13 };
}
const seen: boolean[][] = MAP.map((r) => [...r].map(() => false));
let revealT = 0;
function revealMap(dt: number) {
  revealT -= dt;
  if (revealT > 0) return;
  revealT = 0.15;
  const pcx = Math.floor(player.pos.x / CELL), pcy = Math.floor(player.pos.z / CELL);
  const R = 5;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = pcx + dx, y = pcy + dy;
    if (x < 0 || y < 0 || x >= W || y >= H || dx * dx + dy * dy > R * R) continue;
    if (lineOfSight(player.pos.x, player.pos.z, cellToWorld(x), cellToWorld(y), true)) seen[y][x] = true;
  }
}
function drawMap() {
  const size = bigMap ? Math.min(innerWidth * 0.9 / W, innerHeight * 0.85 / H) : Math.min(15, innerWidth * 0.33 / W);
  mini.width = W * size;
  mini.height = H * size;
  mini.classList.toggle("big", bigMap);
  const g = mini.getContext("2d")!;
  g.fillStyle = "#050507";
  g.fillRect(0, 0, mini.width, mini.height);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!seen[y][x]) continue;
    const ch = MAP[y][x];
    g.fillStyle = ch === "#" ? "#2c2c36" : ch === "E" ? "#4a8" : ch === "D" ? (flags.boilerOpen ? "#654" : "#c75") : "#74685a";
    g.fillRect(x * size, y * size, size + 0.5, size + 0.5);
  }
  const px = (v: number) => (v / CELL) * size;
  const spot = objectiveSpot();
  if (seen[spot.y][spot.x] || eyeState.hintT > 0) {
    g.fillStyle = `rgba(255,220,60,${0.6 + Math.sin(performance.now() / 250) * 0.4})`;
    g.beginPath();
    g.arc((spot.x + 0.5) * size, (spot.y + 0.5) * size, size * 0.5, 0, 7);
    g.fill();
  }
  if (monster.dist() < 12 || monster.state === "chase") {
    g.fillStyle = "#f33";
    g.beginPath();
    g.arc(px(monster.pos.x), px(monster.pos.z), size * 0.5, 0, 7);
    g.fill();
  }
  if (sparky.awake() && sparky.dist() < 14) {
    g.fillStyle = "#6ff";
    g.beginPath();
    g.arc(px(sparky.pos.x), px(sparky.pos.z), size * 0.4, 0, 7);
    g.fill();
  }
  g.save();
  g.translate(px(player.pos.x), px(player.pos.z));
  g.rotate(Math.atan2(-Math.cos(player.yaw), -Math.sin(player.yaw)));
  g.fillStyle = "#4cf";
  g.beginPath();
  g.moveTo(size * 0.9, 0);
  g.lineTo(-size * 0.6, size * 0.55);
  g.lineTo(-size * 0.6, -size * 0.55);
  g.fill();
  g.restore();
  if (bigMap) {
    g.fillStyle = "#fff";
    g.font = "16px Georgia";
    g.fillText("Blue arrow = you  ·  Yellow = goal  ·  Red = Concierge  ·  Cyan = Sparky  ·  M = close", 10, mini.height - 10);
  }
}

// ---------- main loop ----------
const ray = new THREE.Raycaster();
ray.far = 3.4;
let target: Ent | null = null;
const clock = new THREE.Clock();

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (running) {
    update(dt);
  }
  camera.position.copy(player.pos);
  camera.rotation.set(player.pitch, player.yaw, 0);
  renderer.render(scene, camera);
  drawMap();
}

function update(dt: number) {
  let moving = false;
  const run = !!(keys.ShiftLeft || keys.ShiftRight);
  if (!hidden && !padOpen) {
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    if (f || s) {
      moving = true;
      const len = Math.hypot(f, s);
      const speed = run ? 5.2 : 2.9;
      const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
      const vx = (-sin * f + cos * s) / len * speed * dt;
      const vz = (-cos * f - sin * s) / len * speed * dt;
      if (!collide(player.pos.x + vx, player.pos.z)) player.pos.x += vx;
      if (!collide(player.pos.x, player.pos.z + vz)) player.pos.z += vz;
      player.stepDist += speed * dt;
      if (player.stepDist > (run ? 1.7 : 1.5)) { player.stepDist = 0; sound.step(run); }
    }
  }
  player.noise = moving ? (run ? 9 : 3) : 0;
  player.pos.y = hidden ? 1.4 : 1.6 + (moving ? Math.sin(performance.now() / (run ? 110 : 170)) * 0.04 : 0);

  // flashlight + battery
  const on = flags.hasLight && flags.flashOn && battery > 0 && !hidden;
  if (on) battery = Math.max(0, battery - dt * 0.6);
  const flick = battery < 15 && Math.random() < 0.15 ? 0.2 : 1;
  flashlight.intensity = on ? 30 * flick : 0;
  if (flags.hasLight && battery <= 0 && flags.flashOn) { say("The flashlight died."); flags.flashOn = false; }

  pickupModels.forEach((h, i) => { h.rotation.y += dt * 1.2; h.position.y = 0.55 + Math.sin(performance.now() / 500 + i) * 0.04; });
  monster.update(dt);
  sparky.update(dt);
  zapT = Math.max(0, zapT - dt);
  playT += dt;
  if (playT > 25 && !sparkyWarned) { sparkyWarned = true; eyeSay("See the light switch on the wall? Flip it with E... but Sparky the electric ghost LOVES electricity and will float over. If he does: FREEZE, don't move!", 11000); }
  eyeUpdate(dt);
  revealMap(dt);
  checkQuests();

  const dist = monster.dist();
  sound.heartbeat(dt, hidden && dist > 6 ? 0 : Math.max(0, 1 - dist / 10));
  grace = Math.max(0, grace - dt);
  flashCd = Math.max(0, flashCd - dt);
  // keep light flicker alive when monster is close
  lamps.forEach((l, i) => {
    const near = dist < 7 || sparky.dist() < 6;
    l.intensity = lampOn[i] ? (near && Math.random() < 0.2 ? 2 : 12) : 0;
    bulbMats[i].color.set(lampOn[i] ? 0xffe8a8 : 0x554433);
  });

  // interaction
  target = null;
  if (!hidden && !padOpen) {
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hit = ray.intersectObjects(ents.map((e) => e.obj), true)[0];
    if (hit && lineOfSight(player.pos.x, player.pos.z, hit.point.x, hit.point.z, true)) target = hit.object.userData.ent ?? null;
  }
  $("freeze").style.opacity = freezeHint ? "1" : "0";
  $("prompt").textContent = hidden ? "[E] Leave hiding spot" : (target?.label() ?? "");
  if (target && !target.label()) target = null;

  $("info").innerHTML =
    `Objective: ${objective()}<br>Items: ${[...inv].join(", ") || "-"}` +
    (flags.hasLight ? `<br>Battery: ${Math.ceil(battery)}%  (F)<br>Light flash (Q / click): ${flashCd > 0 ? "recharging " + Math.ceil(flashCd) + "s" : "READY"}` : "") +
    `<br>Quests: ${questsDone()}/${QUESTS}` + "<br>Ask the Eye for help: H" + (hidden ? "<br><i>Hidden</i>" : "");
}

loop();

if (import.meta.env.DEV) {
  // dev-only test hook
  (window as any).__dbg = { player, sparky, monster, flags, lampOn, start: () => { running = true; $("overlay").style.display = "none"; if (!started) { started = true; sound.start(); } }, ents, keys };
}
