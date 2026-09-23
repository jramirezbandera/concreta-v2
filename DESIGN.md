# Concreta — Design System

Updated by /design-consultation on 2026-03-28 (v2.0)
Status: APPROVED

---

## Design Thesis

**"Mesa de trabajo del ingeniero"** — instrumento de precisión técnica, no dashboard SaaS.

La diferenciación de Concreta no es el color del fondo — es la **densidad, la precisión y el SVG vivo como protagonista**. La competencia (SkyCiv, ClearCalcs, CYPE, Viktor) parece SaaS genérico no por ser clara, sino por ser blanda: tarjetas decorativas, espacio muerto, chrome de marketing. Concreta es lo contrario en cualquier tema: densa, técnica, sin adorno.

Concreta soporta **tema claro y oscuro**. El claro es el **por defecto** (consciente del sistema operativo en la primera visita): los ingenieros trabajan en oficinas iluminadas, junto a AutoCAD/CYPE que también son claros, y los testers lo pidieron explícitamente. El oscuro es la **firma** de la casa — para trabajo enfocado o con poca luz, y la identidad con la que nació el producto. Ambos temas deben sentirse igual de intencionales: lo que no negociamos es la densidad ni la legibilidad del cálculo, no el color de fondo. *(Revisión de identidad: design review 2026-06-09 — antes el oscuro era "declaración de propósito" y único tema; reencuadrado al añadir el modo claro por defecto.)*

**El SVG es el protagonista. Todo lo demás es chrome.**

---

## Tipografía

### Font stack

```css
--font-sans: "Geist Sans", system-ui, sans-serif;
--font-mono: "Geist Mono", ui-monospace, monospace;
```

- **Geist Sans** (Vercel): todos los labels, títulos UI, texto de navegación, botones
- **Geist Mono**: TODOS los valores numéricos — resultados, valores calculados, valores de input, unidades, references CE
- Archivos en `public/fonts/` (Regular 400, Medium 500, SemiBold 600 para Sans; Regular 400, Medium 500 para Mono)
- No Inter, Roboto, Arial ni system-ui como primario — Geist exclusivamente

### Escala de texto

| Clase | Tamaño | Uso |
|-------|--------|-----|
| `text-[10px]` | 10px | Section headers (CAPS, text-disabled), nav group labels |
| `text-[11px]` | 11px | Notas CE, valores en check rows, app version |
| `text-[12px]` | 12px | Valores en inputs (font-mono), nombres en check rows |
| `text-[13px]` | 13px | Etiquetas de campo, nav items, topbar module title |
| `text-[14px]` | 14px | Sidebar logo, module title |
| `text-[15px]` | 15px | Topbar brand "Concreta" |

### Reglas de tipografía

- **Valores numéricos** (resultados, η%, Md/MRd, unidades): siempre `font-mono` con `tabular-nums`
- **Etiquetas** (nombres de campo, descripciones de checks): Geist Sans
- **Section headers**: `10px UPPERCASE tracking-[0.07–0.1em] font-semibold text-text-disabled` + `border-b border-border-sub`
- **Referencias CE**: `text-[11px] font-mono text-text-disabled`
- Sin headers decorativos. Sin mezcla de pesos en la misma fila.

---

## Paleta de color

Definida como tokens CSS en `src/index.css` (Tailwind v4 `@theme`, **sin `inline`**
para que las utilidades emitan `var(--color-*)` y conmuten por tema). Valores claros
en `:root` (por defecto), valores oscuros bajo `html[data-theme="dark"]`. Las tablas
de abajo listan los valores **oscuros** (la firma); la columna "Claro" da el valor del
tema por defecto.

### Superficies

| Token | Hex | Uso |
|-------|-----|-----|
| `bg-primary` | `#0b1220` | Fondo de página, inputs, área canvas SVG |
| `bg-surface` | `#111a2d` | Paneles (sidebar, inputs, results), topbar |
| `bg-elevated` | `#1a2540` | Sufijo de unidades, hover states |
| `bg-canvas` | `#0b1220` | Área central SVG (mismo valor, token independiente para futura evolución) |

### Bordes

| Token | Hex | Uso |
|-------|-----|-----|
| `border-main` | `#22304d` | Bordes principales (entre columnas, paneles, topbar) |
| `border-sub` | `#1a2540` | Divisores de fila dentro de paneles (más suave que border-main) |

### Texto

| Token | Hex | Uso |
|-------|-----|-----|
| `text-primary` | `#f8fafc` | Valores, títulos, texto de importancia alta |
| `text-secondary` | `#94a3b8` | Etiquetas de campo, sección headers, ítems de nav |
| `text-disabled` | `#475569` | Módulos no activos, section group labels, app version |

