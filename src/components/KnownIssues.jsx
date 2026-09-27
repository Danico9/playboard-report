import { Link } from 'react-router'
import { KNOWN_ISSUES_NOTE } from '../config/notes'
import { t } from '../i18n'

export default function KnownIssues({ issues }) {
  if (!issues.length) return null
  return (
    <section className="stack">
      {issues.map((issue, i) => (
        <div key={i} className={`issue${issue.solved ? ' solved' : ''}`}>
          <div className="row wrap" style={{ marginBottom: 4 }}>
            <b>{issue.known ? t('Fallo conocido') : t('Anotado en las notas')}{issue.solved ? ` ${t('(solucionado)')}` : ''}</b>
            {issue.jira.map((j) => (
              <a key={j.key} className="chip info" href={j.href} target="_blank" rel="noreferrer">{j.key}</a>
            ))}
            <Link className="small" to={`/notas/${KNOWN_ISSUES_NOTE}`}>{issue.section ?? t('Fallos conocidos')}</Link>
          </div>
          <div className="text-2">{issue.text.replace(/https?:\/\/\S+/g, '').replace(/\s+,/g, ',').trim()}</div>
        </div>
      ))}
    </section>
  )
}

// Etiqueta compacta para las filas de las tablas
export function IssueBadge({ issues }) {
  const open = issues.filter((i) => !i.solved)
  if (!open.length) return null
  const known = open.some((i) => i.known)
  const jira = [...new Set(open.flatMap((i) => i.jira.map((j) => j.key)))].join(', ')
  return (
    <span className={`chip ${known ? 'flaky' : 'neutral'}`} style={{ marginTop: 4 }} title={open.map((i) => i.text).join('\n')}>
      {known ? t('Fallo conocido') : t('Anotado en notas')}{jira && ` · ${jira}`}
    </span>
  )
}
