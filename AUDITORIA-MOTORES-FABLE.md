# Auditoría de motores de cálculo — Concreta

> Auditoría multi-agente ejecutada con **Fable 5** sobre los 7 motores de cálculo pesados.
> Enfoque: **correctitud numérica** + **conformidad normativa** (CE/CTE/EHE/EC3/EC5/EC8).
> Cada hallazgo fue verificado adversarialmente por un segundo agente Fable que intentó refutarlo.

**Aviso:** hallazgos generados por IA y verificados entre agentes, pero **sin validación numérica contra casos resueltos de norma**. Antes de dar por bueno cada fix, añadir un test-oracle con valor de referencia.

## Resumen

| Métrica | Valor |
|---|---|
| Motores auditados | 7 |
| Hallazgos confirmados | **58** |
| Hallazgos refutados | 3 |
| 🔴 Críticos | 4 |
| 🟠 Altos | 18 |
| 🟡 Medios | 21 |
| 🔵 Bajos | 15 |
| Numéricos | 23 |
| Normativos | 35 |

> **Adenda 2026-06-11:** auditados además los motores de **vigas de hormigón armado** (`rcBeams` + `rcBeamsSection`) y **vigas de acero** (`steelBeams` + `beamCases`/`loadGen`/`iSection`): 16 hallazgos adicionales (3 altos, 6 medios, 7 bajos), numerados 59-74. Ver [Adenda — vigas RC y vigas de acero](#adenda--motores-8-y-9-vigas-rc-y-vigas-de-acero-2026-06-11) al final del documento.
>
> **Adenda 2 (2026-06-11):** auditado el motor de **encepados de micropilotes** (`pileCap`): 13 hallazgos (1 alto, 6 medios, 6 bajos), numerados 75-87. Ver [Adenda 2 — encepados](#adenda-2--motor-10-encepados-de-micropilotes-pilecap-2026-06-11).
>
> **Adenda 3 (2026-06-12):** auditado el motor de **pilares de acero** (`steelColumns` + adapters `chs`/`upnBox`): 11 hallazgos (1 alto, 3 medios, 7 bajos), numerados 88-98. Los adapters CHS y 2UPN verificados **sin errores**. Ver [Adenda 3 — pilares de acero](#adenda-3--motor-11-pilares-de-acero-steelcolumns-2026-06-12).
>
> **Adenda 4 (2026-06-12):** auditado el motor de **sección compuesta de acero** (`compositeSection`): 9 hallazgos (0 altos, 3 medios, 6 bajos), numerados 99-107. El núcleo (Steiner, Wpl/PNA por bandas, clasificación α/ψ con NA desplazada) verificado **correcto** ejecutando el motor real. Ver [Adenda 4 — sección compuesta](#adenda-4--motor-12-sección-compuesta-de-acero-compositesection-2026-06-12).
>
> **Adenda 5 (2026-06-12):** auditado el motor de **vigas de madera** (`timberBeams` + catálogo `timberGrades`): 11 hallazgos (0 altos, 4 medios, 7 bajos), numerados 108-118 — incluida una clase de material **inexistente en la norma** (GL36h). kmod/kdef/γM/βn y las clases C/D verificadas correctas contra EN 338:2016 / EC5 con fuentes. Ver [Adenda 5 — vigas de madera](#adenda-5--motor-13-vigas-de-madera-timberbeams-2026-06-12).
>
> **Adenda 6 (2026-06-12):** auditado el motor de **pilares de madera** (`timberColumns`): 6 hallazgos (0 altos, 3 medios, 3 bajos), numerados 119-124 — incluidos dos FAIL ocultos demostrados ejecutando el motor (excentricidad de fuego a 3 caras y ec. 6.35 omitida) y **los defaults FTUX en rojo** (comb-623 = 1.19). Ver [Adenda 6 — pilares de madera](#adenda-6--motor-14-pilares-de-madera-timbercolumns-2026-06-12).
>
> **Adenda 7 (2026-06-12):** auditado el motor de **empresillado** (`empresillado` + catálogo `angleProfiles`): 7 hallazgos (1 alto, 2 medios, 4 bajos), numerados 125-131 — el alto es la **omisión completa del modelo de segundo orden de EC3 §6.4.1** (pletinas infraalimentadas hasta 25×, flip verde→fail demostrado). Ver [Adenda 7 — empresillado](#adenda-7--motor-15-empresillado-empresillado-2026-06-12).
>
> **Adenda 8 (2026-06-13):** auditados los motores de **punzonamiento** (`punching`) y **cruceta** (`cruceta`): 7 hallazgos (1 alto, 2 medios, 4 bajos), numerados 132-138 — el alto es **β=1.0 para pilar interior** (CE Anejo 19: 1.15 — el FTUX real está al 92%, no al 80%). vRd,max=0.4·ν·fcd verificado **correcto** con fuentes (corrigendum AC2 + CE Anejo 19) y el recorte de cruceta a «compañero de hand-calc» verificado **coherente y sin restos** del antiguo diseñador. Ver [Adenda 8 — punzonamiento y cruceta](#adenda-8--motores-16-17-punzonamiento-y-cruceta-punching--cruceta-2026-06-13).

## Índice de hallazgos confirmados

| # | Sev | Cat | Motor | Título | Ubicación |
|---|---|---|---|---|---|
| 1 | 🔴 critical | norm | anchorPlate | V0Rk,c de edge breakout mezcla k1=1.6 (CEN/TS) con exponentes fijos tipo ACI → resistencia básica ~3× sobreestimada | `src/lib/calculations/anchorPlate.ts:1686-1691 (checkConcreteEdgeBreakout)` |
| 2 | 🔴 critical | num | isolatedFooting | VRd de cortante omite el canto útil d: multiplica vRdc por 1000 en vez de por d | `src/lib/calculations/isolatedFooting.ts:459-460 (bloque de cortante 441-460)` |
| 3 | 🔴 critical | norm | rcSlabs | VRd,max con coeficiente 0.3 (θ=45°) mientras VRd,s usa cotθ=2.5 — biela sobreestimada ×1.45 | `src/lib/calculations/rcSlabs.ts:597-599 (calcForjados, rama stirrupsEnabled)` |
| 4 | 🔴 critical | norm | retainingWall | Comprobación sísmica omite la fuerza de inercia del muro (kh·W) y la componente vertical kv·W | `retainingWall.ts:339-351 (bloque kh > 0)` |
| 5 | 🟠 high | num | anchorPlate | Ac,V no se recorta por el canto del macizo mientras ψh,V amplifica — doble error no conservador en macizos delgados | `src/lib/calculations/anchorPlate.ts:1709-1718 (checkConcreteEdgeBreakout)` |
| 6 | 🟠 high | num | anchorPlate | checkBoltShear y checkBoltInteraction usan el legacy inp.VEd en vez de |V|=hypot(Vx,Vy) | `src/lib/calculations/anchorPlate.ts:1146, 1150 y 1190 (checkBoltShear / checkBoltInteraction)` |
| 7 | 🟠 high | num | anchorPlate | Caso de cortante puro (NEd=Mx=My=0, V≠0): early-return con 0 checks y overallStatus 'ok' | `src/lib/calculations/anchorPlate.ts:1909-1927 (calcAnchorPlate)` |
| 8 | 🟠 high | norm | anchorPlate | Falta la interacción N+V para modos de fallo del HORMIGÓN (EN 1992-4 §7.2.3 / Tab 7.3) | `src/lib/calculations/anchorPlate.ts:1158-1211 (checkBoltInteraction) y lista de checks 1953-1967` |
| 9 | 🟠 high | norm | anchorPlate | No se comprueba la flexión de la placa en el lado de TRACCIÓN (T-stub modos 1/2 con prying, EC3 1-8 §6.2.4) | `src/lib/calculations/anchorPlate.ts:1067-1097 (checkPlateBending) y lista de checks 1953-1967` |
| 10 | 🟠 high | num | isolatedFooting | Núcleo central rectangular en vez de rómbico: σmax subestimada en flexión biaxial dentro de B/6 y L/6 | `src/lib/calculations/isolatedFooting.ts:133-140 (classifyDistribution) y 276-285 (rama trapezoidal de solveStress)` |
| 11 | 🟠 high | norm | masonryWalls | Falta la comprobación del límite de esbeltez λ ≤ 27 (DB-SE-F / EC6 5.5.1.4) | `src/lib/calculations/masonryWalls.ts:1057-1062 (calcularEdificio) y validateState:816-879` |
| 12 | 🟠 high | num | masonryWalls | β de concentración mide la distancia al borde del MURO completo, ignorando huecos (bordes libres del machón) | `src/lib/calculations/masonryWalls.ts:704-708 (betaConcentracion) y 1114-1138 (uso en etaConc)` |
| 13 | 🟠 high | num | micropiles | Momento de inercia del tubo con π/4 en lugar de π/64 (16× mayor) | `src/lib/calculations/micropiles.ts:477 (sección 6, empujes horizontales)` |
| 14 | 🟠 high | norm | micropiles | Granular de compacidad media que atraviesa el NF no penaliza el pandeo (Tabla 3.6) | `src/lib/calculations/micropilesBuckling.ts:116-144 (rama N>=10 && N<30)` |
| 15 | 🟠 high | norm | micropiles | Comprobación de flexión sin interacción con el axil (EC3 §6.2.9.1 omitido) | `src/lib/calculations/micropiles.ts:488-539 (Mpl_rd, im) y check 'bending' líneas 627-635` |
| 16 | 🟠 high | num | rcColumns | Zona gap (NRd_Whitney ≤ NEd < NRd_max): MRd evaluado a un axil inferior al aplicado — capacidad sobreestimada | `src/lib/calculations/rcColumns.ts:108-111 (computeAxis)` |
| 17 | 🟠 high | norm | rcColumns | Método de curvatura nominal sin factor de fluencia Kφ (ni Kr): e2 subestimado para pilares esbeltos | `src/lib/calculations/rcColumns.ts:247-248 y 255-256` |
| 18 | 🟠 high | norm | rcColumns | Longitud de solape: fbd calculada con fctm sin γc y sin factor de solape α6 — solapes hasta ~50% cortos | `src/lib/calculations/rcColumns.ts:295-298` |
| 19 | 🟠 high | norm | rcSlabs | Anclaje: fctd = fctm/1.5 omite el factor 0.7 (fctk,0.05) — lb_rqd un 30% corto | `src/lib/calculations/rcSlabs.ts:36-41 (computeAnchorage)` |
| 20 | 🟠 high | num | rcSlabs | Sección sobrearmada: MRd se calcula con fyd como si el acero plastificara y el check sólo emite 'warn' | `src/lib/calculations/rcSlabs.ts:150-163 y rcTSection.ts:16-22 (solveRectangular)` |
| 21 | 🟠 high | norm | retainingWall | Umbral de vuelco estático FS ≥ 1.5 en lugar del equivalente CTE 1.8/0.9 ≈ 2.0 | `retainingWall.ts:272-277 (check 'vuelco')` |
| 22 | 🟠 high | norm | retainingWall | La sobrecarga variable q se cuenta como acción estabilizadora (peso sobre talón) en vuelco y deslizamiento | `retainingWall.ts:200, 221-231, 244 (W_q_heel)` |
| 23 | 🟡 medium | num | anchorPlate | checkBoltTension comprueba la tracción MEDIA por barra (Ft_total/n_t), no la máxima | `src/lib/calculations/anchorPlate.ts:1930 y 1956 (calcAnchorPlate) + 1107 (checkBoltTension)` |
| 24 | 🟡 medium | norm | anchorPlate | ψh,sp acotada inferiormente a 1.0 — elimina la reducción por canto escaso (h < 2·hef), justo el régimen donde el check aplica | `src/lib/calculations/anchorPlate.ts:1541-1543 (checkSplitting)` |
| 25 | 🟡 medium | num | anchorPlate | ψec,N/ψec,sp: la excentricidad se mide respecto al centro de la placa, no respecto al baricentro del grupo traccionado | `src/lib/calculations/anchorPlate.ts:1395-1402 (checkConcreteCone) y 1546-1553 (checkSplitting)` |
| 26 | 🟡 medium | norm | anchorPlate | Fricción: μ=0.4 para superficie rugosa sin respaldo normativo y Nc,G inflado al resolver con momentos ELU | `src/lib/calculations/anchorPlate.ts:1134, 1188 (μ) y 1947-1951 (Nc_G)` |
| 27 | 🟡 medium | norm | anchorPlate | Longitud de anclaje sin suelo lb,min = max(0.3·lb,rqd; 10φ; 100 mm) | `src/lib/calculations/anchorPlate.ts:1300, 1322 (checkAnchorageLength)` |
| 28 | 🟡 medium | num | anchorPlate | Solver no convergido ('biaxial-grid' / residuos no nulos) no penaliza el veredicto global | `src/lib/calculations/anchorPlate.ts:1929-1973 (calcAnchorPlate) vs anchor-plate/types.ts:196-203` |
| 29 | 🟡 medium | norm | isolatedFooting | Vuelco: momento estabilizador omite el axil N y duplica la seguridad (γ ELU + FS 1.5) | `src/lib/calculations/isolatedFooting.ts:366-374` |
| 30 | 🟡 medium | norm | isolatedFooting | Punzonamiento: β=1.0 con momentos presentes, sin deducción de la reacción del terreno ni comprobación vRd,max en u0 | `src/lib/calculations/isolatedFooting.ts:462-471 y 570` |
| 31 | 🟡 medium | norm | isolatedFooting | Falta la comprobación de anclaje de la armadura (exigida tanto en zapata rígida como flexible) | `src/lib/calculations/isolatedFooting.ts (ausente; bloque de checks 473-606)` |
| 32 | 🟡 medium | norm | masonryWalls | β §5.4 omite el factor (1.5 − 1.1·Ab/Aef) y usa el centro del apoyo en lugar de su borde | `src/lib/calculations/masonryWalls.ts:689-708 (betaConcentracion)` |
| 33 | 🟡 medium | num | masonryWalls | El peso del antepecho bajo ventanas desaparece del modelo de cargas | `src/lib/calculations/masonryWalls.ts:966-967 (g_propio del dintel) y 1180-1204 (emisión de segments a la planta inferior)` |
| 34 | 🟡 medium | num | masonryWalls | El clamp Φ ≥ 0.05 enmascara excentricidad fuera de la sección (e_total ≥ t/2) | `src/lib/calculations/masonryWalls.ts:1061-1062` |
| 35 | 🟡 medium | norm | rcColumns | Umbral fijo λ ≤ 25 para despreciar el 2º orden en lugar de λ_lim = 20·A·B·C/√n — inseguro con axil alto | `src/lib/calculations/rcColumns.ts:248, 256` |
| 36 | 🟡 medium | norm | rcColumns | Separación máxima de cercos basada en 12·Ø_esquina en lugar de Ø_mínimo longitudinal | `src/lib/calculations/rcColumns.ts:539-552` |
| 37 | 🟡 medium | norm | rcSlabs | Comprobación de flecha (ELS) totalmente ausente | `src/lib/calculations/rcSlabs.ts (todo el archivo — calcForjados líneas 296-689)` |
| 38 | 🟡 medium | num | rcSlabs | VRd,c: falta el factor 100 en (100·ρl·fck)^(1/3) — capacidad sin cercos infravalorada ×4.6 | `src/lib/calculations/rcSlabs.ts:579 (calcForjados, cortante)` |
| 39 | 🟡 medium | norm | rcSlabs | As,min geométrica 2.8‰·b·h (cuantía de viga) aplicada a losa maciza — falsos FAIL en losas correctas | `src/lib/calculations/rcSlabs.ts:169-181 (calcSection, MIN REINFORCEMENT)` |
| 40 | 🟡 medium | norm | retainingWall | Fórmula Mononobe-Okabe: el radicando usa sin(φ−θ+δ) en lugar de sin(φ+δ) | `retainingWall.ts:323 (cálculo de KAD)` |
| 41 | 🟡 medium | num | retainingWall | VRd,c: falta el factor 100 en (100·ρl·fck)^(1/3) | `retainingWall.ts:430` |
| 42 | 🟡 medium | num | retainingWall | Excentricidad negativa (resultante hacia el talón) no tratada: σ máxima real en talón sin comprobar y check de excentricidad siempre verde | `retainingWall.ts:245-262, 284-289` |
| 43 | 🟡 medium | norm | retainingWall | El armado del fuste y la zapata solo se dimensiona para la situación persistente; falta la combinación sísmica accidental | `retainingWall.ts:384-634 (bloque estructural)` |
| 44 | 🔵 low | norm | anchorPlate | Ac,N de grupo (cono y pry-out) sin limitar la separación entre barras a s_cr,N | `src/lib/calculations/anchorPlate.ts:1364-1384 (checkConcreteCone) y 1781-1797 (checkConcretePryout)` |
| 45 | 🔵 low | num | isolatedFooting | Inconsistencia documentación/código en el significado de 'cover' (a centroide vs a superficie de barra) | `src/lib/calculations/isolatedFooting.ts:388-389 vs src/data/defaults.ts:535` |
| 46 | 🔵 low | num | masonryWalls | Cargas negativas (tracción) no se detectan: η negativo pasa como CUMPLE | `src/lib/calculations/masonryWalls.ts:1094-1102 y validateState:816-879` |
| 47 | 🔵 low | norm | micropiles | σv' arranca en 0 en la cabeza: se ignora la sobrecarga del terreno sobre el micropilote | `src/lib/calculations/micropiles.ts:242-258 (sigmaV = 0 inicial; bucle de integración)` |
| 48 | 🔵 low | num | micropiles | Peso de la lechada en el arranque sin deducción de empuje hidrostático bajo el NF | `src/lib/calculations/micropiles.ts:453-455 (pulloutCapacity)` |
| 49 | 🔵 low | norm | micropiles | Mpl,Rd y Vpl,Rd citan EC3 §6.2.5/6.2.6 pero usan γ=1.10 en lugar de γM0=1.05 | `src/lib/calculations/micropiles.ts:513 y 516` |
| 50 | 🔵 low | num | micropiles | Clamps silenciosos: Math.max(1, Vpl_rd) en ρ y EL=max(1, módulo) pueden enmascarar entradas degeneradas | `src/lib/calculations/micropiles.ts:534 y 479` |
| 51 | 🔵 low | norm | rcColumns | NRd_max en compresión pura usa fyd en vez de f_yc,d = min(fyd, 400): inconsistente con el propio check as-min-mech | `src/lib/calculations/rcColumns.ts:198` |
| 52 | 🔵 low | norm | rcColumns | Cuantía geométrica mínima 0.003·Ac no coincide con la referencia citada | `src/lib/calculations/rcColumns.ts:427-435` |
| 53 | 🔵 low | num | rcSlabs | Momentos de apoyo introducidos con signo negativo desactivan silenciosamente fisuración y flexión | `src/lib/calculations/rcSlabs.ts:242 (calcSection) y 543-550 (check 'bending' apoyo)` |
| 54 | 🔵 low | norm | rcSlabs | ρw,min = 0.072·√fck/fyk en lugar de 0.08·√fck/fyk | `src/lib/calculations/rcSlabs.ts:620 (calcForjados, cuantía mínima transversal)` |
| 55 | 🔵 low | norm | rcSlabs | wmax = 0.2 mm para XC4 (norma: 0.3 mm) y check de fisuración omitido en XC1 | `src/data/factors.ts:13-18 (wkMax) y rcSlabs.ts:242` |
| 56 | 🔵 low | norm | retainingWall | Empuje pasivo Ep aplicado al 100% del Kp Rankine sin coeficiente de movilización (e inconsistencia con el test de regresión) | `retainingWall.ts:218, 231, 244, 351` |
| 57 | 🔵 low | num | retainingWall | Momento del talón: valor absoluto del neto enmascara el signo (cara traccionada) y mayora con un único γG el neto de efectos opuestos | `retainingWall.ts:508-511, 522-529` |
| 58 | 🔵 low | norm | retainingWall | Caso sísmico con nivel freático: sin amplificación de θ para suelo sumergido ni presión hidrodinámica; kv solo con un signo | `retainingWall.ts:316-336` |

## Detalle de hallazgos confirmados


### 🔴 CRITICAL

#### 1. [anchorPlate] V0Rk,c de edge breakout mezcla k1=1.6 (CEN/TS) con exponentes fijos tipo ACI → resistencia básica ~3× sobreestimada

- **Severidad:** critical  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/anchorPlate.ts:1686-1691 (checkConcreteEdgeBreakout)`
- **ID:** `anchorPlate-01-edge-breakout-formula`

**Descripción**

EN 1992-4:2018 §7.2.2.5 (CE Anejo 11 §7.2.2.4) define V0Rk,c = k9·dnom^α·lf^β·√fck·c1^1.5 con exponentes VARIABLES α=0.1·(lf/c1)^0.5 y β=0.1·(dnom/c1)^0.2 (k9=1.7 fisurado). El código usa exponentes fijos al estilo ACI 318 ((lf/dnom)^0.2·dnom^0.5) pero con k1=1.6 — en ACI ese coeficiente es 0.6. Verificación numérica: para φ16, hef=300 (lf=128), c1=200, C25: código → 1.6·8^0.2·4·5·200^1.5 ≈ 137 kN; EN 1992-4 → 1.7·16^0.08·128^0.06·5·200^1.5 ≈ 40 kN. Sobreestimación ×3.4. Para φ20, c1=150, C30: 109 kN vs 33 kN (×3.3). El modo edge breakout es el que gobierna en placas cerca de borde con cortante: el check sale verde cuando debería fallar con holgura — resultado peligroso.

**Evidencia**

```
const k1 = 1.6;
const alpha_exp = 0.5;
const beta_exp = 0.2;
const lf = Math.min(hef, 8 * dnom);
const V0Rk_N = k1 * Math.pow(lf / dnom, beta_exp) * Math.pow(dnom, alpha_exp) * Math.sqrt(fck) * Math.pow(c1, 1.5);
— Esperado (EN 1992-4 Eq 7.40): V0Rk,c = 1.7·dnom^(0.1·(lf/c1)^0.5)·lf^(0.1·(dnom/c1)^0.2)·√fck·c1^1.5. El k=1.6 de CEN/TS 1992-4-2 va asociado a esos mismos exponentes variables (y fck,cube), nunca a los exponentes fijos (lf/dnom)^0.2·dnom^0.5 cuyo coeficiente en ACI es 0.6.
```

**Fix sugerido**

Sustituir por la fórmula EN 1992-4:2018 Eq (7.40): alpha = 0.1*Math.pow(lf/c1, 0.5); beta = 0.1*Math.pow(dnom/c1, 0.2); V0Rk_N = (inp.concrete_cracked ? 1.7 : 2.4) * Math.pow(dnom, alpha) * Math.pow(lf, beta) * Math.sqrt(fck) * Math.pow(c1, 1.5). Añadir test oracle con valor de referencia manual.

**Razonamiento del verificador**

Verificado de forma independiente leyendo anchorPlate.ts:1683-1691. El fragmento citado es literal y no hay guard/clamp/cap que lo mitigue: V0Rk_N = 1.6·(lf/dnom)^0.2·dnom^0.5·√fck·c1^1.5. Esa estructura de exponentes fijos es la de ACI 318 (Vb), cuyo coeficiente SI es 0.6 (además con cap 3.7·√f'c·ca1^1.5, también omitido); EN 1992-4:2018 / CEN/TS 1992-4-2 usan exponentes VARIABLES α=0.1·(lf/c1)^0.5 y β=0.1·(dnom/c1)^0.2 con k=1.7 (fisurado)/2.4 (no fisurado). El k1=1.6 con exponentes fijos no corresponde a ninguna formulación reconocida. Recomputé ambos ejemplos del auditor y reproducen: φ16/hef300/c1=200/C25 → código 137.2 kN vs EN 40.2 kN (×3.41); φ20/c1=150/C30 → 109 kN vs 32.7 kN (×3.3). Incluso en la lectura más favorable (no fisurado, k9=2.4) la sobreestimación sigue siendo ~2.4×. Aguas abajo nada compensa: Ac_V/Ac_V0 típicamente ≥1, ψ≤1 levemente, γMc=1.5 idéntico en ambas formulaciones. El caso es alcanzable: resolveEdges/resolveShear (líneas 91-136) soportan explícitamente placas cerca de borde (PR8a direccional) y anchorPlate.test.ts:525 ejercita ese escenario; los tests son solo conductuales (no hay oracle numérico de V0Rk,c en anchorPlateOracle.test.ts), por eso la inflación ×3.3 pasó inadvertida. El comentario del propio código (líneas 1647-1649) documenta k1=1.6/α=0.5/β=0.2 como si fuera EN 1992-4 §7.2.2.4, lo cual confirma que es un error de implementación normativa, no una simplificación deliberada cubierta en otro sitio. Defecto real, no conservador ~3.3×, en el modo que gobierna placas cerca de borde con cortante: severidad critical confirmada. El fix propuesto (Eq 7.40 con exponentes variables y k9 1.7/2.4 + test oracle) es correcto.

---

#### 2. [isolatedFooting] VRd de cortante omite el canto útil d: multiplica vRdc por 1000 en vez de por d

- **Severidad:** critical  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/isolatedFooting.ts:459-460 (bloque de cortante 441-460)`
- **ID:** `isolatedFooting-shear-vrd-units-01`

**Descripción**

La resistencia a cortante por metro de ancho debe ser VRd = vRdc [MPa] · d [mm] (en kN/m, porque vRdc·d·1000mm/1000 = vRdc·d). El código hace VRd = vRdc·1000, es decir, sustituye d por 1000 mm. Para un canto útil típico de zapata flexible (d ≈ 300-550 mm) la resistencia queda sobreestimada por un factor 1000/d ≈ 1.8-3.3. Una zapata flexible que realmente falla a cortante (util real >1) puede mostrarse en verde (util mostrada <0.5). Es exactamente el patrón 'verde cuando debería fallar'. El test de zapata flexible (isolatedFooting.test.ts:175-179) solo comprueba la clasificación, no valida VRd, por lo que el bug pasa desapercibido.

**Evidencia**

```
Líneas 444 y 449-460: `const VEd_x = sigma_Ed_uniform * (ell_x / 1000);   // kN/m` ... `const vRdc_x = Math.max((0.18 / 1.5) * k_sh_x * Math.pow(100 * rhoL_x * inp.fck, 1 / 3), 0.035 * Math.pow(k_sh_x, 1.5) * Math.sqrt(inp.fck));` [MPa] ... `const VRd_x = vRdc_x * 1000;` — vRdc está en N/mm²; VRd por metro = vRdc·b·d = vRdc·1000mm·d_x mm /1000 = vRdc·d_x kN/m, no vRdc·1000. Con fck=25, ρ≈0.3%, d=342 mm: vRdc≈0.47 MPa → VRd correcto ≈ 161 kN/m; el código devuelve 470 kN/m (×2.9).
```

**Fix sugerido**

Sustituir `const VRd_x = vRdc_x * 1000;` por `const VRd_x = vRdc_x * d_x;` y `const VRd_y = vRdc_y * 1000;` por `const VRd_y = vRdc_y * d_y;` (kN/m). Añadir un test numérico de cortante con valor de referencia calculado a mano.

**Razonamiento del verificador**

Confirmado leyendo el código. En isolatedFooting.ts:459-460, VRd_x/VRd_y = vRdc·1000, donde vRdc es la tensión resistente EC2 §6.2.2/CE art.44 en MPa (correctamente calculada en 449-458). La capacidad a cortante por metro de ancho es vRdc[N/mm²]·d[mm] = kN/m; multiplicar por la constante 1000 equivale a asumir d=1000 mm, sobreestimando VRd en factor 1000/d (≈2-3.5 para cantos útiles reales de zapata flexible). Intenté refutarlo: (1) ¿comparación de tensiones con ×1000 como MPa→kPa? No: VEd_x = σ·ℓ está en kN/m y ambos lados van a makeCheckQty con quantity 'linearLoad', es comparación fuerza/longitud; además el punzonamiento contiguo (líneas 462-471) sí se hace correctamente como tensión vs tensión, lo que descarta una convención alternativa. (2) ¿Caso alcanzable? Sí: el check es activo si isRigid=false y ell>0; el propio test de zapata flexible (B=L=3, h=0.4, cover=50 → d_x≈342mm) lo activa, y con presiones ELU realistas (200-400 kPa, ℓ≈1m) una utilización real >1 se muestra como ~0.4-0.65 (verde). (3) ¿Lo cubre algún test? No: grep de VRd/cortante en isolatedFooting.test.ts da cero resultados. El ejemplo numérico del auditor (vRdc≈0.47 MPa, d=342 → 161 kN/m correcto vs 470 kN/m del código) es exacto. El fix propuesto (vRdc·d) es correcto. Severidad critical justificada: check de seguridad no conservador con patrón verde-cuando-falla.

---

#### 3. [rcSlabs] VRd,max con coeficiente 0.3 (θ=45°) mientras VRd,s usa cotθ=2.5 — biela sobreestimada ×1.45

- **Severidad:** critical  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcSlabs.ts:597-599 (calcForjados, rama stirrupsEnabled)`
- **ID:** `rcSlabs-vrdmax-01`

**Descripción**

El motor calcula VRd,s con cotθ=2.5 (máximo permitido, maximiza la capacidad de los cercos) pero VRd,max con el coeficiente 0.3·(1−fck/250)·fcd·b·z, que corresponde a θ=45° (ν1/2 = 0.6/2 = 0.3). Con cotθ=2.5 el divisor correcto es (cotθ+tanθ)=2.9, es decir VRd,max = 0.6·(1−fck/250)·fcd·b·z/2.9 ≈ 0.207·(1−fck/250)·fcd·b·z. El código toma simultáneamente el mejor valor de ambas fórmulas, sobreestimando el aplastamiento de biela un 45%. En nervios estrechos (b_w=120 mm, valor por defecto) con cercos, VRd,max gobierna con facilidad: ej. C25, d≈300: VRd,max real ≈ 101 kN, el motor reporta ≈ 146 kN. VEd entre ambos valores da CUMPLE cuando la biela falla — sub-dimensionado peligroso.

**Evidencia**

```
Líneas 597-599: `const cotTheta = 2.5;  VRds = (Asw * z * fyd * cotTheta) / 1000;  VRdmax = (0.3 * (1 - fck / 250) * fcd * bShear * z) / 1000;`. CE Anejo 19 (EC2) §6.2.3 (3): VRd,max = αcw·bw·z·ν1·fcd/(cotθ+tanθ), con ν1=0.6·(1−fck/250). Para cotθ=2.5 el coeficiente debe ser 0.6/2.9≈0.207, no 0.3. (EHE-08 art. 44.2.3.1 da el mismo resultado: Vu1=0.3·f1cd·b0·d sólo es válido para cotθ=1.)
```

**Fix sugerido**

Calcular VRdmax de forma consistente con el cotθ elegido: `const nu1 = 0.6 * (1 - fck / 250); VRdmax = (nu1 * fcd * bShear * z / (cotTheta + 1 / cotTheta)) / 1000;`. Alternativamente, iterar/reducir cotθ cuando VRd,max gobierne.

**Razonamiento del verificador**

Confirmado leyendo rcSlabs.ts:589-617. El código usa cotθ=2.5 para VRds (línea 597-598) pero VRdmax con coeficiente 0.3·(1−fck/250)·fcd·b·z (línea 599), que es la fórmula de EC2 §6.2.3(3) evaluada en θ=45° (ν1/2=0.3). Con cotθ=2.5 el divisor (cotθ+tanθ)=2.9 da coeficiente 0.207, no 0.3 — el método de bielas de inclinación variable exige el mismo θ en ambas fórmulas, y el código toma el mejor valor de cada una. No hay clamp ni guard previo; el mismo VRdmax inflado alimenta tanto VRd=min(VRds,VRdmax) como el check explícito de aplastamiento de biela (líneas 610-617). Intenté refutarlo con la lectura más caritativa (optimización implícita de θ: capacidad real = máx_θ min(VRds(θ),VRdmax(θ))): incluso así el código sobreestima hasta un 25% en el régimen intermedio (intersección en cotθ*∈(1,2.5)), y un 45% frente a la fórmula consistente con cotθ=2.5. Verifiqué los números del auditor (C25, fcd=16.67, b=120, z=270 → código 145.8 kN vs 100.6 kN consistente) y que el caso es alcanzable: todas las tipologías reticulares en src/data/forjadoTipologias.ts usan bWeb=120 mm por defecto, la única validación es bWeb>0, y los tests solo comprueban VRdmax>0 sin verificar su valor. Check ULS no conservador en el lado inseguro en la geometría por defecto: el defecto se sostiene íntegramente.

---

#### 4. [retainingWall] Comprobación sísmica omite la fuerza de inercia del muro (kh·W) y la componente vertical kv·W

- **Severidad:** critical  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `retainingWall.ts:339-351 (bloque kh > 0)`
- **ID:** `retWall-seismic-inertia-01`

**Descripción**

En la situación sísmica, el motor solo añade el incremento de empuje Mononobe-Okabe del relleno, pero omite la fuerza de inercia horizontal del propio muro y del terreno sobre la zapata (F = kh·W), que EC8 parte 5 §7.3.2.2 y NCSP-07 exigen incluir explícitamente en deslizamiento y vuelco. Tampoco aplica (1∓kv) a los pesos estabilizadores (solo al empuje, línea 332). Para kh=0.15 y un muro típico (ΣV≈200 kN/m), la fuerza omitida kh·ΣW≈30 kN/m puede ser del orden del 30-50% del empuje sísmico total, inflando FS_desliz_seis y FS_vuelco_seis y mostrando verde cuando debería fallar.

**Evidencia**

```
Líneas 339-351: `const ΣV_seis = W_fuste + W_zap + W_soil_toe + W_dry_heel + W_wet_heel + W_q_heel + EAV_seis - U_uplift;` y `FS_desliz_seis = EAH_seis > 0 ? (ΣV_seis * inp.mu + Ep) / EAH_seis : Infinity;` — el denominador EAH_seis = EAD_soil·cosδ + EW solo contiene empuje de tierras + agua; falta el término kh·(W_fuste+W_zap+W_heel+W_soil_toe) en las fuerzas deslizantes y su momento (kh·W·z_cdg) en Mo_seis. EC8-5 §7.3.2.2(2): las fuerzas de inercia sobre el muro deben considerarse; NCSP-07 idem para estribos/muros.
```

**Fix sugerido**

Añadir F_inercia = kh·(W_fuste + W_zap + W_soil_toe + W_dry_heel + W_wet_heel) al denominador de FS_desliz_seis y su momento (aplicado en el c.d.g. de cada peso) a Mo_seis; multiplicar los pesos por (1−kv) en ΣV_seis y Mr_seis (y comprobar también el signo +kv si se quiere ser estricto con EC8).

**Razonamiento del verificador**

Confirmado leyendo retainingWall.ts:315-365. El bloque sísmico calcula EAH_seis = EAD_soil·cosδ + EW (línea 335) y FS_desliz_seis = (ΣV_seis·μ + Ep)/EAH_seis (línea 351): no existe ningún término kh·(W_fuste+W_zap+W_dry_heel+W_wet_heel+W_soil_toe) en las fuerzas deslizantes, ni momentos de inercia kh·W·z en Mo_seis (línea 337, solo ΔEAD_H·0.6·H). Tampoco se aplica (1−kv) a los pesos en ΣV_seis/Mr_seis (líneas 339-347); el (1−kv) de la línea 332 afecta solo al empuje M-O, como exige la propia fórmula, no a los pesos. No hay guard ni ruta alternativa que lo cubra: kh solo aparece en la derivación (l.129) y en theta (l.316); seismicUnstable solo trata θ>φ. EC8-5 §7.3.2.2 y NCSP-07 exigen incluir las fuerzas de inercia de la masa del muro, y al usar plano virtual por el talón (KAD sobre H_total con W_heel como estabilizador) el bloque de suelo sobre el talón forma parte de la masa del muro: contarlo como peso estabilizador en ΣV_seis·μ pero omitir su inercia horizontal es además internamente inconsistente. El caso es alcanzable (kh=S·Ab de inputs; tests usan kh=0.1-0.15) y material: con umbral FS≥1.10 (l.353-364), omitir ~kh·ΣV (20-40% del empuje sísmico en zonas Ab≈0.15-0.24) infla FS_desliz_seis y FS_vuelco_seis lo suficiente para mostrar verde donde debería fallar — error no conservador en comprobación de seguridad. Los tests no fijan valores numéricos sísmicos, así que no es una simplificación documentada/intencionada. Matiz menor: el auditor llama "incremento" a EAH_seis cuando es el empuje M-O total (el incremento solo se usa para el brazo del momento), y el efecto kv sobre pesos es de segundo orden; nada de esto invalida el defecto principal.

---


### 🟠 HIGH

#### 5. [anchorPlate] Ac,V no se recorta por el canto del macizo mientras ψh,V amplifica — doble error no conservador en macizos delgados

- **Severidad:** high  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/anchorPlate.ts:1709-1718 (checkConcreteEdgeBreakout)`
- **ID:** `anchorPlate-02-edge-breakout-thin-member`

**Descripción**

En EN 1992-4 la proyección Ac,V sobre la cara lateral tiene altura min(1.5·c1, h); el factor ψh,V=(1.5c1/h)^0.5 ≥ 1 sólo compensa esa reducción de área. El código usa profundidad fija 1.5·c1 sin recortar por h (el comentario dice 'limited by available depth' pero el código no lo hace) Y además aplica ψh,V ≥ 1. Para h = 0.75·c1 (mitad de 1.5c1) la resistencia queda ×2 respecto a la correcta. Se acumula con anchorPlate-01.

**Evidencia**

```
// Depth in line with load: 1.5·c1 (single anchor) o más si grupo profundo,
// limited by available depth before crossing back edge.
const depthInLoad = 1.5 * c1;            // ← sin clamp por pedestal_h
...
const psi_h = h_ped >= 1.5 * c1 ? 1.0 : Math.sqrt((1.5 * c1) / Math.max(h_ped, 1));
— Esperado: Ac,V con altura min(1.5·c1, h) (EN 1992-4 Fig. 7.10); ψh,V ≥ 1 sólo es válido combinado con el área recortada.
```

**Fix sugerido**

const depthInLoad = Math.min(1.5 * c1, inp.pedestal_h); manteniendo ψh,V como está (entonces el par área-recortada + ψh,V reproduce la norma).

**Razonamiento del verificador**

Verificado en anchorPlate.ts:1696-1726. (1) El código es literal: depthInLoad = 1.5*c1 sin clamp por pedestal_h, contradiciendo su propio comentario ('limited by available depth'); no hay guard previo en resolveShear/resolveEdges ni en validación de inputs. (2) Simultáneamente aplica psi_h = sqrt(1.5c1/max(h,1)) ≥ 1 (línea 1718), que en EN 1992-4 §7.2.2 (Fig. 7.10) solo es válido combinado con Ac,V de altura min(1.5c1, h). El factor neto de la norma para h<1.5c1 es sqrt(h/1.5c1)<1; el código produce sqrt(1.5c1/h)>1 — ratio de error 1.5c1/h, exactamente ×2 para h=0.75c1 como calculó el auditor. (3) El caso es alcanzable: pedestal_h es campo libre en la UI sin mínimo ligado a c1 (zapata h=300-400 con c1≥250 es geometría realista) y los tests de edge-breakout no cubren h<1.5c1. El fix propuesto (clamp del depth manteniendo ψh,V) reproduce la norma. Error no conservador en modo de fallo frágil; severidad high se mantiene (no critical porque los defaults no lo disparan y solo afecta macizos delgados).

---

#### 6. [anchorPlate] checkBoltShear y checkBoltInteraction usan el legacy inp.VEd en vez de |V|=hypot(Vx,Vy)

- **Severidad:** high  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/anchorPlate.ts:1146, 1150 y 1190 (checkBoltShear / checkBoltInteraction)`
- **ID:** `anchorPlate-03-steel-shear-ignores-Vy`

**Descripción**

Los checks de hormigón en cortante (edge breakout, pry-out) usan resolveShear() que prioriza Vx/Vy direccionales, pero los checks de ACERO en cortante usan directamente inp.VEd. Si el usuario configura cortante direccional (p.ej. Vx=0, Vy=90 con VEd legacy=0, caso testeado en anchorPlate.test.ts:575-581 para edge breakout), el cortante de acero en barras y la interacción N+V se evalúan con VEd=0 → utilización 0, verde, aunque las barras estén cargadas. Inconsistencia interna entre checks que comparten la misma solicitación.

**Evidencia**

```
L1146: const util = inp.VEd / V_Rd_total_kN;
L1190: const Vbars_kN = Math.max(0, inp.VEd - Vfric_kN);
— mientras checkConcreteEdgeBreakout (L1664) hace const shear = resolveShear(inp) y usa shear.Vmag. resolveShear devuelve Vmag=hypot(Vx,Vy) cuando el usuario configuró Vx/Vy ≠ (VEd, 0).
```

**Fix sugerido**

En ambos checks: const { Vmag } = resolveShear(inp); y usar Vmag en lugar de inp.VEd.

**Razonamiento del verificador**

Confirmado leyendo el código real. checkBoltShear (anchorPlate.ts:1146) y checkBoltInteraction (L1190) usan inp.VEd directamente, mientras checkConcreteEdgeBreakout (L1664) y checkConcretePryout (L1758) usan resolveShear(inp).Vmag = hypot(Vx,Vy), que prioriza Vx/Vy cuando difieren de (VEd,0). No existe clamp ni normalización upstream: calcAnchorPlate pasa inp crudo y validateAnchorPlate no comprueba coherencia VEd↔hypot(Vx,Vy). El caso límite es alcanzable: el propio test anchorPlate.test.ts:570-583 construye VEd=0, Vx=0, Vy=50 como configuración válida, y la UI (AnchorPlateInputs.tsx:396-401) permite editar Vx/Vy sin sincronizar VEd (la sincronización setLegacyVEd solo opera en sentido VEd→Vx/Vy con el toggle OFF). Intenté refutarlo vía el comentario PR8a (L1142-1144, 'cortante escalar aquí') interpretando que VEd es por contrato la magnitud, pero no se sostiene: la convención del repo (tests) es desactivar VEd al usar direccional y resolveShear está diseñado para que Vx/Vy prevalezcan. Resultado: con cortante direccional el cortante de acero en barras y la interacción N+V (EN 1992-4 §7.2.1.3 y §7.2.3, donde la solicitación correcta para acero es |V|) se evalúan con VEd obsoleto o nulo → utilización subestimada, no conservador. El fix propuesto (usar resolveShear(inp).Vmag en ambos checks) es correcto. Severidad high apropiada: defecto numérico no conservador, aunque limitado a usuarios del modo direccional avanzado.

---

#### 7. [anchorPlate] Caso de cortante puro (NEd=Mx=My=0, V≠0): early-return con 0 checks y overallStatus 'ok'

- **Severidad:** high  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/anchorPlate.ts:1909-1927 (calcAnchorPlate)`
- **ID:** `anchorPlate-05-pure-shear-no-checks`

**Descripción**

La validez se decide sólo con NEd/Mx/My, ignorando VEd/Vx/Vy. Una placa de anclaje de arriostramiento horizontal (caso real: nudos de cruces de San Andrés a zócalo) con sólo cortante devuelve checks=[], worstUtil=0 y overallStatus='ok' — verde sin haber comprobado cortante de acero, fricción, edge breakout ni pry-out. El test anchorPlate.test.ts:15 ('result invalid when NEd=Mx=My=0') consolida este comportamiento sin contemplar V.

**Evidencia**

```
const valid = !(inp.NEd === 0 && inp.Mx === 0 && inp.My === 0);
if (!valid) { ... return { ..., checks: [], worstUtil: 0, overallStatus: 'ok', ... }; }
— VEd, Vx, Vy no participan en la condición.
```

**Fix sugerido**

Incluir el cortante: const { Vmag } = resolveShear(inp); const valid = !(inp.NEd === 0 && inp.Mx === 0 && inp.My === 0 && Vmag === 0); y con N=M=0 pero V≠0 ejecutar al menos los checks de cortante (con Nc=0, sin fricción).

**Razonamiento del verificador**

Confirmado leyendo el código. (1) El fragmento es literal: anchorPlate.ts:1909 decide validez solo con NEd/Mx/My y el early-return devuelve checks=[], worstUtil=0, overallStatus='ok' ignorando VEd/Vx/Vy. (2) No hay guard previo: validateAnchorPlate solo valida geometría/materiales, nunca cargas; el adapter es mapeo puro. El caso N=M=0, V≠0 es alcanzable. (3) Los checks de cortante saltados existen y son ejecutables con Nc=0 (checkBoltShear usa Vbars=max(0,VEd−Vfric); edge breakout y pry-out usan resolveShear), exigidos por CE Anejo 11 / EN 1992-4 §7.2.2.3-7.2.2.5 cuando V≠0 — el fix propuesto es viable. (4) Evidencia agravante: la propia UI (AnchorPlateResults.tsx:117) promete que «NEd, Mx, My o VEd» activa el cálculo, contradiciendo al motor — el usuario con solo VEd ve «SIN DATOS» pese a haber introducido esfuerzo. (5) El PDF (src/lib/pdf/anchorPlate.ts:412-429) imprime «VEREDICTO GLOBAL: OK (utilización máx 0.0%)» sin comprobar result.valid, mientras lista VEd≠0 en la tabla de cargas (línea 116), y el comentario PR9 declara el PDF «firmable como memoria de cálculo defendible» — falso pase exportable. (6) El test anchorPlate.test.ts:14-20 consolida el bug: fija valid=false con NEd=Mx=My=0 pero VEd=50 heredado de defaults. Única mitigación: la UI interactiva muestra estado neutro «SIN DATOS» (no verde), lo que reduce pero no elimina el riesgo dado el camino PDF. Severidad high se mantiene.

---

#### 8. [anchorPlate] Falta la interacción N+V para modos de fallo del HORMIGÓN (EN 1992-4 §7.2.3 / Tab 7.3)

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/anchorPlate.ts:1158-1211 (checkBoltInteraction) y lista de checks 1953-1967`
- **ID:** `anchorPlate-06-missing-concrete-nv-interaction`

**Descripción**

Sólo se implementa la interacción dúctil de acero (N/NRd,s)²+(V/VRd,s)² ≤ 1. EN 1992-4 §7.2.3.2 exige además, cuando gobiernan modos de hormigón, (NEd/NRd,c)^1.5 + (VEd/VRd,c)^1.5 ≤ 1 (o la alternativa k15). El propio comentario lo reconoce como TODO ('Para fallo frágil... no implementado aquí'). Caso común: placa con N+M+V cerca de borde con cono al 0.85 y edge breakout al 0.85 — ambos verdes individualmente, pero la interacción da 0.85^1.5·2 = 1.57 > 1 → debería fallar. Es una comprobación que la norma exige y el motor omite por completo.

**Evidencia**

```
// Para fallo frágil (concrete gobierna), la norma usa exponente 1 — no implementado aquí,
// queda como TODO si se detecta hef muy somero o concrete-edge gobernando. (L1174-1176)
— Esperado: EN 1992-4 §7.2.3.2 (CE Anejo 11 §7.2.3): para modos de hormigón, (NEd/NRd)^1.5 + (VEd/VRd)^1.5 ≤ 1 combinando los modos pésimos de tracción (cono/splitting/pull-out) y cortante (edge/pry-out).
```

**Fix sugerido**

Añadir un check 'concrete-interaction' que tome la peor utilización de los modos de hormigón en N (cono, splitting, pull-out) y en V (edge breakout, pry-out) y evalúe util = utilN^1.5 + utilV^1.5.

**Razonamiento del verificador**

Confirmado tras intentar refutarlo. (1) El código en anchorPlate.ts L1177-1211 (checkBoltInteraction) implementa únicamente la interacción dúctil de acero (N/NRd,s)²+(V/VRd,s)² con resistencias de acero de la barra, y el comentario en L1173-1176 admite explícitamente que la interacción para fallo frágil (hormigón gobernando) "no implementado aquí, queda como TODO". (2) Grep exhaustivo de src/lib/calculations: no existe ninguna interacción N+V de hormigón en ningún otro punto; la lista de checks de calcAnchorPlate (L1953-1967) incluye los modos de hormigón individuales (concrete-cone, concrete-edge, concrete-pryout, concrete-breakout-v, pullout, splitting) pero ningún check combinado, y worstUtil (L1969) es solo el máximo de utilizaciones individuales. (3) La exigencia normativa es real: EN 1992-4 §7.2.3.2 / Tab 7.3 (CE Anejo 11 §7.2.3) requiere (NEd/NRd,i)^1.5+(VEd/VRd,i)^1.5 ≤ 1 (o la alternativa lineal con límite 1.2) combinando las ratios pésimas de los modos de hormigón en tracción y cortante; el propio motor implementa esos modos como checks vivos que pueden gobernar, luego no puede ampararse en un supuesto diseño exclusivamente dúctil. (4) El caso límite es alcanzable: validateAnchorPlate solo emite warnings (no bloquea) para distancias al borde pequeñas; una placa cerca de borde con N+M+V puede dar cono 0.85 y edge breakout 0.85 (ambos verdes) cuando la interacción exigida da 2·0.85^1.5 ≈ 1.57 > 1 → el motor reporta "ok" en un caso que la norma obliga a rechazar (lado inseguro). Ningún test cubre esta interacción. Detalle adicional: el comentario del código incluso cita mal la norma ("exponente 1" en vez de 1.5), confirmando que es un gap conocido y sin resolver. Severidad high se mantiene: comprobación obligatoria omitida con resultado no conservador, aunque no critical porque los modos individuales sí se verifican y acotan el error.

---

#### 9. [anchorPlate] No se comprueba la flexión de la placa en el lado de TRACCIÓN (T-stub modos 1/2 con prying, EC3 1-8 §6.2.4)

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/anchorPlate.ts:1067-1097 (checkPlateBending) y lista de checks 1953-1967`
- **ID:** `anchorPlate-07-missing-tension-tstub`

**Descripción**

checkPlateBending sólo evalúa el voladizo COMPRIMIDO bajo fjd. En el lado traccionado, CE Anejo 18 / EC3 1-8 §6.2.4 Tabla 6.2 exige comprobar el T-stub equivalente: modo 1 (plastificación de placa), modo 2 (placa + barras con prying) y modo 3 (rotura de barras). El motor sólo cubre el modo 3 (checkBoltTension). Una placa delgada (p.ej. t=10 mm) con barras φ25 B500S pasa bolt-tension y plate-bending (lado comprimido, voladizo corto) pero en realidad falla por plastificación de la placa alrededor de las barras traccionadas, con fuerzas de prying que además incrementan la tracción real de la barra. Sub-dimensionado en el caso típico momento-dominante.

**Evidencia**

```
Lista completa de checks (L1953-1967): plate-compression, plate-bending (sólo voladizo comprimido: m_Ed = fjd·c_eff²/2, L1082), bolt-tension (sólo As·fyd), bolt-shear, bolt-interaction, anchorage-length, concrete-cone, edge-breakout, pryout, breakout-v, pullout, splitting, stiffener. No existe ningún check de leff/FT,1,Rd/FT,2,Rd del lado tracción.
— Esperado: EC3 1-8 §6.2.4 / CE Anejo 18: FT,Rd = min(modo 1: 4·Mpl,Rd/m; modo 2: (2·Mpl,Rd + n·ΣFt,Rd)/(m+n); modo 3: ΣFt,Rd) con leff por patrones de líneas de rotura.
```

**Fix sugerido**

Añadir check T-stub de tracción: calcular m (distancia barra-alma/ala), leff (mín. de patrones circulares/no-circulares), Mpl,Rd = 0.25·leff·t²·fyd y comparar Ft del grupo traccionado contra min(modo1, modo2, modo3).

**Razonamiento del verificador**

Confirmado tras lectura independiente. (1) checkPlateBending (anchorPlate.ts L1067-1097) sólo evalúa el voladizo del lado COMPRIMIDO bajo fjd (m_Ed = fjd·c_eff²/2, art. citado §6.2.5); no hay ningún guard ni clamp aguas arriba que cubra el lado traccionado. (2) checkBoltTension (L1100-1117) sólo comprueba Ft ≤ As·fyd/γs — exactamente el modo 3 del T-stub. (3) La lista de checks de calcAnchorPlate (L1953-1967) coincide con la enumeración del auditor: ningún check calcula leff, Mpl,Rd = t²·fy/(4γM0) ni FT,1,Rd/FT,2,Rd. Grep exhaustivo en src/lib/calculations por prying/leff/FT1/Mpl/T-stub confirma que no existe lógica de T-stub a tracción en ningún módulo; ec3BasePlate.ts sólo contiene primitivas de compresión (βj, fjd, voladizo efectivo, Kj), y tStubEffectiveArea es el T-stub de COMPRESIÓN (§6.2.5(3)-(5)). El solver (L514-533) reparte Ft lineal capado a FtRd sin amplificación por prying ni tope por flexión de placa. (4) El caso límite es alcanzable: validateAnchorPlate sólo emite 'warn' (no 'fail') para plate_t<8 mm, así que t=10 mm con φ25 B500S es input válido que pasa todos los checks actuales mientras EC3 1-8 §6.2.4 Tabla 6.2 / CE Anejo 18 (vía §6.2.6.12, placa base a flexión + pernos a tracción) exigiría min(modo1, modo2, modo3) y el modo 1 gobernaría muy por debajo de FtRd — sub-dimensionado no conservador en el caso típico momento-dominante. Único matiz: para barras embebidas con longitud de alargamiento larga (Lb>Lb*) el prying puede no desarrollarse y los modos 1-2 colapsan a 2·Mpl,Rd/m sin amplificar la barra; eso suaviza la afirmación del auditor sobre el incremento de tracción por prying, pero la comprobación de plastificación de placa sigue siendo obligatoria y está ausente, así que el defecto se sostiene igualmente. Severidad high apropiada: omisión normativa con resultado inseguro en configuración realista, mitigada parcialmente porque la mayoría de placas prácticas (t≥15-20 mm) no estarán gobernadas por modo 1.

---

#### 10. [isolatedFooting] Núcleo central rectangular en vez de rómbico: σmax subestimada en flexión biaxial dentro de B/6 y L/6

- **Severidad:** high  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/isolatedFooting.ts:133-140 (classifyDistribution) y 276-285 (rama trapezoidal de solveStress)`
- **ID:** `isolatedFooting-biaxial-kern-02`

**Descripción**

El núcleo central de un rectángulo es un rombo: hay contacto pleno solo si ex/B + ey/L ≤ 1/6. El código clasifica como 'trapezoidal' cuando ex ≤ B/6 Y ey ≤ L/6 por separado (condición rectangular). Para p.ej. ex = B/8 y ey = L/8 (ambas dentro de los límites individuales pero ex/B+ey/L = 0.25 > 1/6), σmin lineal = σc(1 − 0.75 − 0.75) < 0: hay despegue real, la fórmula de contacto pleno ya no equilibra y σmax real es mayor que el valor lineal calculado. El `Math.max(sigma_min, 0)` de la línea 282 enmascara el síntoma (σmin negativo) sin corregir σmax, de modo que la comprobación de hundimiento (σmax ≤ σadm) queda del lado inseguro en un caso biaxial común. Adicionalmente, la rama 'bitriangular_uniaxial' (294-304) ignora por completo la excentricidad secundaria (puede ser hasta B/6 o L/6), subestimando también σmax.

**Evidencia**

```
Líneas 137-139: `if (!overX && !overY) return 'trapezoidal'; if (overX && overY) return 'bitriangular_biaxial';` — condición rectangular; la condición correcta de contacto pleno es ex/B + ey/L ≤ 1/6. Línea 282: `sigma_min: Math.max(sigma_min, 0)` clampa el σmin negativo que delata el despegue. Líneas 297/302: `sigma_max = (2 * N) / (3 * L * (B / 2 - ex))` usa solo la excentricidad dominante.
```

**Fix sugerido**

En classifyDistribution, usar la condición del rombo: contacto pleno solo si ex/B + ey/L ≤ 1/6. Si se supera el rombo con ambas excentricidades no nulas, resolver con el Newton-Raphson biaxial existente (que ya maneja contacto parcial general); reservar la fórmula de Meyerhof uniaxial para el caso con la excentricidad secundaria estrictamente nula (o despreciable).

**Razonamiento del verificador**

Confirmado tras intentar refutarlo. (1) classifyDistribution (líneas 133-140) usa la condición rectangular (ex ≤ B/6 Y ey ≤ L/6) cuando el núcleo central de un rectángulo es el rombo ex/B + ey/L ≤ 1/6 — esto se deduce de la propia fórmula del código: σmin = (N/A)(1 − 6ex/B − 6ey/L) ≥ 0 ⇔ ex/B + ey/L ≤ 1/6. (2) Para ex=B/8, ey=L/8 (alcanzable: ex_sls/ey_sls se derivan de Mx/My sin restricción salvo B/2, L/2) la rama trapezoidal calcula σmin = −0.5σc, que la línea 282 clampa a 0 con Math.max(sigma_min, 0), ocultando el despegue sin recomputar σmax; el σmax lineal (2.5σc) subestima el real de contacto parcial y loaded_area_fraction=1.0 también es falso. La comprobación de hundimiento (línea 363, CTE DB-SE-C 4.4.1) queda del lado inseguro. (3) La rama bitriangular_uniaxial (294-304) ignora por completo la excentricidad secundaria (hasta B/6 o L/6), subestimando también σmax. No hay guard aguas arriba ni otra comprobación que cubra el caso (el área eficaz Meyerhof solo se usa en ELU armado, no en bearing); los tests no ejercitan la región de esquina del kern; el comentario de cabecera documenta la condición rectangular como intención, pero contradice la mecánica de su propia fórmula. El fix propuesto es viable: solveBiaxialNR ya resuelve contacto parcial general y parte de la solución trapezoidal como semilla, por lo que converge bien justo fuera del rombo. Severidad high se mantiene: error no conservador en la verificación geotécnica principal para un caso biaxial común, con subestimación que crece al alejarse del rombo (~15-30%+ en ex=ey=B/8).

---

#### 11. [masonryWalls] Falta la comprobación del límite de esbeltez λ ≤ 27 (DB-SE-F / EC6 5.5.1.4)

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/masonryWalls.ts:1057-1062 (calcularEdificio) y validateState:816-879`
- **ID:** `masonryWalls-01`

**Descripción**

CTE DB-SE-F (y EC6 §5.5.1.4) imponen h_ef/t ≤ 27 como límite absoluto de esbeltez de muros: por encima, el muro no es apto independientemente del axil. El motor calcula lambda = h_ef/t pero nunca lo compara con 27; solo degrada Φ linealmente con (1−(λ−10)/30), que llega a 0 en λ=40 y luego se clava en Φ=0.05. Un muro con λ=30 (factor 0.33) poco cargado puede salir 'CUMPLE' cuando la norma lo prohíbe directamente. El propio comentario S1 (línea 58) reconoce que 'λ ≤ 27 se chequea aparte' en la fórmula simplificada del CTE, pero ese chequeo no existe en ningún punto del código.

**Evidencia**

```
Línea 1057: `const lambda = h_ef / t;` — y línea 1061: `const phi_unif = (1 - 2 * e_total / t) * (lambda > 10 ? Math.max(0, 1 - (lambda - 10) / 30) : 1.0);`. No hay ningún `if (lambda > 27)` en todo el archivo. Norma esperada: DB-SE-F §5.2.4 / EC6 5.5.1.4: h_ef/t_ef ≤ 27, comprobación obligatoria previa a la de capacidad.
```

**Fix sugerido**

Añadir en el loop por planta: si lambda > 27, devolver EdificioInvalid (o como mínimo forzar status='fail' en todos los machones de esa planta con motivo 'esbeltez λ > 27 — DB-SE-F §5.2.4') y reflejarlo en el PDF.

**Razonamiento del verificador**

Confirmado con matiz. El motor (masonryWalls.ts) calcula lambda=h_ef/t (línea 1057) y solo lo usa para degradar Φ linealmente con clamp en 0.05 (líneas 1061-1062); no existe ningún `if (lambda > 27)` en el motor: ni el status por machón (1143-1145, solo etaMax), ni overallStatus() (1255+, solo etaMax), ni validateState (816-879: solo plantas>0, t>=50, L>=200, γM>0, fk>0) consideran la esbeltez. El caso límite es alcanzable (t=115mm, H=3.5m, ρ_n=1.0 → λ=30.4 pasa toda la validación; con poca carga η<0.8 → veredicto CUMPLE). La exigencia normativa es real: DB-SE-F §5.2.4 / EC6 §5.5.1.4 imponen h_ef/t ≤ 27 como límite de aplicabilidad independiente del axil, y el propio comentario S1 (línea 58) lo reconoce sin implementarlo. MATIZ que el auditor erró: el chequeo λ<27 SÍ existe en dos capas de presentación — UI MasonryWallsResults.tsx:98-108 (CheckRow 'Pandeo' con limit '27', status fail si λ≥27) y PDF masonryWalls.ts:744,757 (imprime '>= 27 (INCUMPLE)' en el bloque §5.2.4) — por lo que la frase 'no existe en ningún punto del código' es exagerada. Pero ninguna de esas capas alimenta el veredicto: la portada del PDF ('VEREDICTO EDIFICIO', línea 165-175) y el badge de la UI usan overallStatus(), produciendo un PDF internamente contradictorio (portada CUMPLE, detalle INCUMPLE). Además, el CheckRow de la UI solo refleja la planta del machón mostrado: si la planta con λ>27 no contiene el machón crítico por η, el fallo es invisible por defecto. No hay ningún test de λ≥27. El defecto de fondo (el veredicto y el status del motor no se cierran con λ>27) se sostiene; severidad high apropiada por el riesgo en documento firmable, ligeramente mitigada por los indicadores visibles en UI y detalle del PDF.

---

#### 12. [masonryWalls] β de concentración mide la distancia al borde del MURO completo, ignorando huecos (bordes libres del machón)

- **Severidad:** high  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/masonryWalls.ts:704-708 (betaConcentracion) y 1114-1138 (uso en etaConc)`
- **ID:** `masonryWalls-03`

**Descripción**

betaConcentracion calcula a = min(x_carga, L − x_carga), es decir, distancia a los extremos del muro completo. Pero los huecos crean bordes libres intermedios: una carga puntual apoyada junto al borde de una puerta o ventana (caso muy común: viga que apoya en el machón junto a un hueco) no tiene confinamiento lateral por ese lado, igual que en el extremo del muro. Ejemplo con el state por defecto (L=6000, puerta 2500-3400, H=3000): puntual en x=2450 → a = min(2450, 3550) = 2450 → β = 1 + 0.3·(2450/3000) ≈ 1.25, cuando físicamente el borde libre está a 50 mm y correspondería β ≈ 1.0. etaConc = σ/(β·f_d) queda subestimado ~20-33%, en el lado inseguro, precisamente en el escenario que motiva la comprobación §5.4 (viga sobre machón estrecho).

**Evidencia**

```
Línea 705: `const a = Math.min(x_carga, Math.max(0, L_muro - x_carga));` — L_muro es el muro completo, no el machón. En el uso (línea 1120): `const beta = betaConcentracion(p.x, L, pl.H);` se pasa L global aunque el puntual está confinado al machón [m.x1, m.x2]. CTE DB-SE-F §5.4 / EC6 6.1.3: a1 es la distancia del extremo del muro (cualquier borde libre, incluidos huecos) al borde del área cargada.
```

**Fix sugerido**

Pasar los límites del machón a betaConcentracion y calcular a = min(x_carga − m.x1, m.x2 − x_carga) (descontando además b_apoyo/2 para medir al borde del área cargada, no a su centro). Aplicar lo mismo en la rama de concentradas heredadas (línea 1136).

**Razonamiento del verificador**

Confirmado leyendo el código. Línea 705: a = min(x_carga, L_muro − x_carga) mide la distancia a los extremos del muro completo; en los dos usos (líneas 1120 y 1136) se pasa la L global pese a que ambas llamadas están dentro del map de machones con m.x1/m.x2 disponibles y P_directos ya filtrado al intervalo del machón. No existe guard/clamp que cubra los bordes libres creados por huecos (el único clamp cercano, b_efectivo=min(b_apoyo, m.ancho) en línea 1118, afecta a σ_loc, no a β). El propio docstring (líneas 700-702) declara que la β variable se introdujo para cargas 'cercanas al borde o al hueco', confirmando que la intención era medir al borde libre del machón y la implementación no lo hace. Los tests solo cubren extremos del muro (x=0, centrada, H=0), nunca una carga junto a un hueco. Normativamente, EC6 6.1.3 / DB-SE-F §5.4 definen a1 como distancia desde el extremo del muro (cualquier borde libre) al borde del área cargada; un hueco crea un borde libre sin confinamiento lateral, por lo que medir al extremo global del muro sobreestima β y subestima etaConc en el lado inseguro. El caso es alcanzable e incluso activo en el estado por defecto: la puntual default en x=1900 está a 200 mm de la ventana (800-1700) → β correcta ≈1.02, pero el código calcula a=1900 → β≈1.19 (~14% inseguro); el ejemplo del auditor (x=2450, β=1.245 vs ≈1.0, ~20%) también es válido. No hay validación de inputs que impida puntuales junto a huecos. Severidad 'high' se mantiene: error en lado inseguro en el escenario exacto que motiva §5.4 (viga sobre machón estrecho), aunque acotado (β≤1.5 ⇒ sobreestimación de capacidad ≤33%) y limitado a la comprobación local etaConc.

---

#### 13. [micropiles] Momento de inercia del tubo con π/4 en lugar de π/64 (16× mayor)

- **Severidad:** high  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/micropiles.ts:477 (sección 6, empujes horizontales)`
- **ID:** `micropiles-inertia-01`

**Descripción**

La inercia de una sección anular es I = (π/64)·(de⁴ − di⁴); el código usa π/4, inflándola ×16. Como Le = (3·Ea·Ia/EL)^0.25, Le y Lef salen exactamente el DOBLE de lo que da la fórmula con I correcta (FTUX: Le=0.44 m en vez de 0.22 m — el test de la línea 1090 fija el valor erróneo como oráculo). Consecuencias: (a) con cortante en cabeza MEd = (Md + V·Lef)·me se duplica aprox. (conservador, sobredimensiona); (b) con momento puro (V=0) en pilotes cortos el L/Le artificialmente bajo reduce me (Tabla 3.9, p.ej. 0.85→0.76) y MEd = Md·me sale MENOR que el real → inconservador hasta ~11%; (c) Le/Lef se reportan al proyectista como longitudes de empotramiento ficticio erróneas. Secundario: Ia usa de/di brutos, no la sección post-corrosión que se usa para el resto de resistencias.

**Evidencia**

```
Línea 477: `const Ia = (Math.PI / 4) * (Math.pow(de, 4) - Math.pow(di, 4)) / 1e12;    // m⁴` con el comentario línea 476 «Ia: momento de inercia del tubo (m⁴)». La inercia de un tubo circular hueco es π/64·(de⁴−di⁴), no π/4 (π/4 es el factor del ÁREA, no de la inercia). Verificación: con Ø88,9×9 la fórmula del código da Ia=2.92e-5 m⁴ y Le=0.438 m (coincide con el comentario del test «Le ≈ 0.44 m»); con I correcta (1.83e-6 m⁴) Le=0.219 m.
```

**Fix sugerido**

Cambiar a `const Ia = (Math.PI / 64) * (Math.pow(de, 4) - Math.pow(di, 4)) / 1e12;` (idealmente con deNet/di post-corrosión), recalibrar los oráculos de test que dependen de Le/Lef (líneas 532, 1059, 1090-1092 del test) y revisar contra el ejemplo de la Guía §3.7 si el factor 3 dentro de la raíz cuarta es el de la fórmula oficial de longitud elástica.

**Razonamiento del verificador**

Confirmado tras intentar refutarlo. (1) La línea 477 dice literalmente `(Math.PI / 4) * (de⁴ − di⁴) / 1e12` bajo el comentario «momento de inercia del tubo (m⁴)»: π/4 con cuartas potencias no es ni el área (π/4 con cuadrados) ni la inercia (π/64), infla I exactamente ×16. (2) El propio código demuestra la convención correcta: la línea 511 calcula Wel = π(deNet⁴−di⁴)/(32·deNet), que implica I = π/64(de⁴−di⁴) — verificado numéricamente (Wel·de/2 = 1.8257e6 mm⁴ = π/64·Δd⁴ exacto). Es un desliz aislado, no una convención deliberada. (3) Reproducción numérica idéntica a la del auditor: para Ø88,9×9, Le_código=0.4380 m vs Le_correcto=0.2190 m (ratio 2.0 = 16^0.25), coincidiendo con el comentario del test «Le ≈ 0.44 m» (línea 1090), que fija el valor erróneo como oráculo. (4) El caso inconservador es alcanzable: la validación solo exige tipDepth > headDepth (sin mínimo de L), baseMoment es input libre y baseShear puede ser 0; con V=0 y pilote corto, el L/Le artificialmente bajo reduce me (Tabla 3.9) y MEd = Md·me sale menor que el real (~9-11%). Para pilotes largos con cortante el error es conservador, pero Le/Lef se exponen en el resultado como longitudes de empotramiento ficticio duplicadas en todos los casos. (5) El punto secundario (Ia con de bruto en vez de deNet post-corrosión, mientras Mpl/Vpl usan deNet) también es una inconsistencia real aunque menor. No existe ningún guard, clamp ni factor compensatorio entre la línea 477 y sus usos (Le, Lef, me, MEd). Severidad high se mantiene: error numérico ×16 en una comprobación normativa con rama inconservadora alcanzable y tests que blindan el bug.

---

#### 14. [micropiles] Granular de compacidad media que atraviesa el NF no penaliza el pandeo (Tabla 3.6)

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/micropilesBuckling.ts:116-144 (rama N>=10 && N<30)`
- **ID:** `buckling-mediumSand-NF-01`

**Descripción**

Para granular media (10≤N<30, Cu<2) el código solo activa la fila CR 8…7 de la Tabla 3.6 si el tramo está ÍNTEGRO sobre el NF (`fullyAboveNF`). Si la capa cruza el freático — caso muy común: NF dentro de una arena media potente — `fullyAboveNF=false` y no se añade ningún candidato: R=1 y Nc_rd queda SIN la reducción ~13-15% (R≈0.85-0.87) que la Tabla 3.6 exige para la porción permanentemente sobre el NF. Es inconsistente con la propia rama de arena floja (líneas 153-171), donde tras el eng-review de 2026-06-02 sí se PARTE el tramo por el NF. Resultado: tope estructural a compresión sobreestimado (verde cuando debería reducirse) en un perfil habitual.

**Evidencia**

```
Líneas 117 y 131: `const fullyAboveNF = segBase <= nfDepth + 1e-9;` … `if (fullyAboveNF || cuGe2) { … candidates.push({ cr, … }) } else { info(… 'no penaliza (bajo NF y Cu<2…)') }`. Una capa con segTop<nfDepth<segBase cae en el else y no penaliza nada, pese a que su porción superior está permanentemente sobre el NF (fila «suelos granulares de compacidad media sobre el nivel freático», Tabla 3.6 Guía Fomento). Contraste con líneas 153-164, donde la arena floja sí se parte: `const hSat = Math.max(0, segBase - Math.max(segTop, nfDepth));`.
```

**Fix sugerido**

Replicar el split por NF de la rama floja: calcular hDry = porción sobre NF y, si hDry>0 (o Cu≥2 para todo el espesor), añadir el candidato CR=lerp(I_D,0.35,0.65,8,7) aunque la capa cruce el freático; dejar nota 'atraviesa NF' en hypotheses. Añadir test oracle: arena media N=20, NF a mitad de capa → CR=7.50, R=0.8675.

**Razonamiento del verificador**

Confirmado leyendo el código. micropilesBuckling.ts:116-144: para granular media (10≤N<30) el candidato CR=lerp(I_D,0.35,0.65,8,7) solo se añade si `fullyAboveNF || cuGe2`, y `fullyAboveNF = segBase <= nfDepth+1e-9` exige el tramo ÍNTEGRO sobre el NF. Una capa media que cruza el freático con Cu<2 cae en el else (solo nota 'info', sin candidato) → R=1, pese a que su porción superior está permanentemente sobre el NF y la fila de la Tabla 3.6 (condición que el propio comentario del código reproduce en líneas 129-130) exige CR 8…7 (R≈0.85-0.87). No hay guard ni preprocesado upstream: micropiles.ts:415 pasa los estratos crudos sin partirlos por el NF. El caso es alcanzable y de hecho está codificado como oráculo: el test micropiles.test.ts:260-265 (capa media 20 m, NF a 3.0 m, tramo 0.5-10 m → CRUZA el NF con 2.5 m secos) fija crAdopted=0 y R=1. La lectura 'capa íntegra' fue rechazada por el propio proyecto en la rama de arena floja (líneas 146-171), donde tras el eng-review 2026-06-02 sí se parte el tramo por el NF (hSat = max(0, segBase - max(segTop, nfDepth))); la rama media quedó inconsistente y en el lado inseguro. Refutaciones consideradas y descartadas: la hipótesis de línea 23 está documentada pero la nota emitida es nivel 'info' (no warn) y su texto es engañoso ('bajo NF y Cu<2' cuando nfNote='atraviesa NF'); la omisión solo puede sobreestimar Nc,Rd (nunca conservadora); el perfil NF-dentro-de-arena-media es habitual. La porción saturada de la media con Cu<2 sí queda legítimamente sin tabular (solo la floja saturada Cu<2 es inestable), por lo que el fix propuesto (split por NF, penalizar si hDry>0 o Cu≥2) es correcto y requerirá corregir el test de la línea 260. Defecto normativo real, inseguro (~15-17% de sobreestimación del tope estructural), severidad high se mantiene.

---

#### 15. [micropiles] Comprobación de flexión sin interacción con el axil (EC3 §6.2.9.1 omitido)

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/micropiles.ts:488-539 (Mpl_rd, im) y check 'bending' líneas 627-635`
- **ID:** `bending-MN-interaction-01`

**Descripción**

El check de flexión compara MEd contra Mpl_rd (solo reducido por cortante ρ), ignorando el axil concomitante NEd = designLoad. EC3 §6.2.9.1 exige reducir el momento resistente a MN,Rd cuando hay axil (para CHS clase 1/2, MN,Rd ≈ Mpl,Rd·(1−n^1.7) con n = NEd/Npl,Rd; para clase 3 limitar σ combinada, §6.2.9.2). En un micropilote el caso M+V casi siempre coexiste con N de compresión elevado: con FTUX (Nc,d=350 kN, Npl≈ As_d·fyd ≈ 950 kN → n≈0.37) el Mpl disponible real es ~25-45% menor que el usado. El check 'bending' puede salir verde cuando la sección combinada N+M no cumple. La separación Guía «tope estructural» / «flexión» no exime de la interacción cuando se cita EC3 §6.2.5 como base del check.

**Evidencia**

```
Línea 488: comentario «Mpl,rd y Vpl,rd — sección tubular sin reducción por axil (simplificado)»; línea 536: `const Mpl_rdm = Mpl_rd * (1 - rho);` y línea 538: `const im = Mpl_rdm > 0 ? MEd / Mpl_rdm : 0;` — en ningún punto interviene inp.designLoad. EC3-1-1 §6.2.9.1(5) para secciones huecas circulares clase 1/2: MN,Rd = Mpl,Rd·(1 − n^1.7) (criterio simplificado), con n = NEd/Npl,Rd; el motor usa MN,Rd = Mpl,Rd siempre.
```

**Fix sugerido**

Cuando designLoad>0 y MEd>0, calcular n = NEd/(As_d·fyd_raw/1000) y aplicar MN,Rd = Mpl_rd·(1−n^1.7) (clase 1/2) o la comprobación elástica σx,Ed = NEd/As_d + MEd/Wel ≤ fy/γ (clase 3) antes de la reducción por cortante; reflejarlo en el article del check ('EC3 §6.2.9').

**Razonamiento del verificador**

Confirmado leyendo micropiles.ts. La evidencia es exacta: Mpl_rd = W·(fy/1.1)/1e6 (línea 513) solo se reduce por ρ de interacción M-V (líneas 533-536) y el check 'bending' (627-635) compara MEd contra Mpl_rdm; inp.designLoad nunca interviene en esa cadena (verificado por grep exhaustivo) y el comentario de línea 488 admite «sin reducción por axil (simplificado)». No hay guard previo que lo cubra: el único es el de clase 4. El check cita EC3 §6.2.5, lo que arrastra §6.2.9.1(1) (con axil, reducir a MN,Rd salvo NEd ≤ 0.25·Npl,Rd, umbral superado en el caso FTUX con n≈0.37) y §6.2.9.2 para clase 3. Es inconsistente aplicar la interacción M-V de EC3 y omitir la M-N del mismo §6.2; otros módulos del repo (steelColumns, rcColumns) sí implementan N-M. El caso es alcanzable: designLoad/baseMoment/baseShear son inputs independientes con única validación de no-negatividad, y en micropilotes M+V coexiste típicamente con N alto. Matizaciones al auditor: la magnitud está sobreestimada (con n=0.37, 1−n^1.7 ≈ 0.816 → ~18% de reducción, no 25-45%; además parte del axil lo absorbe la lechada vía Fc_h, bajando el n efectivo del tubo, y hay ~4.5% de margen por γ=1.10 vs 1.05) y la fórmula 1−n^1.7 para CHS no está literalmente en §6.2.9.1(5) de EN 1993-1-1:2005 sino que es la aproximación aceptada para tubos circulares. Nada de esto refuta el defecto de fondo: omisión no conservadora de una comprobación obligatoria del artículo citado, que puede dar 'CUMPLE' a una sección que falla en N+M combinado cuando la utilización a flexión es alta con axil concomitante elevado. Severidad high se mantiene por dirección insegura y alcanzabilidad, aunque el impacto numérico típico es ~10-20%, menor que el reportado.

---

#### 16. [rcColumns] Zona gap (NRd_Whitney ≤ NEd < NRd_max): MRd evaluado a un axil inferior al aplicado — capacidad sobreestimada

- **Severidad:** high  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcColumns.ts:108-111 (computeAxis)`
- **ID:** `rcCol-gapzone-01`

**Descripción**

Cuando NEd cae entre NRd_Whitney (≈0.8·fcd·b·h + As·fyd, tope del barrido con bloque rectangular) y NRd_max (compresión pura), el motor no puede converger y devuelve el MRd calculado con x = canto completo. Pero calcNM(x=depth) corresponde a un axil NRd(depth) < NRd_Whitney < NEd: se reporta el momento resistente de un estado con MENOS axil, que es mayor que el real. El MRd verdadero decae casi linealmente hasta 0 en NRd_max (rama de pivote C / εc2 que el modelo no implementa). Para sección 300×300 C25 con 4Ø16, NRd_W≈1550 kN y NRd_max≈1836 kN: a NEd=1700 kN el código reporta MRd≈50 kNm cuando la capacidad real interpolada es ≈24 kNm. El check informativo nm-y muestra 'ok' (verde) cuando debería fallar, y la utilización biaxial queda subestimada en todo el rango de axiles altos. Irónicamente, el diagrama N-M (sweepEnvelope + envelopeCapacityM) sí interpola linealmente hasta (NRd_max, 0) y es más correcto que el check del motor: el marcador puede quedar fuera de la curva mientras el check da verde.

**Evidencia**

```
L108-111: `if (NEd_N >= NRd_Whitney) { // Gap zone: binary search cannot converge — use x = depth (full compression state)\n  const { MRd } = calcNM(depth, width, depth, bars, fcd, fyd);\n  return { MRd_Nmm: MRd, x_star: depth, ndMaxFailed: false }; }`. El diagrama de pivotes de CE Anejo 19 art. 6.1 exige para sección totalmente comprimida limitar εc a εc2=0.002 a 3h/7 de la cara comprimida (pivote C), con M→0 cuando N→NRd_max; aquí se congela el momento del estado Whitney. Además el propio comentario en L134 está invertido: 'ned can exceed 1.0 in gap zone (NRd_Whitney > NRd_max)' — en realidad NRd_Whitney < NRd_max siempre (diferencia = 0.2·fcd·b·h − fcd·As > 0 con As ≤ 0.04bh).
```

**Fix sugerido**

Implementar la rama de pivote C (deformación εc2 fija a 3h/7, x ∈ [h, ∞)) en calcNM y extender la búsqueda binaria, o como mínimo interpolar linealmente MRd entre (NRd_Whitney, M_Whitney) y (NRd_max, 0) — igual que ya hace envelopeCapacityM para el diagrama — y corregir el comentario de L134.

**Razonamiento del verificador**

Confirmado tras verificación numérica independiente. En src/lib/calculations/rcColumns.ts L108-111, cuando NRd_Whitney ≤ NEd < NRd_max el motor devuelve MRd = calcNM(x=depth), un estado cuyo axil de equilibrio es NRd(depth) ≈ 1416 kN para la sección 300×300 C25 4Ø16 — inferior incluso a NRd_Whitney (1550 kN) y muy inferior al NEd aplicado (hasta 1836 kN). Eso congela MRd ≈ 50.2 kNm en toda la banda gap, cuando según el diagrama de pivotes (pivote C, εc2; CE Anejo 19 art. 6.1) M debe decaer a 0 en NRd_max: la capacidad real a NEd=1700 kN es ~17-24 kNm. No hay guard previo: nd-max solo cubre NEd ≥ NRd_max, y la búsqueda binaria satura en NRd(2h) ≈ 1536 kN < NRd_Whitney, así que la rama L108 es el único camino en la banda. Caso falso-verde reproducible: pilar corto L=1.5 m, Nd=1700 kN → MEd_tot ≈ 40 kNm < 50.2 reportado → nm-y 'ok' y util biaxial ≈ 0.8, cuando la utilización real es ≈ 2 (fallo). El propio sweepEnvelope/envelopeCapacityM (L606-656) interpola hasta (NRd_max, 0) y discrepa del check — el comentario de L659-661 lo admite al derivar 'inside' solo de la curva. También verificado: el comentario L134 está invertido (NRd_Whitney < NRd_max siempre; diferencia = 0.2·fcd·b·h − fcd·As > 0 con As ≤ 0.04bh), aunque el clamp en sí es inocuo. El test existente (rcColumns.test.ts L212-219, Nd=1600) ejercita la zona gap pero solo comprueba ausencia de NaN, no la corrección de la capacidad. Severidad high apropiada: resultado estructural no conservador (factor ~2-3) en un rango de entrada alcanzable y sin aviso al usuario.

---

#### 17. [rcColumns] Método de curvatura nominal sin factor de fluencia Kφ (ni Kr): e2 subestimado para pilares esbeltos

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcColumns.ts:247-248 y 255-256`
- **ID:** `rcCol-curvatura-01`

**Descripción**

La curvatura se toma como 1/r0 = (fyd/Es)/(0.45·d) directamente, omitiendo los dos factores correctores del método de curvatura nominal (CE Anejo 19 art. 5.8.8.3 / EC2): 1/r = Kr·Kφ·(1/r0). Omitir Kr ≤ 1 es conservador, pero omitir Kφ = 1 + β·φef ≥ 1 (fluencia) es del lado inseguro: con φef ≈ 1–2 típico en edificación, Kφ ≈ 1.2–1.5, es decir e2 (y el momento de 2º orden) se subestima un 20–50% en pilares esbeltos donde precisamente gobierna. El coeficiente c=10 y 1/r0 = εyd/(0.45d) sí coinciden con la norma.

**Evidencia**

```
L247-248: `const curv_y = fyd / (Es * 0.45 * d_y);\nconst e2_y = lambda_y > 25 ? curv_y * Lk_mm * Lk_mm / 10 : 0;` — falta Kφ = 1 + β·φef con β = 0.35 + fck/200 − λ/150 (Anejo 19, expr. 5.37) y Kr = (nu − n)/(nu − nbal) ≤ 1 (expr. 5.36). La fórmula implementada equivale a asumir Kr=Kφ=1, lo cual la norma solo permite para Kr (lado seguro), no para Kφ.
```

**Fix sugerido**

Añadir Kφ = max(1, 1 + (0.35 + fck/200 − λ/150)·φef) con φef como input (o un valor por defecto razonable ≈ 2 para edificación), y opcionalmente Kr para no penalizar en exceso: 1/r = Kr·Kφ·fyd/(Es·0.45·d).

**Razonamiento del verificador**

Confirmado leyendo el código. rcColumns.ts L247-248/L255-256 implementa exactamente 1/r = fyd/(Es·0.45·d) y e2 = (1/r)·Lk²/10 para λ>25, sin Kr ni Kφ; grep en todo src no encuentra φef/Kφ/Kr/fluencia, RCColumnInputs (defaults.ts L60-78) no tiene input de fluencia, y no existe clamp ni guard que lo cubra. El propio archivo declara implementar "CE art. 43.5.3 — Nominal curvature method" / Anejo 19, cuyo método exige 1/r = Kr·Kφ·(1/r0) con Kφ = 1+β·φef ≥ 1 (expr. 5.37). Asumir Kr=1 es conservador, pero asumir Kφ=1 solo es lícito si φef es despreciable (condiciones de 5.8.4(4) que el motor no comprueba ni puede comprobar). Con φef≈1–2 típico, e2 queda subestimado del lado inseguro: con los defaults (λ≈40, fck=25, β≈0.21, φef=2, Kφ≈1.4) e2 pasa de 23 a 32.5 mm y MEd_tot sube ~10%; en casos con e1 pequeña y λ≈45–60 el déficit supera el 15–20%, suficiente para dar CUMPLE a pilares que la norma rechaza. Matiz: la cifra del auditor "20–50% en pilares esbeltos donde gobierna" está algo sobrestimada, porque β = 0.35+fck/200−λ/150 se anula en λ≈71 (fck25) a 90 (fck50) y Kφ clampa a 1 para esbelteces muy altas; el rango inseguro real es 25 < λ ≲ 70–90, y la dilución por e1+e_imp reduce el impacto en MEd_tot. Pero esto solo modula la magnitud, no refuta el defecto: es una omisión normativa genuina del lado inseguro en la rama que gobierna el dimensionado de pilares esbeltos de un motor de verificación. El fix propuesto (Kφ con φef como input o default ≈2, y opcionalmente Kr) es correcto.

---

#### 18. [rcColumns] Longitud de solape: fbd calculada con fctm sin γc y sin factor de solape α6 — solapes hasta ~50% cortos

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcColumns.ts:295-298`
- **ID:** `rcCol-lapLength-01`

**Descripción**

fbd se calcula como 2.25·0.7·fctm. Según CE Anejo 19 art. 8.4.2 (y EHE art. 69.5), fbd = 2.25·η1·η2·fctd con fctd = αct·fctk,0.05/γc = 0.7·fctm/1.5. El 0.7 del código equivale numéricamente a la conversión fctk,0.05 = 0.7·fctm (aunque el comentario lo etiqueta como 'poor bond'), pero falta dividir por γc = 1.5: fbd queda un 50% sobreestimada y lb_rqd un 33% corta. Además la longitud de SOLAPE es l0 = α1·…·α6·lb,rqd con α6 = 1.5 cuando se solapa >50% de las barras en la misma sección (caso habitual en pilares: 100%): tampoco se aplica. Combinado, el solape reportado puede ser ~2.25× más corto que el normativo (p.ej. Ø16 B500S C25: código lb≈430·(1/1.5)… reporta ≈390 mm cuando l0 normativo ≈ 880 mm). Es un valor que el usuario lleva directamente a planos.

**Evidencia**

```
L296-298: `const fbd_poor = 2.25 * 0.7 * fctm;\nconst lb_rqd = (cornerBarDiam / 4) * (fyd / fbd_poor);\nconst lapLength = Math.ceil(Math.max(lb_rqd, 15 * cornerBarDiam, 200) / 5) * 5;` — fórmula esperada: fbd = 2.25·η1·η2·(0.7·fctm/1.5); l0 = α6·lb,rqd ≥ l0,min = max(0.3·α6·lb,rqd, 15Ø, 200) (Anejo 19 arts. 8.4.2, 8.7.3).
```

**Fix sugerido**

fctd = 0.7·fctm/1.5; fbd = 2.25·η1·fctd (η1=1.0 para barras verticales de pilar, buena adherencia); lapLength = α6·lb_rqd con α6 = 1.5, con mínimo l0,min = max(0.3·α6·lb_rqd, 15Ø, 200).

**Razonamiento del verificador**

Verificado en rcColumns.ts:295-298: fbd = 2.25·0.7·fctm usa fctm media sin γc. La fórmula normativa (CE Anejo 19 / EC2 art. 8.4.2) exige fbd = 2.25·η1·η2·fctd con fctd = 0.7·fctm/1.5 ≈ 0.467·fctm; el código usa 0.7·fctm, sobreestimando fbd un 50% (lb,rqd 33% corta). Bajo cualquier lectura del 0.7 (conversión fctk,0.05 o η1='poor bond', esta última además improcedente porque las barras verticales de pilar son adherencia buena) falta el γc=1.5. Además no se aplica α6=1.5 (art. 8.7.3, solape del 100% de barras en la misma sección, caso universal en pilares) ni el l0,min correcto (0.3·α6·lb,rqd). Comprobación numérica con Ø16/B500S/C25 (fyd=434.8, fctm=2.56 de materials.ts): código reporta 435 mm vs ~970 mm normativo — factor ~2.25 del lado inseguro. No hay ningún clamp ni corrección aguas abajo: lapLength se imprime directo en UI (RCColumnsResults.tsx:183) y en el PDF de cálculo (pdf/rcColumns.ts:182, 'Solape mín'), es decir, va a planos. El test solo verifica lapLength > 0. Intenté refutarlo (0.7 como η1 intencional, exención de α6 en compresión, factor en UI) y ninguna vía prospera: EC2/CE aplican α6 también a solapes en compresión. El defecto se sostiene íntegramente.

---

#### 19. [rcSlabs] Anclaje: fctd = fctm/1.5 omite el factor 0.7 (fctk,0.05) — lb_rqd un 30% corto

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcSlabs.ts:36-41 (computeAnchorage)`
- **ID:** `rcSlabs-anchorage-fctd-01`

**Descripción**

La resistencia de cálculo a tracción para adherencia debe ser fctd = αct·fctk,0.05/γc = 0.7·fctm/1.5 (fctk,0.05 = 0.7·fctm). El código usa fctd = fctm/1.5 directamente, sobreestimando fbd un 43% (1/0.7) y reportando longitudes de anclaje lb_rqd un 30% más cortas de lo normativo. Aunque estos checks son informativos (status 'ok', utilization 0), los valores lb_rqd/lb_min van al informe/PDF y un proyectista detallaría con ellos los planos — anclajes insuficientes en obra. El test (rcSlabs.test.ts:357-369) consagra la fórmula errónea.

**Evidencia**

```
Línea 36: `const fctd = fctm / 1.5;` y línea 40: `const fbd = 2.25 * eta1 * eta2 * fctd;`. CE Anejo 19 (EC2) §8.4.2: fbd = 2.25·η1·η2·fctd con fctd = αct·fctk,0.05/γC (§3.1.6(2)), y fctk,0.05 = 0.7·fctm (Tabla 3.1). Lo correcto para C25: fctd = 0.7·2.56/1.5 = 1.20 MPa, no 1.71 MPa.
```

**Fix sugerido**

Cambiar a `const fctd = (0.7 * fctm) / 1.5;` (idealmente con fctk,0.05 tabulado en materials.ts) y actualizar el test correspondiente.

**Razonamiento del verificador**

Confirmado tras intentar refutarlo. (1) El código dice literalmente `const fctd = fctm / 1.5;` (rcSlabs.ts:36) sin factor 0.7 ni guard alguno; el único 0.7 presente es η1 de Posición II, que es el factor de posición de adherencia exigido aparte por §8.4.2, no fctk,0.05. (2) materials.ts confirma que fctm es la resistencia media (0.30·fck^(2/3); C25→2.56 MPa), luego el código usa fctd=1.71 MPa donde EC2/CE Anejo 19 §8.4.2 + §3.1.6(2)P + Tabla 3.1 exigen fctd = αct·fctk,0.05/γc = 0.7·fctm/1.5 = 1.20 MPa: fbd sobreestimado ×1.43 y lb_rqd un 30% corto, tal como afirma el auditor. (3) Evidencia interna decisiva: anchorPlate.ts:1236 del mismo repo lo hace bien (fctd = 0.21·fck^(2/3)/γc, con oracle test que documenta 1.197 MPa para C25 citando CE Anejo 19 §49.5), demostrando que rcSlabs es inconsistente con la convención correcta del propio proyecto. rcColumns.ts:296 tiene otra variante también sin γc (defecto aparte, fuera de este finding). (4) Alcanzabilidad: appendAnchorage (rcSlabs.ts:555-570) se ejecuta incondicionalmente para cada bundle no vacío y los valores lb,rqd/lb,min van al informe etiquetados 'CE art. 69.5.1.1'; para Ø16/B500/C25 Pos I se reporta ~453 mm frente a ~646 mm normativo. lb_min no mitiga porque su término 0.3·lb_rqd escala con el mismo error. (5) El test rcSlabs.test.ts:363 reproduce la fórmula errónea, consagrándola. Severidad high es adecuada: aunque los checks son informativos (status 'ok', utilization 0), son valores de despiece con relevancia de seguridad entregados al proyectista sistemáticamente un 30% del lado inseguro para todos los hormigones. El fix propuesto (fctd = 0.7·fctm/1.5, idealmente fctk,0.05 tabulado) es correcto.

---

#### 20. [rcSlabs] Sección sobrearmada: MRd se calcula con fyd como si el acero plastificara y el check sólo emite 'warn'

- **Severidad:** high  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcSlabs.ts:150-163 y rcTSection.ts:16-22 (solveRectangular)`
- **ID:** `rcSlabs-overreinforced-01`

**Descripción**

solveRectangular asume siempre acero plastificado (x = As·fyd/(0.8·b·fcd); MRd = As·fyd·(d−0.4x)). Cuando x > x,lim el acero no alcanza fyd y el MRd real es inferior al calculado (la hipótesis de Whitney con fyd deja de ser válida); además, para As grandes (d−0.4x) puede llegar a hacerse muy pequeño o negativo sin ninguna salvaguarda. El motor detecta x > x,lim pero lo reporta sólo como 'warn' (línea 161: status: 'warn') sin corregir MRd, de modo que el check de flexión 'bending' (Md vs MRd, líneas 535-550) puede mostrar verde con una capacidad sobreestimada. Caso plausible en apoyo reticular: rectangular sobre b_w=120 mm con refuerzos fuertes.

**Evidencia**

```
rcTSection.ts:19-20: `const x = (As * fyd) / (0.8 * b * fcd); const MRd = (As * fyd * (d - 0.4 * x)) / 1e6;` — sin límite x ≤ x,lim. rcSlabs.ts:154-162: `if (x > xLimit) { checks.push({ ... status: 'warn', ... }) }` — MRd no se recalcula ni se penaliza. Con compatibilidad de deformaciones (σs = Es·εcu·(d−x)/x < fyd) el MRd real es menor que el reportado.
```

**Fix sugerido**

Cuando x > x,lim: o bien recalcular MRd con compatibilidad de deformaciones (σs < fyd, resolver cuadrática en x), o bien limitar MRd al valor con x = x,lim (MRd,lim = 0.8·x,lim·b·fcd·(d−0.4·x,lim)) y marcar el check como 'fail' en lugar de 'warn'.

**Razonamiento del verificador**

Verificado en el código real: solveRectangular (rcTSection.ts:19-21) asume siempre acero plastificado (x = As·fyd/(0.8·b·fcd), MRd = As·fyd·(d−0.4x)) sin clamp x ≤ x_lim, y solveTSection hereda la misma hipótesis. En rcSlabs.ts:150-163 el motor calcula correctamente x_lim = εcu3/(εcu3+εyd)·d y detecta x > x_lim, pero sólo emite status 'warn' sin recalcular ni penalizar MRd; el check 'bending' (líneas 535-550) compara Md contra ese MRd inflado y puede mostrar verde. Verificación numérica con caso alcanzable (b_w=120, h=300, d≈260, C25, B500S, As=800 mm² — pasa As,max con util 0.56): x=217 mm > x_lim=160 mm, MRd_código=60.3 kNm vs MRd_real con compatibilidad de deformaciones (σs≈348 MPa < fyd)≈53.0 kNm, sobreestimación ~14% del lado inseguro. Las validaciones de entrada (líneas 296-320) no impiden el caso y no existe ningún test que cubra sobrearmado. Mitigantes que no refutan: el warn es visible pero no bloquea ni corrige la cifra; makeCheck devuelve fail (Infinity) sólo si MRd ≤ 0, dejando descubierto justo el rango peligroso x_lim < x < ~1.25d con MRd positivo pero inflado. El propio repo aplica el guard correcto en types.ts:solveRCBending (m ≥ 0.5 → Infinity) para otros módulos, confirmando que la salvaguarda falta específicamente aquí. El fix propuesto (limitar MRd a MRd,lim con x = x_lim o resolver por compatibilidad, y elevar a 'fail') es correcto y conservador.

---

#### 21. [retainingWall] Umbral de vuelco estático FS ≥ 1.5 en lugar del equivalente CTE 1.8/0.9 ≈ 2.0

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `retainingWall.ts:272-277 (check 'vuelco')`
- **ID:** `retWall-fs-vuelco-02`

**Descripción**

CTE DB-SE-C Tabla 2.1 (verificación de estabilidad, situaciones persistentes/transitorias) fija para vuelco coeficientes parciales γE = 1.8 sobre acciones desestabilizadoras y 0.9 sobre estabilizadoras, lo que en formato de factor de seguridad global equivale a FS = 1.8/0.9 = 2.0. El motor da por bueno FS ≥ 1.5: un muro con FS_vuelco = 1.6-1.9 aparece en verde cuando incumple el CTE. El umbral 1.5 sí es correcto para deslizamiento (γR = 1.5, línea 278-283).

**Evidencia**

```
Líneas 272-277: `checks.push(makeCheck('vuelco', `Estabilidad al vuelco${vuelcoSuffix}`, 1.5, FS_vuelco, `FS = ${FS_vuelco.toFixed(2)}`, '≥ 1.50', 'CTE DB-SE-C §4.4.1'));` — CTE DB-SE-C Tabla 2.1: vuelco con γE,desestab = 1.8 y γE,estab = 0.9 → FS global equivalente 2.0, no 1.5.
```

**Fix sugerido**

Cambiar el límite del check 'vuelco' a 2.0 (o implementar el formato de coeficientes parciales: Mo·1.8 ≤ Mr·0.9), manteniendo 1.5 para deslizamiento. Actualizar el texto '≥ 1.50' y los tests dependientes.

**Razonamiento del verificador**

Confirmado leyendo retainingWall.ts. FS_vuelco se calcula como cociente global Mr/Mo con momentos característicos sin mayorar (líneas 186-190, 225-231, 243) y el check 'vuelco' (líneas 272-277) lo compara contra 1.5 citando CTE DB-SE-C. No hay ningún guard, clamp ni check adicional que cubra el vuelco estático (el check sísmico de 1.1 es otra verificación, NCSE-02/NCSP-07). CTE DB-SE-C Tabla 2.1 fija para vuelco γE=1.8 (desestabilizador) y 0.9 (estabilizador), equivalente en formato de FS global a 1.8/0.9 = 2.0; el 1.5 que usa el motor es el γR de deslizamiento (correctamente aplicado en líneas 278-283). El caso límite es alcanzable: la validación de inputs no impide geometrías con FS entre 1.5 y 2.0 (banda habitual en muros ajustados) y los tests (retainingWall.test.ts líneas 110-120) están calibrados al umbral erróneo (solo exigen FS ≥ 1.5). Un muro con FS_vuelco = 1.6-1.9 aparece en verde incumpliendo el CTE. Detalle menor adicional: el artículo citado debería ser §6.3.2/Tabla 2.1, no §4.4.1, y la equivalencia FS=2.0 es aproximada porque Mo/Mr mezclan acciones (q estabilizadora en talón debería tratarse como favorable variable γQ=0), pero nada de eso refuta el hallazgo: el umbral 1.5 es no conservador bajo la norma que el propio motor declara. El fix propuesto (límite 2.0 o formato de coeficientes parciales 1.8/0.9, manteniendo 1.5 en deslizamiento, actualizando textos y tests) es correcto.

---

#### 22. [retainingWall] La sobrecarga variable q se cuenta como acción estabilizadora (peso sobre talón) en vuelco y deslizamiento

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `retainingWall.ts:200, 221-231, 244 (W_q_heel)`
- **ID:** `retWall-q-favorable-03`

**Descripción**

W_q_heel = q·bT se suma a ΣV (resistencia por fricción ΣV·μ) y a Mr (momento estabilizador), a la vez que la misma q genera el empuje desestabilizador EA_q. Según CTE DB-SE (y EC7), las acciones variables con efecto favorable se toman con γQ,fav = 0 en verificaciones de estabilidad: la sobrecarga puede actuar tras el muro generando empuje sin estar presente sobre el talón. Contarla como estabilizadora infla FS_vuelco y FS_desliz de forma insegura siempre que q > 0 (el defecto no se detecta en tests porque el default es q = 0). El mismo término aparece en la rama sísmica (líneas 339-344).

**Evidencia**

```
Línea 200: `const W_q_heel = inp.q * bT_m;`; líneas 221-228: `const ΣV = ... + W_dry_heel + W_wet_heel + W_q_heel + ...` y `Mr = ... + (W_dry_heel + W_wet_heel + W_q_heel) * x_heel ...`; línea 244: `FS_desliz = (ΣV * inp.mu + Ep) / EAH_total`. CTE DB-SE §4.2 / DB-SE-C: acción variable favorable → coeficiente 0 (no debe estabilizar mientras su empuje EA_q = Ka·q·H_total sí desestabiliza, línea 168).
```

**Fix sugerido**

Excluir W_q_heel de ΣV y Mr en las verificaciones de estabilidad (vuelco, deslizamiento, estática y sísmica). Puede mantenerse en el cálculo de tensiones de zapata y en el momento del talón si allí resulta desfavorable (comprobar ambos casos con/sin q).

**Razonamiento del verificador**

Verificado línea a línea: W_q_heel = q·bT (línea 200) se suma sin condición alguna a ΣV (líneas 221-223) y a Mr (líneas 225-228), inflando FS_vuelco = Mr/Mo (línea 243) y FS_desliz = (ΣV·μ + Ep)/EAH_total (línea 244), mientras la misma q genera el empuje desestabilizador EA_q = Ka·q·H_total (línea 168) incluido en Mo y EAH_total. La rama sísmica repite el término idénticamente (líneas 339-347). No existe guard, clamp ni rama favorable/desfavorable. Intenté refutarlo: (1) el argumento del "plano virtual" (q sobre talón forma parte del bloque) no se sostiene porque q es acción variable libre — la disposición pésima es q tras el plano virtual (generando empuje) y ausente sobre el talón; CTE DB-SE tabla 4.1 y EN 1990/EC7 exigen γQ,fav = 0 en verificaciones de estabilidad, y la práctica española estándar (Calavera, DB-SE-C) excluye la sobrecarga del lado estabilizador. (2) El caso es alcanzable: q es input directo del usuario (default 0, libremente configurable) y bTalon > 0 es la geometría normal. (3) Los tests no lo detectan: el único test con q=5 solo asserta valid===true. (4) El propio motor trata q como variable con γQ=1.5 en el dimensionamiento estructural (líneas 396-408), confirmando que la distinción existe pero falta en estabilidad. El defecto es real, siempre unconservador cuando q>0 y bT>0, y puede convertir un fallo (FS<1.5) en aparente cumplimiento. Severidad high se mantiene: desviación normativa insegura en verificaciones geotécnicas críticas, mitigada solo por el default q=0.

---


### 🟡 MEDIUM

#### 23. [anchorPlate] checkBoltTension comprueba la tracción MEDIA por barra (Ft_total/n_t), no la máxima

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/anchorPlate.ts:1930 y 1956 (calcAnchorPlate) + 1107 (checkBoltTension)`
- **ID:** `anchorPlate-04-bolt-tension-average`

**Descripción**

El solver biaxial (y el pure-tension) asignan una distribución LINEAL de Ft proporcional a la distancia al eje neutro (Ft_i = α·sd_i), de modo que la barra extrema soporta bastante más que la media. El check dedicado de tracción recibe Ft_total/n_t. Ejemplo: barras a sd=100 y sd=300 → máx = 1.5× media; el check reporta util un 33% inferior a la real. checkBoltInteraction sí usa FtMax pero con exponente cuadrático ((N/NRd)²), que enmascara utilizaciones 0.8-1.0 (0.95 real → 0.90 mostrado). En el rango común de momentos biaxiales el check de tracción puede salir 'ok' con la barra extrema en 'warn/fail'.

**Evidencia**

```
L1930: const Ft_per_bar = solver.n_t > 0 ? solver.Ft_total / solver.n_t : 0;
L1956: checkBoltTension(inp, Ft_per_bar, system),
L1107: const util = Ft_per_bar_kN / FtRd_kN;
— En solveBiaxial (L556) la distribución es Ft_N = Math.min(alpha_eff * sd, FtRd_N), claramente no uniforme.
```

**Fix sugerido**

Pasar a checkBoltTension el máximo: const FtMax = Math.max(...solver.bolts.map(b => b.Ft)); el promedio sólo es válido en el camino axis-aligned de 2 barras simétricas.

**Razonamiento del verificador**

Confirmado leyendo el código: calcAnchorPlate (L1930) computa Ft_per_bar = Ft_total/n_t (media sobre barras traccionadas; n_t = count de inTension en biaxial L734 y pure-tension L886) y lo pasa a checkBoltTension (L1956), cuyo util = media/FtRd (L1107). solveBiaxial asigna Ft_i = min(α·sd_i, FtRd) lineal con la distancia al eje neutro (L556/650) y solvePureTension usa Ft = a+b·x+c·y (L854): distribuciones no uniformes donde la barra extrema supera la media (1.5×+ alcanzable). El dispatcher (L904-932) rutea a biaxial para My≠0, NEd<0.1 kN o layouts 6/8/9 — el caso común. checkBoltInteraction sí usa FtMax (L1193) pero cuadrático, como dice el auditor. Único call-site del check; los tests solo cubren el camino axis-aligned 2-barras simétrico donde media=máx. Normativamente (EN 1992-4 / CE Anejo 11: se verifica el anclaje más desfavorable) el check debe usar el máximo; el fix propuesto es correcto. SIN EMBARGO la severidad high está sobrestimada por dos mitigantes que el auditor minusvalora: (1) el solver capa cada barra a FtRd, así que util_max ≤ 1.0 siempre — la barra extrema en 'fail' con tension-check 'ok' es inalcanzable; al saturar, checkBoltInteraction da ratio_n²=1.0 → toStatus(1.0)='fail' incluso con V=0, y el solver marca saturated/converged=false; (2) con V>0 el término de cortante de la interacción eleva la detección. El impacto real es: banda 'warn' enmascarada para util de barra extrema ∈ [0.80, ~0.894] con V≈0 (ningún check avisa), y valores Ft/util engañosamente bajos en la fila dedicada del informe. Defecto real de reporting no conservador → medium, no high.

---

#### 24. [anchorPlate] ψh,sp acotada inferiormente a 1.0 — elimina la reducción por canto escaso (h < 2·hef), justo el régimen donde el check aplica

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/anchorPlate.ts:1541-1543 (checkSplitting)`
- **ID:** `anchorPlate-08-splitting-psih-floor`

**Descripción**

El check de splitting sólo se ejecuta cuando c_min < 1.5·hef o h < 2·hef (skip en L1528). Para h < 2·hef el término (h/(2hef))^(2/3) < 1 debería REDUCIR la capacidad (el valor de referencia del cono asume desarrollo completo en profundidad), pero Math.max(1.0, ...) lo clava a 1.0, de modo que el factor nunca penaliza: con pedestal h=hef la capacidad queda sobreestimada ≈1/0.63 = 1.6×. En la formulación EN 1992-4 §7.2.1.7 / ETAG TR029 ψh,sp=(h/hmin)^(2/3) parte de un hmin garantizado; al usar 2·hef como referencia sin disponer de hmin, el floor a 1.0 es no conservador para macizos someros (encepados delgados), el caso splitting-crítico por excelencia.

**Evidencia**

```
const psi_h_raw = Math.pow(h_pedestal / (2 * hef), 2 / 3);
const psi_h_bound = Math.pow((2 * c_max) / hef, 2 / 3);
const psi_h_sp = Math.max(1.0, Math.min(psi_h_raw, psi_h_bound));
— Con h < 2·hef (única vía por canto para entrar al check), psi_h_raw < 1 y el max(1.0, ·) lo anula. El comentario L1491-1493 ('amplifica capacidad para macizos h > 2·hef') confunde el sentido para h < 2·hef.
```

**Fix sugerido**

Permitir ψh,sp < 1 cuando h < 2·hef: psi_h_sp = Math.min(psi_h_raw, Math.max(1, psi_h_bound), 2) sin floor global a 1, o documentar h_min de proyecto y usar (h/h_min)^(2/3).

**Razonamiento del verificador**

Confirmado leyendo anchorPlate.ts:1500-1594. El fragmento citado es exacto y no hay guard previo: el único gate es el skip de L1528 (c_min≥1.5hef && h≥2hef). Cuando el check se activa por canto (h<2·hef, bordes lejanos), psi_h_raw=(h/2hef)^(2/3)<1 siempre y Math.max(1.0,·) lo anula; con ψs=1, mismo k1=7.7 y mismas ccr/scr=1.5hef/3hef que el cono, NRd,sp degenera exactamente al valor del cono sin dependencia alguna de h — en el único régimen de profundidad que el propio código declara crítico (incoherencia interna: comentario L1483-84 vs L1491-92). El caso es alcanzable: validateAnchorPlate no relaciona pedestal_h con hef, y el test suite (anchorPlate.test.ts L690-694) ejercita h=400/hef=300 aseverando ψh=1.00 (floor intencional pero defectuoso). Intenté refutarlo con la letra de EN 1992-4 §7.2.1.7 (ψh,sp=(h/hmin)^(2/3)≥1, floor compatible), pero ese floor sólo es válido porque la norma embebe la penalización por canto en la base: ccr,sp/scr,sp calibradas para hmin, y para cast-in/headed (este motor lo es) CEN/TS 1992-4-2 §6.2.6 agranda ccr,sp hasta ≈2.26·hef para h≤1.3·hef. El motor no implementa ni la reducción ETAG-style (h/2hef)^(2/3) sin floor ni el ccr,sp(h) EN-style: usa la ccr mínima fija + referencia 2hef + floor 1 → penalización por canto = cero, no conservador para encepados/macizos someros. Matices: la magnitud 1.6× del auditor corresponde a la lectura ETAG en h=hef; bajo la lectura EN/ccr,sp(h) el gap es menor (~1.2-1.5×). Mitigación parcial accidental: splitting fuerza k1=7.7 mientras el cono usa 11.0 en no fisurado (penaliza ~30% pero sin dependencia de h); en fisurado (default) el check es tautológico con el cono para h<2hef. Severidad medium correcta: no conservador pero acotado y el cono sigue verificándose.

---

#### 25. [anchorPlate] ψec,N/ψec,sp: la excentricidad se mide respecto al centro de la placa, no respecto al baricentro del grupo traccionado

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/anchorPlate.ts:1395-1402 (checkConcreteCone) y 1546-1553 (checkSplitting)`
- **ID:** `anchorPlate-09-psiec-wrong-reference`

**Descripción**

EN 1992-4 §7.2.1.4(6) define eN como la excentricidad de la resultante de tracción respecto al CENTRO DE GRAVEDAD de los anclajes traccionados. El código calcula el centroide ponderado por Ft respecto al origen de la placa. En partial-lift con 2 barras igualmente cargadas en x=-150 mm, el eN correcto es 0 (resultante en el baricentro del grupo) pero el código obtiene eN=150 → con s_cr=900, ψec=0.75: 25% de capacidad de cono perdida injustificadamente en el caso más común (momento uniaxial). Mayoritariamente conservador, pero con distribuciones asimétricas puede ser ligeramente no conservador (el offset al origen puede acercar el centroide ponderado más que el geométrico).

**Evidencia**

```
eX = tBars.reduce((s, b) => s + b.Ft * b.x, 0) / sumFt;  // respecto a (0,0) de placa
...
const eN = Math.hypot(eX, eY);
const psi_ec_N = 1 / (1 + 2 * eN / s_cr);
— Esperado: eN = |centroide ponderado por Ft − centroide GEOMÉTRICO de los anclajes traccionados| (EN 1992-4 Fig. 7.6), por eje y no como módulo combinado.
```

**Fix sugerido**

const gx = mean(tBars.x); const gy = mean(tBars.y); eX = Σ(Ft·x)/ΣFt − gx; eY = Σ(Ft·y)/ΣFt − gy; y aplicar ψec por componente (ψec,x·ψec,y) como hace la norma.

**Razonamiento del verificador**

Confirmado tras intento de refutación. (1) El código en anchorPlate.ts:1395-1402 y 1546-1553 calcula eX/eY como centroide ponderado por Ft sin restar el baricentro geométrico del grupo traccionado, y la interfaz AnchorBarPosition (líneas 150-151) declara explícitamente que el origen de coordenadas es el centro de la placa. EN 1992-4 §7.2.1.4(6)/Fig. 7.6 define eN respecto al CdG de los anclajes traccionados, no respecto al centro de la placa. (2) No existe clamp/guard que corrija esto: el único guard es sumFt>0. (3) El caso descrito es alcanzable y es el más común: 4 barras con momento uniaxial → 2 barras traccionadas igualmente cargadas en x=-150 → eN correcto=0 (ψec=1.0) pero el código da eN=150 → con hef=300, s_cr=900, ψec=0.75: 25% de capacidad de cono perdida, números verificados. (4) También es alcanzable la dirección no conservadora: layouts 6/8/9 tienen barras intermedias, y con Ft asimétricos el centroide ponderado puede quedar cerca del origen de placa pero lejos del baricentro del grupo (eN subestimado); además, Math.hypot combina ejes como módulo en lugar del producto ψec,x·ψec,y por componente que exige la norma, lo cual es siempre ≥ el producto (no conservador en biaxial). (5) El oracle test (anchorPlateOracle.test.ts:111-114) calcula a mano la misma interpretación errónea (centroide-a-origen como eN), confirmando que el error está consagrado en tests, no corregido en otra capa. Severidad medium correcta: mayoritariamente conservador (sobre-penalización ~25% en el caso típico) pero con configuraciones no conservadoras identificables; afecta a dos checks (cono y splitting).

---

#### 26. [anchorPlate] Fricción: μ=0.4 para superficie rugosa sin respaldo normativo y Nc,G inflado al resolver con momentos ELU

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/anchorPlate.ts:1134, 1188 (μ) y 1947-1951 (Nc_G)`
- **ID:** `anchorPlate-10-friction-mu-and-uls-moment`

**Descripción**

EC3 1-8 §6.2.2(6) da Cf,d = 0.20 para mortero de cemento-arena (el caso declarado del motor: placa sobre grout); 0.4 sólo sería justificable con tratamientos específicos y no aparece en CE Anejo 18 para juntas con mortero. Además, Nc_G se obtiene re-resolviendo con NEd=NEd_G pero manteniendo los Mx/My de ELU (admitido en comentario L1944-1946): con momento alto, Ft_G crece y Nc_G = NEd_G + Ft_G se infla, aumentando la resistencia por fricción μ·Nc,G de forma no conservadora en checkBoltShear y checkBoltInteraction. El test oracle Config C consolida μ=0.4 (Vfric=360 > VEd=40).

**Evidencia**

```
const mu = inp.surface_type === 'roughened' ? 0.4 : 0.2;
const Vfric_kN = mu * Math.max(0, Nc_G_kN);
...
L1949: const solverG = solveAnchorPlate({ ...inp, NEd: inp.NEd_G });  // mismos Mx/My ELU
— Esperado: EC3 1-8 §6.2.2(6) Cf,d=0.20 (mortero); la componente Nc usada en fricción debe corresponder a la combinación concomitante (momentos cuasi-permanentes), no a la envolvente ELU.
```

**Fix sugerido**

Limitar Cf,d a 0.20 salvo justificación documental; para Nc,G usar como mínimo min(Nc_G_con_M_ELU, NEd_G + Ft_G_con_M_G) o conservadoramente Vfric = μ·NEd_G (sin amplificación por Ft del momento ELU).

**Razonamiento del verificador**

CONFIRMADO en su parte principal (μ=0.4), REFUTADA la parte secundaria (Nc_G con M de ELU). (1) μ=0.4: verificado en L1134 y L1188 sin guard ni clamp. El propio header del módulo (L9-11) declara que la placa se asienta SIEMPRE sobre mortero sin retracción (grout) — no hay input que lo elimine, y el motor usa el factor β_j de junta de mortero (EC3 1-8 §6.2.5) en el apoyo. Con grout, el plano de deslizamiento que gobierna es placa-mortero, donde EC3 1-8 §6.2.2(6)/CE Anejo 18 fija Cf,d=0.20 (otros valores requieren ensayo); rugosizar el pedestal bajo el grout no mejora esa interfaz. CE Anejo 11 (artículo citado en el check) no aporta tabla de μ para esta junta, y el μ=0.7 "rough" de EC2 §6.2.5 es interfaz hormigón-hormigón, inaplicable. Agravante encontrado: defaults.ts L861 fija surface_type='roughened' por defecto, así que el μ=0.4 sin respaldo es el comportamiento out-of-the-box, duplicando Vfric (sumado a VRd en checkBoltShear y restado de VEd en checkBoltInteraction, ambas direcciones no conservadoras), y el oracle Config C lo consolida (Vfric=360). (2) Nc_G con momentos ELU: esta parte del hallazgo NO se sostiene como defecto normativo. El modelo de entrada del motor es una única combinación concomitante (NEd, Mx, My, VEd juntos): dentro de ella M_ULS es concomitante con VEd por definición, y EC3 1-8 §6.2.2(6) usa Nc,Ed de la combinación de cálculo considerada — no momentos cuasi-permanentes como exige el auditor. El motor es incluso MÁS conservador que EC3 1-8 al sustituir NEd por NEd_G (Nc real concomitante ≥ Nc(NEd_G, M_ULS) porque Nc crece con N a M fijo). Contar la compresión inducida por el momento (Nc=N+Ft, equilibrio) es físicamente consistente. El único escenario no conservador es que el usuario introduzca envolventes no concomitantes (Mmax de una combinación, Vmax de otra), limitación genérica de concurrencia de inputs ya documentada en el comentario L1944-1946 y que afecta a todo el motor, no un error de fórmula. Veredicto: el defecto es real por la parte de μ=0.4 (default no conservador sin respaldo normativo para junta con grout); severidad medium se mantiene porque duplica un término de resistencia en dos checks de cortante, aunque en muchos diseños FvRd de barras sigue gobernando y con μ=0.2 la fricción a menudo seguiría cubriendo VEd (en Config C: 180 > 40, el test no cambiaría de veredicto).

---

#### 27. [anchorPlate] Longitud de anclaje sin suelo lb,min = max(0.3·lb,rqd; 10φ; 100 mm)

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/anchorPlate.ts:1300, 1322 (checkAnchorageLength)`
- **ID:** `anchorPlate-11-missing-lbmin`

**Descripción**

lb,rqd se escala por la tensión real de la barra (Ft/FtRd) — correcto según EC2 §8.4.4 (σsd) — pero no se aplica el mínimo normativo lb,min de EC2 §8.4.4(1) / CE Anejo 19 §49.5: con Ft pequeño (barras casi descargadas), lb,rqd tiende a milímetros y el check sale verde aunque hef < 10φ. validateAnchorPlate sólo emite un 'warn' si hef < 8φ (L1867), que ni es el límite correcto (10φ en tracción) ni afecta a la utilización.

**Evidencia**

```
const lb_rqd = alpha1 * alpha2 * (inp.bar_diam / 4) * (fyd / fbd) * (Ft_N / FtRd_N);
...
const util = lb_rqd_max / Math.max(inp.bar_hef, 1e-6);
— Esperado: lbd = max(α1·α2·...·lb,rqd ; lb,min) con lb,min = max(0.3·lb,rqd(σsd=fyd); 10·φ; 100 mm) para anclajes en tracción (EC2 §8.4.4(1)).
```

**Fix sugerido**

const lb_rqd_full = (φ/4)·(fyd/fbd); const lb_min = Math.max(0.3 * lb_rqd_full, 10 * inp.bar_diam, 100); util = Math.max(lb_rqd_max, lb_min) / hef.

**Razonamiento del verificador**

Confirmado tras leer checkAnchorageLength completo (anchorPlate.ts:1219-1332) y los helpers de anchorBars.ts: lb_rqd se escala por Ft/FtRd (correcto per EC2 §8.4.3 con σsd) pero NO se aplica el suelo lb,min = max(0.3·lb,rqd; 10φ; 100 mm) de EC2 §8.4.4(1) / CE Anejo 19 §49.5 — el mismo artículo que el check cita en su campo 'article'. No hay clamp ni guard en ninguna parte: los α solo se acotan a [0.7,1.0] y util = lb_rqd_max/hef directamente. El caso límite es alcanzable: barras con Ft pequeño entran al bucle (inTension && Ft>0, sin cota inferior); p.ej. φ20/C25/B500S con Ft/FtRd=0.2 y α1·α2=0.49 da lb_rqd≈79 mm → util verde con hef=160 mm, pese a que lb,min=10φ=200 mm exige fail. validateAnchorPlate:1867 solo emite warn no bloqueante con hef<8φ (límite incorrecto, no afecta utilización, ni siquiera se dispara en el ejemplo). Evidencia decisiva: el motor hermano rcSlabs SÍ implementa lb_min = max(0.3·lb_rqd, 10·Ø, 100) (rcSlabs.test.ts:385), demostrando que el proyecto reconoce la cláusula pero anchorPlate la omite. Único matiz: el fix propuesto usa 0.3·lb,rqd(fyd) en vez de 0.3·lb,rqd(σsd) (ligeramente sobre-conservador), pero los suelos 10φ/100mm —los que gobiernan el caso degenerado— son correctos. Severidad medium adecuada: resultado no conservador en check normativo, mitigado parcialmente porque el cono de hormigón (∝hef^1.5) suele gobernar con hef somero.

---

#### 28. [anchorPlate] Solver no convergido ('biaxial-grid' / residuos no nulos) no penaliza el veredicto global

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/anchorPlate.ts:1929-1973 (calcAnchorPlate) vs anchor-plate/types.ts:196-203`
- **ID:** `anchorPlate-12-nonconverged-not-failed`

**Descripción**

types.ts documenta la decisión de modelar 'no-go porque el solver no garantizó equilibrio' como fail + nota, pero calcAnchorPlate nunca consulta solver.converged ni los residuals: cuando el grid biaxial cae al fallback dFallback (sin cambio de signo, L631-634) con residuo > tol, los Ft asignados a las barras SUBESTIMAN la demanda real (el momento no equilibrado se descarta) y los checks aguas abajo pueden salir todos verdes. El caso saturado suele cazarse vía interaction (FtMax=FtRd → util 1.0), pero el caso 'residuo moderado sin saturación' (α < α_cap con momento no proyectado) pasa sin marca alguna en overallStatus.

**Evidencia**

```
calcAnchorPlate L1929-1971: const solver = solveAnchorPlate(inp); ... overallStatus = hasFailValidation ? 'fail' : toStatus(worstUtil); — ninguna referencia a solver.converged ni a solver.residuals.
types.ts L199-203: 'we model that within the existing taxonomy as fail + an explicit note' — intención no implementada en el veredicto.
```

**Fix sugerido**

En calcAnchorPlate: if (!solver.converged) overallStatus = 'fail' (o añadir un CheckRow 'solver-equilibrium' con util = 1 + residuo/tol) para que el estado APROX no pueda quedar verde.

**Razonamiento del verificador**

Verificado en código: calcAnchorPlate (anchorPlate.ts L1929-1973) computa overallStatus = hasFailValidation ? 'fail' : toStatus(worstUtil) sin consultar jamás solver.converged ni solver.residuals (grep global: converged solo se usa en pdf/anchorPlate.ts:328 para un disclaimer ámbar y en tests). anchor-plate/types.ts L196-203 documenta explícitamente la intención de modelar el no-equilibrio como 'fail + nota', no implementada en el veredicto ni en adapter.ts. El caso límite es alcanzable: el solver biaxial usa dFallback sin cambio de signo (L631-634) y converged=bestR<=tol con tol apretada (0.5%·M_ext, L726-732); puede haber residuo > tol SIN barra saturada (mínimo local pese al multi-seed, o sign-change estrecho que el scan de 60 pasos se salta), descartando el momento no equilibrado y subestimando los Ft — con utils<0.8 todos los checks salen ok y overallStatus queda verde. solvePureTension no convergido (L877-895) tampoco fuerza fail y ni siquiera tiene badge en la UI (AnchorPlateResults.tsx L154 solo muestra 'APROX · grid' para mode==='biaxial-grid'). El caso saturado sí se caza vía Ft=FtRd → util=1.0 → toStatus fail, pero eso no cubre el residuo moderado sin saturación. Mitigación solo presentacional (badge UI biaxial + recuadro PDF), insuficiente para refutar: el veredicto vinculante puede ser verde con equilibrio no garantizado, contradiciendo la intención documentada.

---

#### 29. [isolatedFooting] Vuelco: momento estabilizador omite el axil N y duplica la seguridad (γ ELU + FS 1.5)

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/isolatedFooting.ts:366-374`
- **ID:** `isolatedFooting-overturn-stab-03`

**Descripción**

El momento estabilizador solo incluye los pesos propios (W_footing + W_soil) y omite el axil de cálculo N, que es la principal acción estabilizadora de una zapata. Según CTE DB-SE-C (estado límite EQU, tabla 2.1), las acciones permanentes estabilizadoras (incluido N permanente) entran con γ = 0.9 y las desestabilizadoras con γ = 1.8; aquí en cambio se mayoran los momentos con γ ELU (1.35) y además se exige FS ≥ 1.5, acumulando 1.35·1.5 = 2.025 sobre la acción desestabilizadora mientras N estabilizador entra con factor 0. El resultado es muy conservador: con los defaults (N=300 kN, B=1.8) un My de solo ~36 kNm ya da FS<1.5 y la zapata se reporta como fallo de vuelco, cuando con N incluido (0.9·405·0.9 m ≈ 328 kNm estabilizadores) el FS real supera 7. El test (isolatedFooting.test.ts:147-155) consagra esta formulación errónea.

**Evidencia**

```
Líneas 369-372: `const M_dest_x = Math.abs(My_elu) + Math.abs(H_elu) * h; ... const M_stab_x = (W_footing + W_soil) * (B / 2);` — falta el término N·(B/2) estabilizador. CTE DB-SE-C §2.4.2.2 / tabla 2.1 (situación EQU): Ed,dst ≤ Ed,stb con γ desestabilizador 1.8 y estabilizador 0.9 sobre acciones características, no FS=1.5 sobre acciones ya mayoradas a 1.35.
```

**Fix sugerido**

Incluir el axil vertical como estabilizador: M_stab = (0.9·N_k + W_footing + W_soil)·(B/2) con acciones características, y comparar M_dest (con γ=1.8 sobre características, o equivalentemente FS≥1.8/0.9=2 sobre características) según CTE DB-SE-C tabla 2.1; eliminar la doble aplicación γ_ELU × FS.

**Razonamiento del verificador**

Confirmado leyendo el código. Líneas 369-374: M_stab_x/y = (W_footing + W_soil)·(B/2 o L/2), sin ningún término del axil N; el comentario de línea 366 ("weights stabilize") confirma que es intencional, y no hay guard/clamp posterior — el check overturn-x/y se publica siempre que M_dest>0 y un fail invalida el resultado (línea 608). El desestabilizador usa My_elu/H_elu (ya mayorados ×1.35 vía deriveLoads) y encima se exige FS≥1.5 (FS_VUELCO_MIN, línea 85), acumulando ≈2.025 sobre el desestabilizador mientras N estabilizador entra con factor 0, contra CTE DB-SE-C tabla 2.1 (EQU: γdst=1.8, γstb=0.9 sobre características). Verificación numérica con defaults: M_stab_x = (48.6+11.088)·0.9 = 53.72 kNm, luego FS<1.5 con My característico ≈26.5 kNm pese a que la resultante (ex≈0.09 m ≪ B/6=0.3 m) está dentro del núcleo central y la zapata es físicamente estable (con N incluido FS≈8). Intentos de refutación fallidos: el pilar está centrado (brazo de N = B/2 correcto), el motor sí usa N_elu como favorable en deslizamiento (línea 377, incoherencia interna), y la clasificación overturning_fail del bearing SLS sí incluye N pero es un check independiente que no mitiga éste. El test (isolatedFooting.test.ts:147-155) asevera la fórmula sin N, consagrando el defecto. Dirección conservadora (falsos fallos, no inseguro), por lo que medium es la severidad correcta.

---

#### 30. [isolatedFooting] Punzonamiento: β=1.0 con momentos presentes, sin deducción de la reacción del terreno ni comprobación vRd,max en u0

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/isolatedFooting.ts:462-471 y 570`
- **ID:** `isolatedFooting-punching-06`

**Descripción**

Tres desviaciones respecto a CE/EC2 §6.4 en la rama flexible: (1) se usa β=1.0 explícito aunque el motor admite Mx/My; con transferencia de momento β > 1 (EC2 6.4.3, fórmula con k·MEd·u1/(VEd·W1)), subestimando vEd; (2) no se deduce la reacción del terreno dentro del perímetro de control (VEd,red = VEd − ΔVEd, EC2 6.4.4(2)) — esto es conservador y compensa parcialmente lo anterior, pero en zapatas el área dentro de u1 puede ser >25% del total y el resultado neto es impredecible; (3) no se comprueba vEd ≤ vRd,max = 0.5·ν·fcd en el perímetro del pilar u0, comprobación obligatoria. Además, para zapatas EC2 exige barrer perímetros a distancia a < 2d con vRd,c amplificado por 2d/a, no solo el perímetro a 2d.

**Evidencia**

```
Líneas 464-465: `const u1_rect = 2 * (bc * 1000 + hc * 1000) + 2 * Math.PI * 2 * d_avg; const vEd_punch = (1.0 * N_elu * 1000) / (u1_rect * d_avg);` — el comentario de la línea 462 reconoce 'β=1.0'. EC2/CE Anejo 19 §6.4.3(3): β = 1 + k·(MEd/VEd)·(u1/W1) cuando hay momento; §6.4.4(2): en zapatas VEd,red = VEd − ΔVEd y perímetros a ≤ 2d; §6.4.5(3): vEd,u0 ≤ vRd,max.
```

**Fix sugerido**

Calcular β según EC2 6.4.3 a partir de ex_Ed/ey_Ed (o usar el método simplificado), deducir la reacción del terreno dentro del perímetro (ΔVEd = σ_Ed·A_u1), añadir la comprobación de compresión de bielas en u0 (vRd,max = 0.5·ν·fcd con ν = 0.6(1−fck/250)), y barrer perímetros a < 2d con vRd,c·2d/a.

**Razonamiento del verificador**

Verificado en el código real. (1) Línea 465 usa β=1.0 hardcodeado (comentario línea 462 lo reconoce) mientras el motor acepta Mx/My sin restricción y calcula ex_Ed/ey_Ed (l.381-382) que NO se propagan al punzonamiento; con transferencia de momento EC2/CE Anejo 19 §6.4.3 exige β>1 (y EHE-08 art. 46.3 también: β=1.15/1.4/1.5), luego vEd se subestima en un caso plenamente alcanzable (zapata flexible + momentos, rama activa en l.570). (2) No existe deducción ΔVEd de la reacción del terreno dentro de u1 (grep de A_u1/ΔV sin resultados) — conservador, compensa parcialmente lo anterior, como ya admitía el auditor. (3) No existe en todo el archivo la comprobación vEd ≤ vRd,max en u0 (grep de vRd_max/0.5·fcd/u0/ν sin resultados); es obligatoria en EC2 §6.4.5(3) y EHE-08 46.4 y su omisión es inconservadora para zapatas gruesas con N alto y pilar pequeño. (4) Solo se comprueba el perímetro a 2d, sin barrido a<2d con vRd,c·2d/a (EC2 6.4.4(2) para zapatas) — desviación menor, rara vez determinante. Refutaciones intentadas y descartadas: el gating rígido/flexible no cubre el caso (punzonamiento activo en flexible); la presión uniforme de Meyerhof solo alimenta flexión/cortante, no el punzonamiento; ninguna norma aplicable (CE Anejo 19, EHE-08 art. 46) permite β=1 con momento; los tests no contienen ninguna aserción de punzonamiento que documente una simplificación intencionada. El hallazgo se sostiene; severidad medium adecuada porque la inconservaduría es dependiente del caso y parcialmente compensada por la omisión conservadora de ΔVEd.

---

#### 31. [isolatedFooting] Falta la comprobación de anclaje de la armadura (exigida tanto en zapata rígida como flexible)

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/isolatedFooting.ts (ausente; bloque de checks 473-606)`
- **ID:** `isolatedFooting-anchorage-07`

**Descripción**

El motor no comprueba en ningún punto la longitud de anclaje de las barras. Para zapata rígida, EHE-08 58.4.1.2 / CE exigen que la armadura del tirante se ancle para la fuerza Td a partir del extremo (anclaje por prolongación, patilla o soldadura — frecuentemente condicionante porque el tirante trabaja a plena tracción hasta cerca del borde). Para zapata flexible, la armadura de flexión debe anclarse desde la sección de referencia (EHE 58.4.2.1 / CE Anejo 19 §9.8.2.2, que define la tracción Fs = R·ze/zi en zapatas). El prompt de normativa aplicable cita expresamente 'anclaje' como alcance del motor y la verificación está ausente: una zapata con barras rectas cortas puede mostrarse íntegramente en verde siendo el anclaje el modo de fallo real.

**Evidencia**

```
Búsqueda en el archivo completo: no existe ningún cálculo de lb, lbd, fbd ni check con id de anclaje; los checks construidos (líneas 474-606) son bearing, overturn-x/y, sliding, biela-tirante-x/y, flexion-x/y, cortante-x/y, punzonamiento, cuantia-min-x/y y separacion-x/y. EHE-08 art. 58.4.1.2: 'La armadura se anclará a partir de una sección situada a... debiendo anclarse para una fuerza igual a Td' (zapata rígida); CE Anejo 19 §9.8.2.2 para zapata flexible.
```

**Fix sugerido**

Añadir un check de anclaje: calcular lbd = (φ/4)·(fyd_requerida/fbd) con fbd = 2.25·η1·η2·fctd, comparar con la longitud disponible desde la sección de referencia (o desde el extremo para el tirante rígido, con reducción por patilla), y emitir CheckRow 'anclaje-x'/'anclaje-y'.

**Razonamiento del verificador**

Confirmado tras intentar refutarlo. (1) Inventario exacto: el motor construye únicamente los checks bearing, overturn-x/y, sliding, biela-tirante-x/y, flexion-x/y, cortante-x/y, punzonamiento, cuantia-min-x/y y separacion-x/y (líneas 474-606); no existe ningún cálculo de lb/lbd/fbd ni check de anclaje en el archivo, ni en tests, UI o PDF del módulo (grep sobre **/*isolated* sin resultados; los únicos hits de 'anclaje' del repo son del módulo aparte de placas de anclaje). (2) No hay clamp/guard ni exclusión documentada: MODULE_DOCS de normativaData.ts no tiene entrada de zapata aislada con limitación sobre anclaje, y el motor no tiene input de patilla/gancho que pudiera suplirlo. (3) La desviación normativa es real y agravada: el propio motor cita 'CE art. 55.2 / EHE 58.4.1.2' en los checks biela-tirante (líneas 541-542) y calcula Td según ese artículo, pero omite la cláusula de anclaje del mismo artículo (anclar la armadura del tirante para la fuerza Td, condicionante habitual en zapatas rígidas); para la rama flexible aplica CE Anejo 19 / EC2 §9.8.2.2 (Fs = R·ze/zi), también ausente. (4) El caso límite es alcanzable: las validaciones (líneas 334-344) solo exigen geometría positiva; una zapata rígida (voladizos cortos) tiene longitud disponible ~300-500 mm frente a lb recta del orden de 700-900 mm para φ20 B500S/C25 a plena tensión, y el motor devuelve valid:true con todo en verde. Severidad medium se mantiene: check condicionante ausente que puede dar verde a un diseño inseguro, aunque es una omisión de verificación de detalle y la lista pública de artículos de zapatas no promete anclaje al usuario final.

---

#### 32. [masonryWalls] β §5.4 omite el factor (1.5 − 1.1·Ab/Aef) y usa el centro del apoyo en lugar de su borde

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/masonryWalls.ts:689-708 (betaConcentracion)`
- **ID:** `masonryWalls-04`

**Descripción**

La fórmula normativa (CTE DB-SE-F §5.4.2, espejo de EC6 §6.1.3) es β = (1 + 0.3·a1/hc)·(1.5 − 1.1·Ab/Aef), con 1 ≤ β ≤ min(1.25 + a1/(2hc), 1.5), donde Ab es el área cargada y Aef el área efectiva de difusión. El motor implementa solo β = 1 + 0.3·a/h capado en [1.0, 1.5]: (a) omite el segundo factor, que penaliza apoyos grandes respecto al área efectiva — cuando Ab/Aef es alto el β normativo cae por debajo del calculado (lado inseguro); (b) `a` se mide al centro del apoyo, no a su borde (a1 normativo), lo que infla β para apoyos anchos. La limitación está documentada (S2, líneas 64-69: 'puede subestimar η para apoyos pequeños sobre muros cortos'), pero al ser una desviación del artículo citado en los comentarios del propio motor y potencialmente insegura, debe corregirse o como mínimo emitir warning visible en PDF cuando Ab/Aef sea desfavorable.

**Evidencia**

```
Líneas 704-708: `const a = Math.min(x_carga, Math.max(0, L_muro - x_carga)); const ratio = H_planta > 0 ? a / H_planta : 0; return Math.max(1.0, Math.min(1.5, 1 + 0.3 * ratio));`. Fórmula esperada (EC6 6.1.3 / DB-SE-F §5.4.2): β = (1 + 0.3·a1/hc)·(1.5 − 1.1·Ab/Aef) con cap min(1.25 + a1/(2hc), 1.5).
```

**Fix sugerido**

Incorporar Ab = b_apoyo·t y Aef estimada por difusión a 60° hasta media altura (lef·t), aplicar el factor (1.5 − 1.1·Ab/Aef) y el cap normativo min(1.25 + a1/(2hc), 1.5); medir a1 al borde del área cargada (x_carga − b_apoyo/2).

**Razonamiento del verificador**

Confirmado tras intentar refutarlo. (1) El fragmento citado es exacto: betaConcentracion (masonryWalls.ts:704-708) implementa solo β = clamp(1+0.3·a/h, 1.0, 1.5) con a medido al CENTRO de la carga, y no existe ningún guard/clamp adicional en los puntos de uso (líneas 1118-1138) que reintroduzca el factor (1.5−1.1·Ab/Aef) ni el cap min(1.25+a1/(2hc), 1.5) de EC6 §6.1.3 eq. 6.10 / DB-SE-F §5.4. El propio comentario S2 (líneas 64-69) admite que "CTE §5.4.2 también modula por el cociente A_ef/A_b". (2) La fórmula normativa citada por el auditor es correcta. (3) El lado inseguro es alcanzable: cuando Ab/Aef > ~0.45 el β normativo colapsa hacia 1.0 mientras el motor da hasta 1.5. Esto ocurre de forma realista en la ruta de concentraciones heredadas (líneas 1133-1136), donde el ancho de apoyo efectivo es el ancho COMPLETO del machón emisor (fácilmente >1 m, vs h≈2.7 m) y originX es su centro — justo donde medir a al centro en vez de al borde (a1) infla además el primer factor. b_apoyo directo tampoco tiene límite superior salvo el ancho del machón (línea 1118). (4) Agravante: la dirección documentada en S2 ("subestimar η para apoyos pequeños sobre muros cortos") es la contraria a la real — apoyos pequeños (Ab/Aef bajo) son el lado conservador porque el motor también omite el boost hasta 1.5×; el régimen inseguro (Ab/Aef alto) no está documentado ni genera warning en UI/PDF (el único warning visible es el de fm, línea 286). Atenuantes que justifican mantener medium y no subir: para puntuales directos típicos (b_apoyo 100-300 mm) el motor es conservador, y en los casos de apoyo ancho la comprobación global con Φ (1/Φ suele superar β) tiende a gobernar sobre etaConc, limitando el impacto práctico a configuraciones de muro robusto (Φ alto) con concentraciones heredadas anchas.

---

#### 33. [masonryWalls] El peso del antepecho bajo ventanas desaparece del modelo de cargas

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/masonryWalls.ts:966-967 (g_propio del dintel) y 1180-1204 (emisión de segments a la planta inferior)`
- **ID:** `masonryWalls-05`

**Descripción**

El peso propio de la fábrica se contabiliza en dos sitios: (1) la franja SOBRE el hueco vía g_propio del dintel (h_muro_sobre = H − (y+h)), que llega a los machones como reacción y cascadea hacia abajo; (2) el fuste de cada machón vía peso_machon. Pero la franja de fábrica BAJO una ventana (el antepecho, de y=0 a y=alféizar, en el ancho del hueco) no aparece en ninguno de los dos: no carga al dintel, no carga a los machones de su planta (correcto, apoya en el forjado/muro inferior) y tampoco se emite en newSegments a la planta de abajo. Para una ventana típica (0.9×1.0 m de antepecho, t=240, γ=18) son ~3.9 kN característicos omitidos por ventana y por planta, sistemáticamente del lado inseguro en las plantas inferiores de un edificio multi-planta con muchas ventanas.

**Evidencia**

```
Línea 966: `const h_muro_sobre = Math.max(0, pl.H - (h.y + h.h));` — solo la franja superior. Líneas 1182-1203: el loop de emisión itera `for (const m of machones)` y emite N_lineal+peso_machon y N_puntual+N_dinteles; no existe ningún término para la fábrica situada bajo huecos con y>0.
```

**Fix sugerido**

En la emisión de segments (i > 0), añadir por cada hueco tipo 'ventana' un segment distributed sobre [h_x1, h_x2] con w = γG·peso_propio·(t/1000)·(h.y/1000) representando el antepecho que apoya directamente sobre la planta inferior.

**Razonamiento del verificador**

Confirmado tras lectura directa del código. El peso propio de fábrica se contabiliza exactamente en 3 puntos (grep exhaustivo de peso_propio: líneas 967, 1095, 1185): (1) g_propio del dintel = solo la franja SOBRE el hueco (h_muro_sobre = H − (y+h), línea 966); (2) peso_machon = fuste completo H de los machones, que por getMachonesPlanta (líneas 718-745) excluyen el intervalo x de cada hueco; (3) el mismo peso_machon en la emisión de segments. El bloque de emisión a la planta inferior (líneas 1180-1204) itera solo machones y no contiene ningún término por hueco. La franja de antepecho bajo ventanas (ancho w, altura y, con y>0 documentado como alféizar en la interface Hueco línea 407 y presente en los datos demo con y=1000/1900) no entra en ningún flujo de carga: ni al dintel, ni a los machones de su planta, ni a la planta inferior. Intenté refutarlo: (a) "va en q_G del forjado del usuario" falla porque el motor auto-computa el resto del peso propio del muro, y el comentario de líneas 960-965 documenta que se corrigió la omisión análoga de la franja sobre puertas, mostrando la intención de modelar todo el peso propio automáticamente; (b) "se captura vía integrateLoad" falla porque topPlusFloor/loadsAtTop solo contienen herencia + forjado + emisiones de machones. Magnitud ~3.9 kN característicos por ventana y planta (verificada), sistemáticamente del lado inseguro y acumulativa hacia plantas bajas. El test de balance (test línea 660) solo cubre el caso sin huecos y no lo detecta. Severidad medium es adecuada: error no conservador y sistemático, pero de pocos % sobre N_Ed típicos.

---

#### 34. [masonryWalls] El clamp Φ ≥ 0.05 enmascara excentricidad fuera de la sección (e_total ≥ t/2)

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/masonryWalls.ts:1061-1062`
- **ID:** `masonryWalls-06`

**Descripción**

Cuando e_total ≥ t/2 la resultante cae fuera del espesor del muro: el término (1 − 2·e_total/t) es ≤ 0 y la norma implica capacidad nula (fallo por vuelco local de la sección, no por agotamiento a compresión). El motor calcula phi_unif negativo o nulo y luego lo eleva a Φ=0.05, otorgando un 5% de capacidad residual ficticia. Un muro muy poco cargado con excentricidad patológica (e_apoyo introducido a mano vía URL o input extremo) puede así dar η < 1 y veredicto CUMPLE en un estado físicamente inestable. Lo mismo ocurre con λ ≥ 40, donde el factor de pandeo llega a 0 y el clamp lo reflota a 0.05.

**Evidencia**

```
Líneas 1061-1062: `const phi_unif = (1 - 2 * e_total / t) * (...); const Phi = Math.max(0.05, phi_unif);` — para e_total = 0.55·t, phi_unif < 0 pero Phi = 0.05 > 0. Comportamiento esperado: si (1 − 2·e/t) ≤ 0, la comprobación N_Ed ≤ Φ·f_d·A debe fallar siempre (Φ = 0) o el motor devolver invalid/fail explícito.
```

**Fix sugerido**

Distinguir el caso: si (1 − 2·e_total/t) ≤ 0, marcar la planta como fail con motivo 'excentricidad fuera de la sección (e ≥ t/2)' en lugar de aplicar el suelo 0.05; reservar el clamp solo como guard numérico cuando phi_unif es positivo pero minúsculo.

**Razonamiento del verificador**

Verificado en código: las líneas 1061-1062 son exactamente como las cita el auditor y no hay guard previo. validateState (816-879) no acota e_apoyo, e_total ni λ; e_apoyo es un NumField libre (MasonryWallsInputs.tsx:640) y el motor lo usa sin clamp (línea 912-913). El régimen phi_unif ≤ 0 es alcanzable incluso sin URL-hacking: eApoyoForjado(t, a=0)=t/2, y el propio test del repo ('Φ tiene clamp inferior 0.05', test:736-748) construye e_apoyo≈t/2 y asegura Phi≥0.05, confirmando que el clamp opera en ese régimen como 'feature'. Con Phi=0.05, N_Rd=0.05·f_d·A es finito y overallStatus (1255-1261) se calcula SOLO con etaMax, así que un muro poco cargado con e_total≥t/2 devuelve veredicto CUMPLE en un estado donde la norma (DB-SE-F §5.2.4 / EC6 §6.1.2.2: Φ=1−2·e/t, capacidad nula si la resultante sale de la sección) implica capacidad cero. No existe ningún check de e_total vs t/2 en la UI (solo un ValueRow informativo en MasonryWallsResults.tsx:192). Matiz que rebaja parcialmente la rama de λ: la UI sí muestra un check separado λ/27 que pasa a 'fail' con λ≥27 (MasonryWallsResults.tsx:99-108), por lo que el caso λ≥40 queda visible en la lista de comprobaciones aunque el badge global y el η% lo ignoren; en cambio la rama e≥t/2 no tiene flag alguno. El comentario S1 del header documenta la divergencia de la fórmula de λ pero no el régimen e≥t/2. El fix propuesto (fail explícito cuando 1−2e/t≤0, reservando el clamp como guard numérico para phi_unif positivo minúsculo) es coherente con la propia filosofía del módulo ('preferimos hard fail con motivo claro vs smear silencioso', línea 1065-1067). Severidad medium se mantiene: requiere inputs patológicos + carga ligera para voltear el veredicto, pero es una herramienta con responsabilidad normativa y el estado mostrado como CUMPLE es físicamente inestable.

---

#### 35. [rcColumns] Umbral fijo λ ≤ 25 para despreciar el 2º orden en lugar de λ_lim = 20·A·B·C/√n — inseguro con axil alto

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcColumns.ts:248, 256`
- **ID:** `rcCol-lambdaLim-01`

**Descripción**

El motor anula e2 cuando λ ≤ 25, umbral fijo. CE Anejo 19 art. 5.8.3.1 define λ_lim = 20·A·B·C/√n con n = NEd/(Ac·fcd); con los valores por defecto (A=0.7, B=1.1, C=0.7) λ_lim = 10.8/√n, que es INFERIOR a 25 en cuanto n > 0.19 — régimen habitual en pilares de edificación (el propio caso por defecto del motor tiene n≈0.33 → λ_lim≈18.7). Un pilar con λ=22 y n=0.5 (λ_lim≈15.3) ve su e2 puesto a cero cuando la norma exige considerarlo (~8-9 mm adicionales en un pilar de 300, ≈+30% de momento). El efecto está parcialmente amortiguado porque e_min y e_imp siempre se aplican, pero el check puede dar verde en casos que la norma no permite despreciar el 2º orden.

**Evidencia**

```
L248: `const e2_y = lambda_y > 25 ? curv_y * Lk_mm * Lk_mm / 10 : 0;` y L256 análoga para z. Norma esperada: e2 despreciable solo si λ < λ_lim = 20·A·B·C/√n (Anejo 19 expr. 5.13N); el corte fijo en 25 solo es seguro para n ≤ ~0.19.
```

**Fix sugerido**

Calcular λ_lim = 20·0.7·1.1·0.7/√(NEd/(b·h·fcd)) por eje y usar `lambda > Math.min(lambda_lim, 25)` (o directamente λ_lim) como condición para activar e2; reflejar λ_lim en el texto de los checks lambda-y/lambda-z.

**Razonamiento del verificador**

Verificado en código: L248/L256 de rcColumns.ts anulan e2 con un corte fijo λ ≤ 25 y no existe ningún cálculo de λ_lim, guard o clamp en el resto del archivo (leído completo); los textos de los checks lambda-y/z (L309/L323) y los tests (L121-163) consagran el mismo umbral fijo. El método implementado para e2 (1/r = fyd/(Es·0.45·d), e2 = (1/r)·Lk²/10) es exactamente la curvatura nominal de CE Anejo 19/EC2 5.8.8, y dentro de ese marco el criterio para despreciar el 2º orden es λ_lim = 20·A·B·C/√n (expr. 5.13N) = 10.78/√n con los valores por defecto — inferior a 25 en cuanto n > 0.186. El caso es alcanzable sin obstáculo: con los defaults del motor (300×300, C25, Nd=500) n = 500/1500 = 0.333 → λ_lim ≈ 18.7, y la única validación de axil es Nd ≥ 1 kN. Un pilar rutinario (h=300, Lk=2.1 m → λ=24.2, Nd=750 → n=0.5, λ_lim≈15.2) ve e2 ≈ 8.5 mm puesto a cero cuando la norma exige considerarlo (~+25-35% de MEd_tot), pudiendo pasar biaxial-check de fail a ok. Intentos de refutación fallidos: no hay guard previo; el suelo e_min/e_imp solo amortigua (el auditor ya lo descontó); y ninguna lectura alternativa de la norma (ni la λ_inf tipo EHE-08, también dependiente del axil) justifica un 25 fijo independiente de n — ese 25 procede del ENV 1992 derogado con momentos extremos iguales. Severidad medium correcta: no conservador pero en ventana acotada (λ_lim < λ ≤ 25 con n alto) y parcialmente amortiguado.

---

#### 36. [rcColumns] Separación máxima de cercos basada en 12·Ø_esquina en lugar de Ø_mínimo longitudinal

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcColumns.ts:539-552`
- **ID:** `rcCol-stirrupSpacing-01`

**Descripción**

El límite se calcula como min(12·cornerBarDiam, min(b,h), 300). Tanto EHE (st ≤ 15·Ømin de la armadura comprimida) como CE Anejo 19 art. 9.5.3 (scl,tmax = min(20·Ømin, menor dimensión, 400), reducido ×0.6 en zonas críticas → 12·Ømin) referencian el diámetro MÍNIMO de las barras longitudinales, porque el cerco debe arriostrar la barra más propensa a pandear. Usar el diámetro de esquina (normalmente el mayor) es no conservador cuando hay intermedias más finas: con esquinas Ø25 e intermedias Ø12, el código permite s = min(300, b, 300) = 300 mm cuando el límite normativo es 20·12 = 240 mm (o 15·12 = 180 mm según EHE). Las intermedias Ø12 quedan sin arriostrar adecuadamente.

**Evidencia**

```
L541: `const sMax = Math.min(12 * cornerBarDiam, Math.min(b, h), 300);` — esperado: usar Ømin = min(cornerBarDiam, barDiamX si nBarsX>0, barDiamY si nBarsY>0) conforme a Anejo 19 art. 9.5.3(3) (20·Ømin) o criterio EHE (15·Ømin). Nótese que el check de diámetro de cerco (L525) sí usa correctamente el Ø máximo.
```

**Fix sugerido**

Sustituir cornerBarDiam por el diámetro longitudinal mínimo presente en la sección: `const minLongDiam = Math.min(cornerBarDiam, ...(nBarsX>0?[barDiamX]:[]), ...(nBarsY>0?[barDiamY]:[])); const sMax = Math.min(15*minLongDiam, Math.min(b,h), 300);`

**Razonamiento del verificador**

Confirmado tras intentar refutarlo. (1) El código en rcColumns.ts L541 es exactamente `Math.min(12 * cornerBarDiam, Math.min(b, h), 300)`: solo usa el diámetro de esquina. (2) No hay guard ni clamp: buildSectionModel (L155-201) solo valida cornerBarDiam>=6 y nBars>=0; barDiamX/Y son independientes, y la UI (RCColumnsInputs.tsx L167-175) ofrece la misma lista de diámetros para esquinas e intermedias, por lo que Ø25 esquina + Ø12 intermedia es alcanzable. (3) La norma sí referencia el diámetro MÍNIMO longitudinal: Anejo 19 art. 9.5.3(3) scl,tmax = min(20·Ømin, menor dimensión, 400) y EHE-08 42.3.1 (15·Ø de la barra comprimida más delgada), porque el cerco arriostra la barra más esbelta. (4) Cuantitativamente: Ø25 esquinas + Ø12 intermedias, b=h=300 → código permite s=300 mm cuando la norma limita a 240 mm (20·12) o 180 mm (15·12 EHE): no conservador. (5) El check vecino stirrup-diam (L525) sí agrega correctamente max(cornerBarDiam, barDiamX, barDiamY), lo que evidencia que la asimetría no es intencional. (6) Los tests (L320-332) solo cubren diámetro uniforme y nunca ejercitan el caso. Matices: el coeficiente 12 (vs 20 de la norma) hace el check conservador en el caso habitual de diámetro uniforme; el defecto solo aflora cuando Øesquina/Ømin > ~5/3 (ratios realistas como Ø25/Ø12 o Ø20/Ø10). Es un check de detallado (pass/fail), no afecta al cálculo resistente, por lo que severity medium es adecuada.

---

#### 37. [rcSlabs] Comprobación de flecha (ELS) totalmente ausente

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcSlabs.ts (todo el archivo — calcForjados líneas 296-689)`
- **ID:** `rcSlabs-flecha-01`

**Descripción**

El módulo se declara como 'Forjado: ... flecha, fisuración' con CTE DB-SE como normativa de flecha, pero no existe ninguna comprobación de deformaciones: ni flecha calculada (inercia fisurada/Branson, flecha activa L/400-L/500, integridad tabiques L/500+...), ni siquiera la comprobación simplificada de esbeltez L/d que exime del cálculo (EHE-08 art. 50.2.2.1 Tabla 50.2.2.1.a / CE Anejo 19 §7.4.2). El motor dispone de todos los datos necesarios (L=spanLength, d, As, Ecm, M_G, M_Q, ψ2). En forjados la flecha es con frecuencia el estado límite que gobierna el canto; su omisión permite validar forjados esbeltos que incumplen ELS (verde cuando debería fallar). Otros motores del repo sí la implementan (steelBeams.ts:219 'Deflection (CTE DB-SE 4.3.3)', timberBeams.ts:232).

**Evidencia**

```
Cabecera líneas 1-3 lista sólo 'CE art. 21 (b_eff), art. 42 (flexión), art. 42.3 (cuantías), art. 44 (cortante), art. 49.2.4 (fisuración), art. 69.4'. grep de 'flecha|deflection' en rcSlabs.ts: 0 resultados. CTE DB-SE §4.3.3.1 exige verificar flecha (1/500 tabiques frágiles, 1/400 ordinarios, 1/300 resto); EHE art. 50 / CE Anejo 19 §7.4 exigen comprobar deformaciones o cumplir L/d límite.
```

**Fix sugerido**

Implementar al menos la comprobación de esbeltez L/d (EHE Tabla 50.2.2.1.a: forjado reticular/losa según ρ) como check bloqueante, o el cálculo de flecha activa con inercia equivalente (Branson) bajo combinación cuasipermanente, comparada con los límites de CTE DB-SE 4.3.3.1.

**Razonamiento del verificador**

CONFIRMADO el núcleo técnico, REFUTADA la premisa que justificaba severidad high. (1) Verificado leyendo rcSlabs.ts completo (689 líneas): no existe ninguna comprobación de flecha ni la exención simplificada L/d — grep de flecha|deflection|esbeltez en el archivo: 0 resultados. Los checks son flexión (art.42), cuantías (42.3), separación (69.4), fisuración wk (49.2.4 sólo XC2+), anclaje (69.5.1.1) y cortante (art.44). El motor sí dispone de los datos para al menos L/d (spanLength, tipoVano, d, As, Ecm, y ya combina M_G+ψ2·M_Q en líneas 329-331 para wk), y los motores hermanos sí implementan flecha (steelBeams.ts:219 CTE DB-SE 4.3.3; timberBeams.ts:232-370). Un forjado esbelto pasa con todo verde y valid:true, sin siquiera la fila info de descargo que el propio módulo usa para otras limitaciones (nota biaxial línea 672, armadura de reparto línea 659) — el caso límite es alcanzable con cualquier input válido. (2) REFUTADA la premisa del auditor: el módulo NO se declara como 'flecha, fisuración' en ninguna parte. La cabecera (líneas 1-3) no menciona flecha; modules.tsx:50-55 anuncia 'Forjados — CE art.42 · 44'; README.md:26 igual. Además normativaData.ts:66 declara públicamente 'art.50 Deformaciones diferidas y fluencia → Roadmap v0.5' y mapea la flecha CTE DB-SE §7 sólo a 'Vigas acero' (línea 103): es una limitación de alcance deliberada y divulgada para todos los módulos de hormigón (vigas HA tampoco la tienen), no una capacidad anunciada y ausente. Por tanto el defecto es real como laguna normativa (CTE DB-SE 4.3.3 / CE Anejo 19 §7.4 exigen verificar deformaciones o cumplir L/d, y en forjados la flecha suele gobernar el canto), pero se rebaja a medium: gap conocido en roadmap, no afirmación falsa. Fix mínimo razonable: check L/d (exención EHE 50.2.2.1.a / Anejo 19 §7.4.2) o, como mínimo, fila info/warn 'flecha no comprobada — verificar aparte' siguiendo el patrón ya existente en infoChecks.

---

#### 38. [rcSlabs] VRd,c: falta el factor 100 en (100·ρl·fck)^(1/3) — capacidad sin cercos infravalorada ×4.6

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcSlabs.ts:579 (calcForjados, cortante)`
- **ID:** `rcSlabs-vrdc-100-01`

**Descripción**

La fórmula de VRd,c es CRd,c·k·(100·ρl·fck)^(1/3)·b·d con CRd,c=0.18/γc. El código calcula Math.pow(rhoL * fck, 1/3) sin el factor 100, infravalorando el término principal en 100^(1/3) ≈ 4.64. En la práctica VRdc1 queda casi siempre por debajo del término mínimo VRdc2 (νmin, correcto en línea 580) y Math.max lo enmascara, así que el motor devuelve sistemáticamente el suelo νmin. Es conservador (no peligroso) pero hace fallar forjados sin cercos correctamente armados — y los forjados reticulares/macizos típicamente no llevan cercos, así que es el camino habitual.

**Evidencia**

```
Línea 579: `const VRdc1 = ((0.18 / GAMMA_C) * k * Math.pow(rhoL * fck, 1 / 3) * bShear * dShear) / 1000;` — CE Anejo 19 (EC2) §6.2.2 ec. (6.2.a): VRd,c = [CRd,c·k·(100·ρl·fck)^(1/3)]·bw·d. Ej.: ρl=0.01, fck=25 → correcto (25)^(1/3)=2.92; código (0.25)^(1/3)=0.63.
```

**Fix sugerido**

Cambiar a `Math.pow(100 * rhoL * fck, 1 / 3)`.

**Razonamiento del verificador**

Confirmado leyendo el código. Línea 579 de rcSlabs.ts calcula Math.pow(rhoL * fck, 1/3) y rhoL (línea 578) es As/(b·d) capado a 0.02 — ratio adimensional, no porcentaje — por lo que falta genuinamente el factor 100 de CE Anejo 19 §6.2.2 ec. (6.2.a): (100·ρl·fck)^(1/3). No hay guard ni conversión que lo compense. GAMMA_C=1.5 (factors.ts) y el término mínimo νmin de línea 580 (0.051/γc·k^1.5·√fck, NDP español) es correcto, lo que confirma el enmascaramiento: con el bug, VRdc1/VRdc2 ≤ ~0.56 en todo el dominio de inputs (ρ≤0.02, fck≥25, k≥1), así que Math.max devuelve siempre el suelo νmin. Infravaloración neta de VRd,c de hasta ~45% (no ×4.64 neto, como el propio auditor matizó). El camino sin cercos (stirrupsEnabled=false) usa VRdc directamente y es el caso habitual en forjados. Los tests solo comprueban comportamiento cualitativo y no anclan el valor erróneo. Error conservador (falsos fail, nunca inseguro) gracias al νmin correcto, lo que justifica severidad medium y no high. El fix propuesto es correcto.

---

#### 39. [rcSlabs] As,min geométrica 2.8‰·b·h (cuantía de viga) aplicada a losa maciza — falsos FAIL en losas correctas

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcSlabs.ts:169-181 (calcSection, MIN REINFORCEMENT)`
- **ID:** `rcSlabs-asmin-maciza-01`

**Descripción**

AsMinGeom = 0.0028·bRef·h se aplica igual a reticular y maciza. El 2.8‰ es la cuantía geométrica de VIGA con B500 (EHE Tabla 42.3.5); para LOSA la misma tabla da 1.8‰ referida a la sección total y repartida entre las dos caras (≈0.9‰ por cara), y la vía CE/EC2 (§9.2.1.1) da As,min = 0.26·(fctm/fyk)·bt·d ≈ 1.3-1.5‰·bt·d. Exigir 2.8‰·1000·h en la cara traccionada de una maciza es 2-3× lo normativo: con h=350 exige 980 mm²/m, así que una parrilla habitual Ø10/200 (393 mm²/m) — el propio default del motor — marca FAIL siendo conforme. Error conservador pero material en el caso más común de losa.

**Evidencia**

```
Líneas 170-172: `const AsMinGeom = 0.0028 * bRef * inp.h; const AsMinMec = (0.04 * bRef * inp.h * fcd) / fyd; const AsMin = Math.max(AsMinGeom, AsMinMec);` citando 'CE art. 42.3.2'. Esperado para losa: EHE Tabla 42.3.5 → 1.8‰ Ac total (B500) repartida en dos caras, o CE Anejo 19 §9.2.1.1: As,min = max(0.26·fctm/fyk·bt·d, 0.0013·bt·d). Nota adicional: el comentario de línea 167-168 ('for reticular vano this is b_eff') contradice el código de línea 169 que usa bWeb (el código es el correcto).
```

**Fix sugerido**

Diferenciar por variante: maciza → As,min = max(0.26·fctm/fyk·1000·d, 0.0013·1000·d) o 0.0009·1000·h por cara según vía EHE; reticular (nervio=viga T) → mantener 2.8‰ sobre b_w·h. Corregir también el comentario de la línea 167.

**Razonamiento del verificador**

Confirmado leyendo el código. rcSlabs.ts:169-172 aplica AsMinGeom = 0.0028·bRef·h sin diferenciar variante; para maciza bRef = 1000 (bFlexVano/bFlexApoyo = 1000, línea 449), sin ningún guard ni clamp en otro punto (grep de 'as-min'/'0.0028' en src no muestra overrides). makeCheck computa util = AsMin/As y marca FAIL si As < AsMin, así que el check es bloqueante. El caso límite no solo es alcanzable: son los propios defaults del motor — forjadosDefaults tiene h=350 y parrilla maciza Ø10/200 (393 mm²/m), frente a AsMinGeom = 980 mm²/m (util 2.49 → FAIL); el apoyo (Ø10/200+Ø12/200 = 958 mm²/m) también falla. AsMinMec ≈ 537 mm² para C25/B500, luego el término geométrico gobierna como afirma el auditor. Normativamente: 2.8‰ es la cuantía de VIGA B500 de EHE Tabla 42.3.5; la fila de losas da 1.8‰ de la sección total repartida en dos caras (≈315 mm²/m por cara con h=350 → Ø10/200 cumple), y la vía CE Anejo 19/EC2 §9.3.1.1→9.2.1.1 da max(0.26·fctm/fyk·b·d, 0.0013·b·d) ≈ 426 mm²/m — menos de la mitad de lo exigido por el código. Error conservador (nunca inseguro) pero material: produce falsos FAIL en losas macizas conformes, incluida la configuración por defecto. Para reticular el 2.8‰ sobre bw·h es defendible (nervio = viga), así que el alcance del hallazgo (solo maciza) es correcto. También se confirma el punto secundario: el comentario de líneas 167-168 ('for reticular vano this is b_eff') contradice la línea 169, que usa bWeb (el código es el correcto, el comentario está obsoleto). Los tests solo ejercitan as-min en reticular; ningún test fija el valor maciza, lo que explica que pasara inadvertido. Severidad medium adecuada.

---

#### 40. [retainingWall] Fórmula Mononobe-Okabe: el radicando usa sin(φ−θ+δ) en lugar de sin(φ+δ)

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `retainingWall.ts:323 (cálculo de KAD)`
- **ID:** `retWall-mononobe-okabe-04`

**Descripción**

La fórmula M-O estándar (NCSP-07 / EC8 Anejo E, muro vertical y relleno horizontal) es KAE = cos²(φ−θ) / [cosθ·cos(δ+θ)·(1+√(sin(φ+δ)·sin(φ−θ)/cos(δ+θ)))²]. El primer término del radicando debe ser sin(φ+δ) (ángulos sin rotar), pero el código usa sin(φ_eff+δ) = sin(φ−θ+δ). Esto reduce el radicando y sobreestima KAD. Ejemplo: φ=30°, δ=10°, kh=0.15, kv=0.075 → θ=9.21°; KAE correcto = 0.422, código = 0.453 (~7% conservador). El error crece con kh. Sentido conservador, pero la fórmula no coincide con la norma citada.

**Evidencia**

```
Línea 323: `const rad_arg = Math.sin(phi_eff + delta_r) * Math.sin(phi_eff) / Math.max(cos_dt, 1e-9);` con `phi_eff = Math.max(phi_r - theta, 0)` (línea 317). EC8 Anejo E / NCSP-07: el radicando es sin(φ+δ)·sin(φ−θ−i)/[cos(δ+β+θ)·cos(i−β)] — el primer seno lleva φ+δ sin restar θ.
```

**Fix sugerido**

Cambiar a `Math.sin(phi_r + delta_r) * Math.sin(phi_eff) / Math.max(cos_dt, 1e-9)` para reproducir la fórmula M-O de NCSP-07/EC8.

**Razonamiento del verificador**

Verificado en retainingWall.ts:317-325. La línea 323 usa sin(phi_eff + delta_r) con phi_eff = max(φ−θ, 0), es decir sin(φ−θ+δ), mientras que EC8 Anejo E / NCSP-07 (y la propia Ka estática de Coulomb del mismo archivo, líneas 148-151, que usa sin(φ+δ)·sin(φ)/cos(δ)) exigen sin(φ+δ)·sin(φ−θ)/cos(δ+θ): solo el segundo seno y el coseno rotan con θ, no el primero. El código rotó φ en ambos senos, lo cual no corresponde a ninguna formulación reconocida (la equivalencia de geometría rotada rota β e i, nunca φ dentro de sin(φ+δ)). No hay clamp ni guard que lo compense: Math.max(cos_dt,1e-9) y Math.max(rad_arg,0) solo evitan división por cero/radicando negativo, y el clamp de phi_eff solo cubre el caso seismicUnstable. Reproduje el ejemplo numérico del auditor: φ=30°, δ=10°, kh=0.15, kv=0.075 → θ=9.211°; KAE correcto = 0.421, código = 0.453 (~7.5% alto) — cifras exactas confirmadas. El error existe incluso con δ=0 (sin²(φ−θ) vs sin(φ)·sin(φ−θ)) y crece con kh. El camino es alcanzable (kh = S·Ab de inputs de usuario; rama activa si kh>0) y los tests solo comprueban KAD>Ka y presencia de checks, sin valor numérico de referencia. El error es estrictamente conservador (KAD sobreestimado → FS sísmicos subestimados), nunca inseguro, por lo que medium (normativo, conservador) es la severidad adecuada. El fix propuesto (Math.sin(phi_r + delta_r) en el primer factor) es correcto.

---

#### 41. [retainingWall] VRd,c: falta el factor 100 en (100·ρl·fck)^(1/3)

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `retainingWall.ts:430`
- **ID:** `retWall-vrdc-100rho-05`

**Descripción**

La fórmula de cortante sin armadura transversal (CE Anejo 19 / EC2 §6.2.2) es VRd,c = (0.18/γc)·k·(100·ρl·fck)^(1/3)·b·d. El código calcula (ρl·fck)^(1/3) sin el 100, subestimando este término en un factor 100^(1/3) ≈ 4.64. En la práctica el Math.max con el término vmin (línea 431-432, correcto) rescata parcialmente el resultado, pero VRd,c queda subestimado (p.ej. ρ=0.5%, fck=25, d=286mm: código ≈ vmin = 0.49 MPa vs correcto 0.56 MPa, ~14% menos; con cuantías altas la diferencia crece). Error conservador: puede marcar fallo de cortante en fustes que cumplen.

**Evidencia**

```
Línea 430: `const VRdc1_f = (0.18 / 1.5) * k_f * Math.pow(rho_f * inp.fck, 1 / 3) * b_w * d_f / 1000;` — EC2/CE: CRd,c·k·(100·ρl·fck)^(1/3); falta multiplicar por 100 dentro de la raíz cúbica.
```

**Fix sugerido**

Sustituir por `Math.pow(100 * rho_f * inp.fck, 1 / 3)`.

**Razonamiento del verificador**

Confirmado leyendo el código. La línea 430 calcula Math.pow(rho_f * inp.fck, 1/3) y rho_f (líneas 426-428) es el cociente adimensional As/(b_w·d_f) clampado a 0.02, sin factor 100 embebido en ninguna parte (única ocurrencia del patrón en el archivo). La fórmula normativa que el propio código cita (CE art. 44.2.3.2.1 / EC2 §6.2.2: VRd,c=(0.18/γc)·k·(100·ρl·fck)^(1/3)·bw·d) exige el 100 dentro de la raíz cúbica, por lo que el término queda dividido por 100^(1/3)≈4.64. El Math.max con vmin (líneas 431-432, correcto) enmascara parcialmente el error: bajo el bug vmin gobierna casi siempre, dejando VRd,c subestimado ~15-20% en el ejemplo del auditor (verifiqué los números: vmin≈0.42 MPa vs correcto≈0.51 MPa) y hasta ~40% con cuantías altas. La ruta es alcanzable (camino normal !exceedsBoundary, check 'fuste-shear' usa VRd_c_f directamente). Los tests no lo detectan: el test de monotonicidad (línea 555) usa toBeLessThanOrEqual, que pasa con utilizaciones iguales cuando vmin gobierna en ambos casos, y ningún test fija un valor numérico de VRd,c. Error conservador (solo falsos fallos de cortante, nunca pases inseguros), por lo que medium es la severidad correcta. El fix propuesto es válido.

---

#### 42. [retainingWall] Excentricidad negativa (resultante hacia el talón) no tratada: σ máxima real en talón sin comprobar y check de excentricidad siempre verde

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `retainingWall.ts:245-262, 284-289`
- **ID:** `retWall-negative-e-06`

**Descripción**

Con talón grande y empuje pequeño, e = B/2 − (Mr−Mo)/ΣV puede ser negativo. La rama `if (e <= B_m/6)` engloba cualquier e negativo (incluso e < −B/6): entonces sigma_min = (ΣV/B)(1−6e/B) > sigma_max, es decir, la tensión máxima real está en el talón y se guarda en sigma_min, que solo se comprueba contra ≥ 0 — no contra sigmaAdm. Si e < −B/6, sigma_max sale negativo (despegue en puntera) y ni el check 'sigma-min' ni 'excentricidad' lo detectan (makeCheck(e, B/6) da utilización negativa → ok). Resultado: una zapata con plastificación del terreno bajo el talón o despegue en puntera aparece en verde.

**Evidencia**

```
Línea 252: `if (e <= B_m / 6) { ... sigma_max = (ΣV/B_m)*(1 + 6*e/B_m); sigma_min = (ΣV/B_m)*(1 - 6*e/B_m); }` — con e<0, sigma_min > sigma_max; el check 'sigma-max' (línea 290-294) usa sigma_max, y 'sigma-min' (líneas 297-307) solo verifica sigma_min ≥ 0. Línea 284-289: `makeCheck('excentricidad', ..., e, B_m/6, ...)` → e negativo da utilización < 0 → status ok aunque |e| > B/6.
```

**Fix sugerido**

Trabajar con |e|: usar eAbs = Math.abs(e) en la rama trapecio/triángulo y en el check de excentricidad; comprobar contra sigmaAdm el máximo de (sigma_toe, sigma_heel); detectar despegue en cualquiera de los dos bordes.

**Razonamiento del verificador**

Confirmado leyendo el código real y verificando numéricamente. (1) retainingWall.ts:245 calcula e con signo sin guard ni Math.abs; la rama de línea 252 `if (e <= B_m/6)` engloba cualquier e negativo, incluso e < −B/6, y con e<0 la presión máxima real (en el talón) queda en sigma_min. (2) El check 'sigma-max' (290-294) solo compara sigma_max (puntera) con sigmaAdm; el check 'sigma-min' (297-307) solo falla si e ≥ +B/3 o sigma_min < 0 — con e negativo sigma_min es grande y positivo, nunca falla; el propio test (retainingWall.test.ts:380) asume sigma_min ≥ 0 'by construction', confirmando que esa rama es código muerto. (3) makeCheck (types.ts:91) da utilización e/(B/6) negativa → toStatus → 'ok' aunque |e| > B/6. (4) Reachability verificada replicando la aritmética del motor: con H=2.0, bT=3.0, q=30, df=1.6 y usePassive=true (toggle que el propio motor ofrece) → e=−0.41 m, σ_talón=141 kPa nunca comparada con sigmaAdm; con H=1.5, bT=3.5, df=2.0 → e=−0.77 < −B/6, sigma_max=−17.7 kPa (despegue en puntera) y los tres checks (sigma-max, sigma-min, excentricidad) salen 'ok'. Incluso sin pasivo (q=50 sobre talón grande) se obtiene e=−0.06 con σ_talón > σ_puntera sin comprobar. Desviación de CTE DB-SE-C §4.4.3/§4.4.4 real: el tercio central es |e| ≤ B/6 y el hundimiento debe verificarse con la presión máxima de borde, sea cual sea el borde. El fix propuesto (eAbs, max(σ_toe, σ_heel) vs sigmaAdm, despegue en ambos bordes) es correcto. Severidad medium se mantiene: configuración poco habitual (talón grande/sobrecarga alta/empuje pequeño o pasivo activado) pero resultado no conservador mostrado en verde.

---

#### 43. [retainingWall] El armado del fuste y la zapata solo se dimensiona para la situación persistente; falta la combinación sísmica accidental

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `retainingWall.ts:384-634 (bloque estructural)`
- **ID:** `retWall-seismic-structural-08`

**Descripción**

Cuando kh > 0 el motor calcula FS geotécnicos sísmicos, pero MEd_fuste, MEd_talon y MEd_punta se obtienen únicamente con el empuje estático mayorado (γG=1.35, γQ=1.5). NCSE-02/NCSP-07 exigen verificar también la sección en situación accidental sísmica: empuje M-O (KAD > Ka, incremento aplicado a 0.6·H) con γ=1.0. Para kh moderados-altos, MEd sísmico del fuste puede superar 1.35·MEd estático (p.ej. KAD/Ka ≈ 1.5-1.7 para kh=0.15), por lo que el armado mostrado como suficiente puede estar subdimensionado en zona sísmica.

**Evidencia**

```
Líneas 396-401: `MEd_fuste = GAMMA_G * (0.5*Ka*... ) + GAMMA_Q * Ka * inp.q * ...` — siempre con Ka estático; no existe ninguna rama que recalcule MEd con KAD cuando kh > 0 (el bloque sísmico de líneas 315-365 solo emite checks de estabilidad).
```

**Fix sugerido**

Cuando kh > 0, calcular MEd_fuste_seis con KAD y el incremento a 0.6·H (coeficientes de la combinación accidental, γ=1.0) y tomar la envolvente max(MEd_estático_mayorado, MEd_sísmico) para As_req y el check de flexión/cortante.

**Razonamiento del verificador**

Verificado en el código: MEd_fuste/VEd_fuste (líneas 396-408) y los momentos de talón/punta (511, 578) usan exclusivamente Ka estático con γG=1.35/γQ=1.5 y la distribución de tensiones estática; el bloque sísmico (315-365) calcula KAD y el incremento M-O a 0.6·H_total pero solo lo aplica a FS_vuelco_seis/FS_desliz_seis — KAD no se usa en ningún punto del bloque estructural (384-634) y no existe envolvente ni rama accidental. El caso es alcanzable: kh=S·Ab con inputs libres (defaults Ab=0, S=1.0) y sin cap salvo el flag seismicUnstable, que no omite el diseño estructural. La desviación normativa es real: NCSE-02/NCSP-07/EC8-5 exigen verificar las secciones en situación accidental sísmica (γ=1.0), y cuantitativamente para kh≈0.15 el ratio KAD·(1-kv)/Ka ≈ 1.3-1.45 más el brazo elevado (0.6·H vs ~H/3) hace que MEd sísmico pueda superar 1.35·MEd estático, por lo que el armado puede mostrarse como suficiente estando subdimensionado. Los tests solo cubren los checks de estabilidad sísmica, confirmando la laguna. El propio header del archivo (línea 14) declara el alcance sísmico limitado a estabilidad. Severidad medium es correcta: solo afecta a zona sísmica con kh moderado-alto y los FS geotécnicos sísmicos mitigan parcialmente, pero falta una verificación exigida por norma.

---


### 🔵 LOW

#### 44. [anchorPlate] Ac,N de grupo (cono y pry-out) sin limitar la separación entre barras a s_cr,N

- **Severidad:** low  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/anchorPlate.ts:1364-1384 (checkConcreteCone) y 1781-1797 (checkConcretePryout)`
- **ID:** `anchorPlate-13-cone-group-no-scr-clamp`

**Descripción**

El bounding box del grupo usa (x_max−x_min) sin clamp: si la separación entre barras excede s_cr,N = 3·hef los conos no se solapan y EN 1992-4 limita la contribución de cada anclaje a s_cr,N/2 por lado; el bounding box completo daría NRd,c de grupo > Σ de conos individuales (p.ej. 2 barras a s=4.5·hef: Ac/Ac0 = (4.5hef+3hef)·3hef/(3hef)² = 2.5 > 2). Con hef=300 (s_cr=900 mm) y placas habituales < 900 mm raramente vincula, de ahí severidad baja; con hef cortos (150 mm → s_cr=450) y placas grandes sí puede activarse.

**Evidencia**

```
const bxA = (x_max - x_min) + extXp + extXm;  // sin Math.min(x_gap, s_cr) entre barras
const byA = (y_max - y_min) + extYp + extYm;
const Ac_N = bxA * byA;
— Esperado: cada tramo entre anclajes contribuye min(s_i, s_cr,N) (EN 1992-4 Fig. 7.4).
```

**Fix sugerido**

Recortar cada gap entre barras adyacentes a s_cr,N antes de sumar el ancho del grupo, o capar Ac_N ≤ n_t·Ac_N0.

**Razonamiento del verificador**

Verificado en el código real. En checkConcreteCone (anchorPlate.ts:1364-1384) y checkConcretePryout (1781-1797) el ancho del grupo se calcula como (x_max−x_min)+extXp+extXm donde SOLO las extensiones a borde están recortadas (Math.min(c_cr, edges.cXi)); el tramo interno entre barras nunca se limita a s_cr,N=3·hef, y no existe cap Ac_N ≤ n·Ac_N0 en ninguna de las dos funciones (leídas completas) ni guard upstream. Esto contradice EN 1992-4 §7.2.1.4/Fig. 7.4 (CE Anejo 11), donde cada anclaje aporta como máximo s_cr,N/2 por lado y las fórmulas de grupo llevan la condición explícita s ≤ s_cr,N; con s > s_cr,N los conos no se solapan y los anclajes se verifican individualmente. El ejemplo numérico del auditor es correcto: 2 barras a s=4.5·hef dan Ac/Ac0=2.5 > 2, es decir NRd,c de grupo mayor que la suma de conos aislados (lado inseguro). El caso límite es alcanzable: las posiciones salen de generateLayout (separación = plate_a−2·edge_x, dimensiones libres) y validateAnchorPlate (1856-1888) no relaciona separación con hef (solo avisa hef < 8·φ); p.ej. φ12, hef=100 (s_cr=300), plate_a=450 pasa sin warning. Con los defaults (hef=300, placa 400) nunca vincula, lo que justifica severidad baja. checkSplitting comparte el mismo patrón, coherente con el alcance del hallazgo. Severidad low confirmada: desviación insegura pero de magnitud moderada y solo en geometrías atípicas (hef corto + placas anchas).

---

#### 45. [isolatedFooting] Inconsistencia documentación/código en el significado de 'cover' (a centroide vs a superficie de barra)

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/isolatedFooting.ts:388-389 vs src/data/defaults.ts:535`
- **ID:** `isolatedFooting-cover-centroid-08`

**Descripción**

defaults.ts declara `cover: number; // mm — cover to bar centroid (bottom)`, pero el motor calcula d_x = h·1000 − cover − φx/2 y d_y = h·1000 − cover − φx − φy/2, que corresponde a recubrimiento a superficie de barra (recubrimiento mecánico geométrico estándar). Si el usuario introduce realmente el recubrimiento al centroide como dice el comentario, d queda subestimado en φ/2 (+φx en y), lo cual es conservador pero incoherente. Solo afecta a la interpretación del input; el cálculo en sí es el convencional.

**Evidencia**

```
isolatedFooting.ts:388-389: `const d_x = h * 1000 - cover - inp.phi_x / 2; const d_y = h * 1000 - cover - inp.phi_x - inp.phi_y / 2;` frente a defaults.ts:535: `cover: number;  // mm — cover to bar centroid (bottom)`.
```

**Fix sugerido**

Corregir el comentario de defaults.ts a 'recubrimiento geométrico a cara de barra' (que es lo que implementa el motor), o si la intención es centroide, cambiar a d_x = h·1000 − cover (y d_y = h·1000 − cover − (φx+φy)/2).

**Razonamiento del verificador**

Confirmado leyendo el código. isolatedFooting.ts:388-389 calcula d_x = h·1000 − cover − φx/2 y d_y = h·1000 − cover − φx − φy/2, que es la convención de recubrimiento geométrico (a cara de barra, con la capa y apoyada sobre la x). Pero defaults.ts:535 documenta `cover` como "cover to bar centroid (bottom)", y además la etiqueta de UI usada por el panel (labels.ts:262-265, labelKey 'cover_mechanical', símbolo 'r') dice explícitamente "Recubrimiento mecánico (al eje de la barra)". Si el usuario introduce lo que la etiqueta pide (distancia al eje), el motor resta φx/2 de más en ambas direcciones → d subestimado en φx/2 (conservador pero incoherente). No hay clamp ni guard que lo cubra (solo cover>0 y d>0), y los tests no fijan la convención (nunca asertan d_x/d_y). El mismo patrón aparece en pileCap.ts:235 (comentario "to tie centroid" vs z_eff = h − cover − φ/2) y en rcBeams/rcColumns, confirmando que es una inconsistencia doc/etiqueta-vs-código real y sistemática, no una malinterpretación del auditor. El alcance es solo interpretación del input (el cálculo en sí es el convencional y el error va del lado de la seguridad), por lo que la severidad 'low' es correcta. Fix correcto: o corregir comentario+etiqueta a recubrimiento geométrico (lo que implementa el motor), o pasar a d_x = h·1000 − cover y d_y = h·1000 − cover − (φx+φy)/2 si se mantiene la convención de eje.

---

#### 46. [masonryWalls] Cargas negativas (tracción) no se detectan: η negativo pasa como CUMPLE

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/masonryWalls.ts:1094-1102 y validateState:816-879`
- **ID:** `masonryWalls-07`

**Descripción**

validateState no comprueba el signo de q_G/q_Q/P_G/P_Q. Con cargas negativas (p.ej. un input erróneo o un share-URL manipulado que modele una 'succión'), N_Ed resulta negativo, eta = N_Ed/N_Rd < 0 y status='ok'. La fábrica no tiene capacidad a tracción y DB-SE-F no contempla axil negativo en la comprobación §5.2; el motor debería al menos avisar. Caso poco frecuente y de entrada degenerada, por eso severidad baja.

**Evidencia**

```
Línea 1100: `const eta_cabeza = N_Rd > 0 ? N_Ed / N_Rd : 99;` — con N_Ed < 0, eta_cabeza < 0 y `etaMax >= 1.0`/`>= 0.8` no se activan (línea 1143-1145) → 'ok'. No hay guard de signo en validateState ni en mayorarPuntual (784-786).
```

**Fix sugerido**

Validar q_G, q_Q ≥ 0 y P_G, P_Q ≥ 0 en validateState (o marcar fail/warn cuando N_Ed < 0 en cualquier machón, con motivo 'axil de tracción — fuera del alcance de DB-SE-F §5.2').

**Razonamiento del verificador**

Verificado línea a línea. (1) validateState (816-879) solo valida plantas, t, L, gamma_M y fk — ningún check de signo en q_G/q_Q/P_G/P_Q. (2) mayorarPuntual (784-786) y floorUDL (949) propagan negativos sin clamp; los Math.max(0,...) del motor son todos geométricos. (3) Con N_Ed<0: N_Rd siempre >0 (Φ≥0.05, f_d>0 por el gate de fk, A>0), así que eta_cabeza=N_Ed/N_Rd<0 (línea 1100, el sentinel 99 no se activa); etaConc queda en 0 (etaLocal negativo nunca supera 0); etaMax=max(η<0, 0)=0 → status='ok' (1143-1145). Tracción neta pasa como CUMPLE. (4) Alcanzable incluso más fácilmente de lo que dice el auditor: NumField es input de texto libre con parseFloat sin min=0 — se puede teclear "-5" en q_G en la UI; además serialize.ts/isValidState solo valida tipos y delega explícitamente la validación profunda al gate del motor, que no comprueba signos. (5) No hay test de cargas negativas en calcularEdificio. (6) Normativamente correcto: DB-SE-F §5.2 verifica compresión (N_Ed ≤ Φ·t·f_d); la fábrica no tiene capacidad axil a tracción y el modelo no aplica con axil negativo — devolver 'ok' es no conservador. El contraargumento de que N_Ed<0 satisface trivialmente N_Ed≤N_Rd no refuta: la fórmula presupone compresión. El propio motor hard-failea otras configuraciones imposibles citando "liability legal" (1066-1075), lo que hace incoherente aceptar tracción silenciosamente. Severidad low correcta: entrada degenerada, improbable accidentalmente en el dominio de la herramienta.

---

#### 47. [micropiles] σv' arranca en 0 en la cabeza: se ignora la sobrecarga del terreno sobre el micropilote

- **Severidad:** low  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/micropiles.ts:242-258 (sigmaV = 0 inicial; bucle de integración)`
- **ID:** `sigmaV-overburden-01`

**Descripción**

La tensión vertical efectiva se integra desde σv=0 EN LA CABEZA del pilote (topDepth=1 m en FTUX), descartando el peso del terreno situado entre la rasante y la cabeza. La mecánica de suelos (y el cálculo de σh'=K0·σv' de la Guía §3.4) requiere la tensión efectiva real a cada profundidad, que incluye toda la columna de suelo superior. Además la presión de poros u SÍ se computa desde el NF real, mezclando referencias: para NF sobre la cabeza, σv puede quedar clampada a 0 varios segmentos (`Math.max(0, sigmaV - u)`). El sesgo es siempre conservador (rfc teórica infraestimada, más cuanto más profunda esté la cabeza), pero es una desviación deliberada documentada solo como réplica del Excel, y distorsiona el reparto de Rfc por estratos que se muestra al usuario.

**Evidencia**

```
Línea 242: `let sigmaV = 0;` con bucle desde i=0 en la cabeza, y comentario de cabecera líneas 9-11: «σv arranca en 0 EN LA CABEZA — replica la hoja Excel de referencia, que ignora el aporte de sobrecarga del suelo no movilizado por el pilote». Lo correcto según Guía §3.4 es σv'(z) con z desde rasante: inicializar sigmaV con Σ γi·hi de los estratos entre z=0 y zHeadAbs.
```

**Fix sugerido**

Inicializar sigmaV integrando γ de los estratos entre la rasante y zHeadAbs (y u desde el NF, ya correcto), o al menos exponer la hipótesis como nota 'warn' en el resultado; recalibrar los oráculos Rfc (496.28 / 675.17 kN) tras el cambio.

**Razonamiento del verificador**

Confirmado leyendo micropiles.ts. Línea 242 `let sigmaV = 0;` y el bucle (244-250) integran σv solo a lo largo del pilote desde la cabeza; zHeadAbs se usa únicamente para localizar estratos (findLayerAt) y para zAbs de los segmentos, nunca para inicializar σv con la sobrecarga Σγ·h entre rasante y cabeza. No hay guard que lo cubra; el comentario de cabecera (líneas 9-11) lo reconoce como réplica deliberada del Excel. La mezcla de referencias también es real: u = γw·max(0, zBotSeg − zWaterHead) (línea 257) sí parte del NF real (zWaterHead puede ser negativo), de modo que con NF sobre la cabeza (caso alcanzable y testeado: waterTableDepth=0.5 < topDepth=1) el primer segmento tiene σv≈6.1 kPa pero u=8.2 kPa y `Math.max(0, sigmaV−u)` clampa σv' a 0 varios segmentos — inconsistencia física genuina. La desviación de Guía §3.4 (σh'=K0·σv' con σv' desde rasante) es real, y el propio proyecto ya rompió compat con el Excel por fidelidad normativa (fix D1-bis, "fidelidad a la norma > compat con el Excel"), así que la réplica del Excel no es política intocable. Matices que corrijo del auditor: (1) el sesgo es estrictamente conservador en TODOS los consumidores (ih, pullout línea 455, asiento línea 543) — no hay camino inseguro; (2) RfcEmpirical (675.17) no depende de σv (solo rflim/Fr, línea 288), por lo que solo el oráculo teórico 496.28 necesitaría recalibración, no el empírico. σv'/σh' distorsionados sí se exponen al usuario vía SegmentResult sin nota 'warn'. Defecto real pero deliberado, documentado en código y siempre conservador: severidad mejor 'low' que 'medium' (problema de exactitud/transparencia, no de seguridad).

---

#### 48. [micropiles] Peso de la lechada en el arranque sin deducción de empuje hidrostático bajo el NF

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/micropiles.ts:453-455 (pulloutCapacity)`
- **ID:** `pullout-buoyancy-01`

**Descripción**

El término estabilizador Wcrete del arranque usa γ=25 kN/m³ para toda la longitud L, sin pasar a peso sumergido (γ'≈15 kN/m³) en el tramo bajo el nivel freático. Para un pilote mayoritariamente sumergido el peso muerto estabilizador se sobreestima ~40% de ese término → inconservador, aunque el efecto absoluto es pequeño (en FTUX W≈10 kN /1.2 frente a μ·Rfc de cientos de kN).

**Evidencia**

```
Línea 454: `const Wcrete = Math.PI * (dTotalM / 2) * (dTotalM / 2) * L * GAMMA_CONCRETE;` — GAMMA_CONCRETE=25 kN/m³ (línea 48) aplicado a toda L con independencia de inp.waterTableDepth, mientras el resto del motor sí distingue tramo saturado (u = γw·max(0, zBot−zWater), línea 257).
```

**Fix sugerido**

Calcular Wcrete por tramos: γ=25 sobre el NF y γ−γw=15 bajo el NF, usando zWaterHead ya disponible.

**Razonamiento del verificador**

Verificado en src/lib/calculations/micropiles.ts: la línea 454 calcula Wcrete = π·(dTotal/2)²·L·GAMMA_CONCRETE con GAMMA_CONCRETE=25 kN/m³ (línea 48) sobre toda la longitud L, y la línea 455 lo suma como término estabilizador (Wcrete/1.2) en pulloutCapacity. No existe ningún guard, clamp ni corrección por nivel freático en ese bloque. El propio motor sí maneja el NF en otra parte (zWaterHead en línea 224; u = γw·max(0, zBot−zWater) en línea 257) e incluso documenta explícitamente el caso 'NF sobre la cabeza ⇒ todo el pilote bajo agua' (líneas 220-222), por lo que el caso límite (pilote mayoritariamente sumergido) es alcanzable con inputs válidos y el motor es internamente inconsistente: aplica empuje hidrostático a las tensiones efectivas del terreno pero no al peso muerto de la lechada. Normativamente (EC7 §2.4.7.4 UPL / CTE DB-SE-C, coherente con Guía Fomento 2005 §3.5.2), el peso estabilizador bajo el NF debe ser el sumergido (γ'≈15 kN/m³); usar γ=25 sobreestima ese término un 40% en tramo saturado, en el lado inconservador, y el divisor 1.2 no lo compensa (25/1.2≈20.8 > 15). Los tests (micropiles.test.ts líneas 556-567) solo verifican presencia del check 'pullout', sin valor numérico pinneado a un Excel de referencia que justifique mantener γ=25. El defecto se sostiene; el impacto absoluto es pequeño (W/1.2 ≈ unos pocos kN frente a μ·Rfc de cientos de kN en FTUX), así que la severidad 'low' es adecuada.

---

#### 49. [micropiles] Mpl,Rd y Vpl,Rd citan EC3 §6.2.5/6.2.6 pero usan γ=1.10 en lugar de γM0=1.05

- **Severidad:** low  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/micropiles.ts:513 y 516`
- **ID:** `mpl-gamma-doc-01`

**Descripción**

Los checks de flexión y cortante referencian EC3 §6.2.5/§6.2.6 (cuyo γM0 vale 1.05 según el propio src/data/factors.ts del repo y el anejo nacional), pero las resistencias se minoran con 1.10 (el γa de la Guía Fomento para el tubo). Es ~4.8% conservador, no peligroso, pero la trazabilidad normativa del check es incoherente: o se cita la Guía (γa=1.10) o se usa γM0=1.05.

**Evidencia**

```
Línea 513: `const Mpl_rd = (W * (fy / 1.1)) / 1e6;` y línea 516: `const Vpl_rd = ((2 * As_d / Math.PI) * (fy / Math.sqrt(3))) / 1.1 / 1000;` frente a EC3 §6.2.5 Mc,Rd = Wpl·fy/γM0 con γM0=1.05 (factors.ts). El article del check (línea 634) dice 'EC3 §6.2.5 / Guía §3.7'.
```

**Fix sugerido**

Documentar explícitamente que se adopta el γa=1.10 de la Guía Fomento (más conservador que γM0) o cambiar a γM0=1.05 importándolo de factors.ts; actualizar el oráculo Mpl_rd=26.56 kNm si se cambia.

**Razonamiento del verificador**

Verificado línea a línea: micropiles.ts:513 usa `W * (fy / 1.1)` y :516 usa `(fy/√3)/1.1`, mientras factors.ts:4 define GAMMA_M0 = 1.05 y no se importa aquí. El check de flexión (línea 634) cita 'EC3 §6.2.5 / Guía §3.7' y el de cortante (línea 643) cita SOLO 'EC3 §6.2.6'. Intento de refutación: el 1.10 es plausiblemente intencional (γa de la Guía Fomento, coherente con fyd_raw = fy/1.1 en línea 404 y con el bloque Tc_rd, que sí documenta γa=1.10 contra el PDF de la Guía). Pero eso no desmonta el hallazgo: (a) las líneas 513/516 re-hardcodean 1.1 sin comentario alguno en vez de reutilizar fyd_raw, en contraste con la documentación exhaustiva del resto del módulo; (b) el check de cortante cita exclusivamente EC3 §6.2.6, cuyo γM0 según el propio repo es 1.05, generando una discrepancia trazable del ~4.8% sin explicación; (c) el oráculo de test (26.56 kNm y `2000/1.1` en micropiles.test.ts:106,1242-1244) confirma que el 1.10 está horneado. Es conservador, no peligroso, y el fix correcto es el primero que propone el auditor (documentar γa=1.10 de la Guía y/o citar la Guía en el article del cortante), no cambiar a 1.05. El hallazgo se sostiene exactamente como fue reportado: incoherencia de trazabilidad normativa, no error de cálculo.

---

#### 50. [micropiles] Clamps silenciosos: Math.max(1, Vpl_rd) en ρ y EL=max(1, módulo) pueden enmascarar entradas degeneradas

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/micropiles.ts:534 y 479`
- **ID:** `shear-rho-clamp-01`

**Descripción**

En la interacción M-V, `rho = (2·VEd/Math.max(1, Vpl_rd) − 1)²` sustituye Vpl_rd por 1 kN si fuera menor: con un tubo minúsculo la reducción del momento se anularía en vez de dispararse (inconsistente con la condición de activación que sí usa el Vpl_rd real). Análogamente `EL = Math.max(1, inp.soilModulusEmbed)` convierte un módulo 0/negativo (entrada inválida) en 1 kN/m², produciendo un Le enorme en silencio en lugar de invalidar. Ambos casos son irreales con el catálogo PIRESA actual, pero son early-clamps que ocultan fallos en vez de reportarlos.

**Evidencia**

```
Línea 534: `? Math.pow(2 * VEd / Math.max(1, Vpl_rd) - 1, 2)` — el denominador clampado difiere del Vpl_rd usado en la condición `VEd > 0.5 * Vpl_rd` (línea 533). Línea 479: `const EL = Math.max(1, inp.soilModulusEmbed);` sin nota ni invalid().
```

**Fix sugerido**

Usar Vpl_rd real en ρ (ya garantizado >0 por las validaciones previas de geometría) y validar soilModulusEmbed>0 con invalid() o nota 'warn' en lugar del clamp a 1.

**Razonamiento del verificador**

Verificado en código real. (1) micropiles.ts:479 `EL = Math.max(1, inp.soilModulusEmbed)` clampa en silencio sin invalid() ni nota, mientras el mismo motor SÍ valida con invalid() otros inputs comparables (drillDiameter>0, gamma>0, thickness>0 en líneas 182-193): asimetría real en la filosofía de validación. La UI mitiga (LIMITS min:1 en MicropilesInputsPanel.tsx:55 con clamp on-blur), pero el motor es frontera pública llamada directamente en tests con inputs arbitrarios, donde EL≤0 produce un Le enorme en silencio. (2) micropiles.ts:533-534: inconsistencia confirmada — la condición de activación usa Vpl_rd real y el denominador de ρ usa Math.max(1, Vpl_rd), desviándose de EC3 §6.2.8 cuando Vpl_rd<1 kN; en la ventana Vpl_rd∈(VEd,1) kN con iv<1 (p.ej. Vpl_rd=0.8, VEd=0.7: ρ real 0.56 vs clampado 0.16) la reducción del momento se subestima de forma NO conservadora sin que el check de cortante lo detecte. Intentos de refutación fallidos: la UI bloquea ambos casos (min tubo custom Ø30×3 da Vpl_rd≈4 kN; catálogo PIRESA mucho mayor; guards clase-4 y 2re≥e filtran tubos degenerados), pero el motor solo exige 2e<de para tubo custom, por lo que llamadas programáticas alcanzan el caso. Defecto real de robustez/honestidad (clamp silencioso en vez de invalid()), inalcanzable vía UI: severidad low correcta, sin impacto en diseños reales.

---

#### 51. [rcColumns] NRd_max en compresión pura usa fyd en vez de f_yc,d = min(fyd, 400): inconsistente con el propio check as-min-mech

- **Severidad:** low  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcColumns.ts:198`
- **ID:** `rcCol-nrdmax-01`

**Descripción**

En compresión centrada la deformación del hormigón está limitada a εc2 = 0.002 (pivote C), por lo que la tensión del acero no puede superar Es·0.002 = 400 N/mm². Para B500S (fyd = 434.8) el código usa fyd y sobreestima NRd_max en As·34.8 N (~1.9% con la cuantía máxima del 4%). El propio motor aplica correctamente f_yc,d = min(fyd, 400) en el check as-min-mech (L440), confirmando que el criterio es conocido pero no se aplicó aquí. Efecto pequeño pero del lado inseguro, y afecta también al denominador de ned (exponente biaxial) y al cierre del diagrama N-M.

**Evidencia**

```
L198: `const NRd_max = fcd * (b * h - As_total) + fyd * As_total;` frente a L440: `const fyc_d = Math.min(fyd, 400);` usado solo para as-min-mech. Esperado (criterio εc2, coherente con EHE art. 40.2): NRd_max = fcd·(Ac − As) + f_yc,d·As.
```

**Fix sugerido**

En buildSectionModel: `const fyc_d = Math.min(fyd, 400); const NRd_max = fcd * (b * h - As_total) + fyc_d * As_total;` y reutilizar fyc_d en el check as-min-mech.

**Razonamiento del verificador**

Verificado en el código real. L198 de rcColumns.ts usa exactamente `fcd*(b*h - As_total) + fyd*As_total` sin ningún clamp aguas arriba: getFyd devuelve fyk/1.15 crudo, así que con B500S (input por defecto en los tests) fyd=434.78 > 400. El propio motor aplica f_yc,d = min(fyd, 400) en L440 para el check as-min-mech (CE art. 42.3.1), y hay un test explícito (rcColumns.test.ts:278) que verifica ese cap, lo que confirma que el criterio es conocido y la inconsistencia interna es real. Normativamente el auditor tiene razón: en compresión centrada la deformación se limita a εc2=0.002 (pivote C, EC2/Anejo 19 §6.1(5)), luego σs = Es·0.002 = 400 N/mm² para B500S; EHE-08 art. 40.2 lo hacía explícito (f_yc,d ≤ 400). El barrido del diagrama (calcNM) usa pivote B y no cubre el punto de compresión pura, así que el cierre del diagrama (L638) y la puerta de aplastamiento NEd ≥ NRd_max (L105), además de ned (L269) y el check nd-max (L337), dependen del valor sobreestimado de L198. NRd_Whitney (L199) NO está afectado (a x=depth las barras superan εyd y fyd es correcto), y el auditor acertó al limitar el hallazgo a L198. Intentos de refutación fallidos: no hay guard previo, el caso es alcanzable con el acero por defecto, y el argumento de "simplificación aceptada con fyd" no se sostiene dado que el motor adopta el cap de 400 en el mismo módulo. Efecto pequeño (34.8·As N, ~2-4% de NRd_max según cuantía) pero del lado inseguro: severidad low correcta. Nota: el test L206 codifica la fórmula errónea, habría que actualizarlo junto con el fix propuesto.

---

#### 52. [rcColumns] Cuantía geométrica mínima 0.003·Ac no coincide con la referencia citada

- **Severidad:** low  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcColumns.ts:427-435`
- **ID:** `rcCol-asmin-01`

**Descripción**

El check exige As ≥ 0.003·b·h citando 'CE art. 42.3.1'. CE Anejo 19 art. 9.5.2 (EC2) establece As,min = max(0.10·NEd/fyd, 0.002·Ac), mientras que la tradición EHE-08 (art. 42.3.5, tabla de cuantías geométricas) exigía el 4‰ (0.004·Ac) en pilares. El 0.003 implementado no corresponde a ninguna de las dos: es conservador frente al Anejo 19 (sin riesgo estructural) pero un 25% inferior al criterio EHE que muchos proyectistas españoles siguen tomando como referencia para pilares. Dado que la rama mecánica (0.10·NEd/f_yc,d) sí está implementada aparte y correcta (incluso conservadora al usar f_yc,d), el impacto es solo de trazabilidad normativa.

**Evidencia**

```
L427: `const As_min = 0.003 * b * h;` con article 'CE art. 42.3.1'. Esperado: 0.002·Ac (CE Anejo 19 art. 9.5.2) o 0.004·Ac (criterio EHE para pilares); 0.003 no aparece en ninguna de las referencias.
```

**Fix sugerido**

Alinear el coeficiente con la referencia que se cite: 0.002·Ac si se mantiene Anejo 19 (actualizando el texto del artículo a 'CE Anejo 19 art. 9.5.2'), o 0.004·Ac si se quiere el criterio EHE tradicional, documentando la elección en el comentario de cabecera.

**Razonamiento del verificador**

Confirmado leyendo rcColumns.ts L426-435: el check 'as-min' usa exactamente As_min = 0.003·b·h citando 'CE art. 42.3.1', sin guard ni cálculo adicional que lo module, y sin justificación documentada en el header del archivo. El coeficiente no corresponde a ninguna referencia: CE Anejo 19 art. 9.5.2 (EC2) fija 0.002·Ac como suelo geométrico, y la tradición EHE-08 (art. 42.3.5, cuya numeración el código hereda al citar '42.3.1') fija 0.004·Ac para pilares. La rama mecánica 0.10·NEd/f_yc,d sí está implementada aparte (L437-449) y es correcta e incluso conservadora (f_yc,d = min(fyd, 400)), como reconoce el auditor. Los tests (rcColumns.test.ts L243-249) solo espejan el 0.003 implementado, no lo validan contra norma. Intenté refutar buscando un origen normativo para 0.003 (AN español de EC2, CE Anejo 19, EHE) y no existe; además la cita 'CE art. 42.3.1' es en sí incoherente (el contenido técnico del CE está en Anejo 19 art. 9.5.2). El defecto se sostiene, pero su impacto es solo de trazabilidad: frente a la norma vigente (0.002·Ac) el check es conservador (falsos fail, nunca pass inseguro), por lo que severidad 'low' es correcta.

---

#### 53. [rcSlabs] Momentos de apoyo introducidos con signo negativo desactivan silenciosamente fisuración y flexión

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcSlabs.ts:242 (calcSection) y 543-550 (check 'bending' apoyo)`
- **ID:** `rcSlabs-ms-sign-01`

**Descripción**

El motor asume que apoyo_Md, apoyo_M_G y apoyo_M_Q se introducen como magnitudes |M−| positivas (defaults positivos y etiqueta '|M-|'), pero no normaliza el signo. Si el usuario introduce el momento de apoyo con su signo natural negativo: (a) la comprobación de fisuración se omite silenciosamente porque `if (... && inp.Ms > 0)` no se cumple — desaparece el check sin aviso; (b) el check de flexión makeCheck(Md, MRd) da utilization negativa → toStatus(<0.8) = 'ok' → verde incondicional. Verde-por-omisión con entrada plausible.

**Evidencia**

```
Línea 242: `if (inp.exposureClass !== 'XC1' && inp.Ms > 0) { ... }` — un Ms negativo (M− con signo) salta todo el bloque de wk sin emitir fila. Líneas 543-548: `apoyo.checks.unshift(check('bending', ..., inp.apoyo_Md as number, apoyo.MRd, ...))` con types.ts:91 `const util = capacity > 0 ? demand / capacity : Infinity` — demand negativo → util < 0 → 'ok'.
```

**Fix sugerido**

Normalizar con Math.abs() los momentos de apoyo (Md y Ms) a la entrada de calcForjados, o validar y rechazar momentos negativos con mensaje explícito; en calcSection, emitir el check de fisuración también cuando Ms<0 usando |Ms|.

**Razonamiento del verificador**

Mecanismo confirmado línea a línea: rcSlabs.ts:242 (`inp.Ms > 0`) omite silenciosamente el check de fisuración con Ms negativo sin emitir fila alguna; rcSlabs.ts:543-550 + types.ts:91/60-64 producen utilization negativa → toStatus → 'ok' verde con apoyo_Md negativo; calcForjados valida h/cover/fck/exposureClass pero no el signo de ningún momento. SIN EMBARGO, la premisa de reachability del auditor está parcialmente refutada: el escenario principal ("usuario introduce el momento con signo negativo") es imposible desde la UI porque parseQuantity (src/lib/units/format.ts:58) contiene `if (display < 0) return null;` y UnitNumberInput solo propaga onChange con parse no-null, revirtiendo el campo en blur — el usuario no puede teclear un negativo en apoyo_Md/M_G/M_Q. El adaptador FEM también normaliza con Math.abs. La única vía de entrada real es parseUrlParams (useModuleState.ts:61-77), que acepta Number(raw) negativo desde query params de URLs compartibles (canal de estado de primera clase: URL > localStorage > defaults), más cualquier llamador programático futuro del motor exportado, cuyo contrato |M-| solo está documentado por comentario (defaults.ts:677). Ningún test cubre momentos negativos. Defecto real de robustez del motor (inconsistente con su propia validación defensiva de otros inputs), pero severidad rebajada de medium a low porque requiere manipulación manual de URL, no entrada plausible del usuario.

---

#### 54. [rcSlabs] ρw,min = 0.072·√fck/fyk en lugar de 0.08·√fck/fyk

- **Severidad:** low  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcSlabs.ts:620 (calcForjados, cuantía mínima transversal)`
- **ID:** `rcSlabs-rhowmin-01`

**Descripción**

La cuantía mínima de armadura transversal usa el coeficiente 0.072, un 10% inferior al 0.08 de la fórmula del Eurocódigo recogida en el CE. Permite dar por válida una cuantía de cercos hasta un 10% inferior al mínimo normativo. Impacto pequeño (es un mínimo constructivo) pero es no conservador.

**Evidencia**

```
Línea 620: `const rhoWMin = (0.072 * Math.sqrt(fck)) / fyk;` citando 'CE art. 44.2.3.2.2'. CE Anejo 19 (EC2) §9.2.2 ec. (9.5N): ρw,min = 0.08·√fck/fyk.
```

**Fix sugerido**

Cambiar 0.072 por 0.08.

**Razonamiento del verificador**

Verificado en código: rcSlabs.ts:620 usa exactamente rhoWMin = 0.072·√fck/fyk, sin clamp ni guard alternativo; la fila 'rho-w-min' falla solo si ρw ≤ ρw,min, así que el 0.072 es la única barrera. La norma (CE Anejo 19 = EC2 §9.2.2(5), ec. 9.5N) fija ρw,min = 0.08·√fck/fyk como valor recomendado y España no lo modifica como NDP; incluso la fórmula heredada de EHE-08 (fct,m·b0/7.5) da ≈0.40/fyk para C25, equivalente al 0.08, mientras que 0.072 da 0.36/fyk. Ningún código conocido usa 0.072 (parece errata = 0.9·0.08). El caso límite es alcanzable: con stirrupsEnabled, maciza C25/B500, ø6 2 ramas a s=75 mm → ρw=0.000754, que el motor da por 'ok' (límite 0.00072) cuando normativamente debería fallar (0.0008). El mismo coeficiente erróneo está duplicado en rcBeams.ts:276 y un comentario de test (rcBeams.test.ts:327) lo asume, pero los casos de test están lejos del borde y no se romperían con el fix. La cita 'CE art. 44.2.3.2.2' es además numeración EHE de Vu2, no del artículo de cuantía mínima, lo que refuerza que no es una elección normativa deliberada. El fix propuesto (0.072 → 0.08, también en rcBeams.ts) es correcto. Severidad 'low' adecuada: mínimo constructivo, desviación del 10%, mitigada parcialmente por el check independiente de s,max y por la comprobación resistente VRd,s.

---

#### 55. [rcSlabs] wmax = 0.2 mm para XC4 (norma: 0.3 mm) y check de fisuración omitido en XC1

- **Severidad:** low  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/data/factors.ts:13-18 (wkMax) y rcSlabs.ts:242`
- **ID:** `rcSlabs-wkmax-xc4-01`

**Descripción**

La tabla wkMax asigna 0.2 mm a XC4, pero tanto CE Anejo 19 Tabla 7.1N como EHE Tabla 5.1.1.2 (clase IIb equivalente) fijan 0.3 mm para XC2-XC4 en hormigón armado; 0.2 mm corresponde a clases con cloruros (XD/XS). Error conservador. Adicionalmente, para XC1 la norma fija wmax=0.4 mm (apariencia) y el motor omite el check por completo (`exposureClass !== 'XC1'`), aunque el límite 0.4 sí está tabulado — omisión de baja relevancia práctica.

**Evidencia**

```
factors.ts:13-18: `export const wkMax = { XC1: 0.4, XC2: 0.3, XC3: 0.3, XC4: 0.2 };` — CE Anejo 19 Tabla 7.1N: XC2/XC3/XC4 → 0.3 mm (combinación cuasipermanente). rcSlabs.ts:242: `if (inp.exposureClass !== 'XC1' && ...)` salta el check en XC1.
```

**Fix sugerido**

XC4: 0.3 en wkMax (añadir XD/XS con 0.2 si se amplían clases). Opcionalmente calcular wk también en XC1 contra 0.4 mm en vez de omitirlo.

**Razonamiento del verificador**

Confirmado tras intentar refutarlo. (1) factors.ts:13-18 asigna literalmente XC4: 0.2 y no existe ningún guard/clamp posterior: rcSlabs.ts:241 hace wkMax[inp.exposureClass] ?? 0.3 y compara wk contra ese límite; XC4 es input válido (validación en rcSlabs.ts:303 acepta toda clase presente en la tabla), luego el caso es alcanzable. Normativamente, CE Anejo 19 Tabla 7.1N (=EC2 Tabla 7.1N, cuasipermanente, armadura pasiva) y EHE-08 Tabla 5.1.1.2 (IIb/H ≈ XC4) fijan 0.3 mm para XC2-XC4; 0.2 mm corresponde a clases con cloruros (XD/XS; III/IV/F/Qa en EHE). Ninguna fuente normativa da 0.2 para XC4 — error conservador real. El comentario del código cita referencias inexistentes ('CE Table 49.2.4 / EHE Table 13.1'), descartando que sea una elección nacional documentada. (2) rcSlabs.ts:242 omite el check de fisuración en XC1 pese a tener tabulado wmax=0.4 (criterio de apariencia de la Tabla 7.1N); el test rcSlabs.test.ts:194 confirma que es deliberado. Omisión real pero de baja relevancia práctica. Nota: el mismo defecto se replica en rcBeams.ts (tabla compartida) y los tests fijan el valor erróneo (rcBeams.test.ts:412 espera 0.2 para XC4), así que el fix debe actualizar también esos tests.

---

#### 56. [retainingWall] Empuje pasivo Ep aplicado al 100% del Kp Rankine sin coeficiente de movilización (e inconsistencia con el test de regresión)

- **Severidad:** low  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `retainingWall.ts:218, 231, 244, 351`
- **ID:** `retWall-passive-full-07`

**Descripción**

Cuando usePassive=true, Ep = ½·Kp·γ·dEmb² se suma íntegro al numerador del FS de deslizamiento y como momento estabilizador en vuelco. Movilizar el pasivo completo requiere desplazamientos del orden del 2-6% de dEmb, incompatibles con un muro que debe cumplir FS=1.5 sin moverse; la práctica conforme a CTE DB-SE-C §6.3.2/EC7 es aplicar solo una fracción (típicamente Ep/2 o un γR adicional) o limitarlo al empuje en reposo. Además, el test 'FS_desliz excludes passive Ep (CTE DB-SE-C §9.3.3)' (retainingWall.test.ts:131-137) documenta como 'regression for the bug where Ep was added at full value' un comportamiento que sigue presente cuando el usuario activa usePassive — el test solo pasa porque el default es usePassive=false.

**Evidencia**

```
Línea 218: `const Ep = usePassive ? 0.5 * Kp_rankine * inp.gammaSuelo * dEmb * dEmb : 0;`; línea 244: `FS_desliz = (ΣV * inp.mu + Ep) / EAH_total`; línea 231: `+ Ep * arm_Ep` en Mr. Comentario del test (test.ts:128-130): 'passive resistance Ep must NOT be included in sliding FS by default... Regression for the bug where Ep was added at full value to numerator' — pero el código lo añade al valor completo si usePassive=true.
```

**Fix sugerido**

Aplicar un factor de movilización al pasivo (p.ej. Ep/1.5 o 0.5·Ep) o limitar a empuje en reposo K0; documentarlo en el check y añadir un test con usePassive=true que verifique la reducción.

**Razonamiento del verificador**

Verificado en el código: cuando usePassive=true, Ep = ½·Kp_rankine·γ·dEmb² se aplica al 100% sin factor de movilización (retainingWall.ts:218), sumándose íntegro al numerador de FS_desliz estático (l.244) y sísmico (l.351) contra los mismos límites 1.5/1.1, y como momento estabilizador completo en vuelco (l.231, 347). El caso es alcanzable con un clic en la UI (toggle 'Considerar Ep', RetainingWallInputs.tsx:284-303), cuyo texto de ayuda muestra la fórmula pero NO advierte sobre la movilización parcial ni sobre garantizar la permanencia del terreno; esas salvedades solo existen como comentarios del código. Intenté refutar: (a) 'es opt-in documentado' — mitiga pero el usuario recibe un check verde sellado con CTE DB-SE-C §4.4.2 sin caveat en la app; (b) 'el FS global 1.5 cubre la movilización' — falla porque la fricción en base se moviliza con desplazamientos milimétricos y el pasivo completo requiere ~2-10% de dEmb (EC7 §9.5.3 exige considerar esta compatibilidad; práctica estándar: Ep/1.5-2 o exigir FS≥2 si se incluye Pp); (c) 'Rankine sin δ es conservador' — compensa solo parcialmente; (d) 'con defaults Ep es despreciable' — cierto (df=0 → Ep≈6.8 kN/m) pero crece cuadráticamente con df y puede convertir un FS fallido en aprobado. También confirmada la inconsistencia del test: el comentario en retainingWall.test.ts:128-130 describe como 'regression for the bug where Ep was added at full value' un comportamiento que persiste tal cual tras el toggle (la corrección fue hacerlo opt-in, no reducirlo). Matiz que rebaja severidad: el CTE DB-SE-C no prescribe un coeficiente numérico obligatorio (condiciona la inclusión, condiciones que el código documenta y delega explícitamente al usuario), el default es conservador (usePassive=false), el check se etiqueta '(con Ep)' y Ep/EpHeight se exponen con transparencia total en resultados y SVG. Es una desviación de la práctica geotécnica reconocida en una rama opt-in transparente, no un incumplimiento de fórmula normativa explícita ni del camino por defecto: defecto real pero de severidad baja.

---

#### 57. [retainingWall] Momento del talón: valor absoluto del neto enmascara el signo (cara traccionada) y mayora con un único γG el neto de efectos opuestos

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `retainingWall.ts:508-511, 522-529`
- **ID:** `retWall-talon-sign-09`

**Descripción**

MEd_talon = γG·|M_up − M_down| mezcla dos problemas: (1) si la reacción del terreno domina (M_up > M_down), la tracción está en la cara inferior, pero el check 'talon-bending' compara siempre contra As_prov_zs (armado superior, línea 522-529) — se verificaría la cara equivocada; (2) aplicar γG=1.35 al neto de dos efectos opuestos no es la combinación más desfavorable: lo correcto es mayorar el efecto desfavorable con 1.35 y el favorable con 1.0 (CTE DB-SE §4.2), lo que da un momento neto mayor. Además q_heel_down incluye la sobrecarga q (variable) mayorada con γG en lugar de γQ.

**Evidencia**

```
Línea 511: `MEd_talon = GAMMA_G * Math.abs(M_talon_up - M_talon_down);` con `q_heel_down = (W_dry_heel + W_wet_heel + W_q_heel) / bT_m + GAMMA_C_RC * hf_m` (línea 509). El check de líneas 522-529 compara As_req_talon contra `As_prov_zs` (cara superior) sin distinguir el signo del momento.
```

**Fix sugerido**

Conservar el signo de M_talon y asignar el check a la cara correcta (zs si tracción superior, zi si inferior); mayorar por separado: 1.35·M_desfavorable − 1.0·M_favorable (y γQ=1.5/0 para la parte de q).

**Razonamiento del verificador**

Verificado leyendo retainingWall.ts (líneas 500-566) y ejecutando el motor sobre ~196k configuraciones. CONFIRMADO: (1) MEd_talon = γG·|M_up − M_down| (línea 511) enmascara el signo, y el check 'talon-bending'/'talon-asmin' (522-536) verifica siempre As_prov_zs (cara superior); el caso M_up > M_down ES alcanzable — 13.034 de 90.522 configuraciones donde todos los checks geotécnicos pasan presentan inversión (zapatas con resultante hacia el talón, e<0), y con bP=0 la cara inferior queda sin ningún check de flexión. La punta (línea 578) sí conserva el criterio de signo (max(·,0) + As_prov_zi), evidenciando la omisión en el talón. (3) W_q_heel (sobrecarga variable) se mayora con γG=1.35 en vez de γQ=1.5, inconsistente con el fuste (líneas 396-401) que separa correctamente γQ·q. REFUTADO PARCIALMENTE: la sub-afirmación (2) del auditor — que lo correcto sería 1.35·desfavorable − 1.0·favorable per CTE DB-SE §4.2 — es errónea: σ bajo el talón es la reacción de equilibrio a las mismas cargas (principio de origen único, EN 1990 §6.4.3.1(4)); mayorar el peso con 1.35 y su propia reacción con 1.0 violaría el equilibrio, y γG·neto es la práctica estándar de diseño de zapatas (Calavera/EHE). ATENUANTES de severidad: en el peor caso invertido entre diseños geotécnicamente válidos, MEd=27 kNm/m con As_req=258 mm²/m < As_min=328 mm²/m — la demanda en la cara equivocada nunca superó la cuantía mínima en la rejilla explorada; y el efecto γG vs γQ sobre q es de pocos % (término parcialmente auto-cancelante). Defecto real (conviene conservar el signo y asignar la cara, como ya hace la punta, y usar γQ para q), pero de impacto práctico bajo.

---

#### 58. [retainingWall] Caso sísmico con nivel freático: sin amplificación de θ para suelo sumergido ni presión hidrodinámica; kv solo con un signo

- **Severidad:** low  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `retainingWall.ts:316-336`
- **ID:** `retWall-seismic-water-10`

**Descripción**

Con agua en el trasdós y sismo, EC8-5 Anejo E (E.6-E.7) exige usar un ángulo sísmico amplificado θ' = atan[(γsat/γ′)·kh/(1∓kv)] para la zona sumergida (la inercia actúa sobre γsat pero la resistencia sobre γ′) y añadir presión hidrodinámica (tipo Westergaard) para suelos de alta permeabilidad. El código aplica el mismo θ = atan(kh/(1−kv)) a todo el relleno y deja EW sin incremento dinámico. Además solo se evalúa kv con signo + (1−kv), cuando EC8 pide la combinación más desfavorable de ±kv. Solo afecta al caso (poco frecuente) de muro con NF alto en zona sísmica; el resultado queda del lado inseguro.

**Evidencia**

```
Líneas 316-332: `const theta = Math.atan(kh / (1 - kv)); ... + 0.5 * KAD * gamma_sub * h_wet * h_wet) * (1 - kv);` y línea 335: `const EAH_seis = EAD_soil * cos_d + EW;` — EW es el hidrostático estático sin término hidrodinámico; θ no se amplifica con γsat/γ′ en la zona sumergida (EC8-5 Anejo E §E.6).
```

**Fix sugerido**

Para la franja sumergida usar θ' = atan[(γsat/γ_sub)·kh/(1−kv)]; añadir presión hidrodinámica de Westergaard (7/12·kh·γw·h_wet²) si el suelo es permeable; evaluar ambos signos de kv y tomar el peor.

**Razonamiento del verificador**

Verificado en el código: (1) línea 316 calcula un único theta = atan(kh/(1−kv)) y un único KAD que se aplica también al término sumergido 0.5·KAD·gamma_sub·h_wet² (línea 331), sin la amplificación γsat/γ′ que exige EN 1998-5 Anejo E §E.6 para la franja bajo el NF (la inercia actúa sobre γsat, la resistencia sobre γ′); subestima θ en la zona húmeda ~×2, del lado inseguro. (2) EW (línea 176) es puramente hidrostático y se suma sin incremento dinámico en EAH_seis (línea 335); EC8-5 exige o bien θ' amplificado (suelo impermeable, E.6) o θ' + presión hidrodinámica tipo Westergaard 7/12·kh·γw·h² (suelo permeable, E.7) — el código no hace ninguna de las dos. (3) kv solo aparece con signo + en (1−kv) (líneas 316 y 332); EC8-5 §7.3.2.2 pide ambos signos, aunque este punto es de impacto menor (pocas %). El caso es alcanzable sin guard: hasWater, hw, Ab y S son inputs independientes (defaults.ts:269-273) y no hay validación que excluya agua+sismo; de hecho el término sísmico sumergido existe explícitamente, solo que con la formulación deficiente. El propio encabezado del archivo (líneas 4 y 14) declara conformidad con "NCSP-07 / EC8 Annex E", por lo que la desviación es contra la base normativa declarada por el propio código. Intenté refutar vía (a) guard upstream — solo existe el clamp phi_eff≥0, no relacionado; (b) que NCSP-07 no lo exija — NCSP-07 también requiere amplificación del ángulo sísmico y empuje hidrodinámico en relleno saturado; (c) que el (1−kv) global sea correcto — lo es como multiplicador M-O estándar, pero no sustituye la amplificación de θ ni la evaluación de ±kv. El hallazgo se sostiene. Severidad "low" correcta: caso poco frecuente (NF alto + zona sísmica) pero resultado del lado inseguro.

---

## Por motor: valoración global y hallazgos refutados

### anchorPlate

**Valoración:** Motor maduro y bien documentado (historial de auditoría PR0–PR10 visible en comentarios), con solvers de equilibrio plástico correctos en su mecánica básica (cuadrática partial-lift, bisección biaxial, Kj/fjd/c conformes a EC3 1-8 §6.2.5). Sin embargo, contiene un error crítico en la fórmula básica de edge breakout en cortante (V0Rk,c ≈ 3× sobreestimada respecto a EN 1992-4 §7.2.2.5), varios desajustes demanda/capacidad no conservadores (Ft medio en vez de máximo, VEd legacy ignorando Vy, área de proyección sin recortar por canto), y omisiones normativas relevantes (interacción N+V para modos de hormigón, T-stub lado tracción con prying, lb,min). El caso de cortante puro (NEd=Mx=My=0, V≠0) devuelve 'ok' sin ejecutar ningún check.

Confirmados: 13 · Refutados: 0

### masonryWalls

**Valoración:** Motor maduro y en general conservador: unidades consistentes, cascada de cargas LoadSegment sin double-counting, e_pie cruzado entre plantas correcto, y la linealización de Φ (S1) verificada numéricamente contra EC6 Anejo G resulta del lado seguro. Sin embargo omite la comprobación obligatoria de esbeltez límite λ≤27, el factor β de concentración §5.4 ignora los huecos (mide la distancia al borde del muro completo, no del machón) y omite el término Ab/Aef, no valida H (H≤0 produce NaN que acaba en veredicto CUMPLE), y el peso del antepecho bajo ventanas desaparece del modelo. Ninguno invalida el motor para el caso típico, pero tres de ellos pueden dar verde donde la norma exige fallo.

Confirmados: 6 · Refutados: 1

**Refutados (descartados por el verificador):**

- **H de planta no validado: H=0 produce NaN que termina en status 'ok' / CUMPLE** (`masonryWalls-02`)
  - El auditor acierta en las premisas (validateState no comprueba pl.H; repartoMomento(0, H_sup>0) devuelve Infinity/Infinity = NaN; el NaN propaga a e_cabeza → e_total → Phi → N_Rd) pero se equivoca en la conclusión, que es el núcleo del hallazgo. En las líneas 1100-1101 el motor calcula `eta_cabeza = N_Rd > 0 ? N_Ed / N_Rd : 99`. Como en JS `NaN > 0 === false`, con N_Rd=NaN ambos eta caen al fallback 99, no a NaN. Verificado ejecutando la cadena exacta del código: k_reparto=NaN, Phi=NaN, N_Rd=NaN, pero eta=99, etaMax=99, status='fail', overallStatus='INCUMPLE'. etaMax nunca es NaN porque etaConc no depende de Phi (y betaConcentracion ya guarda H_planta>0 en línea 706); N_Ed es siempre finito (integrateLoad, mayorarPuntual y dinteles no dividen por H). La planta superior, que hereda el NaN vía e_pie, cae en el mismo fallback y también marca 'fail'. Es decir, el caso descrito es fail-safe: produce veredicto rojo (η=9900%), no verde. El único H=0 sin NaN es la planta superior del edificio (repartoMomento(0,0) devuelve 1 por el guard !H_sup), que produce números finitos degenerados (λ=0, peso=0) — un hueco de validación de inputs real pero menor, sin el mecanismo NaN→CUMPLE reportado. Residual: convendría validar H en validateState y los NaN de e_total/Phi pueden mostrarse en la UI (cosmético), pero el defecto de seguridad reportado (verde sobre NaN) no existe.

### rcColumns

**Valoración:** Motor sólido en su arquitectura (compatibilidad de deformaciones con búsqueda binaria, criterio biaxial 5.39 con exponente interpolado, excentricidades mínima/imperfección/2º orden correctas en forma básica), pero con defectos no conservadores relevantes: la curvatura nominal omite el factor de fluencia Kφ, el umbral de esbeltez fijo λ=25 es inseguro frente a λ_lim=20·A·B·C/√n para axiles altos, en la "zona gap" (NRd_Whitney<NEd<NRd_max) devuelve un MRd evaluado a un axil inferior al aplicado, y la longitud de solape usa fctm sin γc ni α6 (solapes ~50% cortos). Los tests cubren bien la mecánica básica pero no validan contra valores normativos de referencia en estos regímenes.

Confirmados: 7 · Refutados: 0

### micropiles

**Valoración:** Motor maduro y bien trazado a la Guía Fomento 2005: las tablas (Fe, Fr, re, Tabla 2.3, A-5.1, clasificación EC3 5.2) coinciden verbatim con la norma, los módulos resistentes Wpl/Wel/Av son correctos y los casos límite (clase 4, corrosión total, suelo insuficiente, recubrimiento) se invalidan con mensaje. Se detectan dos defectos materiales: la inercia del tubo usa π/4 en vez de π/64 (Le y Lef salen el doble, distorsionando MEd vía la Tabla 3.9), y el pandeo no penaliza la porción sobre NF de un granular de compacidad media que atraviesa el freático (inconsistente con el split que sí se aplica a la arena floja). Además se omite la interacción M-N de EC3 §6.2.9 en la comprobación de flexión.

Confirmados: 7 · Refutados: 0

### isolatedFooting

**Valoración:** Motor bien estructurado (clasificación trapezoidal/bitriangular con Newton-Raphson robusto, gating rígida/flexible correcto según vuelo ≤ 2h, fórmula de biela-tirante Td = N·(B−a)/(6.8d) conforme a EHE 58.4.1.2). Sin embargo, contiene un bug crítico de unidades en el cortante (VRd multiplica vRdc por 1000 en vez de por d, sobreestimando la resistencia ~2-3x) y un error de dominio en la clasificación biaxial (usa núcleo central rectangular en vez de rómbico, subestimando σmax en flexión biaxial moderada). Las comprobaciones de estabilidad (vuelco/deslizamiento) no siguen el formato de coeficientes parciales de CTE DB-SE-C (omiten N estabilizador en vuelco y mayoran N favorable en deslizamiento), y faltan comprobaciones exigibles (sección de referencia a 0.15bc, β y deducción de reacción en punzonamiento, anclaje de armadura).

Confirmados: 6 · Refutados: 2

**Refutados (descartados por el verificador):**

- **Deslizamiento: la resistencia por fricción usa N mayorado (γ=1.35) siendo el axil una acción favorable** (`isolatedFooting-sliding-favorable-04`)
  - El auditor comparó N mayorado contra H característico, pero deriveLoads (líneas 117-130) mayora N y H con el MISMO γ=1.35, que se cancela en el cociente: la condición efectiva del código es μ·(N_k + W/1.35) ≥ 1.5·H_k. La formulación CTE DB-SE-C tabla 2.1 para deslizamiento es γE=1.0 con γR=1.5 (μ·(N_k+W) ≥ 1.5·H_k); el γ=0.9 favorable que cita el auditor corresponde a la verificación de VUELCO (acciones estabilizadoras), no a deslizamiento. Incluso el formato alternativo del propio auditor (0.9·μ·(N+W) ≥ 1.35·H) equivale exactamente a μ·(N+W) ≥ 1.5·H, idéntico a tabla 2.1. El código pondera W con 0.74 en vez de 1.0, luego es MÁS estricto que CTE, no ~10-15% menos exigente: el auditor invirtió la dirección del sesgo. La no-concomitancia de N variable con H es una limitación documentada del diseño del motor (un único juego de cargas con γ global, sin descomposición G/Q, aplicado coherentemente también a vuelco) y responsabilidad del usuario al elegir la combinación, no el defecto reportado. El test isolatedFooting.test.ts:157-163 confirma el comportamiento intencionado.
- **Flexión en zapata flexible: sección de referencia en la cara del pilar en vez de a 0.15·bc hacia el interior** (`isolatedFooting-flexure-refsection-05`)
  - La descripción fáctica es correcta (MEd = σ·v²/2 con v geométrico a cara de pilar, líneas 399-410), pero la premisa normativa del auditor falla: EHE-08 art. 58.4.2.1.1 (sección S1 a 0.15a hacia el interior del soporte) NO está "recogido por el Código Estructural". La EHE-08 fue derogada por el CE (RD 470/2021), cuyas reglas de proyecto de hormigón son el Anejo 19 = EN 1992-1-1, que no contiene la regla 0.15a; la práctica estándar EC2 (coherente con EN 1992-1-1 5.3.2.2(3) y el modelo de 9.8.2.2) toma la sección crítica a flexión de zapatas en la cara del soporte, que es exactamente lo que hace el código. El repo declara explícitamente el marco CE/Anejos-Eurocódigo (p.ej. anchorPlate.ts). La regla 0.15a es tradición española heredada (EHE/Calavera/CYPE), más conservadora (~5-15% más MEd en flexibles), pero su omisión no constituye violación de la norma vigente declarada (CE + CTE DB-SE-C). El uso puntual de EHE 58.4.1.2 para el tirante de zapata rígida no obliga normativamente a adoptar 58.4.2.1.1 en flexibles (EC2 carece de fórmula de tirante, pero sí tiene criterio de sección a flexión). Queda como mejora opcional de conservadurismo/documentación, no como defecto normativo; confianza media porque la verificación del contenido exacto del Anejo 19/NDPs se basa en conocimiento del dominio, no en el texto oficial consultado en vivo.

### retainingWall

**Valoración:** El motor tiene una base geométrica y de empujes estáticos sólida (Coulomb Ka correcto, zonificación de agua y subpresión bien tratadas, brazos de momento correctos), pero presenta defectos normativos relevantes: la comprobación sísmica omite por completo la inercia del propio muro (EC8-5 §7.3.2.2 / NCSP-07), el umbral de vuelco usa FS≥1.5 cuando CTE DB-SE-C Tabla 2.1 equivale a 2.0 (1.8/0.9), y la sobrecarga variable q se cuenta como estabilizadora. Además hay errores numéricos menores: la fórmula de Mononobe-Okabe usa sin(φ-θ+δ) en lugar de sin(φ+δ), y VRd,c omite el factor 100 en (100·ρl·fck)^(1/3).

Confirmados: 10 · Refutados: 0

### rcSlabs

**Valoración:** El motor rcSlabs (reticular sección T + losa maciza) tiene una arquitectura limpia y la flexión T/rectangular, b_eff y la mecánica de fisuración (sr,max, εsm−εcm) son esencialmente correctas. Sin embargo, presenta un defecto no conservador grave: VRd,max usa el coeficiente 0.3 (θ=45°) mientras VRd,s usa cotθ=2.5, sobreestimando el aplastamiento de biela un 45%; además omite por completo la comprobación de flecha (CTE DB-SE 4.3.3 / esbeltez L/d) que el módulo declara calcular, y las longitudes de anclaje reportadas son ~30% cortas por usar fctd=fctm/1.5 sin el factor 0.7 de fctk,0.05. El resto de hallazgos son errores conservadores (factor 100 omitido en VRd,c, As,min de viga aplicado a losa) o menores.

Confirmados: 9 · Refutados: 0

---

# Adenda — Motores 8 y 9: vigas RC y vigas de acero (2026-06-11)

> Auditoría ejecutada con **Fable 5** sobre `rcBeams.ts`/`rcBeamsSection.ts` (vigas de hormigón armado) y
> `steelBeams.ts`/`beamCases.ts`/`loadGen.ts`/`iSection.ts` (vigas de acero), con verificación numérica de cada
> hallazgo y **un segundo agente Fable adversarial** que intentó refutar cada uno contra el código real.
> Mismo aviso que la auditoría principal: sin validación contra casos resueltos de norma — añadir test-oracles antes de dar por bueno cada fix.
>
> **Estado: los 16 hallazgos corregidos** (con test-oracles de mano) en tres commits:
> `0839d95` fix(rc-beams) #59-60, 64-66, 68-71 · `f8e26d9` fix(steel-beams) #61-63, 72-74 · `4bd941c` feat(rc-beams) esbeltez L/d #67.

## Resumen de la adenda

| Métrica | Valor |
|---|---|
| Motores auditados | 2 |
| Hallazgos confirmados | **16** |
| Hallazgos refutados | 0 (2 matizados por el verificador) |
| 🔴 Críticos | 0 |
| 🟠 Altos | 3 |
| 🟡 Medios | 6 |
| 🔵 Bajos | 7 |
| Numéricos | 4 |
| Normativos | 12 |

## Índice de hallazgos de la adenda

| # | Sev | Cat | Motor | Título | Ubicación |
|---|---|---|---|---|---|
| 59 | 🟠 high | norm | rcBeams | VRd,max con coeficiente 0.3 (θ=45°) mientras VRd,s usa cotθ=2.5 — biela sobreestimada ×1.45 | `src/lib/calculations/rcBeams.ts:251-253` |
| 60 | 🟠 high | num | rcBeams | Momentos negativos: flexión y fisuración en verde silencioso; en modo simple, throw en render → reload de página | `rcBeams.ts:179-185, 389-405; rcBeamsSection.ts:241-243; RCBeamsInputs.tsx:191-202` |
| 61 | 🟠 high | norm | steelBeams | Mcr sin término de altura de aplicación de la carga (C2·zg): UDL en ala superior desestabilizante → Mb,Rd sobreestimado ~20% | `src/lib/sections/iSection.ts:101-111 + steelBeams.ts:200-217` |
| 62 | 🟡 medium | norm | steelBeams | fy nominal sin reducción por espesor t>16 mm (S275→265, S355→345) — ~14 perfiles del catálogo afectados | `src/lib/calculations/steelBeams.ts:145` |
| 63 | 🟡 medium | norm | steelBeams | χLT sin el tope adicional χLT ≤ 1/λ̄LT² de EC3 6.3.2.3 — no conservador en esbeltez alta (hasta +33% asintótico) | `src/lib/calculations/steelBeams.ts:209-213` |
| 64 | 🟡 medium | num | rcBeams | NumField ignora el prop `min` (código muerto): habilita Md<0, spacing=0 y stirrupLegs=1 (s_t = ∞ por división por cero) | `src/features/rc-beams/RCBeamsInputs.tsx:32-51 + rcBeams.ts:312` |
| 65 | 🟡 medium | norm | rcBeams | Longitud de solape fija 60φ/84φ independiente de fck y fyk — 15-39% corta para fck<25 y ~18% corta para B600 | `src/lib/calculations/rcBeams.ts:419-420` |
| 66 | 🟡 medium | norm | rcBeams | Fisuración: el 3.4·c de sr,max usa el recubrimiento al estribo en vez de a la barra longitudinal — wk subestimado sistemáticamente | `src/lib/calculations/rcBeams.ts:400` |
| 67 | 🟡 medium | norm | rcBeams | Comprobación de flecha (ELS) ausente — gap de alcance: el módulo no tiene luz L en sus inputs | `src/lib/calculations/rcBeams.ts (todo el módulo)` |
| 68 | 🔵 low | num | rcBeams | VRd,c sin el factor 100 en (100·ρl·fck)^(1/3) — conservador, mitigado por el suelo vmin (ya corregido en rcSlabs) | `src/lib/calculations/rcBeams.ts:246` |
| 69 | 🔵 low | norm | rcBeams | spacing=0 → viga sin cercos verificable sin aviso de cuantía mínima transversal obligatoria (CE Anejo 19 §9.2.2) | `src/lib/calculations/rcBeams.ts:156, 275` |
| 70 | 🔵 low | norm | rcBeams | sr,max sin el límite de validez de separación ≤ 5(c+φ/2) de EC2 7.3.4(3) | `src/lib/calculations/rcBeams.ts:400` |
| 71 | 🔵 low | num | rcBeams | pickSectionInputs: Ms = ψ2·(M_G+M_Q) en vez de M_G+ψ2·M_Q — latente (ningún consumer lee .Ms) | `src/lib/calculations/rcBeams.ts:104-106` |
| 72 | 🔵 low | norm | steelBeams | Interacción M-V: clase 3 sin reducción (1−ρ)·fy en el área de cortante (EC3/CTE 6.2.8(3)) | `src/lib/calculations/steelBeams.ts:191-197` |
| 73 | 🔵 low | norm | steelBeams | Los checks citan CTE DB-SE-A §6.3.2 pero implementan EC3 6.3.2.3 laminados (λLT,0=0.4, β=0.75) — trazabilidad del PDF | `src/lib/calculations/steelBeams.ts:204-216` |
| 74 | 🔵 low | norm | steelBeams | ψ de categoría G1 (cubierta solo conservación) = {0.7, 0.5, 0.3} en vez de 0 (CTE DB-SE Tabla 4.2) — conservador | `src/lib/calculations/loadGen.ts:37` |

## Detalle de hallazgos de la adenda

### 🟠 HIGH

#### 59. [rcBeams] VRd,max con coeficiente 0.3 (θ=45°) mientras VRd,s usa cotθ=2.5 — biela sobreestimada ×1.45

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcBeams.ts:251-253`
- **ID:** `rcBeams-vrdmax-01`

**Descripción**

Idéntico al hallazgo #3 (rcSlabs, ya corregido allí): `VRds = Asw·z·fyd·2.5` toma el cotθ máximo, pero `VRdmax = 0.3·(1−fck/250)·fcd·b·z` corresponde a θ=45° (ν1/2). Con cotθ=2.5 el coeficiente correcto es ν1/(cotθ+tanθ) = 0.6·(1−fck/250)/2.9 ≈ 0.207 — el código toma simultáneamente el mejor valor de ambas fórmulas, sobreestimando el aplastamiento de biela un 45%. `VRd = min(VRds, VRdmax)` (línea 254), así que el valor inflado entra directo en el check `shear` y en el check explícito `shear-max`.

**Evidencia**

```
const cotTheta = 2.5;
const VRds = (Asw * z * fyd * cotTheta) / 1000;
const VRdmax = (0.3 * (1 - inp.fck / 250) * fcd * inp.b * z) / 1000;
— rcSlabs.ts:619-624 ya está corregido con comentario explícito («con el MISMO θ que VRd,s. Para cotθ=2.5 → divisor 2.9»).
```

**Razonamiento del verificador**

Confirmado. Caso numérico alcanzable: b=300, d=454 (z=409), C25, Ø10/c100 2R → VRds=698 kN, VRdmax_código=553 kN, VRdmax_correcto=381 kN; con VEd=450 kN el motor da util 0.81 (ok) cuando la real es 1.18 (fail) — patrón verde-cuando-falla en modo frágil. En vigas (b≥250-300 típico) VRdmax no gobierna con los defaults (VRds=298 kN < 553), solo con cercos densos: high, no critical. La inconsistencia con el motor hermano ya corregido confirma bug, no decisión. Ningún test pina el valor de VRdmax (solo la presencia de la fila).

**Fix sugerido**

`const nu1 = 0.6 * (1 - inp.fck / 250); const VRdmax = (nu1 * fcd * inp.b * z / (cotTheta + 1 / cotTheta)) / 1000;` — el mismo fix ya aplicado en rcSlabs.ts:624. Añadir test oracle.

---

#### 60. [rcBeams] Momentos negativos: flexión y fisuración en verde silencioso; en modo simple, throw en render → reload de página

- **Severidad:** high  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `rcBeams.ts:179-185 (check bending), 389-405 (fisuración); rcBeamsSection.ts:241-243 (throw); RCBeamsInputs.tsx:191-202`
- **ID:** `rcBeams-negative-moment-02`

**Descripción**

La UI etiqueta el momento de apoyo como |Md| pero no fuerza el signo: `UnitNumberInput` es `type="text"` y su `min` es solo un hint documentado como «no enforcement». Con Md<0 (convención habitual del proyectista para M−), `makeCheckQty` da utilización negativa → status 'ok' silencioso; con Ms≤0 el guard `if (inp.Ms > 0)` deja wk=0 → fisuración 'ok'. Además, en modo simple `solveSectionAtMoment` lanza `throw` para M<0 **durante el render** (useMemo en RCBeamSimpleView.tsx:40-41) sin try/catch: el error cae al errorElement raíz que hace `window.location.reload()` — teclear «-1» en Md provoca un reload completo de la página. Mismo patrón que el hallazgo #53 de rcSlabs, corregido en forjados (commit 7171bed «normaliza signo de momentos») pero no aquí.

**Razonamiento del verificador**

Confirmado en sus tres patas. (1) Negativos alcanzables tecleando (min no aplica a inputs text y los campos Md/M_G/M_Q ni siquiera lo pasan). (2) util<0 → toStatus 'ok' verificado en types.ts. (3) El único error boundary (`ChunkErrorBoundary`) re-lanza errores no-chunk → `ChunkErrorElement` → reload incondicional. Matiz: la persistencia a localStorage está debounced 300ms y el crash es síncrono, así que el valor malo no persiste — reload recuperable, no brick. La ruta PDF sí está protegida (usePdfPreview tiene catch). En modo pórtico no hay crash, solo el 'ok' silencioso no conservador.

**Fix sugerido**

Normalizar signo en el motor (Md = |Md|, M_G/M_Q = |·| en pickSectionInputs y calcRCBeam), como se hizo en forjados; opcionalmente clamp en onChange de la UI. Test: apoyo_Md=-65 debe dar la misma utilización que +65.

---

#### 61. [steelBeams] Mcr sin término de altura de aplicación de la carga (C2·zg): UDL en ala superior desestabilizante → Mb,Rd sobreestimado ~20%

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/sections/iSection.ts:101-111 (computeMcr) + steelBeams.ts:200-217`
- **ID:** `steelBeams-mcr-zg-01`

**Descripción**

`computeMcr` implementa la fórmula clásica F.2 solo con C1, asumiendo carga aplicada en el centro de esfuerzos cortantes. Pero las cargas del módulo son gk/qk superficiales × ancho tributario — físicamente aplicadas en el ala superior, posición desestabilizante. La fórmula completa es Mcr = C1·(π²EIz/L²)·[√(Iw/Iz + L²GIt/(π²EIz) + (C2·zg)²) − C2·zg] con C2=0.459 (UDL) y zg=h/2. Ejemplo IPE300/S275, L=Lcr=5 m: Mcr código = 130.7 kNm; con C2·zg → 97.4 kNm (−25%); λLT 1.149→1.331, χLT 0.609→0.507 → **Mb,Rd sobreestimado +20%** en el check que típicamente gobierna vigas sin arriostrar. Agravante en ménsula: F.2 con Lcr=2L y C1=1.0 no es el método validado para voladizos, y con carga desestabilizante en el extremo libre el error crece (literatura Trahair/Andrade da valores menores).

**Razonamiento del verificador**

Confirmado — recalculé el ejemplo completo y cuadra al kNm (factor1=500.7 kN, √term2=231 mm, Mcr=130.7; con zg: 172.2 mm → 97.4). Matiz: en vigas que soportan forjado el ala comprimida suele estar arriostrada en continuo y el usuario puede bajar Lcr; pero el caso por defecto del módulo (Lcr=L, sin opción «arriostrada») es exactamente donde el término zg importa. High defendible: no conservador en el modo que gobierna.

**Fix sugerido**

Añadir el término C2·zg a computeMcr (C2 por beamType: ss/fp/ff UDL ≈ 0.45-0.55, ménsula UDL ≈ 0.43 con su C1 propio), con zg=+h/2 por defecto y opción «carga estabilizante/centro de cortantes» en la UI. Para la ménsula, considerar el método específico de voladizos. Test oracle con el ejemplo IPE300 de arriba.

---

### 🟡 MEDIUM

#### 62. [steelBeams] fy nominal sin reducción por espesor t>16 mm

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/steelBeams.ts:145`
- **ID:** `steelBeams-fy-thickness-02`

`fy = inp.steel === 'S275' ? 275 : 355` ignora el espesor. CTE DB-SE-A Tabla 4.1 / EN 10025-2: para 16 < t ≤ 40 mm, S275→265 N/mm² (+3.8% de error) y S355→345 (+2.9%). Verificado en catálogo: IPE550 (tf=17.2), IPE600 (19), HEB240-400 (17-24), HEA360/400 (17.5/19) y los IPN≥340 — ~14 perfiles donde **todas** las resistencias (Mc,Rd, Vc,Rd, Mv,Rd, Mb,Rd) quedan sobreestimadas sistemáticamente. Error pequeño pero no conservador y trivial de corregir: `const fy = base − (profile.tf > 16 ? 10 : 0)`.

---

#### 63. [steelBeams] χLT sin el tope adicional χLT ≤ 1/λ̄LT² (EC3 6.3.2.3)

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/steelBeams.ts:209-213`
- **ID:** `steelBeams-chilt-cap-03`

Hallazgo aportado por el verificador. La ec. 6.57 del caso laminados (β=0.75) exige χLT ≤ min(1; 1/λ̄LT²); el código solo capa a 1.0. Con β<1 la fórmula puede superar 1/λ̄² — es decir, Mb,Rd > Mcr, físicamente imposible. A λ̄LT=2.0: Φ=2.272, χ_fórmula=0.267 > 0.250 (+7%); el exceso crece asintóticamente hasta ×1/β = +33%. No conservador justo en esbeltez alta, donde LTB gobierna, y se **acumula** con el #61. Fix de una línea: `chi_LT = Math.min(1.0, 1 / lambda_LT ** 2, ...)`.

---

#### 64. [rcBeams] NumField ignora el prop `min` (código muerto) — habilita inputs degenerados

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Confianza:** high
- **Ubicación:** `src/features/rc-beams/RCBeamsInputs.tsx:32-51 + rcBeams.ts:312`
- **ID:** `rcBeams-numfield-min-04`

Hallazgo aportado por el verificador, causa raíz de los #60 y #69: `NumField` declara `min` en su tipo pero **nunca lo destructura ni lo aplica** (y siendo `type="text"` tampoco serviría como atributo DOM). Todos los `min={50}`, `min={2}`, `min={1}` del formulario son decorativos. Consecuencia adicional propia: `stirrupLegs=1` es tecleable → `s_t = innerWidth/(stirrupLegs−1)` divide por cero → fila con «s_t = Infinity mm»; con `stirrupLegs=0`, ρw=0 y utilización Infinity. Un único fix (clamp en onChange/onBlur de NumField) cierra el crash del #60, el caso sin cercos del #69 y esta división por cero.

---

#### 65. [rcBeams] Longitud de solape fija 60φ/84φ independiente de fck y fyk

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcBeams.ts:419-420`
- **ID:** `rcBeams-lap-length-05`

Los factores 60 (good) / 84 (poor) están calibrados exactamente para C25+B500 (lb,rqd = φ·fyd/(4·fbd) con fbd = 2.25·0.7·fctm/1.5; ×α6=1.5 → 60.6φ ✓). Para otros materiales el valor impreso queda corto: C20 → 70.3φ (−15%), C16 → 81.7φ (−27%), C12 → 98.9φ (−39%), C25+B600 → 72.8φ (−18%). `availableFck` arranca en 12 y la UI ofrece fyk=600. Matiz del verificador: es una fila informativa (no altera el veredicto), y el CE exige C25 mínimo para armado estructural — pero B600 es un caso legítimo no conservador, y el valor va a un PDF firmable. Los tests consolidan 60φ/84φ y habría que recalibrarlos. Fix: calcular lbd real desde fctm/fyd como ya hace rcColumns tras su fix (#18).

---

#### 66. [rcBeams] Fisuración: el 3.4·c usa el recubrimiento al estribo, no a la barra longitudinal

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcBeams.ts:400`
- **ID:** `rcBeams-srmax-cover-06`

Hallazgo aportado por el verificador. EC2 7.3.4 define c como el recubrimiento de la armadura **longitudinal** traccionada (= cover + Øestribo en este modelo de sección), pero `srMax = 3.4 * inp.cover + …` usa el recubrimiento al estribo. Con Ø8 de estribo subestima sr,max en 3.4·8 ≈ 27 mm (~10% del sr,max típico de ~270 mm) → wk subestimado sistemáticamente, no conservador, en **todos** los cálculos de fisuración del módulo, no en un caso borde. El mismo patrón merece barrido en rcSlabs. Fix: `3.4 * (inp.cover + inp.stirrupDiam)`.

---

#### 67. [rcBeams] Comprobación de flecha (ELS) ausente

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/rcBeams.ts (todo el módulo)`
- **ID:** `rcBeams-deflection-07`

CTE DB-SE 4.3.3 exige la verificación de flecha y el módulo no la implementa (verificado: cero menciones en motor y UI). Matiz importante del verificador: a diferencia de steel-beams, `RCBeamInputs` no incluye luz L ni cargas lineales (las entradas son esfuerzos de sección), así que la flecha es **incomputable con los inputs actuales** — es un gap de alcance del módulo, no un cálculo erróneo. La vía de implementación natural con datos mínimos sería el método simplificado de esbeltez L/d de EC2 7.4.2 (añadiendo un único input L). Equivalente al precedente #37 de rcSlabs (medium).

---

### 🔵 LOW

#### 68. [rcBeams] VRd,c sin el factor 100 en (100·ρl·fck)^(1/3)

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Ubicación:** `rcBeams.ts:246`  ·  **ID:** `rcBeams-vrdc-100-08`

Mismo patrón que el #38 de rcSlabs (ya corregido allí, rcSlabs.ts:601): `(ρl·fck)^(1/3)` divide el término por 100^(1/3)=4.64. Mitigado por el suelo `VRdc2` (≈vmin de EC2, correcto), que pasa a gobernar casi siempre: subestimación real ~10-45% (ρl=1%, C25, d=454 → 0.366 vs 0.585 N/mm², −37%), siempre conservadora. Solo entra en el check cuando spacing=0 (alcanzable, ver #64); VRdc no se imprime como valor independiente. Fix: añadir el 100 como en rcSlabs.

#### 69. [rcBeams] spacing=0 → viga sin cercos verificable sin aviso de cuantía mínima

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `rcBeams.ts:156, 275`  ·  **ID:** `rcBeams-no-stirrups-09`

Con spacing=0 el motor toma VRd=VRdc y omite la fila `rho-w-min` (bloque `if (hasStirrups)`), presentando como verificable una viga sin armadura transversal — obligatoria en vigas per CE Anejo 19 §9.2.2(4)-(5). La supuesta mitigación de UI (`min={50}`) no existe (#64) y los tests consolidan el comportamiento (rcBeams.test.ts:340-343). Numéricamente conservador (refuerza el #68), pero gap normativo silencioso: emitir fila 'fail' o warn «cuantía mínima de cercos obligatoria en vigas».

#### 70. [rcBeams] sr,max sin el límite de validez de separación ≤ 5(c+φ/2)

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `rcBeams.ts:400`  ·  **ID:** `rcBeams-srmax-validity-10`

EC2 7.3.4(3): la fórmula 3.4c+0.425·k1·k2·φ/ρeff solo vale si la separación entre barras ≤ 5(c+φ/2); si no, sr,max = 1.3(h−x). No implementado. Matiz del verificador: el ejemplo original (2Ø16 en b=300) estaba mal calculado — con c a la barra longitudinal (38 mm) el límite es 230 mm y la separación 208 → válido; el gap real aparece p.ej. con 2Ø16 en b=350 (258 > 230). Existe pero con margen más estrecho del afirmado: wk subestimado solo con barras muy separadas en vigas anchas.

#### 71. [rcBeams] pickSectionInputs: Ms = ψ2·(M_G+M_Q) en vez de M_G+ψ2·M_Q

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Ubicación:** `rcBeams.ts:104-106`  ·  **ID:** `rcBeams-pickinputs-ms-11`

Fórmula cuasipermanente errónea en la ruta duplicada de ensamblaje de inputs (calcRCBeam:459-460 la tiene bien). 100% latente hoy: los tres consumers (RCBeamSimpleView, index.tsx:195, pdf/rcBeams.ts:278) llaman `solveSectionAtMoment(secInp, secInp.Md)` y el solver nunca lee `.Ms`. Si algún día se consumiera, subestimaría Ms ≈ 70%·M_G (no conservador en fisuración). Fix barato preventivo: replicar la fórmula correcta o derivar ambas rutas de una única función.

#### 72. [steelBeams] Interacción M-V: clase 3 sin reducción (1−ρ)·fy

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `steelBeams.ts:191-197`  ·  **ID:** `steelBeams-mv-class3-12`

Comentario explícito «Class 3: no reduction», pero EC3/CTE 6.2.8(3) exige reducir con (1−ρ)·fy en el área de cortante para cualquier clase. Alcanzable: HEA300/S355 es clase 3 (ala: c/(tf·ε)=10.43>10, verificado) y necesita además VEd>0.5·Vc,Rd en la sección de M máximo — solo en cantilever/fp/ff cortos y muy cargados (en ss el check no se emite). Combinación estrecha y efecto de pocos %.

#### 73. [steelBeams] Cita CTE DB-SE-A §6.3.2 pero implementa EC3 6.3.2.3 (laminados)

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `steelBeams.ts:204-216`  ·  **ID:** `steelBeams-ltb-citation-13`

λLT,0=0.4, β=0.75 y curvas por h/b (Tabla 6.5) son el caso «secciones laminadas» de EC3 6.3.2.3 / CE Anejo 22 — método defendible y acogido por el marco normativo del proyecto, pero **menos conservador** que el método general del artículo CTE citado en todas las filas de checks y en el PDF (λLT,0=0.2, β=1). Defecto de trazabilidad: o se cambia la cita a CE Anejo 22 §6.3.2.3 / EC3, o se cambia el método.

#### 74. [steelBeams/loadGen] ψ de categoría G1 ≠ 0

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `loadGen.ts:37`  ·  **ID:** `steelBeams-psi-g1-14`

`G1 = {ψ0: 0.7, ψ1: 0.5, ψ2: 0.3}` pero CTE DB-SE Tabla 4.2 da ψ0=ψ1=ψ2=0 para cubiertas accesibles únicamente para conservación. Impacto mínimo y conservador: ψ0 nunca se usa (una sola variable, ELU con γQ·Qk completo) y la combinación por defecto es la característica (ψ=1); solo aflora si el usuario elige frecuente/cuasipermanente, inflando la flecha hasta +0.5·Qk·bTrib. Corregir la fila a ceros.

---

## Valoración por motor (adenda)

### rcBeams (+ rcBeamsSection)

**Valoración:** El corazón del motor es notablemente bueno: el solver de compatibilidad de deformaciones (parábola-rectángulo CE 21.3.3 + diagrama de pivotes A/B con ε_ud, integración Simpson, fallback de monotonía para secciones sobrearmadas) es la implementación más rigurosa de flexión de los 9 motores auditados, y resuelve correctamente los casos que en rcSlabs fallaban (sobrearmado con MRd divergente). Los mínimos/máximos de armadura, separaciones y la mecánica de fisuración (Ac,eff, εsm−εcm, kt=0.4) son esencialmente correctos. Los defectos están en la periferia: el cortante hereda los dos bugs ya corregidos en rcSlabs (VRd,max con θ=45° frente a cotθ=2.5 — no conservador ×1.45 — y el factor 100 de VRd,c), los momentos negativos pasan en verde silencioso (y revientan el render en modo simple) porque el `min` del formulario es código muerto, el solape impreso solo es válido para C25+B500, y la fisuración subestima sr,max al medir c al estribo. Falta flecha, aunque es un gap de alcance (el módulo no conoce L).

Confirmados: 10 · Refutados: 0 (2 matizados)

### steelBeams (+ beamCases/loadGen/iSection)

**Valoración:** Motor compacto y mayormente correcto: clasificación EC3 Tabla 5.2 bien implementada, Av y Vpl,Rd correctos, interacción M-V clase 1-2 conforme a 6.2.8(5), los cuatro casos de viga (M, V, V en sección crítica, k de flecha) verificados analíticamente exactos, y deflexión con combinación ELS seleccionable. Las debilidades se concentran en el LTB, justamente el check que gobierna vigas sin arriostrar: Mcr ignora la altura de aplicación de la carga (UDL en ala superior desestabilizante → Mb,Rd +20% en el ejemplo verificado, peor en ménsula donde F.2 con Lcr=2L tampoco es el método validado) y χLT omite el tope 1/λ̄² (hasta +33% en esbeltez alta) — ambos errores no conservadores y acumulativos. Además fy no se reduce para t>16 mm (~14 perfiles del catálogo, +3-4% en todas las resistencias) y las filas citan CTE 6.3.2 mientras implementan EC3 laminados. El resto son detalles (clase 3 en M-V, ψ de G1).

Confirmados: 6 · Refutados: 0

---

# Adenda 2 — Motor 10: encepados de micropilotes (pileCap) (2026-06-11)

> Auditoría ejecutada con **Fable 5** sobre `pileCap.ts` (489 líneas — bielas y tirantes para encepados de
> 2/3/4 micropilotes), con verificación numérica y **un segundo agente Fable adversarial** que intentó refutar
> cada hallazgo contra el código real (motor, UI, SVG, PDF y defaults). Sin validación contra casos resueltos
> de norma — añadir test-oracles con cada fix (este motor además **no tiene ningún test**, ver #81).
>
> **Estado: los 13 hallazgos corregidos** en commits `1682ccf` + alineación normativa posterior.
> Marco normativo final: **Código Estructural (CE) + Anejo 19** — la EHE-08 (derogada) se usa solo como
> origen de la geometría de modelo (z=0.85d, v+0.25a, bandas sobre pilotes), nunca como exigencia.
> Decisiones bajo CE: **sin tope fyd≤400** en tirantes (#85, era regla EHE; CE Anejo 19 §6.5.3 no lo
> recoge) y armadura secundaria emitida como **RECOMENDADA** (práctica ex-EHE 58.4.1.4; CE Anejo 19
> §9.8.1 no la exige con carácter general) (#79). Resto de fixes: peso propio, anclaje lbd con patilla
> (fctd con 0.7, CE Anejo 19 §8.4), nodo C-C-C, My visible en n=2, e_borde, checks no-vacuos.
> + **Primera suite de tests del motor** (44 tests con oracles a mano).

## Resumen de la adenda 2

| Métrica | Valor |
|---|---|
| Motores auditados | 1 |
| Hallazgos confirmados | **13** |
| Hallazgos refutados | 0 (3 matizados) |
| 🔴 Críticos | 0 |
| 🟠 Altos | 1 |
| 🟡 Medios | 6 |
| 🔵 Bajos | 6 |
| Numéricos | 6 |
| Normativos | 7 |

## Índice de hallazgos de la adenda 2

| # | Sev | Cat | Motor | Título | Ubicación |
|---|---|---|---|---|---|
| 75 | 🟠 high | norm | pileCap | Anclaje siempre-verde: fctd sin el 0.7 (lb 43% corta) y demanda = lb,min (0.3·lb) en vez de la lbd completa del tirante | `src/lib/calculations/pileCap.ts:316-322 y 460-467` |
| 76 | 🟡 medium | num | pileCap | My_Ed oculto pero activo en n=2: el estado persistido sigue alterando las reacciones sin campo visible | `PileCapInputsPanel.tsx:163-174 + pileCap.ts:216-221` |
| 77 | 🟡 medium | num | pileCap | Peso propio del encepado omitido en las reacciones (−14% en R_max con defaults) | `src/lib/calculations/pileCap.ts:216-221` |
| 78 | 🟡 medium | num | pileCap | z_eff = canto útil completo (nodo de compresión en la fibra superior) y brazo horizontal al centroide del pilar — error de signo variable (−8% a +2%) | `src/lib/calculations/pileCap.ts:235, 247-276` |
| 79 | 🟡 medium | norm | pileCap | Armadura secundaria de encepados rígidos ausente (retícula horizontal/vertical y armadura superior, EHE-08 58.4.1.4) | `src/lib/calculations/pileCap.ts (ausente)` |
| 80 | 🟡 medium | num | pileCap | n=3: armadura despiezada solo en dirección X — el tirante del pilote superior (Y) queda sin barras; el SVG dibuja los lados del triángulo, contradiciendo el despiece | `src/lib/calculations/pileCap.ts:262-264, 283-296` |
| 81 | 🟡 medium | num | pileCap | Sin ningún test (unit ni oracle) — único motor de cálculo del repo sin suite; explica que los checks vacuos hayan sobrevivido | `src/test (ausente)` |
| 82 | 🔵 low | num | pileCap | Check de tirante vacuo: compara As_min vs As_prov (siempre verde por construcción) y oculta la utilización real As_adoptada/As_prov; separación mínima entre barras sin comprobar | `src/lib/calculations/pileCap.ts:407-457` |
| 83 | 🔵 low | norm | pileCap | k=0.60 etiquetado como nodo C-C-T (EC2 §6.5.4: 0.85·ν′·fcd; el 0.60 es biela fisurada §6.5.2 — conservador ×1.42) y nodo C-C-C bajo el pilar sin comprobar | `src/lib/calculations/pileCap.ts:254 (+ ausente)` |
| 84 | 🔵 low | norm | pileCap | Semántica de R_adm sin documentar: R_max (ELU) comparado contra una capacidad «admisible» (servicio); el warn de tracción usa la capacidad a compresión como denominador | `PileCapInputsPanel.tsx:149-157 + pileCap.ts:347-368` |
| 85 | 🔵 low | norm | pileCap | fyd sin el tope de 400 N/mm² de EHE-08 58.4.1.1 para tirantes de cimentación B&T, con citas mezcladas CE/EHE en el propio módulo | `src/lib/calculations/pileCap.ts:207, 286, 306` |
| 86 | 🔵 low | norm | pileCap | Tirantes repartidos en todo el ancho del encepado en vez de en banda sobre los pilotes (EHE 58.4.1.1); el SVG dibuja tirantes pilote-a-pilote, inconsistente con el despiece | `src/lib/calculations/pileCap.ts:283-296, 305-314` |
| 87 | 🔵 low | norm | pileCap | e_borde = max(1.5·d_p, 300) por debajo de la regla práctica d_p/2 + 250 mm para d_p < 250 — agrava el anclaje horizontal del #75 | `src/lib/calculations/pileCap.ts:142` |

## Detalle de hallazgos de la adenda 2

### 🟠 HIGH

#### 75. [pileCap] Anclaje siempre-verde: fctd sin el 0.7 y demanda = lb,min en vez de la lbd completa del tirante

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/pileCap.ts:316-322 (cálculo) y 460-467 (check 'anchorage')`
- **ID:** `pileCap-anchorage-01`

**Descripción**

Doble defecto no conservador con patrón siempre-verde. (a) `fctd = fctm/1.5` omite el factor 0.7 de fctk,0.05 — mismo defecto que el #19 de rcSlabs (high, ya corregido allí); fbd queda inflado ×1.43 y lb un 30% corta. (b) La demanda del check es `lb_net = max(0.3·lb, 10φ, 100)` — el **mínimo absoluto** de anclaje de EC2 §8.4.4 — cuando el tirante de un nodo C-C-T debe desarrollar su fuerza completa anclando desde el nodo sobre el pilote (EC2 §6.5.4(7)): la demanda correcta es la lbd. Con defaults (φ12, C25, B500): lb_código = 340 mm, lb_net = 120 mm vs lb_avail = 700 mm → 17% de utilización; la lbd correcta es 485 mm. Además `lb_avail = h_enc − cover − c_top` modela una **rama vertical** (patilla doblada hacia arriba) sin documentarlo en código, resultados ni PDF, y sin el α1=0.7 de barra doblada; la rama horizontal real disponible (e_borde + d_p/2 − cover ≈ 340 mm) fallaría con barra recta.

**Razonamiento del verificador**

Confirmado. fctd sin 0.7 es literal y pileCap es el único motor rezagado del patrón ya corregido en rcSlabs/rcColumns/rcBeams/isolatedFooting (todos usan `0.7*fctm/1.5`). Recalculados los defaults: lb=339.7 mm ✓, lb_net=120 ✓, lb_avail=700 ✓ (17%). Por construcción es casi imposible fallar el check: incluso φ25 da lb_net=250 mm frente a lb_avail≥300 para cualquier h≥h_min. Ningún guard, ningún test (no existe suite). HIGH.

**Fix sugerido**

`fctd = 0.7·fctm/1.5`; demanda del check = lbd = (φ/4)·(fyd/fbd)·(As_req/As_prov), no lb_net; documentar el modelo de patilla vertical (y aplicar α1=0.7 si se mantiene) o comparar contra la rama horizontal disponible con barra recta. Añadir test oracle.

---

### 🟡 MEDIUM

#### 76. [pileCap] My_Ed oculto pero activo en n=2 — el estado persistido altera las reacciones sin campo visible

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Ubicación:** `PileCapInputsPanel.tsx:163-174 + pileCap.ts:216-221`  ·  **ID:** `pileCap-hidden-my-02`

Hallazgo aportado por el verificador. Para n=2 la UI muestra Mx_Ed (que el motor rechaza con error porque 2 pilotes alineados en X no resisten Mx) y **oculta My_Ed — justo el momento que n=2 sí resiste**. Como el estado persiste en localStorage/URL, introducir My_Ed=80 kNm con n=4 y cambiar a n=2 deja un My_Ed invisible que sigue sumando a las reacciones (R += My·x/Σx², línea 219) sin ningún campo en pantalla que lo delate. Alcanzable con el flujo normal de la UI; altera R_max silenciosamente. Fix: mostrar My_Ed para n=2 (es el momento físicamente admisible) y/o poner a cero el momento inadmisible al cambiar n.

#### 77. [pileCap] Peso propio del encepado omitido en las reacciones

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Ubicación:** `src/lib/calculations/pileCap.ts:216-221`  ·  **ID:** `pileCap-selfweight-03`

Hallazgo aportado por el verificador. `reactions = N_Ed/n ± momentos` sin término de peso propio ni tierras sobre el encepado. Con defaults (1.8×1.0×0.8 m ≈ 36 kN; γG=1.35): R_max real ≈ 174 kN vs 150 mostrados — **−14% no conservador** en el check R_max ≤ R_adm, sin ningún comentario que lo advierta. Es práctica estándar incluir el peso del encepado en la descarga a pilotes. Fix: añadir γG·25 kN/m³·L_x·L_y·h_enc/n (con opción de desactivar si N_Ed ya lo incluye, documentándolo).

#### 78. [pileCap] z_eff = canto útil completo y brazo horizontal al centroide del pilar

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Ubicación:** `src/lib/calculations/pileCap.ts:235, 247-276`  ·  **ID:** `pileCap-lever-arms-04`

`z_eff = h − cover − φ/2` usa el canto útil **completo** como brazo mecánico — equivale a poner el nodo de compresión en la fibra superior, físicamente imposible; el modelo estándar de encepados (EHE-08 58.4.1.2.1.1 / Calavera) usa 0.85·d y mide el brazo horizontal desde el punto a 0.25a del eje del pilar. El código usa el brazo al **centro** del pilar (conservador), y ambas desviaciones se compensan solo por accidente: con defaults (s=1200, pilar 400) Td queda +2% conservador; con s=2000 y pilar 300, **−8% no conservador**. Verificado numéricamente por el adversario. Además θ = atan(d/a) sale sobreestimado (36.3° vs 34.0° con 0.85d en el caso desfavorable): pasa el límite de 26.5° más fácilmente y reduce Fs = R/senθ un ~6%. Fix: z = 0.85·z_eff y brazo v + 0.25a, con test oracle del caso EHE.

#### 79. [pileCap] Armadura secundaria de encepados rígidos ausente

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Ubicación:** `src/lib/calculations/pileCap.ts (ausente)`  ·  **ID:** `pileCap-secondary-rebar-05`

El módulo dimensiona únicamente los tirantes principales inferiores. EHE-08 58.4.1.4 exige en encepados rígidos armadura secundaria **horizontal y vertical en retícula** (cercos) y armadura **superior** (para 2 pilotes, ≥ 10% de la inferior). Cero menciones en motor, Results, SVG y PDF: el usuario recibe un despiece incompleto presentado como completo, exportable a un PDF firmable. Omisión de alcance que afecta a todo encepado generado.

#### 80. [pileCap] n=3: armadura despiezada solo en dirección X

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Ubicación:** `src/lib/calculations/pileCap.ts:262-264, 283-296`  ·  **ID:** `pileCap-n3-layout-06`

Hallazgo aportado por el verificador. Para el triángulo solo se calcula Ft_x y se despiezan n_bars_x **barras paralelas a X** repartidas en todo el ancho — pero el pilote superior A está en (0, +2h/3): su tirante radial es en dirección **Y** y unas barras solo-X no pueden equilibrarlo. El SVG dibuja los tres lados del triángulo como tirantes, contradiciendo el despiece emitido. La cuantía total es conservadora en magnitud (el radial R·a_crit/z es ×1.73 los lados), pero la **disposición** emitida es estructuralmente inválida como guía de armado. Fix: despiezar en bandas por lados del triángulo (Td_lado = Td_radial/(2·cos30°)) o malla ortogonal con As en ambas direcciones.

#### 81. [pileCap] Sin ningún test

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Ubicación:** `src/test (ausente)`  ·  **ID:** `pileCap-no-tests-07`

Confirmado por glob/grep exhaustivo: cero referencias a `calcPileCap`/`pile-cap`/«encepado» en `src/test` (el único hit es incidental en anchorPlate.test.ts). Es el **único motor de cálculo del repo sin suite**, lo que explica que los checks vacuos (#75, #82) hayan sobrevivido. Riesgo de regresión alto: cualquier fix de esta adenda debe llegar acompañado de la suite completa (posiciones/Navier, geometría, biela, tirantes por n, anclaje, checks).

---

### 🔵 LOW

#### 82. [pileCap] Check de tirante vacuo y separación mínima sin comprobar

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Ubicación:** `pileCap.ts:407-457`  ·  **ID:** `pileCap-tie-check-08`

`makeCheck(As_min, As_prov)` con As_prov = ceil(max(As_tie, As_min)/Aφ)·Aφ ≥ As_min → **no puede fallar**, y As_tie (la demanda real del tirante) no aparece en ningún check: con N=3000 kN muestra 35% verde cuando la utilización real es 99.8%. No es inseguro (el módulo auto-dimensiona y el usuario no puede reducir barras), pero la barra es engañosa — y con los **defaults** sale 977/1018 = 96% ámbar, contradiciendo el comentario FTUX («all checks CUMPLE at ~60-75%»). La separación mínima no se comprueba (N=4000/n=2/φ12 → 34 barras con ~15 mm libres, sin aviso) y s_bar_y (n=4) se calcula pero nunca se chequea. Fix: util = As_adoptada/As_prov, añadir check de s_bar ≥ max(20, φ, dg+5) y chequear s_bar_y.

#### 83. [pileCap] k=0.60 citado como nodo C-C-T y nodo C-C-C bajo el pilar sin comprobar

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `pileCap.ts:254 (+ ausente)`  ·  **ID:** `pileCap-node-model-09`

σRd,max = 0.60·(1−fck/250)·fcd se etiqueta «C-C-T node, k=0.60», pero en EC2/CE Anejo 19 §6.5.4 el nodo C-C-T es k2 = **0.85**·ν′·fcd; el 0.60 corresponde a la biela fisurada de §6.5.2 — conservador ×1.42 con cita errónea. Y el nodo C-C-C bajo el pilar no se comprueba: con C25 (σRd = 15.0 N/mm²), n=4 y R_adm=400 kN, un pilar de 300×300 con N_Ed≈1600 kN da 17.8 N/mm² y pasaría sin aviso — alcanzable desde la UI. Fix: corregir la cita (mantener 0.60 si se quiere el lado seguro, documentándolo) y añadir el check σ_col = N_Ed/(b_col·h_col) ≤ ν′·fcd.

#### 84. [pileCap] Semántica de R_adm sin documentar

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `PileCapInputsPanel.tsx:149-157 + pileCap.ts:347-368`  ·  **ID:** `pileCap-radm-semantics-10`

La UI pide N_Ed bajo «Acciones de diseño (ELU)» pero R_adm como «Cap. admisible» (servicio): el check compara demanda ELU contra capacidad admisible — ~×1.4 de seguridad duplicada si el usuario introduce la admisible real, o resultado engañoso si introduce la resistencia de cálculo del micropilote. El artículo del check es «—» y nada (código, Results, PDF) documenta el formato esperado. De propina, el warn de pilote a tracción usa |R_min|/R_adm — la capacidad a **compresión** como denominador de una utilización a **tracción**. Fix: renombrar a R_c,Rd (cálculo) o convertir internamente, y pedir R_t,Rd aparte para tracción.

#### 85. [pileCap] fyd sin el tope de 400 N/mm² para tirantes B&T de cimentación

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `pileCap.ts:207, 286, 306`  ·  **ID:** `pileCap-fyd-cap-11`

EHE-08 58.4.1.1 limita la armadura de tirantes de cimentaciones B&T a fyd ≤ 400 N/mm² (control de fisuración del tirante); con B500 el módulo da un As un 8.7% menor que con el tope. En CE Anejo 19 puro el tope no existe (defendible), pero el propio módulo cita «EHE-08 art. 58» en el check de ángulo y en Results — mezcla de marcos —, y el criterio de la casa apunta a capar (rc-columns acaba de aplicar min(fyd, 400) en commit ab2ad7b). Fix: decidir el marco y ser consistente; si EHE 58 es el modelo, capar a 400.

#### 86. [pileCap] Tirantes repartidos en todo el ancho en vez de en banda sobre los pilotes

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `pileCap.ts:283-296, 305-314`  ·  **ID:** `pileCap-band-distribution-12`

s_bar = (L − 2·cover)/(n_bars − 1) reparte las barras del tirante uniformemente en todo el ancho del encepado (1000 mm en defaults), cuando el modelo B&T exige concentrar la armadura principal **en banda sobre los pilotes** (EHE 58.4.1.1). El SVG en planta dibuja tirantes pilote-a-pilote, inconsistente con el despiece en barras repartidas. La cuantía es la correcta pero su posición no: barras lejos de la banda no participan del tirante con la eficacia supuesta. Fix: emitir ancho de banda (≈ d_p + 2·0.5h) y despiezar dentro de ella; mover el resto a la retícula secundaria del #79.

#### 87. [pileCap] e_borde por debajo de la regla práctica para micropilotes pequeños

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `pileCap.ts:142`  ·  **ID:** `pileCap-edge-distance-13`

e_borde = max(1.5·d_p, 300) queda por debajo de la regla española (eje de pilote a borde ≥ d_p/2 + 250 mm, EHE 58.8.2-tradición): d_p=200 → 300 vs 350 mm (cara de pilote a borde 200 < 250 mm). Las dimensiones son solo generadas (la UI no permite editarlas) y no existe check de e_borde — es puramente informativo —, pero el déficit reduce el confinamiento del nodo y **agrava el anclaje horizontal del #75**. Fix: e = max(d_p/2 + 250, 1.5·d_p, 300).

---

## Valoración por motor (adenda 2)

### pileCap

**Valoración:** La estructura del motor es razonable — posiciones y reacciones Navier correctas (verificadas, incluido el reparto de momentos con Σx²/Σy²), validación de entradas decente (rechaza Mx con n=2, fck fuera de rango, geometrías imposibles), límites de ángulo de biela que implícitamente garantizan la rigidez del encepado, y dirección general conservadora en el nodo (k=0.60 < 0.85). Pero el conjunto está por debajo del estándar de los demás motores: el check de anclaje es estructuralmente incapaz de fallar (fctd sin el 0.7 **y** demanda igual al mínimo absoluto — #75), las reacciones omiten el peso propio (−14% con defaults — #77), el brazo mecánico usa el canto útil completo (#78), no existe la armadura secundaria obligatoria (#79), el despiece de n=3 es estructuralmente inválido como guía de armado (#80), y un My_Ed persistido puede quedar activo e invisible en n=2 (#76). Todo ello sin un solo test que lo hubiera atrapado (#81): es el único motor del repo sin suite. Recomendación: el fix de esta adenda debe empezar por la suite de tests (Navier, geometría, biela, tirantes, anclaje) y recalibrar después cada fórmula contra un caso resuelto EHE/Calavera.

Confirmados: 13 · Refutados: 0 (3 matizados)

---

# Adenda 3 — Motor 11: pilares de acero (steelColumns) (2026-06-12)

> Auditoría ejecutada con **Fable 5** sobre `steelColumns.ts` (403 líneas — flexocompresión EC3 §6.3.3 con
> secciones polimórficas), `steelColumnBC.ts` y los adapters `chs.ts`/`upnBox.ts` (no cubiertos por la adenda 1,
> que solo auditó `iSection`). Verificación numérica ejecutando el motor real + **agente Fable adversarial**.
> Marco normativo: CE Anejo 22 (EC3). Los adapters **CHS y 2UPN se verificaron sin errores** (Wpl, It polar,
> clasificación 50/70/90ε², curvas a/c por proceso; Wpl_z/Wel_z del cajón verificados algebraicamente).
>
> **Estado: los 11 hallazgos corregidos** en commit `7e4121f` (+12 tests con oracles): kzy de Tabla B.2 con
> LTB (#88), fy por espesor (#89), longitud de LTB = Lz (#90), clasificación del alma con la distribución
> real N+M vía nuevo modo `combined` del adapter (#91 — los IPE≥300/S355 con M dominante vuelven a ser
> utilizables), |My|/|Mz| y β>0 validados en motor (#92, #93), esbeltez como λ̄ ≤ 2.0 (#94), citas a
> CE Anejo 22 (#95), kzz de la fila de tubos (#96) y elecciones conservadoras documentadas (#97, #98).

## Resumen de la adenda 3

| Métrica | Valor |
|---|---|
| Motores auditados | 1 (+2 adapters limpios) |
| Hallazgos confirmados | **11** |
| Hallazgos refutados | 0 (1 matizado en alcanzabilidad) |
| 🔴 Críticos | 0 |
| 🟠 Altos | 1 |
| 🟡 Medios | 3 |
| 🔵 Bajos | 7 |
| Numéricos | 4 |
| Normativos | 7 |

## Índice de hallazgos de la adenda 3

| # | Sev | Cat | Motor | Título | Ubicación |
|---|---|---|---|---|---|
| 88 | 🟠 high | norm | steelColumns | kzy = 0.6·kyy (Tabla B.1, «no susceptible a torsión») también con LTB activo — el término de My en la ec. 2 queda ×1.57 corto: verde cuando debería fallar | `src/lib/calculations/steelColumns.ts:239-240` |
| 89 | 🟡 medium | norm | steelColumns | fy nominal sin reducción por espesor t>16 mm — HEB240-400, HEA360/400, IPE550/600, 2UPN320/400 y CHS t≥17.5 (mismo #62 ya corregido en steelBeams) | `src/lib/calculations/steelColumns.ts:155` |
| 90 | 🟡 medium | num | steelColumns | Mcr calculado con la Ly física: ni aplica β ni usa Lz (longitud entre arriostramientos laterales) — ×2.2 no conservador si Lz>Ly | `src/lib/calculations/steelColumns.ts:203` |
| 91 | 🟡 medium | num | steelColumns | Clasificación siempre en compresión pura: todos los IPE ≥300 en S355 se rechazan como clase 4 aunque en flexión dominante serían clase 1-2 — conservador pero inutiliza media gama | `src/lib/calculations/steelColumns.ts:158-162` |
| 92 | 🔵 low | num | steelColumns | My/Mz negativos silenciosamente ignorados (checks y LTB saltados) — solo inyectable vía URL/localStorage: parseQuantity rechaza negativos por teclado | `steelColumns.ts:203, 219, 249-254, 284-290` |
| 93 | 🔵 low | num | steelColumns | β ≤ 0 inyectable por URL anula el pandeo (Lk≤0 → χ=1) — el motor no valida beta_y/beta_z > 0 (la UI sí clampa) | `src/lib/calculations/steelColumns.ts:179-189` |
| 94 | 🔵 low | norm | steelColumns | Límite de esbeltez Lk/i ≤ 200 (λ̄ equiv. 2.30/2.62) más laxo que el criterio λ̄ ≤ 2.0; además el ratio se mezcla en la utilización global | `src/lib/calculations/steelColumns.ts:256-264` |
| 95 | 🔵 low | norm | steelColumns | Citas «CE DB-SE-A x.y.z» inexistentes (numeración EC3 con etiqueta DB-SE-A); LTB con método general (0.2, β=1) pero curvas de Tabla 6.5 — mezcla conservadora e inconsistente con steelBeams | `src/lib/calculations/steelColumns.ts:273-324` |
| 96 | 🔵 low | norm | steelColumns | kzz de la fila I/H aplicado a CHS/2UPN — Tabla B.1 para tubos prescribe la fórmula de kyy (conservador) | `src/lib/calculations/steelColumns.ts:235` |
| 97 | 🔵 low | norm | steelColumns | Clase 3 con los k de clase 1-2 y Wel — doblemente conservador, sin documentar | `src/lib/calculations/steelColumns.ts:227-240` |
| 98 | 🔵 low | norm | steelColumns | C1=1.0/zg=0 correcto para momentos de extremo, pero la asimetría con steelBeams (que sí usa C2·zg) merece documentación en código | `src/lib/calculations/steelColumns.ts:203` |

## Detalle de hallazgos de la adenda 3

### 🟠 HIGH

#### 88. [steelColumns] kzy = 0.6·kyy también con LTB activo — Tabla B.2 omitida

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `src/lib/calculations/steelColumns.ts:239-240`
- **ID:** `steelColumns-kzy-b2-01`

**Descripción**

El motor usa siempre `kzy = 0.6·kyy`, que es la fila de la **Tabla B.1** del Anejo B de EC3 — válida solo para miembros **no susceptibles a deformación por torsión** (tubos, cajones, o I arriostrada a torsión). Para secciones en I abiertas con My>0 y χLT<1 — exactamente el caso que el propio flujo calcula tres líneas antes — aplica la **Tabla B.2**: kzy = 1 − 0.1·λ̄z·nz/(CmLT−0.25), con suelo 1 − 0.1·nz/(CmLT−0.25). Con esbelteces medias el kzy correcto es ~0.95 frente a ~0.61 del código: el término de My en la ecuación 2 (la que gobierna pilares con pandeo débil + LTB) queda **×1.57 corto**.

**Evidencia (verificada ejecutando el motor real)**

```
IPE300/S275, Ly=Lz=3500 pp, Ned=200, My=60:
λ̄z=1.2032, χz=0.4764, n_z=0.2979, Mcr=195.98 kNm, χLT=0.6362, Mb,Rd=104.65 kNm
kyy=1.018 → kzy_código = 0.611  vs  kzy_B.2 (CmLT=1) = 0.960
Con My=80: ec.2_código = 0.765 (VERDE) vs ec.2_B.2 = 1.032 (FAIL)
— utilización global del motor 0.924 (CUMPLE ámbar) cuando el pilar falla.
```

**Razonamiento del verificador**

Confirmado dígito a dígito ejecutando `calcSteelColumn`. La línea 240 es incondicional, sin rama B.2, pese a que `hasLTB` (línea 219) ya identifica el miembro como susceptible. Ningún test cubre kzy (la suite 8 solo pina kyy/kzz) y el FTUX ancla los valores actuales. Patrón cumple-cuando-falla con inputs completamente normales (IPE con momento mayor y luz media): high.

**Fix sugerido**

Cuando `hasLTB && chi_LT < 1`: `kzy = Math.max(1 − 0.1·λ̄z·nz/(CmLT−0.25), 1 − 0.1·nz/(CmLT−0.25))` con CmLT=1.0 (consistente con Cmy=Cmz=1.0, conservador); mantener 0.6·kyy para CHS/2UPN y para I sin LTB. Test oracle con el ejemplo IPE300 de arriba.

---

### 🟡 MEDIUM

#### 89. [steelColumns] fy nominal sin reducción por espesor t>16 mm

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Ubicación:** `steelColumns.ts:155`  ·  **ID:** `steelColumns-fy-thickness-02`

Mismo defecto que el #62 (steelBeams, ya corregido en f8e26d9): `fy = 275/355` sin mirar tf. Afecta a HEB240-400 (tf 17-24), HEA360/400, IPE550/600, **2UPN320 (17.5) y 2UPN400 (18)** y CHS con t libre hasta 25 mm en la UI. NRd, Nb,Rd, Mb,Rd e interacción sobreestimados +3.8% (S275) / +2.9% (S355). El default HEB200 (tf=15) no lo dispara, por eso ningún test lo nota. Fix: misma línea que steelBeams (fy − 10 si t>16, con t = tf o t_CHS).

#### 90. [steelColumns] Mcr con la Ly física — ni β ni Lz

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Ubicación:** `steelColumns.ts:203`  ·  **ID:** `steelColumns-mcr-length-03`

`computeMcr(Ly, 1.0, …)` toma la longitud física del eje fuerte como longitud de pandeo lateral. La longitud de LTB es la distancia entre arriostramientos del ala comprimida — ligada a **Lz**, no a Ly — y tampoco se aplica β (una ménsula con My no amplifica su longitud de LTB). Verificado en motor: con Ly=3500/Lz=7000, Mcr sigue en 196 kNm cuando el real con L=7000 es ≈74 kNm → **Mb,Rd ×2.2 no conservador**; con Lz intermedio (5000) el caso pasa los demás checks y cuela. Cuando Lz<Ly (lo común) es conservador. Fix: usar Lz (o max(Ly_LT…) documentado) como longitud de LTB.

#### 91. [steelColumns] Clasificación siempre en compresión pura — media gama IPE/S355 rechazada

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Ubicación:** `steelColumns.ts:158-162`  ·  **ID:** `steelColumns-classify-mode-04`

`classify(fy, 'compression')` fijo + rechazo de clase 4. Verificado ejecutando el motor: **todos los IPE ≥300 en S355** devuelven «Sección Clase 4 — no soportado en v1» (alma c/t·ε 43-49 > 42), aunque con flexión dominante serían clase 1-2 (límite 72ε) y como flexocompresión real algo intermedio. Conservador (nunca inseguro) pero inutiliza configuraciones perfectamente válidas. Fix razonable v1: clasificar bajo el modo pésimo aplicable pero, en clase 4 por compresión pura con M dominante, degradar a clase 3 con la comprobación elástica en lugar de rechazar — o al menos explicar en el error que el límite viene del modo compresión.

---

### 🔵 LOW

#### 92. [steelColumns] My/Mz negativos ignorados — alcanzable solo por URL/localStorage

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Ubicación:** `steelColumns.ts:203, 219, 249-254, 284-290`  ·  **ID:** `steelColumns-negative-m-05`

Los guards `My_Ed > 0`/`Mz_Ed > 0` hacen que un momento negativo desactive flexión, LTB e interacción (verificado: HEB200 con My=−50 → util 0.218 todo verde vs 0.592 con +50). Matiz del verificador que rebaja la severidad: **no es tecleable** — `parseQuantity` (format.ts:58) rechaza negativos para toda quantity, así que el `min` no aplicado es irrelevante; la vía real es `?My_Ed=-50` por URL compartible o localStorage editado. CHS es inmune (M_res cuadrático). Fix barato de defensa en profundidad: `Math.abs` al destructurar.

#### 93. [steelColumns] β ≤ 0 inyectable por URL anula el pandeo

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Ubicación:** `steelColumns.ts:179-189`  ·  **ID:** `steelColumns-beta-validation-06`

Hallazgo aportado por el verificador, misma familia que #92: el motor valida Ly/Lz/Ned pero no beta_y/beta_z; `?beta_y=-1` da Lk negativo → λ̄<0.2 → χ=1 y esbeltez negativa que pasa. La UI clampa a 0.1 en modo custom, pero la validación pertenece al motor. Fix: rechazar β≤0 (o clamp documentado).

#### 94. [steelColumns] Límite de esbeltez λ ≤ 200 — laxo y mezclado en la utilización global

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `steelColumns.ts:256-264`  ·  **ID:** `steelColumns-slenderness-07`

Lk/i ≤ 200 equivale a λ̄ = 2.30 (S275) / 2.62 (S355): más laxo que el criterio clásico λ̄ ≤ 2.0 de elementos principales; bajo CE Anejo 22 ni siquiera es obligatorio (recomendación). Impacto de seguridad casi nulo (χ≈0.2 a esas esbelteces y el pandeo gobierna), pero el ratio slend/200 se suma a `utilization` global, convirtiendo una recomendación en parte del veredicto. Fix: límite en λ̄ ≤ 2.0 (consistente por acero) o sacar el ratio del agregado.

#### 95. [steelColumns] Citas «CE DB-SE-A» inexistentes y LTB con método/curvas mezclados

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `steelColumns.ts:273-324`  ·  **ID:** `steelColumns-citations-08`

Ocho filas citan «CE DB-SE-A x.y.z» — etiqueta híbrida que no existe (DB-SE-A es del CTE; la numeración usada es la de EC3/CE Anejo 22). El LTB usa el método general (meseta 0.2, β=1 vía bucklingChi) con las curvas del caso laminados de la Tabla 6.5 (0.34/0.49) — mezcla doblemente conservadora e inconsistente con steelBeams (caso laminados completo tras #61-63). Mismo patrón que el #73. Fix: citar CE Anejo 22 §6.2.x/6.3.x y documentar (o unificar) el método LTB.

#### 96. [steelColumns] kzz de la fila I/H aplicado a CHS/2UPN

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `steelColumns.ts:235`  ·  **ID:** `steelColumns-kzz-tubes-09`

Hallazgo del verificador: Tabla B.1 para RHS/CHS prescribe para kzz la misma forma que kyy (μ = λ̄z−0.2, tope 0.8·nz); el código aplica a todo la fila I/H (2λ̄z−0.6, tope 1.4·nz) — conservador para tubos y cajones (k mayor), pero impreciso. Fix opcional de afinado.

#### 97. [steelColumns] Clase 3 con los k de clase 1-2 — doblemente conservador sin documentar

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `steelColumns.ts:227-240`  ·  **ID:** `steelColumns-class3-k-10`

La Tabla B.1 tiene columna propia para clase 3-4 (factores menores: kyy = 1+0.6λ̄·n, etc.); el código usa los de clase 1-2 con Wel — capacidad doblemente recortada. Coherente con la filosofía conservadora v1, pero merece comentario (y es recuperable si #91 empieza a degradar secciones a clase 3).

#### 98. [steelColumns] C1=1.0/zg=0 — correcto para pilares, documentar la asimetría con steelBeams

- **Severidad:** low (info)  ·  **Categoría:** normative  ·  **Ubicación:** `steelColumns.ts:203`  ·  **ID:** `steelColumns-mcr-c1-11`

Verificado como **defendible**: el módulo de pilares solo recibe momentos de extremo (sin carga transversal), así que zg=0 es físicamente correcto y C1=1.0 (momento uniforme) es el caso pésimo. La asimetría con steelBeams (que tras #61 incluye C2·zg para UDL en ala superior) refleja modelos de carga distintos, no un bug. Solo requiere un comentario en código para que el próximo lector no lo «corrija» mal.

---

## Valoración por motor (adenda 3)

### steelColumns (+ chs/upnBox)

**Valoración:** Motor bien arquitecturado — el patrón de adapters polimórficos es el más limpio del repo, y los dos adapters no auditados hasta ahora salieron **impecables** (CHS: Wpl/It/clasificación/curvas exactos contra ground-truth analítico; 2UPN: módulos del cajón verificados algebraicamente). Las fórmulas base de EC3 (χ ec. 6.49, kyy/kzz/kyz de Tabla B.1 clase 1-2, esbeltez reducida, NRd/MRd) son correctas, y la elección Cm=1.0 es conservadora y está documentada. El defecto serio es uno y está en el corazón del §6.3.3: **kzy toma la fila de miembros no susceptibles a torsión también cuando hay LTB** (#88), recortando ×1.57 el término de My en la ecuación que gobierna pilares con pandeo débil — verificado un caso real que el motor da por bueno (0.92) y la Tabla B.2 declara fallado (1.03). Le siguen el fy sin reducir por espesor (#89, mismo bug ya corregido en vigas), la longitud de LTB tomada de Ly en vez de Lz (#90, ×2.2 alcanzable) y la clasificación en compresión pura que rechaza media gama IPE en S355 (#91, conservador pero invalidante). El resto es endurecimiento de entradas vía URL (#92, #93) y trazabilidad/afinado conservador (#94-98).

Confirmados: 11 · Refutados: 0 (1 matizado)

---

# Adenda 4 — Motor 12: sección compuesta de acero (compositeSection) (2026-06-12)

> Auditoría ejecutada con **Fable 5** sobre `compositeSection.ts` (547 líneas — secciones armadas: perfil
> laminado + platabandas soldadas; Steiner, Wpl/PNA por método de bandas, clasificación EC3 y Mrd).
> Verificación numérica **ejecutando el motor real** + agente Fable adversarial. Marco: CE Anejo 22 (EC3),
> EN 1993-1-5 para clase 4. El núcleo salió **correcto**: Steiner/yc/Iy exactos contra catálogo y hand-calcs,
> Wpl/PNA por bandas verificado, y la clasificación del alma con α plástica y ψ elástica para NA desplazada
> (`webLimitsShifted`) es la implementación de Tabla 5.2 más cuidada del repo. Los defectos están en los
> bordes del modelo de clasificación y en el fy.
>
> **Estado: los 9 hallazgos corregidos** en commit `ab98c61` (+13 tests): fy por espesor con t_max (#99),
> platabandas clasificadas desde sus apoyos reales — vuelo + panel interno, todas las apiladas (#100, #104),
> chapas sueltas clasificadas con α/ψ vía `classifyLoosePlate` y clase 4 detectada en modo custom con
> Mrd=0 (#101, #103), nota M+ (#102), detección de solapes (#105), laterales entre acuerdos (#106) y
> dedup (#107). UI/PDF muestran la clasificación orientativa en modo custom y el veredicto usa class4Warning.

## Resumen de la adenda 4

| Métrica | Valor |
|---|---|
| Motores auditados | 1 |
| Hallazgos confirmados | **9** |
| Hallazgos refutados | 0 (1 con ejemplo refutado y severidad degradada) |
| 🔴 Críticos | 0 |
| 🟠 Altos | 0 |
| 🟡 Medios | 3 |
| 🔵 Bajos | 6 |
| Numéricos | 3 |
| Normativos | 6 |

## Índice de hallazgos de la adenda 4

| # | Sev | Cat | Motor | Título | Ubicación |
|---|---|---|---|---|---|
| 99 | 🟡 medium | norm | compositeSection | fy fijo por grado sin reducción por espesor — platabandas de 20-25 mm y perfiles tf>16 (IPE550-600, HEA360-400, HEB240-400) con fy nominal; el comentario de S450 documenta el límite que el código no impone | `src/lib/calculations/compositeSection.ts:9-14` |
| 100 | 🟡 medium | norm | compositeSection | Vuelo de la platabanda superior medido desde el ALMA ((b−tw)/2) en vez de desde sus apoyos reales (soldaduras al ala): chapa 300×12 S355 → clase 4 y **Mrd = 0 (N/D)** cuando el vuelo real (75/12=6.25) es clase 1 — conservador pero bloquea diseños válidos habituales | `src/lib/calculations/compositeSection.ts:439-450` |
| 101 | 🟡 medium | norm | compositeSection | Modo custom sin clasificación: Mrd = Wel_min·fy SIEMPRE — un alma soldada 400×3 S355 (c/t=133, clase 4 inequívoca) da Mrd=431.6 kNm cuando EN 1993-1-5 exige sección eficaz (Wel no es «safe side» frente a clase 4) | `src/lib/calculations/compositeSection.ts:496-514` |
| 102 | 🔵 low | norm | compositeSection | Convención M+ implícita (compresión arriba) en α/ψ: la misma sección bajo flexión NEGATIVA puede tener Mrd un 27% menor (verificado por simetría especular) sin opción ni aviso en UI/PDF | `src/lib/calculations/compositeSection.ts:416-423` |
| 103 | 🔵 low | norm | compositeSection | Chapas comprimidas custom (y laterales) fuera de la clasificación — el ejemplo de laterales fue refutado (ven gradiente de flexión → límites 72/83/124; clase 4 solo con b<2.8 mm absurdo); el hueco real son las chapas 'custom' en zona comprimida | `src/lib/calculations/compositeSection.ts:386-494` |
| 104 | 🔵 low | norm | compositeSection | Solo se clasifica la chapa superior MÁS ANCHA: apilando 150×4 sobre 200×15, la 150×4 (ratio 17.9 > 14ε, clase 4 según el propio modelo) pasa sin detectar | `src/lib/calculations/compositeSection.ts:441-446` |
| 105 | 🔵 low | num | compositeSection | Solapes sin validar: una chapa custom incrustada en el cuerpo del perfil duplica área e inercia sin aviso (Mrd inflado); mitigado por el SVG en vivo que hace visible el solape | `src/lib/calculations/compositeSection.ts:256-259, 302-309` |
| 106 | 🔵 low | num | compositeSection | Las chapas laterales (y∈[tf, h−tf]) solapan físicamente la zona de los acuerdos del perfil — doble cuenta ~1 cm² por chapa (<2% del área de la chapa, no conservador) | `src/lib/calculations/compositeSection.ts:295-301` |
| 107 | 🔵 low | num | compositeSection | webLimVal y webLimRef son expresiones idénticas (código duplicado muerto) — limpieza | `src/lib/calculations/compositeSection.ts:457-462` |

## Detalle de hallazgos de la adenda 4

### 🟡 MEDIUM

#### 99. [compositeSection] fy fijo por grado sin reducción por espesor

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Ubicación:** `compositeSection.ts:9-14`  ·  **ID:** `compositeSection-fy-thickness-01`

`FY_MAP` es plano (S235/275/355/450 → 235/275/355/440) y el propio comentario admite la dependencia («fy = 440 MPa for t ≤ 16mm») sin imponerla. Verificado ejecutando el motor: IPE600 S355 (tf=19) y HEB400 S355 (tf=24) devuelven fy=355; el catálogo expuesto incluye IPE550/600, HEA360/400 y HEB240-400, y las platabandas de t=20-25 mm son el caso de uso típico del módulo. Mismo defecto #62/#89 ya corregido en steelBeams y steelColumns — este motor quedó fuera del barrido. El fy de la sección debe ser el del elemento más desfavorable: max(tf del perfil, t de chapas) > 16 → fy−10 (S450 → 410 según CTE Tabla 4.1; la cifra EN 1993-1-1 es 440 hasta t≤40, parte discutible documentada). Sin ningún test con t>16.

#### 100. [compositeSection] Vuelo de la platabanda superior medido desde el alma — Mrd = 0 en secciones válidas

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Ubicación:** `compositeSection.ts:439-450`  ·  **ID:** `compositeSection-topplate-outstand-02`

`c_f_top = (plate.b − tw)/2` modela la platabanda como volada desde el alma, ignorando que está soldada al ala del perfil: los apoyos reales son las soldaduras/bordes del ala, con vuelo real (plate.b − profile.b)/2 y porción interna con límites de elemento interno (33/38/42), no de vuelo (9/10/14). Verificado ejecutando el motor: IPE300 + chapa 300×12 en S355 → clase 4 y **Mrd = 0 («N/D»)** cuando el vuelo real 75/12 = 6.25 es clase 1 (límite 7.33) y la porción interna 11.9 ≪ 34.2 también. Dirección conservadora, pero bloquea con N/D un diseño habitual (chapa más ancha y delgada que el ala) — mismo patrón invalidante que el #91 de pilares. De propina, el vuelo del ala del propio perfil deja de comprobarse al haber chapa encima (defendible: queda restringido).

#### 101. [compositeSection] Modo custom: Mrd elástico sin comprobar clase 4

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Ubicación:** `compositeSection.ts:496-514`  ·  **ID:** `compositeSection-custom-class4-03`

En modo «Desde cero» (uno de los dos modos primarios) no hay clasificación (sectionClass=null) y Mrd = Wel_min·fy siempre. El comentario lo justifica como «safe side», pero eso solo es cierto frente a Wpl: con elementos comprimidos clase 4, Wel sobrestima — EN 1993-1-5 exige sección eficaz. Verificado: alma soldada 400×3 S355 (c/t = 133 ≫ 124ε = 101) → Mrd = 431.6 kNm, inválido. Almas de 4-5 mm con h=450-500 en S355 ya cruzan el límite. El test de la línea 206 consolida el comportamiento defectuoso. Fix mínimo: clasificar cada chapa custom como elemento interno en flexión con la ψ de su posición (la infraestructura α/ψ ya existe) y degradar a warning + Mrd=0 si hay clase 4; o al menos warn explícito de «clasificación no verificada» en resultado y PDF.

---

### 🔵 LOW

#### 102. [compositeSection] Convención M+ implícita — Mrd hasta 27% menor bajo flexión negativa

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `compositeSection.ts:416-423`  ·  **ID:** `compositeSection-sign-convention-04`

α/ψ asumen compresión arriba («positive M puts the top in compression»). Cuantificado por simetría especular: IPE300 + 300×40 arriba S355 → clase 1, Mrd=331 kNm; la misma sección bajo M− (≡ chapa abajo) → alma clase 3, Mrd=243 kNm (−27%). Wpl y Wel_min son independientes del signo — el error vive solo en la clasificación. Cero menciones al signo en UI/PDF. Fix: nota visible «clase y Mrd válidos para M+ (compresión en fibra superior)» o doble clasificación M+/M−.

#### 103. [compositeSection] Chapas comprimidas custom sin clasificar — ejemplo de laterales refutado

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `compositeSection.ts:386-494`  ·  **ID:** `compositeSection-unclassified-plates-05`

sectionClass = max(alma, vuelo sup, vuelo inf): las chapas laterales y custom no entran. El verificador **refutó el ejemplo del auditor**: la chapa lateral cubre la altura libre del alma y ve el mismo gradiente de flexión → límites 72/83/124ε (no 33/38/42), y la clase 4 exigiría b<2.8 mm, físicamente absurdo (el motor da resultado correcto para todo b realista). El hueco genuino restante: chapas 'custom' en zona comprimida (permitidas en modo reinforced) sin clasificar jamás. Low.

#### 104. [compositeSection] Solo se clasifica la platabanda más ancha

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `compositeSection.ts:441-446`  ·  **ID:** `compositeSection-widest-plate-06`

«Más ancha» ≠ «más crítica»: con 200×15 + 150×4 apiladas (S275), el motor clasifica solo la 200×15 (ratio 6.4, clase 1) y da Mrd=211 kNm incluyendo el área de la 150×4, cuyo ratio según el propio modelo sería 17.9 > 14ε → clase 4 sin detectar. Hasta 6 chapas apilables; configuración infrecuente. Fix: clasificar todas y tomar la peor.

#### 105. [compositeSection] Solapes sin validar — área e inercia duplicadas

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Ubicación:** `compositeSection.ts:256-259, 302-309`  ·  **ID:** `compositeSection-overlap-07`

Solo se valida b>0/t>0; una chapa custom incrustada en el cuerpo del perfil (o dos chapas coincidentes en modo custom) duplica área/inercia sin aviso — verificado: dos 200×20 coincidentes dan exactamente el doble de Wpl. No conservador pero requiere error de entrada y el SVG en vivo lo hace visible. Fix: detección de solape con warning.

#### 106. [compositeSection] Laterales solapan la zona de acuerdos del perfil

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Ubicación:** `compositeSection.ts:295-301`  ·  **ID:** `compositeSection-lateral-fillet-08`

Hallazgo del verificador: las chapas laterales ocupan y∈[tf, h−tf] pegadas a la cara del alma, región donde viven los acuerdos (r=15 en IPE300) — doble cuenta de ~1 cm² por chapa (<2% del área de la chapa, no conservador). Fix: arrancar en y=tf+r (altura h−2tf−2r) o documentar la aproximación.

#### 107. [compositeSection] webLimVal/webLimRef duplicados

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Ubicación:** `compositeSection.ts:457-462`  ·  **ID:** `compositeSection-deadcode-09`

Las dos constantes se calculan con expresiones idénticas — código duplicado muerto que invita a divergencias futuras. Limpieza.

---

## Valoración por motor (adenda 4)

### compositeSection

**Valoración:** El núcleo de cálculo es de lo mejor del repo: Steiner/yc/Iy exactos contra catálogo y hand-calcs, el Wpl/PNA por método de bandas con el perfil descompuesto en 3 rectángulos es correcto (y conservador ~1-2% al omitir acuerdos, documentado), y `webLimitsShifted` — clasificación del alma con α plástica y ψ elástica para NA desplazada por platabandas — es la implementación de la Tabla 5.2 más cuidada de la app, verificada en convención y casos límite (incluido el degenerado de alma toda en tracción, que resuelve bien por la vía α→0). Los 42 tests existentes cubren bien el núcleo. Los defectos están en los bordes: el fy plano sin reducción por espesor (#99 — el único motor de acero que quedó fuera del barrido #62/#89, y aquí las chapas gruesas son el caso típico), el vuelo de la platabanda medido desde el alma que convierte en «Mrd N/D» diseños válidos con chapa ancha y delgada (#100), y el modo custom que reporta Mrd elástico sin poder detectar clase 4 (#101 — única vía no conservadora real). El resto: convención M+ sin documentar (#102, −27% bajo M− en el peor caso verificado), huecos de clasificación de chapas secundarias (#103, #104) y robustez de entradas/limpieza (#105-107).

Confirmados: 9 · Refutados: 0 (1 ejemplo refutado, severidad degradada)

---

# Adenda 5 — Motor 13: vigas de madera (timberBeams) (2026-06-12)

> Auditoría ejecutada con **Fable 5** sobre `timberBeams.ts` (431 líneas — ELU flexión/cortante/LTB, ELS
> flechas, fuego por sección reducida EN 1995-1-2) y el catálogo `timberGrades.ts` (EN 338:2016 + EN 14080).
> Verificación numérica + **agente adversarial con fuentes publicadas** de las tablas EN 338/EN 14080.
> Verificado correcto: kmod/kdef/γM/βn (EC5 Tab 3.1/3.2, EN 1995-1-2), kh, kcr=0.67, ksys, τ=1.5V/(kcr·A),
> σm,crit (ec. 6.32), kcrit en tres tramos, combinación de fuego G+ψ2·Q y sección reducida con d0=7.
> Las clases C24-C40 y D30-D70 del catálogo verificadas contra EN 338:2016.
>
> **Estado: los 11 hallazgos corregidos** en commit `0123447` (+18 tests): GL36h→GL32h con fm_k=32 (#108),
> C22 fc0=20 (#118), bloque ELS reescrito según CTE DB-SE 4.3.3 — activa con fluencia de G, nuevo input de
> tabiquería (L/500-300), confort y apariencia, deformación por cortante vía k_shear en BEAM_CASES
> (#109, #110, #114) —, Lef de Tabla 6.1 con +2h (#112), combinación solo-permanente (#113), fuego con
> kfi y LTB de la sección residual con 4 caras (#111, #117), y límites de alcance declarados (#115, #116).

## Resumen de la adenda 5

| Métrica | Valor |
|---|---|
| Motores auditados | 1 (+catálogo de materiales) |
| Hallazgos confirmados | **11** |
| Hallazgos refutados | 0 (1 refutado en mecanismo, gap real reidentificado) |
| 🔴 Críticos | 0 |
| 🟠 Altos | 0 |
| 🟡 Medios | 4 |
| 🔵 Bajos | 7 |
| Numéricos | 3 |
| Normativos | 8 |

## Índice de hallazgos de la adenda 5

| # | Sev | Cat | Motor | Título | Ubicación |
|---|---|---|---|---|---|
| 108 | 🟡 medium | norm | timberBeams | La clase **'GL36h' no existe en EN 14080:2013**: sus propiedades son exactamente las de GL32h (ft0=25.6, fc0=32, E=14.2/11.8, ρk=440) con fm_k=36 en vez de 32 — flexión +12.5% no conservadora; la landing anuncia «GL24h a GL32h» y el catálogo ni siquiera tiene GL32h | `src/data/timberGrades.ts:114-117` |
| 109 | 🟡 medium | num | timberBeams | Flecha ACTIVA sin la fluencia diferida de G: u_act = u_Q(1+ψ2·kdef) omite u_G·kdef — defaults: 3.27 mostrado vs 4.38 mm real (34% omitido); con SC3 (kdef=2.0) se omite el 83% | `src/lib/calculations/timberBeams.ts:257-258` |
| 110 | 🟡 medium | norm | timberBeams | Límites ELS desalineados con CTE DB-SE 4.3.3 y cita «NA España NA.7.2.2» **inexistente** (España no tiene NA publicado a EC5; ni EC5 §7.2 tiene cláusula 7.2.2): integridad L/350 laxo frente a L/400-500 (no conservador, se suma a #109); «instantánea total ≤ L/300» no es un check del CTE | `src/lib/calculations/timberBeams.ts:260-263` |
| 111 | 🟡 medium | norm | timberBeams | LTB omitido en situación de incendio: la sección residual es muy esbelta (defaults R60: 40×345, h/b≈8.6) — sin arriostrar (4 caras expuestas alcanzable), util real ≈1.7 vs 0.48 mostrado; con 3 caras el tablero presunto arriostra | `src/lib/calculations/timberBeams.ts:287-293` |
| 112 | 🔵 low | norm | timberBeams | Lef de LTB sin las correcciones de Tabla 6.1: ss+UDL es 0.9L **+2h con carga en borde comprimido** (código: 1.0L — no conservador ~5% en kcrit para L<20h); ménsula 2.0L sin respaldo (tabla: 0.5L), muy conservador | `src/lib/calculations/timberBeams.ts:209-216` |
| 113 | 🔵 low | norm | timberBeams | Una sola combinación ELU: la combinación solo-permanente (1.35·gk con su kmod=0.6) no se comprueba nunca — gobierna cuando qk < 0.3·gk (EC5 §3.1.3(2) exige verificar cada combinación con su kmod) | `src/lib/calculations/timberBeams.ts:157-174` |
| 114 | 🔵 low | num | timberBeams | Deformación por cortante omitida en las flechas: con E/G≈16 y h/L=0.08 (defaults) es ~6-10% — no conservador y se acumula con #109/#110; práctica DB-SE-M es incluirla | `src/lib/calculations/timberBeams.ts:248-250` |
| 115 | 🔵 low | norm | timberBeams | Compresión perpendicular a la fibra en apoyos (EC5 §6.1.5, kc,90) ausente — suele gobernar en luces cortas con cargas altas; sin input de longitud de apoyo (gap de alcance) | `(ausente)` |
| 116 | 🔵 low | norm | timberBeams | Vibración de forjados (EC5 §7.3) ausente pese a que el caso nominal es forjado residencial (default + isSystem) — gap de alcance declarable | `(ausente)` |
| 117 | 🔵 low | norm | timberBeams | Fuego sin kfi (EN 1995-1-2 §2.3: fd,fi = kfi·fk, kfi=1.25 aserrada / 1.15 glulam): capacidad subestimada 13-20%, conservador y sin documentar | `src/lib/calculations/timberBeams.ts:287-289` |
| 118 | 🔵 low | num | timberBeams | C22: fc0_k=19 (EN 338:2016: **20**) — inerte en vigas pero alimenta timberColumns (fc0_d, λrel); conservador | `src/data/timberGrades.ts:47` |

## Detalle de hallazgos de la adenda 5

### 🟡 MEDIUM

#### 108. [timberBeams] La clase 'GL36h' no existe en EN 14080:2013

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Ubicación:** `timberGrades.ts:114-117`  ·  **ID:** `timberBeams-gl36h-01`

EN 14080:2013 Tabla 5 termina en **GL32h**; GL36h solo existía en la derogada EN 1194:1999 (y con otras propiedades: ft0=26, E=14.7, ρk=450). La entrada del catálogo es exactamente GL32h de EN 14080 (ft0=25.6=0.8·32, fc0=32, E0=14.2/11.8, ρk=440/490) con fm_k=36: **flexión +12.5% no conservadora** para quien la seleccione (la UI la ofrece en el dropdown). Matiz del verificador: en la zona 3 del LTB (λ>1.4) el error se autocancela (kcrit·fm,k = σm,crit), pero con kcrit=1 aplica íntegro. Agravante de coherencia: la landing (`normativaData.ts:260`) anuncia «GL24h a GL32h» — y el catálogo no tiene GL32h. Fix trivial: renombrar a GL32h con fm_k=32 (todo lo demás ya es correcto). GL24h/28h/30h verificados correctos.

#### 109. [timberBeams] Flecha activa sin la fluencia diferida de la carga permanente

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Ubicación:** `timberBeams.ts:257-258`  ·  **ID:** `timberBeams-active-creep-02`

La flecha activa (la producida después de construir los elementos frágiles) es u_fin − u_inst,G = **u_G·kdef** + u_Q·(1+ψ2·kdef); el código solo computa el segundo término. Recalculado con defaults (C24 150×400, L=5, gk=2/qk=3, SC1): u_G·kdef = 1.11 mm omitido → el motor muestra 3.27 mm cuando la activa real es 4.38 mm (34% omitido); con gk≥qk supera el 50% y con SC3 (kdef=2.0) el término omitido es el 83% de lo mostrado. No conservador en el check de integridad, y el test que fija u_active≈3.27 consolida el defecto. Combinado con #110, la utilización real de integridad con tabiques frágiles en defaults sería 0.44 frente al 0.23 mostrado.

#### 110. [timberBeams] Límites ELS desalineados con CTE y cita «NA España» inexistente

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Ubicación:** `timberBeams.ts:260-263 + filas ELS`  ·  **ID:** `timberBeams-els-limits-03`

España **no tiene Anejo Nacional publicado a EN 1995-1-1** (la madera va por CTE DB-SE-M y las flechas por DB-SE 4.3.3), y EC5 §7.2 ni siquiera tiene una cláusula «7.2.2» — la cita «NA España NA.7.2.2» de las tres filas (y del PDF) es inventada. Ningún check coincide con DB-SE 4.3.3: integridad es 1/500 (tabiques frágiles) / 1/400 (ordinarios) / 1/300, confort 1/350 con solo acciones de corta duración, apariencia 1/300 con la casi permanente. Dirección mixta: «u_inst(G+Q) ≤ L/300» es más estricto que el confort CTE (conservador), pero **L/350 para la activa es laxo frente a L/400-500** — no conservador y se suma al #109. Los tests fijan los tres límites.

#### 111. [timberBeams] LTB omitido en situación de incendio

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Ubicación:** `timberBeams.ts:287-293`  ·  **ID:** `timberBeams-fire-ltb-04`

Hallazgo aportado por el verificador. El método de la sección reducida exige verificar la sección residual con EN 1995-1-1 completo — incluido §6.3.3 — y esa sección es extremadamente esbelta: defaults con R60 → 40×345 (h/b≈8.6). Si el borde comprimido queda sin arriostrar en fuego (exposedFaces=4 está en la UI, o tablero no resistente al fuego): σm,crit,fi=5.35 N/mm² → λrel=2.12 → kcrit=0.22 → capacidad ≈6.7 N/mm² frente a σm,fi=11.4 → **utilización real ≈1.7 frente a 0.48 mostrada**. Mitigación: con 3 caras expuestas se presume tablero superior que arriostra. Fix: añadir el check LTB en fuego (con la geometría residual) al menos cuando exposedFaces=4.

---

### 🔵 LOW

#### 112. [timberBeams] Lef de LTB sin las correcciones de la Tabla 6.1

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `timberBeams.ts:209-216`  ·  **ID:** `timberBeams-lef-05`

ss+UDL: lef = 0.9·L **+ 2h si la carga actúa en el borde comprimido** (el caso físico habitual); el código usa 1.0·L y su comentario «conservative values» es falso para L < 20h (con h=400, toda luz < 8 m). Materialidad: defaults inafectados (kcrit=1 en ambos); b=80/h=400/L=4 m → kcrit 0.795 vs 0.758, ~5% no conservador. Ménsula: 2.0·L no tiene respaldo en la Tabla 6.1 (UDL: 0.5·L) — muy conservador. Fix: lef por caso de viga con +2h.

#### 113. [timberBeams] Una sola combinación ELU — falta la solo-permanente

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `timberBeams.ts:157-174`  ·  **ID:** `timberBeams-perm-combo-06`

Reidentificado por el verificador (mi mecanismo original era incorrecto: aplicar el kmod de la acción más corta a toda la combinación es exactamente lo que manda EC5 §3.1.3(2)). El gap real: EC5 exige verificar **cada** combinación con su kmod, y la combinación solo-permanente (1.35·gk con kmod=0.6) no se comprueba nunca — gobierna cuando qk < 0.3·gk (cubiertas pesadas con poca sobrecarga). Defaults no afectados. Fix: evaluar también 1.35·gk con kmod permanente y tomar la peor utilización.

#### 114. [timberBeams] Deformación por cortante omitida en las flechas

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Ubicación:** `timberBeams.ts:248-250`  ·  **ID:** `timberBeams-shear-defl-07`

En madera E/G≈16: para ss+UDL, δ_cortante/δ_flexión ≈ 0.96·(E/G)·(h/L)² ≈ 10% con defaults (h/L=0.08). Todas las flechas subestimadas ~6-10% — no conservador y se acumula con #109/#110. La práctica DB-SE-M es incluirla. Fix: factor (1 + 0.96·(E/G)·(h/L)²) o término explícito con G_mean del catálogo.

#### 115-116. [timberBeams] kc,90 en apoyos y vibración §7.3 ausentes

- **Severidad:** low  ·  **Categoría:** normative  ·  **ID:** `timberBeams-kc90-08 / timberBeams-vibration-09`

Gaps de alcance confirmados: ni compresión perpendicular en apoyos (EC5 §6.1.5 — suele gobernar en luces cortas con cargas altas; requeriría input de longitud de apoyo) ni vibración de forjados (EC5 §7.3 — pese a que el caso nominal del módulo es forjado residencial con isSystem). La app no afirma comprobarlos; documentar como límites del módulo o implementar.

#### 117. [timberBeams] Fuego sin kfi — conservador sin documentar

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `timberBeams.ts:287-289`  ·  **ID:** `timberBeams-kfi-10`

EN 1995-1-2 §2.3/Tabla 2.1: fd,fi = kfi·fk/γM,fi con kfi=1.25 (aserrada) / 1.15 (glulam) — el percentil 20%. El código usa fk directamente: capacidad en fuego subestimada 13-20%, dirección conservadora, sin documentar. Nota del verificador: esta reserva NO compensa la omisión del LTB en fuego (#111, gap ~2×).

#### 118. [timberBeams] C22 con fc0_k=19 (EN 338:2016: 20)

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Ubicación:** `timberGrades.ts:47`  ·  **ID:** `timberBeams-c22-fc0-11`

Único error del barrido completo del catálogo C/D contra EN 338:2016. Inerte en vigas (fc0 no se usa) pero alimenta `timberColumns` (fc0_d y λrel) — conservador. Corregir a 20.

---

## Valoración por motor (adenda 5)

### timberBeams (+ timberGrades)

**Valoración:** Motor sólido en su mecánica EC5: kmod/kdef/γM/βn exactos contra las tablas, kh/kcr/ksys correctos y bien comentados, cortante con kcr=0.67 (que muchos olvidan), kcrit en sus tres tramos, y un módulo de fuego por sección reducida bien estructurado. El catálogo C/D pasó el barrido completo contra EN 338:2016 con un único desliz menor (C22). Los problemas están en dos frentes. Primero, **una clase de material fantasma**: GL36h no existe en EN 14080 y es GL32h con la flexión inflada un 12.5% (#108) — el fix es un rename trivial pero el defecto es serio porque afecta la resistencia base de cualquier cálculo que la use. Segundo, el **bloque ELS**: la flecha activa omite la fluencia de la permanente (#109, hasta 83% omitido en SC3), los límites no son los del CTE y citan un Anejo Nacional español que no existe (#110), y las flechas ignoran la deformación por cortante (#114, ~10% en madera) — tres errores no conservadores que se acumulan en el mismo check. En fuego, el LTB de la sección residual esbelta queda sin comprobar (#111) mientras se regala el kfi conservador (#117). El resto son gaps de alcance declarables (kc,90, vibración) y afinados de Lef.

Confirmados: 11 · Refutados: 0 (1 refutado en mecanismo, gap real reidentificado)

---

# Adenda 6 — Motor 14: pilares de madera (timberColumns) (2026-06-12)

> Auditoría ejecutada con **Fable 5** sobre `timberColumns.ts` (422 líneas — flexocompresión EC5 §6.3.2/§6.3.3
> con pandeo por ejes independientes + fuego por sección reducida). Verificación numérica **ejecutando el motor
> real** + agente adversarial. Verificado correcto: kc/λrel (§6.3.2, βc=0.2/0.1), interacción 6.23/6.24 con
> término de compresión lineal y kc (bien documentado el porqué frente a la forma cuadrática de §6.2.4),
> kh por eje de flexión, cortante con kcr, geometría de sección residual, etaFi clampado. El catálogo
> corregido en la adenda 5 (GL32h, C22) no rompe nada aquí (87 tests pasan).
>
> **Estado: los 6 hallazgos corregidos** en commit `866e391` (+9 tests): excentricidad ΔM = Nd,fi·def/2 en
> fuego a 3 caras (#119), ec. 6.35 con kcrit sobre Lef_z (#120), FTUX recalibrado Md 8→3 con test de
> regresión (#121), kfi en fuego consistente con vigas (#122 — su +25% de capacidad deja el caso del #119
> en 0.92 warn honesto), nota de combinación solo-permanente (#123) y etiquetas/comentario SVG (#124).

## Resumen de la adenda 6

| Métrica | Valor |
|---|---|
| Motores auditados | 1 |
| Hallazgos confirmados | **6** |
| Hallazgos refutados | 0 (2 subidos de severidad con FAIL ocultos demostrados) |
| 🔴 Críticos | 0 |
| 🟠 Altos | 0 |
| 🟡 Medios | 3 |
| 🔵 Bajos | 3 |
| Numéricos | 3 |
| Normativos | 3 |

## Índice de hallazgos de la adenda 6

| # | Sev | Cat | Motor | Título | Ubicación |
|---|---|---|---|---|---|
| 119 | 🟡 medium | num | timberColumns | Fuego con 3 caras: el centroide de la sección residual asimétrica se desplaza def/2 pero el axil sigue en el eje original — ΔM = Nd,fi·def/2 omitido. FAIL oculto demostrado: 240×240/Nd=300/R60 → motor 0.86 PASS, real 1.07 | `src/lib/calculations/timberColumns.ts:257-302` |
| 120 | 🟡 medium | norm | timberColumns | Ec. 6.35 de EC5 §6.3.3(4) (vuelco lateral + compresión) omitida — el header declara momento «from wind loading» y los pilares de viento son justo h≫b. FAIL oculto: 100×300/L=6m/Md=20 → motor 0.93 PASS, real 1.15 (kcrit=0.911) | `src/lib/calculations/timberColumns.ts:225-247` |
| 121 | 🟡 medium | num | timberColumns | **Los defaults FTUX fallan**: C24 160×160 con Nd=80/Md=8 da comb-623 = 1.187 → INCUMPLE en rojo al primer open (el fix de la forma lineal de 6.23 nunca recalibró los defaults; con la forma cuadrática antigua daba 0.95, nunca el «~65%» que anuncia el comentario). Sin test FTUX que lo cubra | `src/data/defaults.ts:751-767` |
| 122 | 🔵 low | norm | timberColumns | Fuego sin kfi (1.25/1.15) — conservador 13-20% e **inconsistente con timberBeams** (corregido en #117); al añadirlo, λrel,fi no cambia (f20/E20 cancela el kfi) | `src/lib/calculations/timberColumns.ts:262-264` |
| 123 | 🔵 low | norm | timberColumns | Un solo kmod con inputs ya mayorados: la combinación solo-permanente (kmod=0.6) no es automatizable sin split G/Q (a diferencia de timberBeams #113) — merece nota de alcance visible | `src/lib/calculations/timberColumns.ts:5 + UI` |
| 124 | 🔵 low | num | timberColumns | Etiquetas de 6.23/6.24 (y sus gemelas de fuego) incorrectas con eje débil — espejo del km: la 623 muestra σm sin km cuando lleva km, la 624 muestra km cuando no lo lleva; además el comentario del SVG sobre la cara protegida está invertido | `timberColumns.ts:322, 335, 383, 396 + TimberColumnsSVG.tsx:87` |

## Detalle de hallazgos de la adenda 6

### 🟡 MEDIUM

#### 119. [timberColumns] Excentricidad del axil sobre la sección residual asimétrica (fuego, 3 caras)

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Ubicación:** `timberColumns.ts:257-302`  ·  **ID:** `timberColumns-fire-eccentricity-01`

Con 3 caras expuestas («pilar adosado a muro», opción del dropdown), h se reduce por un solo lado: el centroide residual se desplaza **def/2** respecto al eje original del pilar, pero σc,fi y σm,fi se calculan con el axil centrado — el momento adicional ΔM = Nd,fi·def/2 desaparece. Verificado ejecutando el motor: con defaults+R60 el ΔM=1.43 kNm (Δσ≈15.6 N/mm², comparable a fm_k=24) aunque ese caso ya fallaba; el peligro es el caso intermedio: **240×240 C24, Nd=300, R60, 3 caras → el motor da todo PASS (máx 0.86 warn) cuando con ΔM la ec. 6.24 real es 1.07 → FAIL oculto**. La práctica EN 1995-1-2 con sección reducida asimétrica incluye esta excentricidad. Fix: añadir σm adicional = Nd,fi·(def/2)/W_fi (eje fuerte) en las interacciones de fuego con 3 caras.

#### 120. [timberColumns] Ecuación 6.35 (vuelco lateral + compresión) omitida

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Ubicación:** `timberColumns.ts:225-247`  ·  **ID:** `timberColumns-635-02`

EC5 §6.3.3(4): cuando hay flexión sobre el eje fuerte con compresión, además de 6.23/6.24 hay que comprobar (σm/(kcrit·fm))² + σc/(kc,z·fc0) ≤ 1. Con secciones cuadradas kcrit=1 y 6.23/6.24 gobiernan (verificado algebraicamente), pero la UI no impone b≤h ni nada parecido (campos libres, min=40) y el propio header del módulo declara el momento «from wind loading» — los pilares de fachada a viento son exactamente secciones h≫b altas. FAIL oculto demostrado: **100×300 C24, L=6 m, Nd=5, Md=20 fuerte → motor 0.93 (PASS warn); la 6.35 real con kcrit=0.911 da 1.15 → −24% de infravaloración**. Fix: computar σm,crit/λrel,m/kcrit (misma mecánica que timberBeams) y emitir el check 6.35 cuando momentAxis='strong'.

#### 121. [timberColumns] Los defaults FTUX fallan en rojo

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Ubicación:** `defaults.ts:751-767`  ·  **ID:** `timberColumns-ftux-fail-03`

Hallazgo aportado por el verificador al comprobar el FTUX: con `timberColumnDefaults` tal cual (C24 160×160, L=3 m, Nd=80, Md=8 eje fuerte) el motor devuelve **comb-623 = 1.187 → INCUMPLE** al primer open, contradiciendo el comentario de defaults.ts («all produce CUMPLE at ~65-80%»). Arqueología: con la antigua forma cuadrática daba 0.948 (ámbar, tampoco era el ~65% anunciado); el fix correcto a la forma lineal de §6.3.2(3) lo empujó a fail y nadie recalibró. No existe test de FTUX-en-verde para este módulo (los demás motores lo tienen). Fix: recalibrar defaults (Md≈4-5 kNm o sección 180×180) + test de regresión FTUX.

---

### 🔵 LOW

#### 122. [timberColumns] Fuego sin kfi — inconsistente con timberBeams ya corregido

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `timberColumns.ts:262-264`  ·  **ID:** `timberColumns-kfi-04`

fc0/fm/fv de fuego usan los valores característicos sin el kfi=1.25/1.15 de EN 1995-1-2 §2.3 — conservador 13-20% y ahora incoherente con timberBeams (#117, corregido en 0123447). Detalle técnico para el fix: λrel,fi no cambia al añadirlo (f20 = kfi·fk y E20 = kfi·E0,05 → el cociente cancela). El test «fire design strengths use fm_k» consolida el comportamiento actual y debe recalibrarse.

#### 123. [timberColumns] Combinación solo-permanente no automatizable — nota de alcance

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `timberColumns.ts:5 + UI`  ·  **ID:** `timberColumns-kmod-combo-05`

Los inputs son valores de cálculo ya mayorados con un único kmod del usuario: el motor no puede comprobar automáticamente la combinación solo-permanente (kmod=0.6) como ahora hace timberBeams (#113, con split G/Q). El usuario puede seleccionar «Permanente» a mano, pero nada se lo recuerda. Gap de diseño de inputs, no bug. Fix recomendado: scope-note visible (no rediseño).

#### 124. [timberColumns] Etiquetas con eje débil — espejo del km — y comentario del SVG invertido

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Ubicación:** `timberColumns.ts:322, 335, 383, 396 + TimberColumnsSVG.tsx:87`  ·  **ID:** `timberColumns-labels-06`

Las utilizaciones son correctas; las etiquetas no: con momentAxis='weak', la 6.23 muestra «σm,d/fm,d» cuando el término real lleva km=0.7, y la 6.24 muestra «km·σm,d/fm,d» cuando lleva σm completo — error espejo, duplicado en las gemelas de fuego. De propina, el comentario del SVG sobre la cara protegida con 3 caras está invertido («top not protected → residual aligns at top», autocontradictorio); la convención (el muro protege la cara perpendicular a h) no se comunica en la UI.

---

## Valoración por motor (adenda 6)

### timberColumns

**Valoración:** El núcleo EC5 está bien resuelto: kc/λrel exactos, la interacción 6.23/6.24 usa la forma lineal correcta de §6.3.2(3) con un comentario ejemplar explicando por qué no la cuadrática (un fix histórico bien hecho), kh por eje de flexión, y la mecánica de sección reducida en fuego con pandeo residual por ejes independientes es de lo más completo del repo. Los problemas son tres omisiones con consecuencias demostradas ejecutando el motor: la **excentricidad del axil sobre la sección residual asimétrica** en fuego a 3 caras (#119, FAIL oculto en un caso plausible), la **ec. 6.35 de vuelco lateral** justo para el caso de uso que el propio módulo declara — pilares de viento h≫b — (#120, −24% demostrado), y unos **defaults FTUX que abren en rojo** (#121) porque el fix correcto de la forma lineal nunca recalibró la demo ni dejó test de regresión. Los bajos son consistencia (kfi de fuego, ya corregido en vigas), una nota de alcance pendiente (combinación permanente) y etiquetas espejo del km.

Confirmados: 6 · Refutados: 0 (2 subidos de severidad)

---

# Adenda 7 — Motor 15: empresillado (empresillado) (2026-06-12)

> Auditoría ejecutada con **Fable 5** sobre `empresillado.ts` (234 líneas — refuerzo de pilar RC con 4
> angulares + presillas, EC3 §6.4 piezas compuestas empresilladas) y el catálogo `angleProfiles.ts`.
> Verificación numérica **ejecutando el motor real** (Ncr, Sv, amplificación de EC3 recalculados a mano)
> + agente adversarial. Verificado correcto: geometría compuesta (I1=(Iu+Iv)/2 para ejes paralelos al ala),
> reparto de cordón N/4 + M/(2h) en primer orden, curva b para angulares, pandeo local con lk=s e iv
> (conservador frente al s0 libre), λeff=√(λ0²+λv²) (método CTE de esbeltez ideal), Wpl de presilla.
> El catálogo L muestrea a ±1-2% de EN 10056-1 (analítico sin acuerdos, documentado). μ=1 en Ieff resultó
> **exactamente conforme** a EC3 Tabla 6.10 en todo el rango práctico (λ≤75) — hallazgo refutado.
>
> **Estado: los 7 hallazgos corregidos** en commit `5c9d569` (+9 tests, suites 3/4/8/9 recalibradas):
> segundo orden §6.4.1 completo — e0=L/500, Ncr, Sv (ec. 6.73), MEd amplificado, cordón ec. 6.69 exacta,
> VEd = π·MEd/L + Vd aditivo, divergencia → invalid (#125) —, flexión Vierendeel del cordón (#126),
> T interna de presilla (#128), validación de positividad + clamp del NumberField (#127), fila s≤50·iv y
> scope-note (#129), textos lk=0.5·s corregidos ×3 (#130). FTUX sigue verde (cordón+Vierendeel al 55%)
> y el flip de la auditoría (Mx=58 → pletina-flexión FAIL) queda pinneado en test.

## Resumen de la adenda 7

| Métrica | Valor |
|---|---|
| Motores auditados | 1 (+catálogo) |
| Hallazgos confirmados | **7** |
| Hallazgos refutados | 1 (μ=1) + 1 subsumido (interacción global) |
| 🔴 Críticos | 0 |
| 🟠 Altos | 1 |
| 🟡 Medios | 2 |
| 🔵 Bajos | 4 |
| Numéricos | 3 |
| Normativos | 4 |

## Índice de hallazgos de la adenda 7

| # | Sev | Cat | Motor | Título | Ubicación |
|---|---|---|---|---|---|
| 125 | 🟠 high | norm | empresillado | **Modelo de segundo orden de EC3 §6.4.1 omitido**: cordón en primer orden (sin e0=L/500 ni amplificación 1/(1−N/Ncr−N/Sv)) y VEd = max(Vd, N/500) en vez de π·MEd/L — con defaults (Vd=0) las presillas se dimensionan con 1.0 kN cuando el VEd correcto es 24.8 kN (25×); flip demostrado: Mx=58 → motor todo verde (42%) vs real 101% FAIL. Además Vd real se envuelve (max) en vez de combinarse | `src/lib/calculations/empresillado.ts:139-146, 178-183` |
| 126 | 🟡 medium | norm | empresillado | Flexión Vierendeel del cordón omitida (EC3 §6.4.3.1(1)): los cordones deben comprobarse a axil + momento local M_ch ≈ V·s/8 — con el VEd correcto, ~50% de demanda invisible en el angular | `src/lib/calculations/empresillado.ts:194-198` |
| 127 | 🟡 medium | num | empresillado | NumberField local ignora min/step: bc=−30, L=−3, tp=0, β<0.5 entran por TECLADO y producen resultados «válidos» verdes (bc=−30 → hx negativo, verde; L=−3 → χ=1); N_Ed<0 entra por URL → todo verde con utilización 0 | `EmpresalladoInputs.tsx:31 + empresillado.ts:94-117` |
| 128 | 🔵 low | norm | empresillado | Cortante de presilla comparado contra el V total de la pieza: conservador ×1.79 en defaults, pero el esfuerzo real T=(V/2)·s/h0 CRUZA (T>V) con s>2·h0, alcanzable (s=80, hc=15 → T=1.93·V) — inmaterial hoy solo porque V está infraalimentado; arreglar junto con #125 | `src/lib/calculations/empresillado.ts:191, 203-204` |
| 129 | 🔵 low | norm | empresillado | Alcance sin declarar: el pilar RC existente se desprecia (conservador, pero ni UI ni PDF lo dicen), soldadura presilla-cordón sin comprobar, sin límite de separación s ≤ 50·i_min (la UI acepta cualquier s) | `(ausente — UI/PDF)` |
| 130 | 🔵 low | num | empresillado | Comentarios y helpText obsoletos «lk = 0.5·s (biempotradas)» en defaults.ts y en la UI (βx, βy) contradicen el motor (lk = s, con justificación de por qué 0.5s era no conservador) — invita a «recorregir» mal | `defaults.ts:495 + EmpresalladoInputs.tsx:163, 173` |
| 131 | 🔵 low | num | empresillado | (info) Catálogo L analítico sin acuerdos: ±1-2% frente a EN 10056-1, ligeramente no conservador en I1/e (acotado y documentado en el header); μ=1 conforme a Tabla 6.10 en rango práctico | `src/data/angleProfiles.ts` |

## Detalle de hallazgos de la adenda 7

### 🟠 HIGH

#### 125. [empresillado] Modelo de segundo orden de EC3 §6.4.1 omitido

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `empresillado.ts:139-146 (cordón), 178-183 (VEd)`
- **ID:** `empresillado-second-order-01`

**Descripción**

El corazón de EC3 §6.4 para piezas compuestas es el modelo de segundo orden: MEd = (NEd·e0 + MEd^I)/(1 − NEd/Ncr − NEd/Sv) con e0 = L/500, Ncr = π²EIeff/L² y Sv = rigidez a cortante del sistema de presillas (ec. 6.73); de ahí salen la fuerza de cordón (ec. 6.69) y el cortante de cálculo **VEd = π·MEd/L** (§6.4.1(7)). El motor usa cordón de primer orden y VEd = max(Vd, N/500): el suelo nocional es ~3.1× corto incluso sin momentos (π·N·(L/500)/L = N/159), y con momentos aplicados ni siquiera entran en el cortante.

**Evidencia (verificada ejecutando el motor + recálculo EC3 completo)**

```
Defaults (N=500, Mx=20, My=10, Vd=0, L=3m, L100x10, s=40):
  Ieff=24 984 cm⁴ · Ncr=57 537 kN · Sv=23 337 kN · denominador 0.970 → MEd,X=23.7 kNm
  VEd correcto = π·23.7/3 = 24.8 kN  vs  motor: max(0, 500/500) = 1.0 kN  → 25× corto
  Flexión de presilla real: 2.48 kNm (38% de M_Rd)  vs  1.5% reportado
Flip verde→fail: Mx=58 kNm (resto defaults) → motor: todo verde, máx 42%
  EC3 correcto: pletina-flexión 101% → FAIL
```

**Razonamiento del verificador**

Confirmado y subido a high: no hay mitigación (Vd=0 en defaults hace que el suelo infraalimentado gobierne siempre), el ΔN de cordón es modesto con defaults (34→36%) pero las presillas trabajan con esfuerzos uno-dos órdenes de magnitud por debajo de los reales, y existe un caso alcanzable con inputs normales donde el veredicto global se invierte. La suite 9 de tests pina exactamente `V_Ed=max(Vd,N/500)` y `M=V·s/4` — consolida el defecto y habrá que recalibrarla. Detalle de diseño para el fix (A3): el Vd real debe considerarse aditivamente con el cortante de imperfección, no por envolvente.

**Fix sugerido**

Implementar §6.4.1 completo: Ieff (ya disponible), Ncr, Sv = 24·E·Ich/(s²·(1+2·Ich·h0/(n·Ib·s))) capada a 2π²EIch/s², MEd amplificado con e0=L/500 + momentos aplicados, N_ch con ec. 6.69, VEd = π·MEd/L + Vd. Recalibrar suite 9 con oracles del recálculo de arriba.

---

### 🟡 MEDIUM

#### 126. [empresillado] Flexión Vierendeel del cordón omitida

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Ubicación:** `empresillado.ts:194-198`  ·  **ID:** `empresillado-chord-moment-02`

EC3 §6.4.3.1(1): en piezas empresilladas los cordones se comprueban a **axil + momento local** del mecanismo Vierendeel (M_ch ≈ V·s/8 por cordón con dos planos de presillas); el motor solo comprueba axil. Con el VEd correcto del caso flip (~66 kN): M_ch ≈ 3.3 kNm frente a ~6.6 kNm de capacidad elástica del angular — **~50% de demanda invisible**. Materialidad ligada al #125 (con el VEd actual infraalimentado el momento también se evapora). Fix: añadir el término M_ch/(Wel,ang·fy/γM0) a la utilización del cordón.

#### 127. [empresillado] NumberField ignora min/step — geometrías negativas por teclado

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Ubicación:** `EmpresalladoInputs.tsx:31 + empresillado.ts:94-117`  ·  **ID:** `empresillado-validation-03`

Mismo patrón que el #64 de rc-beams: el `NumberField` local declara min/step pero nunca los aplica (input type=text). Verificado por teclado: **bc=−30 → dx=−12.1, hx negativo y resultado «válido» en verde**; L=−3 → χ=1.0 verde; tp=0 pasa. Las cargas están protegidas por parseQuantity en teclado pero no por URL (N_Ed=−500 → todo verde con utilización 0). Fix: clamp en NumberField + validación de positividad en el motor (bc, hc, L, s, lp, bp, tp > 0; N_Ed ≥ 0).

---

### 🔵 LOW

#### 128. [empresillado] Cortante de presilla contra V total — el cruce T>V es alcanzable

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `empresillado.ts:191, 203-204`  ·  **ID:** `empresillado-batten-shear-04`

El esfuerzo interno real de la presilla es T = (V/2)·s/h0: con defaults T=0.56·V (motor conservador ×1.79), pero con s>2·h0 el cruce es alcanzable (verificado: s=80, hc=15 → T=1.93·V, casi el doble de lo comprobado). Hoy inmaterial únicamente porque V está infraalimentado (#125) — **arreglar juntos**: comprobar T=(VEd/2)·s/h0 contra V_Rd de la presilla.

#### 129. [empresillado] Alcance sin declarar

- **Severidad:** low  ·  **Categoría:** normative  ·  **Ubicación:** `(UI/PDF)`  ·  **ID:** `empresillado-scope-05`

Ni la UI ni el PDF declaran que el pilar RC existente se desprecia (hipótesis conservadora que el usuario debe conocer), no se comprueba la unión presilla-cordón (soldadura) y no hay límite de separación s ≤ 50·i_min (práctica EA/CTE; con i_v=1.97 → s≤98 cm, hoy la UI acepta cualquier s). Fix: scope-note + warn de s/i_min.

#### 130. [empresillado] Comentarios y helpText obsoletos «lk = 0.5·s»

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Ubicación:** `defaults.ts:495 + EmpresalladoInputs.tsx:163, 173`  ·  **ID:** `empresillado-stale-comments-06`

El motor usa lk=s con un comentario explicando por qué 0.5·s era no conservador, pero el comentario de defaults Y los helpText visibles de βx/βy siguen diciendo «las pletinas soldadas tienen lk = 0.5·s fijo (biempotradas)» — documentación que contradice el cálculo e invita a «recorregirlo» mal. Tres sitios que tocar.

#### 131. [empresillado] (info) Catálogo analítico ±1-2% y μ=1 conforme

- **Severidad:** low  ·  **Categoría:** numerical  ·  **Ubicación:** `angleProfiles.ts`  ·  **ID:** `empresillado-catalog-07`

Muestreo L100x10 contra EN 10056-1: A −1.0%, I1 +1.8%, iv +0.9%, e +1.7% — coherente con el header («analítico sin acuerdos, ±1-2%»), ligeramente no conservador pero acotado y documentado. El hallazgo de μ<1 en Ieff fue **refutado**: la Tabla 6.10 da μ=1.0 exacto para λ≤75 y el rango práctico del módulo queda muy por debajo (λ=16.5 con defaults; ni forzando L=8 m con angular mínimo se supera). Sin acción de código; nota en el doc.

---

## Valoración por motor (adenda 7)

### empresillado

**Valoración:** La carcasa del motor es correcta — geometría compuesta exacta (incluido el detalle fino de I1=(Iu+Iv)/2), reparto de cordón limpio, curva b apropiada, pandeo local conservador (lk=s tras un fix histórico bien razonado), método CTE de esbeltez ideal para el global y presillas con el modelo biempotrado estándar. Pero le falta **el capítulo central de la norma que cita**: el modelo de segundo orden de §6.4.1 (#125) — sin e0=L/500, sin amplificación por Ncr y Sv, y con un cortante nocional N/500 que infraalimenta las presillas 25× con los defaults (Vd=0), con un flip verde→fail demostrado con inputs normales. De esa misma raíz cuelgan la flexión Vierendeel del cordón ausente (#126) y el cortante de presilla contra la referencia equivocada (#128). A eso se suma el NumberField sin clamp que acepta geometrías negativas por teclado (#127, mismo patrón #64). En el lado bueno: el catálogo es honesto (±1-2% documentado), μ=1 resultó exactamente conforme (hallazgo refutado), y los 37 tests existentes cubren bien el primer orden — la suite 9 habrá que recalibrarla con los oracles de segundo orden.

Confirmados: 7 · Refutados: 1 (μ) + 1 subsumido (interacción global)

---

# Adenda 8 — Motores 16-17: punzonamiento y cruceta (punching + cruceta) (2026-06-13)

> Auditoría ejecutada con **Fable 5** sobre `punching.ts` (315 líneas — punzonamiento CE Anejo 19 §6.4 en
> tres posiciones, con y sin cercos) y `cruceta.ts` (165 líneas — «compañero de hand-calc» para pilar
> metálico con crucetas UPN, deliberadamente recortado en 2026-06-09). Verificación **ejecutando el motor
> real + fuentes web** del Anejo 19 oficial. Verificado correcto: u1/u0 por posición, vRd,c con el factor
> 100 y vmin, vRd,cs (ec. 6.52) con fywd,ef, clamps de ρl, y — refutando mi propio hallazgo —
> **vRd,max = 0.4·ν·fcd es el valor vigente** (corrigendum EN 1992-1-1+AC2:2010, adoptado por CE Anejo 19).
> El recorte de cruceta verificado **coherente**: verdict vinculante = u0 + clase UPN + cabida; vRd,c de la
> placa degateado a ámbar con etiqueta honesta; cero restos del antiguo diseñador automático.
>
> **Estado: los 7 hallazgos corregidos** en commit `5a16c91` (+9 tests, 5 recalibrados): β=1.15 interior
> con transferencia de momento y 1.0 solo en carga-puntual + nota de validez del simplificado (#132, #138),
> degateo de vRd,c con cercos — vinculan vRd,cs/vRd,max (#133), nota de disposición con uout (#134),
> nota de malla simétrica en UI (#135), ρl real en la fórmula con utilización honesta (#136), fy de UPN
> por espesor y citas CE Anejo 22 (#137), substrate muerto eliminado y FTUX recalibrado a VEd=260 (#138).

## Resumen de la adenda 8

| Métrica | Valor |
|---|---|
| Motores auditados | 2 |
| Hallazgos confirmados | **7** |
| Hallazgos refutados | 1 (vRd,max — el código es correcto) |
| 🔴 Críticos | 0 |
| 🟠 Altos | 1 |
| 🟡 Medios | 2 |
| 🔵 Bajos | 4 |
| Numéricos | 3 |
| Normativos | 4 |

## Índice de hallazgos de la adenda 8

| # | Sev | Cat | Motor | Título | Ubicación |
|---|---|---|---|---|---|
| 132 | 🟠 high | norm | punching | **β = 1.0 para pilar interior** — CE Anejo 19 / EC2 fig. 6.21N: 1.15 para estructuras arriostradas; vEd un 15% corto en TODOS los checks del caso por defecto (FTUX real 91.6%, mostrado 79.7%); se propaga al modo cruceta; β=1.0 solo defendible en carga-puntual sin transferencia de momento | `src/lib/calculations/punching.ts:20-22` |
| 133 | 🟡 medium | num | punching | Con cercos activos, vEd ≤ vRd,c sigue VINCULANDO → INCUMPLE falso exactamente cuando los cercos son necesarios (caso ejecutado: vRd,cs=0.868 pasa, vRd,max pasa, valid=false); el degateo correcto ya existe en cruceta.ts y no se aplicó aquí | `src/lib/calculations/punching.ts:275-291` |
| 134 | 🟡 medium | norm | punching | Disposición de cercos sin comprobar: alcance del perímetro exterior a uout−1.5d (ni se pide nº de filas; uout es solo informativo), primera fila a 0.3-0.5d, separación tangencial ≤1.5d/2d y Asw,min §9.4.3(2) — un verde en vRd,cs puede dar falsa sensación de detalle completo | `src/lib/calculations/punching.ts:208-228` |
| 135 | 🔵 low | norm | punching | ρl de UNA dirección por cara (la UI pide un único Ø+s): correcto solo con malla igual en ambas direcciones (ρl = √(ρx·ρy)); el supuesto no se documenta en UI ni PDF | `punching.ts:181-195 + PunchingInputs.tsx:370-396` |
| 136 | 🔵 low | num | punching | El suelo ρl,min DENTRO de la fórmula infla vRd,c cuando el armado real está bajo mínimos (enmascarado por vmin en casos realistas; la fila warn avisa); además la fila clamped muestra utilization=0.85 hardcodeada (barra fabricada) | `src/lib/calculations/punching.ts:195, 244` |
| 137 | 🔵 low | norm | cruceta | Citas «CE DB-SE-A 5.5/6.2» híbridas inexistentes (patrón #95) y fy de UPN sin reducción tf>16 (UPN320 tf=17.5, UPN400 tf=18 — informativo, MRd/VplRd ~3% altos; UPN350/380 tienen tf=16.0 exacto, sin reducción) | `src/lib/calculations/cruceta.ts:41, 124, 133` |
| 138 | 🔵 low | num | punching | Campo `substrate` ('zapata'/'forjado') muerto en defaults (no se renderiza ni afecta — el modelo es conservador para zapatas, verificado); y las condiciones de validez del β simplificado (estructura arriostrada, luces adyacentes <25%) no se exponen en UI/PDF | `defaults.ts:367 + UI` |

## Detalle de hallazgos de la adenda 8

### 🟠 HIGH

#### 132. [punching] β = 1.0 para pilar interior — el simplificado del Anejo 19 es 1.15

- **Severidad:** high  ·  **Categoría:** normative  ·  **Confianza:** high
- **Ubicación:** `punching.ts:20-22 (betaForPosition)`
- **ID:** `punching-beta-interior-01`

**Descripción**

`betaForPosition` devuelve interior=1.0, borde=1.4, esquina=1.5. Los valores recomendados de CE Anejo 19 / EC2 fig. 6.21N para estructuras arriostradas (los β simplificados que evitan calcular la transferencia de momento) son **1.15 / 1.4 / 1.5** — verificado con el PDF oficial del Anejo 19 y fuentes (mismo trío que EHE-08 art. 46). El motor usa el valor de borde y esquina correctos pero el interior queda en 1.0, que solo es defendible para carga puntual SIN transferencia de momento (mode='carga-puntual'). En modo 'pilar' interior — el default y el caso más común — **vEd queda un 15% corto en todos los checks** (vRd,c, vRd,max, vRd,cs y uout), y se propaga al modo cruceta (la placa hereda betaForPosition).

**Evidencia (ejecutada)**

```
Defaults (300×300, d=200, C25, Ø12@150, VEd=300):
  motor: vEd=0.404, vRd,c=0.507 → 79.7% util (verde FTUX)
  con β=1.15: vEd=0.464 → 91.6% util (ámbar) — el FTUX real
Tests punching.test.ts:22,63 consagran beta=1.0 → recalibrar (norma > calibración)
```

**Fix sugerido**

β interior = 1.15 cuando mode='pilar' (transferencia de momento posible); mantener 1.0 para 'carga-puntual'. Exponer la condición de validez del simplificado (estructura arriostrada, luces adyacentes que no difieren >25%) como nota (ver #138). Recalibrar los dos tests y el comentario FTUX de defaults (VEd o armado para volver a ~75%).

---

### 🟡 MEDIUM

#### 133. [punching] Con cercos, vEd ≤ vRd,c sigue vinculando — INCUMPLE falso

- **Severidad:** medium  ·  **Categoría:** numerical  ·  **Ubicación:** `punching.ts:275-291`  ·  **ID:** `punching-vrdc-gating-02`

Cuando hay armadura de punzonamiento, la situación normal es vEd > vRd,c (por eso se ponen cercos) y el binding pasa a vRd,cs + vRd,max. El motor mantiene la fila 'punz-ved-vrdc' como vinculante: caso ejecutado (defaults + VEd=400 + Ø8/2 ramas/sr=100) → vRd,cs=0.868 **pasa**, vRd,max pasa, y aun así valid=false e INCUMPLE en el badge — la feature de cercos queda inutilizada. Agravante: el degateo correcto (fail→warn con etiqueta explicativa) **ya está implementado en cruceta.ts:105-115** para esta misma fila — el patrón existe en el propio codebase. Fix: con hasShearReinf, la fila vRd,c pasa a informativa («delimita si los cercos son necesarios») y el verdict vincula vRd,cs/vRd,max.

#### 134. [punching] Disposición de cercos sin comprobar

- **Severidad:** medium  ·  **Categoría:** normative  ·  **Ubicación:** `punching.ts:208-228`  ·  **ID:** `punching-layout-03`

Con cercos solo se comprueba sr ≤ 0.75d. Faltan: el alcance del perímetro exterior de armado a uout−1.5d (§6.4.5(4) — el motor calcula uout pero es un ValueRow informativo y ni siquiera pide nº de filas), la primera fila a 0.3-0.5d de la cara, la separación tangencial ≤1.5d (dentro de u1) / 2d (fuera) y Asw,min (§9.4.3(2)). La ec. 6.52 presupone esa disposición: un verde en vRd,cs sin estos checks puede dar falsa sensación de detalle completo. Fix mínimo: input de nº de filas + check de alcance contra uout; el resto como filas o nota de disposición.

---

### 🔵 LOW

#### 135-138. [punching/cruceta] Bajos

- **#135** ρl de una dirección por cara: la UI pide un único Ø+s («Cara superior/inferior») y el motor lo usa como si fuera √(ρx·ρy) — correcto con malla simétrica (caso común), indocumentado. Fix: nota en la etiqueta. `punching.ts:181-195`
- **#136** El suelo ρl,min dentro de la fórmula de vRd,c es anti-conservador en principio cuando el armado real está bajo mínimos; verificado que vmin lo enmascara en los casos realistas (Ø6@300 → vRd,c=vmin) y la fila warn avisa. Fix limpio: ρl=min(ρ_real, 0.02) en la fórmula, ρmin solo como check; y quitar el utilization=0.85 hardcodeado de la fila clamped. `punching.ts:195, 244`
- **#137** Citas «CE DB-SE-A 5.5/6.2» → CE Anejo 22 (EC3) §5.5/§6.2; fy de UPN sin reducción para UPN320/UPN400 (tf 17.5/18 — informativo, ~3%; UPN350/380 tienen tf=16.0 exacto y no reducen). `cruceta.ts:41, 124, 133`
- **#138** Campo `substrate` muerto en defaults (verificado que el modelo es conservador para zapatas — solo limpieza) y condiciones de validez del β simplificado sin exponer (ligar al fix del #132). `defaults.ts:367`

**Refutado:** vRd,max = 0.4·ν·fcd es el valor VIGENTE (EN 1992-1-1+AC2:2010 cambió el 0.5 original; CE Anejo 19 lo adopta) — el código y su test están correctos; sin acción.

---

## Valoración por motor (adenda 8)

### punching

**Valoración:** Motor compacto y mayormente correcto: perímetros u1/u0 exactos en las tres posiciones (incluido el circular interior), vRd,c con el factor 100 y vmin, vRd,cs conforme a la ec. 6.52 con fywd,ef, y vRd,max en el valor vigente del corrigendum (que mi propia auditoría intentó «corregir» mal — refutado con el PDF oficial del Anejo 19). Los dos defectos materiales: **β=1.0 para pilar interior** (#132) — el FTUX real está al 92%, no al 80% que muestra, un 15% sistemático no conservador en el caso más común — y el **INCUMPLE falso con cercos** (#133), que inutiliza la feature de armadura de punzonamiento justo cuando se necesita (y cuyo fix ya está escrito en cruceta.ts). El bloque de cercos además no comprueba la disposición (#134). El resto es documentación de supuestos (#135, #136, #138).

### cruceta

**Valoración:** El recorte de 2026-06-09 a «compañero de hand-calc» resultó **coherente y honesto**: verdict vinculante mínimo y defendible (aplastamiento en u0, clase UPN, cabida del ala), la fila de vRd,c de la placa degateada a ámbar con etiqueta que exige el hand-calc del reparto, capacidades del UPN como filas neutrales informativas, y cero restos del antiguo diseñador automático con la inversión de signo. Hereda el #132 vía la placa (β) y aporta solo dos bajos propios (citas híbridas, fy de UPN sin banda gruesa en dos perfiles). Es el ejemplo de cómo recortar alcance sin mentir.

Confirmados: 7 · Refutados: 1 (vRd,max — código correcto)
