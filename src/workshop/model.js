import * as THREE from 'three';
import {
  ATTACHMENT_NAMES,
  CLIP_NAMES,
  CATEGORIES,
  emptyClip,
  sanitizeId,
  shiftClipPositions,
  upsertKey,
} from '../core/assetSpec.js';
import { centeringDelta } from '../core/measure.js';
import { booleanMeshes } from '../wasm/manifold.js';
import { simplifyGeometry } from '../wasm/meshopt.js';

let uidSerial = 1;

export function nextUid() {
  uidSerial += 1;
  return `p${uidSerial.toString(36)}`;
}

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function createGrainTexture(hex) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const color = new THREE.Color(hex || '#ffffff');
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = 0.84 + hash(x, y) * 0.16;
      const i = (y * size + x) * 4;
      image.data[i] = Math.round(color.r * n * 255);
      image.data[i + 1] = Math.round(color.g * n * 255);
      image.data[i + 2] = Math.round(color.b * n * 255);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function makeMaterial(color, materialName, grain) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.05,
    name: materialName || 'body',
  });
  if (grain && typeof document !== 'undefined') {
    material.map = createGrainTexture('#ffffff');
  }
  return material;
}

function applyMaterialState(mesh) {
  const data = mesh.userData;
  const previous = mesh.material?.map;
  if (mesh.material) mesh.material.dispose();
  mesh.material = makeMaterial(data.color || '#c4b39a', data.materialName || 'body', data.grain);
  if (previous && previous !== mesh.material.map) previous.dispose?.();
  mesh.material.color.set(data.color || '#c4b39a');
}

function baseMesh(geometry, kind, color) {
  const mesh = new THREE.Mesh(geometry, makeMaterial(color, 'body', false));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const uid = nextUid();
  mesh.name = `${kind}_${uid}`;
  mesh.userData = {
    uid,
    kind,
    color,
    materialName: 'body',
    roughness: 0.62,
    metalness: 0.05,
    grain: false,
  };
  return mesh;
}

export function createPrimitive(type, color = '#c4b39a') {
  let geometry;
  if (type === 'box') geometry = new THREE.BoxGeometry(1, 1, 1);
  else if (type === 'sphere') geometry = new THREE.SphereGeometry(0.5, 24, 16);
  else if (type === 'cylinder') geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
  else if (type === 'cone') geometry = new THREE.ConeGeometry(0.5, 1, 20);
  else throw new Error(`Unknown primitive "${type}"`);
  const mesh = baseMesh(geometry, type, color);
  mesh.position.y = 0.5;
  return mesh;
}

function attachmentHelper(kind) {
  let mesh;
  if (kind === 'selection_ring') {
    mesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.015, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0x6ec8c0 }),
    );
    mesh.rotation.x = Math.PI / 2;
  } else if (kind === 'muzzle') {
    mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.12, 8),
      new THREE.MeshBasicMaterial({ color: 0xe0a15a }),
    );
    mesh.rotation.x = Math.PI / 2;
  } else {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xd2644a }),
    );
  }
  mesh.userData.helper = true;
  return mesh;
}

function createAttachment(kind) {
  const empty = new THREE.Object3D();
  const uid = nextUid();
  empty.name = kind;
  empty.userData = { uid, kind: 'attachment', attachment: kind };
  empty.add(attachmentHelper(kind));
  if (kind === 'selection_ring') empty.position.y = 0.02;
  if (kind === 'carry') empty.position.set(0, 0.45, 0);
  if (kind === 'muzzle') empty.position.set(0, 0.55, 0.45);
  return empty;
}

function roundArray(values) {
  return values.map((value) => Math.round(value * 10000) / 10000);
}

function serializeNode(object) {
  if (object.userData?.helper) return null;
  const data = object.userData || {};
  const node = {
    uid: data.uid,
    kind: data.kind,
    name: object.name,
    attachment: data.attachment || null,
    color: data.color || null,
    materialName: data.materialName || null,
    grain: Boolean(data.grain),
    position: roundArray(object.position.toArray()),
    quaternion: roundArray(object.quaternion.toArray()),
    scale: roundArray(object.scale.toArray()),
    children: object.children.map(serializeNode).filter(Boolean),
  };
  if (data.kind === 'mesh' && object.geometry) {
    const position = object.geometry.getAttribute('position');
    const index = object.geometry.getIndex();
    node.geometry = {
      positions: roundArray(Array.from(position.array)),
      indices: index ? Array.from(index.array) : null,
    };
  }
  return node;
}

