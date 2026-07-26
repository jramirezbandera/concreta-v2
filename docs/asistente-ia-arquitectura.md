# Asistente IA — Arquitectura

> Documento **técnico** del asistente "Rellenar con IA": cómo está montado por
> dentro, qué ocurre en cada turno de chat, por qué existe cada guardarraíl y
> qué hay que escribir para conectar un módulo nuevo.
>
> El **qué** (alcance de producto, modelo de privacidad BYOK, comportamiento
> esperado) está en [SPECS.md § 9.3.1](../SPECS.md). Este documento es el
> **cómo**. Estado: implementado (Fases 0–2 + ola 3: arrays en el payload y
> cálculo manual + ola 1: los seis módulos de encaje directo + ola 2: los cuatro
> planos con particularidades). 16 módulos conectados. Fecha: 2026-07-14.

---

## 0. Modelo mental

El asistente **no calcula nada**. Es un traductor conversacional entre el
lenguaje natural del usuario y los campos del formulario del módulo activo:

```
enunciado / imagen / pregunta
        ↓
    [ LLM ]  ← system prompt: reglas + estado del formulario + resultados del cálculo
        ↓
  { reply, proposal }        ← structured output, siempre este envelope
        ↓
  buildPlan() del módulo     ← unidades, rangos, catálogos → plan de cambios
        ↓
  <ProposalCard>             ← el usuario ve Actual → Propuesto y pulsa Aplicar
        ↓
  setField() del módulo      ← el motor de cálculo recalcula (como con entrada manual)
```

Tres invariantes de diseño gobiernan todo lo demás:

1. **Nada toca el estado del formulario sin que el usuario pulse Aplicar.**
2. **El motor de cálculo es el de siempre.** La IA propone entradas, nunca
   resultados. MEd/VEd de vigas siguen derivándose de las cargas por la app.
3. **La app desconfía del modelo.** Todo lo que devuelve se valida, se acota a
   rangos y catálogos, y se audita en busca de cambios que rebajen la seguridad.

---

## 1. Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| **Contrato de módulo** | |
| [`lib/ai/modules/types.ts`](../src/lib/ai/modules/types.ts) | `AiModuleAdapter<TInputs>` y `AiApplyPlan<TInputs>`. El contrato que hace genérico al chat |
| [`lib/ai/modules/steelBeams.ts`](../src/lib/ai/modules/steelBeams.ts) | Adapter de Vigas de acero (delega en `schema.ts` + `validate.ts` + `mapExtraction.ts` de Fase 0) |
| [`lib/ai/modules/rcColumns.ts`](../src/lib/ai/modules/rcColumns.ts) | Adapter de Pilares de hormigón (schema, mapper y reglas de seguridad propios) |
| [`lib/ai/modules/isolatedFooting.ts`](../src/lib/ai/modules/isolatedFooting.ts) | Adapter de Zapata aislada (ídem) |
| [`lib/ai/modules/compositeSection.ts`](../src/lib/ai/modules/compositeSection.ts) | Adapter de Sección compuesta (piloto de ARRAYS: `plates[]` con reemplazo completo) |
| [`lib/ai/modules/micropiles.ts`](../src/lib/ai/modules/micropiles.ts) | Adapter de Micropilotes (estado combinado escalares + `soil[]`; riesgos por elemento) |
| [`lib/ai/modules/slopeStability.ts`](../src/lib/ai/modules/slopeStability.ts) | Adapter de Taludes (`strata[]`+`loads[]`, par del NF, `resultsRecalc:'manual'`) |
| [`lib/ai/modules/pileCap.ts`](../src/lib/ai/modules/pileCap.ts) | Adapter de Encepados (gate `n`; momentos CON SIGNO y la trampa "n=2 no admite Mx") |
| [`lib/ai/modules/timberColumns.ts`](../src/lib/ai/modules/timberColumns.ts) | Adapter de Pilares de madera (esfuerzos YA mayorados; ordinales calibrados con kmod) |
| [`lib/ai/modules/timberBeams.ts`](../src/lib/ai/modules/timberBeams.ts) | Adapter de Vigas de madera (cargas LINEALES kN/m; `beamType` como dato; ksys) |
| [`lib/ai/modules/steelColumns.ts`](../src/lib/ai/modules/steelColumns.ts) | Adapter de Pilares de acero (familia↔tamaño; β derivado de `bcType`) |
| [`lib/ai/modules/empresillado.ts`](../src/lib/ai/modules/empresillado.ts) | Adapter de Empresillado (unidades en cm salvo `tp`; "lo existente es DATO") |
| [`lib/ai/modules/punching.ts`](../src/lib/ai/modules/punching.ts) | Adapter de Punzonamiento (tres modos con campos inertes; β por posición y modo) |
| [`lib/ai/modules/rcBeams.ts`](../src/lib/ai/modules/rcBeams.ts) | Adapter de Vigas de hormigón (resumen BICÉFALO vano/apoyo; el gate de `mode`) |
| [`lib/ai/modules/forjados.ts`](../src/lib/ai/modules/forjados.ts) | Adapter de Forjados (gates con PATCH ATÓMICO; la trampa de los `infoChecks`) |
| [`lib/ai/modules/retainingWall.ts`](../src/lib/ai/modules/retainingWall.ts) | Adapter de Muros de contención (la tabla anti-trampa geotécnica completa) |
| [`lib/ai/modules/anchorPlate.ts`](../src/lib/ai/modules/anchorPlate.ts) | Adapter de Placas de anclaje (sincronización legacy; motor SIN campo `error`) |
| [`lib/ai/modules/masonryWalls.ts`](../src/lib/ai/modules/masonryWalls.ts) | Adapter de Muros de fábrica (plantas READ-ONLY dentro de `valores`; riesgo SINTÉTICO sobre la fábrica resuelta; checks reconstruidos con paridad de veredicto) |
| **Prompt** | |
| [`lib/ai/chatSchema.ts`](../src/lib/ai/chatSchema.ts) | Envelope `{reply, proposal}` + composición del system prompt por turno |
| [`lib/ai/appContext.ts`](../src/lib/ai/appContext.ts) | Bloque "SOBRE LA APLICACIÓN" (derivado del `moduleRegistry`) |
| [`lib/ai/resultsSummary.ts`](../src/lib/ai/resultsSummary.ts) | Resultados del cálculo → texto del prompt (bucle de dimensionado) |
| [`lib/ai/pendingSnapshot.ts`](../src/lib/ai/pendingSnapshot.ts) | Decora el snapshot con la memoria de la conversación |
| [`lib/ai/chatHistory.ts`](../src/lib/ai/chatHistory.ts) | Hilo de UI → turnos de la request (ventana + cupo de imágenes) |
| **Transporte** | |
| [`lib/ai/providers/index.ts`](../src/lib/ai/providers/index.ts) | Dispatcher: elige proveedor, valida el envelope |
| [`lib/ai/providers/anthropic.ts`](../src/lib/ai/providers/anthropic.ts) · [`openai.ts`](../src/lib/ai/providers/openai.ts) · [`gemini.ts`](../src/lib/ai/providers/gemini.ts) | Una implementación por SDK; normalizan errores a `AiError` |
| [`lib/ai/providers/schemaConvert.ts`](../src/lib/ai/providers/schemaConvert.ts) | Traduce el JSON Schema canónico al dialecto de cada validador |
| [`lib/ai/models.ts`](../src/lib/ai/models.ts) | Un modelo fijo de gama media por proveedor |
| [`lib/ai/types.ts`](../src/lib/ai/types.ts) | `ChatRequest`, `ChatEnvelope`, `AiError` y sus mensajes |
| [`lib/ai/validate.ts`](../src/lib/ai/validate.ts) | Parseo defensivo del envelope y de la extracción de vigas |
| **Seguridad y aplicación** | |
| [`lib/ai/safety.ts`](../src/lib/ai/safety.ts) | Detector genérico de propuestas que reducen la seguridad |
| [`lib/ai/mergeProposal.ts`](../src/lib/ai/mergeProposal.ts) | Acumulación de propuestas no aplicadas |
| [`lib/ai/mapExtraction.ts`](../src/lib/ai/mapExtraction.ts) | Mapper de vigas (incluye el guardarraíl que **rechaza** un `qk` incoherente) |
| **UI** | |
| [`components/ai/AiChatModal.tsx`](../src/components/ai/AiChatModal.tsx) | El modal: orquesta el turno completo. Genérico por adapter |
| [`components/ai/ProposalCard.tsx`](../src/components/ai/ProposalCard.tsx) | Tarjeta de propuesta + interlock de riesgos |
| [`components/ai/ByokSettings.tsx`](../src/components/ai/ByokSettings.tsx) | Selector de proveedor y campo de API key |
| [`lib/ai/AiSettingsProvider.tsx`](../src/lib/ai/AiSettingsProvider.tsx) | Ajustes BYOK en `localStorage` + sincronización entre pestañas |
| [`lib/ai/imagePrep.ts`](../src/lib/ai/imagePrep.ts) | Redimensionado y recompresión de las capturas adjuntas |

