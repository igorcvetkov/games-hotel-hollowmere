import * as THREE from "three";
import { Sound } from "./audio";
import { createWorld } from "./world";
import { createDecor } from "./decor";
import { buildPickupModel, cylMesh, M } from "./pickup-models";
import { createMinimap } from "./minimap";
import { createCharacters } from "./characters";
import { createAtmosphere } from "./atmosphere";
import { CELL, MONSTER_START, START, cellToWorld } from "./map";

const $ = (id: string) => document.getElementById(id)!;
const sound = new Sound();

const { renderer, scene, camera, ambient, flashlight, solid, isSolid, lamps, lampOn, bulbMats, woodMat, metalMat } = createWorld();
const decor = createDecor(scene, solid);

// ---------- game state ----------
const inv = new Set<string>();
const flags = { power: false, codeKnown: false, safeOpen: false, boilerOpen: false, hasLight: false, flashOn: false, won: false, dead: false };
let battery = 100;
let zapT = 0;
let freezeHint = false;

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
function pickup(cx: number, cy: number, id: string, name: string, color: number, text?: string, size = 0.45) {
  const o = new THREE.Group();
  const model = buildPickupModel(id);
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
const boilerDoor = placeAt(box(0.3, 2.8, CELL, new THREE.MeshStandardMaterial({ color: 0x3a1f1f }), 0, 0, 0), 15, 4, 1.4);
decor.dressBoilerDoor(boilerDoor);
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
const exitDoor = placeAt(box(CELL, 2.8, 0.3, new THREE.MeshStandardMaterial({ color: 0x5a3a1a }), 0, 0, 0), 5, 13, 1.4);
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
const touchInput = { x: 0, y: 0, run: false };
const isTouchDevice = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

function collide(x: number, z: number, r = 0.4) {
  const minX = Math.floor((x - r) / CELL), maxX = Math.floor((x + r) / CELL);
  const minY = Math.floor((z - r) / CELL), maxY = Math.floor((z + r) / CELL);
  for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) if (isSolid(cx, cy)) return true;
  return decor.blocked(x, z, r);
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

const characters = createCharacters({
  scene, camera, player, sound, flags, lampOn, inv, box, lineOfSight, isSolid, say, caught, objectiveSpot,
  objective,
  get hidden() { return hidden; }, set hidden(value: boolean) { hidden = value; },
  get grace() { return grace; }, set grace(value: number) { grace = value; },
  get battery() { return battery; }, set battery(value: number) { battery = value; },
  get zapT() { return zapT; }, set zapT(value: number) { zapT = value; },
  get freezeHint() { return freezeHint; }, set freezeHint(value: boolean) { freezeHint = value; },
});
const { monster, sparky, humman, bats, eyeState, eyeUpdate, askEye, eyeSay } = characters;
const atmosphere = createAtmosphere(scene, player, isSolid, lineOfSight, sound);

// ---------- UI helpers ----------
let padOpen = false;
let padCb: (() => void) | null = null;
let padCode = "";
function openPad(title: string, code: string, ok: () => void) {
  padOpen = true; padCb = ok; padCode = code;
  if (isTouchDevice) $("touch-controls").hidden = true;
  $("padTitle").textContent = title;
  ($("padIn") as HTMLInputElement).value = "";
  $("pad").style.display = "block";
  document.exitPointerLock();
  setTimeout(() => $("padIn").focus(), 50);
}
function closePad() {
  padOpen = false;
  $("pad").style.display = "none";
  if (isTouchDevice) $("touch-controls").hidden = false;
  else renderer.domElement.requestPointerLock();
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
function caught(by = "The Concierge") {
  sound.sting();
  grace = 6;
  $("blood").style.opacity = "0.7";
  setTimeout(() => ($("blood").style.opacity = "0"), 600);
  player.pos.set(cellToWorld(START.x), 1.6, cellToWorld(START.y));
  monster.pos.set(cellToWorld(MONSTER_START.x), 0, cellToWorld(MONSTER_START.y));
  monster.state = "patrol";
  monster.path = [];
  say(by === "Humman" ? "Humman hugged you way too hard and carried you back to your cell! Switch off a light to make him melt." : "The Concierge dragged you back to your cell! Listen for his bell and hide in a wardrobe.", 5000);
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
  const hx = humman.pos.x - player.pos.x, hz = humman.pos.z - player.pos.z, hd = Math.hypot(hx, hz);
  if (humman.present() && hd < 8 && (hx * dir.x + hz * dir.z) / hd > 0.6 && lineOfSight(player.pos.x, player.pos.z, humman.pos.x, humman.pos.z)) {
    humman.stun(4); grace = Math.max(grace, 2);
    say("ZAP! Humman is dizzy! Run!", 3000);
  }
}
addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && !(e.target as HTMLElement).closest("#touch-controls")) lightFlash();
});

