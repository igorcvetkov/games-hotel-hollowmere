import * as THREE from "three";
import { M, cylMesh } from "./pickup-models";

// Room dressing: boiler room, library and kitchen props, floor decals and signs.
// Everything is positioned in world units (1 map cell = 2 m). Wall-hugging props use
// small AABB blockers (the monster paths on the cell grid and ignores them); props in the
// middle of a room mark their cell solid instead.

interface Aabb { x0: number; x1: number; z0: number; z1: number }

function canvasMat(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, emissive = 0.5, double = false) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: emissive, roughness: 1, side: double ? THREE.DoubleSide : THREE.FrontSide });
}

export function makeSign(lines: string[], o: { w: number; h: number; bg: string; fg: string; border?: string }) {
  const mat = canvasMat(512, Math.round(512 * o.h / o.w), (g, w, h) => {
    g.fillStyle = o.bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = o.border ?? o.fg; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = o.fg; g.textAlign = "center"; g.textBaseline = "middle";
    const sizes = lines.map((_, i) => (i === 0 ? h * 0.36 : h * 0.17));
    const total = sizes.reduce((a, b) => a + b * 1.15, 0);
    let y = (h - total) / 2;
    lines.forEach((t, i) => {
      let s = sizes[i];
      g.font = `bold ${s}px Georgia`;
      while (g.measureText(t).width > w * 0.84) { s -= 2; g.font = `bold ${s}px Georgia`; }
      g.fillText(t, w / 2, y + sizes[i] * 0.575);
      y += sizes[i] * 1.15;
    });
  }, 0.55);
  return new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), mat);
}

