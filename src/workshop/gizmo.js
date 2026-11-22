import * as THREE from 'three';

const AXIS = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

const COLOR = { x: 0xe25b45, y: 0x7dce6a, z: 0x4aa3e8 };

function addHandle(group, visible, hit, meta) {
  hit.userData = { kind: 'gizmo', ...meta };
  visible.userData = { kind: 'gizmo', ...meta, visual: true };
  group.add(hit);
  group.add(visible);
}

export function createGizmo() {
  const group = new THREE.Group();
  group.name = 'gizmo';
  const invisible = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  for (const axis of ['x', 'y', 'z']) {
    const color = new THREE.MeshBasicMaterial({ color: COLOR[axis], toneMapped: false });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.38, 8), color);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.14, 10), color);
    head.position.y = 0.26;
    shaft.add(head);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.52, 8), invisible);
    if (axis === 'x') {
      shaft.rotation.z = -Math.PI / 2;
      hit.rotation.z = -Math.PI / 2;
      shaft.position.x = 0.28;
      hit.position.x = 0.28;
    } else if (axis === 'z') {
      shaft.rotation.x = Math.PI / 2;
      hit.rotation.x = Math.PI / 2;
      shaft.position.z = 0.28;
      hit.position.z = 0.28;
    } else {
      shaft.position.y = 0.28;
      hit.position.y = 0.28;
    }
    addHandle(group, shaft, hit, { tool: 'move', axis });

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.012, 8, 28), color);
    const ringHit = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 8, 20), invisible);
    if (axis === 'x') {
      ring.rotation.y = Math.PI / 2;
      ringHit.rotation.y = Math.PI / 2;
    }
    if (axis === 'y') {
      ring.rotation.x = Math.PI / 2;
      ringHit.rotation.x = Math.PI / 2;
    }
    addHandle(group, ring, ringHit, { tool: 'rotate', axis });

    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), color);
    const cubeHit = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), invisible);
    cube.position[axis] = 0.42;
    cubeHit.position[axis] = 0.42;
    addHandle(group, cube, cubeHit, { tool: 'scale', axis });
  }
  group.visible = false;

  let mode = 'move';
  let drag = null;
  const origin = new THREE.Vector3();
  const startVec = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();
  const plane = new THREE.Plane();

  function setMode(next) {
    mode = next;
    group.traverse((object) => {
      if (object.userData?.tool) object.visible = object.userData.tool === next;
    });
  }

  function follow(object) {
    if (!object) {
      group.visible = false;
      return;
    }
    group.visible = true;
    object.getWorldPosition(group.position);
    group.quaternion.identity();
    group.scale.setScalar(1);
  }

  function axisParameter(ray, axisOrigin, axisDir) {
    const ro = ray.origin;
    const rd = ray.direction;
    const w0x = ro.x - axisOrigin.x;
    const w0y = ro.y - axisOrigin.y;
    const w0z = ro.z - axisOrigin.z;
    const b = rd.x * axisDir.x + rd.y * axisDir.y + rd.z * axisDir.z;
    const d = rd.x * w0x + rd.y * w0y + rd.z * w0z;
    const e = axisDir.x * w0x + axisDir.y * w0y + axisDir.z * w0z;
    const denom = 1 - b * b;
    if (Math.abs(denom) < 1e-6) return e;
    return (e - b * d) / denom;
  }

  function begin(handle, raycaster, object) {
    if (!object || handle.userData.tool !== mode) return false;
    object.getWorldPosition(origin);
    const axisName = handle.userData.axis;
    const axis = AXIS[axisName];
    const parent = object.parent;
    const startWorld = object.getWorldPosition(new THREE.Vector3());
    const startWorldQuat = object.getWorldQuaternion(new THREE.Quaternion());
    drag = {
      object,
      parent,
      tool: handle.userData.tool,
      axisName,
      axis,
      origin: origin.clone(),
      startS: axisParameter(raycaster.ray, origin, axis),
      startWorld,
      startWorldQuat,
      startScale: object.scale.clone(),
    };
    if (handle.userData.tool === 'rotate') {
      plane.setFromNormalAndCoplanarPoint(axis, origin);
      if (raycaster.ray.intersectPlane(plane, hitPoint)) startVec.copy(hitPoint).sub(origin);
    }
    return true;
  }

  function update(raycaster) {
    if (!drag) return null;
    const { object, parent, tool, axis, axisName } = drag;
    parent.updateWorldMatrix(true, false);
    if (tool === 'move' || tool === 'scale') {
      const s = axisParameter(raycaster.ray, drag.origin, axis);
      const delta = s - drag.startS;
      if (tool === 'move') {
        const world = drag.startWorld.clone().add(axis.clone().multiplyScalar(delta));
        object.position.copy(parent.worldToLocal(world));
      } else {
        const next = drag.startScale.clone();
        next[axisName] = Math.max(0.02, drag.startScale[axisName] * Math.max(0.05, 1 + delta));
        object.scale.copy(next);
      }
    } else {
      plane.setFromNormalAndCoplanarPoint(axis, drag.origin);
      if (!raycaster.ray.intersectPlane(plane, hitPoint)) return null;
      const current = hitPoint.clone().sub(drag.origin);
      const angle = Math.atan2(startVec.clone().cross(current).dot(axis), startVec.dot(current));
      const swing = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      const parentQuat = parent.getWorldQuaternion(new THREE.Quaternion());
      const nextWorld = swing.multiply(drag.startWorldQuat.clone());
      object.quaternion.copy(parentQuat.invert().multiply(nextWorld));
    }
    return {
      uid: object.userData.uid,
      position: object.position.toArray(),
      quaternion: object.quaternion.toArray(),
      scale: object.scale.toArray(),
    };
  }

  function end() {
    const result = drag;
    drag = null;
    return result;
  }

  setMode('move');
  return {
    group,
    setMode,
    follow,
    begin,
    update,
    end,
    get dragging() { return Boolean(drag); },
  };
}
