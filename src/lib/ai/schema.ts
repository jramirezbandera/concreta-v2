/**
 * JSON Schema canónico del payload de vigas de acero + reglas de prompt del
 * módulo. Fuente de verdad del adapter steel-beams (payloadSchema/promptRules
 * del chat conversacional).
 *
 * Sin `minimum`/`maximum` (no soportados en structured outputs de todos los
 * proveedores) — los rangos se validan en cliente (`buildApplyPlan`).
 */

/**
 * Tipado laxo (`Record<string, unknown>`) a propósito: cada SDK espera su
 * propia forma de JSON Schema y este objeto se pasa tal cual.
 */
export const STEEL_BEAM_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo', 'size', 'steel', 'beamType', 'L_m', 'Lcr_m', 'deflLimit', 'elsCombo', 'useCategory', 'gk_kNm2', 'qk_kNm2', 'bTrib_m', 'warnings', 'notes'],
  properties: {
    tipo: { type: ['string', 'null'], enum: ['IPE', 'HEA', 'HEB', 'IPN', null], description: 'Familia del perfil laminado. null si el enunciado no la indica.' },
    size: { type: ['integer', 'null'], description: 'Canto nominal del perfil en mm (p.ej. 300 para un IPE 300).' },
    steel: { type: ['string', 'null'], enum: ['S275', 'S355', null], description: 'Grado de acero.' },
    beamType: { type: ['string', 'null'], enum: ['ss', 'cantilever', 'fp', 'ff', null], description: 'Apoyos: ss=biarticulada, cantilever=ménsula, fp=empotrada-articulada, ff=biempotrada.' },
    L_m: { type: ['number', 'null'], description: 'Luz de la viga en METROS.' },
    Lcr_m: { type: ['number', 'null'], description: 'Longitud de pandeo lateral en METROS. SOLO si el enunciado la da explícitamente.' },
    deflLimit: { type: ['integer', 'null'], enum: [250, 300, 400, 500, 600, null], description: 'Denominador n del límite de flecha L/n.' },
    elsCombo: { type: ['string', 'null'], enum: ['characteristic', 'frequent', 'quasi-permanent', null], description: 'Combinación ELS para flecha.' },
    useCategory: { type: ['string', 'null'], enum: ['A1', 'A2', 'B', 'C1', 'C2', 'C3', 'D1', 'E1', 'G1', null], description: 'Categoría de uso CTE DB-SE-AE Tabla 3.1.' },
    gk_kNm2: { type: ['number', 'null'], description: 'Carga permanente superficial ADICIONAL en kN/m² (sin peso propio del perfil).' },
    qk_kNm2: { type: ['number', 'null'], description: 'ÚNICA acción variable superficial del módulo, en kN/m²: la ENVOLVENTE (la más desfavorable) de todas las hipótesis variables — sobrecarga de uso, nieve, viento descendente, mantenimiento. No es "la última acción mencionada".' },
    bTrib_m: { type: ['number', 'null'], description: 'Ancho tributario en METROS.' },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Avisos: esfuerzos en vez de cargas, cargas lineales, unidades dudosas, ambigüedades, datos ignorados.' },
    notes: { type: ['string', 'null'], description: 'Comentario breve opcional.' },
  },
};

/**
 * Reglas del módulo steel-beams para el chat conversacional: contenido técnico
 * sin framing de enunciado único (la regla anti-invención y el contrato de
 * salida JSON viven en el prompt base del chat, CHAT_SYSTEM_PROMPT_BASE de
 * chatSchema.ts).
 */
