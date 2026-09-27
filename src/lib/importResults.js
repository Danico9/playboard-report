// ─── Resultados de «Importar» ───
// Se guardan fuera del componente (y en sessionStorage) para que sigan visibles al cambiar de pantalla o recargar,
// hasta que el usuario los cierre uno a uno o todos a la vez.

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'playboard:import-results'
const listeners = new Set()

function read() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) ?? []
  } catch {
    return []
  }
}

let results = read()

function save(next) {
  results = next
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Sin sessionStorage los resultados solo duran mientras la pestaña esté abierta
  }
  listeners.forEach((l) => l())
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useImportResults = () => useSyncExternalStore(subscribe, () => results)

// Los más recientes primero; cada resultado lleva un id propio para poder cerrarlo
export function addImportResults(list) {
  const at = Date.now()
  save([...list.map((r, i) => ({ ...r, id: `${at}-${i}`, at })), ...results])
}

export const dismissImportResult = (id) => save(results.filter((r) => r.id !== id))
export const clearImportResults = () => save([])