Los tests viven en [`src/test/ai/`](../src/test/ai/) — un fichero por pieza (18 en total).

---

## 2. Anatomía de un turno

Cuando el usuario envía un mensaje, `runRequest()` de
[`AiChatModal.tsx`](../src/components/ai/AiChatModal.tsx) hace lo siguiente.

### 2.1. Reconstruye el system prompt **desde cero**

No se memoiza nunca: el formulario y los resultados pueden haber cambiado desde
el turno anterior (el usuario pudo aplicar una propuesta, o editar un campo a
mano con el modal abierto). `buildChatSystemBlocks()` compone cinco bloques,
**partidos en dos mitades** por la línea de la caché de prompt (§8.1):

| | Bloque | Origen | Contenido |
|---|---|---|---|
| **ESTABLE**<br>(cacheable) | 1. Base | `CHAT_SYSTEM_PROMPT_BASE` | Idioma, formato del envelope, las 7 reglas de `proposal` y las 4 de conducción de la conversación |
| | 2. Sobre la aplicación | `appContext.ts` | Qué es Concreta, qué módulos existen (leídos del `moduleRegistry`), textos reales de los botones. **Sin esto el modelo se inventa menús y pantallas** |
| | 3. Reglas del módulo | `adapter.promptRules` | Unidades, conversiones típicas, qué es dato y qué es diseño **en este módulo** |
| | 4. Reglas de resultados | `CHAT_RESULTS_RULES` | Solo si hay resultados. Prohíbe decir "habría que recalcular", inventar comprobaciones o rebajar la demanda |
| **VOLÁTIL** | 5. Estado + resultados | `adapter.snapshot()` decorado + `resultsSummary` | Ver §4 y §5 |

Los bloques 1–4 son **idénticos byte a byte en todos los turnos del mismo
módulo** (~3.100–4.000 tokens); el 5 cambia cada turno. Ese es exactamente el
corte que necesita la caché de prompt, y por eso `ChatRequest.system` es un
`{stable, volatile}` en vez de un string. `buildChatSystemPrompt()` (los dos
unidos) sigue existiendo para los tests de composición.

### 2.2. Envía la request

`runChatTurn(provider, apiKey, { system, schema, turns, signal })` →
[`providers/index.ts`](../src/lib/ai/providers/index.ts), que hace un *dynamic
import* del SDK del proveedor activo y llama a su `chatRaw`.

`turns` no es el hilo entero: [`buildChatTurns`](../src/lib/ai/chatHistory.ts)
recorta una ventana de los **12 últimos turnos** por defecto (un adapter puede
ampliarla con `historyTurns` — los FEM declaran 20 por su entrevista larga, un
dato estructural por turno), podando siempre **por pares** (para no romper la
alternancia estricta user/assistant que exige Anthropic ni dejar de empezar por
`user`). Las **imágenes NO caducan con la ventana**: las de los turnos podados
se re-adjuntan al primer turno user superviviente con el marcador
`IMAGES_CARRIED_MARKER` (sin esto, el croquis del primer mensaje desaparecía en
cuanto la entrevista superaba la ventana — bucle FEM 2D del 2026-07-21); solo
las poda el cupo de **6 imágenes por petición**, desde el turno más antiguo y
dejando un marcador de texto en su lugar. Los ítems de error se excluyen. Los
turnos `assistant` se reenvían con su **envelope JSON crudo verbatim** — no con
el `reply` renderizado.

### 2.3. Valida la respuesta

`parseChatEnvelope()` exige un objeto con `reply` de tipo string; si no,
`AiError('bad-response')`. `proposal` ausente se normaliza a `null`.

### 2.4. Construye el plan

Si hay propuesta, se fusiona con la pendiente (§6) y se pasa a
`adapter.buildPlan(payload, current, unitSystem)`, que devuelve el
`AiApplyPlan`. Si `buildPlan` lanza (payload ininterpretable), **el `reply` se
muestra igualmente** con un aviso: la conversación no se rompe por una propuesta
mala, y la tarjeta pendiente anterior sigue viva.

### 2.5. Pinta

El plan se renderiza como `<ProposalCard>` inline en el hilo. Aplicar llama al
`onApply` del módulo y **no cierra el modal**: la tarjeta pasa a "Aplicado", el
motor recalcula, y el turno siguiente ya verá los resultados nuevos.

---

## 3. El adapter: cómo un módulo se presenta a la IA

El chat es genérico. Todo lo que sabe de un módulo se lo dice su adapter:

```ts
interface AiModuleAdapter<TInputs> {
  id: AiModuleId;
  label: string;                            // "Vigas de acero" — cabecera y prompt
  payloadSchema: Record<string, unknown>;   // JSON Schema PLANO del payload de `proposal`
  promptRules: string;                      // reglas del módulo (se concatenan al prompt base)
  placeholder: string;                      // enunciado de ejemplo del estado vacío
  snapshot(current: TInputs): string;                                  // estado → JSON del prompt
  buildPlan(payload, current, system): AiApplyPlan<TInputs>;           // propuesta → plan
}
```

Y lo que produce es siempre un plan con la misma forma:

```ts
interface AiApplyPlan<TInputs> {
  fields: Partial<TInputs>;   // en unidades INTERNAS, listo para setField
  changes: AiFieldChange[];   // tabla Campo / Actual / Propuesto (ya formateada)
  skipped: AiSkippedField[];  // propuesto pero NO aplicable, con motivo
  notFound: string[];         // campos que el modelo no mencionó
  warnings: string[];         // conversiones, ambigüedades, "Sugerencia: …"
  notes?: string | null;
  risks: AiSafetyRisk[];      // ← REQUERIDO a propósito (§7)
}
```

**Reglas del payload schema:** plano (sin anidamiento), todo *nullable*, y en
**unidades humanas** (metros, kN/m², mm) descritas en el `description` de cada
campo — el modelo escribe en esas unidades y `buildPlan` convierte a las
internas. Sin `minimum`/`maximum`: no todos los validadores de structured output
los soportan, así que **los rangos se comprueban en cliente**.

**Arrays (ola 3).** "Plano" admite una excepción: **arrays homogéneos de
objetos planos** (`plates`, `strata`, `loads`, `soil`) con semántica de
**REEMPLAZO COMPLETO** — la lista propuesta sustituye entera a la vigente
(`null` = sin cambio; el prompt del módulo exige reenviar la lista completa,
no deltas). Consecuencias en cascada, todas ya cableadas:
- `mergeProposalPayloads` trata el array como valor ATÓMICO (gana el entrante
  no-null entero, jamás merge profundo de elementos).
- Un **elemento inválido invalida la propuesta del array ENTERO** (skip con
  motivo que nombra al elemento): con reemplazo no hay aplicaciones a medias.
- Los **ids de elemento se regeneran** al mapear (`p1..pn`, `1..n`) — no son
  significativos y el modelo no los envía.
- Los conversores de `schemaConvert.ts` ya recorren `items` recursivamente
  (tests de array-de-objetos en `schemaConvert.test.ts`).
- Para arrays de DATOS (estratos geotécnicos, sobrecargas) los riesgos se
  detectan por elemento con `detectElementRisks` (ver §7).

**`buildPlan` nunca aplica en silencio.** Fuera de rango, fuera de catálogo o
igual al valor actual → `skipped` con su motivo, visible en la tarjeta.

**Gates y campos inertes (ola 1).** Cuando un campo del payload solo existe bajo
cierto valor de otro (`exposedFaces` sin requisito de fuego, los cercos de
punzonamiento sin `hasShearReinf`, el bloque de la cruceta en los modos de losa,
β sin `bcType='custom'`), la regla es la misma: el gate se evalúa sobre el estado
**FINAL** (vigente + propuesto en ESTE turno, no el vigente a secas — si no, una
propuesta coherente que trae el gate y su dependiente en el mismo turno se
rompería a la mitad), y lo que no pinta se **salta con motivo**, nunca se aplica
en silencio.

