import * as THREE from 'three';

export function createRoom() {
  const group = new THREE.Group();
  group.name = 'room';

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    new THREE.MeshStandardMaterial({ color: 0x2c3134, roughness: 0.95, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const grid = new THREE.GridHelper(10, 10, 0x6ec8c0, 0x3e4748);
  grid.position.y = 0.004;
  const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const material of materials) {
    material.transparent = true;
    material.opacity = 0.45;
  }
  group.add(grid);

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 4.5),
    new THREE.MeshStandardMaterial({ color: 0x15191c, roughness: 1, metalness: 0 }),
  );
  backdrop.position.set(0, 2.1, -3.2);
  group.add(backdrop);

  const hemi = new THREE.HemisphereLight(0xc9d5d1, 0x3a332c, 0.8);
  const sun = new THREE.DirectionalLight(0xfff4e5, 1.35);
  sun.position.set(3.2, 6.4, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const shadow = sun.shadow.camera;
  shadow.near = 0.5;
  shadow.far = 18;
  shadow.left = -7;
  shadow.right = 7;
  shadow.top = 7;
  shadow.bottom = -7;
  group.add(hemi, sun);

  return group;
}

export function createPlate(color, label) {
  const group = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.04, 2.2),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02 }),
  );
  slab.position.y = 0.02;
  slab.receiveShadow = true;
  group.add(slab);
  if (label) {
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.22, 10),
      new THREE.MeshStandardMaterial({ color: 0x4aa3e8, roughness: 0.4 }),
    );
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.12, 0.85);
    group.add(arrow);
  }
  return group;
}
