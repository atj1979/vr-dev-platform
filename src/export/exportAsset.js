import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import {
  assetPaths,
  buildManifest,
  buildSidecar,
  finalizeClipKeys,
  manifestEntry,
  sanitizeId,
} from '../core/assetSpec.js';
import { measureModel } from '../core/measure.js';
import { zipStore } from '../core/zipStore.js';
import { packGlb, parseGlb, repackBufferViews } from '../wasm/glb.js';
import { encodeImageToKtx2 } from '../wasm/ktx2.js';
import { compressGlb, optimizeGeometry } from '../wasm/meshopt.js';
import { buildClip } from '../workshop/model.js';

function stripHelpers(root) {
  const helpers = [];
  root.traverse((object) => {
    if (object.userData?.helper) helpers.push(object);
  });
  for (const helper of helpers) helper.parent?.remove(helper);
}

function cloneForExport(root) {
  const clone = root.clone(true);
  clone.traverse((object) => {
    if (object.isMesh) {
      object.geometry = object.geometry.clone();
      const source = object.material;
      object.material = source?.clone ? source.clone() : source;
      if (source?.map && object.material) object.material.map = source.map;
    }
  });
  stripHelpers(clone);
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  clone.scale.set(1, 1, 1);
  clone.name = 'export';
  clone.updateMatrixWorld(true);
  return clone;
}

async function optimizeClone(clone) {
  const jobs = [];
  clone.traverse((object) => {
    if (object.isMesh && object.geometry) jobs.push(optimizeGeometry(object.geometry));
  });
  await Promise.all(jobs);
}

function animationClips(clone, clips) {
  const result = [];
  for (const [name, clip] of Object.entries(clips || {})) {
    let finalized;
    try {
      finalized = finalizeClipKeys(name, clip);
    } catch {
      continue;
    }
    if (!finalized.length) continue;
    const threeClip = buildClip(clone, name, { ...clip, keys: finalized });
    if (threeClip) result.push(threeClip);
  }
  return result;
}

async function exporterBinary(root, animations) {
  const exporter = new GLTFExporter();
  const binary = await exporter.parseAsync(root, {
    binary: true,
    animations,
    onlyVisible: true,
    embedImages: true,
  });
  return binary instanceof ArrayBuffer ? new Uint8Array(binary) : new Uint8Array(binary);
}

async function texturesToKtx2(glb) {
  const parsed = parseGlb(glb);
  if (!parsed.json.images?.length) return { glb, converted: 0 };
  const replacements = new Map();
  let converted = 0;
  for (const image of parsed.json.images) {
    if (image.bufferView == null) continue;
    const view = parsed.json.bufferViews[image.bufferView];
    const bytes = parsed.bin.slice(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (!png) continue;
    const ktx = await encodeImageToKtx2(bytes);
    replacements.set(image.bufferView, ktx instanceof Uint8Array ? ktx : new Uint8Array(ktx));
    image.mimeType = 'image/ktx2';
    delete image.uri;
    converted += 1;
  }
  if (!converted) return { glb, converted: 0 };
  for (const texture of parsed.json.textures || []) {
    if (texture.source == null) continue;
    texture.extensions = {
      ...(texture.extensions || {}),
      KHR_texture_basisu: { source: texture.source },
    };
    delete texture.source;
  }
  parsed.json.extensionsUsed = [...new Set([...(parsed.json.extensionsUsed || []), 'KHR_texture_basisu'])];
  parsed.json.extensionsRequired = [...new Set([...(parsed.json.extensionsRequired || []), 'KHR_texture_basisu'])];
  const body = repackBufferViews(parsed.json, parsed.bin, replacements);
  return { glb: packGlb(parsed.json, body), converted };
}

export async function buildAssetPackage(workshop, { meshopt = false } = {}) {
  const id = sanitizeId(workshop.state.modelId);
  const category = workshop.state.category;
  const clone = cloneForExport(workshop.root);
  clone.name = id;
  try {
    await optimizeClone(clone);
  } catch {
    // A meshopt failure still leaves a valid uncompressed glTF.
  }
  const measured = measureModel(clone);
  const clips = animationClips(clone, workshop.state.clips);
  let glb = await exporterBinary(clone, clips);
  let ktx2 = 0;
  try {
    const textured = await texturesToKtx2(glb);
    glb = textured.glb;
    ktx2 = textured.converted;
  } catch (error) {
    ktx2 = 0;
    workshop.state.status = `KTX2 encode failed, kept PNG (${error.message})`;
  }
  let compressedViews = 0;
  if (meshopt) {
    const compressed = await compressGlb(glb);
    glb = compressed.glb;
    compressedViews = compressed.compressedViews;
  }
  const clipNames = clips.map((clip) => clip.name);
  const sidecar = buildSidecar({
    id,
    category,
    footprint: measured.footprint,
    boundingRadius: measured.boundingRadius,
    attachments: measured.attachments,
    lod: measured.lod,
    clips: clipNames,
    materials: measured.materials,
  });
  const entry = manifestEntry({
    id,
    category,
    clips: clipNames,
    footprint: measured.footprint,
    boundingRadius: measured.boundingRadius,
  });
  const manifest = buildManifest([entry]);
  const paths = assetPaths(category, id);
  const zip = zipStore([
    { name: paths.zipGlb, data: glb },
    { name: paths.zipSidecar, data: JSON.stringify(sidecar, null, 2) },
    { name: paths.zipManifest, data: JSON.stringify(manifest, null, 2) },
  ]);
  return {
    id,
    category,
    filename: `${id}.zip`,
    zip,
    sidecar,
    manifest,
    byteLength: zip.byteLength,
    ktx2,
    compressedViews,
    footprint: measured.footprint,
    boundingRadius: measured.boundingRadius,
  };
}

export function downloadBytes(filename, bytes, mime) {
  if (typeof document === 'undefined') return false;
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

export async function exportWorkshop(workshop, options) {
  const packed = await buildAssetPackage(workshop, options);
  const downloaded = downloadBytes(packed.filename, packed.zip, 'application/zip');
  workshop.state.status = downloaded
    ? `Downloaded ${packed.filename}`
    : `Packed ${packed.filename}`;
  workshop.touch();
  return {
    id: packed.id,
    category: packed.category,
    filename: packed.filename,
    byteLength: packed.byteLength,
    downloaded,
    ktx2: packed.ktx2,
    compressedViews: packed.compressedViews,
    footprint: packed.footprint,
    boundingRadius: packed.boundingRadius,
    sidecar: packed.sidecar,
    manifest: packed.manifest,
  };
}
