// ─── Módulos funcionales ───
// El módulo de un test se deduce del nombre del spec: el primer bloque tras los números
// (crud-009-cart-add-item.spec.ts → cart) o, si no sigue esa convención, su carpeta (checkout/pay.spec.ts → checkout).
// Si un módulo no tiene nombre legible, se muestra su identificador en mayúsculas.
//
// Para poner nombres propios sin tocar este fichero, crea src/config/modules.local.js (está en el .gitignore):
//   export const MODULES = { cart: 'Carrito', auth: 'Autenticación' }
//   export const MODULE_ALIASES = { login: 'auth' }   // agrupa identificadores equivalentes

import { t } from '../i18n'

// En la demo (npm run demo) se ignora la configuración local
const local = import.meta.env.VITE_PLAYBOARD_DEMO === '1' ? {} : Object.values(import.meta.glob('./modules.local.js', { eager: true }))[0] ?? {}

export const MODULE_ALIASES = {
  ...local.MODULE_ALIASES,
}

// Nombres de los módulos de los datos de demostración (scripts/generate-demo.mjs)
const DEMO_MODULES = {
  auth: 'Autenticación', catalog: 'Catálogo', cart: 'Carrito', search: 'Buscador', profile: 'Mi cuenta',
  admin: 'Administración', checkout: 'Checkout', payments: 'Pagos', orders: 'Pedidos', notifications: 'Notificaciones',
}

export const MODULES = {
  ...(import.meta.env.VITE_PLAYBOARD_DEMO === '1' ? DEMO_MODULES : {}),
  ...local.MODULES,
}

export const moduleId = (raw) => MODULE_ALIASES[raw] ?? raw
export const moduleName = (id) => (MODULES[id] ? t(MODULES[id]) : id.toUpperCase())
