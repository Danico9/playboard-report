// Sustituto mínimo de node:path (POSIX) para ejecutar el código del servidor dentro del navegador
const normalizeParts = (parts) => {
  const out = []
  for (const p of parts) {
    if (!p || p === '.') continue
    if (p === '..') out.pop()
    else out.push(p)
  }
  return out
}

export const sep = '/'
export const join = (...parts) => {
  const abs = parts[0]?.startsWith('/')
  const joined = normalizeParts(parts.join('/').split('/')).join('/')
  return (abs ? '/' : '') + joined || '.'
}
export const resolve = (...parts) => {
  let acc = ''
  for (const p of parts) {
    if (!p) continue
    acc = p.startsWith('/') ? p : `${acc}/${p}`
  }
  return '/' + normalizeParts(acc.split('/')).join('/')
}
export const dirname = (p) => {
  const i = p.replace(/\/+$/, '').lastIndexOf('/')
  return i < 0 ? '.' : i === 0 ? '/' : p.slice(0, i)
}
export const basename = (p, ext) => {
  const b = p.replace(/\/+$/, '').split('/').pop()
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b
}
export const extname = (p) => {
  const b = basename(p)
  const i = b.lastIndexOf('.')
  return i > 0 ? b.slice(i) : ''
}
export const relative = (from, to) => {
  const a = resolve(from).split('/').filter(Boolean)
  const b = resolve(to).split('/').filter(Boolean)
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/')
}

const path = { sep, join, resolve, dirname, basename, extname, relative }
path.posix = path
export const posix = path
export default path
