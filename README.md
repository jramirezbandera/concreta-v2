# Concreta

Herramienta web de cálculo estructural orientada al uso profesional diario.
Pensada para arquitectos, arquitectos técnicos, ingenieros de edificación e
ingenieros estructurales que necesitan resolver comprobaciones recurrentes de
forma rápida, visual y conforme a la **normativa española** (CE, CTE DB-SE,
CTE DB-SE-A, CTE DB-SE-C). No es un CYPE ni un SAP: es una herramienta de
mesa para cálculos del día a día.

## Filosofía

1. **Velocidad antes que complejidad** — resuelve bien los casos comunes.
2. **Claridad antes que densidad** — explica sin abrumar.
3. **Visual antes que textual** — diagramas, esquemas y SVG en vivo.
4. **Rigor sin opacidad** — cada comprobación cita el artículo normativo.
5. **Sin backend, sin cuentas** — funciona como PWA local; los enlaces son
   estado serializado en la URL para compartir cálculos.

## Módulos disponibles

### Hormigón armado
- **Vigas** — flexión, cortante, fisuración (ELS), armado mínimo/máximo.
- **Pilares** — flexocompresión, pandeo, cuantías geométricas.
- **Punzonamiento** — comprobación CE para placas/forjados sobre soporte.
- **Forjados** — comprobaciones por tipologías predefinidas.

### Acero estructural
- **Vigas** — flexión, cortante, interacción M-V, pandeo lateral (LTB),
  flecha (ELS), clasificación de sección, generador de cargas por categoría
  de uso (CTE Tabla 3.1).
- **Pilares** — pandeo por eje, capacidad a compresión, esbeltez. Soporta
  perfiles laminados (I/H), tubulares cuadrados/rectangulares y CHS.
- **Sección compuesta** — perfiles armados (I + chapas).
- **Placas de anclaje** — comprobación de placa, pernos embebidos y
  hormigón soporte (cono, splitting, edge breakout, pry-out).

### Cimentación
- **Zapatas aisladas** — tensiones de suelo, excentricidades, vuelco,
  deslizamiento, flexión por caras, punzonamiento, armado base.
- **Encepados** — encepados de pilotes (modelo bielas y tirantes).
- **Muros de contención** — empuje de tierras, vuelco, deslizamiento,
  capacidad portante, flexión, armado del fuste y la zapata.
- **Micropilotes** — Guía Fomento 2005 + EC3 §6.2. Catálogo PIRESA o tubo
  personalizado (Ø ext + espesor), perfil de estratos editable
  (granular/cohesivo), nivel freático, inyectado lechada/mortero. Cuatro
  vistas SVG (perfil del terreno, curva Rfc acumulada, sección del tope,
  semáforos). Comprobaciones: hundimiento por fuste (teórico y empírico),
  tope estructural a compresión y tracción, flexión-cortante con
  empotramiento ficticio, garganta de soldadura (Tabla A-5.1),
  recubrimiento mínimo dinámico (Tabla 2.3 según inyectado y esfuerzo),
  asiento estimado y separación entre pilotes (Tabla 3.10).

### Rehabilitación
- **Empresillado** — pilares compuestos batidos según EC3 §6.4.2.
- **Muros de fábrica** — verificación multi-planta de muros de carga de
  fábrica (CTE DB-SE-F), con huecos, cargas puntuales, plantas y machones.

### Madera
- **Vigas** y **pilares** — clases resistentes europeas, comprobaciones EC5
  con resistencia al fuego R30-R120.

### Análisis FEM 1D
Análisis matricial de vigas continuas con:
- Combinaciones multiprincipal CTE (ELU, ELS-c, ELS-frec, ELS-cp).
- Envolventes M, V, deformada por combinación.
- Reacciones por combinación con superposición lineal.
- Embed real de los módulos de Vigas HA y Vigas Acero — los inputs y
  resultados son los mismos que en el módulo standalone, sin reimplementar.

