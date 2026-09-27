// ─── Fallos conocidos anotados en la nota KNOWN_ISSUES_NOTE (src/config/notes.js) ───
// Cada línea que menciona un spec por su identificador (p. ej. "flows-020" o "crud 8") se asocia a ese spec
// junto con sus enlaces de Jira. Los prefijos válidos (crud, flows…) salen de los nombres de los specs de los reportes.

const JIRA = /https?:\/\/[^\s)]+?\/browse\/([A-Z][A-Z0-9]+-\d+)/g
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function parseKnownIssues(markdown, prefixes) {
  const bySpec = new Map()
  if (!prefixes.length) return bySpec
  const testRef = new RegExp(`\\b(${prefixes.map(escape).join('|')})[\\s-]*0*(\\d{1,3})\\b`, 'gi')
  let section = null
  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    const h = line.match(/^#{1,6}\s+(.*)/)
    if (h) {
      section = h[1].replace(/:$/, '')
      continue
    }
    const refs = [...line.matchAll(testRef)].map((m) => `${m[1].toLowerCase()}-${m[2].padStart(3, '0')}`)
    if (!refs.length) continue
    const issue = {
      text: line,
      section,
      jira: [...line.matchAll(JIRA)].map((m) => ({ key: m[1], href: m[0] })),
      solved: /SOLUCIONADO|RESUELTO|SOLVED|FIXED/i.test(line),
      known: /conocid|known/i.test(section ?? ''),
    }
    for (const spec of new Set(refs)) {
      if (!bySpec.has(spec)) bySpec.set(spec, [])
      bySpec.get(spec).push(issue)
    }
  }
  return bySpec
}
