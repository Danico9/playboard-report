// ─── Versión web (npm run build:web) ───
// Sin servidor: la API la sirve un service worker (web/sw.js) que lee la carpeta que elige el usuario en su navegador.
// Aquí están la URL base (GitHub Pages sirve la app en /playboard-report/), el estado de la carpeta para la pantalla
// de bienvenida (components/Welcome.jsx) y los botones que necesitan otro camino sin servidor (descargas y trazas).

import { useSyncExternalStore } from 'react'
import { unzipSync } from 'fflate'
import { clearRoot, getRoot, resolveFolders, setRoot } from '../../web/folder.js'
import { t } from '../i18n'
import { setDemoModuleNames } from '../config/modules'

export const WEB_MODE = !!import.meta.env.VITE_PLAYBOARD_WEB
const BASE = import.meta.env.BASE_URL // «/» en la app normal

// URL de un recurso de la app («/api/summary» → «/playboard-report/api/summary» en GitHub Pages).
// Si ya lleva la base se deja igual (p. ej. una URL de reports/ que se pide luego con useResource)
export const appUrl = (path) => (BASE !== '/' && path.startsWith(BASE) ? path : BASE + path.replace(/^\//, ''))
// basename de React Router: «/playboard-report» (o vacío)
export const ROUTER_BASENAME = BASE.replace(/\/$/, '')

// ─── Estado de la carpeta ───
// phase: 'checking' | 'welcome' | 'loading' | 'ready'   (los mensajes de 'loading' se guardan en castellano y se traducen al mostrarlos)
//   welcome: { saved: { name, kind } | null, error }
//   ready:   { folder: { name, kind, notes }, timings }

let gate = { phase: 'checking' }
// Antes de mostrar la app con una carpeta (o los datos de ejemplo) se avisa, para que nada de lo cargado de la anterior
// se siga viendo: lib/store.js vacía su caché (se apunta él, así este módulo no depende del store)
const folderListeners = new Set()
export const onFolderLoaded = (fn) => folderListeners.add(fn)
const listeners = new Set()
const setGate = (next) => {
  gate = next
  listeners.forEach((l) => l())
}
export const useWebGate = () =>
  useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => gate)

export const canPickFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window
export const webSupported = () => 'serviceWorker' in navigator && !!navigator.storage?.getDirectory

async function registerWorker() {
  const reg = await navigator.serviceWorker.register(appUrl('sw.js'), { scope: BASE })
  // Si ya había uno, que se use la versión publicada ahora
  await reg.update().catch(() => {})
  const sw = reg.installing ?? reg.waiting ?? reg.active
  if (sw && sw.state !== 'activated') {
    await new Promise((resolve) => sw.addEventListener('statechange', () => sw.state === 'activated' && resolve()))
  }
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
  }
}

async function readFolder(root, message) {
  setGate({ phase: 'loading', message })
  await registerWorker()
  const r = await fetch(appUrl('api/web/reload'))
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error ?? `${r.status} ${r.statusText}`)
  const dir = root.kind === 'opfs' ? await (await navigator.storage.getDirectory()).getDirectoryHandle(root.name) : root.handle
  const { notes } = (await resolveFolders(dir)) ?? {}
  setDemoModuleNames(root.kind === 'opfs')
  folderListeners.forEach((fn) => fn())
  setGate({ phase: 'ready', folder: { name: dir.name, kind: root.kind, notes: !!notes }, timings: data })
}

const savedInfo = (root) => (root ? { name: root.kind === 'opfs' ? root.name : root.handle.name, kind: root.kind } : null)
const fail = async (e) => setGate({ phase: 'welcome', saved: savedInfo(await getRoot().catch(() => null)), error: e.message })

// Al abrir la app: si ya hay carpeta con permiso (o son los datos de ejemplo), se lee directamente
export async function startWeb() {
  if (gate.phase !== 'checking') return
  try {
    if (!webSupported()) return setGate({ phase: 'welcome', saved: null, error: null })
    const root = await getRoot()
    const granted = root && (root.kind === 'opfs' || (await root.handle.queryPermission({ mode: 'readwrite' })) === 'granted')
    if (granted) await readFolder(root, 'Leyendo la carpeta…')
    else setGate({ phase: 'welcome', saved: savedInfo(root), error: null })
  } catch (e) {
    await fail(e)
  }
}

