# Módulo Geotecnia — Estabilidad de taludes (PySlope + Pyodide)

> Documento de **mejores prácticas para implementar** un nuevo módulo de
> estabilidad de taludes en Concreta, dentro de una nueva categoría
> **"Geotecnia"**, usando la librería Python **PySlope** ejecutada en el
> navegador vía **Pyodide** (lazy-loaded, en Web Worker).
>
> Resultado de una investigación en 5 áreas (PySlope · runtime Pyodide ·
> arquitectura Concreta · dominio/normativa · UI/UX). Estado: **investigación,
> previo a implementación.** Fecha: 2026-06-23.

---

## 0. Resumen ejecutivo y decisiones clave

**Viabilidad: ALTA.** PySlope es un wheel de Python puro, su licencia (MIT) es
compatible con la de Concreta (PolyForm Noncommercial), y su cálculo está
desacoplado del plotting, por lo que podemos consumir solo los resultados
numéricos y renderizar nuestro propio SVG al estilo Concreta.

Decisiones arquitectónicas fijadas en esta investigación:

| Tema | Decisión | Por qué |
|---|---|---|
| **Licencia** | Vendorizar PySlope (MIT) conservando el aviso de copyright + `NOTICE` | MIT es permisiva; no choca con PolyForm Noncommercial. Solo exige atribución |
| **Empaquetado de PySlope** | **Vendorizar** los `.py` y parchear el import de `plotly` (moverlo dentro de los `_plot_*`) | El cálculo solo necesita `numpy`. Evita arrastrar Django/kaleido/psycopg2 |
| **Runtime Pyodide** | **Self-hosted** en `public/pyodide/`, NO CDN | Concreta es PWA offline-first; la CDN rompe el "funciona sin red" |
| **Ejecución** | **Web Worker + Comlink**, singleton cacheado entre navegaciones | No bloquear el hilo de UI; no recargar Pyodide en cada edición |
| **Carga** | **Lazy por ruta** (`route.lazy`, ya en uso) + segundo nivel lazy para el worker | El bundle principal nunca incluye Pyodide |
| **Patrón de cálculo** | Imitar `useLazyDesignSolver` de FEM 1D (motor **async** con estado `pending`) | Es el único precedente async del repo; resuelve PDF-await y lazy de 2º nivel |
| **Recálculo** | **Botón "Calcular" explícito**, NO recálculo en vivo | El round-trip a Pyodide cuesta cientos de ms–segundos. Rompe el patrón "en vivo" del resto |
| **Resultados** | El motor devuelve `CheckRow[]` con η = `límite/FoS` | Reutiliza toda la UI de checks sin escribir render nuevo |
| **Método de cálculo** | **Bishop simplificado** (default) y **Fellenius/Ordinario** — ambos conectados vía dispatch en `analyse_slope(method=…)` (parche del vendor). **Spencer/Janbu NO disponibles** | Fellenius ya seleccionable en la UI; Spencer/Janbu son limitación real de PySlope |
| **Sísmico** | Implementar pseudo-estático **por encima** de PySlope | El motor no lo trae de fábrica |
| **Estado inicial del módulo** | `shipped: false` ("Próximamente") hasta validar normativa | Mismo proceder que micropilotes |

---

## 1. Análisis de PySlope (API, dependencias y licencia)

### 1.1 Qué calcula y cómo

PySlope es estabilidad de taludes 2D por **equilibrio límite, método de dovelas**.
El motor real expuesto es **Bishop simplificado** (circular, iterativo,
`tolerance=0.005`, `max_iterations=15`).

- `_analyse_circular_failure_bishop(...)` → **Bishop simplificado**.
- `_analyse_circular_failure_ordinary(...)` → **Fellenius/Ordinario**. Originalmente solo se usaba como semilla de Bishop; el parche del vendor (`scripts/vendor-pyslope.mjs`) añadió un parámetro `method=` a `analyse_slope()` que despacha a este método cuando `method='ordinary'`. Ambos comparten contrato (devuelven `float` FoS) y `get_critical_slice_data()` es agnóstico del método.
- **No** implementa Spencer ni Janbu. `analyse_slope(method=…)` admite solo `"bishop"` (default) | `"ordinary"`.
- **Búsqueda de la superficie crítica**: malla de círculos en `self._search`, ordenada por FoS ascendente → `[0]` es el círculo crítico.
- Parámetros: `slices` (10–500, def. 25/50), `iterations` (nº de círculos, 500–100.000, def. 1000/2000), `tolerance`, `max_iterations`.
- Validado por el autor contra **Slide v6.0** y **Hyrcan v1.75**.

### 1.2 API pública (4 nombres exportados)

`Slope`, `Material`, `Udl`, `LineLoad` (no hay `PointLoad`; el rol lo cumple `LineLoad`).

```python
from pyslope import Slope, Material, Udl, LineLoad

s = Slope(height=3, angle=30, length=None)
m1 = Material(unit_weight=20, friction_angle=45, cohesion=2, depth_to_bottom=2)
m2 = Material(20, 30, 2, 5)
s.set_materials(m1, m2)
s.set_udls(Udl(magnitude=100, offset=2, length=1), Udl(magnitude=20))
s.set_lls(LineLoad(magnitude=10, offset=3))
s.set_water_table(4)
s.set_analysis_limits(s.get_top_coordinates()[0]-5, s.get_bottom_coordinates()[0]+5)
s.update_analysis_options(slices=50, iterations=2500)
s.analyse_slope()

s.get_min_FOS()            # -> float (FoS crítico)
s.get_min_FOS_circle()     # -> (c_x, c_y, radius)
s.get_min_FOS_end_points() # -> (l_c, r_c) puntos de corte con el contorno
# s._search                # -> lista de dicts {l_c,r_c,c_x,c_y,radius,FOS} ordenada por FoS
```

**Resultados crudos clave** (sin generar gráficos): `get_min_FOS()`,
`get_min_FOS_circle()` (cx,cy,r), `get_min_FOS_end_points()`, y recorrer
`s._search` para "todos los círculos por debajo de FoS X".

> ⚠️ Las dovelas individuales NO se exponen como atributo público limpio. Para
> dibujarlas (líneas verticales, peso, α, u por dovela) probablemente haya que
> reconstruirlas nosotros a partir de (cx,cy,r) + perfil del terreno + nº de
> dovelas, o hurgar en internals del objeto `Slope`. **Riesgo de acoplamiento a
> API privada** → el vendorizado nos blinda.

### 1.3 Dependencias (cálculo vs plotting)

⚠️ El `pyproject.toml`/`requirements.txt` del repo está **contaminado con la
web-app Django de demo**. Las dependencias **reales** del import de la librería
(top-level en `pyslope.py`) son solo:

| Paquete | Import real | Naturaleza | ¿Pyodide? | Rol |
|---|---|---|---|---|
| **numpy** | Sí | C nativo, **precompilado en Pyodide** | ✅ | CÁLCULO |
| **plotly** (`graph_objects`) | Sí (top-level) | Python puro | ✅ (micropip) | PLOTTING (lo sustituimos) — pero su import bloquea la carga |
| **tqdm** | Sí | Python puro | ✅ | barra de progreso (inocua; `disable=True`) |
| **colour** | Sí | Python puro | ✅ | colores |
| kaleido `==0.2.1` | No (solo export PNG) | **Binario Chromium** | ❌ | innecesario |
| django/gunicorn/psycopg2-binary/whitenoise/… | No (solo web demo) | mixto (psycopg2 = C) | ❌ | innecesario |

**No usa** shapely, scipy, pandas ni matplotlib.

### 1.4 Acoplamiento del plotting

- **Bueno**: `analyse_slope()` no dibuja; los resultados numéricos se obtienen sin gráficos.
- **Malo**: `from plotly import graph_objects as go` está **a nivel de módulo** → `import pyslope` falla si plotly no está. Solución: **vendorizar y mover ese import dentro de los `_plot_*`**, dejando el runtime dependiente solo de `numpy`.

### 1.5 Licencia — veredicto

- **PySlope: MIT** (Copyright © 2022 Jesse Bonanno). Confirmado en `LICENSE.txt`, metadata GitHub (`spdx_id: MIT`) y `pyproject.toml`.
- **Compatibilidad con PolyForm Noncommercial 1.0.0: TOTAL.** MIT es permisiva, no copyleft; no impone restricciones de uso ni obliga a relicenciar.
- **Única obligación: atribución** (conservar el aviso de copyright + texto MIT). Al vendorizar, mantener el header MIT y añadir a Jesse Bonanno en un `NOTICE`/`THIRD_PARTY_LICENSES`.
- **Vía recomendada: vendorizar** los `.py` (`pyslope.py`, `data_validation.py`, `utilities.py`, `__init__.py`).

### 1.6 Madurez

- **v1.4.0** (oct-2025), Python ≥3.7, en **PyPI** (`pyslope`), wheel `py3-none-any`.
- Activo (~76★, ~212 commits, CI, pytest, ReadTheDocs, paper).

---

## 2. Runtime Pyodide: packaging, lazy-load y rendimiento

Versión de referencia: **Pyodide 314.0.0**, micropip 0.11.1.

### 2.1 Carga en Vite — self-hosted (NO CDN)

Concreta es PWA offline-first → el runtime debe poder arrancar sin red.

```bash
bun add pyodide comlink
bun add -d vite-plugin-static-copy
```

```ts
// vite.config.ts — junto a VitePWA
import { viteStaticCopy } from "vite-plugin-static-copy";

viteStaticCopy({
  targets: [{
    src: "node_modules/pyodide/{pyodide.asm.js,pyodide.asm.wasm,pyodide.mjs,python_stdlib.zip,pyodide-lock.json}",
    dest: "pyodide",
  }],
}),
// y además:
optimizeDeps: { exclude: ["pyodide"] },
```

```ts
const pyodide = await loadPyodide({ indexURL: "/pyodide/" });
```

> El `import` de `loadPyodide` debe vivir **dentro del worker** para que quede en su propio chunk y nunca entre en el bundle principal.

### 2.2 Disponibilidad de paquetes — secuencia de bootstrap

