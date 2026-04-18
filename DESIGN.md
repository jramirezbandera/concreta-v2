# Concreta — Design System

Updated by /design-consultation on 2026-03-28 (v2.0)
Status: APPROVED

---

## Design Thesis

**"Mesa de trabajo del ingeniero"** — instrumento de precisión técnica, no dashboard SaaS.

Toda la competencia (SkyCiv, ClearCalcs, CYPE, Viktor) imita el SaaS genérico de fondo claro para parecer "moderna". El resultado: todas son indistinguibles. Concreta va en la dirección opuesta: dark, precisa, densa, técnica.

El dark theme no es una elección estética — **es una declaración de propósito**. El único software de cálculo estructural que parece hecho para ingenieros, no para marketers.

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

Definida como tokens CSS directos en `src/index.css` (Tailwind v4 `@theme inline`):

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
| `state-ok` | `#22c55e` | η < 80% |
| `state-warn` | `#f59e0b` | 80% ≤ η < 100% |
| `state-fail` | `#ef4444` | η ≥ 100% |
| `state-neutral` | `#64748b` | Sin datos / estado inicial |

### Reglas de color

- `accent` tiene **rol dual**: elementos UI interactivos (focus, nav activo) + anotaciones SVG (eje neutro, bloque de compresión, cotas). Ambos roles representan "estado calculado vivo" — es intencional.
- Sin gradientes decorativos en backgrounds de página. Excepción: gradientes funcionales de estado (ver "Ambient verdict" abajo).
- Los colores de estado son EXCLUSIVOS para tasas de utilización. No reutilizar como decoración UI.
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