### Interactivo + estados

| Token | Hex | Trigger / uso |
|-------|-----|---------------|
| `accent` | `#38bdf8` | Focus ring, nav activo, anotaciones SVG (eje neutro, líneas de cota) |
| `accent-hover` | `#0ea5e9` | Hover sobre elementos accent |
| `state-ok` | `#22c55e` | η < 95% |
| `state-warn` | `#f59e0b` | 95% ≤ η < 100% · **avisos advisory** (ver abajo) |
| `state-fail` | `#ef4444` | η ≥ 100% |
| `state-neutral` | `#64748b` | Sin datos / estado inicial |

### Tema claro (por defecto) — valores

Valores contrastados para fondo blanco (texto ≥ AA). Definidos en `:root`; el oscuro
los sobrescribe bajo `html[data-theme="dark"]`.

| Token | Claro | Notas |
|-------|-------|-------|
| `bg-primary` | `#ffffff` | página, inputs, canvas |
| `bg-surface` | `#f8fafc` | paneles, results |
| `bg-elevated` | `#f1f5f9` | hover, sufijos |
| `border-main` | `#cbd5e1` | bordes principales |
| `border-sub` | `#e2e8f0` | divisores de fila |
| `text-primary` | `#0f172a` | valores, títulos |
| `text-secondary` | `#475569` | etiquetas, nav |
| `text-disabled` | `#94a3b8` | inactivos |
| `accent` / `-hover` | `#0369a1` / `#075985` | sky-700/800 — AA en las tres superficies (5,93 / 5,67 / 5,42:1); mantiene el **rol dual** (UI + anotación SVG) en un solo token. *Antes sky-600 `#0284c7`, que esta tabla daba por «AA en blanco» y no lo era: 4,10:1. El acento también escribe los valores derivados (qd, cotas, `tabla C.5`) a 8,5–11,5 px, así que es texto y le toca 4,5:1 — corregido en el design review 2026-09-21.* |
| `state-ok` | `#15803d` | green-700 para texto/veredicto; green-600 en rellenos grandes |
| `state-warn` | `#b45309` | amber-700 |
| `state-fail` | `#dc2626` | red-600 |
| `state-neutral` | `#64748b` | igual en ambos (pasa AA en los dos) |
| dot-grid | `#e2e8f0` | slate-200 (vs `#253147` oscuro) |
| envelope FEM | violet-600/700 | el `#a78bfa` oscuro se oscurece en claro |

**`color-scheme: light`** se declara en `:root` (y `dark` bajo `[data-theme="dark"]`)
para que inputs numéricos, `<select>` y scrollbars nativos usen el chrome correcto.
**Bandas de veredicto ambient**: en claro, borde `2px` del color de estado + tinte
suave `~8%` sobre blanco (no el gradiente de superficie oscura). **PDF no cambia**:
sigue en escala de grises (ver §PDF), desacoplado del tema de UI.

### Reglas de color

- `accent` tiene **rol dual**: elementos UI interactivos (focus, nav activo) + anotaciones SVG (eje neutro, bloque de compresión, cotas). Ambos roles representan "estado calculado vivo" — es intencional.
- Sin gradientes decorativos en backgrounds de página. Excepción: gradientes funcionales de estado (ver "Ambient verdict" abajo).
- Los colores de estado son para **comunicar estado al usuario**, nunca decoración UI. Dos usos válidos:
  1. **Tasas de utilización** (η): verde/ámbar/rojo según el rango.
  2. **Avisos advisory** (`state-warn` ámbar, prefijo `⚠`): salvedades del cálculo que el proyectista DEBE revisar pero que no son una tasa de utilización — p.ej. hipótesis "fuera de tabla", dato correlacionado, terreno inestable (módulo Micropilotes, pandeo Guía 3.6.1). El resto de notas informativas van en `text-secondary`, no en color de estado. Extensión introducida en design review 2026-06-02.
- Sin violetas, sin azul-a-violeta, sin gradients decorativos en backgrounds.

---

## Canvas SVG — Dot-grid

El área central del SVG usa un fondo de puntos que evoca el papel milimetrado de la mesa de trabajo del ingeniero. **Ningún competidor tiene esto.**

```css
/* src/index.css */
.canvas-dot-grid {
  background-image: radial-gradient(circle, #253147 1px, transparent 1px);
  background-size: 24px 24px;
}
```

Aplicar clase `canvas-dot-grid` al wrapper del SVG en cada módulo. NO aplicar en modo PDF.

---

## Espaciado

Base unit: **8px**

