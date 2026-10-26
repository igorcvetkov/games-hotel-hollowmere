import * as THREE from "three";
import { CELL, W, cellToWorld } from "../map";
import type { CharacterContext } from "./types";
import type { createConcierge } from "./concierge";
type Concierge = ReturnType<typeof createConcierge>;

export function createRollingEye(ctx: CharacterContext, monster: Concierge) {
  const { scene, camera, player, sound, objectiveSpot, objective } = ctx;
  const $ = (id: string) => document.getElementById(id)!;
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
    if (ctx.hidden) return;
    eyeState.hintT = 8;
    eyeSay(["Follow me! I know a shortcut!", "This way! Try to keep up, slowpoke!", "Roll roll roll! Follow the eyeball!"][eyeState.line++ % 3]
      + " Goal: " + objective(), 7000);
  }
  function eyeUpdate(dt: number) {
    const e = eyeState, t = performance.now() / 1000;
    eyeRoot.visible = !ctx.hidden;
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
    if (monster.dist() < 8 && !ctx.hidden) look.set(monster.pos.x, 1.8, monster.pos.z);
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
    if (e.warnT <= 0 && !ctx.hidden && (monster.state === "chase" || (monster.dist() < 6 && monster.stunT <= 0)) && monster.stunT <= 0) {
      e.warnT = 12;
      eyeSay(["EEK! He's coming! Hide in a wardrobe!", "Yikes, bell guy at 12 o'clock! Flash him!", "I didn't see anything! RUN!"][Math.floor(Math.random() * 3)], 4000);
    }
    e.chatT -= dt;
    if (e.chatT <= 0) { e.chatT = 30 + Math.random() * 20; eyeSay(eyeLines[e.lineT++ % eyeLines.length], 5000); }
  }
  return { eyeState, eyeUpdate, askEye, eyeSay };
}