Dos patrones más, que la ola 1 ha fijado:
- **Invariantes de pareja → todo o nada.** `h ≥ b` en vigas de madera, `s > lp`
  en empresillado: si la pareja combinada es inválida NO se aplica ninguna de
  las dos. Aplicar solo una dejaría el cálculo en `error` sin que nadie lo haya
  pedido.
- **Campos derivados: a `fields` sin fila en `changes`.** El motor de pilares de
  acero lee `beta_y`/`beta_z` del estado, así que al cambiar `bcType` hay que
  reescribirlos (igual que hace el panel). Van al plan **sin fila propia en la
  tabla de cambios** —son consecuencia, no decisión— con un warning que lo
  explica. Efecto colateral buscado: como `detectSafetyRisks` recorre `changes`,
  un cambio de condición de apoyo produce **un** riesgo (el de `bcType`, con su
  `why` correcto) en vez de tres.

Y dos que estrena la ola 2:
- **Gate con PATCH ATÓMICO (forjados).** Cuando el gate no solo habilita campos
  sino que además *reescribe* otros, el `handleAiApply` no puede ser un bucle de
  `setField`: `variant` resetea los 16 campos de armado y `tipologia` re-aplica el
  preset de geometría. La lógica vive en helpers compartidos con la UI
  (`variantSwitchPatch`, `tipologiaPatch` en [`data/forjadoTipologias.ts`](../src/data/forjadoTipologias.ts)),
  el apply escribe **el patch primero y el plan después**, y así el armado
  propuesto por la IA gana a los defaults que el patch acaba de reponer.
- **Espejo de campos LEGACY (placas de anclaje).** El estado guarda el cortante y
  los bordes del macizo dos veces (escalar histórico + par direccional) y los
  resolvers del motor leen uno u otro según la simetría. El payload expone SOLO la
  forma canónica y `buildPlan` escribe el espejo con los helpers que ya usa la UI
  (`shearPatch`, `edgeAxisPatch`), en `fields` y **sin fila en `changes`** — el
  mismo patrón de los β derivados. Escribirlos sueltos deja el cálculo incoherente:
  es un bug que ya se arregló una vez en la UI, no conviene reintroducirlo por la
  puerta de la IA.

---

## 4. El snapshot: qué sabe la IA del formulario

`adapter.snapshot()` serializa el estado a:

```json
{"valores": {"L_m": 8, "qk_kNm2": 2, ...}, "sin_confirmar": ["qk_kNm2", "bTrib_m", ...]}
```

`sin_confirmar` son las claves cuyo valor **sigue siendo el default de fábrica**:
nadie las ha tocado. El prompt las trata como *no decididas por el usuario* y
prohíbe darlas por buenas. Es lo que permite el modo guiado.

### El bug del bucle de preguntas (y su arreglo)

Ese criterio tiene un fallo evidente en cuanto se piensa: si el usuario
**confirma** un ancho tributario de 3.0 m y resulta que 3.0 *es* el default, el
campo nunca sale de `sin_confirmar` → el asistente lo vuelve a preguntar → bucle.
Y una propuesta acordada pero **no aplicada** tampoco se refleja en el estado, así
que el snapshot la contradice y esa señal explícita le gana al historial del hilo.

[`pendingSnapshot.ts`](../src/lib/ai/pendingSnapshot.ts) lo arregla **fuera del
adapter**, de forma genérica: el modal lleva un `Set` de claves que el modelo ha
tratado en este hilo (toda clave no-`null` de cualquier `proposal`, aplicada o no)
y, en cada turno, decora el snapshot:

- añade **`pendientes_de_aplicar`** con la propuesta acumulada viva;
- **filtra `sin_confirmar`**, sacando lo pendiente y lo ya confirmado.

Y el prompt cierra el círculo pidiendo al modelo que **incluya en `proposal` los
valores confirmados aunque coincidan con el actual** — es lo único que alimenta
ese registro. La confirmación es memoria **del hilo**, no del estado del
formulario: cerrar el modal la descarta, igual que el historial.

---

## 5. El bucle de dimensionado (Fase 2)

Cada módulo pasa al modal un `AiResultsSummary` vivo, calculado con `useMemo`
sobre el resultado del motor:

```ts
const aiResults = useMemo(() => summarizeSteelBeamResults(result), [result]);
```

[`resultsSummary.ts`](../src/lib/ai/resultsSummary.ts) serializa los `CheckRow[]`
—los mismos que se ven en pantalla— a un bloque de texto:

```
VEREDICTO GLOBAL: INCUMPLE (2 de 12 comprobaciones fallan)
- [INCUMPLE] Vuelco dir. x (FS ≥ 2.0): FS = 1.62 | límite: ≥ 2.00 | η=124% — CTE DB-SE-C 4.4.2
- [CUMPLE] σmax ≤ σadm: 178.3 kPa | límite: 200.0 kPa | η=89% — CTE DB-SE-C 4.4.1
- Informativas: Clasificación sección = CLASE 2 · Flexión dir. x = rígida
Comprobación dominante: Flecha (η=112%)          ← extraLines del adapter
```

Esto es lo que convierte al asistente de rellenador de formularios en algo que
**dimensiona**: ve el fallo, propone subir el perfil, el usuario aplica, el motor
recalcula solo, y en el turno siguiente la IA ya ve los resultados nuevos. Por eso
`CHAT_RESULTS_RULES` le prohíbe expresamente decir "habría que recalcular".

### Cálculo MANUAL (`resultsRecalc: 'manual'`) — taludes

En taludes el motor es asíncrono (PySlope/Pyodide) y lo lanza el usuario con el
botón "Calcular": la regla "se recalculan automáticamente" sería FALSA. El
adapter lo declara con `resultsRecalc: 'manual'` y `buildChatSystemPrompt`
(5º parámetro, default `'auto'`) sustituye las reglas por
`CHAT_RESULTS_RULES_MANUAL` y cambia el rótulo del bloque. El summarize del
módulo (`summarizeSlopeResults(result, isStale)`) tiene TRES estados:

| Estado | verdict | Texto |
|---|---|---|
| Sin corrida (`result === null`) | `invalid` | `SIN CALCULAR: …` (sin veredicto que citar) |
| Corrida fresca | el de la corrida | resumen normal + FoS como extraLine |
| Corrida obsoleta (`isStale`) | **el de la corrida** | `AVISO: RESULTADOS DESACTUALIZADOS…` como 1ª línea |

En stale se CONSERVA el veredicto (un INCUMPLE desactualizado sigue siendo la
mejor señal disponible); la obsolescencia viaja como texto y la regla 3 del
bloque manual obliga al modelo a la salvedad. El ciclo se cierra solo: Aplicar
→ el fingerprint del solver marca `isStale` → el turno siguiente ya lleva el
AVISO, sin ningún caso especial en el modal.

Detalles con trampa, ya resueltos:

- **Los valores van siempre en SI**, aunque el usuario tenga activo el sistema
  técnico: el prompt entero habla SI-humano y así los tests son deterministas.
- **El discriminador de "cálculo no válido" es `error != null`, NUNCA `valid`.**
  `valid` diverge entre módulos (en zapatas `valid = !overall_fail`, así que una
  zapata que incumple vuelco tiene `valid:false` **sin error** y debe resumirse
  como `fail`, no como `invalid`).
- El veredicto (`ok | warn | fail | invalid`) también gobierna la UI: la tarjeta
  **"¿Por qué no cumple?"** del estado vacío solo aparece con veredicto `fail`.

---

## 6. Acumulación de propuestas

Si el modelo propone en dos turnos seguidos y el usuario no aplica el primero, los
datos del primero **no se pierden**:
[`mergeProposalPayloads`](../src/lib/ai/mergeProposal.ts) fusiona el payload
pendiente con el entrante (gana lo nuevo si no es `null`; los `warnings` se unen
sin duplicados), la tarjeta anterior se marca `superseded` (atenuada, sin botón) y
**siempre queda una sola tarjeta viva con todo lo acumulado**.

La fusión es **solo de UI/plan**: al modelo se le reenvía cada envelope verbatim.
Y la fusión ocurre **dentro del updater funcional** de `setItems`, para que si el
usuario aplica una tarjeta con la petición en vuelo, `prev` ya lo refleje y no haya
carrera.