function nodeFromData(data) {
  let object;
  if (data.kind === 'group') {
    object = new THREE.Group();
  } else if (data.kind === 'attachment') {
    object = createAttachment(data.attachment || data.name);
  } else if (data.kind === 'mesh' && data.geometry) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.geometry.positions, 3));
    if (data.geometry.indices) geometry.setIndex(data.geometry.indices);
    geometry.computeVertexNormals();
    object = baseMesh(geometry, 'mesh', data.color || '#c4b39a');
  } else if (['box', 'sphere', 'cylinder', 'cone'].includes(data.kind)) {
    object = createPrimitive(data.kind, data.color || '#c4b39a');
  } else {
    object = new THREE.Object3D();
  }
  if (data.uid) object.userData.uid = data.uid;
  if (data.name) object.name = data.name;
  if (data.color) object.userData.color = data.color;
  if (data.materialName) object.userData.materialName = data.materialName;
  object.userData.grain = Boolean(data.grain);
  if (object.isMesh) applyMaterialState(object);
  if (data.position) object.position.fromArray(data.position);
  if (data.quaternion) object.quaternion.fromArray(data.quaternion);
  if (data.scale) object.scale.fromArray(data.scale);
  if (data.kind !== 'attachment') {
    for (const child of data.children || []) {
      const next = nodeFromData(child);
      if (next) object.add(next);
    }
  }
  return object;
}

function findByUid(root, uid) {
  let found = null;
  root.traverse((object) => {
    if (!found && object.userData?.uid === uid && !object.userData.helper) found = object;
  });
  return found;
}

function disposeObject(object) {
  object.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        material.map?.dispose?.();
        material.dispose?.();
      }
    }
  });
}

function snapshotPoses(root) {
  const nodes = {};
  root.traverse((object) => {
    if (!object.userData?.uid || object.userData.helper) return;
    nodes[object.userData.uid] = {
      p: roundArray(object.position.toArray()),
      q: roundArray(object.quaternion.toArray()),
      s: roundArray(object.scale.toArray()),
    };
  });
  return nodes;
}