// ---------- input ----------
function beginGame(pointerType?: string) {
  if (!started) { started = true; sound.start(); }
  sound.resume();
  if (pointerType === "touch" || (!pointerType && isTouchDevice)) {
    running = true;
    $("overlay").style.display = "none";
  } else {
    renderer.domElement.requestPointerLock();
  }
}

$("overlay").onclick = (e) => {
  beginGame(e instanceof PointerEvent ? e.pointerType : undefined);
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

let lookPointer: number | null = null;
let lastLookX = 0;
let lastLookY = 0;
document.addEventListener("pointerdown", (e) => {
  if (!isTouchDevice || !running || padOpen || e.pointerType !== "touch") return;
  if ((e.target as HTMLElement).closest("#touch-controls")) return;
  lookPointer = e.pointerId;
  lastLookX = e.clientX;
  lastLookY = e.clientY;
});
document.addEventListener("pointermove", (e) => {
  if (e.pointerId !== lookPointer || !running || padOpen) return;
  const dx = e.clientX - lastLookX;
  const dy = e.clientY - lastLookY;
  lastLookX = e.clientX;
  lastLookY = e.clientY;
  player.yaw -= dx * 0.004;
  player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch - dy * 0.004));
});
const endLook = (e: PointerEvent) => {
  if (e.pointerId === lookPointer) lookPointer = null;
};
document.addEventListener("pointerup", endLook);
document.addEventListener("pointercancel", endLook);

function useInteract() {
  if (!running || padOpen) return;
  if (hidden) { leaveHide(); return; }
  if (target) target.use();
}
function toggleFlashlight() {
  if (!running || padOpen || !flags.hasLight || hidden) return;
  if (characters.zapT > 0) { sound.error(); say("Flashlight is short-circuited for a moment!", 1500); }
  else {
    flags.flashOn = !flags.flashOn;
    sound.click();
    if (flags.flashOn && sparky.dist() < 16) sparky.lure(player.pos);
  }
}
function toggleMap() {
  if (running) minimap.toggle();
}

if (isTouchDevice) {
  const controls = $("touch-controls");
  controls.hidden = false;
  const stick = $("move-stick");
  const knob = $("move-knob");
  let stickPointer: number | null = null;
  function updateStick(e: PointerEvent) {
    const rect = stick.getBoundingClientRect();
    const radius = rect.width * 0.34;
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    const scale = length > radius ? radius / length : 1;
    touchInput.x = Math.max(-1, Math.min(1, dx * scale / radius));
    touchInput.y = Math.max(-1, Math.min(1, dy * scale / radius));
    knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  }
  stick.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    stickPointer = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    updateStick(e);
  });
  stick.addEventListener("pointermove", (e) => {
    if (e.pointerId === stickPointer) updateStick(e);
  });
  const releaseStick = (e: PointerEvent) => {
    if (e.pointerId !== stickPointer) return;
    stickPointer = null;
    touchInput.x = 0;
    touchInput.y = 0;
    knob.style.transform = "translate(0, 0)";
  };
  stick.addEventListener("pointerup", releaseStick);
  stick.addEventListener("pointercancel", releaseStick);

  $("touch-run").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    touchInput.run = !touchInput.run;
    $("touch-run").classList.toggle("active", touchInput.run);
  });
  $("touch-interact").addEventListener("pointerdown", (e) => { e.preventDefault(); useInteract(); });
  $("touch-flashlight").addEventListener("pointerdown", (e) => { e.preventDefault(); toggleFlashlight(); });
  $("touch-zap").addEventListener("pointerdown", (e) => { e.preventDefault(); lightFlash(); });
  $("touch-map").addEventListener("pointerdown", (e) => { e.preventDefault(); toggleMap(); });
  $("touch-help").addEventListener("pointerdown", (e) => { e.preventDefault(); if (running) askEye(); });
  $("touch-pause").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!running) return;
    running = false;
    touchInput.x = 0;
    touchInput.y = 0;
    touchInput.run = false;
    $("touch-run").classList.remove("active");
    knob.style.transform = "translate(0, 0)";
    $("ovText").innerHTML = "Paused. <i>Tap to continue</i>";
    $("overlay").style.display = "flex";
  });
}

addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "KeyM" && running) toggleMap();
  if (!running || padOpen) return;
  if (e.code === "KeyF") toggleFlashlight();
  if (e.code === "KeyQ") lightFlash();
  if (e.code === "KeyH") askEye();
  if (e.code === "KeyE") useInteract();
});
addEventListener("keyup", (e) => {
  keys[e.code] = false;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") touchInput.run = false;
});

function objectiveSpot(): { x: number; y: number } {
  if (!flags.hasLight) return { x: 2, y: 5 };
  if (!flags.codeKnown) return { x: 2, y: 11 };
  if (!inv.has("boilerkey") && !flags.boilerOpen) return { x: 11, y: 1 };
  if (!inv.has("fuse") && !flags.power) return flags.boilerOpen ? { x: 21, y: 1 } : { x: 15, y: 4 };
  if (!flags.power) return { x: 22, y: 11 };
  if (!inv.has("brasskey")) return { x: 14, y: 12 };
  return { x: 5, y: 13 };
}

const minimap = createMinimap({
  player, flags, inv, monster, humman, sparky,
  eyeHinting: () => eyeState.hintT > 0,
  objectiveSpot,
  lineOfSight,
});

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
  minimap.draw();
}

function update(dt: number) {
  let moving = false;
  const run = !!(keys.ShiftLeft || keys.ShiftRight);
  if (!hidden && !padOpen) {
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - touchInput.y;
    const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + touchInput.x;
    if (f || s) {
      moving = true;
      const len = Math.hypot(f, s);
      const speed = run || touchInput.run ? 5.2 : 2.9;
      const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
      const vx = (-sin * f + cos * s) / len * speed * dt;
      const vz = (-cos * f - sin * s) / len * speed * dt;
      if (!collide(player.pos.x + vx, player.pos.z)) player.pos.x += vx;
      if (!collide(player.pos.x, player.pos.z + vz)) player.pos.z += vz;
      player.stepDist += speed * dt;
      if (player.stepDist > (run || touchInput.run ? 1.7 : 1.5)) { player.stepDist = 0; sound.step(run || touchInput.run); }
    }
  }
  player.noise = moving ? (run || touchInput.run ? 9 : 3) : 0;
  player.pos.y = hidden ? 1.4 : 1.6 + (moving ? Math.sin(performance.now() / (run || touchInput.run ? 110 : 170)) * 0.04 : 0);

  // flashlight + battery
  const on = flags.hasLight && flags.flashOn && battery > 0 && !hidden;
  if (on) battery = Math.max(0, battery - dt * 0.6);
  const flick = battery < 15 && Math.random() < 0.15 ? 0.2 : 1;
  flashlight.intensity = on ? 30 * flick : 0;
  if (flags.hasLight && battery <= 0 && flags.flashOn) { say("The flashlight died."); flags.flashOn = false; }

  pickupModels.forEach((h, i) => { h.rotation.y += dt * 1.2; h.position.y = 0.55 + Math.sin(performance.now() / 500 + i) * 0.04; });
  monster.update(dt);
  sparky.update(dt);
  humman.update(dt);
  const batTime = performance.now() / 1000;
  bats.update(dt, batTime);
  atmosphere.update(dt);
  characters.zapT = Math.max(0, characters.zapT - dt);
  playT += dt;
  if (playT > 25 && !sparkyWarned) { sparkyWarned = true; eyeSay("See the light switch on the wall? Flip it with E... but Sparky the electric ghost LOVES electricity and will float over. If he does: FREEZE, don't move!", 11000); }
  eyeUpdate(dt);
  minimap.reveal(dt);
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
  $("freeze").style.opacity = characters.freezeHint ? "1" : "0";
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
  (window as any).__dbg = { player, sparky, humman, monster, flags, lampOn, start: () => { running = true; $("overlay").style.display = "none"; if (!started) { started = true; sound.start(); } }, ents, keys };
}
