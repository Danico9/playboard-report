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
//   npm run build:exe:generic                → ejecutable genérico, sin ella: úsalo si lo vas a compartir fuera de tu equipo.
//                                              (equivale a «npm run build:exe -- --no-local-config», que en PowerShell no pasa el «--»)
// En ningún caso se incrustan reportes ni notas: se leen de reports/ y notes/ junto al ejecutable.

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

// La opción puede llegar de dos formas: como argumento (npm run build:exe:generic, o «-- --no-local-config» en bash/CMD)
// o como configuración de npm, porque PowerShell se come el «--» y npm se queda la opción (npm_config_local_config).
// Una opción mal escrita no se ignora: se detiene la compilación para no incluir la configuración personal por error.
const LOCAL_CONFIG_ENV = 'npm_config_local_config'
const unknownArgs = process.argv.slice(2).filter((a) => a !== '--no-local-config')
const typoEnv = Object.keys(process.env).filter((k) => /^npm_config_(no_)?local_conf/i.test(k) && k.toLowerCase() !== LOCAL_CONFIG_ENV)
if (unknownArgs.length || typoEnv.length) {
  const bad = [...unknownArgs, ...typoEnv.map((k) => `--${k.slice('npm_config_'.length).replace(/_/g, '-')}`)]
  console.error(`\nOpción no reconocida: ${bad.join(', ')}. No se ha generado nada.`)
  console.error('Para el ejecutable genérico (sin tu configuración local) usa: npm run build:exe:generic')
  process.exit(1)
}
// npm guarda «--no-local-config» como valor vacío o «false»
const generic = process.argv.includes('--no-local-config') || ['', 'false'].includes(process.env[LOCAL_CONFIG_ENV])
if (generic) process.env.VITE_PLAYBOARD_NO_LOCAL = '1'
if (fs.readdirSync(path.join(ROOT, 'src', 'config')).some((f) => f.endsWith('.local.js'))) {
  console.log(generic
    ? '\nEjecutable genérico: no incluye tu configuración de src/config/*.local.js.'
    : '\nAviso: el ejecutable incluye tu configuración de src/config/*.local.js. Para compartirlo fuera de tu equipo usa: npm run build:exe:generic')
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

Dónde se guardan tus datos
--------------------------
- No hay base de datos ni servidor externo: todo son ficheros en esta carpeta y nada sale de tu equipo.
- El programa (${path.basename(EXE)}) no lleva dentro ningún reporte ni nota: los lee de "reports" y "notes".
- La primera vez extrae los datos de cada reporte y los guarda en ".cache" para que la app vaya rápida.
  Después solo lee los reportes nuevos. ".cache" se puede borrar cuando quieras: se vuelve a generar.
- Los nombres que pongas a los entornos se guardan en "reports/environments.json".
- La app solo se puede abrir desde este equipo (127.0.0.1).

IMPORTANTE: si quieres pasarle el programa a otra persona, comparte solo ${path.basename(EXE)}
(al abrirlo crea él solo las carpetas "reports" y "notes").
Si compartes esta carpeta después de usarla, se irán con ella tus reportes ("reports"), tus notas ("notes")
y los datos extraídos (".cache"), que pueden contener información sensible (capturas, URLs, datos de prueba).

---

1. Copy your Playwright artifact zips or already extracted report folders into the "reports" folder,
   then click "Import" in the app. (Anything copied straight into "reports/playwright-reports" is picked up automatically.)
2. Copy your Markdown notes (.md) into the "notes" folder.
3. Open ${path.basename(EXE)}: the app opens in your browser. To quit, close the program window.

Options: --port <n> to use another port, --no-open to not open the browser.

Where your data is stored
-------------------------
- There is no database or external server: everything is files in this folder and nothing leaves your computer.
- The program (${path.basename(EXE)}) contains no reports or notes: it reads them from "reports" and "notes".
- The first time, it extracts the data of each report and stores it in ".cache" so the app stays fast.
  Afterwards it only reads new reports. ".cache" can be deleted at any time: it is generated again.
- The names you give to environments are saved in "reports/environments.json".
- The app can only be opened from this computer (127.0.0.1).

IMPORTANT: to give the program to someone else, share only ${path.basename(EXE)}
(when opened, it creates the "reports" and "notes" folders by itself).
If you share this folder after using it, your reports ("reports"), your notes ("notes") and the extracted
data (".cache") go with it, and they may contain sensitive information (screenshots, URLs, test data).
`)

const size = (fs.statSync(EXE).size / 1e6).toFixed(0)
step(`Listo: ${path.relative(ROOT, EXE)} (${size} MB)`)
// Si la carpeta ya se ha usado, tiene datos del usuario: se avisa para no compartirla entera.
// En .cache/ solo cuentan las ejecuciones procesadas (runs/): un resumen vacío de un arranque sin reportes no es un dato.
const hasFiles = (dir) => fs.existsSync(dir) && fs.readdirSync(dir, { recursive: true }).some((f) => fs.statSync(path.join(dir, f)).isFile())
const cacheRuns = (dir) => fs.existsSync(dir) && fs.readdirSync(dir).some((d) => hasFiles(path.join(dir, d, 'runs')))
const used = [
  hasFiles(path.join(OUT, 'reports')) && 'reports',
  hasFiles(path.join(OUT, 'notes')) && 'notes',
  cacheRuns(path.join(OUT, '.cache')) && '.cache',
].filter(Boolean)
if (used.length) {
  console.log(`  ⚠ ${used.map((d) => `${d}/`).join(', ')} de ${path.relative(ROOT, OUT)} ${used.length > 1 ? 'tienen' : 'tiene'} datos tuyos: para compartir el programa, comparte solo ${path.basename(EXE)}.`)
} else {
  console.log(`  Comparte la carpeta ${path.relative(ROOT, OUT)} completa (o comprímela en un zip), o solo ${path.basename(EXE)}.`)
}
