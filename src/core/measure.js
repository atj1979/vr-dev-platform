import * as THREE from 'three';
import { ATTACHMENT_NAMES, round3 } from './assetSpec.js';

export function localBounds(root) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  let found = false;
  const inverse = new THREE.Matrix4();
  root.traverse((obj) => {
    if (!obj.isMesh || obj.userData?.helper || !obj.geometry) return;
    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
    const next = obj.geometry.boundingBox.clone();
    inverse.copy(root.matrixWorld).invert().multiply(obj.matrixWorld);
    next.applyMatrix4(inverse);
    if (!found) {
      box.copy(next);
      found = true;
    } else {
      box.union(next);
    }
  });
  return found ? box : null;
}

export function measureModel(root) {
  const box = localBounds(root);
  const attachments = {};
  const lod = [];
  const materials = new Set();
  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    if (obj !== root && obj.userData?.attachment && ATTACHMENT_NAMES.includes(obj.userData.attachment)) {
      const local = root.worldToLocal(obj.getWorldPosition(new THREE.Vector3()));
      attachments[obj.userData.attachment] = [round3(local.x), round3(local.y), round3(local.z)];
    }
    if (obj !== root && /_lod\d+$/.test(obj.name) && !obj.userData?.helper) lod.push(obj.name);
    if (obj.isMesh && !obj.userData?.helper && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of mats) {
        if (material?.name) materials.add(material.name);
      }
    }
  });
  if (!box) {
    return {
      footprint: { width: 1, depth: 1 },
      boundingRadius: 0,
      attachments,
      lod: [...new Set(lod)],
      materials: [...materials],
      size: { x: 0, y: 0, z: 0 },
      empty: true,
    };
  }
  const size = box.getSize(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  return {
    footprint: {
      width: Math.max(1, Math.ceil(size.x - 1e-4)),
      depth: Math.max(1, Math.ceil(size.z - 1e-4)),
    },
    boundingRadius: round3(sphere.radius || 0),
    attachments,
    lod: [...new Set(lod)],
    materials: [...materials],
    size: { x: round3(size.x), y: round3(size.y), z: round3(size.z) },
    empty: false,
  };
}

export function centeringDelta(root) {
  const box = localBounds(root);
  if (!box) return { x: 0, y: 0, z: 0 };
  return {
    x: round3(-((box.min.x + box.max.x) / 2)),
    y: round3(-box.min.y),
    z: round3(-((box.min.z + box.max.z) / 2)),
  };
}
