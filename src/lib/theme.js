// ─── Tema (oscuro por defecto / claro) ───
// Se guarda en localStorage solo como preferencia de este navegador; si no está disponible, se usa el oscuro.

import { useSyncExternalStore } from 'react'
import { CHART_THEMES } from '../config/status'

const KEY = 'playboard-theme'
const listeners = new Set()

function read() {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

let theme = read()

function apply() {
  document.documentElement.dataset.theme = theme
}
apply()

export function setTheme(next) {
  theme = next === 'light' ? 'light' : 'dark'
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Sin almacenamiento disponible: el cambio dura hasta recargar
  }
  apply()
  listeners.forEach((l) => l())
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useTheme = () => useSyncExternalStore(subscribe, () => theme)
export const useChartColors = () => CHART_THEMES[useTheme()]
