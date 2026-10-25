// ─── Carpeta de datos de la versión web ───
// La elige el usuario (File System Access API) y se guarda en IndexedDB, donde la leen tanto la página como el service worker.
// Se guarda como { kind: 'folder', handle } o, para los datos de ejemplo, { kind: 'opfs', name } (una carpeta del
// almacenamiento privado del navegador para este sitio, OPFS).

const DB = 'playboard-web'

const open = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

async function tx(mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction('kv', mode)
    const req = fn(t.objectStore('kv'))
    t.oncomplete = () => resolve(req.result)
    t.onerror = () => reject(t.error)
  })
}

export const getRoot = () => tx('readonly', (s) => s.get('root'))
export const setRoot = (value) => tx('readwrite', (s) => s.put(value, 'root'))
export const clearRoot = () => tx('readwrite', (s) => s.delete('root'))

const sub = (dir, name) => dir.getDirectoryHandle(name).catch(() => null)

// La carpeta elegida puede ser la que contiene reports/ (y notes/) o directamente reports/.
// El navegador no deja subir a la carpeta padre, así que si se elige reports/ no hay notas.
export async function resolveFolders(dir) {
  const reports = await sub(dir, 'reports')
  if (reports) return { reports, notes: await sub(dir, 'notes') }
  if (await sub(dir, 'playwright-reports')) return { reports: dir, notes: null }
  return null
}

// Carpeta de la caché (lo que en la app normal es .cache/data) para una carpeta de datos
export const cacheName = (root) => `cache-${root.kind}-${root.kind === 'opfs' ? root.name : root.handle.name}`

// Directorio de la carpeta guardada, o null si no hay o falta el permiso (el permiso solo se puede pedir desde la página)
export async function rootDirectory(root) {
  if (!root) return null
  if (root.kind === 'opfs') return (await navigator.storage.getDirectory()).getDirectoryHandle(root.name).catch(() => null)
  return (await root.handle.queryPermission({ mode: 'readwrite' })) === 'granted' ? root.handle : null
}