---

## 7. Guardarraíles de seguridad

### El incidente

El asistente escribió la nieve de Málaga (0.20 kN/m²) encima de la sobrecarga de
mantenimiento (1.0) en el único campo `qk` de la viga. El momento de cálculo se
quedó a la mitad. **El cálculo pasaba a verde y estaba mal.**

### El principio: demanda/criterio vs. resistencia

- Los **datos** del problema (cargas, esfuerzos, luces, coeficientes de pandeo,
  propiedades del terreno) y los **criterios** (límite de flecha, recubrimiento,
  naturaleza de las cargas) los fijan el proyecto, la norma o el estudio
  geotécnico. **No son variables de diseño.**
- La **resistencia** (sección, perfil, armado, calidad del material, tamaño de la
  zapata) sí lo es. Subirla es la única forma legítima de hacer que un cálculo
  cumpla.

**Corolario — en rehabilitación, lo existente es DATO.** En los módulos que
verifican estructura existente (empresillado, muros de fábrica), la geometría
y el material del elemento existente (bc/hc del pilar, t/L y fb/fm/fk del muro)
no son variables de diseño aunque en obra nueva lo serían: los fija la
medición o el ensayo. Ahí la regla de seguridad se **invierte** — lo peligroso
es *mejorarlos* (agrandar el pilar medido, engordar el muro medido, subir la
resistencia de una fábrica ensayada), porque infla la capacidad sin que nadie lo
haya comprobado. En sus tablas `SAFETY_RULES` van con `lowerIsSafer` y un `why`
que lo explique.

Y ojo con el reverso: en **muros de fábrica no hay ninguna variable de diseño**
—todo el formulario es dato medido—, así que la única salida legítima de un muro
que no cumple es una **intervención real** (recrecido, zunchado, redistribuir
cargas), y eso se explica en la respuesta, no se escribe en el formulario. El
prompt lo dice con esas palabras.

**Cuando la trampa no cabe en un campo: riesgo SINTÉTICO.** `detectSafetyRisks`
recorre `changes`, así que solo ve lo que tiene fila propia. Si la magnitud que de
verdad importa es *derivada* de varios campos, la tabla por campo se queda corta y
además hace ruido: en muros de fábrica, subir `fm` de 5 a 7.5 con fb=10 y ladrillo
macizo deja `f_k = 4` **igual** (fila roja falsa), mientras que cambiar `pieza`,
`fabricaModo` o `customMethod` —o el γ auto-estimado, que ni siquiera tiene fila—
sube la capacidad **sin disparar ninguna regla**. La salida es comparar la magnitud
RESUELTA antes y después (`resolverFabrica(vigente)` vs `resolverFabrica(estado
FINAL)`) y empujar un `AiSafetyRisk` a mano, con su propio gate anti-ruido — en
muros: la fábrica ya caracterizada, o un cambio de modo/método, que nunca es
"rellenar el formulario". Regla práctica: si un campo con regla y el sintético
pueden marcar el mismo cambio, **quita la regla por campo** (cero solape ⇒ cero
doble-reporte, sin filtros de dedup).

Un modelo al que se le pide "haz que cumpla" tiene un **incentivo estructural** a
tocar lo primero: es más barato y sale igual de verde.

### Las tres capas

**Capa 0 — el prompt.** La regla 7 del prompt base y las reglas de resultados
explican el principio y advierten de que la app marcará en rojo cualquier rebaja.

**Capa 1 — rechazo (estrecha).** Solo para contradicciones internas *demostrables*.
Hoy hay una: en vigas, un `qk` por debajo de la sobrecarga de tabla de la categoría
de uso vigente contradice esa categoría, así que se **rechaza** con un warning
`"Aviso de seguridad: …"` ([`mapExtraction.ts`](../src/lib/ai/mapExtraction.ts)).
Deliberadamente estrecha; la vía de escape es la categoría "personalizada".

**Capa 2 — marcado (genérica).** [`safety.ts`](../src/lib/ai/safety.ts) es un
detector puro sobre una tabla de reglas por módulo:

```ts
interface SafetyRule<TInputs> {
  field: keyof TInputs & string;
  level: (value: unknown) => number | null;  // MAYOR = más conservador
  why: string;                               // por qué ese campo no es diseño libre
  alwaysCheck?: boolean;                     // desactiva el gate anti-ruido
  confirmKey?: string;                       // clave de PAYLOAD que lo confirma (default: field)
}
```

Todo se reduce a **una sola comparación**: `level(después) < level(antes)` → riesgo.
Los *levels* prefabricados cubren los casos habituales:

| Level | Peligroso | Ejemplos |
|---|---|---|
| `higherIsSafer` | **Bajarlo** | cargas (N, Mx, My, H, qk, gk), esfuerzos (Nd, MEd), L, β, recubrimiento, γ del relleno |
| `lowerIsSafer` | **Subirlo** | σadm del terreno, μ de rozamiento, φ y δ del relleno; la geometría de lo EXISTENTE (bc/hc del pilar de empresillado, t/L del muro de fábrica, bordes reales del macizo en punzonamiento y placas); y **el axil de una placa de anclaje** (ver abajo) |
| `magnitudeIsSafer` | Bajar su **módulo** (el signo da igual) | momentos con signo de encepados (entran con signo en Navier: +50 → −50 no rebaja la demanda; 50 → 5 sí); momentos y cortantes biaxiales de placas de anclaje |
| `falseIsSafer` | **Activarlo** | `loadsAreFactored` de zapatas (alias `unfactoredIsSafer`), `isSystem` de vigas de madera (el ksys = 1.10), `usePassive` de muros |
| `trueIsSafer` | **Desactivarlo** | `hasWater` de muros: apagar el nivel freático borra de golpe el empuje hidrostático |
| `ordinalLevel(map)` | Bajar de nivel en un enum | ver abajo |

**La excepción que confirma el principio: `NEd` de placas de anclaje es
`lowerIsSafer`.** Es el único campo de carga de toda la app donde lo peligroso es
AUMENTARLO: la compresión centra la resultante y alivia la tracción de los
anclajes, que es el fallo que gobierna. Está comentado en el adapter para que el
próximo lector no lo "arregle".

**Los ordinales se calibran con el factor normativo REAL del motor**, no con un
orden inventado: `loadDuration` de madera con el −kmod de la Tabla 3.1 de EC5
(kmod menor = más conservador), `bcType` de pilares de acero con el β de cada
condición de apoyo, `position` y `mode` de punzonamiento con el β de
`betaForPosition` (esquina 1.5 > borde 1.4 > interior 1.15; un pilar transfiere
momento y una carga puntual no: 1.15 vs 1.0), `beamType` de vigas de madera con
el coeficiente de MEd de `BEAM_CASES` (la ménsula wL²/2 es 4× la biapoyada
wL²/8), `structSystem` de vigas de hormigón con el −K de la Tabla 7.4N, `tipoVano`
de forjados con el −l0Factor del art. 21 (un L0 mayor ensancha el ancho eficaz y
regala capacidad), `surface_type` de placas con el −μ (lisa 0.2 · rugosa 0.4). Así
el "nivel" es defendible ante el usuario y no una opinión.

**Calibrar significa también NO inventar peldaños.** La clase de exposición
parece una escalera de cuatro, pero `wkMax` vale 0.4 en XC1 y **0.3 en XC2, XC3 y
XC4**: el motor no las distingue entre sí. El ordinal es `{XC1: 0, XC2: 1, XC3: 1,
XC4: 1}` y un XC4 → XC2 **no** es riesgo, porque no relaja nada. Lo que sí lo es
—y mucho— es bajar a XC1: en forjados desactiva la comprobación de fisuración
entera.

**Gate anti-ruido:** un riesgo solo salta si el valor vigente está **establecido**.
Bajar la carga permanente del default al aportar los datos reales del problema es
*rellenar* el formulario, no debilitarlo; bajarla *después*, sobre un valor ya
establecido, es exactamente el patrón del incidente. Sin este gate el aviso saltaría
en casi toda primera extracción y se convertiría en papel pintado que nadie lee.

Un valor está establecido si se cumple **cualquiera** de estas dos:

1. **difiere del de fábrica** (`current[field] !== defaults[field]`): alguien lo tocó;
2. **el hilo ya lo trató** en un turno ANTERIOR y no es la **tarjeta viva** quien lo
   arrastra sin cambio (`confirmed`, que sale de `establishedKeys` sobre el
   `threadValuesRef` del modal).

