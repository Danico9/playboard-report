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
| **Ejecución**: panel del test con error, capturas y reintentos | **Tests**: índice como el reporte de Playwright, con su historial |
| ![Calendario coloreado por % de éxito](docs/screenshots/calendar-dark.png) | ![Errores agrupados por tipo](docs/screenshots/errors-dark.png) |
| **Calendario** | **Errores** agrupados |
| ![Importar zips de artefactos](docs/screenshots/import-dark.png) | ![Visor de notas](docs/screenshots/notes-dark.png) |
| **Importar** zips del CI | **Notas** en Markdown |
| ![Módulos con uno desplegado](docs/screenshots/modules-dark.png) | |
| **Módulos**: salud de cada área y todos sus tests | |
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
  - el error con sus colores, las capturas, el vídeo (con controles para adelantar y atrasar), el contexto del error y el stdout;
  - el botón **Abrir trace**, que abre la traza en el visor de Playwright que va dentro del propio reporte (también se puede descargar);
  - los reintentos y su historial en todas las ejecuciones.
- **Tests:** índice de todos los tests como en el reporte de Playwright (carpeta → fichero → `describe` → test, en el orden del código), pero con los datos de todo el periodo.
  - Cada test muestra su estado en la última ejecución, su % de éxito, fallos, flaky, duración media y una fila de cuadrados de colores, uno por ejecución.
  - Filtros por estado con contadores (como en Playwright) y «Inestables en el periodo», buscador (test, fichero, tag o módulo), módulo, proyecto y rango de fechas con atajos (últimos 7, 30 o 90 días).
  - Carpetas y ficheros se pliegan y despliegan. Los filtros van en la URL: se conservan al abrir un test y volver atrás.
- **Errores:** agrupados por tipo (mensaje, locator y línea donde falla), con los tests afectados y su evolución. Cada test suma una vez por ejecución en la que falla o es flaky. Dos pestañas:
  - **Del periodo:** los errores del periodo elegido. Se marcan como **Nuevo** los que no habían salido nunca antes del periodo.
  - **Histórico:** todos los errores de todas las ejecuciones, sin tener en cuenta el periodo.
  - En ambas se marcan como **Ya no aparece** los errores cuyos tests afectados se han vuelto a ejecutar después y no lo han repetido. Si alguno no se ha ejecutado desde entonces, el error sigue contando como activo. Se puede filtrar por estado (nuevos, siguen apareciendo, ya no aparecen).
- **Módulos:** dos pestañas.
  - **Resumen:** % de éxito por área funcional y sus tests más problemáticos. Al pulsar un módulo se despliegan todos sus tests.
  - **Tests por módulo:** tabla de estadísticas de cada test, agrupada por módulo o por fichero (o en lista), ordenable por columnas.
- **Importar:** eliges qué zips de artefactos del CI descomprimir. La app comprueba que cada reporte se lee bien y después borra el zip. El resultado se queda a la vista (aunque cambies de pantalla) hasta que lo cierras, uno a uno o todos a la vez.
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

Copia tus reportes en `reports/` y, desde la pantalla **Importar**, elige cuáles pasar al dashboard. La propia pantalla tiene una guía con la ruta exacta de cada carpeta.

**1. Zip de artefactos (recomendado si tus tests corren en CI).** Descarga el artefacto del job de Playwright y copia el `.zip`, sin descomprimir, en `reports/`. Al importarlo se descomprime y, si todo va bien, se borra el zip.

**2. Carpeta ya descomprimida.** Copia la carpeta del reporte (la que tiene `index.html` y `data/`), o una carpeta que contenga varias, también en `reports/`. Al importarla, cada reporte se **mueve** a `reports/playwright-reports/`. La carpeta original solo se borra si queda vacía: si tiene otros ficheros tuyos, se conservan.

**3. Directamente en `reports/playwright-reports/`.** Si copias ahí la carpeta del reporte, se detecta sola, sin pasar por **Importar**.

