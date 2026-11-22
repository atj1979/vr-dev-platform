import { PROJECT_FORMAT, PROJECT_VERSION } from './assetSpec.js';

export function serializeProject({ id, name, code, workshop }) {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    id: id ?? null,
    name: name || 'untitled',
    code: code ?? '',
    workshop: workshop ?? { parts: [], clips: {} },
  };
}

export function parseProjectFile(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) throw new Error('The file is empty');
  if (trimmed.startsWith('{')) {
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new Error('Project JSON could not be parsed');
    }
    if (data.format !== PROJECT_FORMAT) {
      throw new Error('This JSON is not a vr-dev-platform project');
    }
    if (typeof data.code !== 'string') throw new Error('Project is missing code');
    return {
      name: String(data.name || 'imported'),
      code: data.code,
      workshop: data.workshop ?? { parts: [], clips: {} },
    };
  }
  return {
    name: 'imported',
    code: trimmed,
    workshop: null,
  };
}
