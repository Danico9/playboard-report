import { NavLink, Outlet, useLocation } from 'react-router'
import { periodSearch } from '../lib/usePeriod'
import { pendingZips, useSummary, useZips } from '../lib/store'
import { hasEnvironments, pendingEnvironments } from '../lib/environments'
import { fmtDate, plural } from '../lib/format'
import { setTheme, useTheme } from '../lib/theme'
import { setLang, t, useLang } from '../i18n'

const I = {
  overview: <path d="M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z" />,
  calendar: <path d="M4 5h16v16H4zM4 10h16M9 3v4M15 3v4" />,
  runs: <path d="M5 4l14 8-14 8z" />,
  tests: <path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3" />,
  errors: <path d="M12 3l10 18H2zM12 10v5M12 18v.5" />,
  modules: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  notes: <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" />,
  import: <path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3" />,
  envs: <path d="M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01" />,
}

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {I[name]}
    </svg>
  )
}

const REPORT_LINKS = [
  ['/', 'Resumen', 'overview'],
  ['/calendario', 'Calendario', 'calendar'],
  ['/ejecuciones', 'Ejecuciones', 'runs'],
  ['/tests', 'Tests', 'tests'],
  ['/errores', 'Errores', 'errors'],
  ['/modulos', 'Módulos', 'modules'],
]

export default function Layout() {
  const location = useLocation()
  const search = periodSearch(location.search)
  const { data } = useSummary()
  const last = data?.runs.at(-1)
  const pending = pendingZips(useZips().data).length
  const showEnvs = hasEnvironments(data)
  const newEnvs = pendingEnvironments(data).length
  const theme = useTheme()
  const lang = useLang()
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src="/favicon.svg" alt="" />
          <div>playboard-report<small>{t('Reportes de Playwright')}</small></div>
        </div>
        <div className="nav-group">{t('Reportes')}</div>
        {REPORT_LINKS.map(([to, label, icon]) => (
          <NavLink key={to} to={to + search} end={to === '/'} className="nav-link">
            <Icon name={icon} />{t(label)}
          </NavLink>
        ))}
        {showEnvs && (
          <NavLink to={'/entornos' + search} className="nav-link">
            <Icon name="envs" />{t('Entornos')}
            {newEnvs > 0 && <span className="badge" title={t('{n} entornos nuevos sin nombre', { n: newEnvs })}>{newEnvs}</span>}
          </NavLink>
        )}
        <NavLink to="/importar" className="nav-link">
          <Icon name="import" />{t('Importar')}{pending > 0 && <span className="badge" title={t('{n} zips pendientes', { n: pending })}>{pending}</span>}
        </NavLink>
        <div className="nav-group">{t('Documentación')}</div>
        <NavLink to="/notas" className="nav-link"><Icon name="notes" />{t('Notas')}</NavLink>
        <div className="sidebar-foot">
          <div className="seg lang-toggle" role="group" aria-label={t('Idioma')}>
            <button className={lang === 'es' ? 'on' : ''} onClick={() => setLang('es')} aria-pressed={lang === 'es'} title="Español">ES</button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')} aria-pressed={lang === 'en'} title="English">EN</button>
          </div>
          <button
            className="btn theme-toggle"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? t('Cambiar a modo claro') : t('Cambiar a modo oscuro')}
          >
            {theme === 'dark' ? `☀ ${t('Modo claro')}` : `☾ ${t('Modo oscuro')}`}
          </button>
          {data && (
            <>
              {plural(data.runs.length, 'ejecución', 'ejecuciones')}
              {last && <><br />{t('Última')}: {fmtDate(last.date)} {last.time}</>}
            </>
          )}
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
