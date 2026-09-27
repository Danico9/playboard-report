// ─── Idioma de la interfaz (castellano por defecto / inglés) ───
// Los textos se escriben en castellano dentro de t('…'); en inglés se buscan en en.js.
// Si falta una traducción se muestra el texto en castellano (en desarrollo se listan en window.__i18nMissing).
// Al cambiar de idioma se vuelve a montar la app (App.jsx), así que t() puede leer el idioma sin hooks.

import { useSyncExternalStore } from 'react'
import { enUS, es } from 'date-fns/locale'
import en from './en'

const KEY = 'playboard-lang'
const listeners = new Set()

function read() {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'es'
  } catch {
    return 'es'
  }
}

let lang = read()
document.documentElement.lang = lang

const missing = new Set()
if (import.meta.env.DEV) window.__i18nMissing = missing

export function setLang(next) {
  lang = next === 'en' ? 'en' : 'es'
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // Sin almacenamiento disponible: el cambio dura hasta recargar
  }
  document.documentElement.lang = lang
  listeners.forEach((l) => l())
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const getLang = () => lang
export const useLang = () => useSyncExternalStore(subscribe, () => lang)

// t('Hay {n} zips', { n: 3 })
export function t(text, vars) {
  let out = text
  if (lang === 'en') {
    if (text in en) out = en[text]
    else if (import.meta.env.DEV) missing.add(text)
  }
  return vars ? out.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '')) : out
}

export const dateLocale = () => (lang === 'en' ? enUS : es)
export const numberLocale = () => (lang === 'en' ? 'en-US' : 'es-ES')
