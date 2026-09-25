# Concreta

Herramienta web de cálculo estructural orientada al uso profesional diario.
Pensada para arquitectos, arquitectos técnicos, ingenieros de edificación e
ingenieros estructurales que necesitan resolver comprobaciones recurrentes de
forma rápida, visual y conforme a la **normativa española** (Código
Estructural, CTE DB SE, SE-AE, SE-A, SE-C, SE-F, SE-M y SI, NCSE-02). No es un
CYPE ni un SAP: es una herramienta de mesa para cálculos del día a día, que
además lleva la obra hasta lo que se entrega —la justificación del DB SE, el
anejo de cálculo y los cuadros del plano—.

## Filosofía

1. **Velocidad antes que complejidad** — resuelve bien los casos comunes.
2. **Claridad antes que densidad** — explica sin abrumar.
3. **Visual antes que textual** — diagramas, esquemas y SVG en vivo.
4. **Rigor sin opacidad** — cada comprobación cita el artículo normativo.
5. **Sin backend, sin cuentas** — funciona como PWA local; los enlaces son
   estado serializado en la URL para compartir cálculos.

## Módulos disponibles

26 módulos en nueve grupos, en el orden de la barra lateral.

### Memorias

- **Cuadro de materiales** — clase de exposición, recubrimiento, cemento y
  a/c derivados de la situación de obra (CE), madera (DB SE-M) y longitudes
  de anclaje. Memoria en Word y PDF, cuadro del plano en Excel y DXF.
- **Cumplimiento del DB SE** — la ficha 3.1 de la memoria, ensamblada desde
  materiales, viento y nieve, cargas por planta, sismo e incendio. Lee el PDF del
  informe geotécnico para el 3.1.3. Word y PDF.

### Acciones

- **Cargas por planta** — donde se declara el edificio (cubiertas, plantas y
  sótanos con su altura): peso propio, permanentes, sobrecarga de uso y nieve
  de lo que está a la intemperie, con Gd, Qd y qd (DB SE-AE).
- **Viento y nieve** — viento por planta, cubiertas a dos aguas (D.6) y
  fachadas (D.3); nieve por faldón a partir del municipio (DB SE-AE).
- **Acción sísmica** — método simplificado de la NCSE-02 con el Anejo 1 del
  IGN por municipio, y la vía del art. 3.6.2 para el edificio calculado por
  programa.
- **Incendio** — la R exigida por el DB SI 6, el tiempo equivalente del
  Anejo B, las secciones de hormigón y acero por los anejos C y D, y la
  protección orientativa donde no llegan.

### Hormigón armado

- **Vigas** — flexión, cortante, fisuración y flecha (ELS), anclaje, solape,
  armado mínimo/máximo. Cuadro de vigas del estudio en DXF.
- **Pilares** — flexocompresión, pandeo, cuantías geométricas.
- **Punzonamiento** — comprobación CE para placas/forjados sobre soporte,
  con crucetas de UPN.
- **Forjados** — reticular y losa maciza por tipologías predefinidas.

### Acero estructural

- **Vigas** — flexión, cortante, interacción M-V, pandeo lateral (LTB),
  flecha (ELS), clasificación de sección, generador de cargas por categoría
  de uso (CTE Tabla 3.1). IPE, HEA y HEB hasta el 1000, IPN, UPN, 2UPN y
  tubos.
- **Pilares** — pandeo por eje, capacidad a compresión, esbeltez. Soporta
  perfiles laminados (I/H), tubulares cuadrados/rectangulares y CHS.
- **Sección compuesta** — perfiles armados (I + chapas).
- **Placas de anclaje** — placa, barras embebidas y hormigón soporte (cono,
  splitting, edge breakout, pry-out), con cartelas en «#» y pilar 2UPN en
  cajón (CE Anejo 26 y EN 1992-4).

### Cimentación

- **Zapatas aisladas** — tensiones de suelo, excentricidades, vuelco,
  deslizamiento, flexión por caras, punzonamiento, armado base. Tres vistas:
  terreno, armado y modelo.
- **Muros de contención** — empuje de tierras con agua y sismo, vuelco,
  deslizamiento, capacidad portante, flexión, armado del fuste y la zapata.
  Plano tipo del estudio en DXF.
- **Encepados** — encepados de 2, 3, 4 y 6 micropilotes por bielas y
  tirantes, con el armado secundario dispuesto y los mínimos de la EHE-08.
  Detalle tipo del estudio en DXF.
- **Micropilotes** — Guía Fomento 2005 + EC3 §6.2. Catálogo PIRESA o tubo
  personalizado (Ø ext + espesor), perfil de estratos editable
  (granular/cohesivo), nivel freático, inyectado lechada/mortero. Cuatro
  vistas SVG (perfil del terreno, curva Rfc acumulada, sección del tope,
  semáforos). Comprobaciones: hundimiento por fuste (teórico y empírico),
  tope estructural a compresión y tracción, flexión-cortante con
  empotramiento ficticio, garganta de soldadura (Tabla A-5.1),
  recubrimiento mínimo dinámico (Tabla 2.3 según inyectado y esfuerzo),
  asiento estimado y separación entre pilotes (Tabla 3.10). Detalle tipo en
  DXF.

