// ─── Datos de demostración ───
// Genera en .demo/ reportes de Playwright y notas inventados (una tienda online ficticia) con el mismo formato
// que los reales, para probar la app o hacer capturas sin exponer datos de nadie.
// Uso: npm run demo (genera los datos si no existen y arranca la app con ellos). --fresh los regenera.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DEMO_DIR = path.join(ROOT, '.demo')
const RUNS_DIR = path.join(DEMO_DIR, 'reports', 'playwright-reports')

// ─── Aleatoriedad reproducible ───

function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20260927)
const between = (a, b) => a + rand() * (b - a)
const hash = (s, n = 20) => crypto.createHash('sha1').update(s).digest('hex').slice(0, n)

// ─── Suite ficticia ───

const ESC = '\u001b'
const dim = (s) => `${ESC}[2m${s}${ESC}[22m`
const red = (s) => `${ESC}[31m${s}${ESC}[39m`
const green = (s) => `${ESC}[32m${s}${ESC}[39m`

const ERRORS = {
  click: (page, line, name) => `TimeoutError: locator.click: Timeout 15000ms exceeded.\nCall log:\n${dim(`  - waiting for getByRole('button', { name: '${name}' })`)}\n\n   at ../pages/${page}:${line}`,
  text: (page, line, id, exp, rec) => `Error: ${dim('expect(')}${red('locator')}${dim(').')}toHaveText${dim('(')}${green('expected')}${dim(')')} failed\n\nLocator: getByTestId('${id}')\nExpected string: ${green(`"${exp}"`)}\nReceived string: ${red(`"${rec}"`)}\nTimeout: 5000ms\n\n   at ../pages/${page}:${line}`,
  visible: (page, line, sel) => `Error: ${dim('expect(')}${red('locator')}${dim(').')}toBeVisible${dim('()')} failed\n\nLocator: locator('${sel}')\nExpected: visible\nTimeout: 10000ms\nError: element(s) not found\n\n   at ../pages/${page}:${line}`,
  status: (page, line, rec) => `Error: ${dim('expect(')}${red('received')}${dim(').')}toBe${dim('(')}${green('expected')}${dim(')')} // Object.is equality\n\nExpected: ${green('200')}\nReceived: ${red(String(rec))}\n\n   at ../pages/${page}:${line}`,
  network: (url) => `Error: page.goto: net::ERR_CONNECTION_RESET at ${url}\nCall log:\n${dim(`  - navigating to "${url}", waiting until "load"`)}\n\n   at ../utils/navigation.ts:18`,
}

