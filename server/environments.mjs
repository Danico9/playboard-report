// ─── Entornos (reports/environments.json) ───
// La ingesta deduce de cada ejecución una señal de entorno (run.signal.key: «host:…», «meta:…», «branch:…»).
// Este fichero guarda lo que decide el usuario, y es el único dato de la app que se escribe desde la interfaz:
//   environments: [{ id, name }]      entornos con nombre
//   signals:      { señal: id }       señal → entorno (varias señales en el mismo entorno = fusionadas)
//   runs:         { runId: id }       ejecuciones asignadas a mano (tienen prioridad sobre la señal)
//   dismissed:    [señal]             señales que el usuario ha decidido dejar sin nombre
// Está en reports/ (fuera de git y junto a los reportes, también al usar el ejecutable) y no en .cache/,
// que se puede borrar y regenerar sin perder nada.

import fs from 'node:fs'
import path from 'node:path'
import { REPORTS_DIR } from '../scripts/ingest-reports.mjs'

export const ENV_FILE = path.join(REPORTS_DIR, 'environments.json')
export const NO_SIGNAL = '_none'
const MAX_NAME = 60

const empty = () => ({ version: 1, environments: [], signals: {}, runs: {}, dismissed: [] })

export function readEnvConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(ENV_FILE, 'utf8'))
    return {
      version: 1,
      environments: Array.isArray(c.environments) ? c.environments.filter((e) => e?.id && e?.name) : [],
      signals: c.signals && typeof c.signals === 'object' ? c.signals : {},
      runs: c.runs && typeof c.runs === 'object' ? c.runs : {},
      dismissed: Array.isArray(c.dismissed) ? c.dismissed : [],
    }
  } catch {
    return empty()
  }
}