En los tres casos:
- Se aceptan carpetas con cualquier nombre. Si se llama `AAAA-MM-DD_HH-mm-ss_<suite>`, se respeta. Si no (por ejemplo, la carpeta por defecto `playwright-report/`), se nombra con la hora de inicio que guarda el propio reporte.
- Si un reporte ya estaba importado, no se duplica: al importar se borra el zip o la copia duplicada.
- Antes de mover o borrar nada se comprueba que el reporte se lee bien.
- Un zip que contiene **otros zips** (por ejemplo, un zip con varios `artifacts (N).zip` dentro) no se abre: sale como «No válido» con el aviso de descomprimirlo. Descomprímelo en `reports/` y cada zip de dentro aparecerá en **Importar**.

```
reports/
├── artifacts (12).zip                  ← zip pendiente de importar
├── informe-descargado/                 ← carpeta pendiente de importar
│   └── playwright-report/
│       ├── index.html
│       └── data/
└── playwright-reports/                 ← reportes que ya están en el dashboard
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
| `COVERAGE.md` | Cada encabezado `##` es un ámbito y se muestra como barra de cobertura (ver abajo). |

### Cobertura por ámbito (`COVERAGE.md`)

Sirve para cualquier proyecto: solo hace falta una nota con un apartado `##` por ámbito (módulo, pantalla, épica…). Si quieres usar otra nota, cambia su ruta con `COVERAGE_NOTE` en `src/config/notes.local.js`. Los números de cada ámbito salen de:

1. **El encabezado**, si los trae: `## Pagos — 28 casos · 19 ✅` (también vale `cases`, y `–` o `-` en vez de `—`). Tienen prioridad, así que puedes aplicar tus propios criterios, como excluir casos o sumar otros.
2. **Si no**, se cuentan los casos del apartado, incluidos sus subapartados:
   - filas de tabla con una celda que solo tiene el estado: `✅`, `❌`, `🟡`, `⚠️`, `🚫`, `⏳` o `⬜`;
   - elementos de lista que empiezan por un estado o por una casilla (`- [x]`, `- [ ]`).

   Cuentan como automatizados `✅` y `[x]`, y el resto de estados como pendientes.

```md
## Pagos

| # | Caso | Estado |
|---|---|---|
| 1 | Pago con tarjeta | ✅ |
| 2 | Pago con PayPal | ❌ |

- [x] Tarjetas guardadas
- [ ] Autenticación 3DS
```

