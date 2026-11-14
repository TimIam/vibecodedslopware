// Persistence: designs in localStorage, images and custom ornaments in IndexedDB.
const DB = 'tree-planner', STORES = ['customs', 'sources', 'papers', 'rooms'];
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => STORES.forEach(s => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode), s = t.objectStore(store), out = fn(s); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };
export const idb = {
  put: (store, v) => tx(store, 'readwrite', s => s.put(v)),
  get: (store, id) => tx(store, 'readonly', s => s.get(id)),
  del: (store, id) => tx(store, 'readwrite', s => s.delete(id)),
  all: (store) => tx(store, 'readonly', s => s.getAll()),
};
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const KEY = 'tp.designs';
export const designs = {
  list() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } },
  save(d) { const all = designs.list().filter(x => x.id !== d.id); all.unshift({ ...d, saved: Date.now() }); localStorage.setItem(KEY, JSON.stringify(all)); },
  remove(id) { localStorage.setItem(KEY, JSON.stringify(designs.list().filter(x => x.id !== id))); },
  get(id) { return designs.list().find(x => x.id === id); },
};

export function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
export function fileToDataURL(file, maxSide = 1600) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const s = Math.min(1, maxSide / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.9)); };
    img.onerror = rej; img.src = url;
  });
}

// Custom ornaments are cached as loaded assets (with image elements) for the builder.
export const customCache = new Map();
export async function loadCustoms() {
  const all = await idb.all('customs');
  customCache.clear();
  for (const a of all) { try { a._img = await loadImage(a.cutout); } catch { } customCache.set(a.id, a); }
  return customCache;
}
export const paperCache = new Map();
export async function loadPapers() {
  for (const p of await idb.all('papers')) if (!paperCache.has(p.id)) { try { paperCache.set(p.id, await loadImage(p.src)); } catch { } }
  return paperCache;
}
