# Arquitectura

## Flujo de datos

```
reports/*.zip ──(pantalla Importar)──▶ reports/playwright-reports/<id>/index.html + data/
                                                   │
                           scripts/ingest-reports.mjs (al arrancar y cuando cambia algo)
                                                   │
                                                   ▼
                          .cache/data/summary.json + runs/<id>.json (+ caché .raw.json)
                                                   │
                     plugins/vite-plugin-playboard.js (API local + vigilancia de carpetas)
                                                   │
                                                   ▼
                                    App React (src/) ◀── notes/**/*.md
```

## De dónde salen los datos

El `index.html` del reporter HTML de Playwright lleva los resultados **embebidos** como un zip en base64:

```
... data:application/zip;base64,<BASE64> ...
```

Ese zip interno contiene:

- `report.json`: metadatos de la ejecución (`startTime`, `duration`, `stats`, `projectNames`, `metadata.gitCommit`, `metadata.ci`) y la lista de tests por fichero, sin detalle.
- `<fileId>.json`: uno por spec, con los resultados completos de cada test. Cada intento (`results[]`) incluye `status`, `duration`, `retry`, `errors[].message` (con códigos ANSI), `steps` y `attachments`: capturas, `error-context`, stdout y trace.

Mapeo de estados: `expected` → pasado, `unexpected` → fallido, `flaky` → flaky (pasó tras reintentar), `skipped` → saltado.

## Ingesta (`scripts/ingest-reports.mjs`)

- Recorre `reports/playwright-reports/*/index.html`, extrae el zip embebido y **normaliza** cada ejecución:
  - `date` y `time` locales, según `PLAYBOARD_TZ` o la zona del sistema;
  - `stats`, commit, rama y enlaces al CI;
  - por cada test:
    - **clave estable** `proyecto|fichero|describe › título`, para seguir el mismo test entre ejecuciones;
    - módulo e identificadores de spec (`crud-009`), deducidos del nombre del fichero;
    - intentos con su error, capturas y stdout;
    - motivo de salto: `test.skip()` o no ejecutado.
- **Firmas de error.** Agrupan errores iguales. Se calculan con la primera línea del mensaje, el `Locator:`, el `Expected:` y la ubicación `at fichero:línea`, sustituyendo los números largos por `#`.
- **Salida:**
  - `summary.json`: ejecuciones, metadatos de tests, `results[clave] = [[runIndex, outcome, duración, firma, reintentos], …]` y firmas. Lo carga la app al arrancar.
  - `runs/<id>.json`: el detalle de una ejecución. Se carga al abrirla.
- **Incremental.** `manifest.json` guarda el tamaño y la fecha de cada `index.html`. Los que no cambian se reconstruyen desde `runs/<id>.raw.json` (el JSON de Playwright sin `steps`), sin volver a leer el HTML. Si cambia el formato de salida, hay que subir `SCHEMA_VERSION`.
- **Zips.** `listZips()` lista los reportes que contiene cada zip sin descomprimirlo entero. `importZip()` extrae los reportes que falten, valida cada uno y solo entonces borra el zip.

## API local (`plugins/vite-plugin-playboard.js`)

| Ruta | Respuesta |
|---|---|
| `GET /api/summary` | `summary.json` |
| `GET /api/runs/:id` | Detalle de una ejecución |
| `GET /api/info` | Zona horaria y rutas de las carpetas |
| `GET /api/zips` | Zips de `reports/` y su estado |
| `POST /api/zips/import` | `{ files: [...] }`. Exige la cabecera `x-playboard: 1` |
| `GET /api/notes` | Índice de notas con sus encabezados |
| `GET /api/notes/file?path=` | Contenido de una nota |
| `GET /api/notes/search?q=` | Búsqueda de texto en las notas |
| `GET /reports/**` | Ficheros de los reportes (capturas, `index.html` original…) |

Todas las rutas de ficheros se validan para no salir de su carpeta. El plugin vigila `reports/` y `notes/` y avisa al navegador por el WebSocket de Vite (`playboard:data`, `playboard:zips`, `playboard:notes`), y la app recarga solo lo necesario.

## Variables de entorno

| Variable | Uso |
|---|---|
| `PLAYBOARD_TZ` | Zona horaria para asignar cada ejecución a un día (por defecto, la del sistema) |
| `PLAYBOARD_DATA_DIR` | Carpeta con `reports/` y `notes/` (por defecto, la raíz del proyecto). La caché va a `.cache/data-<carpeta>` |
| `VITE_PLAYBOARD_DEMO` | La pone `npm run demo`: ignora los `*.local.js` y usa los nombres de módulo de la demo |

## Datos de demostración

`scripts/generate-demo.mjs` crea en `.demo/` unas 40 ejecuciones de una tienda online ficticia con el formato real de Playwright (zip embebido, capturas PNG y error-context), dos zips pendientes de importar y notas de ejemplo. Los datos son deterministas (semilla fija). `scripts/demo.mjs` los genera si faltan y arranca Vite con `PLAYBOARD_DATA_DIR=.demo` en el puerto 5174.

## Idiomas (`src/i18n/`)

- `t('texto en castellano', vars)` devuelve el texto en el idioma activo. En inglés lo busca en `en.js`, cuya clave es el texto exacto en castellano; si no está, muestra el castellano. En desarrollo, los que faltan se acumulan en `window.__i18nMissing`.
- El idioma se guarda en `localStorage` (`playboard-lang`) y se aplica en `<html lang>`. Al cambiarlo, `App.jsx` vuelve a montar el router con `key={lang}`, así que `t()` es una función normal que lee el idioma del módulo, sin hooks.
- `lib/format.js` usa el idioma activo para fechas (`date-fns` con `es`/`enUS`; los patrones también pasan por `t()`), números (`es-ES`/`en-US`) y porcentajes.
- Etiquetas fuera de componentes (estados, periodos, filtros): se traducen al mostrarlas, o con getters (`STATUS`, `SKIP_REASON`, `HEALTH_LABEL`).
- Los mensajes del servidor (logs de ingesta, errores de zips) están en castellano; los que ve el usuario se traducen en el cliente.

## Frontend (`src/`)

- `lib/store.js`: caché de peticiones con `useSyncExternalStore`. Al recargar se mantienen los datos anteriores hasta que llegan los nuevos.
- `lib/usePeriod.js` y `lib/period.js`: el periodo (`?p=week&d=2026-09-22`, `?p=range&from=…&to=…`) vive en la URL.
- `lib/stats.js`: cálculos puros (estadísticas por test, módulo y firma de error, y comparación entre ejecuciones).
- `config/`: estados y colores, módulos y notas. Cada usuario los adapta con `*.local.js` (en el `.gitignore`), que se cargan con `import.meta.glob` si existen.
- `lib/theme.js`: tema oscuro (por defecto) o claro, en `<html data-theme>`. Los tokens de cada tema están en `styles/tokens.css`, y los colores de las gráficas SVG en `config/status.js` (`CHART_THEMES`).
- `pages/`: una pantalla por ruta. `components/`: piezas reutilizables (gráficas, panel de test, visor Markdown…).
