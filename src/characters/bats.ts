import * as THREE from "three";
import { cellToWorld as worldCellToWorld } from "../map";

export function createBats(scene: THREE.Scene, player: { pos: THREE.Vector3 }, cellToWorld = worldCellToWorld) {
  // harmless little flocks that flutter through the hotel
  class Bat {
    mesh = new THREE.Group();
    leftWing = new THREE.Group();
    rightWing = new THREE.Group();
    phase: number;
    speed: number;
    radiusX: number;
    radiusZ: number;
    homeX: number;
    homeZ: number;
    height: number;
    scene: THREE.Scene;
    player: { pos: THREE.Vector3 };
    cellToWorld: (cell: number) => number;
    scatterX = 0;
    scatterZ = 0;

    constructor(scene: THREE.Scene, player: { pos: THREE.Vector3 }, cellToWorld: (cell: number) => number, homeX: number, homeZ: number, index: number) {
      this.scene = scene;
      this.player = player;
      this.cellToWorld = cellToWorld;
      this.homeX = homeX;
      this.homeZ = homeZ;
      this.phase = index * 2.1 + Math.random() * Math.PI * 2;
      this.speed = 0.7 + Math.random() * 0.35;
      this.radiusX = 0.45 + Math.random() * 0.4;
      this.radiusZ = 0.35 + Math.random() * 0.35;
      this.height = 2.15 + Math.random() * 0.45;

      const fur = new THREE.MeshStandardMaterial({ color: 0x241b2a, roughness: 0.95 });
      const wingMat = new THREE.MeshStandardMaterial({ color: 0x38253a, roughness: 0.8, side: THREE.DoubleSide });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), fur);
      body.scale.set(0.8, 1, 1.4);
      this.mesh.add(body);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), fur);
      head.position.set(0, 0.04, 0.13);
      this.mesh.add(head);
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 5), fur);
        ear.position.set(side * 0.055, 0.14, 0.13);
        ear.rotation.z = side * -0.2;
        this.mesh.add(ear);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), eyeMat);
        eye.position.set(side * 0.035, 0.05, 0.205);
        this.mesh.add(eye);
      }
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0);
      wingShape.lineTo(0.06, 0.24);
      wingShape.quadraticCurveTo(0.2, 0.39, 0.36, 0.31);
      wingShape.quadraticCurveTo(0.29, 0.2, 0.43, 0.12);
      wingShape.quadraticCurveTo(0.27, 0.13, 0.25, -0.03);
      wingShape.quadraticCurveTo(0.13, 0.08, 0, -0.08);
      wingShape.closePath();
      const wingGeo = new THREE.ShapeGeometry(wingShape);
      this.leftWing.position.set(-0.05, 0.02, 0);
      this.leftWing.scale.x = -1;
      this.leftWing.add(new THREE.Mesh(wingGeo, wingMat));
      this.rightWing.position.set(0.05, 0.02, 0);
      this.rightWing.add(new THREE.Mesh(wingGeo, wingMat));
      this.mesh.add(this.leftWing, this.rightWing);
      this.scene.add(this.mesh);
    }

    update(dt: number, time: number) {
      this.phase += dt * this.speed;
      const angle = this.phase;
      const baseX = this.cellToWorld(this.homeX) + Math.cos(angle) * this.radiusX;
      const baseZ = this.cellToWorld(this.homeZ) + Math.sin(angle) * this.radiusZ;
      const dx = baseX + this.scatterX - this.player.pos.x;
      const dz = baseZ + this.scatterZ - this.player.pos.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 2.2) {
        this.scatterX += (dx / (distance || 1)) * dt * 2;
        this.scatterZ += (dz / (distance || 1)) * dt * 2;
        const scatterDistance = Math.hypot(this.scatterX, this.scatterZ);
        if (scatterDistance > 1.8) {
          this.scatterX *= 1.8 / scatterDistance;
          this.scatterZ *= 1.8 / scatterDistance;
        }
      } else {
        this.scatterX *= Math.exp(-dt * 1.2);
        this.scatterZ *= Math.exp(-dt * 1.2);
      }
      this.mesh.position.set(
        baseX + this.scatterX,
        this.height + Math.sin(angle * 2.3) * 0.12 + Math.min(0.2, Math.hypot(this.scatterX, this.scatterZ) * 0.1),
        baseZ + this.scatterZ,
      );
      this.mesh.rotation.y = angle + Math.PI / 2;
      const flap = Math.sin(time * 15 + this.phase * 4) * 0.9;
      this.leftWing.rotation.z = flap;
      this.rightWing.rotation.z = -flap;
    }
  }

  const batRoosts: [number, number, number][] = [
    [3, 2, 3],
    [10, 2, 3],
    [19, 2, 3],
    [10, 7, 3],
    [3, 11, 3],
    [19, 11, 3],
  ];
  const flock = batRoosts.flatMap(([x, y, count]) =>
    Array.from({ length: count }, (_, i) => new Bat(scene, player, cellToWorld, x, y, i)),
  );
  return { update(dt: number, time: number) { flock.forEach((bat) => bat.update(dt, time)); } };
}
