import { useSearchParams } from 'react-router'
import { PAGE_PARAM } from './usePagination'

// Filtros de una pantalla guardados en la URL (junto al periodo): se conservan al abrir un test y volver atrás,
// y se pueden enlazar. Los valores iguales al de por defecto no se escriben en la URL.
// Cambiar un filtro vuelve a la primera página de la lista (ver usePagination).
export function useUrlFilters(defaults) {
  const [params, setParams] = useSearchParams()
  const get = (k) => params.get(k) ?? defaults[k]
  const set = (patch) => setParams((prev) => {
    const out = new URLSearchParams(prev)
    out.delete(PAGE_PARAM)
    for (const [k, v] of Object.entries(patch)) {
      if (v === defaults[k] || v == null) out.delete(k)
      else out.set(k, v)
    }
    return out
  }, { replace: true })
  return { get, set }
}
