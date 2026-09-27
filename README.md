# playboard-report

**Dashboard local para analizar el histórico de tus reportes de Playwright** y tener a mano la documentación de tu suite de tests. Modo oscuro por defecto (y claro) e interfaz en castellano o inglés.

El reporte HTML de Playwright es muy completo, pero solo muestra una ejecución. playboard-report junta todos tus reportes y te enseña cómo evolucionan por **día, semana, mes y año**: qué tests fallan más, cuáles son flaky, qué errores se repiten, qué se ha roto o arreglado desde la ejecución anterior y cuánto duran las ejecuciones. Además tiene un visor para tus notas en Markdown.

> *English summary:* a local dashboard (dark mode by default, light mode available; UI in Spanish or English) that aggregates many Playwright HTML reports over time (day/week/month/year views, flaky and failing tests, grouped errors, per-module health) plus a Markdown notes viewer. The UI can be switched between Spanish and English. Your reports and notes stay on your machine and are git-ignored.

![Resumen en modo oscuro](docs/screenshots/overview-dark.png)

<details>
<summary><b>Más capturas</b> (generadas con los datos de demostración, <code>npm run demo</code>)</summary>

| | |
|---|---|
| ![Detalle de una ejecución con el panel de un test fallido](docs/screenshots/run-dark.png) | ![Tests con su historial por ejecución](docs/screenshots/tests-dark.png) |
| **Ejecución**: panel del test con error, capturas y reintentos | **Tests**: qué suele fallar, de un vistazo |
| ![Calendario coloreado por % de éxito](docs/screenshots/calendar-dark.png) | ![Errores agrupados por tipo](docs/screenshots/errors-dark.png) |
| **Calendario** | **Errores** agrupados |
| ![Importar zips de artefactos](docs/screenshots/import-dark.png) | ![Visor de notas](docs/screenshots/notes-dark.png) |
| **Importar** zips del CI | **Notas** en Markdown |
| ![Resumen en modo claro](docs/screenshots/overview-light.png) | ![Resumen con la interfaz en inglés](docs/screenshots/overview-dark-en.png) |
| **Modo claro** | **Interfaz en inglés** |

</details>

---

## Características

- **Resumen del periodo:** % de éxito, fallidos, flaky, saltados y duración media, comparados con el periodo anterior. Gráficas por ejecución.
  - Listas de fallos nuevos, tests arreglados y tests nuevos.
  - Rankings: los que más fallan, los más flaky y los más lentos.
- **Selector de periodo común a todas las pantallas:** Todo, Año, Mes, Semana, Día o un Rango de fechas. El periodo va en la URL, así que puedes guardar o compartir la vista.
- **Calendario:** heatmap anual y calendario mensual, con cada día coloreado según su % de éxito.
- **Detalle de ejecución:** desglose por módulo y lista de tests con filtros y agrupación. Cada test abre un panel con:
  - el error con sus colores, las capturas, el contexto del error y el stdout;
  - los reintentos y su historial en todas las ejecuciones.
- **Tests:** estadísticas de cada test y una fila de cuadrados de colores, uno por ejecución, para ver de un vistazo qué suele fallar.
- **Errores:** agrupados por tipo (mensaje, locator y línea donde falla), con los tests afectados y su evolución.
- **Módulos:** % de éxito por área funcional y sus tests más problemáticos.
- **Importar:** eliges qué zips de artefactos del CI descomprimir. La app comprueba que cada reporte se lee bien y después borra el zip.
- **Notas:** visor Markdown (tablas, código resaltado, índice lateral y buscador) que se actualiza al editar los ficheros.
- **Modo oscuro y claro:** oscuro por defecto; se cambia con el botón del menú lateral y se recuerda en el navegador.
- **Castellano e inglés:** selector ES/EN en el menú lateral, con fechas y números en el formato de cada idioma.
- **Todo en local:** no hay servidor externo ni base de datos. Tus reportes y notas nunca salen de tu equipo ni se suben al repositorio.

## Requisitos