| Tailwind | Valor | Uso |
|----------|-------|-----|
| `gap-1` / `gap-2` | 4–8px | Gap dot+label, gap entre elementos inline |
| `px-3.5 py-3.5` | 14px | Padding columna inputs |
| `px-4` | 16px | Padding panel resultados |
| `p-6` | 24px | Padding canvas SVG |
| `pt-2.25 pb-1.75` | ~9–7px | Section header vertical padding |

Altura topbar: 48px (`h-12`).
Ancho sidebar: 190px.
Ancho columna inputs: 240px.
Ancho columna resultados: 280px (`w-70`).

---

## Border Radius

Tres niveles — jerarquía intencional:

| Contexto | Radius | Uso |
|----------|--------|-----|
| `rounded-none` | 0px | Canvas SVG (el cálculo ES el contenido, sin redondeo) |
| `rounded` | 4px | Inputs, inputs de unidades, check tags, badges, botones |
| `rounded-md` | 6px | Mockup wrapper, preview pages |

Nunca usar `rounded-lg`, `rounded-xl` ni `rounded-full` en la app.

---

## Motion

**Solo CSS transitions. Sin librería de animación.**

```css
transition: all 150ms ease-in-out;
/* O específicamente: */
transition: border-color 150ms ease-in-out;
transition: color 150ms ease-in-out;
```

Usado para:
- Hover (botones, nav links, focus en inputs)
- Cambios de color de estado (CUMPLE → INCUMPLE)
- Toast enter/exit

Nunca animar: layout shifts, contenido SVG (actualizaciones instantáneas — el debounce ya provee suavidad perceptual), transiciones de página.

---

## Vocabulario de componentes

### Sidebar

```
· Concreta          ← dot accent + texto text-primary 15px font-semibold
──────────────────
HORMIGÓN            ← nav group label: 10px CAPS text-disabled px-[14px]
• Vigas             ← nav item activo: 13px text-accent bg-accent/5
• Pilares           ← nav item inactivo: 13px text-secondary
ACERO
• Vigas             ← nav item deshabilitado: 13px text-disabled
v0.1.0              ← app version: 11px font-mono text-disabled
```

- Fondo sidebar: `bg-surface border-r border-border-main`
- Indicador activo: punto de color + `bg-accent/5` (sin border-left)
- Iconos SVG por módulo: 14x14, stroke-only, diferenciados por material (grano curvo para madera, puntos rebar para RC, paths I-section para acero)
- Todos los items tienen `border-b border-border-sub`

### Input field (inline row)

```
Ancho b ........... [300][mm]
Canto h ........... [500][mm]
fck ............... [ 25][MPa]
```

- Layout: `flex justify-between` — label izquierda, input+unit derecha
- Input: `w-15 bg-bg-primary border border-border-main rounded-l text-right font-mono text-[12px]`
- Focus: `border-accent`
- Unidad: `bg-bg-elevated border border-l-0 border-border-main rounded-r text-[10px] font-mono text-text-disabled`

### Section header (dentro de paneles inputs, colapsable)

Los section headers del panel de inputs son interactivos: `<button>` con chevron SVG que rota al colapsar/expandir la sección. Componente compartido: `src/components/ui/CollapsibleSection.tsx`.

```
▼ GEOMETRÍA                     ← chevron + label, clicable
─────────────────────────────    ← border-b border-sub
  [contenido colapsable]

► MATERIALES                    ← colapsado: chevron apunta derecha
─────────────────────────────
```

```css
/* Button wrapper */
text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled
pt-2.25 pb-1.75 border-b border-border-sub mb-2.5 mt-3 first:mt-0 cursor-pointer

/* Chevron */
10x10 SVG, stroke currentColor, strokeWidth 1.5
transition-transform duration-150
open: rotate(0deg), closed: rotate(-90deg)
```

Todas las secciones abren por defecto (`defaultOpen = true`). El contenido se monta/desmonta (no oculto con CSS) para evitar layout shifts.

#### GroupHeader con description (opcional — módulos complejos)

Para grupos que requieren contexto normativo, se puede añadir un subtítulo descriptivo:

```
CORDONES — EC3 §6.4.2
Axil máximo en el angular más comprimido: N_chord = N_Ed/4 + |Mx|/(2·hy) + |My|/(2·hx).
─────────────────────────────
```

```css
/* Subtítulo */
text-[10px] text-text-disabled mt-0.5 leading-tight
```

Uso: solo en módulos con muchos grupos de resultados donde la fórmula o la referencia normativa no es obvia. No usar en módulos sencillos.

### NumberField con helpText (opcional — inputs no obvios)

