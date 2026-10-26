import * as THREE from "three";
import { CELL, H, MAP, W, cellToWorld } from "./map";

export function createMinimap(ctx: { player: { pos: THREE.Vector3; yaw: number }; flags: { boilerOpen: boolean; hasLight: boolean; codeKnown: boolean; power: boolean }; inv: Set<string>; monster: { pos: THREE.Vector3; dist(): number; state: string }; humman: { pos: THREE.Vector3; dist(): number; present(): boolean }; sparky: { pos: THREE.Vector3; dist(): number; awake(): boolean }; eyeHinting(): boolean; objectiveSpot(): { x: number; y: number }; lineOfSight: (ax: number, az: number, bx: number, bz: number, skipEnd?: boolean) => boolean }) {
  const { player, flags, monster, humman, sparky, eyeHinting, objectiveSpot, lineOfSight } = ctx;
  const mini = document.getElementById("mini") as HTMLCanvasElement;
  let bigMap = false;
  const seen: boolean[][] = MAP.map((r) => [...r].map(() => false));
  let revealT = 0;
  function reveal(dt: number) {
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
  function draw() {
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
    if (seen[spot.y][spot.x] || eyeHinting()) {
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
    if (humman.present() && humman.dist() < 14) {
      g.fillStyle = "#c6f";
      g.beginPath();
      g.arc(px(humman.pos.x), px(humman.pos.z), size * 0.5, 0, 7);
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
      g.fillText("Blue arrow = you  ·  Yellow = goal  ·  Red = Concierge  ·  Cyan = Sparky  ·  Purple = Humman  ·  M = close", 10, mini.height - 10);
    }
  }


return { toggle() { bigMap = !bigMap; }, reveal, draw };
}
