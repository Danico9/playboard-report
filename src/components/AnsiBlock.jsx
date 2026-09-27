import { useMemo } from 'react'
import AnsiToHtml from 'ansi-to-html'

const converter = new AnsiToHtml({
  fg: '#d6d5cd',
  bg: '#111110',
  escapeXML: true,
  colors: {
    0: '#3a3a38', 1: '#f08b8b', 2: '#6fd66f', 3: '#fbc964', 4: '#7fb0ee', 5: '#e59ad0', 6: '#6fd2c9', 7: '#d6d5cd',
    8: '#898781', 9: '#f4a3a3', 10: '#8ee08e', 11: '#fcd68a', 12: '#9cc3f2', 13: '#ecb3dc', 14: '#8fdcd5', 15: '#ffffff',
  },
})

// Muestra errores de Playwright con sus colores ANSI (el HTML lo genera ansi-to-html con escapeXML)
export default function AnsiBlock({ text, wrap }) {
  const html = useMemo(() => converter.toHtml(text ?? ''), [text])
  return <pre className={`ansi${wrap ? ' wrap-lines' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
}