async function openHandle(handle) {
  if (!(await resolveFolders(handle))) {
    throw new Error(t('«{name}» no tiene reportes. Elige la carpeta que contiene reports/ y notes/ (o la propia reports/).', { name: handle.name }))
  }
  const root = { kind: 'folder', handle }
  await setRoot(root)
  await readFolder(root, 'Procesando los reportes…')
}

export async function pickFolder() {
  try {
    await openHandle(await window.showDirectoryPicker({ id: 'playboard', mode: 'readwrite' }))
  } catch (e) {
    if (e.name === 'AbortError') return
    await fail(e)
  }
}

// La carpeta de la última vez: el navegador la recuerda, pero hay que volver a dar permiso
export async function resumeFolder() {
  try {
    const root = await getRoot()
    if ((await root.handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error(t('Sin permiso para leer la carpeta.'))
    await readFolder(root, 'Leyendo la carpeta…')
  } catch (e) {
    await fail(e)
  }
}

// Datos de ejemplo (los de npm run demo, en demo.zip): se copian al almacenamiento privado del navegador
export async function loadDemo() {
  try {
    setGate({ phase: 'loading', message: 'Preparando los datos de ejemplo…' })
    const r = await fetch(appUrl('demo.zip'))
    if (!r.ok) throw new Error(`demo.zip: ${r.status}`)
    const files = unzipSync(new Uint8Array(await r.arrayBuffer()))
    const opfs = await navigator.storage.getDirectory()
    await opfs.removeEntry('demo', { recursive: true }).catch(() => {})
    const root = await opfs.getDirectoryHandle('demo', { create: true })
    for (const [name, data] of Object.entries(files)) {
      if (name.endsWith('/')) continue
      const parts = name.split('/')
      let dir = root
      for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true })
      const w = await (await dir.getFileHandle(parts.at(-1), { create: true })).createWritable()
      await w.write(data)
      await w.close()
    }
    const saved = { kind: 'opfs', name: 'demo' }
    await setRoot(saved)
    await readFolder(saved, 'Procesando los reportes…')
  } catch (e) {
    await fail(e)
  }
}

// Vuelve a leer la carpeta (reportes nuevos): la app recarga después sus datos
export async function reloadData() {
  const r = await fetch(appUrl('api/web/reload'))
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  setGate({ ...gate, timings: await r.json() })
}

// «Añadir zips» de la pantalla Importar: el service worker copia cada zip en reports/ de la carpeta elegida
export async function addZipFiles(files, onProgress) {
  for (const [i, file] of files.entries()) {
    onProgress?.(i + 1)
    const r = await fetch(appUrl(`api/web/add-zip?name=${encodeURIComponent(file.name)}`), {
      method: 'POST',
      headers: { 'x-playboard': '1' },
      body: file,
    })
    if (!r.ok) throw new Error(`${file.name}: ${r.status} ${await r.text()}`)
  }
}

// Volver a la bienvenida para elegir otra carpeta
export async function changeFolder() {
  await clearRoot()
  // La pantalla en la que estaba (una ejecución, un test…) es de la carpeta anterior: se vuelve al inicio
  window.history.replaceState(null, '', appUrl('/'))
  setGate({ phase: 'welcome', saved: null, error: null })
}

// ─── Descargas y trazas ───
// Chrome no pasa las descargas por el service worker, y el visor de trazas que va dentro de cada reporte
// registra su propio service worker, que no existe sin servidor: los dos botones leen primero el fichero.

const readBlob = async (url) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.blob()
}

export async function downloadFile(url) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(await readBlob(url))
  a.download = url.split('/').pop()
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 60000)
}

// Visor de trazas de Playwright publicado junto a la web (trace-viewer/, copiado de playwright-core al compilar):
// avisa con {method:'ready'} a la ventana que lo abrió y acepta la traza con {method:'load', params:{trace: Blob}}
export function openTraceViewer(url) {
  const viewer = window.open(appUrl('trace-viewer/index.html'))
  let blob = null
  let ready = false
  const send = () => {
    if (!blob || !ready) return
    viewer.postMessage({ method: 'load', params: { trace: blob } }, window.location.origin)
    window.removeEventListener('message', onMessage)
  }
  const onMessage = (e) => {
    if (e.source === viewer && e.data?.method === 'ready') {
      ready = true
      send()
    }
  }
  window.addEventListener('message', onMessage)
  readBlob(url).then((b) => { blob = b; send() }, () => viewer?.close())
}