**Los dos consumidores del registro del hilo NO usan el mismo criterio, y es
deliberado.** `decorateSnapshot` recibe **todas** las claves que el hilo ha tratado
(`new Set(threadValuesRef.current.keys())`), porque su trabajo es sacarlas de
`sin_confirmar` para que el asistente no las re-pregunte en bucle: ahí mencionar el
campo ya basta. El gate de riesgos recibe un **subconjunto** —lo que devuelve
`establishedKeys`—, porque «el hilo mencionó esta clave» no es «alguien fijó este
valor». La tarjeta pendiente se fusiona y el plan se rehace entero cada turno, así
que sin ese filtro toda primera introducción salía en rojo a partir del segundo
turno (fix 2026-07-25).

El filtro exime **una sola** situación: el valor propuesto coincide con el primero
que el hilo le dio **y** es la tarjeta pendiente viva quien lo arrastra. Eso es «la
misma propuesta, re-planificada». Todo lo demás establece, incluido re-proponer ese
mismo valor cuando ya **no** hay tarjeta viva porque la anterior se aplicó: ahí es
una propuesta nueva sobre un formulario que el usuario ha podido corregir a mano, y
si su corrección coincide con el default (que es la fuga 1 entera) la vía 1 no puede
verla. Ese matiz lo añadió el code-review de 2026-07-26, que encontró que el primer
intento de arreglo deshacía correcciones manuales en silencio.

Lo que **sigue exento a propósito**: una tarjeta acumulada durante varios turnos y
nunca aplicada se juzga como el primer relleno que es, aunque haya tardado cuatro
turnos en formarse. Proponer `loadType:'custom'` en el turno 1 y `psi2Custom:0` en el
turno 2, sin aplicar, da el mismo resultado que proponerlos juntos en un solo turno.
Antes eso no era coherente —un turno no avisaba y dos sí—, y esa incoherencia era el
bug.

La segunda es el arreglo de la **auditoría de 2026-07-14 (fuga 1)**, y es la más
importante que se ha hecho al guardarraíl. Sin ella el gate se desarmaba justo
cuando el valor REAL del usuario coincidía con el default — y los defaults son, por
diseño, **los valores más comunes**: un pilar existente de 30×30 (empresillado), un
muro de un pie (240 mm), β = 1.0 biarticulado, ψ₂ = 0.3 de vivienda, el NF a 2 m.
El modelo podía engordar el pilar existente a 40×40 sin una sola fila roja. Los dos
módulos de REHABILITACIÓN, cuya tesis entera es "lo medido es un DATO", tenían la
red desarmada en su caso más frecuente.

La **exención de la tarjeta viva** es el arreglo de **2026-07-25**, y es lo que
mantiene esa segunda vía usable. La tarjeta pendiente **se fusiona** con la
propuesta de cada turno nuevo y el plan se reconstruye entero, así que un dato
introducido por primera vez en el turno 1 —sin fila roja, gate cerrado: nadie lo
había fijado— volvía a evaluarse en el turno 2 con su propia clave ya en la
memoria del hilo, y salía marcado en rojo con checkbox de confirmación. En todos
los turnos siguientes, en cualquier hilo de varios turnos con tarjeta viva: el
modo guiado entero. Por eso el registro guarda el **primer valor** de cada clave
(`collectThreadValues`) y `establishedKeys` exime la clave cuando lo que se propone
ahora **coincide** con esa línea base **y** es la tarjeta pendiente viva quien lo
arrastra. Que la línea base sea la PRIMERA y no la última es lo que hace que un
riesgo ya detectado **siga en rojo** en los turnos siguientes en vez de convertirse
en su propia referencia.

La condición **"y es la tarjeta viva quien lo arrastra"** la añadió el code-review
de **2026-07-26**. Sin ella la exención era demasiado ancha y se comía este flujo:
el modelo propone `bTrib = 1.5` (el default es 3.0), el usuario **aplica**, luego se
da cuenta y **corrige a mano** a 3.0, y al turno siguiente el modelo vuelve a
proponer 1.5. En ese punto el estado observable es idéntico al del falso positivo
—`current` en su valor de fábrica, propuesta igual a la línea base—, así que ninguna
función de (línea base, propuesta, actual, defaults) los distingue: la vía 1 no ve la
corrección porque 3.0 **es** el default (la fuga 1 entera) y la vía 2 quedaba cerrada
por la coincidencia. Resultado: la corrección manual del usuario se deshacía sin una
sola fila roja. Lo que sí los distingue es si la tarjeta que introdujo el valor sigue
viva o ya se aplicó, y eso el modal lo sabe (`findPendingPayload`).

`confirmed` está en el espacio de claves del **payload** (`t_cm`), no del estado
(`t`): de ahí `SafetyRule.confirmKey`. Un `confirmKey` mal escrito deja el gate
cerrado **para siempre** y el campo desprotegido, en silencio — por eso
[`safetyRuleContract.test.ts`](../src/test/ai/safetyRuleContract.test.ts) asserta,
sobre los 17 adapters, que todo `confirmKey ?? field` existe de verdad en su
`payloadSchema`.

`alwaysCheck: true` desactiva el gate entero para lo que reinterpreta el cálculo
aunque venga del default: el par (`loadsAreFactored`, `loadFactor`) de zapatas, los
tres γ de muros de fábrica, el `isSystem` de vigas de madera.

### Cuando el enum tiene una puerta de escape: `'custom'` (auditoría, fuga 2)

`ordinalLevel` devuelve `map[value] ?? null` y el detector **salta los niveles
nulos** (sin nivel no hay comparación, y no se inventa un riesgo). Un valor del enum
que falte en el mapa es, por tanto, una **puerta de escape silenciosa**. Por ahí se
colaba `'custom'`, que está en cuatro payloads y no estaba en ningún mapa:

- `{bcType:'custom', beta_y:0.5, beta_z:0.5}` (pilares de acero, sección compuesta)
  partía la longitud de pandeo por dos y el pilar cumplía;
- `{loadType:'custom', psi2Custom:0}` (vigas de hormigón) dejaba `Ms = |M_G|` y la
  fisuración se desvanecía;
- `{loadType:'custom'}` a secas (vigas de madera) caía de ψ₂ = 0.80 a 0.30.

Y **no tiene arreglo dentro del ordinal**: `'custom'` no puede tener un nivel fijo
porque su nivel **lo decide otro campo**. La comprobación correcta no mira el enum ni
el campo delegado, sino la **magnitud que el motor acaba usando**:

```ts
detectResolvedRisks(rules, fields, current, defaults, confirmed)
// ResolvedSafetyRule: { id, label, resolve(state) → número, level, format, why,
//                       fields[], confirmKeys[], alwaysCheck? }
```

Una sola regla cubre las tres puertas —cambiar el enum, cambiar el campo delegado, o
ambos— y **no puede doble-reportar porque SUSTITUYE a las reglas por campo**, no se
suma a ellas (el contrato lo asserta). Los resolvedores son los del propio motor:
`getBetaForBCType`, `psi2Quasi`, `psi2ForLoadType`. Es el patrón que estrenó muros
de fábrica con `f_k`, generalizado.

Hoy lo usan: **β efectiva** (acero y mixta), **ψ₂ efectivo** (hormigón y madera), el
**esquema estático** de vigas ([`beamScheme.ts`](../src/lib/ai/beamScheme.ts): M, V y
flecha, porque `beamType` mueve las tres y no de forma monótona) y las **dos demandas
de zapatas** (ver más abajo).

### Centinelas: cuando `0` no significa "menos" (auditoría, fuga 3)

Hay campos donde el cero no es el mínimo de una escala: **apaga la comprobación**. Un
`level` monótono lee esas anulaciones como cambios conservadores.

| Helper | El valor "apagado" es… | Ejemplo |
|---|---|---|
| `offIsUnsafe(zeroIsOff, …)` | el nivel **mínimo** (−∞) | `su = 0` borra la comprobación sin drenaje de taludes (`hasUndrained`) y el tope de fuste de micropilotes |
| `offIsUnbounded(zeroIsOff, …)` | el nivel **máximo** (+∞) | `length = 0` de una sobrecarga NO es "cero metros": es una banda **hasta el límite del análisis**, el caso más cargado |

