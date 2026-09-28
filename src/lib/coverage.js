// ─── Cobertura por ámbito (nota COVERAGE_NOTE de src/config/notes.js) ───
// Cada encabezado de nivel 2 de la nota es un ámbito. Sus números salen de:
//  1. El propio encabezado, si los trae: «## Pagos — 28 casos · 19 ✅» (también «cases», «–» o «-»).
//     Mandan sobre el conteo porque el autor puede excluir casos o sumar otros con sus propios criterios.
//  2. Si no, se cuentan los casos del apartado (incluidos sus subapartados):
//     - filas de tabla con una celda que solo tiene el estado (✅ ❌ 🟡 ⚠️ 🚫 ⏳ ⬜);
//     - elementos de lista que empiezan por un estado o una casilla ([x] / [ ]).
//     Cuentan como automatizados ✅ y [x]; el resto de estados, como casos sin automatizar.

const HEADING_RE = /^(?:\d+(?:\.\d+)*\.?\s*)?(.+?)\s+[—–-]\s+(\d+)\s+(?:casos?|cases?)\b(?:\s*\([^)]*\))?\s*·\s*(\d+)\s*✅/i
const STATE_RE = /^(✅|❌|🟡|⚠️?|🚫|⏳|⬜|\[[ xX]\])/u
const isDone = (state) => state === '✅' || /^\[[xX]\]$/.test(state)
const cellsOf = (line) => line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
const isSeparator = (line) => /^\|?[\s:|-]+\|?$/.test(line) && line.includes('-')

// Estado de una fila de tabla: la primera celda que solo contiene un estado
function rowState(line) {
  return cellsOf(line).find((c) => STATE_RE.test(c) && c.replace(STATE_RE, '').trim() === '') ?? null
}

// headings: los de la nota tal como los da /api/notes (con su slug), para enlazar cada ámbito con su apartado
export function parseCoverage(markdown, headings) {
  const h2 = headings.filter((h) => h.level === 2)
  const sections = []
  let current = null
  let inCode = false
  const lines = markdown.split('\n').map((l) => l.trim())
  lines.forEach((line, i) => {
    if (/^(```|~~~)/.test(line)) inCode = !inCode
    if (inCode) return
    if (/^##\s/.test(line)) {
      current = { heading: h2[sections.length], total: 0, done: 0 }
      sections.push(current)
      return
    }
    if (!current) return
    if (line.startsWith('|')) {
      // La cabecera de la tabla (la fila seguida del separador) no es un caso
      if (isSeparator(line) || isSeparator(lines[i + 1] ?? '')) return
      const state = rowState(line)
      if (state) {
        current.total++
        if (isDone(state)) current.done++
      }
      return
    }
    const item = line.match(/^(?:[-*+]|\d+\.)\s+(.*)/)
    const state = item?.[1].match(STATE_RE)?.[1]
    if (state) {
      current.total++
      if (isDone(state)) current.done++
    }
  })

  const rows = []
  for (const s of sections) {
    if (!s.heading) continue
    const m = s.heading.text.match(HEADING_RE)
    if (m) rows.push({ slug: s.heading.slug, name: m[1], total: +m[2], done: +m[3], source: 'heading' })
    else if (s.total > 0) {
      const name = s.heading.text.replace(/^\d+(?:\.\d+)*\.?\s*/, '')
      rows.push({ slug: s.heading.slug, name, total: s.total, done: s.done, source: 'count' })
    }
  }
  return rows
}
