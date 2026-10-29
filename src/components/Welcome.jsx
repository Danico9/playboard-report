// ─── Versión web: pantalla de bienvenida ───
// Antes de mostrar la app hay que tener una carpeta con reportes (y permiso para leerla) o los datos de ejemplo.
// El estado lo lleva lib/webMode.js; aquí solo se muestra y se ofrecen las acciones.

import { useEffect } from 'react'
import { appUrl, canPickFolder, loadDemo, pickFolder, resumeFolder, startWeb, useWebGate, webSupported } from '../lib/webMode'
import { setTheme, useTheme } from '../lib/theme'
import FolderGuide from './FolderGuide'
import { getLang, setLang, t, useLang } from '../i18n'

const REPO = 'https://github.com/Danico9/playboard-report'

function Explanation() {
  if (getLang() === 'en') {
    return (
      <>
        <h2>How it works</h2>
        <ol>
          <li>Choose the folder that contains <code>reports/</code> (your Playwright HTML reports in <code>reports/playwright-reports/</code>) and, optionally, <code>notes/</code>. Choosing <code>reports/</code> itself also works, but then there are no notes.</li>
          <li>The browser asks for permission to read and modify that folder. It only writes your «Checked» marks and environment names (<code>reports/reviews.json</code> and <code>reports/environments.json</code>).</li>
          <li>The first time, every report is processed (about a minute for 50 large reports). After that only new reports are processed, in a few seconds.</li>
          <li>To see new reports, use <b>Reload data</b> at the bottom of the menu. Next time you open this page the browser remembers the folder, but asks for permission again.</li>
        </ol>
        <h2>Your data stays on your computer</h2>
        <ul>
          <li>This page only delivers the app: the reports are read from your disk by your own browser and <b>are not uploaded anywhere</b>.</li>
          <li>The processed data (what the desktop app keeps in <code>.cache/</code>) is saved in this browser’s private storage for this site. You can delete it from the browser settings (site data).</li>
        </ul>
        <details className="fold">
          <summary>Differences with the desktop app</summary>
          <ul>
            <li>Only <b>Chrome and Edge</b> (and other Chromium browsers) can open a folder. In Firefox and Safari you can only see the sample data.</li>
            <li>New zips and folders in <code>reports/</code> are not detected on their own: click <b>Refresh</b> in <b>Import</b>, or add the zips there with <b>Add zips…</b>.</li>
            <li>New reports are not detected automatically: use <b>Reload data</b>.</li>
            <li>Your own configuration (<code>*.local.js</code>: module names, note categories) is not used; the generic one is.</li>
          </ul>
        </details>
      </>
    )
  }
  return (
    <>
      <h2>Cómo funciona</h2>
      <ol>
        <li>Elige la carpeta que contiene <code>reports/</code> (tus reportes HTML de Playwright, en <code>reports/playwright-reports/</code>) y, si quieres, <code>notes/</code>. También vale elegir la propia <code>reports/</code>, pero entonces no hay notas.</li>
        <li>El navegador te pide permiso para leer y modificar esa carpeta. Solo se escriben tus marcas «Comprobado» y los nombres de los entornos (<code>reports/reviews.json</code> y <code>reports/environments.json</code>).</li>
        <li>La primera vez se procesan todos los reportes (alrededor de un minuto con 50 reportes grandes). Después solo los nuevos, en unos segundos.</li>
        <li>Para ver reportes nuevos, pulsa <b>Recargar datos</b> abajo en el menú. La próxima vez que abras esta página el navegador recordará la carpeta, pero te pedirá permiso de nuevo.</li>
      </ol>
      <h2>Tus datos no salen de tu ordenador</h2>
      <ul>
        <li>Esta página solo te entrega la aplicación: los reportes los lee tu navegador desde tu disco y <b>no se suben a ningún sitio</b>.</li>
        <li>Lo ya procesado (lo que la app de escritorio guarda en <code>.cache/</code>) se guarda en el almacenamiento privado de este navegador para este sitio. Se borra desde los ajustes del navegador (datos del sitio).</li>
      </ul>
      <details className="fold">
        <summary>Diferencias con la app de escritorio</summary>
        <ul>
          <li>Solo <b>Chrome y Edge</b> (y otros navegadores basados en Chromium) pueden abrir una carpeta. En Firefox y Safari solo se pueden ver los datos de ejemplo.</li>
          <li>Los zips y carpetas nuevos de <code>reports/</code> no se detectan solos: pulsa <b>Actualizar</b> en <b>Importar</b>, o añade ahí los zips con <b>Añadir zips…</b>.</li>
          <li>Los reportes nuevos no se detectan solos: pulsa <b>Recargar datos</b>.</li>
          <li>No se usa tu configuración propia (<code>*.local.js</code>: nombres de módulos, categorías de notas), sino la genérica.</li>
        </ul>
      </details>
    </>
  )
}