// Cada spec: fichero, proyectos, tests [título, duración media en s, fiabilidad] y cómo falla
const SPECS = [
  { file: 'crud/crud-001-auth-login.spec.ts', projects: ['chromium', 'firefox'], describe: 'Inicio de sesión', err: () => ERRORS.visible('auth/LoginPage.ts', 37, '.toast-success'),
    tests: [['Login con credenciales válidas', 8], ['Login con contraseña incorrecta muestra error', 6], ['Bloqueo tras 5 intentos fallidos', 14], ['Recordar sesión entre visitas', 11], ['Cerrar sesión', 5]] },
  { file: 'crud/crud-002-auth-password-reset.spec.ts', projects: ['chromium'], describe: 'Recuperar contraseña', err: () => ERRORS.visible('auth/ResetPage.ts', 52, 'text=Revisa tu correo'),
    tests: [['Solicitar enlace de recuperación', 9], ['Cambiar contraseña con enlace válido', 16], ['Enlace caducado muestra aviso', 7]] },
  { file: 'crud/crud-003-catalog-filters.spec.ts', projects: ['chromium', 'firefox'], describe: 'Catálogo · filtros', err: () => ERRORS.text('catalog/CatalogPage.ts', 64, 'results-count', '24 productos', '0 productos'),
    tests: [['Filtrar por categoría', 12], ['Filtrar por rango de precio', 13], ['Combinar filtros y limpiar', 18], ['Ordenar por precio ascendente', 10], ['Paginación mantiene los filtros', 15]] },
  { file: 'crud/crud-004-catalog-product-detail.spec.ts', projects: ['chromium'], describe: 'Ficha de producto', err: () => ERRORS.visible('catalog/ProductPage.ts', 29, '[data-testid="gallery"]'),
    tests: [['Ver galería de imágenes', 9], ['Elegir talla y color', 11], ['Producto agotado deshabilita la compra', 7], ['Valoraciones y comentarios', 13]] },
  { file: 'crud/crud-005-cart-add-remove.spec.ts', projects: ['chromium', 'firefox'], describe: 'Carrito', err: () => ERRORS.text('cart/CartPage.ts', 88, 'cart-total', '59,90 €', '64,90 €'),
    tests: [['Añadir producto al carrito', 8], ['Cambiar cantidades recalcula el total', 12], ['Eliminar producto', 7], ['El carrito se conserva al recargar', 10]] },
  { file: 'crud/crud-006-cart-coupons.spec.ts', projects: ['chromium'], describe: 'Cupones', err: () => ERRORS.text('cart/CouponBox.ts', 41, 'coupon-message', 'Cupón aplicado', 'Cupón no válido'),
    tests: [['Aplicar cupón de porcentaje', 10], ['Aplicar cupón de importe fijo', 10], ['Cupón caducado', 6], ['Solo un cupón por pedido', 9]] },
  { file: 'crud/crud-007-search-autocomplete.spec.ts', projects: ['chromium', 'firefox'], describe: 'Buscador', err: () => ERRORS.click('search/SearchBar.ts', 23, 'Ver todos los resultados'),
    tests: [['Sugerencias al escribir', 6], ['Búsqueda sin resultados', 5], ['Búsqueda con errores tipográficos', 8], ['Búsqueda tolerante a erratas', 8]] },
  { file: 'crud/crud-008-profile-addresses.spec.ts', projects: ['chromium'], describe: 'Mi cuenta · direcciones', err: () => ERRORS.click('profile/AddressForm.ts', 77, 'Guardar dirección'),
    tests: [['Añadir dirección de envío', 14], ['Editar dirección', 12], ['Marcar dirección predeterminada', 9], ['Eliminar dirección', 8]] },
  { file: 'crud/crud-009-admin-products.spec.ts', projects: ['chromium'], describe: 'Admin · productos', err: () => ERRORS.status('admin/ProductsApi.ts', 58, 500),
    tests: [['Crear producto', 22], ['Editar precio y stock', 17], ['Importar catálogo CSV', 48], ['Despublicar producto', 11]] },
  { file: 'crud/crud-010-admin-users.spec.ts', projects: ['chromium'], describe: 'Admin · usuarios', err: () => ERRORS.visible('admin/UsersPage.ts', 102, 'role=dialog[name="Permisos"]'),
    tests: [['Listar y buscar usuarios', 12], ['Cambiar rol de un usuario', 16], ['Exportar usuarios a Excel', 21]] },
  { file: 'flows/flows-001-checkout-guest.spec.ts', projects: ['chromium'], describe: 'Compra como invitado', err: () => ERRORS.click('checkout/ShippingStep.ts', 45, 'Continuar al pago'),
    tests: [['Compra completa con envío estándar', 64], ['Compra con recogida en tienda', 58]] },
  { file: 'flows/flows-002-checkout-registered.spec.ts', projects: ['chromium'], describe: 'Compra con cuenta', err: () => ERRORS.click('checkout/SummaryStep.ts', 31, 'Confirmar pedido'),
    tests: [['Compra con dirección guardada', 52], ['Compra con varios productos y cupón', 71]] },
  { file: 'flows/flows-003-payments-card.spec.ts', projects: ['chromium'], describe: 'Pago con tarjeta', err: () => ERRORS.click('payments/CardForm.ts', 42, 'Pagar'),
    tests: [['Pago aprobado', 38], ['Pago rechazado por fondos', 33], ['Pago con autenticación 3-D Secure', 49]] },
  { file: 'flows/flows-004-payments-paypal.spec.ts', projects: ['chromium'], describe: 'Pago con PayPal', err: () => ERRORS.network('https://sandbox.paypal.example.com/checkout'),
    tests: [['Pago con PayPal aprobado', 44], ['Cancelar pago en PayPal vuelve al carrito', 36]] },
  { file: 'flows/flows-005-orders-return.spec.ts', projects: ['chromium'], describe: 'Devoluciones', err: () => ERRORS.visible('orders/ReturnPage.ts', 66, 'text=Devolución registrada'),
    tests: [['Solicitar devolución de un producto', 41], ['Devolución fuera de plazo', 19]] },
  { file: 'flows/flows-006-notifications-email.spec.ts', projects: ['chromium'], describe: 'Correos transaccionales', err: () => ERRORS.status('notifications/MailApi.ts', 27, 503),
    tests: [['Correo de confirmación de pedido', 26], ['Correo de envío con seguimiento', 24]] },
  { file: 'chains/flows-007-008-orders-lifecycle.spec.ts', projects: ['chromium-chains'], describe: 'Ciclo de vida del pedido', serial: true, err: () => ERRORS.click('orders/OrderAdmin.ts', 88, 'Marcar como enviado'),
    tests: [['Paso 1: crear pedido', 47], ['Paso 2: preparar pedido en almacén', 33], ['Paso 3: marcar como enviado', 29], ['Paso 4: confirmar entrega', 26], ['Paso 5: facturar', 31]] },
  // Spec sin la convención de nombre: su módulo sale del tag @module:catalog
  { file: 'smoke/homepage.spec.ts', projects: ['chromium'], describe: 'Smoke · portada', tags: ['@smoke', '@module:catalog'], err: () => ERRORS.visible('home/HomePage.ts', 19, '[data-testid="hero-banner"]'),
    tests: [['La portada carga el banner principal', 5], ['Los destacados enlazan a su ficha', 7]] },
]

