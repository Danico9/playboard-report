import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ReportsHelp } from '../components/Help'
import { Empty, ErrorBox, Loading } from '../components/ui'
import { refreshData, refreshZips, useInfo, useSummary, useZips } from '../lib/store'
import { fmtDate } from '../lib/format'
import { numberLocale, t } from '../i18n'

// El nombre de la carpeta está en UTC: 2026-09-23_01-03-36_all-tests
function runLabel(id, timeZone) {
  const m = id.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_?(.*)$/)
  if (!m) return id
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]))
  const fmt = new Intl.DateTimeFormat(numberLocale(), { timeZone, dateStyle: 'medium', timeStyle: 'short' })
  return `${fmt.format(date)}${m[7] ? ` · ${m[7]}` : ''}`
}

const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toLocaleString(numberLocale(), { maximumFractionDigits: 1 })} MB` : `${Math.round(b / 1e3)} KB`)

// Los errores de lectura de zips vienen del servidor en castellano
const UNREADABLE = 'No se puede leer (¿aún se está copiando?):'
const zipError = (e) => (e.startsWith(UNREADABLE) ? `${t(UNREADABLE)}${e.slice(UNREADABLE.length)}` : t(e))

function zipState(z) {
  if (z.error) return { cls: 'failed', label: 'No válido', selectable: false }
  if (z.runs.every((r) => r.imported)) return { cls: 'neutral', label: 'Ya importado', selectable: true }
  return { cls: 'info', label: 'Pendiente', selectable: true }
}

export default function Import() {
  const res = useZips()
  const { data: summary } = useSummary()
  const tz = useInfo().data?.timeZone
  const label = (id) => runLabel(id, tz)
  // Pendientes primero; dentro de cada grupo, por nombre
  const zips = useMemo(() => [...(res.data ?? [])].sort((x, y) => (zipState(x).label === 'Pendiente' ? 0 : 1) - (zipState(y).label === 'Pendiente' ? 0 : 1)), [res.data])
  const [selected, setSelected] = useState(() => new Set())
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  const pending = useMemo(() => zips.filter((z) => zipState(z).label === 'Pendiente').map((z) => z.name), [zips])
  // Hasta que el usuario toque la selección, se marcan por defecto los pendientes
  const sel = touched ? new Set([...selected].filter((n) => zips.some((z) => z.name === n))) : new Set(pending)

  const toggle = (name) => {
    const next = new Set(sel)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelected(next)
    setTouched(true)
  }
  const setAll = (names) => {
    setSelected(new Set(names))
    setTouched(true)
  }

  const run = async () => {
    const files = [...sel]
    const onlyDelete = files.filter((n) => zipState(zips.find((z) => z.name === n)).label === 'Ya importado')
    const msg = `${t('Se van a procesar {n} zip(s).', { n: files.length })}\n\n` +
      `· ${t('Los reportes que falten se descomprimen en reports/playwright-reports/.')}\n` +
      `· ${t('Cada zip se BORRA después, solo si todos sus reportes se han importado bien.')}` +
      (onlyDelete.length ? `\n· ${t('{n} ya estaban importados: de esos solo se borra el zip.', { n: onlyDelete.length })}` : '') +
      `\n\n${t('¿Continuar?')}`
    if (!window.confirm(msg)) return
    setBusy(true)
    setError(null)
    setResults(null)
    try {
      const r = await fetch('/api/zips/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-playboard': '1' },
        body: JSON.stringify({ files }),
      })
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
      setResults(await r.json())
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

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('Importar reportes')}</h1>
          <p>{t('Zips de artefactos de Playwright que hay en la carpeta reports/. Elige cuáles descomprimir: al terminar, el zip se borra.')}</p>
        </div>
        {summary && <span className="muted small">{t('{n} reportes en el dashboard', { n: summary.runs.length })}</span>}
      </div>

      <ReportsHelp open={!zips.length && !summary?.runs.length} />

      {results && (
        <div className="card">
          <div className="card-head"><h2>{t('Resultado')}</h2><button className="btn" onClick={() => setResults(null)}>{t('Cerrar')}</button></div>
          <ul className="list">
            {results.map((r) => (
              <li key={r.file}>
                <span className={`chip ${r.error || r.failed.length ? 'failed' : 'passed'}`}>{r.error || r.failed.length ? `✕ ${t('Error')}` : `✓ ${t('Hecho')}`}</span>
                <div className="grow">
                  <b>{r.file}</b>
                  <div className="small text-2">
                    {r.error && <>{t('No se pudo procesar:')} {r.error}. {t('El zip se conserva.')}</>}
                    {r.imported.length > 0 && <>{t('Importado:')} {r.imported.map(label).join(', ')}. </>}
                    {r.alreadyImported?.length > 0 && <>{t('Ya estaba importado:')} {r.alreadyImported.map(label).join(', ')}. </>}
                    {r.failed.map((f) => <span key={f.runId}>{label(f.runId)} {t('no es válido')} ({f.error}). </span>)}
                    {!r.error && (r.deleted ? t('Zip eliminado.') : t('El zip se conserva.'))}
                  </div>
                </div>
                {r.imported[0] && <Link className="btn" to={`/ejecucion/${encodeURIComponent(r.imported[0])}`}>{t('Ver')}</Link>}
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
            <button className="btn" onClick={() => setAll(zips.filter((z) => zipState(z).selectable).map((z) => z.name))} disabled={busy}>{t('Todos')}</button>
            <button className="btn" onClick={() => setAll([])} disabled={busy}>{t('Ninguno')}</button>
            <button className="btn" onClick={refreshZips} disabled={busy}>↻ {t('Actualizar')}</button>
          </div>
          <button className="btn primary" onClick={run} disabled={busy || sel.size === 0}>
            {busy ? t('Procesando… (unos segundos por zip)') : t('Descomprimir y borrar ({n})', { n: sel.size })}
          </button>
        </div>
        {res.status === 'error' && !res.data ? <ErrorBox error={res.error} /> : !res.data ? <Loading what="zips" /> : zips.length === 0 ? (
          <Empty>{t('No hay zips en reports/. Copia ahí los artifacts (N).zip del CI; aparecerán aquí automáticamente.')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th style={{ width: 36 }} /><th>{t('Zip')}</th><th>{t('Estado')}</th><th>{t('Reportes que contiene')}{tz ? ` (${t('hora de {tz}', { tz })})` : ''}</th><th className="num">{t('Tamaño')}</th><th>{t('Añadido')}</th></tr>
              </thead>
              <tbody>
                {zips.map((z) => {
                  const st = zipState(z)
                  return (
                    <tr key={z.name} className={st.selectable ? 'clickable' : ''} onClick={() => st.selectable && !busy && toggle(z.name)}>
                      <td>
                        <input type="checkbox" checked={sel.has(z.name)} disabled={!st.selectable || busy} onChange={() => toggle(z.name)} onClick={(e) => e.stopPropagation()} aria-label={t('Seleccionar {name}', { name: z.name })} />
                      </td>
                      <td className="mono">{z.name}</td>
                      <td>
                        <span className={`chip ${st.cls}`}>{t(st.label)}</span>
                        {st.label === 'Ya importado' && <div className="muted small">{t('Al procesarlo solo se borra el zip')}</div>}
                      </td>
                      <td className="small">
                        {z.error ? <span className="text-2">{zipError(z.error)}</span> : z.runs.map((r) => (
                          <div key={r.id}>{label(r.id)} {r.imported && <span className="muted">· {t('ya en el dashboard')}</span>}</div>
                        ))}
                      </td>
                      <td className="num">{fmtSize(z.size)}</td>
                      <td className="nowrap small">{fmtDate(new Date(z.mtime).toISOString().slice(0, 10))}</td>
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
