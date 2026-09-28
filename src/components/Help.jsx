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
            It will show up on this screen. Select it and click <b>Import</b>. The app extracts it,
            checks that the report can be read, deletes the zip and adds it to the dashboard.
          </li>
          <li>
            Already extracted? Copy the report folder (the one with <code>index.html</code> and <code>data/</code>) into <code>reports/</code> too:
            it shows up here and, when imported, it is moved to <code>reports/playwright-reports/</code>.
            Or copy it straight into <code>reports/playwright-reports/</code> and it is picked up automatically:
            <PathBox path={info?.runsDir} />
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
            Aparecerá en esta pantalla. Selecciónalo y pulsa <b>Importar</b>. La app lo descomprime,
            comprueba que el reporte se puede leer, borra el zip y lo añade al dashboard.
          </li>
          <li>
            ¿Ya lo tienes descomprimido? Copia la carpeta del reporte (la que tiene <code>index.html</code> y <code>data/</code>) también en <code>reports/</code>:
            aparecerá aquí y, al importarla, se moverá a <code>reports/playwright-reports/</code>.
            O cópiala directamente en <code>reports/playwright-reports/</code> y se detectará sola:
            <PathBox path={info?.runsDir} />
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
            are flagged as known failures in the reports. If <code>{COVERAGE_NOTE}</code> exists, each <code>##</code> heading is an area
            and its coverage is shown: from the heading (<code>## Area — 40 cases · 30 ✅</code>) or, if it has no numbers, counting the table rows and
            list items of that section that carry a state (<code>✅</code>, <code>❌</code>, <code>[x]</code>, <code>[ ]</code>…). Paths can be changed in <code>src/config/notes.local.js</code>.
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
            se marcan como fallo conocido en los reportes. Si existe <code>{COVERAGE_NOTE}</code>, cada encabezado <code>##</code> es un ámbito
            y se muestra su cobertura: la del encabezado (<code>## Ámbito — 40 casos · 30 ✅</code>) o, si no lleva números, contando las filas de tabla y
            los elementos de lista del apartado que llevan un estado (<code>✅</code>, <code>❌</code>, <code>[x]</code>, <code>[ ]</code>…). Las rutas se cambian en <code>src/config/notes.local.js</code>.
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
