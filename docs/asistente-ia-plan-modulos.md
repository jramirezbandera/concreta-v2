# Asistente IA — Plan de extensión al resto de módulos

> Plan de trabajo para conectar el asistente "Rellenar con IA" a los 15 módulos
> que aún no lo tienen. Complementa
> [asistente-ia-arquitectura.md](./asistente-ia-arquitectura.md) (el **cómo**
> funciona el asistente) — este documento es el **qué hay que tener en cuenta
> en cada módulo y en qué orden hacerlo**. Fecha: 2026-07-13.

---

## 0. Situación y alcance

Conectados (17 — TODOS los módulos con formulario): **steel-beams**,
**rc-columns**, **isolated-footing** (Fases 0–2); **composite-section**,
**micropiles**, **slope-stability** (ola 3); **pile-cap**, **timber-columns**,
**timber-beams**, **steel-columns**, **empresillado**, **punching** (ola 1);
**rc-beams**, **forjados**, **retaining-wall**, **anchor-plate** (ola 2);
**masonry-walls** (ola 4, v1 de alcance reducido).

Pendiente: **nada**. `fem-2d` queda APLAZADO por decisión de producto (§5.2): no
es un rellenador de formularios, sería generación de modelo — spec propia si
algún día se retoma. Clasificación original por encaje con el contrato del
adapter:

| Ola | Módulos | Por qué juntos |
|---|---|---|
| **1 — encaje directo** ✅ | pile-cap, timber-columns, timber-beams, steel-columns, empresillado, punching | Estado plano en `useModuleState`, motor `{valid, error?, checks}`, sin arrays. Son "otra zapata": adapter + reglas + tests, sin tocar infraestructura |
| **2 — planos con particularidades** ✅ | rc-beams, forjados, retaining-wall, anchor-plate | Siguen siendo planos, pero con doble sección (vano/apoyo), gates con reset atómico, muchos campos o legacy sincronizado |
| **3 — arrays en el payload** ✅ | composite-section, micropiles, slope-stability | Requieren relajar la convención "payload plano" a "plano + arrays homogéneos de objetos planos" y aplicar fuera de `setField` |
| **4 — decisión de producto** ✅ | masonry-walls, ~~fem-2d~~ | Modelos anidados de verdad (plantas→huecos, nodos/barras/cargas). Masonry se hizo con alcance reducido v1; FEM, aplazado |

El orden dentro de cada ola está pensado para que cada módulo reutilice lo
aprendido en el anterior (p. ej. composite-section estrena el patrón de arrays
con un array acotado a 6 elementos antes de que taludes lo use con estratos).

---

## 0bis. Saneamientos previos — HECHOS (2026-07-13)

Deuda de los módulos destino que convenía arreglar en origen antes de blindar
cada adapter contra ella:

1. **✅ Muro de contención: `cover` migrado de m → mm** (schema
   `'retaining-wall': '2'`). Era el único módulo que lo almacenaba en m.
   El motor añade un guard `cover < 10 mm → invalid` que además atrapa en alto
   los enlaces compartidos antiguos (que traían 0.02–0.12 m por URL, fuera del
   versionado de localStorage). UI ahora edita en mm (antes cm), como el resto
   de módulos.
2. **✅ Forjados: `variantSwitchPatch(state, next)`** en
   [`data/forjadoTipologias.ts`](../src/data/forjadoTipologias.ts) — el patch
   atómico del cambio de variante (variant + 16 campos de armado a defaults +
   preset reticular), extraído del componente. La UI lo consume ya; el
   `handleAiApply` del futuro adapter usará el mismo helper.
   Test: `src/test/calc/forjadosVariantSwitch.test.ts`.
3. **✅ Anchor-plate: `shearPatch(Vx, Vy)` y `edgeAxisPatch(axis, c1, c2)`**
   exportados de [`lib/calculations/anchorPlate.ts`](../src/lib/calculations/anchorPlate.ts),
   junto a los resolvers que los leen. Toda escritura de cortante/bordes en la
   UI pasa ahora por ellos; de paso se arregló un bug real: una edición
   direccional que volvía a la simetría (cX1=cX2=250) dejaba `pedestal_cX`
   obsoleto (200) y `resolveEdges` calculaba con el borde antiguo.
   Test: `src/test/calc/anchorPlateSyncPatches.test.ts`.
4. **✅ Doc de arquitectura §7**: corolario "en rehabilitación, lo existente es
   DATO" (regla de seguridad invertida en empresillado y muros de fábrica).

Pendiente opcional (cosmético, no bloquea nada): unificar la edición de la luz
de forjados a metros (hoy se edita en mm; vigas HA la edita en m).

---

## 1. Decisiones transversales (antes del primer módulo)

Cosas que conviene decidir/hacer UNA vez, no quince:

1. **`AiModuleId`** (`lib/ai/modules/types.ts:10`) es una unión cerrada de 3
   ids. Ampliarla por ola (los ids nuevos coinciden con la clave de
   `useModuleState`: `'pile-cap'`, `'timber-beams'`, …).

2. **Arrays en el payload (ola 3).** Técnicamente ya es viable: el envelope
   anida el payload en `proposal.anyOf[0]` y los dos conversores de
   `schemaConvert.ts` son recursivos. Lo que hay que hacer:
   - Documentar la convención nueva en el doc de arquitectura: *"plano, salvo
     arrays homogéneos de objetos planos, con semántica de REEMPLAZO COMPLETO"*
     (un array propuesto sustituye al vigente entero; `null` = sin cambio).
   - Tests de `schemaConvert` con un payload que anide array-de-objetos
     (Anthropic `type` array → `anyOf`, OpenAI strict, Gemini).
   - Verificar que `mergeProposalPayloads` trata el array como valor atómico
     (gana el entrante completo si no es `null`) — es el comportamiento actual
     de "gana lo nuevo", pero merece test explícito.
   - `pendingSnapshot` ya funciona: la clave del array cuenta como "tratada".

3. **`onApply` fuera de `setField`.** El contrato ya lo permite (el módulo
   recibe el plan y decide cómo aplicarlo). composite-section (`setPlates`),
   slope (`setState` completo), micropiles fase B (`setSoil`) y masonry
   necesitan un `handleAiApply` que no sea un bucle de `setField`. Solo hay que
   documentar el patrón.

4. **Resúmenes de resultados "sintéticos".** `summarizeCalcResults` exige
   `{valid, error?, checks: CheckRow[]}`. No lo cumplen tal cual: rc-beams y
   forjados (DOS secciones), composite-section (veredicto por clase de
   sección), anchor-plate (el motor ya agrega `overallStatus` + `warnings`),
   masonry (unión discriminada `EdificioInvalid`), fem (checks por barra en
   formato propio). El patrón: cada `summarize<Modulo>Results` construye un
   `CalcResultLike` sintético — concatena checks con prefijo de sección
   (`"Vano: "`, `"Apoyo: "`), mapea invalid→`error`, y pasa lo informativo por
   `extraLines`. **El resumen debe reflejar lo que el usuario VE** (en rc-beams
   modo simple, solo vano).

5. **Cálculo no-vivo (taludes).** `CHAT_RESULTS_RULES` afirma "se recalculan
   automáticamente" — falso en taludes (botón Calcular + Pyodide). Añadir al
   adapter un flag (p. ej. `resultsRecalc: 'auto' | 'manual'`) que cambie esa
   regla y el pie del bloque de resultados ("pulsa Calcular para actualizar").
   Es el único cambio real de infraestructura de todo el plan junto con los
   arrays.

