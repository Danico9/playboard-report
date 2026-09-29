// ─── Módulos funcionales ───
// El módulo de cada test se decide así (gana la primera que encaje):
//   1. Tag explícito del test: test('…', { tag: '@module:cart' }) → cart
//   2. Reglas propias de MODULE_RULES (por tag o por ruta del spec), en src/config/modules.local.js
//   3. Convención de nombre <prefijo>-<NNN>-<módulo>-…: crud-009-cart-add-item.spec.ts → cart
//   4. Carpeta del spec: checkout/pay.spec.ts → checkout (si está en la raíz: general)
// Si un módulo no tiene nombre legible, se muestra su identificador en mayúsculas.
//
// Para personalizarlo sin tocar este fichero, crea src/config/modules.local.js (está en el .gitignore):
//   export const MODULES = { cart: 'Carrito', auth: 'Autenticación' }        // nombres legibles
//   export const MODULE_ALIASES = { login: 'auth' }                          // agrupa identificadores equivalentes
//   export const MODULE_RULES = [
//     { tag: '@payments', module: 'payments' },                              // tag exacto
//     { path: /^api\//, module: 'api' },                                     // regex sobre la ruta del spec
//     { path: /login|signup/i, module: 'auth' },
//   ]

import { t } from '../i18n'

// Se ignora la configuración local en la demo (npm run demo) y en el ejecutable genérico (npm run build:exe:generic)
const local = import.meta.env.VITE_PLAYBOARD_DEMO === '1' || import.meta.env.VITE_PLAYBOARD_NO_LOCAL === '1' ? {} : Object.values(import.meta.glob('./modules.local.js', { eager: true }))[0] ?? {}

export const MODULE_ALIASES = {
  ...local.MODULE_ALIASES,
}

export const MODULE_RULES = local.MODULE_RULES ?? []

// Nombres de los módulos de los datos de demostración (scripts/generate-demo.mjs)
const DEMO_MODULES = {
  auth: 'Autenticación', catalog: 'Catálogo', cart: 'Carrito', search: 'Buscador', profile: 'Mi cuenta',
  admin: 'Administración', checkout: 'Checkout', payments: 'Pagos', orders: 'Pedidos', notifications: 'Notificaciones',
}

export const MODULES = {
  ...(import.meta.env.VITE_PLAYBOARD_DEMO === '1' ? DEMO_MODULES : {}),
  ...local.MODULES,
}

const TAG_PREFIX = '@module:'

function ruleMatches(rule, tags, file) {
  if (rule.tag != null && (rule.tag instanceof RegExp ? tags.some((tag) => rule.tag.test(tag)) : tags.includes(rule.tag))) return true
  if (rule.path != null && (rule.path instanceof RegExp ? rule.path.test(file) : file.startsWith(rule.path))) return true
  return false
}

// test: cualquier objeto con { module, tags, file } (metadatos del resumen o test de una ejecución)
export function moduleOfTest(test) {
  const tags = test?.tags ?? []
  const file = test?.file ?? ''
  const tagged = tags.find((tag) => tag.startsWith(TAG_PREFIX))
  let raw = tagged ? tagged.slice(TAG_PREFIX.length) : null
  if (!raw) raw = MODULE_RULES.find((rule) => ruleMatches(rule, tags, file))?.module ?? null
  if (!raw) raw = test?.module ?? 'general'
  return MODULE_ALIASES[raw] ?? raw
}

export const moduleName = (id) => (MODULES[id] ? t(MODULES[id]) : id.toUpperCase())
