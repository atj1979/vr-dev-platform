export const STARTER_CODE = `// Scene module. Runs in the sandboxed preview group.
// Signature: export default function (THREE, scene, ctx)
// Add meshes to scene. They are cleared on the next run.
// Return { update(dt, time), dispose() } or a dispose function.
// ctx.onFrame((dt, time) => {}) is called every frame.
// Use the THREE argument. Do not import 'three' from this module.

export default function (THREE, scene, ctx) {
  const rig = new THREE.Group();
  rig.name = 'beacon';

  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 1.2, 12),
    new THREE.MeshStandardMaterial({ color: 0xc4b39a, roughness: 0.55, metalness: 0.04 })
  );
  post.position.y = 0.6;
  rig.add(post);

  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 20, 14),
    new THREE.MeshStandardMaterial({
      color: 0xffb15a,
      emissive: 0xff7a1a,
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0
    })
  );
  lamp.position.y = 1.28;
  lamp.name = 'lamp';
  rig.add(lamp);

  scene.add(rig);

  return {
    update(dt, time) {
      lamp.position.y = 1.28 + Math.sin(time * 2) * 0.03;
      lamp.material.emissiveIntensity = 0.4 + Math.sin(time * 3) * 0.25;
    }
  };
}
`;

export const EMPTY_PARAMS = {
  type: 'object',
  additionalProperties: false,
  properties: {},
};

export const EDITOR_STATE = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'line', 'column'],
  properties: {
    text: { type: 'string', description: 'Full module source.' },
    line: { type: 'integer', minimum: 0 },
    column: { type: 'integer', minimum: 0 },
  },
};
