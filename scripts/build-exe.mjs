// ─── npm run build:exe ───
// Genera un ejecutable autocontenido (Node.js Single Executable Application) con la app y su servidor:
//   1. Compila la app con Vite (dist/).
//   2. Empaqueta el servidor (server/standalone.mjs) en un único fichero CommonJS.
//   3. Crea el blob SEA con el servidor y la app incrustada como assets.
//   4. Copia el binario de Node y le inyecta el blob.
// El resultado queda en release/playboard-report-<sistema>-<arquitectura>/, con las carpetas reports/ y notes/ vacías al lado.
// El ejecutable es para el sistema en el que se construye: para Windows, constrúyelo en Windows; para macOS, en macOS, etc.
//
// Configuración personal (src/config/*.local.js: nombres de módulos, alias, reglas, categorías de notas…):
//   npm run build:exe                        → la incluye: los módulos y las notas se ven como en npm run dev.
//   npm run build:exe -- --no-local-config   → ejecutable genérico, sin ella: úsalo si lo vas a compartir fuera de tu equipo.
// En ningún caso se incrustan reportes ni notas: se leen de reports/ y notes/ junto al ejecutable.
// El «--» hace falta para que npm pase la opción al script, y la opción debe escribirse exacta: si no se reconoce, se incluye la configuración.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { rolldown } from 'rolldown'
import postject from 'postject'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = path.join(ROOT, 'build')
const DIST = path.join(ROOT, 'dist')
const PLATFORM = { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform] ?? process.platform
const OUT = path.join(ROOT, 'release', `playboard-report-${PLATFORM}-${process.arch}`)
const EXE = path.join(OUT, process.platform === 'win32' ? 'playboard-report.exe' : 'playboard-report')
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 21 || (major === 21 && minor < 7)) {
  console.error(`Se necesita Node.js 21.7 o superior para crear el ejecutable (tienes ${process.version}).`)
  process.exit(1)
}

const step = (msg) => console.log(`\n▸ ${msg}`)

const generic = process.argv.includes('--no-local-config')
if (generic) process.env.VITE_PLAYBOARD_NO_LOCAL = '1'
if (fs.readdirSync(path.join(ROOT, 'src', 'config')).some((f) => f.endsWith('.local.js'))) {
  console.log(generic
    ? '\nEjecutable genérico: no incluye tu configuración de src/config/*.local.js.'
    : '\nAviso: el ejecutable incluye tu configuración de src/config/*.local.js. Para compartirlo fuera de tu equipo usa: npm run build:exe -- --no-local-config')
}

step('Compilando la app (vite build)')
await build({ root: ROOT, logLevel: 'warn' })

step('Empaquetando el servidor')
fs.rmSync(BUILD, { recursive: true, force: true })
fs.mkdirSync(BUILD, { recursive: true })
const bundle = await rolldown({ input: path.join(ROOT, 'server', 'standalone.mjs'), platform: 'node', logLevel: 'warn' })
await bundle.write({ file: path.join(BUILD, 'server.cjs'), format: 'cjs', codeSplitting: false })
await bundle.close()

step('Creando el blob con la app incrustada')
const assets = {}
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) walk(abs)
    else assets[`dist/${path.relative(DIST, abs).split(path.sep).join('/')}`] = abs
  }
}
walk(DIST)
const seaConfig = path.join(BUILD, 'sea-config.json')
const blob = path.join(BUILD, 'sea-prep.blob')
fs.writeFileSync(seaConfig, JSON.stringify({
  main: path.join(BUILD, 'server.cjs'),
  output: blob,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  assets,
}, null, 2))
execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], { stdio: 'inherit' })

step('Generando el ejecutable')
// Solo se sustituyen el ejecutable y el README.txt: reports/, notes/ y .cache/ se conservan si ya existen
fs.mkdirSync(OUT, { recursive: true })
try {
  fs.rmSync(EXE, { force: true })
} catch (e) {
  if (e.code === 'EBUSY' || e.code === 'EPERM') {
    console.error(`\nNo se puede reemplazar ${path.relative(ROOT, EXE)}: parece que está abierto. Ciérralo y vuelve a intentarlo.`)
    process.exit(1)
  }
  throw e
}
fs.copyFileSync(process.execPath, EXE)
if (process.platform === 'darwin') execFileSync('codesign', ['--remove-signature', EXE])
await postject.inject(EXE, 'NODE_SEA_BLOB', fs.readFileSync(blob), {
  sentinelFuse: FUSE,
  machoSegmentName: process.platform === 'darwin' ? 'NODE_SEA' : undefined,
})
if (process.platform === 'darwin') execFileSync('codesign', ['--sign', '-', EXE])
if (process.platform !== 'win32') fs.chmodSync(EXE, 0o755)

// Carpetas de datos vacías y unas instrucciones mínimas junto al ejecutable
fs.mkdirSync(path.join(OUT, 'reports', 'playwright-reports'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'notes'), { recursive: true })
fs.writeFileSync(path.join(OUT, 'README.txt'), `playboard-report
================

1. Copia en la carpeta "reports" tus zips de artefactos de Playwright o las carpetas de reportes ya descomprimidas,
   y pulsa "Importar" en la app. (Lo que copies directamente en "reports/playwright-reports" se detecta solo.)
2. Copia tus notas Markdown (.md) en la carpeta "notes".
3. Abre ${path.basename(EXE)}: se abre el navegador con la app. Para salir, cierra la ventana del programa.

Opciones: --port <n> para usar otro puerto, --no-open para no abrir el navegador.
Los datos procesados se guardan en la carpeta ".cache" (se puede borrar sin problema).

---

1. Copy your Playwright artifact zips or already extracted report folders into the "reports" folder,
   then click "Import" in the app. (Anything copied straight into "reports/playwright-reports" is picked up automatically.)
2. Copy your Markdown notes (.md) into the "notes" folder.
3. Open ${path.basename(EXE)}: the app opens in your browser. To quit, close the program window.

Options: --port <n> to use another port, --no-open to not open the browser.
Processed data is stored in the ".cache" folder (safe to delete).
`)

const size = (fs.statSync(EXE).size / 1e6).toFixed(0)
step(`Listo: ${path.relative(ROOT, EXE)} (${size} MB)`)
console.log(`  Comparte la carpeta ${path.relative(ROOT, OUT)} completa (o comprímela en un zip).`)
