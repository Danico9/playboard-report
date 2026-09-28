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
       server/api.mjs (API local + avisos)  ◀── plugin de Vite (npm run dev) o server/standalone.mjs (ejecutable)
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
    - módulo automático (convención `<prefijo>-<NNN>-<módulo>` o carpeta del spec), tags e identificadores de spec (`crud-009`);
    - intentos con su error, capturas y stdout;
    - motivo de salto: `test.skip()` o no ejecutado.
- **Firmas de error.** Agrupan errores iguales. Se calculan con la primera línea del mensaje, el `Locator:`, el `Expected:` y la ubicación `at fichero:línea`, sustituyendo los números largos por `#`.
- **Salida:**
  - `summary.json`: ejecuciones, metadatos de tests, `results[clave] = [[runIndex, outcome, duración, firma, reintentos], …]` y firmas. Lo carga la app al arrancar.
  - `runs/<id>.json`: el detalle de una ejecución. Se carga al abrirla.
- **Incremental.** `manifest.json` guarda el tamaño y la fecha de cada `index.html`. Los que no cambian se reconstruyen desde `runs/<id>.raw.json` (el JSON de Playwright sin `steps`), sin volver a leer el HTML. Si cambia el formato de salida, hay que subir `SCHEMA_VERSION`.
- **Zips.** `listZips()` lista los reportes que contiene cada zip sin descomprimirlo entero. Los zips dentro de otro zip no se abren (un zip de zips puede ocupar varios GB y se lee entero en memoria): ese zip sale como no válido con un aviso para descomprimirlo en `reports/`. `importZip()` extrae los reportes que falten, valida cada uno y solo entonces borra el zip.
- **Carpetas sueltas.** `listFolders()` busca, en cada carpeta de `reports/` (salvo `playwright-reports/`), subcarpetas con `index.html` hasta 4 niveles, sin entrar en `data/` ni `trace/`. `importFolder()` valida cada reporte y lo mueve a `playwright-reports/<id>` con `moveDir()` (reintenta si Windows bloquea la carpeta y, si no puede, copia y borra). Los duplicados se borran y después solo se eliminan las carpetas que han quedado vacías: cualquier otro fichero del usuario se conserva.
- `GET /api/zips` devuelve zips y carpetas (`kind: 'zip' | 'folder'`), y `POST /api/zips/import` recibe `{ items: [{ kind, name }] }`.

## Módulos

El módulo que se muestra lo decide el cliente (`moduleOfTest` en `src/config/modules.js`), por este orden: tag `@module:<id>` del test, reglas `MODULE_RULES` de `modules.local.js` (por tag o por ruta), módulo automático de la ingesta y, al final, `general`. Después se aplican los alias (`MODULE_ALIASES`) y los nombres legibles (`MODULES`).

## API local (`server/api.mjs`)

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
| `GET /api/events` | Server-Sent Events: `playboard:data`, `playboard:zips`, `playboard:notes` |
| `GET /reports/**` | Ficheros de los reportes (capturas, vídeos, trazas, `index.html` original y visor de trazas `trace/`). Admite `Range` para poder moverse por los vídeos |

Todas las rutas de ficheros se validan para no salir de su carpeta. `createApi()` devuelve el middleware y `handleFsEvent()`, que recibe los cambios de ficheros: en desarrollo los da el watcher de Vite (`plugins/vite-plugin-playboard.js`) y en el ejecutable `fs.watch`. Los avisos llegan al navegador por Server-Sent Events (`/api/events`) y la app recarga solo lo necesario.

## Ejecutable (`npm run build:exe`)