```python
# Dentro del worker, tras loadPyodide:
# numpy se carga aparte (binario precompilado de Pyodide, más rápido que micropip)
# loadPackage(["numpy", "micropip"]) en JS
import micropip
await micropip.install(["plotly", "tqdm", "colour"])  # wheels puros
await micropip.install("pyslope", deps=False)          # ¡deps=False OBLIGATORIO!
```

> `micropip.install("pyslope")` **sin** `deps=False` **falla** porque intenta
> resolver `psycopg2-binary` y `kaleido` (binarios sin wheel WASM).
>
> **Alternativa preferida**: vendorizar los `.py`, escribirlos al FS de Pyodide
> con `pyodide.FS.writeFile`, parchear el import de plotly → runtime dependiente
> **solo de numpy** (sin micropip en absoluto). Recomendado, dado que NO usamos
> el plotting de PySlope.

### 2.3 Lazy loading (React 19 + react-router v7)

`route.lazy` ya está en uso en Concreta. El runtime va detrás de un `import()`
dinámico dentro del worker. Singleton cacheado entre navegaciones:

```ts
// client.ts — devuelve SIEMPRE la misma instancia
let workerPromise: Promise<Comlink.Remote<PySlopeWorkerApi>> | null = null;
export function getPySlope() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      const api = Comlink.wrap<PySlopeWorkerApi>(worker);
      await api.ready();
      return api;
    })();
  }
  return workerPromise;
}
```

Hook con estados `idle | booting | ready | error`; **no** terminar el worker al
desmontar la ruta (se reutiliza).

### 2.4 Web Worker + Comlink

`loadPyodide` (~2.6 s) + cálculo bloquearían la UI. Worker módulo +
`Comlink.expose(api)`. Pasar inputs como objeto JS → dict Python (`toPy`), y
**devolver resultados como JSON string** (`json.dumps`) para evitar fugas de
`PyProxy` por el límite del worker.

### 2.5 Rendimiento y caché

- **Tamaño**: primer load ~6.4 MB comprimido (core+stdlib); `.wasm` ~13 MB; + numpy. Wheels puros pequeños.
- **Cold start**: ~4–5 s primera vez; <1 s con caché del Service Worker.
- **Workbox**: los assets de Pyodide NO los captura el `globPatterns` actual (faltan `wasm/zip/mjs/json` y exceden el cap de 4 MiB). Añadir `runtimeCaching` `CacheFirst` para `/pyodide/` y subir `maximumFileSizeToCacheInBytes` a ~16 MiB.

```ts
// vite.config.ts -> VitePWA -> workbox
maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
runtimeCaching: [{
  urlPattern: ({ url }) => url.pathname.startsWith("/pyodide/"),
  handler: "CacheFirst",
  options: {
    cacheName: "pyodide-runtime",
    expiration: { maxEntries: 30, maxAgeSeconds: 60*60*24*365 },
    cacheableResponse: { statuses: [0, 200] },
  },
}],
```

- **Precalentar** en `requestIdleCallback` al hacer hover sobre la tarjeta del módulo (Concreta ya tiene prefetch en hover).
- **COOP/COEP**: **no necesarios** (Pyodide single-thread, sin SharedArrayBuffer). No activar threads → evitamos headers incompatibles con hosting estático (GitHub Pages).

---

## 3. Integración en la arquitectura de Concreta

La info de un módulo está **repartida en varias fuentes desacopladas** (no hay
manifest único). La categoría es simplemente el campo string `group`.

### 3.1 Registro de módulos y categorías

`src/data/moduleRegistry.ts` — fuente de verdad de navegación:

```ts
export interface ModuleEntry<T = ModuleInputs> {
  key: string;       // localStorage: 'concreta-...'
  route: string;     // '/geotec/taludes'
  label: string;     // 'Taludes'
  group: string;     // 'Geotecnia'  ← LA CATEGORÍA (Set de groups -> sidebar)
  defaults: T;
  shipped: boolean;  // false => "Próximamente"
}
```

El Sidebar deriva las categorías con `new Set(moduleRegistry.map(m => m.group))`.
**Crear "Geotecnia" = añadir una entrada con `group: 'Geotecnia'`.** Aquí
también va `MODULE_SCHEMA_VERSIONS` (clave = el literal pasado a
`useModuleState()`, no `key`).

### 3.2 Routing — lazy ya implementado

`src/App.tsx`, `route.lazy` de RR7:

```ts
{ path: 'geotec/taludes',
  lazy: lazyComponent(() => import('./features/slope-stability'), 'SlopeStabilityModule') },
```

Vigas es eager; **todos los demás módulos son lazy** (chunk Vite por módulo).
Hay `HydrateFallback` (deep-link en frío) y `ChunkErrorElement` (chunk obsoleto
tras deploy). El Sidebar pre-carga el chunk en hover.

### 3.3 Anatomía de un feature (`src/features/rc-beams/`)

```ts
const { state, setField, reset } = useModuleState('rc-beams', rcBeamDefaults);
const { system } = useUnitSystem();
const result = useMemo(() => calcRCBeam(state), [state]);          // motor puro SÍNCRONO
const { handleExportPdf, ... } = usePdfPreview(() => exportRCBeamsPDF(state, result, system), true);
```

- **Estado/persistencia/URL** los gestiona `src/hooks/useModuleState.ts`: prioridad **URL > localStorage > defaults**, debounce 300 ms, versionado por módulo. Serialización a URL **plana** (solo primitivos) → un talud con estratos arbitrarios probablemente necesite el camino **lz-string** de FEM (`src/features/fem-analysis/serialize.ts` + `onCopyLink` propio en el Topbar), no el plano.
- **Checks** (`src/components/checks/index.tsx`): `CheckRowItem`, `VerdictBadge`, `GroupHeader`, `ValueRow`, `overallStatus`, `ambientStyle`. Tipos/umbrales en `src/lib/calculations/types.ts`: `CheckRow`, `toStatus(util)` (`<0.8 ok`, `<1.0 warn`, `≥1.0 fail`), helpers `makeCheck`/`makeCheckQty`/`makeCheckNeutral`. **El motor debe devolver `CheckRow[]`**; para taludes la utilización natural es **η = límite/FoS** (FoS≥1.5 ⇒ η≈0.67 ⇒ verde).
- **Componentes reutilizables**: `AppShell`, `Topbar` (acepta `onCopyLink` override), `MobileTabBar`, `PdfPreviewModal`, `ModuleIcon`, `ModulePlaceholder`, `CollapsibleSection`, `HelpTooltip`, `UnitNumberInput`, `UnitSystemToggle`, hooks `useModuleState`/`useContainerWidth`/`usePdfPreview`/`useUnitSystem`.

### 3.4 Patrón motor + adaptador Pyodide

Motores = funciones puras `calcXxx(inputs): XxxResult` en `src/lib/calculations/`.
El precedente **async** es FEM 1D: `src/features/fem-analysis/useLazyDesignSolver.ts`
importa el solver en chunk aparte, devuelve `status: 'pending'` mientras carga, y
expone `ensureSolver(): Promise<...>` para que el PDF haga `await`. **Es el
patrón a imitar para Pyodide.**

Ubicación propuesta (respeta la frontera UI↔motor):

```
src/lib/calculations/geotech/
  types.ts            # SlopeInputs, SlopeResult { valid, error?, fos, surface, checks: CheckRow[] }
  slope.ts            # calcSlope(inputs): Promise<SlopeResult> — serializa al worker, mapea -> CheckRow[]
  pyslope.worker.ts   # Web Worker: Pyodide + PySlope (vendorizado), devuelve JSON crudo
```

### 3.5 Convenciones transversales

- **Unidades** (`src/lib/units/`): `soilPressure` y `weightDensity` ya existen. Añadir `Quantity` para **cohesión (kPa)** y **ángulo (grados, sin conversión)** si no encajan en los existentes (`types.ts` + `catalog.ts`).
- **Textos/normativa** (`src/lib/text/labels.ts`): centralizar vocabulario (FS, c', φ', γ, ru, β…); la referencia normativa de cada check va en `CheckRow.article` (string libre).
- **PDF** (`src/lib/pdf/`): un archivo por módulo. Crear `src/lib/pdf/slopeStability.ts` (jsPDF + svg2pdf.js + helpers de `utils.ts`). El botón PDF **nunca se deshabilita** → debe `await ensureSolver()`.
- **Tests** (Vitest + jsdom): `src/test/slope-stability/`. **Pyodide no corre en jsdom** → testear el adaptador con el **worker mockeado**; ejecución real de PySlope en test de integración/e2e separado.

### 3.6 Vite/PWA

`vite.config.ts` usa Workbox **offline-first con precaching total** y
`runtimeCaching: []`. Para Pyodide (decenas de MB) hay que **poblar
`runtimeCaching`** (CacheFirst) y subir `maximumFileSizeToCacheInBytes`. Web
Workers: Vite 8 los soporta nativamente (`new Worker(new URL(...), {type:'module'})`).
Deploy en GitHub Pages (`public/CNAME`, `404.html` SPA redirect, `base:'/'`).

---

## 4. Dominio geotécnico y normativa (CTE DB-SE-C / Eurocódigo 7)

### 4.1 Teoría base

FoS = resistencia al corte disponible / tensión de corte movilizada, a lo largo
de la superficie de rotura. Bishop simplificado (lo que da PySlope):

> **FoS = Σ(c'·l + (N − u·l)·tan φ') / Σ(W·sen α)**

- **Largo plazo / drenado**: parámetros efectivos **(c', φ')**, presión intersticial vía nivel freático.
- **Corto plazo / sin drenaje** (cohesivos saturados): tensiones totales con **φ_u=0, c=c_u** (CTE DB-SE-C 4.2.3.1).
- Nivel freático y sobrecargas en coronación **reducen** el FoS.

### 4.2 Normativa — valores y artículos

**CTE DB-SE-C** (filosofía de **coeficientes parciales que minoran el terreno**, no FoS global):

