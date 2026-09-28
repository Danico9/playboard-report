import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router'

// ─── Paginación de listas largas ───
// La página va en la URL (`pg`, porque `p` es el tipo de periodo): se conserva al abrir un test y volver atrás.
// useUrlFilters la quita al cambiar cualquier filtro. El tamaño de página es una preferencia de este navegador.

export const PAGE_SIZES = [50, 100, 250, 500]
const DEFAULT_SIZE = 100
const SIZE_KEY = 'playboard-page-size'
export const PAGE_PARAM = 'pg'

function readSize() {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY))
    return PAGE_SIZES.includes(n) ? n : DEFAULT_SIZE
  } catch {
    return DEFAULT_SIZE
  }
}

export function usePagination() {
  const [params, setParams] = useSearchParams()
  const [size, setSizeState] = useState(readSize)
  const page = Math.max(1, Number(params.get(PAGE_PARAM)) || 1)

  const setPage = useCallback((n) => setParams((prev) => {
    const out = new URLSearchParams(prev)
    if (n > 1) out.set(PAGE_PARAM, String(n))
    else out.delete(PAGE_PARAM)
    return out
  }, { replace: true }), [setParams])

  const setSize = useCallback((n) => {
    setSizeState(n)
    try {
      localStorage.setItem(SIZE_KEY, String(n))
    } catch {
      // Sin almacenamiento disponible: el tamaño dura hasta recargar
    }
    setPage(1)
  }, [setPage])

  return { page, size, setPage, setSize }
}

// Trozo de `items` que toca en la página (la página se ajusta si la lista ha encogido)
export function paginate(items, { page, size }) {
  const pageCount = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(page, pageCount)
  const from = (current - 1) * size
  return { items: items.slice(from, from + size), page: current, pageCount, from, to: Math.min(from + size, items.length), total: items.length }
}