Los dos conviven en taludes, y confundirlos invierte la regla. Además, `su` **no es
monótona**: subirla infla el terreno (riesgo) y anularla borra la comprobación
(riesgo), pero bajarla de 50 a 30 kPa es conservador. Eso no cabe en una sola función
de nivel, así que son **dos reglas sobre el mismo campo** con `key` distinta
(`ElementSafetyRule.key`) — cada una dispara en un solo sentido y nunca se
doble-reportan.

### Una regla con la dirección equivocada es PEOR que ninguna

El caso canónico, cazado en la auditoría: `loadFactor` de zapatas tenía
`higherIsSafer`, correcto con las cargas *sin mayorar* (`N_elu = N·γ`). Pero con
`loadsAreFactored = true` el motor **divide** (`N_sls = N/γ`), así que **subir** γ
rebaja la demanda de servicio — la del hundimiento, que es quien dimensiona la
zapata. La red estaba puesta y apuntaba al lado contrario. Ninguna regla por campo
puede acertar, porque la dirección de γ depende de OTRO campo: hoy se vigilan las dos
**demandas resueltas** (servicio y cálculo), expresadas como el multiplicador que γ y
el toggle aplican sobre las cargas.

Por lo mismo, `phi` de micropilotes NO es `lowerIsSafer` sobre el ángulo: el fuste va
con `(1 − sen φ)·tan(2φ/3)`, que **tiene un máximo cerca de los 34°** y decrece por
encima. El nivel es el propio coeficiente de rozamiento, negado.

**Corolario práctico:** ante una dirección dudosa (el espesor de un estrato es peor o
mejor según qué capa sea), **no pongas regla**. Un hueco documentado es honesto; una
flecha al revés da una falsa sensación de red.

### Una propuesta NUNCA debe dejar el módulo inválido (auditoría, 5ª familia)

Aparte de la seguridad, un `buildPlan` no debe poder producir un `fields` que, aplicado,
deje el cálculo en "Datos no válidos" de un clic — el usuario tendría que adivinar de
qué invariante salir. Los motores tienen invariantes de PAREJA (varios campos a la vez)
que una propuesta puede romper:

- **zapatas**: `h ≤ Df` (el canto no supera la profundidad de cimentación), `bc < B`,
  `hc < L` (el pilar cabe en la zapata). Y el prompt EMPUJA a subir el canto para el
  punzonamiento, con lo que romper `h ≤ Df` era el camino natural.
- **sección compuesta**: el modo `custom` (solo chapas) no admite chapas laterales y
  exige al menos una. Pasar a `custom` sin reproponer las chapas dejaba las laterales
  vigentes → inválido.

El patrón de arreglo es el mismo que la terna de muros de fábrica: **comprobar el estado
FINAL contra la invariante y REVERTIR los miembros PROPUESTOS de la pareja que la rompe**
(vuelven a su valor vigente, que era válido), explicándolo en `skipped` con un motivo
accionable. Reglas de oro:

1. **Solo se toca lo propuesto.** Si la pareja ya venía inválida del estado del usuario,
   no se empeora ni se bloquea un cambio ajeno. La reversión es quirúrgica: un campo
   válido y sin relación con la pareja rota se aplica igual.
2. **No auto-completar el dato que falta.** `Df` es la profundidad real de la excavación,
   no una variable de diseño: subirla en silencio para que quepa el canto es tan malo
   como el auto-snap de `fm` que muros de fábrica NO hace. En su lugar, el **prompt** le
   enseña al modelo a proponer la pareja coherente (más canto ⇒ más Df) en el mismo turno.
3. **La migración también coacciona.** El seam donde entra un estado viejo
   (`normalizeMasonryState` para localStorage/share-URL) debe coaccionar las combinaciones
   imposibles a una celda válida (idempotente para las válidas) y marcar `migratedLegacy`:
   si no, la UI puebla un `<select>` con opciones que no incluyen el valor guardado.

(No confundir con `forjados`: su `geomLocked`/`isReticular` ya leen el estado FINAL
—`fields.x ?? current.x`—, así que ahí no había bug; la auditoría se equivocó en ese punto.)

**Interlock.** Los riesgos se pintan en un bloque rojo de la tarjeta (campo,
antes → después, y *por qué* ese campo no es una variable de diseño libre), y
**el botón Aplicar queda deshabilitado hasta que el usuario marque un checkbox de
confirmación expresa**. Un aviso que no detiene el clic no habría evitado el
incidente que lo motiva.

**`risks` es un campo requerido de `AiApplyPlan`** a propósito: obliga a todo
módulo nuevo a declarar sus reglas (aunque sea `[]`) en vez de quedarse sin red.

### Riesgos en ARRAYS (`detectElementRisks`) — ola 3

Para los arrays de DATOS (estratos de taludes/micropilotes, sobrecargas) el
detector escalar no llega dentro de los elementos.
[`detectElementRisks`](../src/lib/ai/safety.ts) compara el array propuesto con
el vigente **elemento a elemento (matching posicional** — los ids se regeneran
al aplicar) con reglas por propiedad (`ElementSafetyRule`: mismo contrato de
`level`). La dirección la fija CADA módulo — γ es el ejemplo canónico: en
taludes el peso del terreno DESESTABILIZA (bajarlo = riesgo, `higherIsSafer`);
en micropilotes da tensión efectiva y rozamiento por fuste (subirlo = riesgo,
`lowerIsSafer`). Elementos añadidos nunca son riesgo; una lista propuesta MÁS
CORTA genera un único riesgo agregado de eliminación si el módulo declara
`removalWhy` (las chapas de sección compuesta no lo declaran: quitar refuerzo
es diseño legítimo). Gate anti-ruido análogo al escalar, a nivel de array:
si el vigente es EXACTAMENTE el de fábrica (igualdad profunda, ids fuera), la
primera propuesta es rellenar, no debilitar. Para ENUMS escalares existe
además el helper `ordinalLevel(map)` (situación de proyecto, entorno de
corrosión, bcType…): cada valor mapea a un ordinal donde mayor = más
conservador — los mapas se calibran con el factor normativo real del motor
(Fe/Fr/Fu/Fc, re de la Tabla 2.4, β del tipo de apoyo).

### Puntos ciegos conocidos

Todos son la misma familia: **el default es a la vez el valor conservador**, así
que su relajación desde fábrica es indistinguible de un primer relleno y el gate
anti-ruido la deja pasar. El riesgo sí salta en cuanto el campo está fijado.

- `beta` = 1.0 en pilares de hormigón (biarticulado es además el caso real más
  común) — `rcColumns.ts`.
- `duration='long'` y `application='new'` de micropilotes, `situation='persistent'`
  de taludes — ola 3.
- `exposedFaces` = 4 y `loadDuration` = 'medium' de pilares de madera — ola 1.

La excepción es `alwaysCheck: true`, reservada a los campos que **regalan
capacidad o reinterpretan el cálculo entero** aunque vengan del default:
`loadsAreFactored` y `loadFactor` de zapatas, y el `isSystem` de vigas de madera
(activar el tablero colaborante sube la resistencia a flexión un 10% sobre una
afirmación de obra que nadie ha comprobado). Extenderlo a más campos convertiría
el aviso en papel pintado.

---

## 8. Proveedores, claves y transporte

**No hay backend.** Concreta es una PWA estática; el navegador llama directamente
al proveedor con la clave del usuario (**BYOK**).

- **Ajustes** ([`AiSettingsProvider.tsx`](../src/lib/ai/AiSettingsProvider.tsx)):
  `{provider, keys}` en `localStorage` bajo `concreta-ai-settings`, **en claro**
  (compromiso consciente, la UI lo advierte). Parseo defensivo y sincronización
  entre pestañas vía el evento `storage`.
- **Modelos** ([`models.ts`](../src/lib/ai/models.ts)): uno fijo de gama media por
  proveedor — `claude-sonnet-5`, `gpt-5.6-terra`, `gemini-3.5-flash`.
