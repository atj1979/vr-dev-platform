import * as THREE from 'three';
import { packGlb, parseGlb } from './glb.js';

let encoderPromise;
let simplifierPromise;

function loadEncoder() {
  encoderPromise ??= import('meshoptimizer').then(async (mod) => {
    await mod.MeshoptEncoder.ready;
    return mod.MeshoptEncoder;
  });
  return encoderPromise;
}

function loadSimplifier() {
  simplifierPromise ??= import('meshoptimizer').then(async (mod) => {
    await mod.MeshoptSimplifier.ready;
    return mod.MeshoptSimplifier;
  });
  return simplifierPromise;
}

function indexArray(geometry) {
  const index = geometry.getIndex();
  if (!index) return null;
  const indices = new Uint32Array(index.count);
  for (let i = 0; i < index.count; i += 1) indices[i] = index.getX(i);
  return indices;
}

function attributeArray(attribute, itemSize) {
  const out = new Float32Array(attribute.count * itemSize);
  for (let i = 0; i < attribute.count; i += 1) {
    for (let k = 0; k < itemSize; k += 1) out[i * itemSize + k] = attribute.getComponent(i, k);
  }
  return out;
}

/**
 * Reorder vertices and triangles for cache locality. The result is still a
 * plain glTF mesh; this does not require a meshopt decoder in the game.
 */
export async function optimizeGeometry(geometry) {
  const indices = indexArray(geometry);
  const position = geometry.getAttribute('position');
  if (!indices || !position || indices.length < 3) return false;
  const encoder = await loadEncoder();
  const [remap, unique] = encoder.reorderMesh(indices, true, true);
  if (!unique || unique < 1) return false;
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const nextPos = new Float32Array(unique * 3);
  const nextNormal = normal ? new Float32Array(unique * 3) : null;
  const nextUv = uv ? new Float32Array(unique * 2) : null;
  for (let i = 0; i < position.count; i += 1) {
    const target = remap[i];
    if (target === 0xffffffff) continue;
    nextPos[target * 3] = position.getX(i);
    nextPos[target * 3 + 1] = position.getY(i);
    nextPos[target * 3 + 2] = position.getZ(i);
    if (nextNormal && normal) {
      nextNormal[target * 3] = normal.getX(i);
      nextNormal[target * 3 + 1] = normal.getY(i);
      nextNormal[target * 3 + 2] = normal.getZ(i);
    }
    if (nextUv && uv) {
      nextUv[target * 2] = uv.getX(i);
      nextUv[target * 2 + 1] = uv.getY(i);
    }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(nextPos, 3));
  if (nextNormal) geometry.setAttribute('normal', new THREE.BufferAttribute(nextNormal, 3));
  if (nextUv) geometry.setAttribute('uv', new THREE.BufferAttribute(nextUv, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return true;
}

/**
 * Build a lighter index buffer with the meshoptimizer simplifier.
 * Returns null when the mesh is already too small to reduce.
 */
export async function simplifyGeometry(geometry, ratio = 0.5) {
  const indices = indexArray(geometry);
  const position = geometry.getAttribute('position');
  if (!indices || !position || indices.length < 12) return null;
  const simplifier = await loadSimplifier();
  const positions = attributeArray(position, 3);
  const target = Math.max(6, Math.floor(indices.length * ratio));
  const [reduced, error] = simplifier.simplify(indices, positions, 3, target, 0.05, ['LockBorder']);
  if (!reduced || reduced.length >= indices.length) return null;
  const next = new THREE.BufferGeometry();
  next.setAttribute('position', position.clone());
  if (geometry.getAttribute('normal')) next.setAttribute('normal', geometry.getAttribute('normal').clone());
  if (geometry.getAttribute('uv')) next.setAttribute('uv', geometry.getAttribute('uv').clone());
  next.setIndex(new THREE.BufferAttribute(reduced, 1));
  const [remap, unique] = simplifier.compactMesh(reduced);
  if (unique && unique < position.count) {
    const packed = new Float32Array(unique * 3);
    const src = next.getAttribute('position');
    for (let i = 0; i < src.count; i += 1) {
      const targetIndex = remap[i];
      if (targetIndex === 0xffffffff) continue;
      packed[targetIndex * 3] = src.getX(i);
      packed[targetIndex * 3 + 1] = src.getY(i);
      packed[targetIndex * 3 + 2] = src.getZ(i);
    }
    next.setAttribute('position', new THREE.BufferAttribute(packed, 3));
    next.deleteAttribute('normal');
    next.deleteAttribute('uv');
  }
  next.computeVertexNormals();
  next.userData.simplifyError = error;
  return next;
}

const COMPONENT_SIZE = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};

const TYPE_COMPONENTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT4: 16,
};

