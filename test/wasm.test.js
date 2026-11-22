import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { parseGlb } from '../src/wasm/glb.js';
import { booleanMeshes } from '../src/wasm/manifold.js';
import { compressGlb, optimizeGeometry } from '../src/wasm/meshopt.js';
import { encodeImageToKtx2 } from '../src/wasm/ktx2.js';
import { createWorkshop } from '../src/workshop/model.js';
import { measureModel } from '../src/core/measure.js';

describe('workshop solids', () => {
  it('spawns a primitive that sits on the ground and measures a footprint', () => {
    const workshop = createWorkshop();
    workshop.spawn('box');
    const mesh = workshop.root.children[0];
    expect(mesh.position.y).toBeCloseTo(0.5);
    const measured = measureModel(workshop.root);
    expect(measured.footprint.width).toBeGreaterThanOrEqual(1);
    expect(measured.empty).toBe(false);
  });
});

describe('manifold booleans', () => {
  it('unions two boxes into one mesh', async () => {
    const parent = new THREE.Group();
    const left = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const right = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    right.position.x = 0.5;
    parent.add(left, right);
    const geometry = await booleanMeshes([left, right], 'union', parent);
    const index = geometry.getIndex();
    expect(index.count).toBeGreaterThan(12);
    geometry.dispose();
  }, 60000);
});

describe('meshopt', () => {
  it('reorders a box and can wrap a buffer view', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    expect(await optimizeGeometry(geometry)).toBe(true);
    const count = 64;
    const floats = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      floats[i * 3] = i * 0.01;
      floats[i * 3 + 1] = 0.25;
      floats[i * 3 + 2] = 0.5;
    }
    const bin = new Uint8Array(floats.buffer);
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: bin.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
      accessors: [{ bufferView: 0, componentType: 5126, count, type: 'VEC3' }],
    };
    const { packGlb } = await import('../src/wasm/glb.js');
    const packed = await compressGlb(packGlb(json, bin));
    expect(packed.compressedViews).toBe(1);
    const parsed = parseGlb(packed.glb);
    expect(parsed.json.extensionsRequired).toContain('EXT_meshopt_compression');
    const extension = parsed.json.bufferViews[0].extensions.EXT_meshopt_compression;
    const { MeshoptDecoder } = await import('meshoptimizer');
    await MeshoptDecoder.ready;
    const decoded = new Uint8Array(extension.count * extension.byteStride);
    MeshoptDecoder.decodeGltfBuffer(decoded, extension.count, extension.byteStride, parsed.bin.slice(extension.byteOffset, extension.byteOffset + extension.byteLength), extension.mode, 'NONE');
    expect(new Float32Array(decoded.buffer)[1]).toBeCloseTo(0.25);
  });
});

describe('ktx2 encoder', () => {
  it('encodes a power-of-two RGBA image', async () => {
    const width = 8;
    const height = 8;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 210;
      rgba[i + 1] = 160;
      rgba[i + 2] = 90;
      rgba[i + 3] = 255;
    }
    const encoded = await encodeImageToKtx2(rgba, { width, height, generateMipmap: false });
    const bytes = encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0xab, 0x4b, 0x54, 0x58]);
  }, 60000);
});