- **Structured output**: cada proveedor lo soporta nativamente, pero con
  **dialectos de JSON Schema distintos**, y de ahí
  [`schemaConvert.ts`](../src/lib/ai/providers/schemaConvert.ts):

  | Proveedor | Dialecto | Conversión |
  |---|---|---|
  | Anthropic | No acepta `type` como array | `type: ['X','null']` → `anyOf: [{type:'X'}, {type:'null'}]` |
  | OpenAI (`strict`) | Acepta `type` array, pero no `null` dentro de `enum` | se elimina `null` de los `enum` |
  | Gemini | Acepta el canónico | ninguna |

  Ambos conversores son **recursivos**: el envelope anida el payload del módulo en
  `proposal.anyOf[0]`, así que convertir solo el primer nivel no basta. No mutan el
  schema de entrada.

  **Límite de Anthropic (módulos grandes NO soportados).** El structured output de
  Anthropic **limita a 16 los parámetros con tipo unión** (`type` array o `anyOf`)
  por «coste de compilación exponencial» (mensaje literal de su API:
  `limit: 16 parameters with unions`). Como el canónico hace anulables TODOS los
  campos (lo exige el `strict` de OpenAI), un módulo con >16 campos (zapatas: 22)
  se rechaza con un `400 invalid_request_error` **inmediato** al usar Anthropic.
  Verificado contra la API real (2026-07-15): el conteo del error coincide EXACTO
  con `countAnthropicUnions` (footing=23, punching=28 → 400; masonry=16,
  composite=16 → **200**), así que **16 es el límite y `>16` el corte**. Los **8
  módulos bloqueados** (>16): pilares HA (22), zapatas (23), punzonamiento (28),
  vigas HA (34), placa (35), micropilotes (36), muro de contención (36), forjados
  (43). Los otros 9 (steel-beams, taludes, encepado, pilares/vigas de madera,
  pilares de acero, empresillado, sección compuesta, muros de fábrica) están en
  ≤16 y **sí van** por Anthropic. **OpenAI y Gemini no tienen el tope** y funcionan
  en todos. Se probó bajar el recuento haciendo los campos OPCIONALES en vez de
  uniones y **NO sirve**: la opcionalidad masiva dispara el MISMO coste
  exponencial, pero Anthropic no la pre-valida, así que en lugar de un 400 rápido
  la petición **cuelga ~90 s**.

  **Degradación (implementada).** `exceedsAnthropicUnionLimit(schema)`
  ([schemaConvert.ts](../src/lib/ai/providers/schemaConvert.ts)) decide si un
  módulo excede. El `AiChatModal`, con Anthropic activo en un módulo grande,
  **deshabilita el asistente** (banner + composer/enviar/guiado bloqueados) y
  remite a OpenAI/Gemini —el selector de proveedor está en el propio modal—, en
  vez de dejar que la petición dé 400 o cuelgue. Como red de seguridad, el
  provider Anthropic también corta con `AiError('schema-too-large')` **antes** de
  importar el SDK y llamar. La única vía que permitiría Anthropic en TODOS los
  módulos sería propuestas DENSAS (todos los campos requeridos y no anulables, el
  modelo repite el estado completo y el cambio se calcula por diff) — un rediseño
  mayor, no un ajuste del conversor.

- **Errores**: cada proveedor normaliza lo suyo a `AiError` con un `kind`
  (`invalid-key`, `rate-limit`, `network`, `bad-response`, `aborted`, `unknown`) que
  la UI traduce a un mensaje en español con botón *Reintentar*.
- **Seguridad**: la API key **nunca** se loguea ni se interpola en un mensaje de
  error (`withoutKey()` la borra de cualquier texto del SDK).
- **Bundle**: los SDK se cargan con *dynamic import* **literal** por rama del
  switch, para que Vite genere un chunk `ai-vendor` separado, fuera del bundle
  principal y **fuera del precache de la PWA**. El resto de la app sigue
  funcionando offline; solo esta función falla, con mensaje claro.

### 8.1. Caché de prompt

El coste de una conversación lo domina la **entrada**, no la salida: cada turno
reenvía el system prompt entero, y sus reglas (~3.100–4.000 tokens) son las
mismas una y otra vez. La caché de prompt existe para no volver a pagarlas.

**La regla que gobierna todo:** en los tres proveedores la caché es un **prefijo
byte a byte**. Solo se reutiliza el tramo inicial que llega idéntico; a partir del
primer byte distinto, nada se cachea. De ahí el `ChatSystem {stable, volatile}`
([types.ts](../src/lib/ai/types.ts)): lo que no cambia va **delante**, lo que
cambia (estado + resultados) va **detrás**. Si el estado se colara antes de las
reglas, la caché no acertaría ni una vez.

| Proveedor | Cómo se activa | Coste |
|---|---|---|
| **Anthropic** | **Explícita**: `cache_control: {type:'ephemeral'}` al final del bloque estable | Lectura 0,1× · escritura 1,25× · TTL 5 min |
| **OpenAI** | **Automática** desde 1.024 tokens — pero desde GPT-5.6 hace falta `prompt_cache_key` (`concreta-<idModulo>`) para que la petición aterrice en la máquina con el prefijo caliente | Lectura descontada · escritura 1,25× |
| **Gemini** | **Implícita**, sin parámetro: cachea sola el prefijo común si supera el umbral del modelo (4.096 tokens en 3.5 Flash) | Lectura ~0,1× |

En Anthropic hay un **segundo breakpoint, y solo si hay imágenes en la ventana**:
marca el último bloque del último turno, con lo que el historial entero (imágenes
incluidas) entra en la caché. Una captura son 1.500–4.500 tokens que se reenvían
en *cada* turno, así que ahí el ahorro es grande. Solo acierta mientras el bloque
volátil no cambie (la caché es un prefijo, y el volátil va antes): en los turnos
de conversación pura sí, en cuanto se aplica una propuesta no. Sin imágenes **no
se pone**: el historial de texto es pequeño y el recargo de escritura (1,25×) se
comería el ahorro.

**Efecto medido** (vigas, conversación de 6 turnos, Sonnet 5 a $3/$15): de
**$0,124 a $0,073 por conversación — un 41% menos**, y el ahorro crece con la
longitud del hilo. Por cada 100 conversaciones, de 12 $ a 7 $.

**Caveat de Gemini:** el umbral de 4.096 tokens deja los módulos con reglas más
cortas (pilares, zapatas) justo al filo, así que ahí la caché implícita puede no
saltar. No hay nada barato que hacer: la caché explícita de Gemini exige crear y
mantener objetos de caché con coste de almacenamiento, que no encaja en una PWA
sin backend.

**Verificarlo:** las tres APIs devuelven el dato en la respuesta —
`usage.cache_read_input_tokens` (Anthropic), `usage.input_tokens_details.cached_tokens`
(OpenAI), `usage.total_cached_tokens` (Gemini). Si sale 0 turno tras turno, algo
variable se ha colado en el bloque estable.

### 8.2. Razonamiento: el mínimo posible en los tres

La caché ataca la mitad de entrada de la factura. La otra mitad es la **salida**, y
ahí hay una trampa: **los tokens de razonamiento se facturan como salida aunque no
se vean**. Un turno cuya respuesta útil son ~200 tokens puede facturar varias veces
eso si el modelo "piensa" antes de contestar, y a precio de salida ($15/M en Terra,
$9/M en Flash).

La tarea del asistente es **extracción estructurada guiada por un prompt muy
explícito**, no razonamiento abierto: las reglas ya están escritas y el esquema
acota la respuesta. Así que los tres piden el mínimo:

| Proveedor | Parámetro | Efecto |
|---|---|---|
| **Anthropic** | `thinking: { type: 'disabled' }` | Apagado |
| **OpenAI** | `reasoning: { effort: 'none' }` | Apagado (`none` es el único valor que lo desactiva del todo) |
| **Gemini** | `thinkingConfig: { thinkingLevel: MINIMAL }` | **Al mínimo, no apagado**: en Gemini 3.x el pensamiento no se puede desactivar (en 2.5 sí, con `thinkingBudget: 0`). MINIMAL es el suelo |

Dos trampas del SDK de Gemini: `thinkingLevel` y el antiguo `thinkingBudget` son
**excluyentes** (mandar los dos es un 400), y `ThinkingLevel` es un enum de
*runtime*, así que se destructura del **dynamic import** — importarlo estático
metería el SDK en el bundle principal y rompería el chunk `ai-vendor`.

Es un **knob**, no dogma: si algún día se ve que el asistente falla en enunciados
retorcidos, subir el esfuerzo es una línea por proveedor. Pero se sube a
sabiendas de lo que cuesta, no por defecto.

---

## 9. Imágenes

El usuario puede adjuntar capturas del enunciado (botón, o **Ctrl+V** en el
composer). [`imagePrep.ts`](../src/lib/ai/imagePrep.ts):

