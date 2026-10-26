import * as THREE from "three";
import { CELL, H, W, cellToWorld } from "../map";
import type { CharacterContext } from "./types";
import type { createConcierge } from "./concierge";
import type { createRollingEye } from "./rolling-eye";
type Concierge = ReturnType<typeof createConcierge>;
type RollingEye = ReturnType<typeof createRollingEye>;

export function createSparky(ctx: CharacterContext, monster: Concierge, eye: RollingEye) {
  const { scene, player, sound, flags, lineOfSight, box, say } = ctx;
  const eyeSay = eye.eyeSay;
  const $ = (id: string) => document.getElementById(id)!;
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
      ctx.battery = Math.max(0, ctx.battery - 30);
      flags.flashOn = false; ctx.zapT = 4; this.zapCd = 4;
      const z = $("zap");
      z.style.transition = "none"; z.style.opacity = "0.85";
      requestAnimationFrame(() => { z.style.transition = "opacity 0.9s"; z.style.opacity = "0"; });
      say("ZZZAP! Sparky munched your ctx.battery and shorted your flashlight!", 4500);
      this.state = "flee"; this.stateT = 7; this.path = [];
      let best = WANDER[0], bd = -1;
      for (const w of WANDER) { const d = Math.hypot(cellToWorld(w.x) - player.pos.x, cellToWorld(w.y) - player.pos.z); if (d > bd) { bd = d; best = w; } }
      this.target.set(cellToWorld(best.x), 1.3, cellToWorld(best.y));
    }

    update(dt: number) {
      this.zapCd = Math.max(0, this.zapCd - dt);
      const flashOn = flags.hasLight && flags.flashOn && ctx.battery > 0 && !ctx.hidden;
      const d0 = this.dist();
      const moving = player.noise > 0;
      const sensed = !ctx.hidden && d0 < 10 && (d0 < 4 || lineOfSight(this.pos.x, this.pos.z, player.pos.x, player.pos.z));

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
          if (this.stillT > 1.5 || ctx.hidden) { this.state = "sniff"; this.stateT = 4; this.target.set(player.pos.x, 1.3, player.pos.z); say("Sparky lost you. Stay still...", 2500); }
        }
      }

      if (this.state === "hunt") this.target.set(player.pos.x, 1.3, player.pos.z);
      else if (this.state === "wander") {
        const w = WANDER[this.wanderIdx];
        this.target.set(cellToWorld(w.x), 1.3, cellToWorld(w.y));
        if (Math.hypot(this.pos.x - this.target.x, this.pos.z - this.target.z) < 1.2 || (this.path.length === 0 && this.repath <= 0 && Math.random() < 0.02)) this.wanderIdx = (this.wanderIdx + 1 + Math.floor(Math.random() * 3)) % WANDER.length;
      }
      ctx.freezeHint = !ctx.hidden && (this.state === "investigate" || this.state === "sniff") && d0 < 10;

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

      if (!ctx.hidden && this.zapCd <= 0 && this.state === "hunt" && d0 < 1.1) this.zap();
    }
  }
  const sparky = new Sparky();
  return { sparky, get zapT() { return ctx.zapT; }, set zapT(value: number) { ctx.zapT = value; }, get freezeHint() { return ctx.freezeHint; } };
}