6. **Niveles ordinales en `safety.ts`.** `detectSafetyRisks` ya admite
   cualquier `level(value)`; lo nuevo es el patrón para ENUMS (clase de
   exposición, situación de proyecto, clase de servicio…). Añadir un helper
   `ordinalLevel(map: Record<string, number>)` para no repetir el mapeo en cada
   módulo.

7. **Qué NUNCA va en el payload** (vale para los 15): `title` (metadato de
   documento), campos derivados/auto (β cuando `bcType≠custom`, CR/cover auto
   de micropilotes, kh/kv de muros, `VEd_interaction`…), campos de estado de
   UI no persistidos (tab móvil, toggle vano/apoyo), y campos sin control en
   la UI (la IA no debe escribir lo que el usuario no puede ver ni corregir).

8. **Tests por módulo** (patrón `mapIsolatedFooting.test.ts`): mapper (rangos,
   catálogos, conversiones, gates), snapshot, reglas de seguridad, resumen de
   resultados. Más los tests de infra del punto 2.

---

## 2. Ola 1 — encaje directo — ✅ HECHA (2026-07-14)

Implementados los seis: **pile-cap, timber-columns, timber-beams, steel-columns,
empresillado, punching**. 162 tests nuevos (`src/test/ai/map*.test.ts`), suite
completa en verde. Desvíos y decisiones respecto a lo planeado:

- **Fix UI previo (timber-beams):** se añadió el selector de `beamType` al panel
  (opción (a) del §2.3, con las etiquetas sacadas de `BEAM_CASES` para que no
  puedan divergir del motor). Sin él la IA no podía montar los voladizos que el
  motor ya sabía calcular.
- **Helpers nuevos en `safety.ts`:** `magnitudeIsSafer` (momentos CON SIGNO de
  encepados: lo que rebaja la demanda es reducir el MÓDULO, y cambiar el signo no
  es riesgo) y `falseIsSafer` (booleanos que regalan capacidad; `unfactoredIsSafer`
  pasa a ser su alias).
- **`isSystem` de vigas de madera con `alwaysCheck`:** su default es `false` (el
  lado seguro), así que sin desactivar el gate anti-ruido la activación —que
  regala ksys = 1.10— no se marcaría NUNCA. Mismo criterio que el `usePassive`
  planeado para muros.
- **Puntos ciegos nuevos** (default = valor conservador ⇒ el gate no puede marcar
  su relajación): `exposedFaces` = 4 y `loadDuration` = 'medium' en pilares de
  madera. Documentados y fijados con test.
- **Trampa del `CheckRow` legacy de madera:** sus filas informativas llevan
  `neutral: true` pero `status: 'ok'`, así que el summarize necesita un
  `toCheckRows()` que traduzca el status — si no, las cabeceras ELU/ELS se
  cuentan como comprobaciones CUMPLE. Prevista en el §7.8 del checklist, confirmada
  en implementación.
- **`plateT` excluido del payload de punzonamiento**: es informativo y NO tiene
  control en la UI (regla 7 de las decisiones transversales: la IA no escribe lo
  que el usuario no puede ver ni corregir).
- **Reglas de seguridad añadidas sobre lo planeado:** `beamType` de vigas de
  madera (ordinal por el coeficiente de MEd de `BEAM_CASES`: declarar biempotrada
  una biapoyada rebaja el momento un 33% sin tocar la obra) y `mode` de
  punzonamiento (ordinal por β: declarar "carga puntual" la reacción de un pilar
  baja β de 1.15 a 1.0).
- **β de pilares de acero:** el motor lee `beta_y`/`beta_z` del estado, así que el
  plan los sincroniza al cambiar `bcType` — en `fields` pero SIN fila en la tabla
  de cambios, para que el riesgo se marque UNA vez (en `bcType`) y no tres.

### Detalle original de la ola (referencia)

### 2.1 Encepados (`pile-cap`) — esfuerzo S

El más simple de todos: 14 campos escalares, `useModuleState`, motor
`CalcResultLike` limpio. **Candidato a primer módulo de la campaña.**

- **Payload** (~14): `n` (enum 2|3|4), `d_p_mm`, `s_mm`, `h_enc_mm`,
  `b_col_mm`, `h_col_mm`, `fck_MPa` (enum, validar 20–50: el motor lo exige),
  `fyk_MPa` (enum **[400, 500]** — como zapatas, sin 600), `cover_mm`,
  `phi_tie_mm` (enum `availableBarDiams`), `N_Ed_kN`, `Mx_kNm`, `My_kNm`,
  `R_adm_kN`. Todo en mm/kN — coincide con el estado interno, sin conversión.
