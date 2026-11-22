import * as THREE from 'three';
import { parseProjectFile, serializeProject } from '../core/projectFile.js';
import { STARTER_CODE } from '../editor/template.js';
import { downloadBytes } from '../export/exportAsset.js';
import { exportWorkshop } from '../export/exportAsset.js';
import { formatError, runModule } from '../preview/runner.js';
import { listProjectRecords, readProjectRecord, saveProjectRecord } from '../projects/store.js';
import { connectAgentSocket } from '../mcp/bridge.js';
import { publicSettings, secretSettings, updateSettings } from '../ai/settings.js';
import { listCommandSpecs } from '../commands/registry.js';

export function createPreviewService(group, getCode) {
  let session = null;
  let auto = true;
  let error = '';
  let running = false;

  async function run(code) {
    running = true;
    error = '';
    const source = code ?? getCode();
    try {
      session?.dispose();
      session = null;
      session = await runModule(source, THREE, group);
    } catch (err) {
      error = formatError(err);
      session = null;
    } finally {
      running = false;
    }
    return getStatus();
  }

  function clear() {
    session?.dispose();
    session = null;
    error = '';
    return getStatus();
  }

  function setAuto(enabled) {
    auto = Boolean(enabled);
    return getStatus();
  }

  function getStatus() {
    return { auto, error, running };
  }

  function update(dt, time) {
    try {
      session?.update(dt, time);
    } catch (err) {
      error = formatError(err);
      session = null;
    }
  }

  return { run, clear, setAuto, getStatus, update, isAuto: () => auto };
}

export function createProjectService({ editor, workshop, preview }) {
  let id = `proj_${Math.random().toString(36).slice(2, 8)}`;
  let name = 'signal post';

  function snapshot() {
    return {
      id,
      name,
      code: editor.snapshot().text,
      workshop: workshop.serialize(),
      updated: Date.now(),
    };
  }

  function apply(project, nextName) {
    id = project.id || id;
    name = nextName || project.name || name;
    editor.replace(project.code || STARTER_CODE);
    if (project.workshop) workshop.load(project.workshop);
    else {
      workshop.clear();
      workshop.addStarter();
    }
  }

  return {
    get() { return { id, name, saved: true }; },
    snapshot,
    async save() {
      await saveProjectRecord(snapshot());
      workshop.state.status = 'Saved';
      workshop.touch();
      return { id, name, saved: true };
    },
    async create(nextName) {
      id = `proj_${Math.random().toString(36).slice(2, 8)}`;
      name = nextName || 'untitled';
      editor.replace(STARTER_CODE);
      workshop.clear();
      workshop.addStarter();
      await preview.run(STARTER_CODE);
      await saveProjectRecord(snapshot());
      return { id, name, saved: true };
    },
    rename(nextName) {
      name = nextName;
      return { id, name, saved: false };
    },
    async list() {
      const projects = await listProjectRecords();
      return {
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
          updated: project.updated || 0,
        })),
      };
    },
    async load(projectId) {
      const project = await readProjectRecord(projectId);
      if (!project) throw new Error('Project not found');
      apply(project);
      await preview.run(project.code || '');
      return { id, name, saved: true };
    },
    exportFile() {
      const body = JSON.stringify(serializeProject(snapshot()), null, 2);
      const filename = `${name.replace(/[^\w.-]+/g, '_') || 'project'}.vrproj.json`;
      const bytes = new TextEncoder().encode(body);
      const downloaded = downloadBytes(filename, bytes, 'application/json');
      return { filename, byteLength: bytes.byteLength, downloaded };
    },
    async importText(text) {
      const parsed = parseProjectFile(text);
      id = `proj_${Math.random().toString(36).slice(2, 8)}`;
      name = parsed.name || 'imported';
      editor.replace(parsed.code);
      if (parsed.workshop) workshop.load(parsed.workshop);
      await preview.run(parsed.code);
      await saveProjectRecord(snapshot());
      return { id, name, saved: true };
    },
    adopt(project) {
      if (!project) return;
      apply(project);
    },
  };
}

export function createSettingsService() {
  let socket = null;
  let connected = false;

  function view() {
    return { ...publicSettings(secretSettings()), connected };
  }

  return {
    get: view,
    set(partial) {
      updateSettings(partial);
      return view();
    },
    connect(url) {
      const target = (url || secretSettings().agentSocketUrl || '').trim();
      if (!target) throw new Error('Set an agent WebSocket URL first');
      updateSettings({ agentSocketUrl: target });
      socket?.close();
      socket = connectAgentSocket(target, (status) => {
        connected = status === 'connected';
      });
      return view();
    },
    disconnect() {
      socket?.close();
      socket = null;
      connected = false;
      return view();
    },
  };
}

export function commandCatalog() {
  return {
    commands: listCommandSpecs().map((spec) => ({
      name: spec.name,
      description: spec.description,
      destructive: Boolean(spec.destructive),
      aiVisible: spec.aiVisible !== false,
    })),
  };
}
