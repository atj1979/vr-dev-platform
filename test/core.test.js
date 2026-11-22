import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { finalizeClipKeys, sanitizeId, shiftClipPositions } from '../src/core/assetSpec.js';
import {
  createBuffer,
  insertText,
  redo,
  selectedText,
  setCaret,
  textOf,
  undo,
} from '../src/core/buffer.js';
import { highlightLines } from '../src/core/highlight.js';
import { parseProjectFile, serializeProject } from '../src/core/projectFile.js';
import { validate } from '../src/commands/validate.js';
import { zipStore } from '../src/core/zipStore.js';

describe('editor buffer', () => {
  it('inserts, selects, and undoes', () => {
    const buf = createBuffer('hello');
    setCaret(buf, 0, 5, false);
    insertText(buf, '!');
    expect(textOf(buf)).toBe('hello!');
    setCaret(buf, 0, 0, false);
    setCaret(buf, 0, 5, true);
    expect(selectedText(buf)).toBe('hello');
    insertText(buf, 'yo');
    expect(textOf(buf)).toBe('yo!');
    expect(undo(buf)).toBe(true);
    expect(textOf(buf)).toBe('hello!');
    expect(redo(buf)).toBe(true);
    expect(textOf(buf)).toBe('yo!');
  });

  it('splits lines on enter', () => {
    const buf = createBuffer('ab');
    setCaret(buf, 0, 1, false);
    insertText(buf, '\n');
    expect(buf.lines).toEqual(['a', 'b']);
  });
});

describe('highlighter', () => {
  it('marks keywords, strings, and comments', () => {
    const [line, next] = highlightLines(['const name = "lamp"; // note', '/* keep']);
    expect(line.map((token) => token.type)).toContain('keyword');
    expect(line.map((token) => token.type)).toContain('string');
    expect(line.map((token) => token.type)).toContain('comment');
    expect(next[0]).toEqual({ type: 'comment', text: '/* keep' });
  });
});

describe('asset spec', () => {
  it('sanitizes ids and closes loopable clips', () => {
    expect(sanitizeId('Signal Post!')).toBe('signal_post');
    const keys = finalizeClipKeys('idle', {
      loop: true,
      duration: 1,
      keys: [{ t: 0, nodes: { a: { p: [0, 0, 0], q: [0, 0, 0, 1], s: [1, 1, 1] } } }],
    });
    expect(keys.at(-1).t).toBe(1);
    expect(keys.at(-1).nodes.a.p).toEqual([0, 0, 0]);
    expect(() => finalizeClipKeys('dance', { keys: [{ t: 0, nodes: {} }] })).toThrow(/dance/);
  });

  it('shifts only the requested pose keys', () => {
    const shifted = shiftClipPositions({
      idle: { keys: [{ t: 0, nodes: { a: { p: [1, 2, 3], q: [0, 0, 0, 1], s: [1, 1, 1] } } }] },
    }, ['a'], { x: 1, y: -2, z: 0.5 });
    expect(shifted.idle.keys[0].nodes.a.p).toEqual([2, 0, 3.5]);
  });
});

describe('project files', () => {
  it('round-trips a project and accepts raw modules', () => {
    const raw = serializeProject({ name: 'post', code: 'export default function(){}', workshop: { parts: [] } });
    const parsed = parseProjectFile(JSON.stringify(raw));
    expect(parsed.name).toBe('post');
    expect(parseProjectFile('export default function () {}').code).toContain('export default');
  });
});

describe('schema validation', () => {
  it('requires fields and rejects extras', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['type'],
      properties: { type: { type: 'string', enum: ['box', 'sphere'] } },
    };
    expect(validate(schema, { type: 'box' })).toBe('');
    expect(validate(schema, {})).toMatch(/required/);
    expect(validate(schema, { type: 'box', extra: 1 })).toMatch(/not allowed/);
  });
});

describe('zip store', () => {
  it('builds an archive Python can read', () => {
    const zip = zipStore([
      { name: 'public/assets/props/post/post.json', data: '{"id":"post"}' },
      { name: 'public/assets/manifest.json', data: '{"assets":[]}' },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'vrdev-'));
    const file = join(dir, 'pack.zip');
    writeFileSync(file, zip);
    const listing = execFileSync('python3', ['-c', `import zipfile; print("\\n".join(sorted(zipfile.ZipFile(${JSON.stringify(file)}).namelist())))`], { encoding: 'utf8' });
    expect(listing.trim().split('\n')).toEqual([
      'public/assets/manifest.json',
      'public/assets/props/post/post.json',
    ]);
  });
});
