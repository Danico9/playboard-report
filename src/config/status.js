// ─── Estados de un test ───
// Las etiquetas son getters para que se traduzcan con el idioma activo

import { getLang, t } from '../i18n'

export const STATUS = {
  passed: { get label() { return t('Pasado') }, get plural() { return t('Pasados') }, icon: '✓', color: '#0ca30c' },
  flaky: { get label() { return t('Flaky') }, get plural() { return t('Flaky') }, icon: '↻', color: '#fab219' },
  failed: { get label() { return t('Fallido') }, get plural() { return t('Fallidos') }, icon: '✕', color: '#d03b3b' },
  skipped: { get label() { return t('Saltado') }, get plural() { return t('Saltados') }, icon: '⤼', color: '#6b7280' },
}

export const STATUS_ORDER = ['passed', 'flaky', 'failed', 'skipped']

// Test eliminado: ya no aparece en el reporte (borrado, renombrado o excluido de la suite).
// No es un estado de Playwright: un test saltado sí sigue apareciendo, con estado «saltado».
export const REMOVED = { get label() { return t('Eliminado') }, get plural() { return t('Eliminados') }, icon: '⊘' }

// Ejecuciones seguidas de su suite en las que un test tiene que faltar para darlo por eliminado
export const REMOVED_AFTER_RUNS = 5

// Colores de las gráficas por tema (los SVG no pueden usar las variables CSS en sus atributos)
export const CHART_THEMES = {
  dark: { surface: '#1a1a19', grid: '#2c2c2a', axis: '#383835', muted: '#898781', text2: '#c3c2b7', accent: '#3987e5', hover: 'rgba(255,255,255,0.04)' },
  light: { surface: '#ffffff', grid: '#e8e7e2', axis: '#c3c2b7', muted: '#6d6c67', text2: '#52514e', accent: '#2a78d6', hover: 'rgba(11,11,11,0.04)' },
}

export const SKIP_REASON = {
  get skip() { return t('Marcado con test.skip()') },
  get fixme() { return t('Marcado con test.fixme()') },
  get 'not-run'() { return t('No llegó a ejecutarse (normalmente por un fallo previo en el mismo fichero serial)') },
}

// Umbrales del % de éxito para colorear calendario y tablas
export function healthOf(rate) {
  if (rate == null) return null
  if (rate >= 0.95) return 'passed'
  if (rate >= 0.85) return 'flaky'
  return 'failed'
}
export const HEALTH_LABEL = {
  get passed() { return getLang() === 'en' ? '≥ 95%' : '≥ 95 %' },
  get flaky() { return getLang() === 'en' ? '85–95%' : '85–95 %' },
  get failed() { return getLang() === 'en' ? '< 85%' : '< 85 %' },
}
