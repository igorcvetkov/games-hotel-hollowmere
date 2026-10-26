import * as THREE from "three";
import { CELL, MONSTER_START, PATROL, W, cellToWorld } from "../map";
import type { CharacterContext } from "./types";

export function createConcierge(ctx: CharacterContext) {
  const { scene, player, sound, lineOfSight, isSolid, box, caught } = ctx;
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
      if (ctx.hidden) return false;
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
      const heard = !ctx.hidden && this.dist() < player.noise;
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
      if (!ctx.hidden && ctx.grace <= 0 && this.dist() < 1.1) caught();
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
  return monster;
}
