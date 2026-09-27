// ─── Configuración del visor de notas ───
// Las notas se agrupan por su carpeta dentro de notes/ (las de la raíz, en «General»).
// Puedes definir categorías propias y cambiar las rutas de las notas especiales sin tocar este fichero:
// crea src/config/notes.local.js (está en el .gitignore) y exporta lo que quieras sobrescribir:
//
//   export const CATEGORY_RULES = [
//     ['Guías', { names: ['SETUP', 'RUNNING'] }],   // nombres de fichero sin .md
//     ['Handoffs', { pattern: /^HANDOFF-/i }],             // regex sobre el nombre de fichero
//     ['Módulos', { path: /^modules\// }],              // regex sobre la ruta relativa a notes/
//   ]
//   export const KNOWN_ISSUES_NOTE = 'errors/KNOWN.md'

import { t } from '../i18n'

// Se ignora la configuración local en la demo (npm run demo) y en el ejecutable genérico (build:exe --no-local-config)
const local = import.meta.env.VITE_PLAYBOARD_DEMO === '1' || import.meta.env.VITE_PLAYBOARD_NO_LOCAL === '1' ? {} : Object.values(import.meta.glob('./notes.local.js', { eager: true }))[0] ?? {}

// Reglas en orden de prioridad; la primera que se cumple asigna la categoría
export const CATEGORY_RULES = local.CATEGORY_RULES ?? []

const GENERAL = 'General'

// Las categorías automáticas se traducen; las de CATEGORY_RULES se muestran tal cual
export function categoryOf(notePath) {
  const file = notePath.split('/').pop()
  const name = file.replace(/\.md$/i, '')
  for (const [category, rule] of CATEGORY_RULES) {
    if (rule.names?.includes(name) || rule.pattern?.test(name) || rule.path?.test(notePath)) return category
  }
  const folder = notePath.includes('/') ? notePath.split('/')[0] : null
  return folder ? t('Carpeta {folder}/', { folder }) : t(GENERAL)
}

// Orden del árbol: primero las categorías de las reglas, luego las carpetas y al final «General»
export function categoryRank(category) {
  const i = CATEGORY_RULES.findIndex(([c]) => c === category)
  if (i >= 0) return i
  return category === t(GENERAL) ? 10000 : 1000
}

export function noteLabel(notePath) {
  const parts = notePath.split('/')
  const file = parts.pop()
  if (file === 'CLAUDE.md') return parts.length ? `${parts.join('/')}/CLAUDE.md` : t('CLAUDE.md (raíz)')
  return file.replace(/\.md$/i, '')
}

// ─── Notas especiales (opcionales) ───
// Si existen, la app las aprovecha; si no, esas funciones simplemente no aparecen. Rutas relativas a notes/.

// Fallos conocidos: las líneas que mencionan un spec por su identificador (p. ej. «flows-020») lo marcan en los reportes
export const KNOWN_ISSUES_NOTE = local.KNOWN_ISSUES_NOTE ?? 'KNOWN-ISSUES.md'
// Histórico por spec: cada «## <nombre-del-spec>» se enlaza desde la ficha del test
export const HISTORY_NOTE = local.HISTORY_NOTE ?? 'HISTORY.md'
// Cobertura: encabezados «## Ámbito — N casos · M ✅» se muestran como barras en la portada de Notas
export const COVERAGE_NOTE = local.COVERAGE_NOTE ?? 'COVERAGE.md'
