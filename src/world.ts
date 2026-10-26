import * as THREE from "three";
import { CELL, H, HEIGHT, MAP, W, cellToWorld } from "./map";

export function createWorld() {
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


  return { renderer, scene, camera, ambient, flashlight, solid, isSolid, lamps, lampOn, bulbMats, wallMat, woodMat, metalMat };
}