Para inputs cuya definición no es obvia (coeficientes normativos, mínimos normativos):

```
Coef. pandeo eje X (beta_x)
┌─────────────────────────────┐
│  0.5                        │
└─────────────────────────────┘
Condición de contorno del pilar en el marco estructural.
Las pletinas soldadas tienen lk = 0.5·s fijo (biempotradas).
· Empotrado-empotrado: 0.5
```

```css
/* helpText */
text-[10px] text-text-disabled leading-tight whitespace-pre-line
```

- Aparece solo cuando no hay error activo (`{helpText && !error && ...}`)
- Soporta saltos de línea vía `\n` en la cadena (gracias a `whitespace-pre-line`)
- No usar para inputs con nombres autoexplicativos (b, h, fck, etc.)

### HelpTooltip — ayuda contextual por campo (icono ⓘ)

Para el "qué es esto" breve de CUALQUIER campo de entrada. Un icono ⓘ junto al
label que, al hover o foco, muestra una explicación en un portal a `body` (no se
recorta en paneles con scroll). Componente compartido: `src/components/ui/HelpTooltip.tsx`.

```
Ancho b ⓘ ........... [300][mm]
        └ hover/focus
   ┌──────────────────────┐
   │ Ancho de la sección.  │
   │ EC3 §6.2.5            │ ← ref (2ª línea, mono dim)
   └──────────────────────┘
```

```css
/* Icono */
lucide Info, size 13, strokeWidth 1.75, stroke-only (NUNCA en círculo de color)
text-text-secondary → hover/focus text-accent
<button> con padding p-1 -m-1 → hit area ≥24px (glyph 13px)

/* Tooltip (portal, position:fixed) */
bg-bg-surface border border-border-main rounded   /* 4px — SIN sombra */
px-2.5 py-1.5 text-[12px] leading-snug text-text-primary  max-w 260px
```

- **Elevación sin sombra**: el sistema no usa sombras; el tooltip se separa del
  panel por superficie (`bg-surface`) + borde, como el resto de la app.
- **Posicionado**: medir-luego-posicionar (`useLayoutEffect`), flip arriba/abajo +
  clamp horizontal al viewport. Cierra con Escape, scroll (capture) y resize.
- **A11y**: `aria-label="Ayuda: {campo}"`, `aria-describedby` atado solo mientras
  está abierto. Solo hover/foco — el tap táctil es mejora posterior (TODOS.md).
- **Contenido**: `LABELS[labelKey].help` (default del catálogo) + `ref` como 2ª
  línea; el call site puede sobreescribir `help` (ayuda dinámica, p. ej. Lcr por
  tipo de viga). Resuelto vía `InputLabel` (único primitivo catalog-aware).

**Tooltip vs helpText inline — cuándo cada uno:**
- **HelpTooltip (ⓘ)**: ayuda breve "qué es esto" para cualquier campo. Mantiene la
  densidad (solo un icono). Es el mecanismo por defecto.
- **NumberField helpText (inline)**: explicación normativa multilínea PERSISTENTE
  que el proyectista debe ver sin interactuar (coeficientes no obvios: beta_x, Vd).

### Ambient verdict (panel resultados)

El panel de resultados usa un gradiente funcional de estado en lugar de un borde grueso. El gradiente comunica el veredicto de forma ambiental, sin competir con el contenido.

```css
/* ambientStyle() en src/components/checks/index.tsx */
background: linear-gradient(180deg, rgba(estado, 0.08) 0%, transparent 80px);
border-top: 2px solid <color-estado>;
```

