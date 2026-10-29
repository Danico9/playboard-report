// ─── Versión web: qué carpeta elegir, con ejemplos ───
// La app busca reports/ (y notes/ a su lado) directamente dentro de la carpeta elegida, o acepta la propia reports/.
// Cada ejemplo es un árbol de carpetas con su resultado (icono + texto, nunca solo color).

import { t } from '../i18n'

// [profundidad, nombre, carpeta?, nota]
const EXAMPLES = [
  {
    result: 'ok',
    title: 'Elige la carpeta que contiene reports/ y notes/',
    tree: [
      [0, 'pruebas-app', true, '← la que eliges'],
      [1, 'reports', true],
      [2, 'playwright-reports', true],
      [3, '2026-09-23_…', true, 'un reporte'],
      [4, 'index.html', false],
      [4, 'data', true],
      [3, '2026-09-24_…', true, 'otro reporte'],
      [1, 'notes', true, 'opcional'],
      [2, 'KNOWN-ISSUES.md', false],
    ],
  },
  {
    result: 'ok',
    title: 'También vale elegir la propia reports/',
    tree: [
      [0, 'reports', true, '← la que eliges'],
      [1, 'playwright-reports', true],
      [2, '2026-09-23_…', true],
      [3, 'index.html', false],
    ],
    fix: 'Se ven los reportes, pero no las notas: el navegador no deja subir a la carpeta de arriba para buscar notes/.',
  },
  {
    result: 'no',
    title: 'reports/ y notes/ dentro de una subcarpeta',
    tree: [
      [0, 'pruebas-app', true, '← si eliges esta, no los ve'],
      [1, 'prueba2', true],
      [2, 'reports', true],
      [2, 'notes', true],
    ],
    fix: 'Elige prueba2, la carpeta que los contiene directamente.',
  },
  {
    result: 'partial',
    title: 'notes/ dentro de reports/',
    tree: [
      [0, 'pruebas-app', true, '← la que eliges'],
      [1, 'reports', true],
      [2, 'playwright-reports', true],
      [2, 'notes', true, 'aquí no se buscan'],
    ],
    fix: 'Se ven los reportes, pero no las notas: pon notes/ al lado de reports/, no dentro.',
  },
  {
    result: 'no',
    title: 'Reportes sueltos en reports/',
    tree: [
      [0, 'pruebas-app', true, '← la que eliges'],
      [1, 'reports', true],
      [2, '2026-09-23_…', true, 'sin playwright-reports/'],
      [3, 'index.html', false],
    ],
    fix: 'Cada reporte va dentro de reports/playwright-reports/. Los zips del CI se descomprimen ahí con «Importar».',
  },
]

const RESULT = {
  ok: { icon: '✓', label: 'Funciona' },
  partial: { icon: '!', label: 'A medias' },
  no: { icon: '✕', label: 'No funciona' },
}

// Líneas del árbol con sus conectores (├── └── │)
function treeLines(rows) {
  return rows.map(([depth, name, dir, note], i) => {
    let prefix = ''
    for (let level = 1; level <= depth; level++) {
      // ¿Hay más adelante otra entrada a este nivel antes de volver a uno menor?
      let more = false
      for (let j = i + 1; j < rows.length && rows[j][0] >= level; j++) {
        if (rows[j][0] === level) { more = true; break }
      }
      prefix += level === depth ? (more ? '├── ' : '└── ') : more ? '│   ' : '    '
    }
    return { prefix, name: dir ? `${name}/` : name, dir, note }
  })
}

export default function FolderGuide() {
  return (
    <div className="folder-guide">
      {EXAMPLES.map((ex) => (
        <div key={ex.title} className={`folder-example ${ex.result}`}>
          <div className="folder-example-head">
            <span className="folder-example-icon" aria-hidden>{RESULT[ex.result].icon}</span>
            <span><b>{t(RESULT[ex.result].label)}</b> · {t(ex.title)}</span>
          </div>
          <pre className="folder-tree">
            {treeLines(ex.tree).map((line, i) => (
              <div key={i}>
                <span className="muted">{line.prefix}</span>
                <span className={line.dir ? 'dir' : ''}>{line.name}</span>
                {line.note && <span className="note">  {t(line.note)}</span>}
              </div>
            ))}
          </pre>
          {ex.fix && <div className="small text-2">{t(ex.fix)}</div>}
        </div>
      ))}
    </div>
  )
}
