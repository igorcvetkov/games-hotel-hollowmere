import * as THREE from "three";
import { CELL, H, W, cellToWorld } from "../map";
import type { CharacterContext } from "./types";
import type { createConcierge } from "./concierge";
import type { createRollingEye } from "./rolling-eye";
type Concierge = ReturnType<typeof createConcierge>;
type RollingEye = ReturnType<typeof createRollingEye>;

export function createHumman(ctx: CharacterContext, monster: Concierge, eye: RollingEye) {
  const { scene, player, sound, lampOn, lineOfSight, isSolid, box, say, caught } = ctx;
  const eyeSay = eye.eyeSay;
  // ---------- Humman: a tall, black, humming goofball who appears when ALL the lights are on ----------
  class Humman {
    mesh = new THREE.Group();
    state: "absent" | "rising" | "hunt" | "stumble" | "confused" | "melt" = "absent";
    pos = new THREE.Vector3();
    lastSeen = new THREE.Vector3();
    path: { x: number; y: number }[] = [];
    repath = 0; stateT = 0; spawnT = 0; cool = 0; stumbleT = 9; humT = 0; phase = 0; stunT = 0; grow = 0; note = 0; thumped = false;
    torso = new THREE.Group(); head = new THREE.Group();
    armL = new THREE.Group(); armR = new THREE.Group(); legL = new THREE.Group(); legR = new THREE.Group();
    pupils: THREE.Mesh[] = [];
    readonly base = 0.8;

    constructor() {
      const black = new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 0.5, metalness: 0.1 });
      const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const red = new THREE.MeshStandardMaterial({ color: 0xcc1133, roughness: 0.6 });
      const cyl = (rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 14), m);
        c.position.set(x, y, z);
        return c;
      };
      // very long legs with huge clown shoes
      for (const [g, sx] of [[this.legL, -1], [this.legR, 1]] as [THREE.Group, number][]) {
        g.position.set(sx * 0.16, 1.3, 0);
        g.add(cyl(0.07, 0.05, 1.3, black, 0, -0.65, 0));
        g.add(box(0.2, 0.1, 0.5, black, 0, -1.27, 0.12));
        this.mesh.add(g);
      }
      // skinny torso with a tiny red bow tie
      this.torso.position.y = 1.3;
      this.torso.add(cyl(0.2, 0.15, 1.1, black, 0, 0.55, 0));
      const bow = new THREE.Group();
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.15, 8), red);
        w.rotation.z = sx * Math.PI / 2; w.position.x = sx * 0.07;
        bow.add(w);
      }
      bow.position.set(0, 1.08, 0.17);
      this.torso.add(bow);
      this.torso.add(cyl(0.06, 0.07, 0.3, black, 0, 1.2, 0));
      // arms down to the knees, with big white cartoon gloves
      for (const [g, sx] of [[this.armL, -1], [this.armR, 1]] as [THREE.Group, number][]) {
        g.position.set(sx * 0.27, 1.0, 0);
        g.add(cyl(0.06, 0.05, 0.9, black, 0, -0.45, 0), cyl(0.05, 0.04, 0.9, black, 0, -1.35, 0));
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), white).translateY(-1.85));
        this.torso.add(g);
      }
      // big head: googly eyes, huge toothy grin, crooked top hat with a flower
      this.head.position.y = 1.65;
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), black);
      skull.scale.set(1.1, 1, 1);
      this.head.add(skull);
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), new THREE.MeshBasicMaterial({ color: 0xff1a1a }));
        eye.position.set(sx * 0.16, 0.07, 0.27);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        pupil.position.set(sx * 0.16, 0.07, 0.38);
        this.pupils.push(pupil);
        this.head.add(eye, pupil);
      }
      const grin = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 6, 18, Math.PI), white);
      grin.position.set(0, -0.02, 0.3); grin.rotation.z = Math.PI;
      this.head.add(grin);
      for (let i = -4; i <= 4; i++) {
        const t = box(0.035, 0.06, 0.03, white, i * 0.043, -0.15 + (Math.abs(i) * Math.abs(i)) * 0.006, 0.31 - Math.abs(i) * 0.012);
        this.head.add(t);
      }
      const hat = new THREE.Group();
      hat.add(cyl(0.4, 0.4, 0.03, black, 0, 0, 0), cyl(0.22, 0.24, 0.45, black, 0, 0.24, 0), cyl(0.245, 0.245, 0.08, red, 0, 0.08, 0));
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffdd33 }));
      flower.position.set(0.22, 0.12, 0.12);
      hat.add(flower);
      hat.position.set(-0.03, 0.3, 0); hat.rotation.z = 0.28;
      this.head.add(hat);
      this.torso.add(this.head);
      this.mesh.add(this.torso);
      this.mesh.visible = false;
      scene.add(this.mesh);
    }

    present() { return this.state !== "absent"; }
    dist() { return Math.hypot(this.pos.x - player.pos.x, this.pos.z - player.pos.z); }

    spawn() {
      let best: THREE.Vector3 | null = null;
      for (let i = 0; i < 80 && !best; i++) {
        const cx = Math.floor(Math.random() * W), cy = Math.floor(Math.random() * H);
        if (isSolid(cx, cy)) continue;
        const x = cellToWorld(cx), z = cellToWorld(cy), d = Math.hypot(x - player.pos.x, z - player.pos.z);
        if (d > 10 && d < 22 && !lineOfSight(x, z, player.pos.x, player.pos.z)) best = new THREE.Vector3(x, 0, z);
      }
      if (!best) return;
      this.pos.copy(best); this.state = "rising"; this.stateT = 2.2; this.grow = 0; this.stumbleT = 8; this.path = [];
      this.mesh.visible = true; this.lastSeen.copy(player.pos);
      sound.hummanRise();
      eyeSay("HUMMAN! He shows up when ALL the lights are on! Flip a switch OFF and he melts away! (Or run. He trips a lot.)", 9000);
    }
    startMelt(cool = 3) { this.state = "melt"; this.stateT = 1.3; this.cool = cool; }
    stun(sec: number) { this.stunT = sec; sound.growl(); }

    update(dt: number) {
      const allOn = lampOn.every(Boolean);
      if (this.state === "absent") {
        this.cool = Math.max(0, this.cool - dt);
        this.spawnT = allOn && this.cool <= 0 ? this.spawnT + dt : allOn ? this.spawnT : 0;
        if (this.spawnT > 4) { this.spawnT = 0; this.spawn(); }
        return;
      }
      const t = performance.now() / 1000;
      if (!allOn && this.state !== "melt") {
        this.startMelt();
        say("A light went out - Humman melts into the shadows!", 3500);
      }
      this.mesh.position.set(this.pos.x, 0, this.pos.z);
      const b = this.base;

      if (this.state === "rising") {
        this.stateT -= dt;
        this.grow = 1 - Math.max(0, this.stateT) / 2.2;
        if (this.stateT <= 0) {
          this.state = "hunt";
          this.repath = 0;
          this.stumbleT = 8;
        }
      } else if (this.state === "melt") {
        this.stateT -= dt; this.grow = Math.max(0, this.stateT / 1.3);
        if (this.stateT <= 0) { this.state = "absent"; this.mesh.visible = false; this.rig(0); return; }
      } else this.grow = 1;
      this.rig(this.grow);

      let speed = 0;
      if (this.state === "hunt" || this.state === "confused") {
        this.stumbleT -= dt;
        if (this.state === "hunt" && this.stumbleT <= 0) { this.state = "stumble"; this.stateT = 1.9; this.stumbleT = 7 + Math.random() * 5; this.thumped = false; }
        const sees = !ctx.hidden && this.dist() < 14 && lineOfSight(this.pos.x, this.pos.z, player.pos.x, player.pos.z);
        if (!ctx.hidden) this.lastSeen.copy(player.pos);
        if (this.state === "confused") {
          this.stateT -= dt;
          if (!ctx.hidden && sees) this.state = "hunt";
          else if (this.stateT <= 0) { this.startMelt(10); say("Humman got bored and wandered off...", 3000); }
        } else if (this.stunT > 0) {
          this.stunT -= dt;
        } else {
          const d = Math.hypot(this.pos.x - this.lastSeen.x, this.pos.z - this.lastSeen.z);
          if (ctx.hidden && d < 1.6) { this.state = "confused"; this.stateT = 3.5; }
          this.repath -= dt;
          if (this.repath <= 0) {
            this.repath = 0.4;
            this.path = monster.bfs(Math.floor(this.pos.x / CELL), Math.floor(this.pos.z / CELL), Math.floor(this.lastSeen.x / CELL), Math.floor(this.lastSeen.z / CELL));
          }
          const next = this.path.length > 1 ? this.path[1] : null;
          let tx = this.lastSeen.x, tz = this.lastSeen.z;
          if (next && !(sees && d < CELL * 2)) { tx = cellToWorld(next.x); tz = cellToWorld(next.y); }
          const dx = tx - this.pos.x, dz = tz - this.pos.z, dd = Math.hypot(dx, dz);
          speed = 2.3;
          if (dd > 0.05) {
            this.pos.x += (dx / dd) * Math.min(speed * dt, dd);
            this.pos.z += (dz / dd) * Math.min(speed * dt, dd);
            this.mesh.rotation.y = Math.atan2(dx, dz);
          }
          if (!ctx.hidden && ctx.grace <= 0 && this.dist() < 1.2) { caught("Humman"); this.startMelt(10); }
        }
      }

      // animation
      this.phase += speed * dt * 2.2;
      const sw = Math.min(1, speed / 1.5) * 0.7;
      this.legL.rotation.x = Math.sin(this.phase) * sw;
      this.legR.rotation.x = -Math.sin(this.phase) * sw;
      this.armL.rotation.x = -Math.sin(this.phase) * sw * 0.8;
      this.armR.rotation.x = Math.sin(this.phase) * sw * 0.8;
      this.armL.rotation.z = 0.12 + Math.sin(t * 2) * 0.05; this.armR.rotation.z = -0.12 - Math.sin(t * 2.3) * 0.05;
      this.torso.rotation.x = 0.22 + Math.sin(this.phase * 2) * 0.03;
      this.torso.rotation.z = Math.sin(this.phase) * 0.06;
      this.head.rotation.z = Math.sin(t * 1.7) * 0.2;
      this.head.rotation.x = 0.1;
      this.mesh.rotation.x = 0;
      if (this.state === "stumble") {
        this.stateT -= dt;
        const p = 1 - Math.max(0, this.stateT) / 1.9;
        const tilt = p < 0.3 ? p / 0.3 : p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
        this.mesh.rotation.x = Math.max(0, tilt) * 1.45;
        this.armL.rotation.x = this.armR.rotation.x = -tilt * 2.4;
        if (p > 0.3 && !this.thumped) { this.thumped = true; sound.thump(Math.max(0, 1 - this.dist() / 14)); }
        if (this.stateT <= 0) { this.state = "hunt"; sound.boing(Math.max(0, 1 - this.dist() / 14)); }
      }
      if (this.stunT > 0) {
        this.head.rotation.y = Math.sin(t * 25) * 0.6;
        this.mesh.rotation.y += dt * 7;
      }
      // red eyes scan from side to side; pupils stay on the eyeball surface
      const scan = Math.sin(t * 2.4) * 0.08;
      this.pupils.forEach((p, i) => {
        p.position.set((i === 0 ? -0.16 : 0.16) + scan, 0.07, 0.27 + Math.sqrt(0.13 * 0.13 - scan * scan) - 0.01);
      });

      // off-key humming gets louder as he approaches
      this.humT -= dt;
      if (this.humT <= 0 && this.state !== "melt") { this.humT = 0.6; sound.hum(Math.max(0, 1 - this.dist() / 18), this.note++); }
      void b;
    }

    rig(g: number) {
      const b = this.base;
      this.mesh.scale.set(b * (0.5 + 0.5 * g), b * g, b * (0.5 + 0.5 * g));
    }
  }
  const humman = new Humman();
  return humman;
}