- **Gates / orden**: `n` PRIMERO (decide posiciones y qué tirantes existen).
  Validación cruzada en `buildPlan`: `n=2` (final) con `Mx≠0` → skip de `Mx`
  con motivo ("con 2 micropilotes el momento Mx es estáticamente
  inadmisible") o warning si el `Mx` es el vigente.
- **Momentos con signo**: a diferencia de zapatas, aquí el signo SÍ entra en
  Navier — no aplicar valor absoluto.
- **Seguridad**: `N_Ed`, `Mx_Ed`, `My_Ed` → `higherIsSafer`; `R_adm` →
  `lowerIsSafer` (la capacidad admisible del micropilote la fija el
  geotécnico/fabricante — subirla hace "cumplir" sin tocar el encepado).
- **Resultados**: `summarizeCalcResults` directo. `extraLines`: R_max vs R_adm
  y ángulo de biela θ. Ojo al check `pile-react-tension` (warn sin ratio).

### 2.2 Pilares de madera (`timber-columns`) — esfuerzo S

- **Payload** (~15): `gradeId` (enum del catálogo `timberGrades.ts`: C14–C40,
  D30–D70, GL24h–GL32h — **no existe GL36h**), `b_mm`, `h_mm`, `L_m`,
  `beta_y`, `beta_z`, `Nd_kN`, `Vd_kN`, `Md_kNm`, `momentAxis`
  (strong|weak), `serviceClass` (1|2|3), `loadDuration` (enum 5 valores),
  `fireResistance` (R0–R120), `exposedFaces` (3|4), `etaFi`.
- **Trampa nº 1 del prompt**: `Nd/Vd/Md` son valores de cálculo **YA
  MAYORADOS** (contraste con timber-beams, que van en característica). Las
  `promptRules` deben dejarlo cristalino y pedir conversión si el enunciado da
  cargas de servicio.
- **Gates**: `fireResistance='R0'` desactiva `exposedFaces`/`etaFi` (si se
  proponen con R0 vigente y sin proponer R>0 → skip con motivo);
  `momentAxis='strong'` activa la ec. 6.35.
- **Seguridad**: `Nd/Vd/Md/L/beta_y/beta_z/etaFi` → `higherIsSafer` (β=1.0
  default: mismo punto ciego documentado en rc-columns); ordinales:
  `serviceClass` (bajar 3→1 sube kmod), `loadDuration` (acortar duración sube
  kmod), `fireResistance` (bajar R elimina la comprobación de fuego),
  `exposedFaces` (4→3 relaja).
- **Resultados**: verificar en implementación que `TimberColumnCheckRow`
  (usa `value`/`limit` string legacy) pinta bien vía `checkValueStr` — si no,
  mini-mapeo en el summarize.

### 2.3 Vigas de madera (`timber-beams`) — esfuerzo S

- **Payload** (~15): `gradeId`, `b_mm`, `h_mm`, `L_m`, `gk_kNm`, `qk_kNm`,
  `serviceClass`, `loadDuration`, `loadType` (+`psi2Custom` si custom),
  `fireResistance`, `exposedFaces`, `isSystem`, `partitionType`.
- **Trampa nº 1**: `gk`/`qk` son **kN/m lineales**, NO kN/m² — el módulo no
  tiene ancho tributario. Regla de prompt: "si el enunciado da carga
  superficial y ancho tributario, multiplica y añade warning con la
  conversión" (el caso inverso de steel-beams).
- **Decisión previa**: `beamType` existe en el estado y el motor lo consume,
  pero **la UI no renderiza el selector** (queda siempre 'ss'). Opciones:
  (a) arreglar la UI primero (existe `BEAM_CASES`, es un select) e incluirlo
  en el payload; (b) excluirlo del payload v1 y decir en promptRules que el
  módulo calcula biapoyada. Recomiendo **(a)** — es un fix pequeño y sin él
  la IA no puede montar voladizos que el motor ya sabe calcular.
- **Seguridad**: `gk/qk/L` → higher; `partitionType` ordinal (fragile L/500 →
  none L/300: relajar el límite de integridad); `isSystem` false→true da el
  bonus ksys=1.10 → marcar true (nivel false=1, true=0); `psi2Custom` higher;
  `loadType` ordinal por ψ₂ (storage 0.8 > residential/office 0.3 > roof 0);
  mismos ordinales de clase/duración/fuego que pilares.
- **Trampa del motor**: comprueba también la combinación solo-permanente
  (1.35·gk con kmod permanente) — mencionarlo en promptRules para que la IA
  sepa explicar por qué "manda lo permanente" con qk pequeña.

### 2.4 Pilares de acero (`steel-columns`) — esfuerzo S/M

- **Payload** (~13): `sectionType` (HEA|HEB|IPE|2UPN|CHS), `size` (validar
  contra `getSizesForTipo` de la familia FINAL del plan), `steel`
  (S275|S355), `chs_D_mm`, `chs_t_mm`, `chs_process`
  (hot-finished|cold-formed), `Ly_m`, `Lz_m`, `bcType` (pp|pf|ff|fc|custom),
  `beta_y`, `beta_z`, `Ned_kN`, `My_kNm`, `Mz_kNm`.
- **Conversión**: `Ly`/`Lz` internos en **mm**, editados en m → payload en m,
  `buildPlan` ×1000 (mismo patrón que `Lcr` en steel-beams).
- **Gates / orden**: `sectionType` ANTES que `size` (validación cruzada:
  si el payload trae familia y tamaño, validar tamaño contra la familia
  propuesta; si solo tamaño, contra la vigente). CHS ignora `size`; el resto
  ignora `chs_*` → skip con motivo si se proponen bajo el gate equivocado.
  `beta_*` solo aplicables con `bcType='custom'` final.
- **Seguridad**: `Ned/My_Ed/Mz_Ed/Ly/Lz/beta_y/beta_z` → higher; `bcType`
  ordinal por β (fc=2.0 > pp=1.0 > pf=0.7 > ff=0.5 — pasar de pp a ff baja β
  a la mitad; `custom` → sin nivel, lo cubren las reglas de β).
- **Resultados**: `SteelCheckRow` OK. Estados especiales: clase 4 / perfil no
  disponible → `valid:false` con `error` → se resume como `invalid` ✓;
  cargas todas a cero → extraLine "sin cargas definidas".

### 2.5 Empresillado (`empresillado`) — esfuerzo S

- **Payload** (~16): `bc_cm`, `hc_cm`, `L_m`, `N_Ed_kN`, `Mx_kNm`, `My_kNm`,
  `Vd_kN`, `perfil` (enum de las 45 claves de `ANGLE_PROFILES`, L60x5…
  L160x16), `fy_MPa` (numérico libre, típico 275/355), `beta_x`, `beta_y`,
  `s_cm`, `lp_cm`, `bp_cm`, `tp_mm`.
- **Trampa de unidades**: cm para bc/hc/s/lp/bp, **mm solo para tp** —
  detallarlo campo a campo en las descriptions (es el módulo con la mezcla
  más traicionera junto con muros).
- **Validación cruzada**: `s > lp` obligatorio — evaluar sobre el resultado
  combinado (vigente + propuesto); si se viola, skip del campo que rompe con
  motivo.
- **Seguridad**: `N_Ed/Mx/My/Vd/L/beta_x/beta_y` → higher; **`bc`/`hc` →
  `lowerIsSafer`**: es la geometría del pilar EXISTENTE (dato medido en obra,
  rehabilitación) — agrandarla mejora los brazos de palanca de los angulares
  sin que nadie haya medido eso. Primera aparición del principio "en
  rehabilitación lo existente es dato" (reaparece en masonry con fb/fm).
- **Nota**: la IA escribe `Vd`; el motor deriva `VEd = max(Vd, N_Ed/500)` —
  no exponerlo.

### 2.6 Punzonamiento (`punching`) — esfuerzo M

- **Payload** (~26, con modo cruceta incluido): `mode`
  (pilar|carga-puntual|pilar-cruceta), `position` (interior|borde|esquina),
  `isCircular`, `cx_mm`, `cy_mm`, `d_mm`, `fck` (enum), `fyk_MPa` y
  `fywk_MPa` (numéricos libres — este módulo no los enumera), `barDiamSup/
  sSup/barDiamInf/sInf`, `VEd_kN`, `hasShearReinf`, `swDiam` (enum 6-12),
  `swLegs` (enum 2-6), `sr_mm`, y el bloque cruceta: `colType` (HEB|HEA|IPE),
  `colSize`, `plateA/B/T_mm`, `steelGrade` (S275|S355), `upnSize` (enum
  catálogo UPN 80–400), `weldThroat_mm`, `edgeY_mm`, `edgeX_mm`.
- **Decisión**: incluir cruceta desde v1 (el gate `mode` hay que modelarlo
  igual y son ~9 campos más) o dejarla para una segunda pasada. Recomiendo
  incluirla — el modo es el "compañero de hand-calc" y la extracción de
  enunciado le viene igual de bien.
- **Gates / orden**: `mode` → `position` → `isCircular` (solo interior) →
  `hasShearReinf` → resto. En cruceta, `cx/cy/isCircular/hasShearReinf` son
  inertes (el motor los fuerza) → skip con motivo. `edgeY` solo
  borde/esquina; `edgeX` solo esquina.
- **Convención a explicar en promptRules**: en borde/esquina, `cx` = dimensión
  PARALELA al borde libre, `cy` = perpendicular hacia el interior.
- **Seguridad**: `VEd` → higher; `position` ordinal (esquina β=1.5 > borde
  1.4 > interior 1.15 — "mover" el pilar hacia interior baja la demanda);
  `edgeY`/`edgeX` → `lowerIsSafer` (distancias reales al borde del macizo —
  agrandarlas mejora el perímetro). `d` y el armado son diseño (sin regla).
- **Resultados**: `CalcResultLike` ✓ único (sin secciones). Checks `neutral`
  (`punz-beta-note`, `punz-layout-note`) van a la línea de informativas.
  En cruceta, extraLine con la clase del UPN y el aviso de reparto manual.

---

## 3. Ola 2 — planos con particularidades — ✅ HECHA (2026-07-14)

Implementados los cuatro: **rc-beams, forjados, retaining-wall, anchor-plate**.
136 tests nuevos, suite completa en verde. Desvíos y decisiones respecto a lo
planeado:

- **CORRECCIÓN al §3.3 de abajo: el `cover` del muro YA está en mm** (default 40;
  el motor rechaza < 10 mm). El texto que dice "interno en METROS" es anterior al
  saneamiento del 2026-07-13 y se dejó sin actualizar. No hay ninguna conversión
  ÷100 que hacer.
- **Fix UI previo (forjados):** la luz (`spanLength`) y el tipo de vano no se
  renderizaban en variante MACIZA, pero el motor los usa igual para la esbeltez L/d
  — la comprobación salía de una luz de 5000 mm que el usuario no veía. Los dos
  controles se han sacado fuera del bloque `isReticular`. Mismo caso que el
  `beamType` de vigas de madera en la ola 1.
- **Helper nuevo `tipologiaPatch`** en `data/forjadoTipologias.ts`, hermano de
  `variantSwitchPatch`: el preset de tipología vivía inline en el panel, así que un
  `setField('tipologia', …)` del apply de la IA habría dejado la geometría anterior.
- **Helper nuevo en `safety.ts`: `trueIsSafer`** (simétrico de `falseIsSafer`), que
  pide el `hasWater` de muros: apagar el nivel freático borra el empuje hidrostático.
- **`apoyo_*` de vigas con modo final "simple" → SKIP con motivo** (el plan decía
  "se aplican con warning"). El panel no renderiza esa sección: aplicar campos
  invisibles contradice la regla 7. El motivo invita a proponer `mode='portico'`,
  que en el mismo turno abre el gate.
- **Regla de seguridad NUEVA — `mode` de vigas:** volver de pórtico a simple OCULTA
  la sección de apoyo (el motor la sigue calculando, la app deja de mostrarla). Un
  apoyo que incumple desaparece de la vista sin tocar la obra: es exactamente el
  patrón del incidente que motiva los guardarraíles.
- **El ordinal de `exposureClass` tiene DOS peldaños, no cuatro:** `wkMax` vale 0.4
  en XC1 y 0.3 en XC2/XC3/XC4. Un XC4 → XC2 no relaja nada y NO se marca; bajar a
  XC1 sí, y en forjados desactiva la fisuración entera.
- **Excluidos del payload de placas de anclaje:** `concrete_cracked` (no tiene
  control en la UI, y desde su default `true` el único movimiento posible sería
  relajar el cálculo) y `bar_spacing_x`/`bar_spacing_y` (el motor los IGNORA: el
  layout sale de la placa, los bordes y el número de barras).
- **Trampas de resumen confirmadas en implementación:** los `infoChecks` de forjados
  NO son `neutral` (un aviso de esbeltez volcaría el veredicto si se colara en los
  checks), y el motor de placas NO tiene campo `error` — su `valid:false` llega con
  `overallStatus:'ok'`, y sus warnings de severidad `fail` vuelcan el veredicto sin
  ser checks.

**Auditoría post-implementación (2026-07-14, misma tanda):**

- **BUG corregido — `spanLength` de forjados tenía la dirección INVERTIDA.** El
  plan decía `higher` (la intuición de los demás módulos de vigas), pero en
  forjados los esfuerzos son entrada MANUAL: la luz no alimenta la demanda, solo
  el ancho eficaz `bEff = max(min(intereje, L0/5), bWeb)` — CAPACIDAD, que crece
  con L y no está saturada con los defaults (700 < 820) — y la esbeltez L/d, que
  es informativa. Lo peligroso es ALARGARLA (regala MRd al vano) →
  `lowerIsSafer`. La regla original además era incoherente con el ordinal de
  `tipoVano` (−l0Factor), que sí marca la inflación de L0. Punto ciego asumido y
  testeado: acortarla limpia la línea informativa pero no puede volcar el veredicto.
- **Verificado en el motor: `fuste-bending` se emite en AMBOS modos** (armado dado
  y dimensionado con Ø=0) — su ausencia solo puede significar `|e| ≥ B/3`, así que
  la detección del núcleo central del summarize es fiable.
- **Test de contrato nuevo `payloadSchemaContract.test.ts`** sobre los 16
  adapters: `required` exhaustivo (el modo strict de OpenAI da 400 en runtime si
  falta una clave y ningún test del mapper lo caza), `additionalProperties:false`
  y todo nullable salvo `warnings`/`notes`.
- Menores: aviso en forjados cuando la tipología comercial arrastra la geometría
  del preset (se aplica vía `tipologiaPatch` sin fila en la tabla — el warning la
  hace visible, patrón de los campos derivados), y etiqueta `parking` alineada
  con el panel ("Garaje", no "Aparcamiento").

### Detalle original de la ola (referencia)

### 3.1 Vigas de hormigón (`rc-beams`) — esfuerzo M/L

El gemelo de rc-columns en valor didáctico, pero con DOS secciones.

- **Payload** (~31): `mode` (simple|portico), `b_mm`, `h_mm`, `cover_mm`,
  `fck` (enum), `fyk` (enum **[400,500,600]**), `exposureClass` (XC1–XC4),
  `loadType` (+`psi2Custom`), `L_m` (**interno en mm** — ×1000 en buildPlan,
  única conversión del módulo), `structSystem` (ss|end|interior|cantilever),
  y por sección (`vano_` / `apoyo_`): `Md_kNm`, `VEd_kN`, `M_G_kNm`,
  `M_Q_kNm`, armadura de tracción (nBars + diam enum), de compresión (ídem),
  `stirrupDiam` (enum ≤16), `stirrupSpacing_mm`, `stirrupLegs`.
- **`mode` en el payload**: sí — es la única forma de que la IA proponga
  'portico' cuando el enunciado trae vano Y apoyo. `buildPlan` avisa si el
  plan deja campos `apoyo_*` con modo final 'simple' (se aplican al estado
  pero no se ven).
- **Semántica de armado a explicar en promptRules**: la tracción está ABAJO
  en vano (M+) y ARRIBA en apoyo (M−) — los nombres `vano_bot_*` /
  `apoyo_top_*` son la armadura de tracción de cada sección.
- **Gates / orden**: `mode` primero; `loadType` antes que `psi2Custom`;
  `L=0` desactiva la comprobación de esbeltez (documentar).
- **Seguridad**: todos los esfuerzos (8 campos) y `L` → higher; `cover` →
  higher; `exposureClass` ordinal (XC4=3…XC1=0 — bajar clase relaja wk
  admisible); `structSystem` ordinal por K invertido (subir K de 1.0 a 1.5
  relaja el límite L/d → nivel = −K); `psi2Custom` → higher; `loadType`
  ordinal por ψ₂ (parking 0.6 > residential/office 0.3 > roof 0).
- **Resultados**: sintético. En modo `simple`: solo `vano.checks` (es lo que
  ve el usuario). En `portico`: `vano.checks` con prefijo "Vano: " +
  `apoyo.checks` con "Apoyo: ". Error global o de sección → `error`.
  El check de esbeltez vive solo en vano.
- **Trampa SLS**: `Ms = M_G + ψ₂·M_Q` (no ψ₂·(M_G+M_Q)) — la IA no lo
  calcula, pero promptRules debe dejar claro que M_G y M_Q son momentos de
  SERVICIO sin mayorar (frente a Md, que va mayorado).

### 3.2 Forjados (`forjados`) — esfuerzo M/L

- **El gate mayor de toda la campaña**: `variant` (reticular|maciza) con
  **reset atómico** — la UI (`handleVariantSwitch`) resetea 16 campos de
  armado y re-aplica el preset de tipología. `handleAiApply` debe reproducir
  esa lógica (extraerla a un helper compartido UI↔IA), no hacer
  `setField('variant', …)` a secas.
- **Payload** (~28): `variant`, `tipologia` (25+5|30+5|35+5|40+5|35+10|
  custom), `h_mm`/`hFlange_mm`/`bWeb_mm`/`intereje_mm` (SOLO aplicables con
  `tipologia='custom'` — si no, son derivados del preset y se skipean con
  motivo), `spanLength_m` (**interno en mm**, ×1000 — ojo: en la UI de este
  módulo se edita en mm, al contrario que rc-beams), `tipoVano` (enum 4),
  `cover_mm`, `fck`/`fyk` (enums), `exposureClass`, armado reticular
  (base sup/inf nBars+diam, refuerzos vano/apoyo nBars+diam), armado maciza
  (parrillas φ+s, refuerzos φ+s con φ=0 = sin refuerzo), `stirrupsEnabled` +
  cercos por sección, `vano_Md`/`apoyo_Md`/`VEd`, `M_G`/`M_Q` por sección.
- **Excluir del payload**: `loadType`/`psi2Custom` — el motor los usa pero
  **no tienen control en la UI**; la IA no debe escribir campos invisibles.
  (Alternativa: añadir el control a la UI primero; decisión menor.)
- **Gates / orden**: `variant` → `tipologia` → geometría → `stirrupsEnabled`
  → resto. Catálogos: Ø parrilla maciza **[8,10,12,16,20]** (≠
  `availableBarDiams`); estribos [6,8,10,12] × patas [2,3,4].
- **Seguridad**: esfuerzos → higher; `exposureClass` ordinal — aquí con más
  motivo: **XC1 desactiva la comprobación de fisuración entera**;
  `spanLength` → higher (dato del proyecto que además infla b_eff).
- **Resultados**: sintético: `vano.checks` + `apoyo.checks` (prefijos) +
  `shearChecks` (cortante único). `infoChecks` (esbeltez L/d, nota biaxial,
  reparto) NO cuentan para el veredicto (igual que la UI) → van como
  extraLines. Filas especiales tipo `bar-spacing-impossible` (armado que no
  cabe en el nervio) son la señal que la IA necesita para proponer Ø mayor en
  vez de más barras — mencionarlo en promptRules.

### 3.3 Muro de contención (`retaining-wall`) — esfuerzo L

El más grande en nº de campos (37) y el más rico en reglas de seguridad — es
el módulo donde el guardarraíl demanda/resistencia brilla.

- **Payload** (~37, agrupado): geometría `H/hf/tFuste/bPunta/bTalon/df` (m),
  materiales `fck`/`fyk` (enums [400,500,600]) y `cover_cm` (**interno en
  METROS**, default 0.04 — convertir ÷100 desde cm humanos; la trampa de
  unidades más peligrosa de la campaña), relleno `gammaSuelo/gammaSat`
  (kN/m³), `phi_deg`, `delta_deg`, `q_kNm2`, terreno `sigmaAdm_kPa`, `mu`,
  `usePassive`, agua `hasWater` + `hw_m`, sismo `Ab` (fracción de g) + `S`,
  y 7 pares de armado `diam/sep` (Ø enum **[0,10,12,14,16,20]**, donde
  **0 = "sin definir" = modo dimensionado**: el motor calcula As requerida en
  vez de comprobar — semántica especial que hay que explicar en la
  description del campo y en promptRules).
- **Gates**: `hasWater` → `hw`; `Ab=0` = sin sismo; `usePassive` solo
  efectivo con `df+hf > 0`; `bTalon=0`/`bPunta=0` omiten sus bloques.
- **Seguridad** (tabla larga, la anti-trampa geotécnica completa):
  - higher: `H`, `q`, `gammaSuelo`, `gammaSat` (bajar el peso del relleno
    reduce el empuje), `Ab`, `S`, `cover`.
  - lower: `phi`, `delta` (subir el rozamiento del relleno baja Ka),
    `sigmaAdm`, `mu`, `df` (más empotramiento favorable), `hw` (profundizar
    el NF reduce el empuje hidrostático).
  - booleanos: `hasWater` true→false = riesgo; `usePassive` false→true añade
    resistencia que el CTE deja a decisión razonada → `alwaysCheck`.
- **No escribir**: `kh`/`kv` (derivados de Ab·S).
- **Resultados**: `CalcResultLike` ✓. extraLines: FS vuelco/deslizamiento
  (prefiriendo las variantes sísmicas si existen, como el SummaryStrip),
  σmax y excentricidad. Ojo: `|e| ≥ B/3` omite TODO el bloque de armado —
  el resumen debe decirlo para que la IA no "eche en falta" checks.

### 3.4 Placas de anclaje (`anchor-plate`) — esfuerzo L

El más delicado por los campos legacy sincronizados.

- **Decisión de payload (la clave del módulo)**: exponer SOLO la forma
  canónica y sincronizar el legacy en `buildPlan`:
  - Cortante: payload `Vx_kN`/`Vy_kN` (no `VEd`); al aplicar, escribir
    también `VEd = Vx` para mantener la coherencia con `resolveShear`
    (replicar `setLegacyVEd`/toggles de la UI).
  - Bordes del macizo: payload `cX1/cX2/cY1/cY2` (no `pedestal_cX/cY`); al
    aplicar, sembrar los legacy si procede (replicar `setLegacyCX/CY`).
- **Payload** (~30): `sectionType` (IPE|HEA|HEB|**IPN** — único módulo de
  acero con IPN), `sectionSize`, `NEd_kN`, `NEd_G_kN`, `Mx_kNm`, `My_kNm`,
  `Vx/Vy`, placa `a/b/t_mm` + `plate_steel` (S235|S275|S355), barras
  `bar_nLayout` (4|6|8|9), `bar_diam` (enum RebarDiam [8…32]), `bar_grade`
  (B400S|B500S), `bar_spacing_x/y`, `bar_edge_x/y`, `bar_hef`,
  `bottom_anchorage` (enum 4), `top_connection` (enum 2 — ortogonal, sin
  check), `washer_od` (gate arandela_tuerca), rigidizadores `rib_count`
  (0|2|4) + `rib_h/t`, hormigón `fck` + `concrete_cracked`, macizo
  `cX1/cX2/cY1/cY2`, `pedestal_h`, `plate_margin_x/y`, `surface_type`
  (smooth|roughened), `weld_throat`.
- **Seguridad** (con dos sutilezas nuevas):
  - `Mx/My/Vx/Vy` → higher.
  - **`NEd_G` → `lowerIsSafer`**: es el axil cuasi-permanente que RESISTE por
    fricción (μ·Nc,G) — inflarlo mejora el cortante gratis.
  - **`NEd` → `lowerIsSafer` con why explícito**: la compresión alivia la
    tracción de los anclajes (el fallo que gobierna) — subir el axil "ayuda".
    Es el único campo de carga de toda la campaña donde lo peligroso es
    AUMENTAR; documentarlo bien para no confundir al lector del código.
  - `concrete_cracked` true→false = riesgo (`alwaysCheck`: k2 7.5→10.5);
    `cX1/cX2/cY1/cY2`, `pedestal_h`, `plate_margin_x/y` → lower (geometría
    real del macizo); `surface_type` smooth→roughened sube μ → ordinal.
- **Resultados**: el motor YA agrega (`overallStatus`, `worstUtil`,
  `warnings` con severidad) → summarize casi directo, pero incorporar los
  `warnings` fail (pueden volcar el veredicto con checks verdes) y el estado
  del solver (`solver-equilibrium` no convergido = modo APROX) como
  extraLines. `valid:false` sin cargas → "sin datos" (verificar si trae
  `error`).

---

## 4. Ola 3 — arrays en el payload — ✅ HECHA (2026-07-14)

Implementada completa (infra + composite-section + micropiles A**+B** +
slope-stability). Desvíos y decisiones respecto a lo planeado:

- **Micropilotes fase B incluida** en la misma tanda (decisión del usuario):
  el array `soil` es proponible con riesgos por elemento desde el día 1.
- **`detectElementRisks`** (safety.ts): matching posicional, gate de fábrica a
  nivel de array (igualdad profunda sin ids), riesgo agregado de eliminación
  opt-in por `removalWhy`. `ordinalLevel(map)` para enums, calibrado con el
  factor normativo real del motor (Fe/Fr/Fu/Fc/re/β).
- **`resultsRecalc: 'manual'`**: 5º parámetro posicional de
  `buildChatSystemPrompt` (retrocompatible) + `CHAT_RESULTS_RULES_MANUAL`;
  el summarize de taludes tiene 3 estados (SIN CALCULAR → 'invalid'; stale →
  MISMO verdict + AVISO como 1ª línea).
- **Elemento inválido → skip del array ENTERO** (todo-o-nada), y en composite
  el cambio de familia sin tamaño replica el auto-ajuste de la UI (primer
  tamaño + warning).
- **Puntos ciegos nuevos documentados** (análogos a β=1.0): `duration='long'`
  y `application='new'` de micropilotes, y `situation='persistent'` de
  taludes, son a la vez default y valor conservador común — el gate anti-ruido
  no puede marcar su relajación desde el default (test explícito lo fija).
- Tests: mapCompositeSection (34), mapMicropiles (31), mapSlopeStability (25)
  + infra en safety/chatSchema/schemaConvert/mergeProposal.

### Detalle original de la ola (referencia)

### 4.1 Sección compuesta (`composite-section`) — esfuerzo L

**El piloto del patrón array** (acotado: máx 6 chapas).

- **Estado**: NO usa `useModuleState` (useState + localStorage propio +
  `?model=`). `handleAiApply` custom: `setField` para escalares + reemplazo
  del array `plates`.
- **Payload escalares**: `mode` (custom|reinforced), `profileType`
  (IPE|HEA|HEB — sin IPN/2UPN aquí), `profileSize`, `grade`
  (S235|S275|S355|S450 — único módulo con 4 grados), `Ly_m`/`Lz_m` (interno
  mm), `bcType`, `beta_y/z` (gate custom), `Ned_kN`.
- **Payload array `plates`** (máx 6, REEMPLAZO completo): objetos planos
  `{b_mm, t_mm, posType, customYBottom_mm, lateralAnchor, lateralOffset_mm}`.
  Validación por elemento en `buildPlan`: `posType` según modo (custom solo
  admite top/bottom/custom), left/right ignoran `t` y usan `lateralAnchor`
  (web|flange) + `lateralOffset`, `posType='custom'` requiere `customYBottom`.
  Ids: regenerados (`p1..pn`) — no son significativos. La tabla de cambios
  describe el array como una línea ("Chapas: 1 → 2 · superior 200×15 +
  inferior 200×15").
  Mismo espíritu que el fix #109 (whitelist de posType/numéricos en
  serialize): el buildPlan es la whitelist del lado IA.
- **Gates / orden**: `mode` primero (cambia opciones de posType y el bloque
  de compresión); `profileType` antes que `profileSize`; `bcType` antes que β.
- **Seguridad**: `Ned/Ly/Lz/beta_y/beta_z` → higher; `bcType` ordinal por β
  (como steel-columns). Las chapas son diseño puro (sin reglas).
- **Resultados**: sintético — el veredicto de la UI es por CLASE de sección
  (≤2 ok, 3 warn, 4 fail), no por utilización: `checks` (clasificación) +
  `compChecks` (pandeo/compresión, solo reinforced), extraLines con la clase
  y las propiedades clave (A, Iy/Iz, Wpl). En `mode='custom'` sin
  clasificación → nota. Recordar la nota informativa de pandeo
  torsional/flexo-torsional (bug #111) si aparece en checks.

### 4.2 Micropilotes (`micropiles`) — esfuerzo L (fase A) + M (fase B)

**Dos fases**: escalares primero (fase A), estratos después (fase B).

- **Fase A — payload escalares** (~28): profundidades `topDepth_m`/
  `toeDepth_m`/`waterTableDepth_m` (**positivas hacia abajo DESDE LA
  RASANTE** — la convención geotécnica es LA regla de prompt nº 1 del
  módulo), `drillDiameter_mm`, `injectionPressure_kPa`, `designLoad_kN`,
  `effort` (enum 3), `method` (theoretical|empirical), `groutType`
  (lechada|mortero), `concreteGrade` (enum 25|30|35), `tube` (enum con los
  **labels PIRESA exactos** `'Ø88,9 × 9 mm'` etc. + `'custom'`),
  `customTubeDe/E_mm` (gate custom), `steelGrade_MPa`, `execution` (enum 5),
  `corrosionEnv` (enum 5), `designLifeYears` (enum 5|25|50|75|100),
  `connection` (no-loss|other), `application` (new|existing), `duration`
  (short|long), `crManualOverride` + `CR`, `coverManualOverride` +
  `structuralCover_mm`, `baseMoment_kNm`, `baseShear_kN`,
  `soilModulusTop/Embed_kNm2`.
  - **Estratos en fase A**: solo lectura — serializados en el `snapshot`
    (la IA los VE y razona con ellos: "tu estrato 2 es cohesivo con su=0…")
    pero no proponibles; si el enunciado trae estratigrafía nueva, warning
    "edición de estratos aún no disponible desde el asistente".
- **Fase B — array `soil`**: objetos planos `{type, thickness_m, gamma,
  c_kPa, phi_deg, su_kPa, Nspt, rflim_MPa, Cu}` con reemplazo completo,
  aplicado vía `setSoil` del orquestador (canal aparte de `setField`).
  Invariante a validar: Σthickness ≥ toeDepth. **Todo campo de estrato es
  dato geotécnico** → cualquier cambio favorable (subir c/φ/su/rflim, bajar
  γ…) sobre estratos ya establecidos debe marcarse — requiere extender la
  detección de riesgos a elementos de array (comparación por posición) o
  hacerla ad-hoc en el buildPlan del módulo. Es el motivo real de separar
  la fase B.
- **Seguridad fase A**: `designLoad/baseMoment/baseShear` → higher;
  `soilModulusTop/Embed` → lower (subir E mejora el pandeo);
  `waterTableDepth` → lower (profundizar el NF es favorable);
  `designLifeYears` → higher (bajar la vida útil reduce la corrosión re);
  `corrosionEnv` ordinal (hacia menos agresivo = riesgo); `execution`
  ordinal por Fe; `connection`/`duration`/`application` ordinales por su
  factor; `CR` → higher (bajarlo reduce la penalización de pandeo) y los dos
  overrides `crManualOverride`/`coverManualOverride` con `alwaysCheck`
  (pasar de auto a manual reinterpreta el cálculo — el mismo espíritu que
  `loadsAreFactored` en zapatas).
- **No escribir**: CR/cover ADOPTADOS (auto), y NINGÚN factor normativo
  (Fe/Fc/Fφ/Fr/Fu/re/f/me) — la IA fija el enum, jamás el número.
- **Resultados**: `CalcResultLike` ✓ (con ~15 validaciones de entrada que
  dan `error`). extraLines: Rfc teórico vs empírico + método adoptado, CR
  adoptado, utilizaciones ih/ic/im/iv.

### 4.3 Taludes (`slope-stability`) — esfuerzo L/XL

El más distinto: arrays + cálculo manual asíncrono (Pyodide).

- **Payload escalares**: `height_m`, `angle_deg`, `method`
  (bishop|fellenius), `situation` (persistent|transient|extraordinary),
  `context` (excavation|global-foundation). **Excluir** `slices`/
  `iterations` (calidad de malla, presets fast/fine — no es dato de
  problema; el motor además clampa en silencio).
- **Nivel freático — colisión de semántica**: el estado usa
  `waterTableDepth: number | null` donde null = "sin NF", pero en el payload
  null significa "sin cambio". Solución: dos campos —
  `sinNivelFreatico: boolean|null` + `nfProfundidad_m: number|null` — que
  `buildPlan` recombina.
- **Payload arrays**: `strata` `{type, thickness_m, gamma, c_kPa, phi_deg,
  su_kPa}` (los campos de micropilotes Nspt/rflim/Cu NO — el motor de
  taludes los ignora) y `loads` `{kind: udl|line, magnitude, offset_m,
  length_m}`. Reemplazo completo; ids regenerados (max+1). Invariantes:
  Σthickness ≥ height, γ∈[1,50], espesores > 0.
- **Aplicación**: `useSlopeState` expone `setState(SlopeInputs)` completo —
  `handleAiApply` construye el objeto entero.
- **Cambio de infraestructura (punto 1.5)**: el resultado NO se recalcula al
  aplicar — queda `isStale` hasta que el usuario pulsa Calcular. El adapter
  necesita el flag `resultsRecalc:'manual'`: (a) variante de
  `CHAT_RESULTS_RULES` sin el "se recalculan automáticamente", con "pide al
  usuario que pulse Calcular"; (b) el `aiResults` del módulo debe reflejar
  el estado del solver: `ready` → resumen normal; `stale` → resumen + aviso
  "desactualizado respecto a los datos actuales"; sin resultado → texto
  "aún no calculado".
- **Seguridad**: `height`/`angle` → higher (geometría real del talud);
  estratos (dato geotécnico, como micropilotes fase B): `c`/`phi`/`su` →
  lower, `gamma` → higher; cargas `magnitude` → higher y eliminar una carga
  existente = riesgo (detectar en la comparación de arrays); NF: pasar de
  "con NF" a "sin NF" o profundizarlo = riesgo; `situation` ordinal
  (persistent 1.5 > transient 1.3 > extraordinary 1.1 — cambiar de situación
  relaja los límites); `context` ordinal con why (global-foundation γ_M=1.8
  es más exigente que excavation 1.5).
- **Trampa `su`**: el check sin drenaje salta con `su>0` en CUALQUIER
  estrato sin mirar `type` — buildPlan debe forzar la coherencia de la UI
  (granular ⇒ c=0, su=0).
- **Resultados**: checks ya en `CheckRow` (fos-cte/fos-static, fos-ec7,
  fos-rom, fos-undrained, fos-seismic neutral) → summarize directo +
  extraLines (FoS del check gobernante, método, malla usada).

---

## 5. Ola 4 — decisión de producto — ✅ HECHA (2026-07-14)

### 5.1 Muros de fábrica (`masonry-walls`) — esfuerzo L (v1 reducido) — ✅

Hecho tal como se recomendaba (alcance reducido), con **tres desviaciones
deliberadas** respecto al plan original, todas documentadas abajo.

- **Alcance v1**: la IA propone SOLO los escalares globales — fábrica
  (`fabricaModo`, `pieza` enum 5, `fb` enum [5,10,15,20,25], `fm` enum, con la
  validación cruzada de la terna, `customMethod`, `anejoC_tipoMuro` enum 7,
  `anejoC_fb/fm`, `fk_custom`, `gamma_custom`), seguridad (`gamma_M`, `gamma_G`,
  `gamma_Q`) y geometría global (`L`, `t` — interno en mm, payload en m/cm). Las
  plantas (con huecos y puntuales) van al snapshot como CONTEXTO DE SOLO LECTURA:
  la IA las ve y explica resultados por planta y machón, pero no las edita.
- **DESVIACIÓN 1 — el contexto de lectura va DENTRO de `valores`**, no como clave
  hermana: `decorateSnapshot` (`pendingSnapshot.ts`) reconstruye el objeto
  quedándose solo con `valores`/`sin_confirmar`/`pendientes_de_aplicar`, así que
  una clave de primer nivel sobrevive al turno 1 y desaparece en silencio en
  cuanto el modelo hace su primera propuesta. Además viaja una bandera
  `plantas_por_defecto` (helper `masonryPlantasSonDeFabrica`): las plantas NO son
  claves del payload, luego NO pueden salir en `sin_confirmar`, y sin la bandera
  el modelo daría por buenas las alturas y cargas INVENTADAS de la plantilla de
  arranque y dictaminaría "tu edificio CUMPLE".
- **DESVIACIÓN 2 — la seguridad de la fábrica es un riesgo SINTÉTICO, no reglas
  por campo.** Lo que este plan prescribía (`fb`/`fm`/`fk_custom` →
  `lowerIsSafer`) resultó ser a la vez ruidoso y agujereado: subir `fm` de 5 a 7.5
  con fb=10 y ladrillo macizo deja `f_k = 4` IGUAL (fila roja falsa), mientras que
  cambiar `pieza`, `fabricaModo` o `customMethod` —o el auto-γ derivado del tipo de
  muro, que no tiene fila en `changes`— sube la capacidad SIN disparar ninguna
  regla. En su lugar, `fabricaRisks` compara `resolverFabrica(vigente)` con
  `resolverFabrica(estado FINAL)` y marca lo único que importa: que suba `f_k` o
  que baje `γ` (aligerar el muro rebaja el peso propio, que es demanda). Con su
  propio gate anti-ruido (la fábrica ya caracterizada, o un cambio de modo/método,
  que nunca es "rellenar el formulario"). La tabla escalar se queda con `t` y `L`
  → `lowerIsSafer` (2º caso de "en rehabilitación lo existente es DATO": engordar
  el espesor MEDIDO arregla compresión, esbeltez y concentración de una sola
  escritura) y los tres γ → `higherIsSafer` con **`alwaysCheck`** (un coeficiente
  parcial no tiene primer relleno legítimo). Cero solape ⇒ cero doble-reporte.
- **DESVIACIÓN 3 — el resumen NO puede usar las filas del machón.** La
  reconstrucción se extrajo, sí (`masonryMachonChecks`, compartida por la UI), pero
  alimentar el summarize con ella rompe el veredicto por DOS vías: (a) la fila de
  pandeo del machón avisa en ámbar entre λ=22 y 27, donde el motor sigue diciendo
  CUMPLE → chat "REVISAR" con el badge verde (el caso frecuente: un muro de 12 cm
  y H=3 m da λ=25 en cubierta); (b) solo mira la planta del machón crítico, y la
  planta esbelta puede ser otra → chat "CUMPLE" con el badge en rojo. El summarize
  usa `masonryBuildingChecks` = compresión + concentración del machón crítico + una
  fila de esbeltez **de EDIFICIO y sin banda ámbar**, que reproduce exactamente el
  `overallStatus` del motor (invariante testada sobre 6 fixtures). La banda 22–27
  va como extraLine, igual que los `infoChecks` de forjados.
- **De paso**: `MASONRY_LAMBDA_MAX` como fuente única (el literal `27` estaba en
  cuatro sitios, y la fila de la UI y el PDF fallaban en λ=27 exacto donde el motor
  aprobaba); la fila de compresión imprime ahora el axil que GOBIERNA η (el del
  pie, que manda siempre) en vez del de cabeza; y los desplegables de Tabla 4.4 se
  filtran por pieza (`fbValidosPara`/`fmValidosPara`) — `FM_PARA_FB` ignora la
  pieza y ofrecía celdas nulas ("junta delgada" con fb=5) que tumbaban el módulo a
  "Datos no válidos".
- **v2 (si hay demanda)**: array `plantas` con sub-arrays `huecos`/`puntuales` —
  anidamiento a 2 niveles; los validadores lo soportan pero la ProposalCard
  necesitaría un render de cambios por entidad. No hacerlo hasta ver uso real del
  v1. Al exponerlas, `q_G/q_Q/P_G/P_Q` → `higherIsSafer` (cargas en
  CARACTERÍSTICA: el motor mayora).

### 5.2 FEM 1D (`fem-2d`) — recomendación: APLAZAR

No conectarlo en esta campaña. Motivos:

1. El "formulario" es un modelo doble-anidado (nodos/barras/apoyos/cargas)
   con unión discriminada de cargas y campos condicionales por `material` —
   no hay payload plano razonable; sería generación de modelo, otra feature.
2. Convenciones de signo INCONSISTENTES entre tipos de carga (`point-node`
   con Py positivo hacia abajo; `udl`/`point-bar` con magnitud positiva +
   `dir`), invariantes topológicas pre-solver (sin barra biarticulada, sin
   hinge sobre apoyo…) — la tasa de propuestas inválidas sería alta y cada
   skip necesitaría explicar topología.
3. Los checks son `BarCheck` por barra (formato propio, no `CheckRow`) y el
   veredicto es `maxEta` — el resumen exigiría su propio serializador.

Si en el futuro se quiere IA aquí, plantearlo como spec propia ("describir
la viga en lenguaje natural → modelo completo", con validación por
invariantes y preview) — es un producto distinto del rellenador de
formularios. Alternativa barata mientras tanto: ninguna (un chat solo-consulta
sin proposal es una feature nueva que no comparte casi nada con el actual).

---

## 6. Resumen de esfuerzos y orden propuesto

| # | Módulo | Ola | Esfuerzo | Novedades que estrena |
|---|---|---|---|---|
| 1 | pile-cap ✅ | 1 | S | gate `n`; momentos con signo (`magnitudeIsSafer`) |
| 2 | timber-columns ✅ | 1 | S | niveles ordinales (clase/duración/fuego) |
| 3 | timber-beams ✅ | 1 | S | fix UI beamType; carga lineal kN/m; `falseIsSafer` (ksys) |
| 4 | steel-columns ✅ | 1 | S/M | validación cruzada familia↔tamaño; β derivado |
| 5 | empresillado ✅ | 1 | S | unidades cm; "lo existente es dato" |
| 6 | punching ✅ | 1 | M | 3 modos con campos inertes |
| 7 | rc-beams ✅ | 2 | M/L | resumen bicéfalo vano/apoyo; el gate de `mode` |
| 8 | forjados ✅ | 2 | M/L | gate con reset atómico (helper compartido); `infoChecks` |
| 9 | retaining-wall ✅ | 2 | L | tabla de seguridad geotécnica; `trueIsSafer` |
| 10 | anchor-plate ✅ | 2 | L | sincronización legacy Vx/Vy y cX1..cY2; motor sin `error` |
| 11 | composite-section ✅ | 3 | L | **arrays en payload** (piloto, máx 6) |
| 12 | micropiles (fase A) ✅ | 3 | L | estratos read-only en snapshot |
| 13 | slope-stability ✅ | 3 | L/XL | **resultsRecalc:'manual'**; arrays ×2 |
| 14 | micropiles (fase B) ✅ | 3 | M | riesgos sobre elementos de array |
| 15 | masonry-walls (v1) ✅ | 4 | L | alcance reducido; contexto read-only DENTRO de `valores` + bandera de plantilla; **riesgo sintético sobre la fábrica resuelta**; checks reconstruidos con fila de esbeltez de EDIFICIO (paridad de veredicto) |
| — | fem-2d | 4 | — | APLAZADO (spec propia si se retoma) |

Infraestructura previa (una vez): ampliar `AiModuleId`, helper
`ordinalLevel`, tests de `schemaConvert`/merge con arrays, flag
`resultsRecalc` (puede esperar hasta el nº 13).

## 7. Checklist por módulo (recordatorio operativo)

La receta de §11 del doc de arquitectura, más lo aprendido aquí:

1. Adapter en `lib/ai/modules/<modulo>.ts`: payload plano (± arrays ola 3),
   nullable, unidades humanas en descriptions, sin min/max.
2. `promptRules` con: unidades y conversiones típicas del enunciado, la
   convención traicionera del módulo (profundidades desde rasante, cx
   paralelo al borde, cargas mayoradas o no…), y qué es dato vs diseño.
3. `SAFETY_RULES` — usar las tablas de este documento como partida; pensar
   dos veces antes de dejar `[]`.
4. `summarize<Modulo>Results` — discriminar SIEMPRE por `error != null`;
   sintético si hay secciones/veredicto no estándar; el resumen refleja lo
   que el usuario ve.
5. `handleAiApply` con el ORDEN de gates documentado arriba; helpers
   compartidos con la UI cuando el gate tiene lógica (forjados).
6. `<AiChatModal>` + `aiResults` memoizado en `features/<modulo>/index.tsx`.
7. Tests: mapper / snapshot / safety / results (molde
   `mapIsolatedFooting.test.ts`).
8. Verificar de paso: que el `CheckRow` del módulo pinta bien vía
   `checkValueStr` (madera usa strings legacy) y que el módulo aparece
   correctamente en el bloque "SOBRE LA APLICACIÓN" (deriva del registry —
   automático).