Cada barra enlaza con su apartado de la nota. Los apartados sin números ni casos no se muestran.

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
export const MODULES = { cart: 'Carrito', auth: 'Autenticación' }   // nombres legibles
export const MODULE_ALIASES = { login: 'auth' }                     // agrupa identificadores equivalentes
export const MODULE_RULES = [
  { tag: '@payments', module: 'payments' },                         // por tag del test
  { path: /^api\//, module: 'api' },                                // por ruta del spec (regex)
]

// src/config/notes.local.js
export const CATEGORY_RULES = [
  ['Guías', { names: ['SETUP', 'RUNNING'] }],   // nombre de fichero sin .md
  ['Handoffs', { pattern: /^HANDOFF-/i }],      // regex sobre el nombre
  ['Módulos', { path: /^modules\// }],          // regex sobre la ruta
]
export const KNOWN_ISSUES_NOTE = 'errors/KNOWN.md'
```

**Cómo se decide el módulo de un test** (gana la primera regla que encaje):

1. **Tag explícito**: `test('…', { tag: '@module:cart' }, …)` → `cart`. Es la forma más fiable para cualquier suite.
2. **Reglas propias** de `MODULE_RULES` en `modules.local.js`, por tag o por ruta del spec.
3. **Convención de nombre** `<prefijo>-<NNN>-<módulo>-…`: `crud-009-cart-add-item.spec.ts` → `cart`.
4. **Carpeta del spec**: `checkout/cart.spec.ts` → `checkout` (si está en la raíz, `general`).

Si tus specs están organizados en carpetas por área, no hace falta configurar nada. Si todos están en la misma carpeta, usa tags o reglas.

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
| `npm run build` + `npm start` | Compila la app y la sirve sin Vite en http://localhost:4174 |
| `npm run build:exe` | Genera el ejecutable autocontenido (ver abajo) |
| `npm run lint` | ESLint |

## Ejecutable (sin instalar nada)

Para que otras personas usen playboard-report sin instalar Node.js ni clonar el repositorio:

```bash
npm run build:exe                        # incluye tu configuración de src/config/*.local.js
npm run build:exe -- --no-local-config   # ejecutable genérico, para compartir fuera de tu equipo
```

### ¿Con o sin tu configuración?

Los dos comandos generan el mismo ejecutable. Solo cambia si lleva dentro tu configuración personal, es decir, los ficheros `src/config/*.local.js`:

| | `npm run build:exe` | `npm run build:exe -- --no-local-config` |
|---|---|---|
| `modules.local.js`: nombres legibles de los módulos, alias y reglas `MODULE_RULES` | Incluido: los módulos se ven como en `npm run dev` (p. ej. «Carrito») | No incluido: los módulos se siguen detectando (tag, convención de nombre o carpeta), pero se muestran con su identificador en mayúsculas (p. ej. `CART`) |
| `notes.local.js`: categorías de notas y nombres de las notas especiales | Incluido | No incluido: se usan las categorías y nombres por defecto |
| Para qué sirve | Para usarlo tú (o dentro de tu equipo) | Para compartirlo fuera de tu equipo sin que lleve nombres de tu suite o tu empresa |

- **Los reportes y las notas nunca van dentro del ejecutable**, en ninguno de los dos casos: siempre se leen de las carpetas `reports/` y `notes/` que tiene al lado. La diferencia es solo cómo se muestran los nombres.
- El `--` del medio es necesario: le dice a npm que la opción es para el script. Sin él, npm se queda la opción y no llega.
- La opción tiene que escribirse completa, `--no-local-config`. Si no se reconoce (por ejemplo, `--no-local-confi`), se genera el ejecutable normal, **con** tu configuración.
- Al terminar, el script indica qué tipo de ejecutable ha generado si tienes ficheros `*.local.js`: «Ejecutable genérico…» o «Aviso: el ejecutable incluye tu configuración…».
- Si no tienes ningún `*.local.js`, los dos comandos dan exactamente el mismo resultado.

Se genera la carpeta `release/playboard-report-<sistema>-<arquitectura>/` con:

```
playboard-report.exe   ← la app completa (~85 MB, incluye Node.js)
reports/               ← aquí van los zips o carpetas de reportes
notes/                 ← aquí van las notas .md
README.txt
```

Comparte la carpeta entera (o un zip de ella). Al abrir el ejecutable se abre el navegador con la app, y se usan las carpetas `reports/` y `notes/` que tiene al lado; los datos procesados se guardan en `.cache/`, también al lado. Opciones: `--port <n>` y `--no-open`.

- El ejecutable sirve para el sistema en el que se genera: créalo en Windows para Windows, en macOS para macOS y en Linux para Linux. Hace falta Node.js 21.7 o superior para generarlo.
- Si actualizas el proyecto, vuelve a ejecutar el comando: solo se sustituyen el ejecutable y el `README.txt`, y lo que hay en `reports/`, `notes/` y `.cache/` se conserva. Cierra antes el ejecutable si está abierto. Si ya lo habías copiado a otro sitio, basta con cambiar el `.exe` por el nuevo. Si no cambias nada, el mismo ejecutable sigue sirviendo.
- Windows puede mostrar un aviso de SmartScreen la primera vez, porque el ejecutable no está firmado («Más información» → «Ejecutar de todas formas»).

## Cómo funciona

1. `scripts/ingest-reports.mjs` extrae los datos que el `index.html` de Playwright lleva embebidos y los normaliza en `.cache/data/`.
2. `server/api.mjs` sirve esos datos, las notas y las capturas mediante una pequeña API local, y avisa al navegador de los cambios en `reports/` y `notes/`. Lo usan tanto el plugin de Vite (`npm run dev`) como el servidor del ejecutable (`server/standalone.mjs`).
3. La interfaz es una SPA de React 19 con React Router y Recharts.

Más detalle en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Solución de problemas

- **Un zip sale como «No válido»:** no contiene ningún `index.html` de Playwright con el reporte embebido, contiene otros zips (descomprímelo en `reports/`) o aún se está copiando. Espera a que termine la copia y pulsa *Actualizar*.
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
