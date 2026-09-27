// ─── Servidor del ejecutable ───
// Sirve la app ya compilada (dist/) y la API local, sin Vite. Se usa de dos formas:
//   · Dentro del ejecutable (npm run build:exe): la app va incrustada y los datos están junto al .exe.
//   · Con `npm start` (tras `npm run build`): lee dist/ y los datos de la raíz del proyecto.
// Opciones: --port <n> (o PLAYBOARD_PORT), --no-open (no abrir el navegador).

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const argValue = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

function isSea() {
  try {
    return typeof require === 'function' && require('node:sea').isSea()
  } catch {
    return false
  }
}

function openBrowser(url) {
  const [cmd, cmdArgs] = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', url]]
    : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]]
  spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
}

function listen(server, port, attempts = 10) {
  return new Promise((resolve, reject) => {
    server.once('error', (e) => {
      if (e.code === 'EADDRINUSE' && attempts > 1) resolve(listen(server, port + 1, attempts - 1))
      else reject(e)
    })
    server.listen(port, '127.0.0.1', () => resolve(port))
  })
}

async function main() {
  const sea = isSea()
  // En el ejecutable, los datos (reports/, notes/, .cache/) viven junto al .exe
  if (sea) process.env.PLAYBOARD_ROOT ??= path.dirname(process.execPath)

  // Import dinámico: PLAYBOARD_ROOT tiene que estar fijado antes de cargar la ingesta
  const { createApi, MIME, NOTES_DIR, REPORTS_DIR } = await import('./api.mjs')
  for (const dir of [path.join(REPORTS_DIR, 'playwright-reports'), NOTES_DIR]) fs.mkdirSync(dir, { recursive: true })

  // Ficheros de la app: incrustados en el ejecutable o en dist/
  const distDir = path.resolve(process.env.PLAYBOARD_ROOT ?? process.cwd(), 'dist')
  const readAsset = (rel) => {
    if (sea) {
      try {
        return Buffer.from(require('node:sea').getAsset(`dist/${rel}`))
      } catch {
        return null
      }
    }
    const file = path.resolve(distDir, rel)
    return file.startsWith(distDir + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : null
  }
  if (!readAsset('index.html')) {
    console.error('No se encuentra la app compilada (dist/index.html). Ejecuta antes `npm run build`.')
    process.exit(1)
  }

  const api = createApi()
  await api.runIngest()

  const server = http.createServer((req, res) => {
    api.middleware(req, res, () => {
      const url = new URL(req.url, 'http://localhost')
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      let body = rel ? readAsset(rel) : null
      let type = MIME[path.extname(rel).toLowerCase()]
      // Rutas de la SPA (/calendario, /notas/…): siempre index.html
      if (!body) {
        body = readAsset('index.html')
        type = MIME['.html']
      }
      res.setHeader('Content-Type', type ?? 'application/octet-stream')
      res.end(body)
    })
  })

  const port = await listen(server, Number(argValue('--port') ?? process.env.PLAYBOARD_PORT ?? 4174))
  const url = `http://localhost:${port}`

  for (const dir of [REPORTS_DIR, NOTES_DIR]) {
    try {
      fs.watch(dir, { recursive: true }, (event, name) => name && api.handleFsEvent(event, path.join(dir, name)))
    } catch (e) {
      console.warn(`No se pueden vigilar los cambios en ${dir}: ${e.message}`)
    }
  }

  console.log('')
  console.log(`  playboard-report en ${url}`)
  console.log(`  Reportes: ${REPORTS_DIR}`)
  console.log(`  Notas:    ${NOTES_DIR}`)
  console.log('')
  console.log('  Cierra esta ventana (o pulsa Ctrl+C) para salir.')
  if (!args.includes('--no-open')) openBrowser(url)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
