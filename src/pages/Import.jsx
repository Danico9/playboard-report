import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ReportsHelp } from '../components/Help'
import { Empty, ErrorBox, Loading } from '../components/ui'
import { refreshData, refreshZips, useInfo, useSummary, useZips } from '../lib/store'
import { addImportResults, clearImportResults, dismissImportResult, useImportResults } from '../lib/importResults'
import { fmtDate } from '../lib/format'
import { appUrl } from '../lib/webMode'
import { numberLocale, t } from '../i18n'

// El nombre de la carpeta está en UTC: 2026-09-23_01-03-36_all-tests
function runLabel(id, timeZone) {
  const m = id.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_?(.*)$/)
  if (!m) return id
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]))
  const fmt = new Intl.DateTimeFormat(numberLocale(), { timeZone, dateStyle: 'medium', timeStyle: 'short' })
  return `${fmt.format(date)}${m[7] ? ` · ${m[7]}` : ''}`
}

const fmtTime = (ms) => new Intl.DateTimeFormat(numberLocale(), { timeStyle: 'short' }).format(new Date(ms))

const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toLocaleString(numberLocale(), { maximumFractionDigits: 1 })} MB` : `${Math.round(b / 1e3)} KB`)

// Los errores de lectura vienen del servidor en castellano
const UNREADABLE = 'No se puede leer (¿aún se está copiando?):'
const itemError = (e) => (e.startsWith(UNREADABLE) ? `${t(UNREADABLE)}${e.slice(UNREADABLE.length)}` : t(e))

// Elementos importables: zips y carpetas sueltas de reports/ (se identifican por tipo + nombre)
const itemKey = (item) => `${item.kind}:${item.name}`

function itemState(item) {
  if (item.error) return { cls: 'failed', label: 'No válido', selectable: false }
  if (item.runs.every((r) => r.imported)) return { cls: 'neutral', label: 'Ya importado', selectable: true }
  return { cls: 'info', label: 'Pendiente', selectable: true }
}

export default function Import() {
  const res = useZips()
  const { data: summary } = useSummary()
  const tz = useInfo().data?.timeZone
  const label = (id) => runLabel(id, tz)
  // Pendientes primero; dentro de cada grupo, primero los zips y después por nombre
  const items = useMemo(() => [...(res.data ?? [])].sort((x, y) =>
    (itemState(x).label === 'Pendiente' ? 0 : 1) - (itemState(y).label === 'Pendiente' ? 0 : 1)), [res.data])
  const [selected, setSelected] = useState(() => new Set())
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const results = useImportResults()
  const [error, setError] = useState(null)

  const pending = useMemo(() => items.filter((i) => itemState(i).label === 'Pendiente').map(itemKey), [items])
  // Hasta que el usuario toque la selección, se marcan por defecto los pendientes
  const sel = touched ? new Set([...selected].filter((k) => items.some((i) => itemKey(i) === k))) : new Set(pending)

  const toggle = (key) => {
    const next = new Set(sel)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next)
    setTouched(true)
  }
  const setAll = (keys) => {
    setSelected(new Set(keys))
    setTouched(true)
  }

  const run = async () => {
    const chosen = items.filter((i) => sel.has(itemKey(i)))
    const zips = chosen.filter((i) => i.kind === 'zip')
    const folders = chosen.filter((i) => i.kind === 'folder')
    const duplicates = chosen.filter((i) => itemState(i).label === 'Ya importado')
    const lines = [
      zips.length && t('· {n} zip(s): los reportes que falten se descomprimen en reports/playwright-reports/ y el zip se BORRA después, solo si todo ha ido bien.', { n: zips.length }),
      folders.length && t('· {n} carpeta(s): sus reportes se MUEVEN a reports/playwright-reports/. La carpeta solo se borra si queda vacía.', { n: folders.length }),
      duplicates.length && t('· {n} ya estaban importados: se borra el zip o la copia duplicada del reporte.', { n: duplicates.length }),
    ].filter(Boolean)
    if (!window.confirm(`${t('Se van a importar {n} elemento(s).', { n: chosen.length })}\n\n${lines.join('\n')}\n\n${t('¿Continuar?')}`)) return
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(appUrl('/api/zips/import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-playboard': '1' },
        body: JSON.stringify({ items: chosen.map(({ kind, name }) => ({ kind, name })) }),
      })
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
      addImportResults(await r.json())
      setSelected(new Set())
      setTouched(false)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
      refreshZips()
      refreshData()
    }
  }

  const kept = (r) => (r.kind === 'folder' ? t('La carpeta se conserva.') : t('El zip se conserva.'))
  const removed = (r) => (r.kind === 'folder' ? t('Carpeta vacía eliminada.') : t('Zip eliminado.'))

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('Importar reportes')}</h1>
          <p>{t('Zips y carpetas de reportes de Playwright que hay en la carpeta reports/. Elige cuáles importar: los zips se descomprimen y se borran; las carpetas se mueven a reports/playwright-reports/.')}</p>
        </div>
        {summary && <span className="muted small">{t('{n} reportes en el dashboard', { n: summary.runs.length })}</span>}
      </div>

      <ReportsHelp open={!items.length && !summary?.runs.length} />

      {results.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <h2>{t('Resultado')}</h2>
              <p>{t('Se mantiene hasta que lo cierres, aunque cambies de pantalla.')}</p>
            </div>
            {results.length > 1 && <button className="btn" onClick={clearImportResults}>{t('Cerrar todos ({n})', { n: results.length })}</button>}
          </div>
          <ul className="list">
            {results.map((r) => (
              <li key={r.id}>
                <span className={`chip ${r.error || r.failed.length ? 'failed' : 'passed'}`}>{r.error || r.failed.length ? `✕ ${t('Error')}` : `✓ ${t('Hecho')}`}</span>
                <div className="grow">
                  <b>{r.file}</b> <span className="muted small">· {fmtTime(r.at)}</span>
                  <div className="small text-2">
                    {r.error && <>{t('No se pudo procesar:')} {r.error}. {kept(r)}</>}
                    {r.imported.length > 0 && <>{t('Importado:')} {r.imported.map(label).join(', ')}. </>}
                    {r.alreadyImported?.length > 0 && <>{t('Ya estaba importado:')} {r.alreadyImported.map(label).join(', ')}. </>}
                    {r.failed.map((f) => <span key={f.runId}>{label(f.runId)} {t('no es válido')} ({f.error}). </span>)}
                    {!r.error && (r.deleted ? removed(r) : r.kind === 'folder' ? t('La carpeta se conserva porque tiene otros ficheros.') : kept(r))}
                  </div>
                </div>
                {r.imported[0] && <Link className="btn" to={`/ejecucion/${encodeURIComponent(r.imported[0])}`}>{t('Ver')}</Link>}
                <button className="btn icon" onClick={() => dismissImportResult(r.id)} title={t('Cerrar')} aria-label={t('Cerrar resultado de {name}', { name: r.file })}>✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <ErrorBox error={error} />}

      <div className="card flush">
        <div className="card-head" style={{ flexWrap: 'wrap', paddingBottom: 12 }}>
          <div className="filters">
            <button className="btn" onClick={() => setAll(pending)} disabled={busy}>{t('Seleccionar pendientes ({n})', { n: pending.length })}</button>
            <button className="btn" onClick={() => setAll(items.filter((i) => itemState(i).selectable).map(itemKey))} disabled={busy}>{t('Todos')}</button>
            <button className="btn" onClick={() => setAll([])} disabled={busy}>{t('Ninguno')}</button>
            <button className="btn" onClick={refreshZips} disabled={busy}>↻ {t('Actualizar')}</button>
          </div>
          <button className="btn primary" onClick={run} disabled={busy || sel.size === 0}>
            {busy ? t('Procesando… (unos segundos por elemento)') : t('Importar ({n})', { n: sel.size })}
          </button>
        </div>
        {res.status === 'error' && !res.data ? <ErrorBox error={res.error} /> : !res.data ? <Loading what="zips" /> : items.length === 0 ? (
          <Empty>{t('No hay nada que importar en reports/. Copia ahí los artifacts (N).zip del CI o las carpetas de reportes; aparecerán aquí automáticamente.')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th style={{ width: 36 }} /><th>{t('Zip / carpeta')}</th><th>{t('Estado')}</th><th>{t('Reportes que contiene')}{tz ? ` (${t('hora de {tz}', { tz })})` : ''}</th><th className="num">{t('Tamaño')}</th><th>{t('Añadido')}</th></tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const st = itemState(item)
                  const key = itemKey(item)
                  return (
                    <tr key={key} className={st.selectable ? 'clickable' : ''} onClick={() => st.selectable && !busy && toggle(key)}>
                      <td>
                        <input type="checkbox" checked={sel.has(key)} disabled={!st.selectable || busy} onChange={() => toggle(key)} onClick={(e) => e.stopPropagation()} aria-label={t('Seleccionar {name}', { name: item.name })} />
                      </td>
                      <td>
                        <div className="mono">{item.kind === 'folder' ? '📁' : '🗜'} {item.name}{item.kind === 'folder' ? '/' : ''}</div>
                        <div className="muted small">{item.kind === 'folder' ? t('Carpeta') : t('Zip')}</div>
                      </td>
                      <td>
                        <span className={`chip ${st.cls}`}>{t(st.label)}</span>
                        {st.label === 'Ya importado' && (
                          <div className="muted small">{item.kind === 'folder' ? t('Al procesarlo se borra la copia duplicada') : t('Al procesarlo solo se borra el zip')}</div>
                        )}
                      </td>
                      <td className="small">
                        {item.error ? <span className="text-2">{itemError(item.error)}</span> : item.runs.map((r) => (
                          <div key={r.id}>{label(r.id)} {r.imported && <span className="muted">· {t('ya en el dashboard')}</span>}</div>
                        ))}
                      </td>
                      <td className="num">{fmtSize(item.size)}</td>
                      <td className="nowrap small">{fmtDate(new Date(item.mtime).toISOString().slice(0, 10))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
