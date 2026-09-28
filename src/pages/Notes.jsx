import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import Markdown from '../components/Markdown'
import { Empty, ErrorBox, Loading } from '../components/ui'
import { NotesHelp } from '../components/Help'
import { COVERAGE_NOTE, categoryOf, categoryRank, noteLabel } from '../config/notes'
import { useNoteFile, useNotesIndex, useResource } from '../lib/store'
import { fmtDate } from '../lib/format'
import { parseCoverage } from '../lib/coverage'
import { getLang, t } from '../i18n'

function useDebounced(value, ms) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function Tree({ notes, current }) {
  const groups = useMemo(() => {
    const map = new Map()
    for (const n of notes) {
      const c = categoryOf(n.path)
      if (!map.has(c)) map.set(c, [])
      map.get(c).push(n)
    }
    for (const list of map.values()) list.sort((a, b) => noteLabel(a.path).localeCompare(noteLabel(b.path)))
    return [...map.entries()].sort(([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b))
  }, [notes])
  return (
    <nav className="notes-tree">
      {groups.map(([cat, list]) => (
        <div key={cat}>
          <div className="cat">{cat}</div>
          {list.map((n) => (
            <NavLink key={n.path} to={`/notas/${n.path}`} className={n.path === current ? 'active' : ''} title={n.title ?? n.path}>
              {noteLabel(n.path)}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

function Toc({ headings }) {
  const [active, setActive] = useState(null)
  useEffect(() => {
    const els = headings.map((h) => document.getElementById(h.slug)).filter(Boolean)
    if (!els.length) return
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) setActive(visible[0].target.id)
    }, { rootMargin: '0px 0px -70% 0px' })
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [headings])
  if (headings.length < 2) return <aside className="toc" />
  return (
    <aside className="toc">
      <div className="t">{t('En esta nota')}</div>
      {headings.map((h, i) => (
        <a key={`${h.slug}-${i}`} href={`#${h.slug}`} className={`${h.level === 3 ? 'l3' : ''}${active === h.slug ? ' active' : ''}`}>{h.text}</a>
      ))}
    </aside>
  )
}

function NoteView({ path, meta }) {
  const res = useNoteFile(path)
  const location = useLocation()
  const ref = useRef(null)
  const content = res.data

  useEffect(() => {
    if (!content) return
    const id = decodeURIComponent(location.hash.slice(1))
    const el = id && document.getElementById(id)
    if (el) el.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [content, location.hash, path])

  if (res.status === 'error' && content == null) return <ErrorBox error={res.error} />
  if (content == null) return <Loading what="nota" />
  const headings = (meta?.headings ?? []).filter((h) => h.level === 2 || h.level === 3)
  return (
    <>
      <article ref={ref} style={{ minWidth: 0 }}>
        <div className="row wrap small muted" style={{ marginBottom: 14 }}>
          <span className="mono">{path}</span>
          {meta && <span>· {(meta.size / 1024).toFixed(0)} KB · modificado el {fmtDate(new Date(meta.mtime).toISOString().slice(0, 10))}</span>}
        </div>
        <Markdown notePath={path}>{content}</Markdown>
      </article>
      <Toc headings={headings} />
    </>
  )
}

function SearchResults({ query }) {
  const q = useDebounced(query, 250)
  const res = useResource(q.trim().length >= 2 ? `/api/notes/search?q=${encodeURIComponent(q.trim())}` : null)
  if (q.trim().length < 2) return <div className="muted">{t('Escribe al menos 2 caracteres.')}</div>
  if (!res.data) return <Loading what="resultados" />
  if (!res.data.length) return <Empty>{t('Sin resultados para «{q}».', { q })}</Empty>
  const total = res.data.reduce((a, r) => a + r.count, 0)
  return (
    <div className="search-results">
      <p className="muted">{t('{n} coincidencias en {m} notas', { n: `${total}${total >= 20 ? '+' : ''}`, m: res.data.length })}</p>
      {res.data.map((r) => (
        <div key={r.path} className="res">
          <Link to={`/notas/${r.path}`}><b>{noteLabel(r.path)}</b></Link> <span className="muted small">{r.path} · {r.count}{r.count >= 20 ? '+' : ''}</span>
          <div style={{ marginTop: 4 }}>
            {r.matches.slice(0, 6).map((m) => (
              <Link key={m.line} className="hit" to={`/notas/${r.path}${m.heading ? `#${m.heading.slug}` : ''}`}>
                {m.heading && <span className="muted">{m.heading.text} · </span>}
                <Highlight text={m.text} q={q.trim()} />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Highlight({ text, q }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return text
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
}

function Coverage({ notes }) {
  const note = notes.find((n) => n.path === COVERAGE_NOTE)
  const res = useNoteFile(note ? COVERAGE_NOTE : null)
  const rows = useMemo(() => (note && res.data ? parseCoverage(res.data, note.headings ?? []) : []), [note, res.data])
  if (!rows.length) return null
  return (
    <div className="card">
      <div className="card-head">
        <div><h2>{t('Cobertura por ámbito')}</h2><p>{t('Casos automatizados (✅) por apartado de')} <code>{COVERAGE_NOTE}</code>{t(': los números del encabezado o, si no los tiene, los casos contados en sus tablas y listas.')}</p></div>
        <Link className="btn" to={`/notas/${COVERAGE_NOTE}`}>{t('Abrir nota')}</Link>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {rows.map((r) => (
          <Link key={r.slug} to={`/notas/${COVERAGE_NOTE}#${r.slug}`} className="row" style={{ color: 'inherit', textDecoration: 'none' }} title={`${t('{a} de {b} casos', { a: r.done, b: r.total })} · ${r.source === 'heading' ? t('según el encabezado') : t('contados en el apartado')}`}>
            <span className="truncate" style={{ width: 260, flex: 'none' }}>{r.name}</span>
            <span style={{ flex: 1, height: 10, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${(r.done / r.total) * 100}%`, background: 'var(--accent)', borderRadius: '0 4px 4px 0' }} />
            </span>
            <span className="num small" style={{ width: 130 }}>{r.done} / {r.total} · <b>{Math.round((r.done / r.total) * 100)}{getLang() === 'en' ? '%' : ' %'}</b></span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function Landing({ notes }) {
  const recent = [...notes].sort((a, b) => b.mtime - a.mtime).slice(0, 10)
  return (
    <div className="stack" style={{ gap: 16, minWidth: 0 }}>
      <div>
        <h1>{t('Notas')}</h1>
        <p className="text-2">{t('{n} ficheros Markdown de notes/. Se actualizan solos al editarlos.', { n: notes.length })}</p>
      </div>
      <NotesHelp open={notes.length === 0} />
      <Coverage notes={notes} />
      <div className="card">
        <div className="card-head"><h2>{t('Modificadas recientemente')}</h2></div>
        <ul className="list">
          {!recent.length && <li className="muted">{t('Todavía no hay notas.')}</li>}
        {recent.map((n) => (
            <li key={n.path}>
              <div className="grow">
                <Link to={`/notas/${n.path}`}><b>{noteLabel(n.path)}</b></Link>
                {n.title && <div className="muted small truncate">{n.title}</div>}
              </div>
              <span className="muted small nowrap">{fmtDate(new Date(n.mtime).toISOString().slice(0, 10))}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default function Notes() {
  const params = useParams()
  const path = params['*'] || null
  const [search, setSearch] = useSearchParams()
  const navigate = useNavigate()
  const query = search.get('q') ?? ''
  const res = useNotesIndex()
  const notes = res.data

  if (res.status === 'error' && !notes) return <ErrorBox error={res.error} />
  if (!notes) return <Loading what="notas" />
  const meta = notes.find((n) => n.path === path)

  return (
    <div className="page" style={{ maxWidth: 1600 }}>
      <div className="notes">
        <div className="stack" style={{ gap: 10 }}>
          <input
            className="input"
            placeholder={t('Buscar en todas las notas…')}
            value={query}
            onChange={(e) => {
              const v = e.target.value
              if (path) navigate(`/notas?q=${encodeURIComponent(v)}`)
              else setSearch(v ? { q: v } : {}, { replace: true })
            }}
          />
          <Tree notes={notes} current={path} />
        </div>
        {query ? (
          <div style={{ gridColumn: 'span 2', minWidth: 0 }}><h1 style={{ marginBottom: 12 }}>{t('Búsqueda')}</h1><SearchResults query={query} /></div>
        ) : path ? (
          meta ? <NoteView key={path} path={path} meta={meta} /> : <Empty>{t('No existe la nota')} <span className="mono">{path}</span>.</Empty>
        ) : (
          <div style={{ gridColumn: 'span 2', minWidth: 0 }}><Landing notes={notes} /></div>
        )}
      </div>
    </div>
  )
}