- `state-ok` (#22c55e): gradiente verde suave, borde verde sólido
- `state-warn` (#f59e0b): gradiente ámbar suave, borde ámbar sólido
- `state-fail` (#ef4444): gradiente rojo suave, borde rojo sólido

Esto NO es un gradiente decorativo. Es un indicador de estado funcional. No reutilizar para otros fines.

### Topbar — breadcrumb

El topbar muestra la ubicación del módulo como breadcrumb:

```
HORMIGÓN / Vigas                ← group (11px mono CAPS disabled) + separator + module (13px medium primary)
```

Fondo topbar: `bg-bg-surface` (unifica visualmente con sidebar). Altura: 48px.

### Check row (4 columnas)

```
[Nombre check] [valor mono] [====░░] [74%]
```

- Grid: `grid-template-columns: 1fr auto 40px auto`
- Nombre: `text-[12px] text-text-secondary`
- Valor: `font-mono text-[11px] text-text-primary tabular-nums`
- Barra: `h-0.75 bg-border-main` con fill `bg-state-*`
- Tag: `font-mono text-[10px] font-semibold px-1.25 py-0.5 rounded` + color semántico

### Verdict badge (inline en header)

```
● CUMPLE    ← inline en el header del panel de resultados, NO chip full-width
```

```css
inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold
px-1.25 py-0.5 rounded tracking-[0.02em]
```

Estados: `bg-state-ok/10 text-state-ok` / `bg-state-warn/10 text-state-warn` / `bg-state-fail/10 text-state-fail`

### Value row (panel resultados)

```
d (canto útil)          461 mm
As (armadura)           942 mm²
```

- `flex justify-between px-4 py-1.75 border-b border-border-sub`
- Label: `text-[12px] text-text-secondary`
- Valor: `text-[11px] font-mono text-text-primary tabular-nums`

### Toast

- Posición: bottom-right, 16px desde borde
- Ancho: 320px
- Fondo: `bg-surface border border-border-main rounded-md`
- Padding: 12px 16px
- Texto: `text-sm text-text-primary`
- Auto-dismiss después de `autoDismiss` ms
- Max 3 visibles, apilados con 8px de gap

---

## Reglas SVG

### Modo screen (`mode='screen'`)

- Usar clases Tailwind CSS para colores
- Accent (`#38bdf8`) para anotaciones: eje neutro, bloque de compresión, líneas de cota
- Armaduras: `fill-none stroke-text-primary` (contorno blanco)
- Contorno de sección: `stroke-border-main`
- Estribos: `stroke-text-disabled` (más suave)

### Modo PDF (`mode='pdf'`)

- **Solo estilos inline** — sin Tailwind (no renderizan en jsPDF)
- Dimensiones fijas en px (sin % ni viewport units)
- Solo escala de grises: `#000000`, `#333333`, `#666666`
- Sin CSS transforms
- Sin `<foreignObject>`
- Todos los `<text>`: atributos explícitos `x` e `y`

### Estrategia PDF

- Elemento oculto: `<RCBeamsSVG mode="pdf" aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }} />`
- El export PDF lee el SVG oculto via `useRef` — sin flicker, sin swap de estado

---

## Export PDF — Diseño

Formato: A4 portrait, texto negro sobre fondo blanco

Secciones (de arriba a abajo):
1. **Cabecera**: "concreta" Geist Sans SemiBold + fecha (DD/MM/YYYY) + nombre de módulo
2. **Bloque normativa**: "Código Estructural (CE) art. XX, XX, XX" en monospace pequeño
3. **Bloque inputs**: todos los campos con etiquetas y unidades (tabla)
4. **Sección SVG**: escala de grises, capturada del componente `mode='pdf'`
5. **Tabla de verificaciones**: todas las filas, mismo orden que UI, indicadores como texto (✓ / ⚠ / ✗)
6. **Bloque resultados clave**: valores prominentes específicos del módulo
7. **Pie**: "γc = 1.5  γs = 1.15  γM0 = 1.05" + número de página

---

## Lo que NO pertenece a este diseño

Explícitamente prohibido:

- Gradientes decorativos en fondos de página
- Círculos de color detrás de iconos (navegación o features)
- `rounded-lg` o border-radius mayor
- Esquemas de color violeta, morado, o azul-a-morado
- Librería de animación (Framer Motion / motion) — solo CSS
- Layouts centrados en todo
- Cards como decoración (cards solo cuando la card ES la interacción)
- Font stacks por defecto (Inter, Roboto, Arial, system-ui como primario)
- El chip de veredicto full-width — usar badge inline en el header del panel

---

## Decisiones

| Fecha | Decisión | Rationale |
|-------|----------|-----------|
| 2026-03-27 | Sistema de diseño inicial | /design-consultation + /plan-design-review |
| 2026-03-28 | Inputs inline row (label/input/unit en fila) | Densidad, coherencia con design-preview.html |
| 2026-03-28 | Check rows 4 columnas | Más información por pixel, legibilidad de η% |
| 2026-03-28 | Verdict badge inline en header | El chip full-width era redundante y ocupaba espacio |
| 2026-03-28 | Sidebar: dot logo + dot nav, sin iconos SVG | Design-preview.html — más limpio, menos ruido visual |
| 2026-03-28 | Tokens hexadecimales directos (sin var(--color-slate-*)) | Independencia de la escala Tailwind, valores exactos del design system |
| 2026-03-28 | border-sub: #253147 (no #1e293b) | #1e293b = bg-surface → divisores invisibles; #253147 es levemente visible |
| 2026-03-28 | Canvas dot-grid (.canvas-dot-grid) | "Mesa de trabajo del ingeniero" — diferenciador único frente a competencia |
| 2026-03-28 | bg-elevated: #263348 para sufijos de unidad | Contraste visual entre input y unidad sin usar un color disruptivo |
| 2026-04-06 | Cercos punzonamiento: stroke-text-disabled (#475569), no accent | Distingue cercos de u1 y anotaciones de cota; sigue regla "Estribos: text-disabled" |
| 2026-04-06 | ρl inline en panel inputs (punzonamiento) | Cierra el feedback loop al punto de entrada — el usuario ve el efecto sin ir a resultados |
| 2026-04-09 | GroupHeader description (subtítulo opcional) | Módulos complejos (empresillado) necesitan contexto normativo bajo el título de grupo — patrón opcional, no obligatorio |
| 2026-04-09 | NumberField helpText (texto de ayuda opcional) | Inputs no obvios (beta_x, Vd) necesitan explicación inline sin tooltip — whitespace-pre-line para saltos de línea |
| 2026-04-18 | Ambient verdict (gradiente funcional de estado) | Reemplaza border-2 con gradiente ambiental — feedback visual inmediato sin competir con contenido |
| 2026-04-18 | Collapsible input sections (chevron toggle) | Secciones de inputs colapsables — power users configuran su workspace, reduce scroll |
| 2026-04-18 | Topbar breadcrumb (GROUP / Module) | Mejor contexto de navegación que el formato plano anterior |
| 2026-04-18 | Sidebar icons 16x16 stroke-only | Iconos más pequeños y limpios, diferenciados por material (grano madera, rebar RC, I-section acero) |
| 2026-04-18 | Custom scrollbar (#22304d thumb) | Scrollbar coherente con dark theme, reemplaza scrollbar nativo |
| 2026-04-18 | Tokens de color más oscuros | bg-primary #0b1220, bg-surface #111a2d — mayor contraste y profundidad |
| 2026-05-04 | NumField acepta prop `scale` (display/storage decoupling) | Permite que el state guarde mm pero el usuario edite m/cm. Patrón nuevo en masonry-walls. Storage en mm preserva precisión y compatibilidad con motor de cálculo |
| 2026-05-04 | Hint "Caso de ejemplo" sobre input panel | Banda discreta accent/5 + label `font-mono uppercase` cuando el state coincide con default. Se oculta al primer cambio. Onboarding sin modal |
| 2026-05-25 | Welcome banner sobre lienzo (banda no-modal) | Cuando el state es blank canónico (1 planta, sin huecos ni puntuales) y el usuario no ha descartado, banda horizontal `absolute top-4 left-4 right-4` sobre el lienzo con `bg-bg-surface/95 border-accent/40 rounded` (NO `rounded-lg`), label `font-mono uppercase` accent, una línea de copy + 2 botones inline ("Ver ejemplo" / "Descartar"). Persiste el descarte en localStorage. En mobile, default tab='diagramas' cuando el banner procede para que el CTA sea visible al primer load. Patrón válido para invitar a una acción opcional sin interrumpir el flujo |
| 2026-05-04 | Banner de validación con bloque "Cómo arreglarlo" | Cuando los datos son inválidos, el motor devuelve `EdificioInvalid.fix?` con sugerencia concreta. Bloque accent/5 dentro del banner fail. Empatiza con usuario que no domina la norma |
| 2026-05-04 | Warning glyph: SVG Lucide AlertTriangle (no emoji) | Coherente con la regla anti-emoji. Pattern: SVG 12x12 stroke-current dentro de bloque state-warn/5. Usado en huecos solapados |
| 2026-06-09 | **Modo claro + claro por defecto** (OS-aware) | Testers lo pidieron como predeterminado. Tokens conmutables (`@theme` sin `inline`, `:root` claro + `html[data-theme="dark"]`). Toggle sol/luna 2-estados en topbar (espeja UnitSystemToggle). `color-scheme` por tema. PDF intacto (grises). Reencuadre del Design Thesis: la diferenciación es densidad/precisión/SVG, no el fondo oscuro; el oscuro pasa de "único tema / declaración de propósito" a "firma" opcional |
| 2026-06-19 | **HelpTooltip (ⓘ) + reencuadre de la regla de ayuda** | Ayuda contextual por campo vía icono ⓘ (hover/foco, portal sin recorte, sin sombra). Reencuadra la decisión 2026-04-09: el tooltip es para ayuda BREVE "qué es esto" de cualquier campo (mantiene densidad); el `helpText` inline se reserva a explicación normativa multilínea persistente (beta_x, Vd) — ya NO es "sin tooltip", coexisten por tipo de ayuda. Contenido en `LABELS.help` (default) con override por call site. Eng+design review 2026-06-19 |
| 2026-07-17 | **Asistente IA en la topbar + botón primario sólido + menú "Ajustes"** | El disparador del asistente pasa de la columna de inputs de cada módulo (`AiButton` en `Topbar`, prop `onOpenAssistant` per-módulo — NO un provider global). Es el botón MÁS DESTACADO de la barra pero en el lenguaje de controles de la propia app (NO un sólido de SaaS, que chirriaba con la tesis "instrumento, no dashboard"): **outline fuerte** = tinte accent 12% + borde accent 45% + texto accent + Sparkles. Jerarquía por intensidad de accent: `AiButton` (outline fuerte) > `Exportar PDF` (outline sutil ~6%/25%, se conserva) > resto (fantasma). Nuevo menú "Ajustes" (engranaje) recoge **Unidades + Tema + Copiar enlace** (la barra queda solo con acciones primarias). Atajo `A` (espeja `C` de la calculadora) en `AiButton`. Design+eng review 2026-07-17 |
| 2026-09-05 | **Desplegable «Exportar» único en el cuadro de materiales** | Sustituye al par de botones que cambiaba de rótulo con la pestaña (Word+PDF en Datos y Memoria, Excel+DXF en Plano): para bajar el Excel había que ir a Plano, y en Datos no se sabía qué se bajaba hasta pulsar. Un solo disparador con el outline sutil de «Exportar PDF» + chevron (misma acción, un paso más), igual en las tres pestañas, que despliega las cuatro salidas agrupadas por el cuadro que entregan; cada opción lleva el formato y su destino en lenguaje de obra («Word — para pegar en la memoria del proyecto»). `ExportarMenu` en `layout/`, hermano de `AjustesMenu`; la topbar lo recibe por el slot `exportMenu` y pierde `onExportSecondary`. Al elegir, el foco vuelve al disparador antes de abrir el modal del título (que lo devuelve al cerrar). Decisión del usuario 2026-09-05 |
| 2026-09-22 | **«Menú» único en la topbar — REVOCA la decisión de 2026-07-17** | La barra pasa de cuatro controles a dos: `Menú` + `Exportar`. El **Asistente IA** y la **Calculadora** dejan de tener botón propio y entran en el desplegable, que deja de llamarse «Ajustes» (su icono pasa de `SlidersHorizontal` a `MoreHorizontal`: por debajo de `lg` iba sin rótulo y unos deslizadores prometían preferencias cuando detrás están las dos acciones principales; el rótulo ahora aparece desde `sm`). **Queda revocada la jerarquía de 2026-07-17**: `AiButton` ya no existe y `Exportar` **NO** hereda el outline fuerte — conserva el sutil. Nadie es la acción primaria de la barra: el único acento fuerte de la pantalla se muda con el asistente a su **píldora** de abajo a la derecha, que pasa de sub-estado raro (estaba a TRES gestos: abrir → reducir a esquina → minimizar) a ser la casa del asistente en escritorio, siempre visible desde 768 px, con tabla de estados propia (reposo / conversación viva / cargando / propuesta pendiente / error / sin clave) y apagable desde Preferencias. El Menú tiene **una sola forma en las 29 pantallas**: tres grupos rotulados (Herramientas · Preferencias · Estudio y compartir), las filas que no aplican salen **apagadas con la razón** en vez de esconderse (antes «Unidades» desaparecía y el menú tenía cuatro formas, así que «la tercera de la lista» dejaba de ser un sitio), los atajos `A` y `C` siguen a la vista en su fila, las de Herramientas miden 44 px y el resto 44 px por debajo de `lg` / 36 px en escritorio. **Deja de anunciarse `role="menu"`**: prometía navegación por flechas y dentro hay dos conmutadores y un enlace, que no son `menuitem`; un panel con botones es accesible de serie y no miente. El Menú devuelve el foco a su disparador **antes** de abrir una herramienta (mismo patrón que `ExportarMenu`, 2026-09-05). La hamburguesa del Sidebar pasa a `aria-label="Abrir navegación"`: eran dos controles de la misma barra anunciados igual. Revisión de diseño 2026-09-22 (`/plan-design-review`, 21 decisiones; plan en `~/.gstack/projects/jramirezbandera-concreta-v2/`) |
| 2026-09-23 | **El suelo de la esquina: lo permanente manda sobre lo efímero** | Con la píldora del asistente puesta para siempre, los avisos (`Toast.tsx`) dejan de poder vivir en `bottom-4 right-4`: compartían sitio y plano (`z-50`) con ella, y el choque pasó de improbable a seguro. Regla: **quien ocupe fijo la esquina de abajo a la derecha publica cuánto ocupa en `--suelo-esquina`** sobre `document.documentElement`, y lo efímero se apoya encima con `bottom: var(--suelo-esquina, 1rem)`. Hoy el único escritor es la píldora (16 de margen + 38 de alto + 8 de aire = 62 px) y el único lector el contenedor de avisos, que es uno solo para los 128 puntos de llamada. Va por variable CSS y no por contexto de React a propósito: el contenedor de avisos cuelga de `App.tsx`, por encima del router, para cubrir también la landing, mientras que el asistente vive dentro del shell — no hay contexto común que compartir, y dónde acaba algo fijo es un hecho de maquetación, no estado de la aplicación. Por debajo de 768 px no hay píldora, la variable no se escribe y los avisos se quedan donde siempre. T8 / D-I12 de la revisión de diseño 2026-09-22 |
| 2026-09-23 | **La barra en móvil: arriba lo que se pulsa, abajo lo que se lee — y al truncar cede la obra** | Por debajo de `sm` la topbar va en DOS filas y **una sola no cabe**: medido a 375 px quedan 335 px útiles, de los que la hamburguesa se lleva 42, los desplegables 110 y los huecos más la barra «/» otros 34 — al título le quedan **75**, y el más largo de los 27 módulos, «Cumplimiento del DB SE», pide **148** («Acción sísmica» pide 91: tampoco cabe). En una fila sale «EDIFICIO 12 V… / Cum…», las dos cosas cortadas a la vez. El reparto es: **arriba lo que se pulsa** (hamburguesa + obra + los dos desplegables), **abajo lo que se lee** (el título del módulo, solo, con los 335 px para él). La fila de arriba llevaba antes sólo los desplegables, con la mitad izquierda vacía, mientras abajo se apretaban hamburguesa, obra y título. **Regla de truncado: cede la obra, nunca el título** — revoca el criterio contrario que había (`shrink-0` en la obra), que hacía que el título cupiera sólo con el marcador «Sin obra» (74 px) y se cortara a 99 con una obra real de 21 caracteres. En qué obra estás lo contesta también el cajón; en qué pantalla estás sólo lo contesta la miga. La obra va con `flex-1 min-w-0` y no con un ancho máximo a ojo, porque el reparto por líneas se decide con el tamaño base y sólo después se encoge: con su ancho natural un nombre largo empuja los desplegables a una tercera fila. La barra baja de 81 a 73 px. A partir de `sm` nada cambia: una fila de 48 px, con orden explícito (`sm:order-3` la miga, `sm:order-4` los desplegables) porque al resetear el orden mandaría el del DOM. T7 / D-I17 de la revisión de diseño 2026-09-22 |
| 2026-09-23 | **La píldora se puede apagar — y «esquina» pasa a significar una sola cosa** | Fila nueva en **Preferencias** del Menú, con Unidades y Tema, que es su familia: «Asistente en la esquina» con `ToggleChip` («Visible» / «Oculta» — adjetivos del estado actual, nunca imperativos). **Encendida por defecto**; la clave `concreta-ai-esquina` sólo se escribe para apagarla, y es preferencia de máquina, no dato de obra. Apagarla **no esconde el asistente**: su fila de Herramientas no se apaga nunca y la tecla `A` sigue funcionando, porque ese listener cuelga de que haya asistente en la pantalla y no de la píldora. Quien no usa la IA deja de cargar con un flotante fijo en 25 pantallas, y quien no tiene clave BYOK también: el estado «sin clave» de la píldora se mantiene (pulsarla lleva a `ByokSettings`), y quien no quiera verlo la apaga. Por debajo de 768 px no hay esquina que encender, así que la fila sale **apagada con la razón**, no se esconde (regla de la forma única del Menú). **Y se deshace una colisión de nombres anterior**: en modo panel convivían «Reducir a esquina» (cambia la forma de la ventana) y «Bajar a la esquina» (guarda la conversación en la píldora), dos botones pegados diciendo lo mismo para cosas distintas. **«Esquina» se reserva a la píldora**, que es la que vive fija en una, y el modo pasa a **«Reducir a ventana»**: la pareja de modos queda «Expandir a panel» / «Reducir a ventana». Mismo criterio que con la hamburguesa el 2026-09-22 (dos controles de la misma barra no se anuncian igual). Corolario en el chat: el botón de salir ramifica por «hay esquina» y no por el ancho — con la píldora apagada sale la ✕ «Esconder el asistente», porque ofrecer «bajar a la esquina» prometería un sitio que no existe. T9 / D-I9 de la revisión de diseño 2026-09-22 |