export function createDecor(scene: THREE.Scene, solid: boolean[][]) {
  const blockers: Aabb[] = [];
  const block = (x0: number, x1: number, z0: number, z1: number) => blockers.push({ x0, x1, z0, z1 });
  const blockBox = (cx: number, cz: number, w: number, d: number) => block(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2);
  const blocked = (x: number, z: number, r: number) =>
    blockers.some((b) => x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1);

  let seed = 1234;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const bx = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  };
  const place = (o: THREE.Object3D, x: number, y: number, z: number, ry = 0) => {
    o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); return o;
  };
  const decal = (cx: number, cz: number, w: number, d: number, mat: THREE.Material, y = 0.02) => {
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(cx, y, cz); scene.add(m); return m;
  };
  const wallSign = (lines: string[], o: { w: number; h: number; bg: string; fg: string }, x: number, y: number, z: number, ry: number) => {
    const s = makeSign(lines, o); s.position.set(x, y, z); s.rotation.y = ry; scene.add(s);
  };
  const hangingSign = (lines: string[], x: number, z: number) => {
    const g = new THREE.Group();
    const o = { w: 1.5, h: 0.5, bg: "#2a1a10", fg: "#e8c76a" };
    const a = makeSign(lines, o), b = makeSign(lines, o);
    a.position.z = 0.02; b.position.z = -0.02; b.rotation.y = Math.PI;
    const chain = M(0x222222, 0.6, 0.6);
    g.add(a, b, cylMesh(0.01, 0.01, 0.55, chain, -0.65, 0.5, 0, 6), cylMesh(0.01, 0.01, 0.55, chain, 0.65, 0.5, 0, 6));
    place(g, x, 2.25, z);
  };

  // ---------- shared materials ----------
  const steel = M(0x707780, 0.5, 0.35), rust = M(0x6b3a22, 0.9, 0.3), dark = M(0x18181a, 0.8, 0.4);
  const brass = M(0xb08d3a, 0.35, 0.9), red = M(0x9a1c16, 0.5, 0.4);
  const wood = M(0x4a2c16, 0.9, 0), woodDark = M(0x2e1a0c, 0.95, 0), woodLight = M(0x7a5330, 0.85, 0);
  const steelBright = M(0xaab4bb, 0.35, 0.7);

  // ---------- floor decals that tell the rooms apart ----------
  {
    const speck = (g: CanvasRenderingContext2D, n: number) => {
      for (let i = 0; i < n; i++) { const v = 20 + Math.random() * 50; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    };
    const concrete = canvasMat(128, 128, (g) => { g.fillStyle = "#4a4d50"; g.fillRect(0, 0, 128, 128); speck(g, 900); g.fillStyle = "#33363a"; g.fillRect(0, 63, 128, 2); g.fillRect(63, 0, 2, 128); }, 0.12);
    (concrete.map as THREE.Texture).repeat.set(7, 5); (concrete.map as THREE.Texture).magFilter = THREE.NearestFilter;
    decal(39, 7, 14, 10, concrete);

    const tiles = canvasMat(128, 128, (g) => {
      g.fillStyle = "#cfcabc"; g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#2c3a3a"; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
      g.strokeStyle = "#00000055"; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128);
    }, 0.15);
    (tiles.map as THREE.Texture).repeat.set(10, 3); (tiles.map as THREE.Texture).magFilter = THREE.NearestFilter;
    decal(36, 23, 20, 6, tiles);

    const rug = canvasMat(256, 160, (g, w, h) => {
      g.fillStyle = "#5a1616"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#c9a227"; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
      g.strokeStyle = "#2a1a40"; g.lineWidth = 3; g.strokeRect(22, 22, w - 44, h - 44);
      g.fillStyle = "#c9a22788";
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(w / 2 + (i - 2) * 40, h / 2 - 28); g.lineTo(w / 2 + (i - 2) * 40 + 16, h / 2); g.lineTo(w / 2 + (i - 2) * 40, h / 2 + 28); g.lineTo(w / 2 + (i - 2) * 40 - 16, h / 2); g.fill(); }
    }, 0.2);
    decal(15, 23, 4.6, 2.9, rug, 0.015);
  }

  // ---------- books (one instanced mesh for all shelves) ----------
  const bookMatrices: THREE.Matrix4[] = [];
  const bookColors: THREE.Color[] = [];
  const bookPalette = [0x7a1f1f, 0x1f3a6b, 0x2f5a2f, 0x6b4a1f, 0x4a2a5a, 0x8a7a3a, 0x2a2a2a, 0x5a1f3a, 0x3a5a6a];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3();

  function bookshelf(cx: number, cz: number, rot: number, w = 1.6) {
    const d = 0.5, h = 2.6;
    const g = new THREE.Group();
    g.add(bx(w, h, 0.04, woodDark, 0, h / 2, -d / 2 + 0.02));
    for (const s of [-1, 1]) g.add(bx(0.05, h, d, wood, s * (w / 2 - 0.025), h / 2, 0));
    const boards = [0.05, 0.62, 1.1, 1.58, 2.06, 2.58];
    boards.forEach((y) => g.add(bx(w, 0.04, d, wood, 0, y, 0)));
    g.position.set(cx, 0, cz); g.rotation.y = rot; scene.add(g);
    g.updateMatrix();
    for (let r = 0; r < boards.length - 1; r++) {
      const y0 = boards[r] + 0.02, gap = boards[r + 1] - boards[r] - 0.05;
      let x = -w / 2 + 0.08;
      while (x < w / 2 - 0.1) {
        const bw = 0.035 + rnd() * 0.05;
        if (rnd() < 0.07) { x += 0.14; continue; }
        const bh = Math.min(gap, 0.24 + rnd() * 0.22), bd = 0.22 + rnd() * 0.1;
        const lean = rnd() < 0.05 ? (rnd() - 0.5) * 0.5 : 0;
        q.setFromEuler(e.set(0, 0, lean));
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x + bw / 2, y0 + bh / 2, -d / 2 + 0.05 + bd / 2), q, one.set(bw, bh, bd));
        bookMatrices.push(new THREE.Matrix4().multiplyMatrices(g.matrix, m));
        bookColors.push(new THREE.Color(bookPalette[Math.floor(rnd() * bookPalette.length)]).multiplyScalar(0.7 + rnd() * 0.5));
        x += bw + 0.005 + (lean ? 0.06 : 0);
      }
    }
    const sideways = Math.abs(Math.sin(rot)) > 0.5;
    blockBox(cx, cz, sideways ? d : w, sideways ? w : d);
  }

  // ---------- simple furniture builders ----------
  function chair(x: number, z: number, ry: number) {
    const g = new THREE.Group();
    g.add(bx(0.5, 0.06, 0.5, woodLight, 0, 0.5, 0), bx(0.5, 0.6, 0.05, woodLight, 0, 0.83, -0.23));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(bx(0.05, 0.5, 0.05, wood, sx * 0.21, 0.25, sz * 0.21));
    place(g, x, 0, z, ry); blockBox(x, z, 0.5, 0.5);
  }
  function lampEmissive(color = 0xffc070) {
    return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.6, side: THREE.DoubleSide });
  }
  function bankerLamp(x: number, y: number, z: number, ry = 0) {
    const g = new THREE.Group();
    g.add(bx(0.2, 0.03, 0.14, brass, 0, 0.015, 0), cylMesh(0.015, 0.015, 0.28, brass, 0, 0.17, 0, 6));
    const shade = bx(0.34, 0.12, 0.16, new THREE.MeshStandardMaterial({ color: 0x1f6a3a, emissive: 0x1f8a4a, emissiveIntensity: 0.6, roughness: 0.4 }), 0, 0.33, 0);
    shade.rotation.z = 0.05; g.add(shade);
    place(g, x, y, z, ry);
  }
  function floorLamp(x: number, z: number) {
    const g = new THREE.Group();
    g.add(cylMesh(0.18, 0.2, 0.04, dark, 0, 0.02, 0, 12), cylMesh(0.015, 0.015, 1.5, brass, 0, 0.78, 0, 6), cylMesh(0.17, 0.27, 0.32, lampEmissive(), 0, 1.6, 0, 12));
    place(g, x, 0, z); blockBox(x, z, 0.4, 0.4);
  }
  function armchair(x: number, z: number, ry: number) {
    const fabric = M(0x5a1a22, 0.95, 0);
    const g = new THREE.Group();
    g.add(bx(0.9, 0.4, 0.8, fabric, 0, 0.3, 0), bx(0.9, 0.7, 0.2, fabric, 0, 0.75, -0.3), bx(0.16, 0.3, 0.8, fabric, -0.43, 0.6, 0), bx(0.16, 0.3, 0.8, fabric, 0.43, 0.6, 0), bx(0.64, 0.12, 0.62, M(0x6a2430, 0.95, 0), 0, 0.56, 0.05));
    place(g, x, 0, z, ry); blockBox(x, z, 1.0, 1.0);
  }
  function barrel(x: number, z: number, color: number, hazard = false) {
    const g = new THREE.Group();
    g.add(cylMesh(0.36, 0.36, 1.0, M(color, 0.6, 0.5), 0, 0.5, 0, 16));
    for (const y of [0.15, 0.5, 0.85]) g.add(cylMesh(0.372, 0.372, 0.05, dark, 0, y, 0, 16));
    g.add(cylMesh(0.3, 0.3, 0.03, dark, 0, 1.0, 0, 16));
    if (hazard) g.add(bx(0.32, 0.22, 0.02, M(0xe8c020, 0.5, 0, 0x403000), 0, 0.62, 0.365));
    place(g, x, 0, z); blockBox(x, z, 0.72, 0.72);
  }
  function crate(x: number, z: number, s: number, y = 0, ry = 0) {
    const g = new THREE.Group();
    g.add(bx(s, s, s, woodLight, 0, s / 2, 0));
    for (const sy of [0.04, s - 0.04]) g.add(bx(s + 0.02, 0.07, s + 0.02, wood, 0, sy, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(bx(0.07, s, 0.07, wood, sx * (s / 2), s / 2, sz * (s / 2)));
    place(g, x, y, z, ry);
  }
  function jar(parent: THREE.Object3D, x: number, y: number, z: number, color: number) {
    parent.add(cylMesh(0.06, 0.06, 0.16, new THREE.MeshStandardMaterial({ color, roughness: 0.2, transparent: true, opacity: 0.85 }), x, y + 0.08, z, 10));
  }

  // =====================================================================
  // BOILER ROOM  (world x 32..46, z 2..12; door in the west wall at z 8..10)
  // =====================================================================
  {
    // main boiler against the north wall
    const b = new THREE.Group();
    b.add(cylMesh(1.05, 1.1, 0.2, dark, 0, 0.1, 0, 24), cylMesh(0.95, 0.95, 2.3, steel, 0, 1.35, 0, 24));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel);
    dome.scale.y = 0.45; dome.position.y = 2.5; b.add(dome);
    for (const y of [0.55, 1.35, 2.15]) b.add(cylMesh(0.975, 0.975, 0.07, rust, 0, y, 0, 24));
    b.add(cylMesh(0.2, 0.2, 0.55, steel, 0, 2.72, 0, 12), cylMesh(0.26, 0.26, 0.06, dark, 0, 2.96, 0, 12));
    // front control panel: furnace hatch, gauge, valve, warning plate
    b.add(bx(1.5, 1.0, 0.18, M(0x3a3e44, 0.5, 0.6), 0, 0.95, 0.88));
    b.add(bx(0.8, 0.62, 0.06, dark, 0, 0.8, 0.99), bx(0.62, 0.46, 0.03, M(0xff6a10, 0.5, 0, 0xff5a00), 0, 0.8, 1.02));
    for (const x of [-0.17, 0, 0.17]) b.add(bx(0.02, 0.46, 0.04, dark, x, 0.8, 1.035));
    b.add(bx(0.7, 0.05, 0.1, dark, 0, 0.45, 1.0));
    const gauge = canvasMat(128, 128, (g) => {
      g.fillStyle = "#e8e4d4"; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
      g.strokeStyle = "#111"; g.lineWidth = 3; for (let i = 0; i <= 8; i++) { const a = Math.PI * (0.8 + i * 0.175); g.beginPath(); g.moveTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48); g.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); g.stroke(); }
      g.strokeStyle = "#c22"; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 40, Math.PI * 2.05, Math.PI * 2.3); g.stroke();
      g.strokeStyle = "#111"; g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(5.3) * 44, 64 + Math.sin(5.3) * 44); g.stroke();
    }, 0.35);
    const gaugeFace = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), gauge);
    gaugeFace.position.set(0.5, 1.2, 0.975);
    b.add(cylMesh(0.19, 0.19, 0.04, brass, 0.5, 1.2, 0.97, 20).rotateX(Math.PI / 2), gaugeFace);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 18), red);
    wheel.position.set(-0.5, 1.2, 1.0); b.add(wheel, bx(0.26, 0.025, 0.025, red, -0.5, 1.2, 1.0), bx(0.025, 0.26, 0.025, red, -0.5, 1.2, 1.0));
    place(b, 38, 0, 3.4);
    block(37.0, 39.0, 2.3, 4.4);

    // smaller hot-water tank + connecting pipe
    const t = new THREE.Group();
    t.add(cylMesh(0.55, 0.55, 1.8, M(0x6a6f66, 0.5, 0.6), 0, 1.0, 0, 20), cylMesh(0.58, 0.58, 0.06, rust, 0, 0.5, 0, 20), cylMesh(0.58, 0.58, 0.06, rust, 0, 1.5, 0, 20));
    const tdome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0x6a6f66, 0.5, 0.6)); tdome.scale.y = 0.5; tdome.position.y = 1.9; t.add(tdome);
    t.add(cylMesh(0.14, 0.14, 0.3, steel, 0, 2.3, 0, 10));
    place(t, 34.2, 0, 3.2); block(33.6, 34.8, 2.6, 3.8);
    const pipe = cylMesh(0.09, 0.09, 2.4, steel, 35.9, 1.9, 3.3, 10); pipe.rotation.z = Math.PI / 2; scene.add(pipe);
    for (const px of [34.75, 37.05]) { const f = cylMesh(0.14, 0.14, 0.05, dark, px, 1.9, 3.3, 10); f.rotation.z = Math.PI / 2; scene.add(f); }
    const valve = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 14), red); valve.position.set(35.9, 2.1, 3.3); valve.rotation.x = Math.PI / 2; scene.add(valve, cylMesh(0.02, 0.02, 0.16, red, 35.9, 2.0, 3.3, 6));

    // ceiling pipe runs
    for (const [z, y, r, m] of [[2.3, 2.78, 0.1, steel], [2.62, 2.72, 0.07, rust], [11.6, 2.8, 0.11, steel]] as [number, number, number, THREE.Material][]) {
      const p = cylMesh(r, r, 14, m, 39, y, z, 10); p.rotation.z = Math.PI / 2; scene.add(p);
      for (let x = 33.5; x < 46; x += 3.2) { const f = cylMesh(r + 0.04, r + 0.04, 0.06, dark, x, y, z, 10); f.rotation.z = Math.PI / 2; scene.add(f); }
    }
    // vertical drop along the east wall, with a valve
    scene.add(cylMesh(0.08, 0.08, 2.5, steel, 45.75, 1.5, 11.6, 10), cylMesh(0.12, 0.12, 0.08, dark, 45.75, 0.28, 11.6, 10));
    const v2 = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 14), red); v2.position.set(45.55, 1.2, 11.6); v2.rotation.y = Math.PI / 2; scene.add(v2);

    // barrels, crates, coal, workbench
    barrel(33.2, 11.2, 0x8a2a1a); barrel(34.15, 11.35, 0x1f3a6b); barrel(33.6, 10.4, 0xc9a227, true);
    crate(44.9, 11.2, 1.1); crate(44.95, 11.2, 0.75, 1.1, 0.35); crate(43.65, 11.35, 0.85, 0, -0.2);
    block(44.35, 46, 10.65, 12); block(43.2, 44.1, 10.9, 11.8);
    const coal = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.6, 9), M(0x0e0e0f, 0.95, 0.2)); coal.position.set(41, 0.3, 2.95); scene.add(coal);
    for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07 + rnd() * 0.05), M(0x151517, 0.6, 0.3)); c.position.set(40.2 + rnd() * 1.6, 0.06, 3.3 + rnd() * 0.7); scene.add(c); }
    block(40.3, 41.7, 2.3, 3.6);

    // workbench on the east wall
    const wb = new THREE.Group();
    wb.add(bx(0.9, 0.08, 2.2, woodLight, 0, 0.9, 0), bx(0.8, 0.05, 2.0, wood, 0, 0.35, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wb.add(bx(0.07, 0.9, 0.07, wood, sx * 0.4, 0.45, sz * 1.05));
    wb.add(bx(0.5, 0.22, 0.26, red, 0.0, 1.05, -0.5), bx(0.5, 0.03, 0.06, dark, 0, 1.18, -0.5));
    wb.add(bx(0.24, 0.16, 0.22, dark, 0, 1.02, 0.55), bx(0.05, 0.12, 0.2, steel, -0.13, 1.1, 0.55));
    for (const z of [0.1, 0.25]) wb.add(cylMesh(0.05, 0.05, 0.16, M(0xc9a227, 0.4, 0.6), 0.1, 1.02, z, 10));
    wb.add(bx(0.12, 0.03, 0.55, steel, 0.12, 0.96, 0.8));
    place(wb, 45.3, 0, 7.2); block(44.8, 46, 6.1, 8.3);
    const peg = canvasMat(256, 128, (g, w, h) => {
      g.fillStyle = "#6a5a40"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#3a301f"; for (let x = 8; x < w; x += 16) for (let y = 8; y < h; y += 16) g.fillRect(x, y, 3, 3);
      g.strokeStyle = "#cfd4d8"; g.lineWidth = 7; g.lineCap = "round";
      g.beginPath(); g.moveTo(30, 100); g.lineTo(30, 30); g.stroke(); g.beginPath(); g.arc(30, 24, 11, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(80, 100); g.lineTo(80, 36); g.stroke(); g.fillStyle = "#cfd4d8"; g.fillRect(70, 24, 20, 14);
      g.strokeStyle = "#8a2020"; g.beginPath(); g.moveTo(130, 100); g.lineTo(130, 40); g.stroke(); g.fillStyle = "#555"; g.fillRect(115, 28, 32, 14);
      g.strokeStyle = "#d0a020"; g.beginPath(); g.moveTo(190, 100); g.lineTo(215, 28); g.stroke(); g.strokeStyle = "#cfd4d8"; g.lineWidth = 5; g.beginPath(); g.arc(218, 24, 10, 0, 5); g.stroke();
    }, 0.4);
    const pegMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), peg);
    pegMesh.position.set(45.94, 1.85, 7.2); pegMesh.rotation.y = -Math.PI / 2; scene.add(pegMesh);

    // puddle, hazard stripes and a room plaque
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), new THREE.MeshStandardMaterial({ color: 0x1a2a36, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }));
    puddle.rotation.x = -Math.PI / 2; puddle.scale.y = 0.6; puddle.position.set(36, 0.025, 8.3); scene.add(puddle);
    decal(38, 5.15, 3.4, 0.45, canvasMat(256, 32, (g, w, h) => {
      g.fillStyle = "#e0b818"; g.fillRect(0, 0, w, h); g.fillStyle = "#151515";
      for (let x = -h; x < w; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill(); }
    }, 0.3), 0.03);
    wallSign(["BOILER ROOM", "Staff only!"], { w: 1.3, h: 0.5, bg: "#c9a227", fg: "#1a1208" }, 32.03, 2.2, 5.6, Math.PI / 2);

    const glow = new THREE.PointLight(0xff6a20, 1.6, 7, 1.6);
    glow.position.set(38, 0.9, 4.6); scene.add(glow);
    // caged work light so the room reads even before the power is back
    const work = new THREE.PointLight(0xffb060, 1.4, 12, 1.4);
    work.position.set(40, 2.6, 7.5); scene.add(work);
    const cage = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    cage.position.copy(work.position); scene.add(cage, cylMesh(0.01, 0.01, 0.4, dark, 40, 2.8, 7.5, 4));
  }

  // =====================================================================
  // LIBRARY  (world x 2..20, z 20..26; entrance gap x 8..10 in the north wall)
  // =====================================================================
  {
    for (const x of [3.4, 5.0, 6.6]) bookshelf(x, 20.27, 0);
    for (const x of [11.4, 13.0, 14.6, 16.2, 17.8]) bookshelf(x, 20.27, 0);
    for (const z of [21.4, 23.0, 24.6]) bookshelf(2.27, z, Math.PI / 2);
    for (const x of [3.4, 5.0, 6.6, 8.2, 13.0, 14.6, 16.2]) bookshelf(x, 25.73, Math.PI);

    // finish the instanced books
    const books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M(0xffffff, 0.85, 0), bookMatrices.length);
    bookMatrices.forEach((m, i) => { books.setMatrixAt(i, m); books.setColorAt(i, bookColors[i]); });
    scene.add(books);

    // rolling ladder leaning on the north shelves
    const ladder = new THREE.Group();
    for (const sx of [-1, 1]) ladder.add(bx(0.05, 2.6, 0.05, woodLight, sx * 0.24, 1.3, 0));
    for (let i = 0; i < 7; i++) ladder.add(bx(0.48, 0.04, 0.05, woodLight, 0, 0.35 + i * 0.33, 0));
    ladder.rotation.x = -0.2; ladder.position.set(7.9, 0, 20.9); scene.add(ladder);
    block(7.5, 8.35, 20.5, 21.1);

    // reading table (cell 7,11) with lamp, open book, chairs
    solid[11][7] = true;
    const tb = new THREE.Group();
    tb.add(bx(1.8, 0.07, 0.9, woodLight, 0, 0.78, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tb.add(bx(0.07, 0.78, 0.07, wood, sx * 0.82, 0.39, sz * 0.38));
    tb.add(bx(0.5, 0.025, 0.34, M(0xe8dfc0, 0.9, 0), -0.1, 0.825, 0.1), bx(0.02, 0.026, 0.34, wood, -0.1, 0.83, 0.1));
    for (let i = 0; i < 4; i++) tb.add(bx(0.3, 0.05, 0.22, M(bookPalette[i], 0.85, 0), 0.5, 0.84 + i * 0.05, -0.18));
    place(tb, 15, 0, 23);
    bankerLamp(14.3, 0.815, 22.85, 0.3);
    chair(14.5, 21.9, 0); chair(15.6, 24.15, Math.PI);

    // ledger desk dressing (the desk itself lives in main.ts at 5, 23)
    chair(5.2, 24.3, Math.PI);
    bankerLamp(4.45, 1.03, 22.75, -0.2);
    const papers = new THREE.Group();
    for (let i = 0; i < 6; i++) papers.add(bx(0.28, 0.012, 0.2, M(0xdcd2b0, 0.9, 0), (rnd() - 0.5) * 0.02, i * 0.012, (rnd() - 0.5) * 0.02));
    papers.rotation.y = 0.2; place(papers, 5.55, 1.03, 22.75);

    // reading corner
    armchair(18.5, 21.9, Math.PI);
    floorLamp(19.5, 20.8);
    // statue-like globe on a stand
    const globe = new THREE.Group();
    globe.add(cylMesh(0.2, 0.25, 0.05, dark, 0, 0.025, 0, 12), cylMesh(0.02, 0.02, 0.8, brass, 0, 0.45, 0, 6));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), M(0x2a5a7a, 0.5, 0.2)); ball.position.y = 1.1; globe.add(ball);
    globe.add(bx(0.18, 0.22, 0.2, M(0x3a7a3a, 0.8, 0), 0.14, 1.12, 0.14));
    place(globe, 17.2, 0, 24.9); blockBox(17.2, 24.9, 0.5, 0.5);

    hangingSign(["LIBRARY", "Silence, please"], 9, 19);
  }

  // =====================================================================
  // KITCHEN  (world x 26..46, z 20..26; entrance gap x 36..38 in the north wall)
  // =====================================================================
  {
    const cab = M(0x6a5a46, 0.85, 0), top = M(0xb9b4a6, 0.4, 0.1), hood = M(0x8a9298, 0.35, 0.8);
    function counter(x0: number, x1: number, sink = false) {
      const w = x1 - x0, cx = (x0 + x1) / 2, g = new THREE.Group();
      g.add(bx(w, 0.85, 0.65, cab, 0, 0.425, 0), bx(w + 0.04, 0.06, 0.7, top, 0, 0.88, 0));
      for (let x = -w / 2 + 0.45; x < w / 2 - 0.2; x += 0.9) g.add(bx(0.8, 0.6, 0.02, woodDark, x, 0.45, 0.335));
      g.add(bx(w, 0.7, 0.34, cab, 0, 2.05, -0.15));
      for (let x = -w / 2 + 0.45; x < w / 2 - 0.2; x += 0.9) g.add(bx(0.8, 0.6, 0.02, woodDark, x, 2.05, 0.03));
      if (sink) {
        g.add(bx(0.8, 0.04, 0.45, dark, 0, 0.9, 0.02), cylMesh(0.015, 0.015, 0.35, steelBright, 0, 1.07, -0.22, 6), bx(0.02, 0.02, 0.2, steelBright, 0, 1.24, -0.12));
      } else {
        jar(g, -w / 2 + 0.4, 0.91, -0.1, 0xa0402a); jar(g, -w / 2 + 0.6, 0.91, -0.1, 0xc9a227); jar(g, w / 2 - 0.4, 0.91, -0.1, 0x4a7a3a);
      }
      place(g, cx, 0, 20.4); block(x0, x1, 20, 20.75);
    }
    counter(28.0, 31.4, true); counter(32.0, 33.3); counter(34.6, 35.8);
    counter(38.2, 40.8); counter(41.4, 45.4);

    // stove with hood and hanging pots
    const st = new THREE.Group();
    st.add(bx(1.2, 0.88, 0.68, M(0x2a2c30, 0.4, 0.6), 0, 0.44, 0), bx(0.9, 0.35, 0.02, dark, 0, 0.5, 0.35));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) st.add(cylMesh(0.13, 0.13, 0.02, dark, sx * 0.27, 0.9, sz * 0.15, 14));
    st.add(cylMesh(0.1, 0.12, 0.12, steelBright, -0.27, 0.97, -0.15, 12));
    const hoodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.65, 0.5, 4, 1, true), hood); hoodMesh.rotation.y = Math.PI / 4; hoodMesh.position.set(0, 1.9, -0.05); hoodMesh.scale.z = 0.7; st.add(hoodMesh);
    st.add(bx(0.4, 0.75, 0.3, hood, 0, 2.55, -0.1));
    st.add(cylMesh(0.015, 0.015, 1.3, dark, 0, 1.3, 0.55, 6).rotateZ(Math.PI / 2));
    for (const sx of [-0.45, -0.15, 0.2, 0.5]) {
      const pot = cylMesh(0.1, 0.09, 0.14, M(0x8a5a2a, 0.4, 0.8), sx, 1.15, 0.55, 14);
      st.add(pot, cylMesh(0.005, 0.005, 0.14, dark, sx, 1.3, 0.55, 4));
    }
    place(st, 33.95, 0, 20.4); block(33.3, 34.6, 20, 20.8);

    // steel shelves with cans and pots on the south wall
    for (const x of [31.8, 33.4, 35.0, 40.6, 42.2]) {
      const g = new THREE.Group();
      for (const y of [0.3, 0.9, 1.5, 2.1]) g.add(bx(1.4, 0.03, 0.45, steelBright, 0, y, 0));
      for (const sx of [-1, 1]) g.add(bx(0.04, 2.2, 0.04, steel, sx * 0.68, 1.1, -0.2), bx(0.04, 2.2, 0.04, steel, sx * 0.68, 1.1, 0.2));
      for (const y of [0.3, 0.9, 1.5, 2.1]) for (let i = 0; i < 4; i++) {
        if (rnd() < 0.2) continue;
        const col = [0xa03020, 0x2a5a8a, 0xc0a030, 0x4a7a3a, 0xd0d0d0][Math.floor(rnd() * 5)];
        g.add(cylMesh(0.065, 0.065, 0.14 + rnd() * 0.12, M(col, 0.4, 0.6), -0.55 + i * 0.37 + rnd() * 0.1, y + 0.1, (rnd() - 0.5) * 0.2, 10));
      }
      place(g, x, 0, 25.72, Math.PI); block(x - 0.7, x + 0.7, 25.45, 26);
    }
    barrel(44.9, 25.3, 0x6a6f66);

    // island prep table (cell 20,11)
    solid[11][20] = true;
    const pt = new THREE.Group();
    pt.add(bx(1.9, 0.06, 1.0, steelBright, 0, 0.9, 0), bx(1.8, 0.04, 0.9, steel, 0, 0.3, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pt.add(bx(0.05, 0.9, 0.05, steel, sx * 0.9, 0.45, sz * 0.45));
    pt.add(bx(0.55, 0.03, 0.35, woodLight, -0.4, 0.945, 0.0));
    pt.add(bx(0.3, 0.012, 0.05, steelBright, -0.4, 0.97, 0.05), bx(0.12, 0.02, 0.04, woodDark, -0.55, 0.97, 0.05));
    pt.add(cylMesh(0.14, 0.1, 0.1, M(0xd8d8d0, 0.4, 0.1), 0.45, 0.98, 0.1, 14));
    pt.add(cylMesh(0.1, 0.1, 0.07, M(0xc02820, 0.5, 0), 0.7, 0.96, -0.2, 14));
    place(pt, 41, 0, 23);

    hangingSign(["KITCHEN", "Nobody ate here"], 37, 19);
  }

  // finish
  return { blocked, dressBoilerDoor };

  function dressBoilerDoor(door: THREE.Object3D) {
    const plate = makeSign(["BOILER ROOM", "Staff only!"], { w: 1.2, h: 0.5, bg: "#c9a227", fg: "#1a1208" });
    plate.position.set(-0.16, 0.5, 0); plate.rotation.y = -Math.PI / 2;
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), brass);
    handle.position.set(-0.19, -0.05, 0.7);
    door.add(plate, handle);
    for (const y of [-0.85, 0.85]) door.add(bx(0.34, 0.12, 1.9, steel, 0, y, 0));
    for (const z of [-0.8, 0.8]) for (const y of [-0.85, 0.85]) door.add(cylMesh(0.03, 0.03, 0.36, dark, 0, y, z, 6).rotateZ(Math.PI / 2));
  }
}
