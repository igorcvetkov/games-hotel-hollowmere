import * as THREE from "three";
import { Sound } from "../audio";

export interface CharacterContext {
  scene: THREE.Scene;
  camera: THREE.Camera;
  player: { pos: THREE.Vector3; yaw: number; noise: number };
  sound: Sound;
  flags: { hasLight: boolean; flashOn: boolean };
  lampOn: boolean[];
  inv: Set<string>;
  box: (w: number, h: number, d: number, mat: THREE.Material, x?: number, y?: number, z?: number) => THREE.Mesh;
  lineOfSight: (ax: number, az: number, bx: number, bz: number, skipEnd?: boolean) => boolean;
  isSolid: (cx: number, cy: number) => boolean;
  say: (text: string, ms?: number) => void;
  caught: (by?: string) => void;
  objectiveSpot: () => { x: number; y: number };
  objective: () => string;
  hidden: boolean;
  grace: number;
  battery: number;
  zapT: number;
  freezeHint: boolean;
}
