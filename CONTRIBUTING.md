# Contribuir

¡Gracias por querer mejorar playboard-report!

## Preparar el entorno

```bash
npm install
npm run demo
```

`npm run demo` genera reportes y notas inventados en `.demo/` y abre la app con ellos en http://localhost:5174. Es la forma recomendada de probar cambios. Con `npm run dev` se usan tus propios datos de `reports/` y `notes/`.

**No subas nunca reportes ni notas reales** en un issue o pull request: pueden contener datos sensibles. Si necesitas compartir un caso, anonimízalo o reprodúcelo con la demo.

## Convenciones

### Nombres

- **Ficheros y carpetas nuevos, siempre en inglés** (`docs/ARCHITECTURE.md`, `overview-dark.png`, `src/pages/Import.jsx`…), aunque su contenido esté en castellano.
- Código (variables, funciones, componentes) en inglés. Comentarios, documentación y textos de la interfaz, en castellano.
- Las rutas de la app son URLs en castellano (`/calendario`, `/notas`…).

### Textos de la interfaz (castellano + inglés)

- **Todo texto visible pasa por `t()`** (`src/i18n`), incluidos `title`, `aria-label`, `placeholder`, `alt` y los mensajes de `window.confirm`. Se escribe en castellano: `t('Duración media')`, con variables `t('{n} tests distintos', { n })`.
- **Cada texto nuevo necesita su entrada en `src/i18n/en.js`** (clave = texto exacto en castellano). Si falta, se ve en castellano en modo inglés.
- Fechas con `fmtDate(iso, 'patrón date-fns')`: el patrón también pasa por `t()`, así que uno nuevo necesita su equivalente en `en.js` (p. ej. `'d MMM yyyy'` → `'MMM d, yyyy'`). Números y porcentajes con `fmtNum`/`fmtPct`; plurales con `plural(n, 'singular', 'plural')`.
- Si un texto lleva código u otros elementos dentro (como las guías de `Help.jsx`), se escribe un bloque JSX por idioma con `getLang()`.
- Etiquetas definidas fuera de los componentes (filtros, columnas, estados…): se guardan en castellano y se traducen al mostrarlas (`t(label)`), o con getters como `STATUS` en `config/status.js`. Nunca llames `t` a una variable.
- **Comprobación**: con la interfaz en inglés, recorre las pantallas y mira `window.__i18nMissing` en la consola del navegador: debe estar vacío.

### Colores y tema (oscuro + claro)

- Ningún color fijo en componentes ni CSS: todo son tokens de `src/styles/tokens.css`, con valor en `:root` (oscuro) y en `:root[data-theme='light']`.
- Los colores de las gráficas SVG están en `src/config/status.js` (`STATUS` y `CHART_THEMES`) y se leen con `useChartColors()`.
- Un estado (pasado, flaky, fallido, saltado) nunca se indica solo con color: siempre lleva icono o texto.

### Datos y configuración

- Si cambia el formato de `.cache/data/`, sube `SCHEMA_VERSION` en `scripts/ingest-reports.mjs`.
- La API vive solo en `server/api.mjs` (la usan `npm run dev` y el ejecutable). Si la cambias, prueba también el ejecutable con `npm run build:exe`.
- `server/` y `scripts/ingest-reports.mjs` se empaquetan en CommonJS para el ejecutable: nada de `import.meta` fuera de ramas que solo corran sin `PLAYBOARD_ROOT`, ni top-level `await` en `server/`.
- Toda ruta de fichero que llegue a la API se valida para no salir de su carpeta. Las acciones que modifican datos van por `POST` con la cabecera `x-playboard: 1`.
- Lo que el usuario decide desde la interfaz y tiene que durar se guarda en `reports/` (hoy `reports/environments.json` y `reports/reviews.json`), nunca en `.cache/`, que se puede borrar y regenerar.
- Las comparaciones entre ejecuciones (fallos nuevos, anterior/siguiente) se hacen dentro del mismo entorno (`adjacentRunIndex()` en `src/lib/stats.js`), y las pantallas nuevas de reportes filtran por entorno con `useReport()`.
- Las listas que crecen con el histórico se paginan con `usePagination()`/`paginate()` (`src/lib/usePagination.js`) y `<Pagination>` (`src/components/ui.jsx`). Excepción: el informe imprimible (`src/pages/RunReport.jsx`), que muestra todo.
- Nada específico de una suite o una empresa (módulos, categorías de notas, URLs, tickets) en los ficheros versionados: cada usuario lo pone en `src/config/*.local.js`, que está en el `.gitignore`.

### Demo y capturas

- Si añades algo que se ve en la interfaz o cambia el formato de los datos, amplía `scripts/generate-demo.mjs` para que la demo lo muestre.
- Las capturas de `docs/screenshots/` se hacen con `npm run demo` a 1600×1000. Nombre: `<pantalla>-<tema>[-en].png`. Si una pantalla cambia de forma visible, rehaz su captura.

## Antes de abrir un pull request, comprueba

1. Ficheros y carpetas nuevos con nombre en inglés.
2. Textos visibles con `t()` y su traducción en `src/i18n/en.js` (y los patrones de fecha nuevos).
3. Colores con tokens válidos en modo oscuro y claro.
4. Nada de datos de tu suite, tu empresa o personales en ficheros versionados.
5. La demo sigue funcionando y muestra lo nuevo (`npm run demo:fresh`).
6. `npm run lint` y `npm run build` sin errores.
7. Probado en el navegador en castellano e inglés, y en modo oscuro y claro.
8. Documentación al día: `README.md` (usuarios) y `docs/ARCHITECTURE.md` (técnica); capturas si cambia algo visible de forma notable.
9. Mensajes de commit en formato [Conventional Commits](https://www.conventionalcommits.org/es/) (`feat:`, `fix:`, `docs:`…).

## Uso de IA

Este proyecto se ha desarrollado con ayuda de [Claude Code](https://claude.com/claude-code). Puedes usar Claude Code u otros asistentes para contribuir: dales este fichero y `docs/ARCHITECTURE.md` como contexto. Revisa y prueba siempre lo que generen antes de proponer el cambio.