- **Node.js** 20.19 o superior, o 22.12 o superior (lo exige Vite 8)
- npm
- Reportes generados con el **reporter HTML de Playwright** (`reporter: 'html'`)

## Instalación

```bash
git clone <url-del-repositorio> playboard-report
cd playboard-report
npm install
npm run dev
```

Abre http://localhost:5173. La primera vez que hay reportes nuevos se procesan todos (unos segundos por reporte). Después se usa una caché y el arranque es casi instantáneo.

### Probarlo sin datos propios

```bash
npm run demo
```

Genera en `.demo/` los reportes y las notas de una tienda online inventada y abre la app con ellos en http://localhost:5174. No toca tus carpetas `reports/` y `notes/`. Con `npm run demo:fresh` se regeneran los datos.

## Añadir tus reportes

Hay dos formas de hacerlo. En la pantalla **Importar** de la app tienes una guía con la ruta exacta de cada carpeta.

**1. Zip de artefactos (recomendado si tus tests corren en CI).** Descarga el artefacto del job de Playwright y copia el `.zip`, sin descomprimir, en `reports/`. Aparecerá en **Importar**: selecciónalo y pulsa *Descomprimir y borrar*.

- Un zip puede traer uno o varios reportes: cualquier carpeta con el `index.html` de Playwright.
- Si la carpeta se llama `AAAA-MM-DD_HH-mm-ss_<suite>`, se respeta el nombre. Si no (por ejemplo, la carpeta por defecto `playwright-report/`), se nombra con la hora de inicio que guarda el propio reporte.
- Si un reporte ya estaba importado, no se duplica.
- El zip solo se borra si todos sus reportes se han importado correctamente.

**2. Carpeta ya descomprimida.** Copia la carpeta del reporte (con su `index.html` y `data/`) dentro de `reports/playwright-reports/`. Se detecta sola.

```
reports/
├── artifacts (12).zip                  ← zips pendientes de importar
└── playwright-reports/
    ├── 2026-09-22_01-03-33_all-tests/  ← un reporte = una ejecución
    │   ├── index.html
    │   └── data/
    └── 2026-09-23_01-03-36_all-tests/
```

**Consejo para CI.** Para guardar un reporte por ejecución, genera la carpeta con la fecha en el nombre. Por ejemplo, en `playwright.config.js`:

```js
const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')

export default defineConfig({
  reporter: [['html', { outputFolder: `playwright-reports/${stamp}_all-tests`, open: 'never' }]],
  use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' },
})
```

Y publícala como artefacto del job. En GitLab CI:

```yaml
artifacts:
  when: always
  paths:
    - playwright-reports/
```

## Añadir tus notas

Copia tus ficheros `.md` en `notes/`, con subcarpetas si quieres. Aparecen en el apartado **Notas** y se actualizan al momento cuando los editas.