- **Estabilidad global** (cimentación/edificación), **Tabla 2.1**:
  | Situación | γ_M (materiales) | γ_R | γ_E | γ_F |
  |---|---|---|---|---|
  | Persistente/transitoria | **1,8** | 1,0 | 1,0 | 1,0 |
  | Extraordinaria | **1,2** | 1,0 | 1,0 | 1,0 |
- **Talud de excavación** (Cap. 7, **art. 7.2.2.1**) → **γ_R directo sobre la resistencia** = **FoS global**:
  - **γ_R = 1,5** persistente/transitoria · **1,1** extraordinaria (γ_E=γ_F=γ_M=1).

> ⚠️ **Dualidad**: estabilidad global de cimentación usa γ_M=1,8 (Tabla 2.1);
> talud de excavación usa γ_R=1,5 (art. 7.2.2.1). El módulo debe dejar **elegir
> el contexto**.

**Eurocódigo 7 (UNE-EN 1997-1)** — España adopta **Enfoque de Proyecto 3 (DA3)**
para taludes/estabilidad global:

- Tabla A.4 (γ_M, set M2): **γ_φ' = γ_c' = 1,25** (drenado), **γ_cu = 1,40** (sin drenaje), γ_γ=1,0.
- Tabla A.3 (γ_F, set A2): variable desfavorable **×1,3**, permanente ×1,0.
- DA3: acciones geotécnicas con γ=1,0, variables ×1,3, terreno minorado por M2, γ_R=1,0 → criterio **FoS_d ≥ 1,0**.

**Guía Cimentaciones Carretera / ROM 0.5-05** (FoS global):
| Situación | ROM | Guía Carretera |
|---|---|---|
| Permanente | 1,4 | **1,5** |
| Transitoria | 1,3 | 1,3 |
| Accidental/sísmica | 1,1 | 1,1 |

### 4.3 Mapeo PySlope → normativa

PySlope da un **FoS global**. Equivalencia demostrada (CEDEX): minorar c' y tan φ'
por γ y exigir FoS≥1,0 ≡ no minorar y exigir FoS≥γ. **Por eso PySlope sirve para
ambas filosofías sin tocar el motor** — solo cambian los parámetros de entrada y
el umbral. Presentación de doble verificación:

1. **FoS global estático** (parámetros característicos) vs F_min (1,5 / 1,8…). η% = F_min/FoS·100.
2. **Verificación EC7-DA3** (re-ejecutar con c'/1,25, atan(tanφ'/1,25), variables ×1,3) → FoS_d ≥ 1,0.
3. **FoS sísmico pseudo-estático** (ver 4.4).

### 4.4 Inputs esperados (técnico español)

- Geometría: H (m), β (º) o H:V, bermas.
- Estratos: c (kPa), φ (º), γ y γ_sat (kN/m³); distinguir (c',φ') vs (c_u, φ_u=0).
- Nivel freático (cota).
- Sobrecargas coronación: q (kPa, UDL) y/o lineal (kN/m).
- Sísmico **NCSE-02**: a_c = S·ρ·a_b; k_h = a_c/g (con factor de reducción editable — **no fijado por NCSE-02 para taludes**, es criterio de proyecto).
- Unidades: kPa, kN/m³, grados, m.

### 4.5 Tabla de checks propuesta

| # | Comprobación | Artículo | Límite |
|---|---|---|---|
| 1 | FoS estático global — talud de excavación | CTE DB-SE-C **art. 7.2.2.1** | FoS ≥ 1,5 (pers.) / 1,1 (extraord.) |
| 2 | Estabilidad global cimentación (vía minoración) | CTE DB-SE-C **Tabla 2.1** | FoS_d(c'/1,8, tanφ'/1,8) ≥ 1,0 |
| 3 | Verificación EC7 – DA3 | UNE-EN 1997-1 Anexo A (A2+M2+R3) | FoS(c'/1,25, tanφ'/1,25; o c_u/1,40, Q×1,3) ≥ 1,0 |
| 4 | FoS estático carreteras/ROM (permanente) | Guía Cimentaciones / ROM 0.5-05 | FoS ≥ 1,5 / 1,4 |
| 5 | FoS transitorio (construcción) | Guía/ROM, situación fundamental | FoS ≥ 1,3 |
| 6 | FoS sísmico pseudo-estático (k_h=a_c/g) | NCSE-02 + ROM/Guía accidental | FoS_sismo ≥ 1,1 |
| 7 | Sin drenaje (corto plazo, φ_u=0, c=c_u) | CTE DB-SE-C 4.2.3.1 | FoS ≥ límite de la situación |

> η% con FoS: η% = límite/FoS·100. CUMPLE si FoS ≥ límite.

### 4.6 Incertidumbres normativas (verificar antes de producción)

- **EC7 Tablas A.3/A.4/A.14**: valores confirmados por fuentes técnicas, pero **no leídos del texto oficial UNE**. γ_R;e para taludes (1,0 en DA3 vs 1,1 en R2) → **cotejar Anejo Nacional Español**.
- **CTE Tabla 2.1 y art. 7.2.2.1**: leídos del PDF oficial → alta confianza.
- **NCSE-02 / factor de reducción de k_h**: NO fijado por la norma para taludes → parámetro editable, no valor cerrado.
- **PySlope: solo Bishop circular**. **Sin sísmico nativo, sin Spencer/Janbu, sin superficies no circulares** → el check sísmico y los no circulares hay que implementarlos/documentar la limitación.
- **ROM 1,4/1,3/1,1**: de tabla comparativa secundaria → citar apartado exacto de la ROM si se muestra en UI.

---

## 5. UI/UX y visualización (SVG en vivo, estados de carga, PDF)

Referencias directas en el repo: **muro de contención**
(`src/features/retaining-wall/`, mismo problema visual: terreno con estratos, NF,
sobrecarga), **micropilotes** (`src/features/micropiles/`, editor de estratos +
bandas de suelo) y **FEM 1D** (solver lazy con estados `pending`).

### 5.1 Estilo Concreta (cómo se construye el SVG)

- Componente puro `({inp, result, width, height, mode}) => JSX`, `mode: 'screen'|'pdf'` con **dos paletas** (`SCREEN_PALETTE`/`PDF_PALETTE`).
- **Escala uniforme** `scale = min(drawW/anchoFísico, drawH/altoFísico)` + centrado; **flip de Y** (`sy(y) = PAD_T + (totalH - y)*scale`).
- `viewBox="0 0 w h"`; `width` de `useContainerWidth()`; responsive por breakpoint **dentro del componente** (`isVertical = width<380`).
- Colores semánticos `--color-state-ok/warn/fail/neutral`, acento `--color-accent`.
- Helpers reutilizables: `Arrow`, `HDim`, `VDim`, `TitleChip` (en `RetainingWallSVG.tsx`). Fuente `Geist Mono` para números.
- **Estratos ya resueltos**: 6 pares de tokens `--color-geo-s1a/s1b … s6a/s6b` + `<pattern>` de textura (puntos=granular, líneas=cohesivo), rotando `i % 6` — lo usa `MicropilesSVG.tsx`.
- **Sanitización** `svgText(s, isPdf)` (griegas/acentos → ASCII) obligatoria en modo PDF.

### 5.2 Qué dibujar

Contrato de datos worker→UI sugerido:
`{ fos, circle:{cx,cy,r}, entry:{x,y}, exit:{x,y}, slices:[{x0,x1,yTop,yBase,alpha,weight,u}], failureProfile:[[x,y]...], method, slicesN }`.

**Vista 1 — Sección del talud** (principal, nuevo `SlopeStabilitySVG.tsx`, esqueleto de `RetainingWallSVG`):
- Estratos clipeados a la silueta del terreno (bandas por `depth_to_bottom`, color/textura por tipo, rótulo `E{i} · γ/φ/c'`).
- Perfil del terreno (rasante gruesa con penachos), tramo de talud inclinado.
- Nivel freático (línea discontinua azul + relleno de ondas + etiqueta `NF`).
- Sobrecargas coronación (UDL = banda + flechas hacia abajo `state-warn` + chip `q`; LineLoad = flecha gruesa).
- **Superficie de rotura circular crítica**: arco `<path A>` en `state-fail`, centro O (`<circle>` + anillo), radio discontinuo con chip `R`, dots en entrada/salida; masa deslizante sombreada `fillOpacity 0.12` en color del estado del FoS.
- **Dovelas**: líneas verticales finas (`P.dim`, opacidad 0.5).
- **Etiqueta FoS** destacada (chip grande arriba-derecha, punto de color según estado, `FoS = 1.42` mono 14px).
- Cotas H, β con `VDim`/`HDim`.

**Vista 2 — Malla de centros / mapa de FoS** (pestaña "Diagramas"): perfil
atenuado de fondo + rejilla de centros probados coloreados por su FoS (gradiente
ok→warn→fail), centro crítico resaltado, mini-leyenda de gradiente con valores
(accesibilidad daltónica). Muestra la robustez del mínimo.

Ambas vistas se renderizan también en clon oculto `mode="pdf"` (`left:-9999px`).

### 5.3 Formularios de input

Panel izquierdo `lg:w-72` con `CollapsibleSection` + `UnitNumberInput`
(conmutador kPa/kN·m² vía `quantity`). Secciones: Geometría (H, β/L) · Nivel
freático · Sobrecargas (q, +línea) · **Estratos** (reutilizar `SoilStrataEditor`
de micropilotes: filas con `MiniNumField`, `Trash2`, `+ Añadir`, `SOIL_LIMITS`
que clampan en blur y marcan `aria-invalid`) · Método.

> ⚠️ **Selector de método limitado por PySlope**: ofrece **Bishop** (default) y
> **Fellenius** (ambos conectados). **NO ofrecer Spencer/Janbu** — no
> existen. Además `nº dovelas` (10–200) e `iteraciones`.

Validación: rangos por campo + invariantes (Σespesores ≥ H, NF dentro del talud,
≥1 estrato). Inválido → SVG muestra placeholder "Sin datos"; el botón PDF avisa
por toast pero **no se deshabilita**.

### 5.4 UX de carga de Pyodide (el módulo diverge aquí)