## Stack técnico

- **React 19** + **Vite 8** + **TypeScript 5.9**
- **Tailwind CSS v4** (variables CSS, sin runtime)
- **React Router 7**
- **jsPDF + svg2pdf.js** — exportación PDF en cliente con SVG vectorial.
- **lz-string** — compresión de estado para enlaces compartibles.
- **vite-plugin-pwa** — PWA estática, instalable, sin backend.
- **Vitest** + **Testing Library** — 1.729 tests verdes en 63 suites.

## Arquitectura

```
src/
├── features/             # Un módulo de cálculo por carpeta
│   ├── rc-beams/         # Vigas HA (UI + SVG + resultados)
│   ├── steel-beams/      # Vigas acero
│   ├── fem-analysis/     # FEM 1D + envolventes + adaptadores
│   └── ...
├── lib/
│   ├── calculations/     # Motor de cálculo puro (sin React)
│   ├── pdf/              # Exportación PDF
│   ├── sections/         # Geometría de secciones
│   ├── text/             # Etiquetas y referencias normativas
│   └── units/            # Sistema de unidades (SI ↔ kg/cm²)
├── data/                 # Tablas: perfiles, materiales, redondos, etc.
├── components/           # UI compartida (checks, layout, calculator, units)
└── test/                 # Tests Vitest organizados por módulo
```

**Separación clara entre UI y motor de cálculo.** Todo `lib/calculations/` son
funciones puras testeables en aislamiento. Los módulos de UI las consumen y
sólo se ocupan de inputs, SVG y resultados.

## Características transversales

- **Comprobaciones con artículo normativo visible** en cada fila — la pastilla
  de utilización (η%) y el estado (CUMPLE / ADVERTENCIA / INCUMPLE) acompañan
  al valor calculado y al límite normativo.
- **SVG en vivo** — secciones, perfiles, geometrías se redibujan en cada
  cambio de input.
- **Exportación PDF** vectorial con la misma representación que en pantalla.
- **Enlaces compartibles** — `Copiar enlace` serializa el estado completo
  del cálculo en la URL. Pegarlo en otro navegador reproduce el caso.
  Estados complejos (perfil de estratos en micropilotes, edificio
  multi-planta en muros de fábrica, modelo FEM 1D) se comprimen con
  lz-string para que las URLs queden bajo el límite seguro.
- **Persistencia local** por módulo en `localStorage` con versionado de
  esquema.
- **Calculadora global** (`Ctrl/Cmd+C` o icono en topbar) — modo numérico,
  unidades y fórmulas, con inserción inteligente al input enfocado.
- **Conmutador de unidades** (N/mm² ↔ kg/cm²) global, persistente.

## Desarrollo

```bash
# Instalar dependencias (Bun preferido; npm también funciona)
bun install

# Servidor de desarrollo (Vite + HMR)
bun run dev

# Suite de tests (vitest run)
bun run test:run

# Build de producción
bun run build

# Lint y formato
bun run lint
bun run format
```

## Diseño visual

Tema oscuro `slate-950` por defecto. Acento `sky-400` reservado a elementos
interactivos (foco, navegación activa). Estados semánticos:

- `state-ok` (verde) — utilización < 80 %
- `state-warn` (ámbar) — utilización 80-99 %
- `state-fail` (rojo) — utilización ≥ 100 %
- `state-neutral` (gris) — sin datos

Tipografía Geist Sans / Geist Mono. Iconografía técnica fina con
`lucide-react`. Variables CSS en [src/index.css](src/index.css).

## Licencia

**PolyForm Noncommercial 1.0.0** — ver [LICENSE](LICENSE).

Copyright © 2026 Javier Ramírez Bandera. Uso libre para fines personales,
académicos, organizaciones sin ánimo de lucro, instituciones públicas y
similares. **Cualquier uso comercial requiere licencia separada.** Contacta
con el autor para acuerdos comerciales.