`scripts/build-exe.mjs` genera una [Single Executable Application](https://nodejs.org/api/single-executable-applications.html) de Node.js:

1. `vite build` → `dist/`.
2. `rolldown` empaqueta `server/standalone.mjs` (con la API y la ingesta) en `build/server.cjs`.
3. `node --experimental-sea-config` crea el blob con el servidor y los ficheros de `dist/` como *assets*.
4. Copia el binario de Node e inyecta el blob con `postject`. En macOS se quita y se vuelve a poner una firma ad-hoc.

El resultado va a `release/playboard-report-<sistema>-<arquitectura>/`, con `reports/`, `notes/` y un `README.txt`. Al arrancar, `server/standalone.mjs` fija `PLAYBOARD_ROOT` en la carpeta del ejecutable (antes de cargar la ingesta, por eso la importa dinámicamente), sirve la app desde los *assets* incrustados, escucha solo en `127.0.0.1` (puerto 4174 o el siguiente libre) y abre el navegador. `npm start` usa el mismo servidor leyendo `dist/` del proyecto.

Configuración local (`src/config/*.local.js`):

- `npm run build:exe`: se incluyen en la compilación, igual que en `npm run dev`. Los nombres de módulos y las categorías de notas quedan dentro del ejecutable.
- `npm run build:exe -- --no-local-config`: se define `VITE_PLAYBOARD_NO_LOCAL=1` y `config/modules.js` y `config/notes.js` ignoran los `*.local.js`
  (igual que en la demo), así que no llegan al bundle. Es el ejecutable genérico para compartir fuera del equipo.
- En ningún caso se incrustan reportes ni notas: se leen de `reports/` y `notes/` junto al ejecutable.
- El `--` es necesario para que npm pase la opción al script, y esta se compara de forma exacta (`process.argv.includes`):
  una opción mal escrita se ignora y se genera el ejecutable con la configuración local. El script avisa al final de cuál ha generado.

## Variables de entorno

| Variable | Uso |
|---|---|
| `PLAYBOARD_TZ` | Zona horaria para asignar cada ejecución a un día (por defecto, la del sistema) |
| `PLAYBOARD_DATA_DIR` | Carpeta con `reports/` y `notes/` (por defecto, la raíz del proyecto). La caché va a `.cache/data-<carpeta>` |
| `PLAYBOARD_ROOT` | Raíz de datos y caché. La fija el ejecutable (su propia carpeta) |
| `PLAYBOARD_PORT` | Puerto del servidor de `npm start` y del ejecutable (por defecto 4174) |
| `VITE_PLAYBOARD_DEMO` | La pone `npm run demo`: ignora los `*.local.js` y usa los nombres de módulo de la demo |
| `VITE_PLAYBOARD_NO_LOCAL` | La pone `build:exe --no-local-config`: compila sin los `*.local.js` |

## Datos de demostración

`scripts/generate-demo.mjs` crea en `.demo/` unas 40 ejecuciones de una tienda online ficticia con el formato real de Playwright (zip embebido, capturas PNG y error-context), dos zips y una carpeta suelta pendientes de importar, un spec clasificado con el tag `@module:catalog` y notas de ejemplo. Los datos son deterministas (semilla fija). `scripts/demo.mjs` los genera si faltan y arranca Vite con `PLAYBOARD_DATA_DIR=.demo` en el puerto 5174.

## Idiomas (`src/i18n/`)

- `t('texto en castellano', vars)` devuelve el texto en el idioma activo. En inglés lo busca en `en.js`, cuya clave es el texto exacto en castellano; si no está, muestra el castellano. En desarrollo, los que faltan se acumulan en `window.__i18nMissing`.
- El idioma se guarda en `localStorage` (`playboard-lang`) y se aplica en `<html lang>`. Al cambiarlo, `App.jsx` vuelve a montar el router con `key={lang}`, así que `t()` es una función normal que lee el idioma del módulo, sin hooks.
- `lib/format.js` usa el idioma activo para fechas (`date-fns` con `es`/`enUS`; los patrones también pasan por `t()`), números (`es-ES`/`en-US`) y porcentajes.
- Etiquetas fuera de componentes (estados, periodos, filtros): se traducen al mostrarlas, o con getters (`STATUS`, `SKIP_REASON`, `HEALTH_LABEL`).
- Los mensajes del servidor (logs de ingesta, errores de zips) están en castellano; los que ve el usuario se traducen en el cliente.

## Frontend (`src/`)

- `lib/store.js`: caché de peticiones con `useSyncExternalStore`. Al recargar se mantienen los datos anteriores hasta que llegan los nuevos.
- `lib/usePeriod.js` y `lib/period.js`: el periodo (`?p=week&d=2026-09-22`, `?p=range&from=…&to=…`) vive en la URL.
  Los filtros de cada pantalla también, junto al periodo, con `lib/useUrlFilters.js`: el índice de Tests (`?q=…&s=failed&mod=…&proj=…`)
  y la pestaña «Tests por módulo» de Módulos (`?tab=tests&f=…&view=module|file|list&sort=…`). `DateRangeFilter` (en `PeriodToolbar.jsx`) cambia el periodo a «Rango».
- `pages/Tests.jsx`: índice tipo reporte de Playwright (carpeta → fichero → `describe` → test). Los tests se ordenan por la línea de `location`.
- `components/TestStatsTable.jsx`: tabla de estadísticas por test, agrupable por módulo o fichero; la usa la pestaña «Tests por módulo» de `pages/Modules.jsx`.
- `lib/importResults.js`: resultados de «Importar» fuera del componente (y en `sessionStorage`), para que sigan a la vista al cambiar de pantalla hasta que se cierren.
- `lib/stats.js`: cálculos puros (estadísticas por test, módulo y firma de error, y comparación entre ejecuciones). `signatureRows()` marca cada firma como `isNew` (su primera aparición en todo el histórico cae dentro de las ejecuciones pedidas) y `gone` (todos sus tests se han vuelto a ejecutar, sin saltarse, después de su última aparición).
- `config/`: estados y colores, módulos y notas. Cada usuario los adapta con `*.local.js` (en el `.gitignore`), que se cargan con `import.meta.glob` si existen.
- `lib/theme.js`: tema oscuro (por defecto) o claro, en `<html data-theme>`. Los tokens de cada tema están en `styles/tokens.css`, y los colores de las gráficas SVG en `config/status.js` (`CHART_THEMES`).
- `pages/`: una pantalla por ruta. `components/`: piezas reutilizables (gráficas, panel de test, visor Markdown…).
