import * as THREE from "three";

export function M(color: number, rough: number, metal: number, emissive = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: emissive ? 0.8 : 0 });
}
export function cylMesh(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 20) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  c.position.set(x, y, z);
  return c;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

// Models lie along the X axis (like on a table); y is up.
export function buildPickupModel(id: string): THREE.Group {
  const g = new THREE.Group();
  if (id === "flashlight") {
    const body = M(0x1d2a38, 0.35, 0.7), chrome = M(0xc8ccd0, 0.15, 1), rubber = M(0x0e0e0e, 0.9, 0);
    const parts = new THREE.Group();
    parts.add(cylMesh(0.05, 0.05, 0.3, body, -0.05, 0, 0));
    for (let i = 0; i < 7; i++) parts.add(cylMesh(0.054, 0.054, 0.012, rubber, -0.14 + i * 0.03, 0, 0)); // grip rings
    parts.add(cylMesh(0.052, 0.052, 0.03, chrome, -0.21, 0, 0));
    parts.add(cylMesh(0.054, 0.054, 0.04, chrome, -0.225, 0, 0)); // tail cap
    parts.add(cylMesh(0.085, 0.055, 0.1, chrome, 0.14, 0, 0)); // head
    parts.add(cylMesh(0.09, 0.09, 0.015, rubber, 0.195, 0, 0)); // bezel
    const lens = cylMesh(0.075, 0.075, 0.012, new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 0.9, roughness: 0.05 }), 0.2, 0, 0);
    parts.add(lens);
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.015, 0.025), M(0xcc2222, 0.5, 0.2));
    sw.position.set(-0.1, 0.055, 0);
    parts.add(sw);
    parts.rotation.z = 0;
    parts.position.y = 0.09;
    g.add(parts);
  } else if (id === "battery") {
    const parts = new THREE.Group();
    parts.add(cylMesh(0.06, 0.06, 0.26, M(0xc9a227, 0.35, 0.6), 0, 0, 0)); // gold casing
    parts.add(cylMesh(0.0605, 0.0605, 0.15, M(0x111111, 0.6, 0.1), 0, 0, 0)); // black label
    parts.add(cylMesh(0.0608, 0.0608, 0.03, M(0xdd2222, 0.5, 0.1), 0, 0.04, 0)); // red stripe
    parts.add(cylMesh(0.025, 0.025, 0.03, M(0xd0d0d0, 0.2, 1), 0, 0.14, 0)); // + terminal
    parts.rotation.z = Math.PI / 2;
    parts.position.y = 0.065;
    g.add(parts);
  } else if (id === "fuse") {
    const parts = new THREE.Group();
    parts.add(cylMesh(0.05, 0.05, 0.22, M(0xe8e2d2, 0.25, 0.1), 0, 0, 0)); // ceramic
    parts.add(cylMesh(0.056, 0.056, 0.05, M(0xb87333, 0.3, 0.9), 0, 0.115, 0)); // copper caps
    parts.add(cylMesh(0.056, 0.056, 0.05, M(0xb87333, 0.3, 0.9), 0, -0.115, 0));
    parts.add(cylMesh(0.008, 0.008, 0.2, M(0xaaaaaa, 0.2, 1), 0, 0, 0)); // wire
    parts.rotation.z = Math.PI / 2;
    parts.position.y = 0.06;
    g.add(parts);
  } else {
    g.add(box(0.3, 0.1, 0.3, M(0xcccccc, 0.5, 0.2), 0, 0.05, 0));
  }
  return g;
}