Dos costes: cold-start de Pyodide (segundos, una vez) + cómputo por análisis
(cientos de ms–s, cruza al worker). Por eso **botón "Calcular" explícito**, no
recálculo en vivo. Hook `useSlopeSolver(model)` → `{engineState, result, calculate(), cancel()}`.

```
engineState:
  'idle'      → motor no solicitado
  'loading'   → 1ª vez: descargando Pyodide + PySlope    "Cargando motor geotécnico…"
  'ready'     → motor caliente, ocioso
  'computing' → cada análisis                            "Calculando… Bishop · 50 dovelas"
  'error'     → fallo                                    borde state-fail + [Reintentar]
```

- En `loading`/`computing` el **canvas no se vacía**: último SVG válido atenuado (`opacity 0.4`) + overlay con spinner `Loader2` acento (estética `RouteFallback`). Evita layout shift.
- Botón "Calcular" prominente; badge **"resultados desactualizados"** (warn) cuando el `state` cambió respecto al último análisis (comparar `inputsFingerprint`).
- **Cancelación** por `requestId`: descartar resultados de requests obsoletos; botón "Cancelar" durante `computing`. El primer `calculate()` dispara la carga si está `idle`.

### 5.5 Resultados y checks

Reutiliza `src/components/checks/index.tsx` + layout de `IsolatedFootingResults.tsx`:
- Bloque con `ambientStyle(status)` + `VerdictBadge`; `overallStatus(checks)`.
- **FoS destacado** (fila tipo `FSRow`, valor mono grande, límite `(≥1.5)`, ✓/⚠/✗).
- Checks normativos como `CheckRowItem` (descripción + `article`, valor/límite mono, barra η% en `lg+`, tag de estado).
- **Tabla de dovelas** colapsable (`CollapsibleSection defaultOpen={false}`): nº, x, b, W, α, u, contribución.
- Resúmenes geometría/centro crítico con `GroupHeader` + `ValueRow`.

### 5.6 Export PDF

Nuevo `src/lib/pdf/slopeStability.ts` siguiendo `isolatedFooting.ts`:
- A4 retrato, `drawHeader` con **versión del motor** (PySlope/vendor) — crítico para trazabilidad legal — en cabecera y todos los footers.
- **Figura**: localizar clon oculto `#slope-stability-svg-pdf` e incrustar con **`embedSvgAsImage`** (rasteriza a PNG 3×). **Obligatorio rasterizar** porque nuestros estratos usan gradientes + opacidad de grupo y svg2pdf vectorial genera streams que Acrobat rechaza.
- Columna de inputs + resumen (FoS, centro, radio) + **tabla de checks** con `drawTable` (paginación atómica por fila). Texto por `pdfStr()`/`svgText(...,true)`.
- `usePdfPreview(() => exportSlopeStabilityPDF(state, result, system), true)`.

---

## 6. Plan de implementación consolidado

### Archivos a CREAR

| # | Archivo | Propósito |
|---|---|---|
| 1 | `src/features/slope-stability/index.tsx` | export `SlopeStabilityModule` |
| 2 | `src/features/slope-stability/SlopeInputs.tsx` | formulario (geometría, estratos, NF, cargas, método) |
| 3 | `src/features/slope-stability/SlopeResults.tsx` | FoS + checks + tabla de dovelas |
| 4 | `src/features/slope-stability/SlopeStabilitySVG.tsx` | sección del talud (vista 1) |
| 5 | `src/features/slope-stability/SlopeSearchSVG.tsx` | malla de centros / mapa de FoS (vista 2) |
| 6 | `src/features/slope-stability/useSlopeSolver.ts` | hook lazy/async (calco de `useLazyDesignSolver`) |
| 7 | `src/lib/calculations/geotech/types.ts` | `SlopeInputs`, `SlopeResult` (con `checks: CheckRow[]`) |
| 8 | `src/lib/calculations/geotech/slope.ts` | adaptador `calcSlope(): Promise<SlopeResult>` |
| 9 | `src/lib/calculations/geotech/pyslope.worker.ts` | Web Worker Pyodide + PySlope vendorizado |
| 10 | `src/lib/calculations/geotech/vendor/pyslope/*.py` | PySlope vendorizado (header MIT + import plotly parcheado) |
| 11 | `src/lib/pdf/slopeStability.ts` | `exportSlopeStabilityPDF(...)` |
| 12 | `src/test/slope-stability/*.test.ts(x)` | tests (motor con worker mockeado + routing) |
| 13 | `NOTICE` / `THIRD_PARTY_LICENSES` | atribución MIT a Jesse Bonanno |

### Archivos a MODIFICAR

| # | Archivo | Cambio |
|---|---|---|
| 1 | `src/data/defaults.ts` | `SlopeInputs` + `slopeDefaults` |
| 2 | `src/data/moduleRegistry.ts` | import defaults, union `ModuleInputs`, `ModuleEntry` con `group:'Geotecnia'`, ruta `/geotec/taludes`, key `concreta-slope-stability`, `MODULE_SCHEMA_VERSIONS` |
| 3 | `src/data/routeLoaders.ts` | `'/geotec/taludes': () => import('../features/slope-stability')` |
| 4 | `src/App.tsx` | ruta hija lazy de `<AppShell />` |
| 5 | `src/data/routeMeta.ts` | SEO `'/geotec/taludes'` |
| 6 | `src/components/ui/ModuleIcon.tsx` | `case 'concreta-slope-stability'` (SVG talud) |
| 7 | `src/lib/units/types.ts` + `catalog.ts` | (si procede) `Quantity` cohesión/ángulo |
| 8 | `src/lib/text/labels.ts` | labels de talud (FS, c', φ', γ, ru, β…) |
| 9 | `vite.config.ts` | `viteStaticCopy` Pyodide, `optimizeDeps.exclude`, `runtimeCaching` + `maximumFileSizeToCacheInBytes` |
| 10 | `src/pages/landing/modules.tsx` | (si va en marketing) entrada `MODULE_LIBRARY` grupo `GEOTECNIA` |
| 11 | `package.json` | `pyodide`, `comlink`, `vite-plugin-static-copy` (fijar versión Pyodide) |

### Orden sugerido (incremental, verificable)

1. **Vendorizar PySlope** + parchear import plotly + `NOTICE`. Smoke test Python reproduciendo el ejemplo del README y comparando FoS de referencia.
2. **Worker Pyodide aislado** (`pyslope.worker.ts` + `client.ts`): cargar runtime, ejecutar el ejemplo, devolver `{fos, circle, entry, exit}` por Comlink. Verificar fuera de React (página de prueba).
3. **Adaptador `slope.ts` + tipos** con worker **mockeado** en tests.
4. **Alta del módulo** en el registro (`shipped:false`, placeholder) → comprobar navegación/categoría Geotecnia/lazy chunk.
5. **Inputs + estado** (reutilizar `SoilStrataEditor`; valorar lz-string para la URL).
6. **SVG vista 1** (sección) → **vista 2** (malla).
7. **`useSlopeSolver` + botón Calcular** + estados de carga + cancelación.
8. **Checks normativos** (`CheckRow[]`, η=límite/FoS, selector de contexto/situación).
9. **Export PDF** (rasterizar figura, versión del motor en cabecera/footers).
10. **Sísmico pseudo-estático** por encima del motor (si entra en alcance).
11. **Validación normativa** (cotejar EC7/ROM/Anejo Nacional) → flip a `shipped:true`.

---

## 7. Riesgos transversales y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `import pyslope` falla por plotly top-level | Vendorizar y mover el import dentro de los `_plot_*` |
| `micropip.install("pyslope")` falla (psycopg2/kaleido) | `deps=False` o, mejor, vendorizar (runtime solo numpy) |
| Pyodide (decenas de MB) vs PWA offline + cap Workbox 4 MiB | Self-host + `runtimeCaching` CacheFirst + subir cap a 16 MiB |
| Framework de estado asume cálculo **síncrono** | Imitar `useLazyDesignSolver` (estado `pending`), no `useMemo` directo |
| "PDF nunca deshabilitado" con motor async | `await ensureSolver()` antes de exportar (como FEM) |
| Serialización de estado (estratos arbitrarios) no cabe en `useModuleState` plano | Camino lz-string + `onCopyLink` propio (como FEM) |
| Dovelas/coords no expuestas limpiamente por la API pública | Vendorizar; reconstruir dovelas desde (cx,cy,r) + nº dovelas; tests de contrato |
| Pyodide no corre en jsdom | Tests con worker mockeado; PySlope real en integración/e2e aparte |
| Cold-start variable (1 s caché → 10 s+ red lenta) | Precalentar en hover/idle; UI de "preparando motor…"; comunicar progreso |
| Coste por análisis impredecible bloquea worker | Cancelación por `requestId` + botón Cancelar; límites de iteraciones/dovelas |
| Divergencia UX (único módulo con "Calcular") | Badge "resultados desactualizados"; tooltip explicando el porqué |
| PDF con gradientes rompe Acrobat | `embedSvgAsImage` (raster 3×), no svg2pdf vectorial |
| Límites normativos no confirmados (EC7/ROM/Anejo Nacional) | Arrancar `shipped:false`; cotejar texto oficial antes de producción |
| Sin sísmico/Spencer/no-circular en PySlope | Implementar sísmico pseudo-estático encima; documentar limitación; no ofrecer Spencer en UI |

---

## 8. Fuentes

