const DB_NAME = 'vr-dev-platform';
const STORE = 'projects';
const LOCAL_KEY = 'vrdev.project';

function memoryStore() {
  const map = new Map();
  return {
    async put(project) { map.set(project.id, project); },
    async get(id) { return map.get(id) || null; },
    async all() { return [...map.values()]; },
  };
}

let fallback = null;

function openDb() {
  if (typeof indexedDB === 'undefined') {
    fallback ??= memoryStore();
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function readLocalSnapshot() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeLocalSnapshot(project) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(project));
}

export async function saveProjectRecord(project) {
  writeLocalSnapshot(project);
  const db = await openDb();
  if (!db) {
    await fallback.put(project);
    return project;
  }
  await idbRequest(db.transaction(STORE, 'readwrite').objectStore(STORE).put(project));
  return project;
}

export async function listProjectRecords() {
  const db = await openDb();
  if (!db) return fallback.all();
  const rows = await idbRequest(db.transaction(STORE).objectStore(STORE).getAll());
  return rows.sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export async function readProjectRecord(id) {
  const db = await openDb();
  if (!db) return fallback.get(id);
  return idbRequest(db.transaction(STORE).objectStore(STORE).get(id));
}
