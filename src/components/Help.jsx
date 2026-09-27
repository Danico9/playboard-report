import { useState } from 'react'
import { useInfo } from '../lib/store'
import { COVERAGE_NOTE, KNOWN_ISSUES_NOTE } from '../config/notes'
import { getLang, t } from '../i18n'

function PathBox({ path }) {
  const [copied, setCopied] = useState(false)
  if (!path) return null
  const copy = () => {
    navigator.clipboard?.writeText(path).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="path-box">
      <code>{path}</code>
      <button className="btn" onClick={copy}>{copied ? `${t('Copiada')} ✓` : t('Copiar ruta')}</button>
    </div>
  )
}

// Las guías tienen código dentro del texto, así que cada idioma tiene su propio JSX
export function ReportsHelp({ open = false }) {
  const { data: info } = useInfo()
  const en = getLang() === 'en'
  return (
    <details className="card help" open={open}>
      <summary><b>{t('¿Cómo añado mis reportes?')}</b> <span className="muted small">{t('Guía rápida')}</span></summary>
      {en ? (
        <ol className="steps">
          <li>
            Download the Playwright job artifact from your CI (an <code>artifacts (N).zip</code> containing
            <code> playwright-reports/&lt;date&gt;_&lt;suite&gt;/index.html</code>).
          </li>
          <li>
            Copy the zip, without extracting it, into the project&apos;s <code>reports/</code> folder:
            <PathBox path={info?.reportsDir} />
          </li>
          <li>
            It will show up on this screen. Select it and click <b>Extract and delete</b>. The app extracts it,
            checks that the report can be read, deletes the zip and adds it to the dashboard.
          </li>
          <li>
            Alternatively, copy the already extracted folder (<code>&lt;date&gt;_&lt;suite&gt;/</code> with its <code>index.html</code> and <code>data/</code>) into:
            <PathBox path={info?.runsDir} />
            It is picked up automatically, without using this screen.
          </li>
        </ol>
      ) : (
        <ol className="steps">
          <li>
            Descarga del CI el artefacto del job de Playwright (un <code>artifacts (N).zip</code> que contiene
            <code> playwright-reports/&lt;fecha&gt;_&lt;suite&gt;/index.html</code>).
          </li>
          <li>
            Copia el zip, sin descomprimirlo, en la carpeta <code>reports/</code> del proyecto:
            <PathBox path={info?.reportsDir} />
          </li>
          <li>
            Aparecerá en esta pantalla. Selecciónalo y pulsa <b>Descomprimir y borrar</b>. La app lo descomprime,
            comprueba que el reporte se puede leer, borra el zip y lo añade al dashboard.
          </li>
          <li>
            Otra opción es copiar directamente la carpeta ya descomprimida (<code>&lt;fecha&gt;_&lt;suite&gt;/</code> con su <code>index.html</code> y <code>data/</code>) en:
            <PathBox path={info?.runsDir} />
            Se detecta sola, sin pasar por esta pantalla.
          </li>
        </ol>
      )}
      <p className="muted small">
        {en ? (
          <>Everything inside <code>reports/</code> is in <code>.gitignore</code>: your reports are never pushed to the repository.
            To remove a report from the dashboard, delete its folder in <code>playwright-reports/</code>.</>
        ) : (
          <>Todo lo que hay dentro de <code>reports/</code> está en el <code>.gitignore</code>: tus reportes nunca se suben al repositorio.
            Para quitar un reporte del dashboard, borra su carpeta de <code>playwright-reports/</code>.</>
        )}
      </p>
    </details>
  )
}

export function NotesHelp({ open = false }) {
  const { data: info } = useInfo()
  const en = getLang() === 'en'
  return (
    <details className="card help" open={open}>
      <summary><b>{t('¿Cómo añado mis notas?')}</b> <span className="muted small">{t('Guía rápida')}</span></summary>
      {en ? (
        <ol className="steps">
          <li>
            Copy your Markdown files (<code>.md</code>) into the project&apos;s <code>notes/</code> folder. You can organise them in subfolders:
            <PathBox path={info?.notesDir} />
          </li>
          <li>They appear in the tree on the left and update instantly when you edit them. No restart needed.</li>
          <li>
            They are grouped by folder (files in the root of <code>notes/</code> go to <i>General</i>). For your own categories
            (for example, all <code>HANDOFF-*.md</code> together), add rules in <code>src/config/notes.local.js</code> (see the example in <code>src/config/notes.js</code>).
          </li>
          <li>
            Optional extras: if <code>{KNOWN_ISSUES_NOTE}</code> exists, the tests it mentions by id (e.g. <code>flows-020</code>)
            are flagged as known failures in the reports. If <code>{COVERAGE_NOTE}</code> exists with headings like
            <code> ## Area — 40 casos · 30 ✅</code>, its coverage is shown. Paths can be changed in <code>src/config/notes.local.js</code>.
          </li>
        </ol>
      ) : (
        <ol className="steps">
          <li>
            Copia tus ficheros Markdown (<code>.md</code>) en la carpeta <code>notes/</code> del proyecto. Puedes organizarlos en subcarpetas:
            <PathBox path={info?.notesDir} />
          </li>
          <li>Aparecen solos en el árbol de la izquierda y se actualizan al momento cuando los editas. No hace falta reiniciar.</li>
          <li>
            Se agrupan por su carpeta (los de la raíz de <code>notes/</code> van a <i>General</i>). Si quieres categorías propias
            (por ejemplo, todos los <code>HANDOFF-*.md</code> juntos), añade reglas en <code>src/config/notes.local.js</code> (tienes un ejemplo en <code>src/config/notes.js</code>).
          </li>
          <li>
            Extras opcionales: si existe <code>{KNOWN_ISSUES_NOTE}</code>, los tests que menciona por su identificador (p. ej. <code>flows-020</code>)
            se marcan como fallo conocido en los reportes. Si existe <code>{COVERAGE_NOTE}</code> con encabezados del tipo
            <code> ## Ámbito — 40 casos · 30 ✅</code>, se muestra su cobertura. Las rutas se cambian en <code>src/config/notes.local.js</code>.
          </li>
        </ol>
      )}
      <p className="muted small">
        {en ? (
          <>Everything inside <code>notes/</code> is in <code>.gitignore</code>: your notes are never pushed to the repository.</>
        ) : (
          <>Todo lo que hay dentro de <code>notes/</code> está en el <code>.gitignore</code>: tus notas nunca se suben al repositorio.</>
        )}
      </p>
    </details>
  )
}
