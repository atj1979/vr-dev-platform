const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function align4(value) {
  return (value + 3) & ~3;
}

export function parseGlb(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('Not a glTF binary');
  }
  const jsonLength = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  if (jsonType !== JSON_CHUNK) throw new Error('glB JSON chunk is missing');
  const jsonStart = 20;
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(jsonStart, jsonStart + jsonLength)));
  let bin = new Uint8Array(0);
  const binHeader = jsonStart + jsonLength;
  if (binHeader + 8 <= bytes.byteLength && view.getUint32(binHeader + 4, true) === BIN_CHUNK) {
    const binLength = view.getUint32(binHeader, true);
    bin = bytes.slice(binHeader + 8, binHeader + 8 + binLength);
  }
  return { json, bin };
}

export function packGlb(json, bin) {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = align4(jsonBytes.length) - jsonBytes.length;
  const binPad = align4(bin.length) - bin.length;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length + binPad;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length + jsonPad, true);
  view.setUint32(16, JSON_CHUNK, true);
  out.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i += 1) out[20 + jsonBytes.length + i] = 0x20;
  const binAt = 20 + jsonBytes.length + jsonPad;
  view.setUint32(binAt, bin.length + binPad, true);
  view.setUint32(binAt + 4, BIN_CHUNK, true);
  out.set(bin, binAt + 8);
  return out;
}

export function repackBufferViews(json, bin, replacements) {
  const parts = [];
  let cursor = 0;
  for (let i = 0; i < (json.bufferViews || []).length; i += 1) {
    const view = json.bufferViews[i];
    const pad = align4(cursor) - cursor;
    cursor += pad;
    const bytes = replacements.get(i)
      ?? bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const copy = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    parts.push(new Uint8Array(pad), copy);
    view.buffer = 0;
    view.byteOffset = cursor;
    view.byteLength = copy.byteLength;
    cursor += copy.byteLength;
  }
  const body = new Uint8Array(align4(cursor));
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.byteLength;
  }
  if (!json.buffers) json.buffers = [{}];
  json.buffers[0].byteLength = body.byteLength;
  return body;
}