// Comportamientos especiales (por título) para que la demo cuente una historia
const BEHAVIOUR = {
  'Sugerencias al escribir': { flaky: 0.3 },
  'Combinar filtros y limpiar': { flaky: 0.15 },
  'Pago con autenticación 3-D Secure': { flaky: 0.25 },
  'Correo de envío con seguimiento': { flaky: 0.2 },
  'Importar catálogo CSV': { flaky: 0.12, slow: true },
  'Pago con PayPal aprobado': { brokenBetween: ['2026-08-24', '2026-09-04'] },
  'Cancelar pago en PayPal vuelve al carrito': { brokenBetween: ['2026-08-24', '2026-09-04'] },
  'Cambiar rol de un usuario': { brokenFrom: '2026-09-10' },
  'Paso 3: marcar como enviado': { fail: 0.18 },
  'Exportar usuarios a Excel': { skip: 'Pendiente de habilitar la exportación en el entorno de pruebas' },
  'Cambiar cantidades recalcula el total': { brokenBetween: ['2026-09-15', '2026-09-17'] },
  'Aplicar cupón de importe fijo': { since: '2026-08-17' },
  'Solo un cupón por pedido': { since: '2026-08-31' },
  'Compra con varios productos y cupón': { since: '2026-09-07' },
  'Valoraciones y comentarios': { since: '2026-09-14' },
  // Tests eliminados: uno renombrado (tras fallar unos días) y otro borrado
  'Búsqueda con errores tipográficos': { brokenBetween: ['2026-08-31', '2026-09-04'], until: '2026-09-04' },
  'Búsqueda tolerante a erratas': { since: '2026-09-05' },
  'Devolución fuera de plazo': { until: '2026-08-28' },
}