Se agrupan por carpeta; las que están en la raíz de `notes/`, en *General*. Puedes definir categorías propias (ver [Personalización](#personalización)).

Funciones opcionales si existen ciertas notas (rutas relativas a `notes/`; se pueden cambiar):

| Nota | Qué hace |
|---|---|
| `KNOWN-ISSUES.md` | Los tests que menciona por su identificador (p. ej. `flows-020` o `crud 8`) se marcan como *fallo conocido* en los reportes, con sus enlaces a Jira. |
| `HISTORY.md` | Cada sección `## <nombre-del-spec>` se enlaza desde la ficha del test. |
| `COVERAGE.md` | Los encabezados `## Ámbito — 40 casos · 30 ✅` se muestran como barras de cobertura. |

## Tus datos no se comparten

Todo lo que hay dentro de `reports/` y `notes/` está en el `.gitignore`. Solo se versiona un `.gitkeep` para que las carpetas existan al clonar. Cada persona pone ahí sus propios reportes y notas.

⚠️ Los reportes de Playwright pueden contener datos sensibles: capturas de pantalla, stdout, URLs internas o datos de prueba. La app está pensada para **uso local**, así que no la publiques en un servidor accesible desde fuera.

## Personalización

| Qué | Dónde |
|---|---|
| Nombres legibles de los módulos funcionales | `src/config/modules.local.js` (ejemplo en `src/config/modules.js`) |
| Categorías y rutas de las notas especiales | `src/config/notes.local.js` (ejemplo en `src/config/notes.js`) |
| Colores de los modos oscuro y claro | `src/styles/tokens.css` (los de las gráficas también en `src/config/status.js`) |
| Zona horaria para agrupar las ejecuciones por día | Variable de entorno `PLAYBOARD_TZ` (por defecto, la del sistema) |

Los ficheros `src/config/*.local.js` están en el `.gitignore`: tu configuración personal no se sube al repositorio y no choca con las actualizaciones del proyecto. Por ejemplo:

```js
// src/config/modules.local.js
export const MODULES = { cart: 'Carrito', auth: 'Autenticación' }
export const MODULE_ALIASES = { login: 'auth' }

// src/config/notes.local.js
export const CATEGORY_RULES = [
  ['Guías', { names: ['SETUP', 'RUNNING'] }],   // nombre de fichero sin .md
  ['Handoffs', { pattern: /^HANDOFF-/i }],             // regex sobre el nombre
  ['Módulos', { path: /^modules// }],                 // regex sobre la ruta
]
export const KNOWN_ISSUES_NOTE = 'errors/KNOWN.md'
```

**Cómo se deduce el módulo de un test:**
- Si el spec sigue la convención `<prefijo>-<NNN>-<módulo>-…`, se usa ese bloque. Por ejemplo, `crud-009-cart-add-item.spec.ts` → `cart`.
- Si no, se usa la carpeta del spec: `checkout/cart.spec.ts` → `checkout`.

**% de éxito** = (pasados + flaky) / (total − saltados).

Para usar otra zona horaria:

```bash
PLAYBOARD_TZ=Europe/Madrid npm run dev          # macOS / Linux
$env:PLAYBOARD_TZ="Europe/Madrid"; npm run dev  # Windows PowerShell
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca la app en http://localhost:5173 |
| `npm run demo` | Arranca la app con datos de demostración en http://localhost:5174 (`demo:fresh` los regenera) |
| `npm run ingest` | Procesa los reportes sin arrancar la app |
| `npm run build` + `npm run preview` | Build de producción servido en local (también expone la API) |
| `npm run lint` | ESLint |

## Cómo funciona

1. `scripts/ingest-reports.mjs` extrae los datos que el `index.html` de Playwright lleva embebidos y los normaliza en `.cache/data/`.
2. Un plugin de Vite (`plugins/vite-plugin-playboard.js`) sirve esos datos, las notas y las capturas mediante una pequeña API local, y vigila las carpetas para recargar la app sola.
3. La interfaz es una SPA de React 19 con React Router y Recharts.

Más detalle en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Solución de problemas

- **Un zip sale como «No válido»:** no contiene ningún `index.html` de Playwright con el reporte embebido, o aún se está copiando. Espera a que termine la copia y pulsa *Actualizar*.
- **La primera carga tarda:** se están procesando todos los reportes. Las siguientes cargas usan la caché de `.cache/`.
- **Los datos no se actualizan:** borra la carpeta `.cache/` y reinicia `npm run dev`.
- **Puerto ocupado:** `npm run dev -- --port 5180`.

## Contribuir

Las contribuciones son bienvenidas. Consulta [CONTRIBUTING.md](CONTRIBUTING.md).

## Créditos

Creado y mantenido por **Daniel Ciscar Blazquez**.

Este proyecto se ha desarrollado con la ayuda de [Claude Code](https://claude.com/claude-code), el asistente de programación de [Anthropic](https://www.anthropic.com). El diseño, el código y la documentación se han creado en colaboración con Claude, dirigidos y revisados por el autor.

## Licencia

[MIT](LICENSE) © 2026 Daniel Ciscar Blazquez