- **3 imágenes por turno** (`MAX_IMAGES`), **6 por petición** (`MAX_REQUEST_IMAGES`).
- Formatos: PNG, JPEG, WebP.
- Por encima de 1.5 MB se recomprime en canvas a JPEG 0.85; lado mayor máximo
  2048 px; límite duro de 4 MB de base64 (margen sobre los 5 MB/imagen de
  Anthropic, el proveedor más restrictivo).
- El `AiImageAttachment` guarda **base64 puro**, sin el prefijo `data:`; el data URL
  se monta solo para la miniatura.

---

## 10. Cancelación, errores y reintento

Patrón `reqId + AbortController` (el mismo de `AiFillModal` y `useSlopeSolver`):

- `reqIdRef` invalida las promesas obsoletas; `AbortController` corta el HTTP en
  vuelo. Ambos se disparan también en el *unmount* del modal.
- **Escape** cancela si hay petición en vuelo; si no, cierra. El clic en el
  backdrop **no** cierra: evita perder la conversación por un clic accidental.
- **Cancelar** retira el turno de usuario recién añadido y **devuelve su texto e
  imágenes al composer**.
- **Reintentar** elimina el ítem de error y relanza **reutilizando el último turno
  user existente** — nunca añade un segundo `user` seguido (`buildChatTurns`
  garantiza la alternancia).

---

## 11. Cómo conectar un módulo nuevo

1. **Escribe el adapter** en `lib/ai/modules/<modulo>.ts`:
   - `payloadSchema`: plano, todo nullable, unidades humanas en las `description`,
     sin `minimum`/`maximum`. Arrays solo como arrays homogéneos de objetos
     planos con REEMPLAZO completo (ver §3); la `description` del array debe
     decir "REEMPLAZA la lista entera".
   - Si el módulo NO recalcula al aplicar (motor manual/asíncrono), declara
     `resultsRecalc: 'manual'` y da al summarize los tres estados (§5).
   - `promptRules`: unidades, conversiones típicas del enunciado, y **qué es dato
     y qué es diseño en este módulo** (el equivalente de la regla 7).
   - `snapshot()`: `{valores, sin_confirmar}` comparando contra los **defaults**
     del módulo. Compara el valor *interno*, no el humano (evita ruido de redondeo).
   - `buildPlan()`: parseo defensivo → rangos → catálogos → `changes` / `skipped`
     (con motivo) / `notFound`, y **`risks` vía `detectSafetyRisks`**.
2. **Declara la tabla `SAFETY_RULES`** del módulo. Si de verdad no hay ningún campo
   que no sea variable de diseño, `[]` — pero piénsalo dos veces. Con arrays de
   DATOS (terreno, cargas), añade las tablas `ElementSafetyRule` y concatena
   `detectElementRisks(...)` a los risks del plan; con enums, `ordinalLevel`
   calibrado con el factor normativo del motor.
3. **Resume los resultados**: `summarize<Modulo>Results(r)` delegando en
   `summarizeCalcResults(r, extraLines)`. Discrimina el cálculo no válido por
   **`error != null`**.
   - **Trampa del `CheckRow` legacy (madera):** `TimberCheckRow` /
     `TimberColumnCheckRow` marcan sus filas informativas con `neutral: true`
     pero les dejan `status: 'ok'`. `summarizeCalcResults` discrimina por
     `status === 'neutral'`, así que sin traducirlo (`status: c.neutral ?
     'neutral' : c.status`) las cabeceras ELU/ELS y las notas de alcance se
     cuentan como comprobaciones CUMPLE y falsean el "N de M fallan". Los dos
     adapters de madera llevan un `toCheckRows()` que lo mapea.
   - **Motores BICÉFALOS (vigas de hormigón, forjados):** devuelven `{vano, apoyo}`
     con sus propios `checks`, no un array plano. El summarize construye un
     `CalcResultLike` sintético concatenando las filas con prefijo (`"Vano: "`,
     `"Apoyo: "`). Dos reglas: **el resumen refleja lo que el usuario VE** (en modo
     "sección simple" de vigas, solo el vano) y la invalidez tiene DOS niveles —el
     `error` global y el de cada sección, que deja `result.valid` en `true`.
   - **Filas informativas que NO son `neutral` (forjados):** los `infoChecks` llevan
     `status: 'ok' | 'warn'`, y la esbeltez L/d puede salir en warn. La UI los
     EXCLUYE del veredicto; si se cuelan en el `checks` del resumen, el prompt
     contradice a la pantalla. Van como `extraLines`.
   - **Motores SIN campo `error` (placas de anclaje):** su `valid:false` significa
     una sola cosa (sin solicitaciones) y encima llega con `overallStatus:'ok'` —
     leerlo como verde sería decir que la placa cumple sin haber comprobado nada.
     Y sus `warnings` de severidad `fail` **vuelcan el veredicto sin ser checks**:
     hay que inyectarlos como `CheckRow` sintéticos o el resumen dirá CUMPLE
     mientras la app dice INCUMPLE.
4. **Conecta el módulo** en su `features/<modulo>/index.tsx`:
   - `const aiResults = useMemo(() => summarize<Modulo>Results(result), [result]);`
   - un `handleAiApply(plan)` que aplique `plan.fields` **en el orden correcto** si
     hay campos que gaten a otros (en pilares, `sectionType` primero: decide si el
     armado es rectangular o en anillo; en vigas, `tipo` antes que `size`).
   - `<AiChatModal adapter={…} current={state} results={aiResults} onApply={…} onClose={…} />`
   - El apply NO tiene por qué ser un bucle de `setField`: sección compuesta
     escribe `plates` entero por `setField('plates', arr)`; micropilotes separa
     `soil` hacia `setSoil` (el adapter tipa sobre el COMBINADO
     `MicropilesAiInputs` y la feature pasa `current={{...state, soil}}`);
     taludes hace `setState({...state, ...plan.fields})`.
5. **Tests**: mapper (rangos, catálogos, conversiones), snapshot, reglas de
   seguridad y resumen de resultados. Mira `mapIsolatedFooting.test.ts` como molde.

---

## 12. Invariantes que no conviene romper

- El system prompt y el snapshot **se reconstruyen en cada turno**. No memoizar
  `current` ni `results`: son props vivas.
- **Nada variable en el bloque `stable` del system.** Es la línea de la caché de
  prompt (§8.1): una sola coma que cambie por turno la invalida entera y el
  ahorro (41%) se va a cero. Todo lo que dependa del estado o de los resultados
  va en `volatile`, que va DETRÁS. El test *"cambiar los resultados NO toca el
  bloque estable"* (`AiChatModal.test.tsx`) es la red que lo caza.
- Los turnos `assistant` viajan al modelo como **envelope JSON crudo verbatim**,
  no como el `reply` renderizado ni como el payload fusionado.
- La ventana de historial se poda **por pares**. Podar por unidades rompe la
  alternancia y Anthropic devuelve 400.
- **La ventana NO es la memoria del hilo**: lo único que persiste turno tras
  turno es la propuesta arrastrada (`pendientes_de_aplicar`). Un módulo de
  entrevista larga necesita que el modelo haga **checkpoint** de lo acordado en
  `proposal` cada turno (regla CHECKPOINT de los FEM); ampliar `historyTurns`
  solo amortigua. Sin checkpoint, los datos confirmados caducan con la ventana
  y el asistente re-pregunta en bucle (el caso OpenAI del 2026-07-21).
- El discriminador de cálculo no válido es **`error != null`**, nunca `valid`.
- **`risks` es requerido** en `AiApplyPlan`, y el interlock **bloquea** el botón
  Aplicar. No degradar a mero aviso.
- La API key **nunca** en logs ni en mensajes de error.
- Los `import()` de los SDK deben ser **literales** por rama del switch, o Vite
  deja de generar el chunk `ai-vendor` y los SDK vuelven al bundle principal.
- El payload es **plano y en unidades humanas**; la conversión a unidades internas
  es responsabilidad exclusiva de `buildPlan`.
- Los **arrays del payload son ATÓMICOS**: reemplazo completo en `buildPlan`, en
  el merge de propuestas pendientes y en el prompt ("reenvía la lista entera").
  Elemento inválido → skip del array ENTERO; ids regenerados; jamás merge
  profundo de elementos.
- `resultsRecalc: 'manual'` no es cosmético: sin él, el prompt AFIRMA que los
  resultados se recalculan solos y el modelo fingirá ver el efecto de lo
  aplicado. Todo módulo con botón "Calcular" debe declararlo.
