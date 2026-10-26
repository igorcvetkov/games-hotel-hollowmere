import * as THREE from "three";
import { CELL, H, MAP, W, cellToWorld } from "./map";
import { Sound } from "./audio";

interface PlayerView {
  pos: THREE.Vector3;
  yaw: number;
}

export function createAtmosphere(
  scene: THREE.Scene,
  player: PlayerView,
  isSolid: (x: number, y: number) => boolean,
  lineOfSight: (ax: number, az: number, bx: number, bz: number, skipEnd?: boolean) => boolean,
  sound: Sound,
) {
  const dustCount = 120;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustDrift = Array.from({ length: dustCount }, () => ({
    x: (Math.random() - 0.5) * 12,
    y: Math.random() * 2.4 + 0.3,
    z: (Math.random() - 0.5) * 12,
    speed: 0.1 + Math.random() * 0.18,
    phase: Math.random() * Math.PI * 2,
  }));
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({
    color: 0xd8cba4,
    size: 0.035,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  scene.add(dust);

  // Fine radial threads and rings, placed in interior wall corners near the ceiling.
  const webVertices: number[] = [];
  const corners: Array<[number, number]> = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (MAP[y][x] === "#" || MAP[y][x] === "D" || MAP[y][x] === "E") continue;
      const left = isSolid(x - 1, y), right = isSolid(x + 1, y);
      const north = isSolid(x, y - 1), south = isSolid(x, y + 1);
      if ((left && north) || (right && north) || (left && south) || (right && south)) {
        corners.push([x, y]);
      }
    }
  }
  const webMaterial = new THREE.LineBasicMaterial({
    color: 0xb8b4a6,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const webs = new THREE.Group();
  for (const [x, y] of corners) {
    const centerX = cellToWorld(x);
    const centerZ = cellToWorld(y);
    const left = isSolid(x - 1, y), north = isSolid(x, y - 1);
    const cornerX = centerX + (left ? -1 : 1) * (CELL / 2 - 0.08);
    const cornerZ = centerZ + (north ? -1 : 1) * (CELL / 2 - 0.08);
    const roomX = centerX - (left ? -1 : 1) * 0.15;
    const roomZ = centerZ - (north ? -1 : 1) * 0.15;
    const dx = roomX - cornerX;
    const dz = roomZ - cornerZ;
    const length = 0.58;
    const vertices: number[] = [];

    for (let ray = 0; ray < 6; ray++) {
      const angle = (ray / 5) * Math.PI / 2;
      const ex = Math.cos(angle) * length;
      const ey = Math.sin(angle) * length;
      vertices.push(0, 0, 0, ex, ey, 0);
    }
    for (let ring = 1; ring <= 4; ring++) {
      const radius = (ring / 4) * length;
      const points = 12;
      for (let i = 0; i < points; i++) {
        const a1 = (i / points) * Math.PI / 2;
        const a2 = ((i + 1) / points) * Math.PI / 2;
        vertices.push(
          Math.cos(a1) * radius, Math.sin(a1) * radius, 0,
          Math.cos(a2) * radius, Math.sin(a2) * radius, 0,
        );
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    const web = new THREE.LineSegments(geometry, webMaterial);
    web.position.set(cornerX, 2.35, cornerZ);
    web.rotation.y = Math.atan2(dx, dz);
    webs.add(web);
  }
  scene.add(webs);

  // A translucent, smiling ghost briefly peeks into view, then fades away.
  const apparition = new THREE.Group();
  const ghostMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8edff,
    emissive: 0x9bc9ff,
    emissiveIntensity: 0.7,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const ghostBody = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), ghostMaterial);
  ghostBody.scale.set(0.72, 1.2, 0.65);
  ghostBody.position.y = 0.52;
  apparition.add(ghostBody);
  const ghostTail = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.42, 12),
    ghostMaterial,
  );
  ghostTail.position.y = 0.15;
  ghostTail.rotation.x = Math.PI;
  apparition.add(ghostTail);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x20263b });
  for (const x of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMaterial);
    eye.position.set(x, 0.59, 0.27);
    apparition.add(eye);
  }
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.012, 5, 12, Math.PI),
    eyeMaterial,
  );
  smile.position.set(0, 0.39, 0.28);
  smile.rotation.z = Math.PI;
  apparition.add(smile);
  apparition.visible = false;
  scene.add(apparition);

  let apparitionTimer = 16 + Math.random() * 8;
  let apparitionAge = 0;
  let musicTimer = 8 + Math.random() * 8;
  let creakTimer = 17 + Math.random() * 15;
  let time = 0;

  function startApparition() {
    const forwardX = -Math.sin(player.yaw);
    const forwardZ = -Math.cos(player.yaw);
    const sideX = Math.cos(player.yaw);
    const sideZ = -Math.sin(player.yaw);
    for (let attempt = 0; attempt < 8; attempt++) {
      const distance = 5 + Math.random() * 3;
      const side = (Math.random() - 0.5) * 3;
      const x = player.pos.x + forwardX * distance + sideX * side;
      const z = player.pos.z + forwardZ * distance + sideZ * side;
      const cellX = Math.floor(x / CELL);
      const cellY = Math.floor(z / CELL);
      if (isSolid(cellX, cellY) || !lineOfSight(player.pos.x, player.pos.z, x, z)) continue;
      apparition.position.set(x, 0, z);
      apparition.rotation.y = Math.atan2(player.pos.x - x, player.pos.z - z);
      apparition.visible = true;
      apparitionAge = 0;
      sound.ghostWhisper();
      return;
    }
  }

  function update(dt: number) {
    time += dt;
    for (let i = 0; i < dustCount; i++) {
      const mote = dustDrift[i];
      mote.y += Math.sin(time * 0.7 + mote.phase) * dt * 0.08;
      mote.x += Math.sin(time * 0.4 + mote.phase) * dt * mote.speed;
      mote.z += Math.cos(time * 0.35 + mote.phase) * dt * mote.speed;
      if (Math.abs(mote.x) > 6) mote.x *= -0.92;
      if (Math.abs(mote.z) > 6) mote.z *= -0.92;
      const offset = i * 3;
      dustPositions[offset] = player.pos.x + mote.x;
      dustPositions[offset + 1] = mote.y;
      dustPositions[offset + 2] = player.pos.z + mote.z;
    }
    dustGeometry.attributes.position.needsUpdate = true;

    apparitionTimer -= dt;
    if (apparitionTimer <= 0) {
      apparitionTimer = 28 + Math.random() * 24;
      startApparition();
    }
    if (apparition.visible) {
      apparitionAge += dt;
      const fadeIn = Math.min(1, apparitionAge / 0.25);
      const fadeOut = Math.min(1, Math.max(0, (2.1 - apparitionAge) / 0.5));
      ghostMaterial.opacity = 0.38 * Math.min(fadeIn, fadeOut);
      apparition.position.y = Math.sin(time * 2.5) * 0.08;
      if (apparitionAge >= 2.1) {
        apparition.visible = false;
        ghostMaterial.opacity = 0;
      }
    }

    musicTimer -= dt;
    if (musicTimer <= 0) {
      musicTimer = 10 + Math.random() * 12;
      sound.musicBox();
    }
    creakTimer -= dt;
    if (creakTimer <= 0) {
      creakTimer = 20 + Math.random() * 18;
      sound.houseCreak();
    }
  }

  return { update };
}