export function createWorkshop() {
  const root = new THREE.Group();
  root.name = 'build';
  const selection = new Set();
  let primary = null;
  let revision = 1;
  const clips = {};
  for (const name of CLIP_NAMES) clips[name] = emptyClip(name);
  const state = {
    mode: 'move',
    modelId: 'signal_post',
    category: 'props',
    clips,
    activeClip: 'idle',
    time: 0,
    playing: false,
    status: 'Build plate origin is the model origin. Blue arrow is +Z.',
  };
  let mixer = null;
  let currentAction = null;

  const touch = () => {
    revision += 1;
  };
  const stopPlayback = () => {
    state.playing = false;
    currentAction?.stop();
    mixer = null;
    currentAction = null;
  };
  const selectedList = () => [...selection];
  const requirePrimary = () => {
    if (!primary) throw new Error('Nothing is selected');
    return primary;
  };

  function clearSelection() {
    selection.clear();
    primary = null;
    touch();
  }

  function select(uid, additive = false) {
    const object = uid ? findByUid(root, uid) : null;
    if (!object) {
      clearSelection();
      return listParts();
    }
    if (!additive) selection.clear();
    if (selection.has(object) && additive) selection.delete(object);
    else selection.add(object);
    primary = selection.has(object) ? object : selectedList()[0] || null;
    touch();
    return listParts();
  }

  function listParts() {
    const parts = [];
    root.traverse((object) => {
      if (!object.userData?.uid || object.userData.helper) return;
      parts.push({
        uid: object.userData.uid,
        name: object.name,
        kind: object.userData.kind,
        color: object.userData.color || null,
        materialName: object.userData.materialName || null,
        grain: Boolean(object.userData.grain),
        selected: selection.has(object),
        primary: object === primary,
      });
    });
    return {
      modelId: state.modelId,
      category: state.category,
      mode: state.mode,
      parts,
      status: state.status,
    };
  }

  function spawn(type) {
    const mesh = createPrimitive(type);
    const count = root.children.length;
    mesh.position.x = (count % 4) * 0.35 - 0.4;
    root.add(mesh);
    select(mesh.userData.uid, false);
    state.status = `Added ${type}`;
    return listParts();
  }

  function removeObject(object) {
    selection.delete(object);
    if (primary === object) primary = null;
    object.parent?.remove(object);
    disposeObject(object);
  }

  function deleteSelection() {
    const doomed = selectedList();
    if (!doomed.length) throw new Error('Nothing is selected');
    stopPlayback();
    for (const object of doomed) removeObject(object);
    primary = null;
    touch();
    state.status = `Deleted ${doomed.length} part${doomed.length === 1 ? '' : 's'}`;
    return listParts();
  }

  function duplicate() {
    const source = requirePrimary();
    const data = serializeNode(source);
    const assign = (node) => {
      node.uid = nextUid();
      if (node.kind !== 'attachment') node.name = `${node.kind}_${node.uid}`;
      for (const child of node.children || []) assign(child);
    };
    assign(data);
    const copy = nodeFromData(data);
    copy.position.x += 0.3;
    source.parent.add(copy);
    select(copy.userData.uid, false);
    state.status = 'Duplicated';
    return listParts();
  }

  function group() {
    const items = selectedList().filter((object) => object.parent === root);
    if (items.length < 2) throw new Error('Select two or more top-level parts');
    const groupNode = new THREE.Group();
    const uid = nextUid();
    groupNode.name = `group_${uid}`;
    groupNode.userData = { uid, kind: 'group' };
    root.add(groupNode);
    for (const item of items) groupNode.attach(item);
    select(groupNode.userData.uid, false);
    state.status = 'Grouped';
    return listParts();
  }

  function ungroup() {
    const object = requirePrimary();
    if (object.userData.kind !== 'group') throw new Error('Select a group');
    const children = [...object.children];
    for (const child of children) root.attach(child);
    removeObject(object);
    clearSelection();
    state.status = 'Ungrouped';
    return listParts();
  }

  function selectParent() {
    const object = requirePrimary();
    const parent = object.parent;
    if (!parent || parent === root || !parent.userData?.uid) throw new Error('No parent group');
    select(parent.userData.uid, false);
    return listParts();
  }

  function setColor(color, teamColor = false) {
    const object = requirePrimary();
    if (!object.isMesh) throw new Error('Select a mesh');
    object.userData.color = color;
    object.userData.materialName = teamColor ? 'team_color' : 'body';
    applyMaterialState(object);
    touch();
    state.status = teamColor ? 'Material named team_color' : `Color ${color}`;
    return listParts();
  }

  function setGrain(enabled) {
    const object = requirePrimary();
    if (!object.isMesh) throw new Error('Select a mesh');
    object.userData.grain = Boolean(enabled);
    applyMaterialState(object);
    touch();
    state.status = enabled ? 'Procedural grain will export as KTX2' : 'Grain removed';
    return listParts();
  }

  function setMode(mode) {
    if (!['move', 'rotate', 'scale'].includes(mode)) throw new Error(`Unknown mode "${mode}"`);
    state.mode = mode;
    touch();
    return listParts();
  }

  function setLocalTransform(uid, transform) {
    const object = findByUid(root, uid) || requirePrimary();
    stopPlayback();
    if (transform.position) object.position.fromArray(transform.position);
    if (transform.quaternion) object.quaternion.fromArray(transform.quaternion);
    if (transform.scale) object.scale.fromArray(transform.scale);
    touch();
    return {
      uid: object.userData.uid,
      position: object.position.toArray(),
      quaternion: object.quaternion.toArray(),
      scale: object.scale.toArray(),
    };
  }

  function translate(delta) {
    const object = requirePrimary();
    stopPlayback();
    object.position.x += delta.x || 0;
    object.position.y += delta.y || 0;
    object.position.z += delta.z || 0;
    touch();
    return setLocalTransform(object.userData.uid, {});
  }

  function rotate(delta) {
    const object = requirePrimary();
    stopPlayback();
    if (delta.x) object.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), delta.x);
    if (delta.y) object.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), delta.y);
    if (delta.z) object.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), delta.z);
    touch();
    return setLocalTransform(object.userData.uid, {});
  }

  function scaleBy(factor) {
    const object = requirePrimary();
    stopPlayback();
    const x = factor.x ?? factor.uniform ?? 1;
    const y = factor.y ?? factor.uniform ?? 1;
    const z = factor.z ?? factor.uniform ?? 1;
    object.scale.x = Math.max(0.02, object.scale.x * x);
    object.scale.y = Math.max(0.02, object.scale.y * y);
    object.scale.z = Math.max(0.02, object.scale.z * z);
    touch();
    return setLocalTransform(object.userData.uid, {});
  }

  function addAttachment(name) {
    if (!ATTACHMENT_NAMES.includes(name)) throw new Error(`Unknown attachment "${name}"`);
    let existing = null;
    root.traverse((object) => {
      if (object.userData?.attachment === name) existing = object;
    });
    if (existing) {
      select(existing.userData.uid, false);
      state.status = `${name} already exists`;
      return listParts();
    }
    const empty = createAttachment(name);
    const host = primary && primary !== root ? primary : root;
    if (host.userData?.kind === 'group' || host === root) host.add(empty);
    else (host.parent || root).add(empty);
    select(empty.userData.uid, false);
    state.status = `Added ${name}`;
    return listParts();
  }

  async function markLod() {
    const object = requirePrimary();
    if (!object.isMesh) throw new Error('Select a mesh to simplify');
    const simplified = await simplifyGeometry(object.geometry, 0.45);
    if (!simplified) {
      state.status = 'Mesh is already too small to simplify';
      touch();
      return listParts();
    }
    const mesh = new THREE.Mesh(simplified, object.material.clone());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const uid = nextUid();
    const lodIndex = 1 + root.children.filter((child) => /_lod\d+$/.test(child.name)).length;
    mesh.name = `${state.modelId}_lod${lodIndex}`;
    mesh.userData = {
      ...object.userData,
      uid,
      kind: 'mesh',
    };
    mesh.position.copy(object.position);
    mesh.quaternion.copy(object.quaternion);
    mesh.scale.copy(object.scale);
    mesh.position.x += 0.4;
    root.add(mesh);
    select(uid, false);
    state.status = `Created ${mesh.name}`;
    return listParts();
  }

  function center() {
    const delta = centeringDelta(root);
    const moved = root.children.map((child) => child.userData?.uid).filter(Boolean);
    for (const child of root.children) {
      child.position.x += delta.x;
      child.position.y += delta.y;
      child.position.z += delta.z;
    }
    state.clips = shiftClipPositions(state.clips, moved, delta);
    touch();
    state.status = 'Centered on the plate origin';
    return { ...listParts(), delta };
  }

  async function booleanOp(operation) {
    const meshes = selectedList().filter((object) => object.isMesh && !object.userData.helper);
    const geometry = await booleanMeshes(meshes, operation, root);
    const uid = nextUid();
    const mesh = new THREE.Mesh(geometry, makeMaterial(meshes[0].userData.color || '#c4b39a', meshes[0].userData.materialName, false));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `mesh_${uid}`;
    mesh.userData = {
      uid,
      kind: 'mesh',
      color: meshes[0].userData.color || '#c4b39a',
      materialName: meshes[0].userData.materialName || 'body',
      grain: false,
    };
    root.add(mesh);
    for (const item of meshes) removeObject(item);
    select(uid, false);
    state.status = `${operation} produced one mesh`;
    return listParts();
  }

  function setModelId(id) {
    state.modelId = sanitizeId(id);
    touch();
    return { modelId: state.modelId };
  }

  function setCategory(category) {
    if (!CATEGORIES.includes(category)) throw new Error(`Unknown category "${category}"`);
    state.category = category;
    touch();
    return { category };
  }

  function clear() {
    stopPlayback();
    for (const child of [...root.children]) removeObject(child);
    clearSelection();
    state.status = 'Build plate cleared';
    return listParts();
  }

  function setClip(name) {
    if (!CLIP_NAMES.includes(name)) throw new Error(`Unknown clip "${name}"`);
    stopPlayback();
    state.activeClip = name;
    state.time = 0;
    touch();
    return clipStatus();
  }

  function setKey(time) {
    const clip = state.clips[state.activeClip];
    const t = time == null ? state.time : time;
    state.clips[state.activeClip] = upsertKey(clip, t, snapshotPoses(root));
    state.time = t;
    touch();
    state.status = `Keyed ${state.activeClip} at ${t.toFixed(2)}s`;
    return clipStatus();
  }

  function clipStatus() {
    const clip = state.clips[state.activeClip];
    return {
      clip: state.activeClip,
      time: state.time,
      duration: clip.duration,
      loop: clip.loop,
      playing: state.playing,
      keyCount: clip.keys.length,
    };
  }

  function play() {
    const clip = buildClip(root, state.activeClip, state.clips[state.activeClip]);
    if (!clip) throw new Error('Set at least one key before playing');
    mixer = new THREE.AnimationMixer(root);
    currentAction = mixer.clipAction(clip);
    currentAction.setLoop(state.clips[state.activeClip].loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    currentAction.clampWhenFinished = true;
    currentAction.play();
    state.playing = true;
    touch();
    return clipStatus();
  }

  function stop() {
    stopPlayback();
    touch();
    return clipStatus();
  }

  function setLoop(loop) {
    state.clips[state.activeClip].loop = Boolean(loop);
    touch();
    return clipStatus();
  }

  function setTime(time) {
    stopPlayback();
    state.time = Math.max(0, time);
    touch();
    return clipStatus();
  }

  function setDuration(duration) {
    state.clips[state.activeClip].duration = Math.max(0.1, duration);
    touch();
    return clipStatus();
  }

  function update(dt) {
    if (mixer && state.playing) {
      mixer.update(dt);
      state.time += dt;
    }
  }

  function serialize() {
    return {
      modelId: state.modelId,
      category: state.category,
      parts: root.children.map(serializeNode).filter(Boolean),
      clips: state.clips,
      activeClip: state.activeClip,
    };
  }

  function load(data) {
    clear();
    state.modelId = sanitizeId(data?.modelId || 'asset');
    state.category = CATEGORIES.includes(data?.category) ? data.category : 'props';
    state.activeClip = CLIP_NAMES.includes(data?.activeClip) ? data.activeClip : 'idle';
    for (const name of CLIP_NAMES) {
      state.clips[name] = data?.clips?.[name] || emptyClip(name);
    }
    for (const part of data?.parts || []) {
      const node = nodeFromData(part);
      if (node) root.add(node);
    }
    touch();
    state.status = `Loaded ${state.modelId}`;
    return listParts();
  }

  function addStarter() {
    const base = createPrimitive('cylinder', '#8c6a4a');
    base.scale.set(0.7, 0.18, 0.7);
    base.position.y = 0.09;
    const post = createPrimitive('cylinder', '#c4b39a');
    post.scale.set(0.16, 1.15, 0.16);
    post.position.y = 0.7;
    const head = createPrimitive('sphere', '#e0a15a');
    head.scale.set(0.34, 0.34, 0.34);
    head.position.y = 1.35;
    head.userData.materialName = 'team_color';
    head.userData.color = '#ffffff';
    applyMaterialState(head);
    const ring = createAttachment('selection_ring');
    const carry = createAttachment('carry');
    carry.position.set(0, 0.7, 0);
    root.add(base, post, head, ring, carry);
    state.modelId = 'signal_post';
    state.category = 'props';
    touch();
    return listParts();
  }

  return {
    root,
    get revision() { return revision; },
    get primary() { return primary; },
    get state() { return state; },
    touch,
    spawn,
    select,
    clearSelection,
    deleteSelection,
    duplicate,
    group,
    ungroup,
    selectParent,
    setColor,
    setGrain,
    setMode,
    setLocalTransform,
    translate,
    rotate,
    scaleBy,
    addAttachment,
    markLod,
    center,
    booleanOp,
    setModelId,
    setCategory,
    listParts,
    clear,
    setClip,
    setKey,
    play,
    stop,
    setLoop,
    setTime,
    setDuration,
    update,
    serialize,
    load,
    addStarter,
    clipStatus,
  };
}

export function buildClip(root, name, clip) {
  if (!clip?.keys?.length) return null;
  const keys = clip.keys.slice().sort((a, b) => a.t - b.t);
  const uids = new Set();
  for (const key of keys) Object.keys(key.nodes || {}).forEach((uid) => uids.add(uid));
  const tracks = [];
  root.traverse((object) => {
    const uid = object.userData?.uid;
    if (!uid || !uids.has(uid) || object.userData.helper) return;
    const times = [];
    const positions = [];
    const quaternions = [];
    const scales = [];
    for (const key of keys) {
      const pose = key.nodes?.[uid];
      if (!pose) continue;
      times.push(key.t);
      positions.push(...pose.p);
      quaternions.push(...pose.q);
      scales.push(...pose.s);
    }
    if (times.length < 1) return;
    tracks.push(new THREE.VectorKeyframeTrack(`${object.name}.position`, times, positions));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${object.name}.quaternion`, times, quaternions));
    tracks.push(new THREE.VectorKeyframeTrack(`${object.name}.scale`, times, scales));
  });
  if (!tracks.length) return null;
  return new THREE.AnimationClip(name, clip.duration ?? -1, tracks);
}
