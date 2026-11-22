/** Contract shared with the WebXR RTS at github.com/atj1979/vr-rts. */

export const CELL_METERS = 1;

export const CLIP_NAMES = Object.freeze([
  'idle',
  'walk',
  'run',
  'attack',
  'death',
  'build',
  'gather',
  'work',
]);

/** Clips that must start and end on the same pose when marked loopable. */
export const LOOPABLE_CLIPS = new Set(['idle', 'walk', 'run', 'build', 'gather', 'work']);

export const ATTACHMENT_NAMES = Object.freeze(['muzzle', 'carry', 'selection_ring']);

export const CATEGORIES = Object.freeze(['units', 'buildings', 'props', 'resources', 'effects']);

export const PROJECT_FORMAT = 'vr-dev-platform/project';
export const PROJECT_VERSION = 1;
export const MANIFEST_FORMAT = 'vr-rts-assets';
export const MANIFEST_VERSION = 1;

export function sanitizeId(raw) {
  const id = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return id || 'asset';
}

export function assetPaths(category, id) {
  const safeCategory = CATEGORIES.includes(category) ? category : 'props';
  const safeId = sanitizeId(id);
  const base = `assets/${safeCategory}/${safeId}/${safeId}`;
  return {
    category: safeCategory,
    id: safeId,
    glb: `${base}.glb`,
    sidecar: `${base}.json`,
    zipGlb: `public/${base}.glb`,
    zipSidecar: `public/${base}.json`,
    zipManifest: 'public/assets/manifest.json',
  };
}

export function round3(n) {
  return Math.round(n * 1000) / 1000;
}

export function buildSidecar({
  id,
  category,
  footprint,
  boundingRadius,
  attachments,
  lod,
  clips,
  materials,
}) {
  return {
    id,
    category,
    units: 'meters',
    up: '+Y',
    forward: '+Z',
    cellMeters: CELL_METERS,
    footprint: {
      width: Math.max(1, footprint?.width ?? 1),
      depth: Math.max(1, footprint?.depth ?? 1),
    },
    boundingRadius: round3(boundingRadius ?? 0),
    attachments: attachments ?? {},
    lod: lod ?? [],
    clips: clips ?? [],
    materials: materials ?? [],
  };
}

export function manifestEntry({ id, category, clips, footprint, boundingRadius }) {
  const paths = assetPaths(category, id);
  return {
    id: paths.id,
    category: paths.category,
    file: paths.glb,
    sidecar: paths.sidecar,
    clips: clips ?? [],
    footprint: {
      width: Math.max(1, footprint?.width ?? 1),
      depth: Math.max(1, footprint?.depth ?? 1),
    },
    boundingRadius: round3(boundingRadius ?? 0),
  };
}

export function buildManifest(entries) {
  return {
    format: MANIFEST_FORMAT,
    version: MANIFEST_VERSION,
    cellMeters: CELL_METERS,
    up: '+Y',
    forward: '+Z',
    assets: entries,
  };
}

function cloneNodes(nodes) {
  const out = {};
  for (const [uid, pose] of Object.entries(nodes ?? {})) {
    out[uid] = {
      p: pose.p.slice(),
      q: pose.q.slice(),
      s: pose.s.slice(),
    };
  }
  return out;
}

/**
 * Ordered keys for a named clip. Loopable clips gain an end key that
 * matches the first pose so the exported animation can repeat cleanly.
 */
export function finalizeClipKeys(name, clip) {
  if (!clip || !Array.isArray(clip.keys) || clip.keys.length === 0) return [];
  if (!CLIP_NAMES.includes(name)) {
    throw new Error(`Clip "${name}" is not one of ${CLIP_NAMES.join(', ')}`);
  }
  const keys = clip.keys
    .map((key) => ({ t: Number(key.t) || 0, nodes: cloneNodes(key.nodes) }))
    .sort((a, b) => a.t - b.t);
  const loop = Boolean(clip.loop) && LOOPABLE_CLIPS.has(name);
  if (!loop) return keys;
  const last = keys[keys.length - 1];
  const duration = Math.max(Number(clip.duration) || 0, last.t, keys[0].t + 0.01);
  const endPose = cloneNodes(keys[0].nodes);
  if (Math.abs(last.t - duration) < 1e-4) {
    keys[keys.length - 1] = { t: duration, nodes: endPose };
    return keys;
  }
  keys.push({ t: duration, nodes: endPose });
  return keys;
}

export function emptyClip(name) {
  return {
    loop: LOOPABLE_CLIPS.has(name),
    duration: 1,
    keys: [],
  };
}

export function upsertKey(clip, time, nodes) {
  const t = Math.round(time * 1000) / 1000;
  const next = {
    t,
    nodes: cloneNodes(nodes),
  };
  const keys = (clip.keys ?? []).filter((key) => Math.abs(key.t - t) > 0.02);
  keys.push(next);
  keys.sort((a, b) => a.t - b.t);
  return { ...clip, keys };
}

/** Shift stored position keys for the given node ids by a local delta. */
export function shiftClipPositions(clips, uids, delta) {
  const idSet = new Set(uids);
  const out = {};
  for (const [name, clip] of Object.entries(clips ?? {})) {
    out[name] = {
      ...clip,
      keys: (clip.keys ?? []).map((key) => {
        const nodes = cloneNodes(key.nodes);
        for (const uid of idSet) {
          const pose = nodes[uid];
          if (!pose) continue;
          pose.p[0] = round3(pose.p[0] + delta.x);
          pose.p[1] = round3(pose.p[1] + delta.y);
          pose.p[2] = round3(pose.p[2] + delta.z);
        }
        return { t: key.t, nodes };
      }),
    };
  }
  return out;
}
