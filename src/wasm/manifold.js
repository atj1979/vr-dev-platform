import * as THREE from 'three';

let modulePromise;

function wasmUrl() {
  const base = import.meta.env?.BASE_URL || '/';
  return `${base}wasm/manifold.wasm`;
}

async function loadModule() {
  modulePromise ??= (async () => {
    const { default: Module } = await import('manifold-3d');
    const inBrowser = typeof window !== 'undefined' && typeof fetch === 'function';
    const wasm = inBrowser
      ? await Module({
        wasmBinary: await fetch(wasmUrl()).then((response) => {
          if (!response.ok) throw new Error(`Could not load manifold.wasm (${response.status})`);
          return response.arrayBuffer();
        }),
      })
      : await Module();
    wasm.setup();
    return wasm;
  })();
  return modulePromise;
}

function geometryToMesh(geometry, matrix) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute('position');
  const vertex = new THREE.Vector3();
  const keyToIndex = new Map();
  const unique = [];
  const triVerts = new Uint32Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
    const key = `${vertex.x.toFixed(5)}|${vertex.y.toFixed(5)}|${vertex.z.toFixed(5)}`;
    let index = keyToIndex.get(key);
    if (index == null) {
      index = unique.length / 3;
      keyToIndex.set(key, index);
      unique.push(vertex.x, vertex.y, vertex.z);
    }
    triVerts[i] = index;
  }
  if (source !== geometry) source.dispose();
  return { numProp: 3, triVerts, vertProperties: new Float32Array(unique) };
}

function meshToGeometry(mesh) {
  const vertCount = mesh.numVert;
  const stride = mesh.numProp;
  const positions = new Float32Array(vertCount * 3);
  const normals = stride >= 6 ? new Float32Array(vertCount * 3) : null;
  for (let i = 0; i < vertCount; i += 1) {
    const base = i * stride;
    positions[i * 3] = mesh.vertProperties[base];
    positions[i * 3 + 1] = mesh.vertProperties[base + 1];
    positions[i * 3 + 2] = mesh.vertProperties[base + 2];
    if (normals) {
      normals[i * 3] = mesh.vertProperties[base + 3];
      normals[i * 3 + 1] = mesh.vertProperties[base + 4];
      normals[i * 3 + 2] = mesh.vertProperties[base + 5];
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(Array.from(mesh.triVerts));
  if (normals) geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  else geometry.computeVertexNormals();
  return geometry;
}

/**
 * Boolean a list of three.js meshes with Manifold. The meshes are baked
 * through their world matrices into the parent's local space. At least two
 * watertight meshes are required. Results are disposed by the caller.
 */
export async function booleanMeshes(meshes, operation, parent) {
  if (!meshes || meshes.length < 2) throw new Error('Select at least two solids');
  const op = operation || 'union';
  if (!['union', 'subtract', 'intersect'].includes(op)) throw new Error(`Unknown boolean "${op}"`);
  const wasm = await loadModule();
  const { Manifold } = wasm;
  parent.updateWorldMatrix(true, true);
  const parentInverse = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const solids = [];
  try {
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      const matrix = new THREE.Matrix4().copy(parentInverse).multiply(mesh.matrixWorld);
      const manifold = new Manifold(geometryToMesh(mesh.geometry, matrix));
      solids.push(manifold);
    }
    let acc = solids[0];
    for (let i = 1; i < solids.length; i += 1) {
      const next = op === 'subtract'
        ? acc.subtract(solids[i])
        : op === 'intersect'
          ? acc.intersect(solids[i])
          : acc.add(solids[i]);
      if (acc !== solids[0]) acc.delete();
      acc = next;
    }
    let meshed = acc;
    try {
      const expanded = acc.setProperties(6, (next, position) => {
        next[0] = position[0];
        next[1] = position[1];
        next[2] = position[2];
        next[3] = 0;
        next[4] = 1;
        next[5] = 0;
      });
      if (expanded !== acc) {
        meshed = expanded.calculateNormals(3, 45);
        if (meshed !== expanded) expanded.delete();
      }
    } catch {
      meshed = acc;
    }
    const geometry = meshToGeometry(meshed.getMesh());
    if (meshed !== acc) meshed.delete();
    if (acc !== solids[0]) acc.delete();
    return geometry;
  } finally {
    for (const solid of solids) {
      try { solid.delete(); } catch { /* already released */ }
    }
  }
}
