import { Link } from 'react-router'
import { useNotesIndex } from '../lib/store'
import { HISTORY_NOTE } from '../config/notes'
import { moduleOfTest } from '../config/modules'
import { t } from '../i18n'

// Notas relacionadas con un test: su sección en la nota de histórico (HISTORY_NOTE) y el CLAUDE.md de su módulo
export default function NoteLinks({ meta }) {
  const { data: notes } = useNotesIndex()
  if (!notes || !meta) return null
  const links = []
  const history = notes.find((n) => n.path === HISTORY_NOTE)
  const specs = meta.specs ?? []
  if (history && specs.length) {
    const prefixes = specs.map((s) => s.toLowerCase())
    for (const h of history.headings) {
      const text = h.text.toLowerCase()
      if (h.level === 2 && prefixes.some((p) => text.startsWith(p))) {
        links.push({ to: `/notas/${HISTORY_NOTE}#${h.slug}`, label: `${HISTORY_NOTE.split('/').pop().replace(/\.md$/i, '')} · ${h.text}` })
      }
    }
  }
  const mod = moduleOfTest(meta)
  const modNote = notes.find((n) => n.path === `pages/${mod}/CLAUDE.md`)
  if (modNote) links.push({ to: `/notas/${modNote.path}`, label: `pages/${mod}/CLAUDE.md` })
  if (!links.length) return null
  return (
    <section className="stack">
      <h3>{t('Notas relacionadas')}</h3>
      <div className="row wrap">
        {links.map((l) => <Link key={l.to} className="btn" to={l.to}>{l.label}</Link>)}
      </div>
    </section>
  )
}