### Rehabilitación

- **Empresillado** — pilares compuestos batidos según CE Anejo 22 §6.4.
- **Muros de fábrica** — verificación multi-planta de muros de carga de
  fábrica (CTE DB-SE-F), con huecos, cargas puntuales, plantas y machones.

### Madera

- **Vigas** y **pilares** — clases resistentes europeas, comprobaciones EC5
  con resistencia al fuego R30-R120.

### Análisis

- **FEM 1D** — análisis matricial de vigas continuas con combinaciones
  multiprincipal CTE (ELU, ELS-c, ELS-frec, ELS-cp), envolventes M, V y
  deformada, y embed real de los módulos de Vigas HA y Vigas Acero.
- **FEM 2D** — pórticos y cerchas paramétricos: N/V/M, pandeo y αcr de
  segundo orden, con barras de acero, hormigón o madera.

### Geotecnia

- **Taludes** — factor de seguridad por Bishop simplificado o Fellenius
  (CTE DB-SE-C 7.2.2.1).
- **Muros de escollera y gaviones** — deslizamiento entre hiladas, vuelco,
  hundimiento y sismo (Guía de Fomento 2006).

## La obra y lo que se entrega

- **La obra** — cinco datos al crearla (denominación, municipio, provincia,
  altitud y uso) que heredan los módulos. Se guarda en un fichero
  `.concreta.json`; al abrirlo en otra máquina, la app rehace sola los PDF del
  anejo. Se puede duplicar.
- **La pantalla de la obra** (`/obra`) dice qué falta para entregar y lleva a
  donde se resuelve.
- **Anejo de cálculo** (`/proyecto/anejo`) — cada módulo guarda su PDF desde
  «Exportar»; el anejo sale en un solo PDF con portada, índice cotejado contra
  las páginas y numeración continua, y cada capítulo se reabre en su módulo.
- **Cuadros del plano** — los de materiales, viento y nieve, cargas por planta
  e incendio en un solo DXF y un solo Excel.
- **Mi estudio** (Ajustes) — el perfil del despacho, que no viaja con la obra.

## Stack técnico

- **React 19** + **Vite 8** + **TypeScript 5.9**
- **Tailwind CSS v4** (variables CSS, sin runtime)
- **React Router 7**
- **jsPDF** — exportación PDF en cliente, con la fuente embebida; los dibujos
  entran como PNG a 3× porque Acrobat rechaza lo que svg2pdf hace con los
  degradados.
- **pdf-lib** + **IndexedDB** — el anejo de cálculo: piezas guardadas en local
  y pegadas en un solo PDF.
- **docx** — memorias en Word (chunk perezoso). El Excel y el DXF se escriben
  a mano, sin dependencias.
- **pdfjs-dist** — lectura del PDF del informe geotécnico en el navegador.
- **Pyodide** — el motor de taludes (pyslope) en un Web Worker.
- **lz-string** — compresión de estado para enlaces compartibles.
- **vite-plugin-pwa** — PWA estática, instalable, sin backend.
- **Vitest** + **Testing Library** — 9.333 tests verdes en 370 ficheros (25-09-2026).

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
- **Exportación** a PDF con la misma representación que en pantalla, y a
  Word, Excel y DXF en los módulos de memoria, acciones y planos tipo.
  «Guardar en el anejo» es un destino más del desplegable «Exportar».
- **Asistente IA** en cada módulo de cálculo (píldora abajo a la derecha o
  tecla `A`): rellena, explica y propone cambios que el motor calcula. Con
  clave compartida de Gemini o con la tuya de Anthropic, OpenAI o Google.
- **Enlaces compartibles** — `Copiar enlace` serializa el estado completo
  del cálculo en la URL. Pegarlo en otro navegador reproduce el caso.
  Estados complejos (perfil de estratos en micropilotes, edificio
  multi-planta en muros de fábrica, modelo FEM 1D) se comprimen con
  lz-string para que las URLs queden bajo el límite seguro.
- **Persistencia local** por módulo en `localStorage` con versionado de
  esquema.
- **Calculadora global** (tecla `C` o menú Ajustes) — modo numérico,
  unidades y fórmulas, con inserción inteligente al input enfocado.
- **Conmutador de unidades** SI ↔ técnico (kN ↔ Tn, N/mm² ↔ kg/cm²…) global,
  persistente.
- **Buscador de módulos** (lupa del pie de la barra lateral o `Ctrl+K`).

## Desarrollo

```bash
# Instalar dependencias (Concreta usa Bun como único gestor de paquetes)
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

Tema claro por defecto (sigue al sistema) y oscuro a un clic. Acento
reservado a elementos interactivos (foco, navegación activa). Estados
semánticos:

- `state-ok` (verde) — utilización < 95 %
- `state-warn` (ámbar) — utilización 95-99 %
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