- PySlope: [GitHub JesseBonanno/PySlope](https://github.com/JesseBonanno/PySlope) · [PyPI](https://pypi.org/project/pyslope/) · [docs](https://pyslope.readthedocs.io/)
- Pyodide 314.0.0: [bundlers/Vite](https://pyodide.org/en/stable/usage/working-with-bundlers.html) · [web worker](https://pyodide.org/en/stable/usage/webworker.html) · [deploying](https://pyodide.org/en/stable/usage/downloading-and-deploying.html) · [packages](https://pyodide.org/en/stable/usage/packages-in-pyodide.html) · [micropip](https://micropip.pyodide.org/en/stable/project/api.html)
- Normativa: [CTE DB-SE-C](https://www.codigotecnico.org/pdf/Documentos/SE/DBSE-C.pdf) · [Guía Cimentaciones Carretera (CEDEX)](https://www.transportes.gob.es/recursos_mfom/0710401.pdf) · [FoS y EC7 / Anejo Nacional — Simposio Taludes 2013 (UPM/CEDEX)](https://oa.upm.es/29893/1/INVE_MEM_2013_167047.pdf) · [GEO5 Design Approaches](https://www.finesoftware.eu/help/geo5/en/design-approaches-01/) · [NCSE-02 (geotecniafacil)](https://geotecniafacil.com/calculo-sismico-ncse-02/)
- Arquitectura Concreta: repo local (`src/features/`, `src/data/moduleRegistry.ts`, `src/hooks/useModuleState.ts`, `src/components/checks/`, `src/lib/pdf/`, `vite.config.ts`)

---

## 9. Resultado de la revisión de ingeniería (/plan-eng-review, 2026-06-24)

Revisión de 4 secciones + voz externa (Codex gpt-5.5). Decisiones tomadas con el
autor. **Estas decisiones reemplazan lo que las contradiga en las secciones 0-8.**

### 9.1 Alcance: implementación POR FASES

- **Phase 0 — Spike desechable (puerta go/no-go).** Antes de tocar la app. Criterios de paso (refinados con Codex #1):
  1. Pyodide arranca **self-hosted y offline** (assets precacheados).
  2. **numpy carga localmente** sin red.
  3. Reproducir el ejemplo del README → **FoS coincide con la referencia** validada (Slide/Hyrcan).
  4. **Validar el mapeo de inputs de Concreta** (unidades, profundidad de estratos, convención del nivel freático, colocación de sobrecargas, transformación de coordenadas) — no solo "arranca".
  5. **Medir cold-start y cómputo** a precisión por defecto y máxima → fijar umbral de tiempo go/no-go.
  6. Confirmar que PySlope **expone la geometría real de dovelas** (cx,cy,r + peso/u/α por dovela) para un SVG fiel.
- **Phase 1 — Corte vertical** (`shipped:false`): motor + plumbing de registro + inputs + 1 SVG de sección + **2 checks normativos core** + PDF.
- **Phase 2 — Completar**: SVG malla de centros, tabla de 7 checks completa, sísmico, enlaces lz-string, entrada en landing, flip a `shipped:true`.

### 9.2 Decisiones (secciones de revisión)

| # | Decisión | Refinamiento de la voz externa |
|---|---|---|
| **1. Motor async** | Hook dedicado `useSlopeSolver`: resultado en estado, worker + Comlink, botón **Calcular** explícito. NO el `useMemo` síncrono de FEM. | **T2:** cancelación REAL = `worker.terminate()` + recrear + re-warm en segundo plano + **máximo de iteraciones acotado** (requestId solo no para Pyodide). |
| **2. Assets Pyodide** | Copia **selectiva**: core + wheel de numpy + deps transitivas + `pyodide-lock.json`. | **#3/#4:** **precachear** los assets vía Workbox (no solo runtime CacheFirst) y **versionar el nombre de caché** a la versión Pyodide fijada (evitar mezclar assets viejos con worker nuevo tras deploy). |
| **3. Vendoring** | Vendor PySlope (MIT) + **script de re-parche** + versión fijada + **golden FoS test** que falla si el cálculo deriva. | **#11:** trazabilidad en PDF = versión motor + **hash del parche** + **hash de inputs** + perfil normativo. |
| **4. Tests** | Proyecto **Vitest node** para el golden test (Pyodide corre en Node) + adaptador con worker mockeado + UI en jsdom. Smoke Playwright (offline) → Phase 2. | — |
| **5. Cómputo** | Defaults WASM (**iter 1000 / slices 25**) + toggle de precisión. | **T1 (revisión):** **NO** dividir FoS/γ como regla universal — **re-correr PySlope por check** con los parámetros reales (c'/γ, atan(tanφ/γ), cargas ×1,3); usar la división solo donde el spike demuestre coincidencia <1%. |

### 9.3 Decisiones de la voz externa (cross-model)

| Tensión | Decisión |
|---|---|
| **T1** Equivalencia FoS/γ | Aceptada Codex: re-correr por check (ver 9.2 #5). |
| **T2** Cancelación falsa | Aceptada Codex: terminate-and-recreate + re-warm (ver 9.2 #1). |
| **T3** Persistencia | Phase 1: **blob JSON anidado en localStorage** (soporta estratos/cargas). Enlaces lz-string → Phase 2. |
| **T4** Límite de producto | **Declarar el alcance en UI + PDF**: método Bishop circular, sin no-circular/Spencer, sísmico aproximado; "predimensionamiento, no sustituye un estudio geotécnico". Mismo espíritu que citar el artículo normativo. |

### 9.4 Codex absorbido (sin decisión, se incorpora)

- **#6 Sísmico** puede ser **fork-level** (inyectar fuerza horizontal por dovela), no un simple post-factor → Phase 2, riesgo a validar.
- **#7 Geometría**: PySlope solo modela talud simple + estratos horizontales por profundidad. **Bermas, banquetas, geometría de excavación y estratigrafía no horizontal quedan FUERA del motor** (ver "NOT in scope").
- **#8 Fidelidad SVG**: el worker emite la **geometría real de dovelas de PySlope**; nunca reconstruir dovelas en JS para el dibujo/PDF (defensibilidad legal).
- **#9 `shipped:false` en producción**: gatear la ruta/worker de Pyodide tras dev/flag para que el placeholder **no infle la PWA de producción**.
- **#11 Trazabilidad PDF** (ver 9.2 #3).
- **#12 Versión Pyodide**: **verificada** — `314.0.0` es la última real (npm saltó 0.29.4 → 314.0.0).

### 9.5 NOT in scope (considerado y diferido)

- **Superficies no circulares / cuñas** — PySlope solo circular.
- **Spencer / Janbu** — no existen en PySlope.
- **Bermas, banquetas, geometría de excavación, estratigrafía no horizontal** — fuera del modelo público de PySlope (Codex #7).
- **Sísmico pseudo-estático** — Phase 2; posible fork-level (#6).
- **Enlaces compartibles lz-string** — Phase 2 (T3).
- **Taludes en roca** (CTE 7.2.2.2) — fuera del alcance circular.
- **Tabla completa de 7 checks (ROM/carreteras/sin-drenaje)** — Phase 2; Phase 1 = 2 checks core (CTE 7.2.2.1 + EC7-DA3).

### 9.6 What already exists (reuso vs reconstrucción)

| Existe | Uso |
|---|---|
| `useLazyDesignSolver` (FEM) | Reusar la idea **lazy-chunk + ensureSolver**; NO el `useMemo` síncrono (adaptado a async). |
| `SoilStrataEditor` (micropilotes) | Reusar tal cual el editor de estratos. |
| `RetainingWallSVG` + helpers (`Arrow`/`HDim`/`VDim`/`TitleChip`, paletas dual) | Base estructural del SVG de sección. |
| `components/checks/` | Reusar `CheckRowItem`/`VerdictBadge`/`overallStatus`. |
| `lib/pdf/utils` (`drawTable`, `embedSvgAsImage`, `drawHeader`) | Reusar para el PDF. |
| tokens `--color-geo-s1..s6` + patterns de suelo | Reusar para estratos. |
| `moduleRegistry`/`routeLoaders`/`App`/`routeMeta`/`ModuleIcon` | Extender (plumbing). |

Sin reconstrucciones innecesarias detectadas.

### 9.7 Failure modes (por codepath nuevo)

| Codepath | Fallo realista | ¿Test? | ¿Manejo? | ¿Visible? |
|---|---|---|---|---|
| `bootstrap()` worker | asset 404 / wasm fail | sí (golden+UI) | error state + Reintentar | sí |
| `loadPackage(numpy)` offline | wheel no precacheado | smoke Phase 2 | error state | sí |
| `analyze()` malla patológica | monopoliza worker | sí | terminate+recreate+watchdog | sí (Cancelar) |
| vendor bump | deriva del FoS | **golden test** | falla CI | sí (CI) |
| SVG dovelas | diverge del cálculo | assert dibujo==worker | emitir datos reales | sí |
| PDF antes de ready | resultado vacío | sí | `await ensureSolver()` | sí |

**Sin gaps críticos** (todo fallo tiene test + manejo + es visible, no silencioso).

### 9.8 Estrategia de paralelización (worktrees)

| Lane | Módulos | Depende de |
|---|---|---|
| Phase 0 spike | scratch (no en la app) | — (puerta) |
| A — Motor | `lib/calculations/geotech/` + vendor | Phase 0 OK |
| B — Plumbing | `data/` + `App.tsx` + `ModuleIcon` | — |
| C — SVG | `features/slope-stability/*SVG` | contrato de datos de A |
| D — PDF | `lib/pdf/slopeStability` | C + tipos de A |

Orden: **Phase 0 (gate) → A + B en paralelo → C tras el contrato de A → D tras C.**
Conflicto: A y C tocan `features/slope-stability` + `lib/calculations/geotech` — coordinar.

### 9.9 Implementation Tasks

Sintetizadas de los hallazgos. P1 bloquea ship de fase; P2 misma rama; P3 follow-up.

- [ ] **T1 (P1, human: ~half day / CC: ~30min)** — Phase 0 — Spike go/no-go con los 6 criterios de §9.1 (boot+offline+numpy+FoS-ref+mapeo-inputs+tiempos+dovelas reales).
  - Surfaced by: Scope challenge + Codex #1 — "Phase 0 validates PySlope, not Concreta's mapping".
  - Files: `scratch/` (no en la app).
  - Verify: FoS del README coincide <1% con la referencia; tiempos por debajo del umbral.
- [ ] **T2 (P1, human: ~1-2 d / CC: ~1-2h)** — Motor — `useSlopeSolver` async + worker + Comlink + cancelación terminate-and-recreate + re-warm + iter acotadas.
  - Surfaced by: Architecture Issue 1 + Codex #2 (T2).
  - Files: `src/features/slope-stability/`, `src/lib/calculations/geotech/`.
  - Verify: Cancelar detiene el cómputo; UI no se congela.
- [ ] **T3 (P1, human: ~1h / CC: ~10min)** — Assets — copia selectiva Pyodide (core+numpy+lock) + **precache Workbox** + caché versionada.
  - Surfaced by: Architecture Issue 2 + Codex #3/#4.
  - Files: `vite.config.ts`.
  - Verify: offline tras instalar, sin fetch a CDN; nueva versión invalida caché vieja.
- [ ] **T4 (P1, human: ~3h / CC: ~25min)** — Vendoring — script re-parche + versión fijada + golden FoS test + trazabilidad (hash parche/inputs).
  - Surfaced by: Code Quality Issue 3 + Codex #11.
  - Files: `scripts/vendor-pyslope.*`, `src/lib/calculations/geotech/vendor/`, `NOTICE`.
  - Verify: golden test falla si el FoS deriva.
- [ ] **T5 (P1, human: ~half day / CC: ~40min)** — Tests — proyecto Vitest node (golden) + adaptador mock-worker + UI jsdom.
  - Surfaced by: Test review Issue 4.
  - Files: `vitest.config` (proyecto node), `src/test/slope-stability/`.
  - Verify: `bun run test:run` corre golden en node y UI en jsdom.
- [ ] **T6 (P1, human: ~3h / CC: ~25min)** — Checks — re-correr PySlope por check (sin división FoS/γ); 2 checks core (CTE 7.2.2.1 + EC7-DA3) como `CheckRow[]`.
  - Surfaced by: Performance Issue 5 + Codex #5 (T1).
  - Files: `src/lib/calculations/geotech/slope.ts`, `src/lib/text/labels.ts`.
  - Verify: FoS_design por check == PySlope con parámetros reales (no dividido).
- [ ] **T7 (P1, human: ~2h / CC: ~15min)** — Persistencia — blob JSON anidado en localStorage (estratos/cargas) con versionado.
  - Surfaced by: Codex #10 (T3).
  - Files: `src/features/slope-stability/`, `src/data/moduleRegistry.ts` (`MODULE_SCHEMA_VERSIONS`).
  - Verify: recargar conserva estratos.
- [ ] **T8 (P1, human: ~1h / CC: ~10min)** — Producto — disclaimer de alcance en UI + PDF (Bishop circular; predimensionamiento).
  - Surfaced by: Codex #13 (T4).
  - Files: `src/features/slope-stability/`, `src/lib/pdf/slopeStability.ts`.
- [ ] **T9 (P1, human: ~2h / CC: ~15min)** — SVG fiel — worker emite geometría real de dovelas; sin reconstrucción JS.
  - Surfaced by: Codex #8.
  - Files: `src/lib/calculations/geotech/pyslope.worker.ts`, `*SVG.tsx`.
  - Verify: dovelas dibujadas == dovelas del worker.
- [ ] **T10 (P2, human: ~30min / CC: ~5min)** — Prod-gate — ruta/worker Pyodide tras dev/flag mientras `shipped:false`.
  - Surfaced by: Codex #9.
  - Files: `src/App.tsx`, `vite.config.ts`.
- [ ] **T11 (P3)** — Phase 2 — malla de centros, tabla 7 checks, sísmico (fork-level a evaluar), lz-string, smoke Playwright offline, flip `shipped:true`.

### 9.10 Completion summary

- Step 0 Scope: **scope reducido** (fasear con spike go/no-go).
- Architecture: **2** issues (ambos resueltos).
- Code Quality: **1** issue (resuelto).
- Test: diagrama producido, **~20** gaps (net-new) → plan de tests añadido.
- Performance: **1** issue (resuelto; revisado por voz externa).
- NOT in scope: escrito (§9.5).
- What already exists: escrito (§9.6).
- TODOS.md: **1** epic propuesto y aceptado.
- Failure modes: **0** gaps críticos.
- Outside voice: **Codex (gpt-5.5)** ran — 13 findings; 4 tensiones a decisión, 6 absorbidos, version verificada.
- Parallelization: 4 lanes (A+B paralelos, C/D secuenciales tras A).
- Unresolved decisions: ninguna.

## 10. Resultado de la revisión de diseño (/plan-design-review, 2026-06-24)

Revisión calibrada contra [DESIGN.md](../DESIGN.md) (sistema codificado, sin
mockups IA). Puntuación global **6/10 → ~9/10**. El módulo hereda el 80 % del
sistema por reuso; el trabajo de diseño está en las **superficies novedosas**.

### 10.1 Decisiones de diseño

- **D2 — Botón "Calcular":** Concreta no tenía acción primaria (todo es en vivo). Botón **accent** (rounded 4px, Geist) **al ancho de la cabecera del panel de resultados**, encima del FoS/checks; spinner inline mientras calcula; badge **state-warn "resultados desactualizados"** cuando el input cambió desde la última corrida. Documentar el patrón nuevo en DESIGN.md.
- **D3 — Estado inicial / pre-cálculo:** dibujar la **geometría en vivo** (talud, estratos, agua, sobrecargas) al instante desde los inputs + banda hint **"Pulsa Calcular para el factor de seguridad"** (patrón Caso-de-ejemplo). La **capa calculada** (círculo crítico, dovelas, FoS) aparece tras Calcular. El prewarm en hover acelera el primer Calcular.
- **D4 — Disclaimer de alcance:** **línea permanente neutra** en resultados (text-secondary, bajo el método: "Bishop circular · predimensionamiento") + **ⓘ HelpTooltip** con el texto largo (sin no-circular/Spencer; no sustituye estudio geotécnico) + disclaimer completo en el **PDF**. Reusa value-row + HelpTooltip.

### 10.2 Fixes incorporados (sin decisión)

- **Tema:** corregir la prosa "oscuro slate-950 por defecto" → **claro es el por defecto, oscuro la firma, ambos obligatorios** (DESIGN.md 2026-06-09). El `SCREEN_PALETTE` del SVG usa **tokens que conmutan por tema**, no hex oscuro fijo. PDF intacto (grises).
- **A11y:** región **`aria-live="polite"`** que anuncia el estado del motor/cálculo (cargando motor / calculando / listo FoS X / desactualizado); **`aria-busy`** en el lienzo durante el cómputo; Calcular/Cancelar enfocables por teclado.
- **Split geometría/resultado:** el SVG dibuja la **geometría al instante**; solo la **capa de resultado** espera a Pyodide. El lienzo no es todo-o-nada.
- **Canvas dot-grid:** aplicar `.canvas-dot-grid` al wrapper del SVG (solo screen), diferenciador del sistema.

### 10.3 Tabla de estados de interacción

| Estado | Disparador | Lienzo | Panel resultados | A11y |
|---|---|---|---|---|
| pre-cálculo | abrir módulo | geometría en vivo + hint "Pulsa Calcular" | botón Calcular accent; checks vacíos | aria-live idle |
| booting | 1er Calcular en frío | geometría + overlay "Cargando motor geotécnico…" (spinner CSS) | botón con spinner | aria-live "cargando motor" |
| computing | Calcular | geometría + último resultado atenuado (opacity 0.4) + overlay "Calculando…" | botón spinner; **Cancelar** | aria-live "calculando" |
| ready | cálculo OK | geometría + capa calculada (círculo, dovelas, FoS) | FoS + checks + verdict badge | aria-live "listo, FoS X" |
| stale | editar tras resultado | resultado anterior atenuado | badge state-warn "resultados desactualizados" | aria-live "desactualizado" |
| error | fallo carga/cálculo | geometría + overlay borde state-fail | mensaje + [Reintentar] | aria-live assertive |
| invalid | input fuera de invariantes | placeholder "Sin datos" | toast PDF (no deshabilitado) | aria-invalid en campos |

### 10.4 Puntuaciones por pasada

Info Arch 7→9 · Estados 6→9 · Journey 7→9 · AI Slop 9 (sin issues) · Design System 6→9 · Responsive/A11y 6→8 · Decisiones: 4 resueltas, 0 diferidas.

### 10.5 NOT in scope (diseño)

- Mockups IA / nueva identidad visual — el sistema está codificado; se hereda.
- Polish visual de la vista 2 (malla de centros) — Phase 2.
- Diseño móvil más allá del reuso de `MobileTabBar` + SVG responsive.

### 10.6 What already exists (diseño)

DESIGN.md (sistema), `RetainingWallSVG` (paletas dual + helpers), `SoilStrataEditor`,
`components/checks` + ambient verdict, `CollapsibleSection`, `HelpTooltip`, patrones
welcome-banner / Caso-de-ejemplo / validation-banner, `MobileTabBar`, canvas dot-grid.

### 10.7 Design Implementation Tasks

- [ ] **DT1 (P1, human: ~3h / CC: ~25min)** — Botón "Calcular" accent en cabecera de resultados + spinner inline + badge stale (D2). Files: `src/features/slope-stability/`, DESIGN.md (documentar patrón).
- [ ] **DT2 (P1, human: ~half day / CC: ~40min)** — Máquina de estados UI (pre/booting/computing/ready/stale/error/invalid) por §10.3 (Pass 2). Files: `src/features/slope-stability/useSlopeSolver.ts` + componentes.
- [ ] **DT3 (P1, human: ~2h / CC: ~20min)** — Split geometría-en-vivo / capa-resultado en el SVG + banda hint pre-cálculo (D3). Files: `*SVG.tsx`.
- [ ] **DT4 (P1, human: ~1h / CC: ~10min)** — Línea disclaimer + HelpTooltip + texto en PDF (D4). Files: `src/features/slope-stability/`, `src/lib/pdf/slopeStability.ts`.
- [ ] **DT5 (P1, human: ~1h / CC: ~10min)** — Paleta SVG por tokens (claro por defecto/oscuro); corregir prosa de tema (Pass 5). Files: `*SVG.tsx`, este doc §5.
- [ ] **DT6 (P1, human: ~2h / CC: ~15min)** — A11y: región aria-live de estado + aria-busy + teclado Calcular/Cancelar + dot-grid (Pass 6). Files: `src/features/slope-stability/`.

### 10.8 Paridad visual con PySlope (elementos obligatorios)

El usuario aportó los SVG de referencia de PySlope (caso del README, FoS 1.573 con
malla 2500/50 — coincide con nuestro 1.5438 a 1000/25, la diferencia es resolución).
**Estos elementos DEBEN aparecer**, renderizados en el lenguaje de Concreta (tokens,
Geist, dot-grid, paletas dual screen/PDF). Mapeo elemento → render Concreta:

**Vista 1 — sección crítica**

| Elemento PySlope | Render en Concreta |
|---|---|
| Capas de suelo rellenas (salmón φ45 / verde φ30) | Polígonos por estrato con `--color-geo-s{i}a/b` + textura, **clipeados al perfil del terreno** |
| Perfil del terreno (coronación → talud → pie → llano) | Línea de rasante gruesa (`P.ground`) con penachos |
| Nivel freático (línea + ▽) | Línea discontinua `P.water` + triángulo ▽ + etiqueta `NF` (cota) |
| **UDL completa `20 kPa`** (banda + flechas) | Banda `state-warn` con flechas abajo + chip `q = 20 kPa`, sobre toda la coronación |
| **UDL tira `100 kPa`** (caja corta, length=1) | Banda corta (offset+length) + chip; distinta de la UDL completa |
| **Carga lineal `10 kN/m`** (flecha única) | Flecha gruesa vertical en su offset + chip `10 kN/m` |
| **Círculo de rotura crítico** (arco) | `<path>` arco en `state-fail`, masa deslizante `fillOpacity 0.12` |
| **2 líneas de radio al centro + FoS en el ápice (`1.573`)** | Centro O + 2 líneas de radio (discontinuas, acento) hasta O + **etiqueta FoS junto a O** (mono), además del chip en el panel de resultados |
| **Marcadores de límite de análisis** (◄ izq/der) | Banderines en los límites `set_analysis_limits` (left/right) |
| **Tabla-leyenda de materiales** (MATERIAL/COLOR/γ/c/φ) | Mini-tabla embebida (esquina) con swatch de color por estrato + γ, c, φ; estilo `ValueRow`/mono |

**Vista 2 — búsqueda / mapa de FoS**

| Elemento PySlope | Render en Concreta |
|---|---|
| **Abanico de TODAS las superficies de prueba**, cada arco coloreado por su FoS | Dibujar los arcos de `s._search` (no solo los centros), color por FoS con gradiente ok→warn→fail |
| **Colorbar de FoS** (rojo 0.0 → verde 2.0 → azul 3.0) | Leyenda de gradiente vertical (patrón `GradientLegend` de zapatas) con valores numéricos |

> Nota golden test (T4): la FoS depende de la malla. **Fijar `iterations`/`slices`
> exactos** en el caso de referencia (p.ej. 1000/25 → 1.5438) para que el test sea
> determinista; documentar que con 2500/50 da 1.573.

- [ ] **DT7 (P1, human: ~3h / CC: ~25min)** — Paridad visual: 3 tipos de carga distintos (UDL completa/tira/lineal), líneas de radio + FoS en el ápice, marcadores de límite ◄, tabla-leyenda de materiales embebida, y vista 2 con arcos coloreados por FoS + colorbar. Surfaced by: imágenes de referencia PySlope. Files: `src/features/slope-stability/*SVG.tsx`.

## 11. Phase 0 — Resultados del spike (Node, 2026-06-24)

Spike desechable ejecutado en **Node 22 + pyodide@314.0.0** (no navegador todavía).
Retira los riesgos de mayor incertidumbre (correctitud del cálculo, instalación,
exposición de datos, velocidad). **Veredicto: GO.**

### 11.1 Criterios

| # | Criterio | Resultado |
|---|---|---|
| 2 | numpy carga | ✅ `loadPackage(numpy)` OK (0.3s) |
| 3 | Ejemplo README → FoS | ✅ `import pyslope` + `analyse_slope()` OK; **FoS = 1.544** (geometría del README, mesh 1000/25). Físicamente razonable; librería validada por el autor vs Slide/Hyrcan |
| 4 | Mapeo de inputs | ✅ API acepta `Material` multicapa, `Udl`, `LineLoad`, `set_water_table`, `set_analysis_limits` y devuelve resultado |
| 5 | Tiempo de cómputo | ✅ **0.5s** por análisis (1000 iter / 25 dovelas) en WASM-Node; install one-time ~1.3s (cacheable); cold path total 4.0s |
| 6 | Geometría de dovelas | ⚠ **Parcial** (ver 11.3) |
| 1 | Boot offline self-hosted | ✅ **navegador real, sin CDN** (ver 11.5) |
| 5b | Cold-start navegador | ✅ **2.9s** total (boot 1.65s + numpy 0.26s + vendor/import/cómputo) |

### 11.2 🐛 BUG encontrado en el plan (corregido)

`micropip.install("pyslope", { deps: false })` **desde JS NO funciona**: Pyodide
mapea el objeto `{deps:false}` al **2º argumento posicional (`keep_going`)**, no a
`deps`, así que la resolución de dependencias SÍ corre y revienta con
`ValueError: Can't find a pure Python 3 wheel for: 'kaleido==0.2.1', 'psycopg2-binary'`.

**Fix (verificado en el spike):** instalar **desde Python** dentro del worker, donde
`deps=False` es un kwarg real:
```python
import micropip
await micropip.install(["tqdm", "colour", "plotly"])
await micropip.install("pyslope", deps=False)   # kwarg real
```
(o `micropip.install.callKwargs("pyslope", { deps: false })` desde JS). El snippet
de §2.2/§2.4 que usa la forma JS con objeto está **mal** — usar la forma Python.

### 11.3 Exposición de datos (criterio 6)

- **Expuesto limpio:** `get_min_FOS()`, `get_min_FOS_circle()` → `(c_x, c_y, radius)`, `get_min_FOS_end_points()`, y `s._search` (975 círculos: `{l_c, r_c, c_x, c_y, radius, FOS}`).
- **`s._slices` es un `int` (=25), el CONTEO de dovelas, NO los objetos dovela.** La física por dovela (peso, u, α) **no se retiene** en una estructura pública.
- **Implicación:** las **líneas verticales de dovelas** son geometría pura (exactas desde cx,cy,r + endpoints + conteo) → dibujables sin física. Una **tabla por dovela** (peso/u/α) requiere que el **fork vendorizado** haga que `_analyse_circular_failure_bishop` devuelva los arrays por dovela (cambio pequeño, controlamos el código). Refina DT/T9 y Codex #8.
- **Fellenius conectado** (`_analyse_circular_failure_ordinary`) vía el parámetro `method=` añadido a `analyse_slope()` en el parche del vendor. Golden de referencia (caso README, 1000/25): Bishop 1.5437888, Fellenius 1.2261248.
- **tqdm leakea** a stdout (`for i, search in enumerate(tqdm(self._search))`) → el parche `disable=True` (T4) es necesario.

### 11.4 Pase en navegador — Phase 0 CERRADA ✅

Vite 8 + Web Worker (module) + Pyodide **self-hosted** en `public/pyodide/`,
manejado en navegador real vía headless. **Resultado:**

```
boot Pyodide (self-hosted):  1.65 s
numpy load (wheel local):    0.26 s
cold-start total:            2.89 s   (boot + numpy + escribir vendor + import + cómputo)
cómputo (1000 iter/25 dov):  0.55 s
FoS = 1.5437888…  →  IDÉNTICO al spike Node y al path micropip
red: 0 peticiones a CDN/PyPI/jsdelivr — todo de localhost (offline-capable)
footprint offline copiado:  ~16 MB (core wasm 10 + stdlib 3 + numpy 3)
```

- **Criterio 1 (offline self-hosted): ✅** — `indexURL:'/pyodide/'`, numpy desde el wheel copiado, **pyslope vendorizado** escrito al FS de Pyodide; **plotly/tqdm/colour STUBEADOS** → el runtime depende **solo de numpy**. Cero micropip, cero red. Valida T3 (copia selectiva) **y** T4 (vendor + numpy-only).
- **Criterio 5 (cold-start navegador): ✅** — 2.9s en frío; con worker singleton + prewarm, los siguientes análisis son solo ~0.55s.

### 11.5 Aprendizajes del pase navegador (para Phase 1)

- **Stub numpy-only validado:** en vez de parchear los imports de pyslope, basta inyectar módulos stub `tqdm`/`colour`/`plotly` en `sys.modules` antes de `import pyslope` (el `colour.Color` necesita `.hex` y `range_to(other,n)` porque `utilities.py` construye `COLOUR_FOS_DICT` en import-time). Más limpio que editar el fork; el fork puede hacer los imports perezosos, pero el stub demuestra numpy-only.
- **Gotcha Vite:** `import('/pyodide/pyodide.mjs')` de un fichero en `public/` da **500** (`Cannot import non-asset file inside /public`), incluso con `@vite-ignore`. Fix: construir la URL como expresión NO literal (`new URL('/pyodide/'+'pyodide.mjs', self.location.origin).href`) para que `vite:import-analysis` la deje pasar como fetch real.
- **Worker en módulo:** `new Worker(new URL('./worker.js', import.meta.url), {type:'module'})` + `worker:{format:'es'}` en `vite.config` funciona nativo en Vite 8.
- El **FoS reproducible** (Node = navegador = micropip) da confianza para el **golden test** (T4): el valor de referencia es estable entre entornos.

## 12. Cotejo normativo (Phase 2) — verificación contra fuente oficial (T5.1, 2026-06-24)

Verificación de los **límites de los checks implementados** en
[`src/lib/calculations/geotech/slope.ts`](../src/lib/calculations/geotech/slope.ts)
(T2.1) y sus etiquetas en [`labels.ts`](../src/lib/text/labels.ts), cotejados
**leyendo el texto oficial** con `/browse` (gstack, headless Chromium) + descarga
directa de los PDF y extracción de texto. Resuelve las incertidumbres de §4.6.

### 12.1 Fuentes consultadas (texto oficial leído)

| # | Documento | Cómo se accedió | Apartados leídos |
|---|---|---|---|
| A | **CTE DB-SE-C** (Documento Básico Seguridad Estructural — Cimientos, ed. consolidada) | PDF oficial `codigotecnico.org` (165 pág., descargado y `pdftotext`) | **Tabla 2.1** (pág. SE-C-6), **art. 7.2.2.1** (pág. SE-C-93/94), **apdo. 4.2.3.1** (pág. SE-C-27/28) |
| B | **Estaire J., Olivenza G. (2013), "Factores de seguridad en la estabilidad de taludes", VIII Simposio Nacional sobre Taludes y Laderas Inestables** (CEDEX / Lab. de Geotecnia — los autores son los redactores del Anejo Nacional) | PDF `oa.upm.es/29893` (12 pág.) | §3.2 Enfoques de Proyecto, §3.3 acciones (A2), §3.4 Tabla 4 (M2 taludes), Tabla 3 (FS por documento) |
| C | **Guía de Cimentaciones en Obras de Carretera** (Dirección General de Carreteras / Lab. Geotecnia CEDEX) | PDF (mirror `arquitectosdecadiz.com`; el host oficial `transportes.gob.es` devuelve 403/WAF tanto por `/browse` como por `curl`) | **§4.4 Estabilidad global, Tabla 4.1**; §2.10 Tabla 2.1 (estructura F1/F2/F3) |

> URLs: CTE → `https://www.codigotecnico.org/pdf/Documentos/SE/DBSE-C.pdf` ·
> Simposio Taludes 2013 → `https://oa.upm.es/29893/1/INVE_MEM_2013_167047.pdf` ·
> Guía Carreteras (oficial, **bloqueado** por WAF) → `https://www.transportes.gob.es/recursos_mfom/0710401.pdf`;
> copia leída → `https://www.arquitectosdecadiz.com/wp-content/uploads/2017/12/GUIA_CIM_CARRET.pdf`.
> El Anejo Nacional Español de UNE-EN 1997-1 **no está publicado en abierto**; la
> fuente B (sus propios redactores) es el sustituto autorizado para los valores DA3/M2/A2 de taludes.

### 12.2 Tabla de hallazgos

| # | Check (id) | Límite implementado | Veredicto | Cita oficial | Valor oficial |
|---|---|---|---|---|---|
| 1 | `fos-static` — talud excavación | γ_R = **1,5** pers./trans. · **1,1** extraord. | ✅ **confirmado** | CTE DB-SE-C **art. 7.2.2.1**, §2 (pág. SE-C-93) | "γ_R = 1,5 para situaciones persistentes y transitorias; γ_R = 1,1 para situaciones extraordinarias. γ_E = γ_F = γ_M = 1" (literal) |
| 2 | `fos-cte-tabla21` — estabilidad global cimentación | γ_M = **1,8** pers./trans. · **1,2** extraord.; FoS_d ≥ **1,0** | ✅ **confirmado** | CTE DB-SE-C **Tabla 2.1** (pág. SE-C-6), fila "Estabilidad global" | Persistente/transitoria: γ_R=1,0 · **γ_M=1,8** · γ_E=1,0 · γ_F=1,0. Extraordinaria: γ_R=1,0 · **γ_M=1,2** · γ_E=1,0 · γ_F=1,0 |
| 3 | `fos-ec7-da3` — EC7 DA3 (M2+A2) | γ_φ'=γ_c'=**1,25**; cargas variables ×**1,3**; γ_R=1,0; FoS_d ≥ **1,0** | ✅ **confirmado** (con matiz, ver 12.3) | UNE-EN 1997-1 vía fuente B: §3.2 (DA3 para taludes), §3.3 (A2: perm. ×1,0, variable desf. ×1,3), §3.4 ("Anexo A: cohesión 1,25, rozamiento 1,25, corte sin drenaje 1,40, peso 1,00") | DA3 = sólo mayoración de acciones (A2) + minoración de parámetros (M2); **resistencias γ_R = 1,0** (Tabla 2 del paper: columna "minoración de resistencias" vacía para DA3) |
| 4 | `fos-rom` — carreteras/ROM | FoS ≥ **1,5** perm. · **1,3** trans. · **1,1** acc. | ✅ **confirmado** | Guía Cimentaciones Carretera **§4.4, Tabla 4.1** (pág. 85) | Coef. NORMAL: casi permanente **F1=1,50** · característica **F2=1,30** · accidental **F3=1,10**. (ROM 0.5-05, vía Tabla 3 fuente B: 1,4 / 1,3 / 1,1) |
| 5 | `fos-undrained` — sin drenaje | Tensiones totales, φ_u=0, c=c_u; límite de la situación | ✅ **confirmado** | CTE DB-SE-C **apdo. 4.2.3.1**, §1.d y §3 (pág. SE-C-27/28) | "...la resistencia al corte del terreno podrá expresarse en términos de tensiones totales, representada mediante un ángulo de rozamiento interno φ=0 y una cohesión c=cu" (literal). §3: "en tensiones totales (c=cu, φ=0) para situaciones transitorias sin drenaje" |
| 6 | `fos-seismic` — sísmico | fila NEUTRA, diferida a Phase 3 | ✅ N/A (no afirma límite) | — | Correcto: no se afirma ningún valor normativo; se declara pendiente |

### 12.3 Matices y observaciones (no son errores; no requieren corrección de código)

1. **Check #3 (EC7-DA3) — cobertura sólo drenada.** El módulo re-corre DA3 con el
   set **M2 drenado** (c'/1,25, atan(tanφ'/1,25)) y cargas ×1,3. **NO** ejecuta una
   variante DA3 *sin drenaje* con **γ_cu = 1,40** (confirmado oficial: fuente B §3.4
   y Anexo A). El caso sin drenaje se cubre por la vía **CTE** (check #5, c=cu sin
   minorar, comparado con γ de la situación), que es normativa y trazable. Para un
   talud drenado (el caso por defecto, sin estratos con `su`) el check #3 es
   **exacto**. Sugerencia (opcional, Phase 3, NO bloqueante): si hay estratos con
   `su>0`, añadir una segunda corrida DA3 con `c_u/1,40` para el caso sin drenaje.
   El `help` del label `fos_ec7_da3` ya menciona "γcu = 1,40 (sin drenaje)", de modo
   que el texto promete algo que el motor sólo evalúa por la vía CTE — es un matiz
   de redacción, no un error de cálculo.

2. **Check #4 (carreteras/ROM) — mapeo situación→combinación.** La Guía estructura
   los FS por *combinación de acciones* (casi permanente F1 / característica F2 /
   accidental F3), no por *situación de proyecto*. El módulo mapea:
   `permanent→1,5 (F1)`, `transient→1,3 (F2)`, `extraordinary→1,1 (F3)`. Es el mapeo
   estándar y **defendible** (Tabla 2.1 de la Guía asocia la situación persistente a
   la comb. casi permanente, y transitoria/corto plazo puede tomar F2). El label cita
   correctamente ROM 0.5-05 (1,4) junto a la Guía (1,5). ✅

3. **Item normativo de nomenclatura.** El check #5 cita "CTE DB-SE-C **4.2.3.1**".
   En el texto oficial es un **apartado** (no "artículo"); además la regla φ_u=0/c=cu
   está en 4.2.3.1.§1.d y se reafirma en §3 para estabilidad global. La cita es
   correcta en sustancia; "art." podría leerse mejor como "apdo." (cosmético).

4. **Tabla 2.1 (#2) — la fila exacta.** El PDF lista "Estabilidad global" con
   γ_M=1,8 (persistente/transitoria) y γ_M=1,2 (extraordinaria); γ_R=γ_E=γ_F=1,0.
   El código aplica γ_M a c' y a tanφ' con cargas sin mayorar y umbral FoS_d≥1,0,
   que es **exactamente** la lectura correcta de esa fila. ✅

5. **EC7-DA3 — selección del Enfoque para España.** Confirmado por fuente B (§3.2):
   el Anejo Nacional Español **elige DA3 para estabilidad de taludes y estabilidad
   global** (DA2 para el resto de actuaciones geotécnicas). La incertidumbre principal
   de §4.6 ("γ_R;e para taludes en DA3 = 1,0") queda **resuelta: γ_R = 1,0** (en DA3
   no se minoran resistencias; sólo acciones A2 + parámetros M2).

### 12.4 Veredicto

**GO ✅.** Los cinco límites numéricos que el módulo afirma como normativos están
**confirmados contra texto oficial**: CTE art. 7.2.2.1 (1,5/1,1), CTE Tabla 2.1
(1,8/1,2, FoS_d≥1,0), EC7-DA3 (M2 1,25 + A2 ×1,3 + γ_R=1,0), Guía de Carreteras
Tabla 4.1 (1,5/1,3/1,1) y CTE 4.2.3.1 (tensiones totales φ_u=0, c=cu). No se ha
encontrado **ningún valor incorrecto** que un usuario profesional vería como error.
Los matices de 12.3 son de redacción/alcance (cobertura DA3 sin-drenaje diferible a
Phase 3, "art."→"apdo.") y **no bloquean** la publicación. La incertidumbre crítica
del Anejo Nacional (γ_R;e en DA3) queda resuelta a favor de la implementación.

> **Habilita T5.2** (flip `shipped:true` + retirada del dev-gate). Recomendación
> menor no bloqueante: alinear el `help` de `fos_ec7_da3` para que no prometa la
> evaluación γ_cu=1,40 sin drenaje hasta que se implemente (Phase 3), o añadir esa
> segunda corrida DA3 cuando exista `su>0`.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 13 findings, 4 to decision, 6 absorbed, 1 verified |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 5 issues, 0 critical gaps; phased scope |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score 6→9/10, 4 decisions; calibrated to DESIGN.md |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CODEX:** eng-review outside voice surfaced 4 direction-changing tensions (FoS/γ equivalence reversed, fake cancellation, Phase-1 persistence, product boundary) — all resolved.
- **CROSS-MODEL:** Codex sharpened 5 eng decisions rather than contradicting the architecture; strongest correction was reversing the FoS/γ shortcut to per-check re-run.
- **VERDICT:** ENG + DESIGN CLEARED — ready to implement Phase 0 spike.

NO UNRESOLVED DECISIONS