function packedStride(accessor) {
  const size = COMPONENT_SIZE[accessor.componentType];
  const count = TYPE_COMPONENTS[accessor.type];
  if (!size || !count) return 0;
  return size * count;
}

/**
 * Wrap accessor buffer views in EXT_meshopt_compression when the encoded
 * bytes are smaller. The game loader must supply a meshopt decoder to read
 * a file produced with this option.
 */
export async function compressGlb(glb) {
  const { json, bin } = parseGlb(glb);
  const encoder = await loadEncoder();
  const users = new Map();
  for (const accessor of json.accessors || []) {
    if (accessor.bufferView == null || accessor.sparse || accessor.byteOffset) continue;
    const list = users.get(accessor.bufferView) || [];
    list.push(accessor);
    users.set(accessor.bufferView, list);
  }
  const chunks = [];
  const updates = new Map();
  let fallbackCursor = 0;
  let compressedCursor = 0;
  for (const [viewIndex, accessors] of users) {
    if (accessors.length !== 1) continue;
    const accessor = accessors[0];
    const view = json.bufferViews[viewIndex];
    if (!view || view.buffer !== 0) continue;
    const stride = view.byteStride || packedStride(accessor);
    const count = accessor.count;
    if (!stride || !count) continue;
    const mode = accessor.type === 'SCALAR' && (accessor.componentType === 5123 || accessor.componentType === 5125)
      ? (count % 3 === 0 ? 'TRIANGLES' : 'INDICES')
      : 'ATTRIBUTES';
    if (mode === 'ATTRIBUTES' && (stride % 4 !== 0 || stride > 256)) continue;
    if ((mode === 'TRIANGLES' || mode === 'INDICES') && stride !== 2 && stride !== 4) continue;
    const start = view.byteOffset || 0;
    if (start + count * stride > bin.length) continue;
    const source = bin.slice(start, start + count * stride);
    let encoded;
    try {
      encoded = encoder.encodeGltfBuffer(source, count, stride, mode);
    } catch {
      continue;
    }
    if (!encoded || encoded.byteLength + 16 >= source.byteLength) continue;
    const aligned = compressedCursor + ((4 - (compressedCursor % 4)) % 4);
    chunks.push({ pad: aligned - compressedCursor, bytes: encoded });
    updates.set(viewIndex, {
      stride,
      count,
      mode,
      compOffset: aligned,
      compLength: encoded.byteLength,
      fallbackOffset: fallbackCursor,
    });
    compressedCursor = aligned + encoded.byteLength;
    fallbackCursor += count * stride;
  }
  if (!updates.size) return { glb, compressedViews: 0 };
  const body = new Uint8Array((compressedCursor + 3) & ~3);
  let cursor = 0;
  for (const chunk of chunks) {
    cursor += chunk.pad;
    body.set(chunk.bytes, cursor);
    cursor += chunk.bytes.byteLength;
  }
  for (const [viewIndex, info] of updates) {
    const view = json.bufferViews[viewIndex];
    view.buffer = 1;
    view.byteOffset = info.fallbackOffset;
    view.byteLength = info.count * info.stride;
    view.byteStride = info.mode === 'ATTRIBUTES' ? info.stride : undefined;
    view.extensions = {
      ...(view.extensions || {}),
      EXT_meshopt_compression: {
        buffer: 0,
        byteOffset: info.compOffset,
        byteLength: info.compLength,
        byteStride: info.stride,
        count: info.count,
        mode: info.mode,
        filter: 'NONE',
      },
    };
  }
  json.buffers = [
    { byteLength: body.byteLength },
    {
      byteLength: Math.max(4, fallbackCursor),
      extensions: { EXT_meshopt_compression: { fallback: true } },
    },
  ];
  json.extensionsUsed = [...new Set([...(json.extensionsUsed || []), 'EXT_meshopt_compression'])];
  json.extensionsRequired = [...new Set([...(json.extensionsRequired || []), 'EXT_meshopt_compression'])];
  return { glb: packGlb(json, body), compressedViews: updates.size };
}