export const STEEL_PROMPT_RULES = `REGLAS DEL MÓDULO (vigas de acero laminado según el Código Estructural español y CTE):
1. Unidades del payload: longitudes (L_m, Lcr_m, bTrib_m) en METROS; cargas superficiales (gk_kNm2, qk_kNm2) en kN/m². Si el usuario usa otras unidades (cm, mm, kp/m², kg/m², t/m²...), convierte (1 kp/m² = 1 kg/m² ≈ 0.00981 kN/m²; 1 t/m² ≈ 9.81 kN/m²) y añade un warning indicando la conversión.
2. El módulo trabaja con CARGAS SUPERFICIALES (kN/m²) y ancho tributario, no con esfuerzos. Si el usuario da directamente esfuerzos (momento MEd, cortante VEd, momento de servicio Mser), deja gk_kNm2/qk_kNm2/bTrib_m en null y añade un warning describiendo los esfuerzos indicados (el módulo no puede fijarlos directamente).
3. Si el usuario da cargas LINEALES (kN/m) y también un ancho tributario coherente, puedes derivar la carga superficial dividiendo (kN/m ÷ m = kN/m²) e indicarlo en un warning. Si da cargas lineales sin ancho tributario, deja los campos de carga en null y descríbelo en un warning.
4. gk_kNm2 es la carga permanente ADICIONAL (solado, tabiquería, falso techo...), sin el peso propio del perfil de acero (la app lo añade automáticamente).
5. beamType: "ss" = biarticulada o simplemente apoyada; "cantilever" = ménsula o voladizo; "fp" = empotrada-articulada; "ff" = biempotrada.
6. Lcr_m SOLO si el usuario da explícitamente la longitud de pandeo lateral (o arriostramientos a distancia concreta). Si no la da, null: la app la calcula automáticamente.
7. deflLimit: denominador n del límite de flecha L/n. Si el usuario pide un n distinto de 250/300/400/500/600, devuelve null y añade un warning con el valor pedido.
8. useCategory solo si el usuario nombra el uso del forjado (vivienda/residencial → A1; trasteros → A2; oficinas/administrativo → B; zonas con mesas → C1; asientos fijos → C2; zonas sin obstáculos/de paso → C3; comercial → D1; almacén → E1; cubierta accesible solo para conservación → G1). Si da un qk explícito sin nombrar uso, deja useCategory en null.
9. Ante ambigüedades propias del módulo (dos luces posibles, unidades de carga dudosas, datos contradictorios), pregunta en "reply", deja el campo afectado en null y refleja la duda en warnings si procede.

CONTRATO DE CARGAS DEL MÓDULO (UNA carga permanente + UNA acción variable):
10. gk_kNm2 y qk_kNm2 son los ÚNICOS campos de carga. No hay campos de nieve, viento, mantenimiento, sismo ni de hipótesis alternativas, y no puedes crearlos: toda acción que descubras acaba dentro de uno de esos dos campos o se queda fuera del cálculo declarada en warnings.
11. Las cargas permanentes se ACUMULAN: gk_kNm2 es la SUMA de todas las permanentes superficiales adicionales (panel, correas, aislamiento, falso techo, instalaciones, solado, tabiquería...), sin el peso propio del perfil. Si aparece una permanente nueva, súmala a la vigente; nunca la sustituyas.
12. Las acciones variables NO se acumulan: qk_kNm2 es la ENVOLVENTE, la MÁS DESFAVORABLE de las hipótesis variables (sobrecarga de uso de la Tabla 3.1, nieve, viento descendente, mantenimiento). REGLA DE ORO: qk_kNm2 NUNCA disminuye porque aparezca una acción nueva. Si la acción nueva es MENOR que la vigente, la envolvente no cambia: deja qk_kNm2 en null, dilo en "reply" y añade un warning indicando que esa acción no gobierna. Solo propones un qk_kNm2 nuevo si la acción nueva es MAYOR que la vigente (o si el usuario corrige el dato).
13. Concomitancia: en cubiertas accesibles ÚNICAMENTE para conservación (categoría G, uso de mantenimiento) la sobrecarga de uso NO es concomitante con nieve ni viento (CTE DB-SE-AE 3.1.1): se comparan y gobierna la MAYOR — la de mantenimiento (G1, 1,0 kN/m²) supera a la nieve en casi toda la costa mediterránea. Cuando dos acciones variables SÍ son concomitantes, la envolvente es el máximo de las combinaciones Qk,dominante + Σ ψ0,i·Qk,i (CTE DB-SE Tabla 4.2) y puede superar a cada acción por separado.
14. Al proponer qk_kNm2, di SIEMPRE en "reply" qué acción lo gobierna y cuáles has descartado por menores, con un warning "Sugerencia:" por cada valor recomendado (acción, valor y referencia normativa). Si la acción que gobierna NO es una sobrecarga de uso (p. ej. gobierna la nieve), tú NO puedes seleccionarla en useCategory: dilo en "reply" e indica al usuario que elija en el selector "Acción variable" del formulario la opción que corresponda (Nieve alt. ≤ 1000 m, Nieve alt. > 1000 m, Viento), porque es la que fija los coeficientes ψ correctos; mientras no lo haga, el formulario aplicará las ψ genéricas de "Personalizada".
15. Coherencia categoría/qk: la aplicación RECHAZA un qk_kNm2 inferior a la sobrecarga de uso de la categoría en vigor (lo trata como una acción que no gobierna). Si la sobrecarga real está legítimamente fuera de la Tabla 3.1 (p. ej. cubierta ligera sobre correas, 0,4 kN/m²), explícalo en "reply" e indica al usuario que seleccione "Personalizada" (o la acción variable que corresponda) en el formulario antes de fijar ese valor.
16. El módulo solo comprueba flexión gravitatoria descendente. El viento de SUCCIÓN (levantamiento), la inversión de esfuerzos, el sismo y las cargas puntuales NO caben en qk_kNm2: no los conviertas en carga superficial; decláralos en warnings como comprobación pendiente fuera del módulo.`;