function writeEnvConfig(config) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true })
  const tmp = `${ENV_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n')
  fs.renameSync(tmp, ENV_FILE)
}

// Añade a cada ejecución su entorno (run.env) y al resumen la lista de entornos
export function applyEnvironments(summary, config = readEnvConfig()) {
  const named = new Map(config.environments.map((e) => [e.id, e]))
  const groups = new Map()
  const group = (id) => {
    let g = groups.get(id)
    if (!g) {
      const env = named.get(id)
      g = { id, name: env?.name ?? null, named: !!env, signals: new Map(), runs: 0, first: null, last: null }
      groups.set(id, g)
    }
    return g
  }
  for (const env of config.environments) group(env.id)

  const runs = summary.runs.map((run) => {
    const key = run.signal?.key ?? null
    const manual = named.has(config.runs[run.id]) ? config.runs[run.id] : null
    const bySignal = key && named.has(config.signals[key]) ? config.signals[key] : null
    const env = manual ?? bySignal ?? key ?? NO_SIGNAL
    const g = group(env)
    g.runs++
    g.first ??= run.date
    g.last = run.date
    if (key && !manual) {
      const s = g.signals.get(key) ?? { key, source: run.signal.source, value: run.signal.value, runs: 0 }
      s.runs++
      g.signals.set(key, s)
    }
    return { ...run, env, envManual: !!manual }
  })

  // Las señales con nombre también se listan aunque ya no tengan ejecuciones (para poder separarlas)
  for (const [key, id] of Object.entries(config.signals)) {
    const g = named.has(id) && groups.get(id)
    if (g && !g.signals.has(key)) g.signals.set(key, { key, source: key.split(':')[0], value: key.slice(key.indexOf(':') + 1), runs: 0 })
  }

  const environments = [...groups.values()]
    .filter((g) => g.named || g.runs > 0)
    .map((g) => ({ ...g, signals: [...g.signals.values()].sort((a, b) => b.runs - a.runs) }))
    .sort((a, b) => b.named - a.named || b.runs - a.runs)
  // Solo se pide nombre si de verdad hay varios entornos con ejecuciones
  const multiple = environments.filter((e) => e.runs > 0).length > 1
  const dismissed = new Set(config.dismissed)
  for (const e of environments) e.pending = multiple && !e.named && e.id !== NO_SIGNAL && !dismissed.has(e.id)
  return { ...summary, runs, environments }
}

// ─── Cambios desde la interfaz ───

function cleanName(name) {
  const n = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : ''
  if (!n || n.length > MAX_NAME) throw new Error(`nombre no válido (1-${MAX_NAME} caracteres)`)
  return n
}

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entorno'

// Devuelve el entorno con ese nombre (sin distinguir mayúsculas) o lo crea: así, dar a una señal el nombre
// de un entorno que ya existe la fusiona con él
function envByName(config, name) {
  const n = cleanName(name)
  const found = config.environments.find((e) => e.name.toLowerCase() === n.toLowerCase())
  if (found) return found.id
  let id = slug(n)
  for (let i = 2; config.environments.some((e) => e.id === id); i++) id = `${slug(n)}-${i}`
  config.environments.push({ id, name: n })
  return id
}

const checkKey = (key) => {
  if (typeof key !== 'string' || !key || key.length > 300 || key === NO_SIGNAL) throw new Error('señal no válida')
  return key
}
const checkEnv = (config, id) => {
  if (!config.environments.some((e) => e.id === id)) throw new Error('entorno no válido')
  return id
}

function removeEnv(config, id) {
  config.environments = config.environments.filter((e) => e.id !== id)
  for (const [k, v] of Object.entries(config.signals)) if (v === id) delete config.signals[k]
  for (const [k, v] of Object.entries(config.runs)) if (v === id) delete config.runs[k]
}

export function updateEnvironments(body) {
  const config = readEnvConfig()
  const undismiss = (key) => { config.dismissed = config.dismissed.filter((k) => k !== key) }
  switch (body?.action) {
    // Dar nombre a una señal detectada (si el nombre ya existe, se fusiona con ese entorno)
    case 'name': {
      const key = checkKey(body.key)
      config.signals[key] = envByName(config, body.name)
      undismiss(key)
      break
    }
    // Añadir una señal a un entorno que ya existe
    case 'merge': {
      const key = checkKey(body.key)
      config.signals[key] = checkEnv(config, body.env)
      undismiss(key)
      break
    }
    // Dejar una señal sin nombre y no volver a preguntar
    case 'dismiss':
      if (!config.dismissed.includes(checkKey(body.key))) config.dismissed.push(body.key)
      break
    case 'undismiss':
      undismiss(checkKey(body.key))
      break
    // Separar una señal de su entorno: vuelve a quedar sin nombre
    case 'unlink':
      delete config.signals[checkKey(body.key)]
      break
    // Renombrar; si el nombre es el de otro entorno, se fusionan los dos
    case 'rename': {
      const id = checkEnv(config, body.env)
      const name = cleanName(body.name)
      const other = config.environments.find((e) => e.id !== id && e.name.toLowerCase() === name.toLowerCase())
      if (other) {
        for (const [k, v] of Object.entries(config.signals)) if (v === id) config.signals[k] = other.id
        for (const [k, v] of Object.entries(config.runs)) if (v === id) config.runs[k] = other.id
        removeEnv(config, id)
      } else {
        config.environments.find((e) => e.id === id).name = name
      }
      break
    }
    // Borrar el nombre: sus ejecuciones vuelven a agruparse por la señal detectada
    case 'delete':
      removeEnv(config, checkEnv(config, body.env))
      break
    // Asignar una ejecución a mano (env null = volver a la detección automática; name = entorno nuevo)
    case 'assignRun': {
      if (typeof body.run !== 'string' || !body.run || body.run.length > 300) throw new Error('ejecución no válida')
      if (body.name) config.runs[body.run] = envByName(config, body.name)
      else if (body.env) config.runs[body.run] = checkEnv(config, body.env)
      else delete config.runs[body.run]
      break
    }
    default:
      throw new Error('acción no válida')
  }
  writeEnvConfig(config)
  return config
}