// ─── PNG mínimo (captura ficticia) ───

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
// Maqueta de una página: cabecera, menú lateral, tarjetas y un aviso rojo donde «falla»
function fakeScreenshot(seed) {
  const w = 640
  const h = 400
  const raw = Buffer.alloc((w * 3 + 1) * h)
  const r = mulberry32(seed)
  const cards = Array.from({ length: 4 }, (_, i) => ({ x: 180 + (i % 2) * 220, y: 80 + Math.floor(i / 2) * 140, w: 200, h: 120 }))
  const alertY = 40 + Math.floor(r() * 300)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      let c = [245, 246, 248]
      if (y < 48) c = [36, 52, 88]
      else if (x < 160) c = [226, 230, 236]
      for (const k of cards) if (x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h) c = y < k.y + 24 ? [210, 220, 235] : [255, 255, 255]
      if (y >= alertY && y < alertY + 34 && x >= 180 && x < 600) c = [248, 215, 215]
      if (y >= alertY && y < alertY + 34 && x >= 180 && x < 186) c = [208, 59, 59]
      const o = y * (w * 3 + 1) + 1 + x * 3
      raw[o] = c[0]
      raw[o + 1] = c[1]
      raw[o + 2] = c[2]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

const ERROR_CONTEXT = (title) => `# Page snapshot\n\n\`\`\`yaml\n- banner:\n  - link "TiendaDemo"\n  - searchbox "Buscar productos"\n- main:\n  - heading "${title}" [level=1]\n  - alert: "No se ha podido completar la operación"\n  - button "Reintentar"\n\`\`\`\n`

// ─── Ejecuciones ───

function runDates() {
  const out = []
  for (let d = new Date(Date.UTC(2026, 7, 3)); d <= new Date(Date.UTC(2026, 8, 25)); d = new Date(d.getTime() + 864e5)) {
    const dow = d.getUTCDay()
    if (dow === 0 || dow === 6) continue
    out.push(new Date(d.getTime() + 2 * 3600e3 + Math.floor(between(0, 240)) * 1000))
    // Alguna ejecución manual a mediodía
    if (rand() < 0.08) out.push(new Date(d.getTime() + 11 * 3600e3 + Math.floor(between(0, 3000)) * 1000))
  }
  return out
}

const COMMITS = [
  'Añade tests de cupones de importe fijo', 'Estabiliza espera del buscador', 'Refactor de page objects del checkout',
  'Actualiza selectores del menú de administración', 'Cubre devoluciones fuera de plazo', 'Sube timeouts del pago con 3-D Secure',
  'Nuevos tests de valoraciones de producto', 'Corrige datos de prueba de direcciones', 'Actualiza Playwright', 'Mejora logs de los flujos de pago',
]

function buildRun(start, runIndex) {
  const day = start.toISOString().slice(0, 10)
  const id = `${start.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}_all-tests`
  const dir = path.join(RUNS_DIR, id)
  const dataDir = path.join(dir, 'data')
  fs.mkdirSync(dataDir, { recursive: true })

  const files = []
  const details = {}
  const stats = { total: 0, expected: 0, unexpected: 0, flaky: 0, skipped: 0 }
  let clock = start.getTime() + 4000
  let busy = 0

  for (const spec of SPECS) {
    const fileId = hash(spec.file)
    const summaryTests = []
    const detailTests = []
    for (const project of spec.projects) {
      let chainBroken = false
      for (const [title, baseDur] of spec.tests) {
        const b = BEHAVIOUR[title] ?? {}
        if ((b.since && day < b.since) || (b.until && day > b.until)) continue
        const testId = `${fileId}-${hash(project + title)}`
        const annotations = []
        const results = []
        let outcome
        const attempt = (status, retry, error) => {
          const duration = Math.round(baseDur * 1000 * between(0.8, 1.35) * (b.slow ? 1.4 : 1))
          const attachments = []
          if (error) {
            const shot = `data/${hash(`${id}${testId}${retry}`, 40)}.png`
            fs.writeFileSync(path.join(dir, shot), fakeScreenshot(runIndex * 1000 + retry + title.length))
            attachments.push({ name: 'screenshot', contentType: 'image/png', path: shot })
            const ctx = `data/${hash(`${id}${testId}${retry}ctx`, 40)}.md`
            fs.writeFileSync(path.join(dir, ctx), ERROR_CONTEXT(spec.describe))
            attachments.push({ name: 'error-context', contentType: 'text/markdown', path: ctx })
          }
          attachments.push({ name: 'stdout', contentType: 'text/plain', body: `Iniciando «${title}»…\nUsuario de prueba: demo+${runIndex}@example.com\n${error ? 'Fallo detectado, guardando captura.\n' : 'Completado.\n'}` })
          const r = {
            duration, startTime: new Date(clock).toISOString(), retry, workerIndex: runIndex % 4,
            status, errors: error ? [{ message: error }] : [], annotations: [], attachments, steps: [],
          }
          clock += duration / 4
          busy += duration
          return r
        }

        if (b.skip) {
          annotations.push({ type: 'skip', description: b.skip })
          results.push({ duration: 0, startTime: new Date(clock).toISOString(), retry: 0, workerIndex: -1, status: 'skipped', errors: [], annotations: [], attachments: [], steps: [] })
          outcome = 'skipped'
        } else if (chainBroken) {
          results.push({ duration: 0, startTime: new Date(clock).toISOString(), retry: 0, workerIndex: -1, status: 'skipped', errors: [], annotations: [], attachments: [], steps: [] })
          outcome = 'skipped'
        } else {
          const broken = (b.brokenBetween && day >= b.brokenBetween[0] && day <= b.brokenBetween[1]) || (b.brokenFrom && day >= b.brokenFrom)
          const failP = broken ? 1 : (b.fail ?? 0.012)
          const flakyP = b.flaky ?? 0.03
          if (rand() < failP) {
            results.push(attempt('failed', 0, spec.err()), attempt('failed', 1, spec.err()), attempt('failed', 2, spec.err()))
            outcome = 'unexpected'
            if (spec.serial) chainBroken = true
          } else if (rand() < flakyP) {
            results.push(attempt('failed', 0, spec.err()), attempt('passed', 1))
            outcome = 'flaky'
          } else {
            results.push(attempt('passed', 0))
            outcome = 'expected'
          }
        }

        stats.total++
        stats[outcome]++
        const duration = results.reduce((a, r) => a + r.duration, 0)
        const base = {
          testId, title, projectName: project,
          location: { file: spec.file.split('/').pop(), line: 10 + summaryTests.length * 12, column: 3 },
          duration, annotations, tags: spec.tags ?? [], outcome, path: [spec.describe], ok: outcome !== 'unexpected',
        }
        summaryTests.push({ ...base, results: results.map((r) => ({ attachments: r.attachments.filter((a) => a.path), startTime: r.startTime, workerIndex: r.workerIndex })) })
        detailTests.push({ ...base, results })
      }
    }
    if (!summaryTests.length) continue
    files.push({ fileId, fileName: spec.file, tests: summaryTests })
    details[fileId] = { fileId, fileName: spec.file, tests: detailTests }
  }

  const commitHash = hash(`commit${Math.floor(runIndex / 3)}`, 40)
  const report = {
    metadata: {
      ci: {
        commitHref: `https://gitlab.example.com/demo/tienda-e2e/-/commit/${commitHash}`,
        commitHash,
        buildHref: `https://gitlab.example.com/demo/tienda-e2e/-/jobs/${40000 + runIndex}`,
        branch: 'main',
      },
      gitCommit: {
        shortHash: commitHash.slice(0, 7), hash: commitHash, subject: COMMITS[Math.floor(runIndex / 3) % COMMITS.length],
        author: { name: 'Equipo QA Demo', email: 'qa@example.com', time: start.getTime() - 3600e3 }, branch: 'main',
      },
      actualWorkers: 4,
    },
    startTime: start.getTime(),
    duration: busy / 4 + 20000,
    files,
    projectNames: ['chromium', 'firefox', 'chromium-chains'],
    stats: { ...stats, ok: stats.unexpected === 0 },
    errors: [],
    options: {},
    machines: [],
  }

  const embedded = { 'report.json': strToU8(JSON.stringify(report)) }
  for (const [fid, d] of Object.entries(details)) embedded[`${fid}.json`] = strToU8(JSON.stringify(d))
  const b64 = Buffer.from(zipSync(embedded)).toString('base64')
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Playwright Test Report (demo)</title>
<style>body{font-family:system-ui;margin:40px;color:#222}</style></head>
<body><h1>Reporte de demostración</h1>
<p>Este reporte lo ha generado <code>scripts/generate-demo.mjs</code> con datos inventados. Tiene el mismo formato de datos que un reporte HTML de Playwright, pero no su interfaz.</p>
<script>window.playwrightReportBase64 = "data:application/zip;base64,${b64}";</script>
</body></html>`
  fs.writeFileSync(path.join(dir, 'index.html'), html)
  return id
}

// ─── Notas de ejemplo ───

const NOTES = {
  'README.md': `# Notas de la suite de TiendaDemo

Estas notas son **datos de demostración**. Sustitúyelas por las tuyas copiando tus \`.md\` en la carpeta \`notes/\`.

| Nota | Para qué sirve |
|---|---|
| [Guía de ejecución](guides/RUNNING.md) | Cómo lanzar la suite en local y en CI |
| [Fallos conocidos](KNOWN-ISSUES.md) | Tests que fallan por bugs ya reportados |
| [Histórico](HISTORY.md) | Cambios relevantes de cada spec |
| [Cobertura](COVERAGE.md) | Casos automatizados por ámbito |
`,
  'guides/RUNNING.md': `# Guía de ejecución

## En local

\`\`\`bash
npx playwright test                       # toda la suite
npx playwright test crud/crud-005         # un spec
npx playwright test --project=firefox     # un navegador
npx playwright show-report                # abrir el último reporte
\`\`\`

## En CI

El job \`e2e-nightly\` se lanza de lunes a viernes a las 02:00 UTC y publica la carpeta \`playwright-reports/\` como artefacto.

\`\`\`yaml
e2e-nightly:
  script: npx playwright test
  artifacts:
    when: always
    paths: [playwright-reports/]
\`\`\`

## Variables de entorno

| Variable | Descripción | Ejemplo |
|---|---|---|
| \`BASE_URL\` | URL del entorno | \`https://staging.example.com\` |
| \`DEMO_USER\` | Usuario de pruebas | \`qa@example.com\` |
`,
  'guides/SELECTORS.md': `# Buenas prácticas de selectores

1. Prioriza \`getByRole\` y \`getByLabel\`.
2. Usa \`data-testid\` solo cuando no haya un rol accesible.
3. Evita selectores CSS dependientes de la maquetación.

\`\`\`ts
await page.getByRole('button', { name: 'Pagar' }).click()
await expect(page.getByTestId('cart-total')).toHaveText('59,90 €')
\`\`\`
`,
  'KNOWN-ISSUES.md': `# Fallos conocidos

## Errores y problemas conocidos

El test crud-010 (Admin · usuarios › Cambiar rol de un usuario) falla desde el 10/09 porque el diálogo de permisos no se abre: https://jira.example.com/browse/DEMO-231

El test flows-004 (pago con PayPal) falló por la caída del sandbox de PayPal: https://jira.example.com/browse/DEMO-198 (SOLUCIONADO)

## Pendiente de revisar

Revisar flows-007: el paso 3 (marcar como enviado) falla de forma intermitente y deja saltados los pasos siguientes.
`,
  'HISTORY.md': `# Histórico de specs

## crud-005-cart-add-remove.spec.ts

- 2026-09-15: el total del carrito no aplicaba el redondeo de IVA (bug DEMO-240, corregido el 17/09).

## crud-010-admin-users.spec.ts

- 2026-09-10: nuevo diálogo de permisos; el test *Cambiar rol de un usuario* queda en rojo hasta que se actualice el page object.

## flows-004-payments-paypal.spec.ts

- 2026-08-24: caída del sandbox de PayPal. Se restablece el 04/09.

## flows-007-008-orders-lifecycle.spec.ts

- Cadena serial: si un paso falla, los siguientes se marcan como saltados.
`,
  'COVERAGE.md': `# Cobertura de casos de prueba

## 1. Autenticación — 24 casos · 20 ✅ · ~83%
## 2. Catálogo y búsqueda — 38 casos · 27 ✅ · ~71%
## 3. Carrito y cupones — 30 casos · 26 ✅ · ~87%
## 4. Checkout — 42 casos · 25 ✅ · ~60%
## 5. Pagos — 28 casos · 19 ✅ · ~68%
## 6. Pedidos y devoluciones — 22 casos · 12 ✅ · ~55%
## 7. Administración — 35 casos · 14 ✅ · ~40%

## 8. Notificaciones

Sin números en el encabezado: la app cuenta los casos de las tablas y listas del apartado.

| # | Caso | Estado |
|---|---|---|
| 1 | Correo de confirmación del pedido | ✅ |
| 2 | Correo de pedido enviado | ✅ |
| 3 | Aviso de bajada de precio | ❌ |
| 4 | Recordatorio de carrito abandonado | 🟡 |

### Notificaciones push
- [x] Pedido en reparto
- [ ] Pedido entregado
`,
  'modules/checkout.md': `# Módulo: checkout

El checkout tiene tres pasos: **envío**, **pago** y **resumen**. Los page objects están en \`pages/checkout/\`.

> Consejo: espera siempre a la respuesta de \`/api/cart/totals\` antes de comprobar importes.
`,
}

// ─── Principal ───

export function generateDemo({ log = console.log } = {}) {
  fs.rmSync(DEMO_DIR, { recursive: true, force: true })
  fs.mkdirSync(RUNS_DIR, { recursive: true })
  const dates = runDates()
  // Para ver la pantalla «Importar»: la antepenúltima ejecución queda como carpeta suelta en reports/
  // (con el nombre por defecto de Playwright) y las dos últimas como zips pendientes
  const toZip = dates.slice(-2)
  const loose = dates.at(-3)
  dates.slice(0, -3).forEach((d, i) => buildRun(d, i))
  const looseId = buildRun(loose, dates.length - 3)
  const looseTarget = path.join(DEMO_DIR, 'reports', 'informe-descargado', 'playwright-report')
  fs.mkdirSync(path.dirname(looseTarget), { recursive: true })
  fs.cpSync(path.join(RUNS_DIR, looseId), looseTarget, { recursive: true })
  fs.rmSync(path.join(RUNS_DIR, looseId), { recursive: true, force: true })
  toZip.forEach((d, i) => {
    const id = buildRun(d, dates.length - 2 + i)
    const dir = path.join(RUNS_DIR, id)
    const entries = {}
    const walk = (p, rel) => {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(p, e.name), `${rel}/${e.name}`)
        else entries[`playwright-reports/${rel}/${e.name}`.replace('//', '/')] = fs.readFileSync(path.join(p, e.name))
      }
    }
    walk(dir, id)
    fs.writeFileSync(path.join(DEMO_DIR, 'reports', `artifacts (${101 + i}).zip`), zipSync(entries))
    fs.rmSync(dir, { recursive: true })
  })
  for (const [rel, content] of Object.entries(NOTES)) {
    const p = path.join(DEMO_DIR, 'notes', rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  log(`[demo] ${dates.length - 3} reportes, 2 zips y 1 carpeta pendientes de importar y ${Object.keys(NOTES).length} notas generados en .demo/`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateDemo()
}
