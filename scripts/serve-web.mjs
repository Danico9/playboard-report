// ─── npm run preview:web ───
// Sirve dist-web/ (npm run build:web) como lo haría GitHub Pages: solo ficheros, sin API, y 404.html para lo que no existe.
// Abre el navegador (salvo con NO_OPEN=1). Puerto 4175 o PORT; la base se deduce de dist-web/index.html.

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { exec } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { MIME } from '../server/api.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist-web')
const PORT = Number(process.env.PORT ?? 4175)

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('[web] No existe dist-web/: ejecuta antes npm run build:web')
  process.exit(1)
}
// La base con la que se compiló: la ruta del favicon en el index.html («/playboard-report/favicon.svg» → «/playboard-report/»)
const base = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').match(/href="([^"]*)favicon\.svg"/)?.[1] ?? '/'

function send(res, file, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
}

http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p === '/' && base !== '/') {
    res.writeHead(302, { Location: base })
    return res.end()
  }
  if (p.startsWith(base)) {
    const f = path.resolve(DIST, '.' + p.slice(base.length - 1))
    if (f.startsWith(DIST)) {
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return send(res, f)
      if (fs.existsSync(path.join(f, 'index.html'))) return send(res, path.join(f, 'index.html'))
    }
  }
  send(res, path.join(DIST, '404.html'), 404)
}).on('error', (e) => {
  if (e.code !== 'EADDRINUSE') throw e
  // Lo más probable: ya está abierta (sirve lo que haya en dist-web/, así que basta con recargar el navegador)
  console.error(`[web] El puerto ${PORT} ya está en uso: ¿ya tienes abierto npm run preview:web? Recarga http://localhost:${PORT}${base} o usa otro puerto con PORT=<n>.`)
  process.exit(1)
}).listen(PORT, () => {
  const url = `http://localhost:${PORT}${base}`
  console.log(`[web] ${url}`)
  if (!process.env.NO_OPEN) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`
    exec(cmd)
  }
})