function Welcome({ gate }) {
  const theme = useTheme()
  const lang = useLang()
  const loading = gate.phase === 'loading' || gate.phase === 'checking'
  const saved = gate.saved?.kind === 'folder' ? gate.saved : null
  const picker = canPickFolder()
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-top">
          <div className="brand">
            <img src={appUrl('/favicon.svg')} alt="" />
            <div>playboard-report<small><span className="web-badge">{t('Web')}</span>{t('Reportes de Playwright')}</small></div>
          </div>
          <div className="row">
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
          </div>
        </div>

        <div>
          <h1>{t('Tus reportes de Playwright, en tu navegador')}</h1>
          <p className="lead">
            {t('Elige la carpeta donde guardas tus reportes HTML de Playwright para ver su histórico por día, semana, mes y año. Se leen desde tu navegador: no se sube nada a ningún servidor.')}
          </p>
        </div>

        <div className="card welcome-actions">
          {loading ? (
            <div className="muted" role="status">{t(gate.message ?? 'Cargando…')}</div>
          ) : !webSupported() ? (
            <div className="welcome-error" role="alert">{t('Este navegador no permite usar la versión web. Usa Chrome o Edge, o la app de escritorio.')}</div>
          ) : (
            <>
              <div className="row wrap">
                {saved && picker && (
                  <button className="btn primary" onClick={resumeFolder}>{t('Seguir con «{name}»', { name: saved.name })}</button>
                )}
                {picker && <button className={saved ? 'btn' : 'btn primary'} onClick={pickFolder}>📁 {t('Elegir carpeta…')}</button>}
                <button className="btn" onClick={loadDemo}>{t('Ver con datos de ejemplo')}</button>
              </div>
              {saved && picker && <div className="small muted">{t('El navegador recuerda la carpeta, pero pide permiso de nuevo en cada sesión.')}</div>}
              {!picker && (
                <div className="small muted">{t('Este navegador no permite abrir carpetas: usa Chrome o Edge para ver tus reportes, o la app de escritorio.')}</div>
              )}
            </>
          )}
          {gate.error && <div className="welcome-error" role="alert">{gate.error}</div>}
        </div>

        <h2>{t('Qué carpeta elegir')}</h2>
        <FolderGuide />

        <Explanation />

        <p className="small muted">
          {t('playboard-report es un proyecto de código abierto (MIT). También hay una app de escritorio con importación de zips y avisos en vivo:')}{' '}
          <a href={REPO} target="_blank" rel="noreferrer">GitHub ↗</a>
        </p>
      </div>
    </div>
  )
}

// Envuelve la app en la versión web: hasta que hay datos que mostrar, la bienvenida
export default function WebGate({ children }) {
  const gate = useWebGate()
  useEffect(() => {
    startWeb()
  }, [])
  return gate.phase === 'ready' ? children : <Welcome gate={gate} />
}
