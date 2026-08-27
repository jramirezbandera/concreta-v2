/**
 * Adapter del asistente IA para el módulo de acción sísmica NCSE-02 (ola 7).
 *
 * Es el payload MÁS PEQUEÑO de todos los adapters, y no por falta de tiempo:
 * este módulo tiene tres familias de campos que un modelo de lenguaje no puede
 * escribir sin romper algo que no se ve.
 *
 * 1 · LA PELIGROSIDAD DEL EMPLAZAMIENTO NO ES SUYA
 *     `ab` y `K` salen del Anejo 1, cosechado del WMS del IGN, y el PDF los
 *     imprime CITANDO esa procedencia (capa, licencia y sha256). Un modelo al
 *     que se le pregunta "¿qué ab tiene Lorca?" contesta un número de memoria
 *     con toda la seguridad del mundo. Si pudiera escribirlo, el documento
 *     seguiría diciendo «Anejo 1 · IGN» debajo de un valor inventado: la
 *     herramienta firmaría la alucinación. Por eso el municipio se elige en el
 *     buscador y punto — el modelo puede decir "creo que es Lorca", nunca
 *     escribir su aceleración.
 *
 * 2 · LAS DECLARACIONES LAS FIRMA EL PROYECTISTA
 *     Los requisitos (3), (4) y (5) del art. 3.5.1, la excentricidad declarada
 *     y el arriostramiento del art. 1.2.3 son JUICIOS, no datos. El PDF los
 *     recoge como declarados y se niega a exportar mientras alguno esté sin
 *     declarar. Si el asistente pudiera marcarlos, produciría una justificación
 *     que nadie ha declarado — y encima el papel diría "declarado" como si
 *     alguien lo hubiera hecho. Es exactamente el fallo que el módulo entero
 *     está construido para evitar.
 *
 * 3 · EL T_F IMPUESTO ES UN RESULTADO DE OTRO CÁLCULO
 *     El art. 3.6.2.3.2 permite justificar el período por otros medios. Eso es
 *     un dato que el proyectista TRAE de un análisis modal; no algo que se
 *     estima conversando. Y como alpha = 2,5·T_B/T_F por encima de T_B, subir
 *     T_F es la rebaja de demanda más barata y más silenciosa del módulo.
 *
 * Y como en muros de fábrica (ola 4), el MODELO ANIDADO viaja de solo lectura:
 * plantas con sus componentes de carga, estratos del perfil y planos
 * resistentes de cada dirección. El asistente los ve —y explica los resultados
 * con ellos— pero no los edita.
 *
 * QUÉ SÍ APORTA, ENTONCES
 * Las tres clasificaciones donde un modelo es genuinamente útil (importancia
 * del art. 1.2.2 a partir del uso, tipo de terreno del art. 2.4 a partir de una
 * descripción geotécnica, sistema estructural), la geometría global y los dos
 * parámetros de respuesta. Y, sobre todo, el lado de LECTURA: este módulo tiene
 * dos puertas normativas encadenadas y la pregunta cara del usuario no es "qué
 * valor pongo" sino "por qué me dice que no puedo usar el método simplificado".
 *
 * SEGURIDAD — descomposición del coeficiente sísmico, no reglas campo a campo
 * El motor calcula `s_ik = ac · alpha_i · beta · eta_ik` (art. 3.7.3). Los tres
 * primeros factores son los que el payload puede mover, así que las reglas
 * resueltas son exactamente esos tres: `ac` (importancia + terreno), `beta`
 * (Omega + mu) y `alpha` por dirección (n, H, sistema, L, B). Cada una es un
 * multiplicador real de la fuerza, y su producto es el coeficiente entero. Una
 * tabla campo a campo habría sido a la vez ruidosa (subir n con T_F por debajo
 * de T_B no cambia nada) y agujereada (el sistema estructural cambia la
 * expresión de T_F sin disparar ninguna regla escalar).
 *
 * Aparte van las PUERTAS (`puertaRisks`): que la Norma deje de ser de
 * aplicación, o que el método simplificado pase a serlo, no es una caída de
 * magnitud y ninguna función de nivel lo ve. Es el analogo de `fabricaRisks` en
 * muros de fábrica.
 */
import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import { summarizeCalcResults, type AiResultsSummary } from '../resultsSummary';
import {
  detectResolvedRisks,
  detectSafetyRisks,
  higherIsSafer,
  type AiSafetyRisk,
  type ResolvedSafetyRule,
  type SafetyRule,
} from '../safety';
import {
  FRACCION_MASA,
  coefRespuesta,
  factorAmortiguamiento,
  periodoFundamental,
  resolverEmplazamiento,
  staticForceAlpha,
} from '../../codes/seismic/ncse02';
import type {
  CategoriaMasa,
  Importancia,
  SistemaEstructural,
  TipoTerreno,
} from '../../codes/seismic/types';
import {
  defaultSeismicState,
  evaluarSismo,
  toSeismicInput,
  type SeismicEvaluation,
  type SeismicState,
} from '../../../features/seismic-ncse02/state';
import type { CheckRow } from '../../calculations/types';

// ── Catálogo del módulo ───────────────────────────────────────────────────────

const IMPORTANCIAS: readonly Importancia[] = ['moderada', 'normal', 'especial'];
const TERRENOS: readonly TipoTerreno[] = ['I', 'II', 'III', 'IV'];
const SISTEMAS: readonly SistemaEstructural[] = [
  'fabrica',
  'porticos-ha',
  'porticos-ha-pantallas',
  'porticos-acero',
  'acero-triangulado',
  'mamposteria-seco',
  'adobe',
  'tapial',
  'otro',
];

const SEISMIC_DEFAULTS: SeismicState = defaultSeismicState();

const IMPORTANCIA_LABEL: Record<Importancia, string> = {
  moderada: 'Moderada',
  normal: 'Normal',
  especial: 'Especial',
};

const TERRENO_LABEL: Record<TipoTerreno, string> = {
  I: 'I · roca compacta',
  II: 'II · roca fracturada',
  III: 'III · suelo granular medio',
  IV: 'IV · suelo blando',
};

const SISTEMA_LABEL: Record<SistemaEstructural, string> = {
  fabrica: 'Muros de fábrica',
  'porticos-ha': 'Pórticos de hormigón armado',
  'porticos-ha-pantallas': 'Pórticos de hormigón con pantallas',
  'porticos-acero': 'Pórticos de acero laminado',
  'acero-triangulado': 'Acero con planos triangulados',
  'mamposteria-seco': 'Mampostería en seco',
  adobe: 'Adobe',
  tapial: 'Tapial',
  otro: 'Otro',
};

const CATEGORIA_LABEL: Record<CategoriaMasa, string> = {
  permanente: 'permanente',
  tabiqueria: 'tabiquería',
  'uso-residencial': 'uso residencial',
  'uso-publico': 'uso público',
  'uso-aglomeracion': 'uso con aglomeración',
  'uso-almacen': 'uso almacén',
  'nieve-persistente': 'nieve persistente',
  agua: 'agua',
};

// ── Payload schema (JSON Schema canónico PLANO, todo nullable) ────────────────

export const SEISMIC_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'importancia', 'terreno_tipo', 'sistema',
    'n', 'n_total', 'H_m', 'omega_pct', 'mu',
    'L_x_m', 'B_x_m', 'L_y_m', 'B_y_m',
    'warnings',
  ],
  properties: {
    importancia: {
      type: ['string', 'null'],
      enum: [...IMPORTANCIAS, null],
      description:
        'Clasificación del art. 1.2.2 por las consecuencias de la ruina. "moderada": daño despreciable a personas y servicio (naves agrícolas, casetas sin ocupación) — la Norma NO es de aplicación. "normal": la ruina puede causar víctimas o interrumpir un servicio no imprescindible (viviendas, oficinas, comercio). "especial": la ruina interrumpe un servicio imprescindible o produce daños catastróficos (hospitales, bomberos, centrales, depósitos peligrosos) — coeficiente de riesgo rho = 1,3.',
    },
    terreno_tipo: {
      type: ['string', 'null'],
      enum: [...TERRENOS, null],
      description:
        'Tipo de terreno del art. 2.4, por velocidad de la onda de cizalla v_s. "I": roca compacta o suelo cementado muy denso, v_s > 750 m/s, C = 1,0. "II": roca fracturada o suelo granular denso / cohesivo duro, 750 >= v_s > 400, C = 1,3. "III": suelo granular de compacidad media o cohesivo firme a muy firme, 400 >= v_s > 200, C = 1,6. "IV": suelo granular suelto o cohesivo blando, v_s <= 200, C = 2,0. Sólo se aplica si el terreno está en modo "tipo tabulado": con un perfil de estratos introducido, el coeficiente C se pondera en los 30 m superiores y este campo no se aplica.',
    },
    sistema: {
      type: ['string', 'null'],
      enum: [...SISTEMAS, null],
      description:
        'Sistema estructural. Decide QUÉ EXPRESIÓN del art. 3.7.2.2 da el período fundamental: "fabrica" (muros de fábrica de ladrillo o bloques) T_F = 0,06·H·raiz(H/(2L+H))/raizL; "porticos-ha" (pórticos de hormigón sin pantallas) T_F = 0,09·n; "porticos-ha-pantallas" T_F = 0,07·n·raiz(H/(B+H)); "porticos-acero" T_F = 0,11·n; "acero-triangulado" T_F = 0,085·n·raiz(H/(B+H)). Los tres restantes —"mamposteria-seco", "adobe", "tapial"— NO tienen expresión y además el art. 1.2.3 los PROHÍBE en construcciones de importancia normal o especial cuando la Norma es de aplicación. "otro" tampoco tiene expresión: exige un T_F justificado por el proyectista.',
    },
    n: {
      type: ['number', 'null'],
      description:
        'Número de plantas SOBRE RASANTE (entero). No incluye sótanos. Es la n de las expresiones de T_F y del requisito (1) del art. 3.5.1 (debe ser inferior a veinte). Es una medida del edificio, no una variable de diseño.',
    },
    n_total: {
      type: ['number', 'null'],
      description:
        'Número TOTAL de plantas, SÓTANOS INCLUIDOS (entero). Aparece en un solo sitio de toda la Norma: la pasarela del art. 3.5.1 para edificios de pisos de importancia normal de hasta cuatro plantas en total, que levanta los requisitos (3) a (6). Un edificio de 4 plantas sobre rasante con dos sótanos tiene n = 4 y n_total = 6, y NO entra por la pasarela. Si no hay sótanos, n_total = n.',
    },
    H_m: {
      type: ['number', 'null'],
      description:
        'Altura total del edificio SOBRE RASANTE, en METROS. Requisito (2) del art. 3.5.1: debe ser inferior a sesenta metros. Es una medida del edificio.',
    },
    omega_pct: {
      type: ['number', 'null'],
      description:
        'Índice de amortiguamiento Omega, en PORCENTAJE del crítico (art. 2.5). Valores usuales: 5 % en hormigón armado y en fábrica, 4 % en acero atornillado, 2 % en acero soldado. Da nu = (5/Omega)^0,4. SUBIRLO REBAJA LA FUERZA: no es una variable de ajuste, lo fija el material y el tipo de unión.',
    },
    mu: {
      type: ['number', 'null'],
      description:
        'Coeficiente de comportamiento por ductilidad mu (art. 3.7.3.1). mu = 1 sin ductilidad, 2 ductilidad baja, 3 ductilidad alta, 4 ductilidad muy alta. Exige que el proyecto tenga REALMENTE el detalle constructivo de esa ductilidad (armado de confinamiento, uniones, jerarquía de resistencias del cap. 4). Da beta = nu/mu. SUBIRLO REBAJA LA FUERZA en proporción directa: mu = 4 en vez de 2 divide la acción sísmica por dos.',
    },
    L_x_m: {
      type: ['number', 'null'],
      description:
        'Dimensión en planta del edificio en el sentido de la oscilación X, en METROS. Interviene en la expresión (1) de T_F (muros de fábrica).',
    },
    B_x_m: {
      type: ['number', 'null'],
      description:
        'Dimensión en planta de los muros pantalla o de los planos triangulados en el sentido X, en METROS. Interviene en las expresiones (3) y (5) de T_F. Vale 0 si no hay pantallas ni triangulación.',
    },
    L_y_m: { type: ['number', 'null'], description: 'Dimensión en planta en el sentido de la oscilación Y, en METROS. Ver L_x_m.' },
    B_y_m: { type: ['number', 'null'], description: 'Dimensión de pantallas o planos triangulados en el sentido Y, en METROS. Ver B_x_m.' },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.',
    },
  },
};

// ── Prompt del módulo ─────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Acción sísmica (NCSE-02, RD 997/2002, método simplificado):
1. UNIDADES: H_m, L y B en METROS; omega_pct en PORCENTAJE (5, no 0.05); n y n_total son enteros. Las fuerzas del resultado van en kN. Añade un warning con cada conversión que hagas.
2. LA PELIGROSIDAD DEL SITIO NO LA PONES TÚ. La aceleración sísmica básica ab y el coeficiente de contribución K salen del Anejo 1 de la Norma, y esta aplicación los lee de la cartografía oficial del Instituto Geográfico Nacional. NO son campos de tu propuesta y NO los puedes escribir. Si el usuario te dice el municipio, dile que lo escriba en el buscador "Municipio" del panel izquierdo. NUNCA cites de memoria la ab de un municipio: el documento que genera esta herramienta afirma que ese valor viene del IGN, y si viene de ti, la herramienta estaría firmando un dato inventado. Di que no lo sabes y que lo busque.
3. LAS DECLARACIONES LAS FIRMA EL PROYECTISTA. Los requisitos (3) regularidad geométrica, (4) soportes continuos y (5) regularidad mecánica del art. 3.5.1, la excentricidad declarada y el arriostramiento del art. 1.2.3 son juicios del técnico, no datos, y NO son campos de tu propuesta. Puedes explicarle qué significa cada uno y en qué fijarse (entrantes y salientes en planta, retranqueos en alzado, pilares que mueren en una viga, plantas diáfanas, cambios bruscos de rigidez), pero la casilla la marca él en la sección "Declaraciones". El módulo NO calcula mientras alguna esté sin contestar, y eso es intencionado.
4. EL PERÍODO FUNDAMENTAL SE DEDUCE. T_F sale de la expresión del art. 3.7.2.2 que corresponde al sistema estructural. El art. 3.6.2.3.2 permite imponerlo por otros medios, pero eso es un resultado que el proyectista TRAE de un análisis modal, no algo que se estime conversando: no es un campo de tu propuesta. Si el usuario tiene un T_F justificado, que lo introduzca a mano en la dirección correspondiente.
5. LAS PLANTAS Y LOS PLANOS RESISTENTES SON DE SOLO LECTURA. En el estado ves "plantas" (altura, superficie y componentes de carga de cada una, con lo que está excluido de la masa sísmica) y "direcciones" (los planos resistentes con su posición x y su rigidez), para poder explicar los resultados. NO puedes modificarlos: si el usuario quiere cambiar una planta, una carga o un plano, dile que lo haga en el panel izquierdo. Y si "plantas_por_defecto" es true, lo que ves es una PLANTILLA de la aplicación (diez plantas de 300 m² inventadas), NO datos del usuario: pregúntaselos antes de dar ningún número por bueno.
6. LA MASA SÍSMICA NO ES LA COMBINACIÓN CUASIPERMANENTE. Las fracciones del art. 3.2 (permanente 1,0 · tabiquería 1,0 · almacén 1,0 · agua 1,0 · público y aglomeración 0,6 · residencial 0,5 · nieve persistente 0,5) dicen qué parte de la carga es MASA que se sacude. NO son el psi2 del CTE, que gobierna la gravedad que actúa a la vez que el sismo (art. 3.4), donde la variable desfavorable entra ENTERA. Confundirlas es el error natural de este cálculo y no lo delata ningún número raro.
7. Omega Y mu NO SON VARIABLES DE AJUSTE. Subir el amortiguamiento o la ductilidad rebaja la acción sísmica en proporción directa (beta = nu/mu). Omega lo fija el material y el tipo de unión; mu exige que el proyecto tenga de verdad el detalle constructivo del cap. 4 que da esa ductilidad. Si el edificio no cumple, la salida es más rigidez o más resistencia, no un mu mayor en el formulario.
8. LAS COMPROBACIONES QUE VES EN LOS RESULTADOS SON DE APLICABILIDAD, NO DE RESISTENCIA. Dicen si se puede usar el método simplificado, no si el edificio aguanta. Este módulo no comprueba ninguna sección: entrega el cortante basal, las fuerzas por planta y la fuerza que le toca a cada plano resistente con la torsión del art. 3.7.5. Los esfuerzos por pilar, las secciones y la ductilidad del cap. 4 son otro cálculo. Dilo si el usuario da por comprobado el edificio.
9. LAS DOS PUERTAS VAN EN ORDEN. Primero el art. 1.2.3: ¿es obligatorio aplicar la Norma? Hay tres exenciones tasadas (importancia moderada; ab < 0,04 g; importancia normal con pórticos bien arriostrados en todas las direcciones y ab < 0,08 g, salvo que el edificio pase de siete plantas y ac >= 0,08 g). Después el art. 3.5.1: ¿vale el método simplificado? Seis requisitos, más la pasarela de las cuatro plantas EN TOTAL. Que la Norma no sea obligatoria no impide calcular; lo que no hay es obligación de justificar.
10. ALCANCE: el módulo termina en la fuerza por plano resistente. No hace desplazamientos, ni los efectos de segundo orden del art. 3.8, ni la separación entre edificios del art. 4.2.5, ni nada del cap. 4.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Edificio de viviendas de 8 plantas y 24 m de altura en Lorca, pórticos de hormigón '
  + 'armado sin pantallas, sobre suelo granular de compacidad media, con un sótano de garaje.';

// ── Parseo defensivo del payload ──────────────────────────────────────────────

interface SeismicPayload {
  importancia: string | null;
  terreno_tipo: string | null;
  sistema: string | null;
  n: number | null;
  n_total: number | null;
  H_m: number | null;
  omega_pct: number | null;
  mu: number | null;
  L_x_m: number | null;
  B_x_m: number | null;
  L_y_m: number | null;
  B_y_m: number | null;
  warnings: string[];
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function parsePayload(raw: unknown): SeismicPayload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const r = raw as Record<string, unknown>;
  return {
    importancia: str(r.importancia),
    terreno_tipo: str(r.terreno_tipo),
    sistema: str(r.sistema),
    n: finiteNumber(r.n),
    n_total: finiteNumber(r.n_total),
    H_m: finiteNumber(r.H_m),
    omega_pct: finiteNumber(r.omega_pct),
    mu: finiteNumber(r.mu),
    L_x_m: finiteNumber(r.L_x_m),
    B_x_m: finiteNumber(r.B_x_m),
    L_y_m: finiteNumber(r.L_y_m),
    B_y_m: finiteNumber(r.B_y_m),
    warnings: Array.isArray(r.warnings)
      ? r.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Mapper payload → AiApplyPlan ─────────────────────────────────────────────

const LABELS = {
  importancia: 'Importancia de la construcción',
  terreno_tipo: 'Tipo de terreno',
  sistema: 'Sistema estructural',
  n: 'n · plantas sobre rasante',
  n_total: 'n total · sótanos incluidos',
  H_m: 'H · altura sobre rasante',
  omega_pct: 'Omega · amortiguamiento',
  mu: 'mu · ductilidad',
  L_x_m: 'L · dimensión en X',
  B_x_m: 'B · pantallas en X',
  L_y_m: 'L · dimensión en Y',
  B_y_m: 'B · pantallas en Y',
} as const;

type PayloadKey = keyof typeof LABELS;

const KEY_ORDER: readonly PayloadKey[] = [
  'importancia', 'terreno_tipo', 'sistema',
  'n', 'n_total', 'H_m', 'omega_pct', 'mu',
  'L_x_m', 'B_x_m', 'L_y_m', 'B_y_m',
];

const ALREADY = 'Ya coincide con el valor actual';
const EPS = 1e-9;

export const PERFIL_INERT_REASON =
  'El terreno está definido por un perfil de estratos: el coeficiente C se pondera en los '
  + '30 m superiores (art. 2.4) y el tipo tabulado no se aplica.';

// ── Seguridad ─────────────────────────────────────────────────────────────────

/**
 * Única regla ESCALAR. `n_total` no mueve ninguna fuerza: mueve una PUERTA.
 * Bajarlo a cuatro o menos mete al edificio por la pasarela del art. 3.5.1, que
 * levanta los requisitos (3) a (6) sin que nadie los cumpla. Es monótona —bajar
 * siempre abre— y por eso cabe en una regla de nivel, al revés que `n` y `H`,
 * cuyo peligro va en los dos sentidos (subirlos alarga T_F y rebaja alpha;
 * bajarlos abre los requisitos (1) y (2)). Esos dos los cubren `alpha` por el
 * lado de la fuerza y `puertaRisks` por el lado de la puerta.
 */
export const SEISMIC_SAFETY_RULES: ReadonlyArray<SafetyRule<SeismicState>> = [
  {
    field: 'nTotal',
    confirmKey: 'n_total',
    level: higherIsSafer,
    why:
      'El número total de plantas sólo interviene en la pasarela del art. 3.5.1 (edificios '
      + 'de pisos de importancia normal de hasta CUATRO plantas en total, sótanos incluidos), '
      + 'que permite usar el método simplificado sin cumplir los requisitos (3) a (6). '
      + 'Bajarlo abre esa pasarela.',
  },
];

/** Reconstruye el emplazamiento de un estado, para las reglas resueltas. */
const acDe = (s: SeismicState): number =>
  resolverEmplazamiento(toSeismicInput(s).emplazamiento).ac;

const betaDe = (s: SeismicState): number =>
  coefRespuesta(factorAmortiguamiento(s.omega), s.mu);

/** alpha del primer modo en una dirección; null si el sistema no tiene expresión de T_F. */
function alphaDe(s: SeismicState, eje: 'x' | 'y'): number | null {
  const d = s[eje];
  const TF = d.TFModo === 'manual' && d.TFManual > 0
    ? d.TFManual
    : periodoFundamental(s.sistema, { n: s.n, H: s.H, L: d.L, B: d.B });
  if (TF === null || !(TF > 0)) return null;
  const { TB } = resolverEmplazamiento(toSeismicInput(s).emplazamiento);
  return staticForceAlpha(TF, TB);
}

const ALPHA_WHY =
  'alpha es el factor espectral que multiplica la acción sísmica (art. 3.7.3). Sale del '
  + 'período fundamental T_F, y T_F de la geometría del edificio: n, H, el sistema '
  + 'estructural y las dimensiones L y B en planta. Alargar el período rebaja alpha en '
  + 'proporción a 2,5·T_B/T_F, así que un edificio declarado más alto o más flexible de lo '
  + 'que es sale con menos fuerza. Son medidas de obra, no variables de diseño.';

/**
 * Las tres magnitudes resueltas SON los tres factores escribibles del coeficiente
 * sísmico `s_ik = ac · alpha_i · beta · eta_ik` (art. 3.7.3). No se solapan entre
 * sí salvo por T_B, que depende del terreno: un terreno rebajado baja `ac` Y baja
 * `alpha`, y salen las dos filas. No es doble reporte — el terreno muerde
 * realmente dos veces, y esconder una de las dos daría a entender lo contrario.
 */
export const SEISMIC_RESOLVED_RULES: ReadonlyArray<ResolvedSafetyRule<SeismicState>> = [
  {
    id: 'ac',
    label: 'ac · aceleración sísmica de cálculo',
    resolve: acDe,
    level: higherIsSafer,
    format: (v) => `${v.toFixed(4)} g`,
    why:
      'ac = S · rho · ab (art. 2.2) es la demanda del emplazamiento. Rebajarla cambiando la '
      + 'importancia de la construcción (art. 1.2.2) o el tipo de terreno (art. 2.4) no hace '
      + 'el edificio más seguro: cambia lo que se declara de él. El uso lo fija el proyecto y '
      + 'el terreno el estudio geotécnico.',
    fields: ['importancia', 'terreno', 'terrenoModo'],
    confirmKeys: ['importancia', 'terreno_tipo'],
  },
  {
    id: 'beta',
    label: 'beta · coeficiente de respuesta',
    resolve: betaDe,
    level: higherIsSafer,
    format: (v) => v.toFixed(3),
    why:
      'beta = nu/mu (art. 3.7.3.1) multiplica la acción sísmica entera. Subir el '
      + 'amortiguamiento Omega o la ductilidad mu la rebaja en proporción directa. Omega lo '
      + 'fija el material y el tipo de unión; mu exige que el proyecto tenga REALMENTE el '
      + 'detalle constructivo del cap. 4 que da esa ductilidad. Ninguno de los dos es una '
      + 'variable de ajuste.',
    fields: ['omega', 'mu'],
    confirmKeys: ['omega_pct', 'mu'],
  },
  {
    id: 'alpha_x',
    label: 'alpha · factor espectral en X',
    resolve: (s) => alphaDe(s, 'x'),
    level: higherIsSafer,
    format: (v) => v.toFixed(3),
    why: ALPHA_WHY,
    fields: ['n', 'H', 'sistema', 'terreno'],
    confirmKeys: ['n', 'H_m', 'sistema', 'L_x_m', 'B_x_m'],
  },
  {
    id: 'alpha_y',
    label: 'alpha · factor espectral en Y',
    resolve: (s) => alphaDe(s, 'y'),
    level: higherIsSafer,
    format: (v) => v.toFixed(3),
    why: ALPHA_WHY,
    fields: ['n', 'H', 'sistema', 'terreno'],
    confirmKeys: ['n', 'H_m', 'sistema', 'L_y_m', 'B_y_m'],
  },
];

/**
 * Riesgos de PUERTA — el análogo de `fabricaRisks` en muros de fábrica.
 *
 * Que la Norma deje de ser de aplicación, o que el método simplificado pase a
 * serlo, no es una caída de magnitud: ninguna función de nivel lo ve, y son los
 * dos cambios más graves que puede provocar una propuesta. Un edificio que pasa
 * a exento deja de tener justificación sísmica, y punto.
 *
 * Sin gate anti-ruido a propósito: abrir una puerta no tiene «primer relleno
 * legítimo». Si la propuesta cambia el veredicto de aplicabilidad, el usuario
 * tiene que verlo la primera vez y todas.
 */
export function puertaRisks(current: SeismicState, final: SeismicState): AiSafetyRisk[] {
  const antes = evaluarSismo(current).aplicabilidad;
  const despues = evaluarSismo(final).aplicabilidad;
  const risks: AiSafetyRisk[] = [];

  if (antes.obligatoriedad.estado === 'obligatoria' && despues.obligatoriedad.estado === 'exenta') {
    risks.push({
      field: 'puerta_obligatoriedad',
      label: 'Obligatoriedad de la NCSE-02 (art. 1.2.3)',
      before: 'La Norma ES de aplicación',
      after: 'La Norma NO es de aplicación',
      why:
        'Con este cambio el edificio queda EXENTO y desaparece la justificación sísmica '
        + 'entera. Las tres exenciones del art. 1.2.3 son tasadas y dependen del uso real de '
        + 'la construcción y de la aceleración del sitio, no de lo que convenga al cálculo.',
    });
  }

  const antesMet = antes.metodoSimplificado?.aplicable === true;
  const despuesMet = despues.metodoSimplificado?.aplicable === true;
  if (!antesMet && despuesMet && despues.obligatoriedad.estado === 'obligatoria') {
    risks.push({
      field: 'puerta_metodo_simplificado',
      label: 'Ámbito del método simplificado (art. 3.5.1)',
      before: 'El método simplificado NO era aplicable',
      after: 'El método simplificado pasa a ser aplicable',
      why:
        'Este cambio abre una puerta que estaba cerrada: el edificio pasa a calcularse por '
        + 'el método simplificado sin que nadie haya modificado el edificio. Comprueba que '
        + 'los datos nuevos describen la obra real y no un edificio que encaje en el método.',
    });
  }

  return risks;
}

// ── buildPlan ─────────────────────────────────────────────────────────────────

function rangeReason(value: number, min: number, max: number, unit: string): string {
  return `El valor ${value}${unit} está fuera del rango admitido (${min}–${max}${unit})`;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function buildSeismicPlan(
  x: SeismicPayload,
  current: SeismicState,
  confirmed: ReadonlySet<string> = new Set(),
): AiApplyPlan<SeismicState> {
  const fields: Partial<SeismicState> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const warnings: string[] = [...x.warnings];

  function skip(key: PayloadKey, reason: string): void {
    skipped.push({ field: key, label: LABELS[key], reason });
  }

  function apply<K extends keyof SeismicState>(
    key: PayloadKey,
    field: K,
    value: SeismicState[K],
    before: string,
    after: string,
  ): void {
    fields[field] = value;
    changes.push({ field, label: LABELS[key], before, after });
  }

  /** Enumerado: fuera del catálogo → skip; igual al vigente → skip; si no, apply. */
  function applyEnum<T extends string, K extends keyof SeismicState>(
    key: PayloadKey,
    field: K,
    raw: string | null,
    catalogo: readonly T[],
    vigente: T,
    label: Record<T, string>,
  ): void {
    if (raw === null) return;
    if (!catalogo.includes(raw as T)) {
      skip(key, `El valor "${raw}" no está en el catálogo (${catalogo.join(', ')})`);
      return;
    }
    const v = raw as T;
    if (v === vigente) skip(key, ALREADY);
    else apply(key, field, v as unknown as SeismicState[K], label[vigente], label[v]);
  }

  /** Numérico continuo con rango y formato. */
  function applyNumber(
    key: PayloadKey,
    value: number | null,
    min: number,
    max: number,
    unit: string,
    vigente: number,
    escribir: (v: number) => void,
    fmt: (v: number) => string,
  ): void {
    if (value === null) return;
    if (value < min || value > max) {
      skip(key, rangeReason(value, min, max, unit));
      return;
    }
    const v = round2(value);
    if (Math.abs(v - vigente) <= EPS) {
      skip(key, ALREADY);
      return;
    }
    escribir(v);
    changes.push({ field: key, label: LABELS[key], before: fmt(vigente), after: fmt(v) });
  }

  /** Entero: se exige entero de verdad, no un 8,4 redondeado en silencio. */
  function applyEntero(
    key: PayloadKey,
    field: 'n' | 'nTotal',
    value: number | null,
    min: number,
    max: number,
  ): void {
    if (value === null) return;
    if (!Number.isInteger(value)) {
      skip(key, `El número de plantas tiene que ser entero (llegó ${value})`);
      return;
    }
    if (value < min || value > max) {
      skip(key, rangeReason(value, min, max, ' plantas'));
      return;
    }
    if (value === current[field]) skip(key, ALREADY);
    else apply(key, field, value, `${current[field]}`, `${value}`);
  }

  // ── Emplazamiento ──────────────────────────────────────────────────────────
  applyEnum('importancia', 'importancia', x.importancia, IMPORTANCIAS, current.importancia, IMPORTANCIA_LABEL);

  if (x.terreno_tipo !== null && current.terrenoModo === 'perfil') {
    // El perfil de estratos manda: escribir el tipo tabulado no haría nada y
    // dejaría al usuario creyendo que sí.
    skip('terreno_tipo', PERFIL_INERT_REASON);
  } else {
    applyEnum('terreno_tipo', 'terreno', x.terreno_tipo, TERRENOS, current.terreno, TERRENO_LABEL);
  }

  // ── Estructura ─────────────────────────────────────────────────────────────
  applyEnum('sistema', 'sistema', x.sistema, SISTEMAS, current.sistema, SISTEMA_LABEL);

  applyEntero('n', 'n', x.n, 1, 200);
  applyEntero('n_total', 'nTotal', x.n_total, 1, 200);

  applyNumber('H_m', x.H_m, 0.1, 500, ' m', current.H, (v) => { fields.H = v; }, (v) => `${v} m`);
  applyNumber('omega_pct', x.omega_pct, 0.1, 30, ' %', current.omega, (v) => { fields.omega = v; }, (v) => `${v} %`);
  applyNumber('mu', x.mu, 1, 6, '', current.mu, (v) => { fields.mu = v; }, (v) => `${v}`);

  // ── Direcciones: sólo L y B. Los planos resistentes son de solo lectura. ────
  for (const eje of ['x', 'y'] as const) {
    const dir = current[eje];
    const keyL = (eje === 'x' ? 'L_x_m' : 'L_y_m') as PayloadKey;
    const keyB = (eje === 'x' ? 'B_x_m' : 'B_y_m') as PayloadKey;
    const valL = eje === 'x' ? x.L_x_m : x.L_y_m;
    const valB = eje === 'x' ? x.B_x_m : x.B_y_m;

    applyNumber(keyL, valL, 0.1, 500, ' m', dir.L,
      (v) => { fields[eje] = { ...(fields[eje] ?? dir), L: v }; },
      (v) => `${v} m`);
    applyNumber(keyB, valB, 0, 500, ' m', dir.B,
      (v) => { fields[eje] = { ...(fields[eje] ?? dir), B: v }; },
      (v) => `${v} m`);
  }

  // ── Coherencia entre `n` y la tabla de plantas ─────────────────────────────
  // `n` alimenta T_F y el requisito (1); la MASA sale de `plantas`, que es de
  // solo lectura para el asistente. Son dos campos independientes del estado, y
  // que se separen no lo detecta ningún cálculo: T_F sube y la masa se queda.
  const nFinal = fields.n ?? current.n;
  if (nFinal !== current.plantas.length) {
    warnings.push(
      `n = ${nFinal} pero la tabla tiene ${current.plantas.length} plantas. El período `
      + 'fundamental y el requisito (1) del art. 3.5.1 usan n; la masa sísmica sale de la '
      + 'tabla. Añade o quita plantas en el panel para que cuadren.',
    );
  }

  // ── Riesgos ────────────────────────────────────────────────────────────────
  const final = { ...current, ...fields } as SeismicState;
  const risks: AiSafetyRisk[] = [
    ...detectSafetyRisks(SEISMIC_SAFETY_RULES, changes, fields, current, SEISMIC_DEFAULTS, confirmed),
    ...detectResolvedRisks(SEISMIC_RESOLVED_RULES, fields, current, SEISMIC_DEFAULTS, confirmed),
    ...puertaRisks(current, final),
  ];

  return { fields, changes, skipped, notFound: [], warnings, risks };
}

// ── Snapshot del estado ───────────────────────────────────────────────────────

const SNAPSHOT_READ: Record<PayloadKey, (c: SeismicState) => number | string> = {
  importancia: (c) => c.importancia,
  terreno_tipo: (c) => c.terreno,
  sistema: (c) => c.sistema,
  n: (c) => c.n,
  n_total: (c) => c.nTotal,
  H_m: (c) => c.H,
  omega_pct: (c) => c.omega,
  mu: (c) => c.mu,
  L_x_m: (c) => c.x.L,
  B_x_m: (c) => c.x.B,
  L_y_m: (c) => c.y.L,
  B_y_m: (c) => c.y.B,
};

/** Plantas → contexto de solo lectura, con lo EXCLUIDO marcado. */
function plantasContext(c: SeismicState): unknown[] {
  return c.plantas.map((p) => ({
    nombre: p.nombre,
    h_m: p.h,
    ...(p.pesoManual
      ? { P_kN: p.P ?? 0, peso_manual: true }
      : {
          area_m2: p.area ?? 0,
          cargas: (p.componentes ?? []).map((k) => ({
            categoria: CATEGORIA_LABEL[k.categoria],
            q_kNm2: k.q,
            fraccion_art_3_2: FRACCION_MASA[k.categoria],
            ...(k.excluida ? { excluida_por_el_proyectista: true } : {}),
          })),
        }),
  }));
}

/** Direcciones → contexto de solo lectura de los planos resistentes. */
function direccionesContext(c: SeismicState): unknown {
  const uno = (eje: 'x' | 'y') => {
    const d = c[eje];
    return {
      L_m: d.L,
      B_m: d.B,
      TF: d.TFModo === 'manual' && d.TFManual > 0
        ? { modo: 'impuesto por el proyectista (art. 3.6.2.3.2)', TF_s: d.TFManual }
        : { modo: 'deducido del art. 3.7.2.2' },
      planos_resistentes: d.elementos.map((e) => ({ x_m: e.x, rigidez: e.k })),
    };
  };
  return { X: uno('x'), Y: uno('y') };
}

/**
 * El emplazamiento viaja RESUELTO y de solo lectura. `ab` y `K` están aquí para
 * que el modelo pueda explicar el resultado, no para que los proponga: no son
 * claves del payload y el schema es `additionalProperties:false`.
 */
function emplazamientoContext(c: SeismicState): unknown {
  const e = resolverEmplazamiento(toSeismicInput(c).emplazamiento);
  return {
    municipio: c.municipioNombre || '(entrada manual, sin municipio del Anejo 1)',
    ...(c.municipioIne ? { ine: c.municipioIne } : {}),
    ab_g: e.ab,
    K: e.K,
    procedencia_ab_K: c.municipioIne
      ? 'Anejo 1 de la NCSE-02, cartografía del Instituto Geográfico Nacional. SOLO LECTURA.'
      : 'Introducidos a mano por el proyectista. SOLO LECTURA.',
    rho: e.rho,
    C: e.C,
    S: e.S,
    ac_g: e.ac,
    T_A_s: e.TA,
    T_B_s: e.TB,
  };
}

/** Declaraciones del proyectista — de solo lectura, y con su estado real. */
function declaracionesContext(c: SeismicState): unknown {
  const tri = (v: boolean | null) => (v === null ? 'SIN DECLARAR' : v ? 'sí' : 'no');
  return {
    porticos_bien_arriostrados_art_1_2_3: tri(c.porticosBienArriostrados),
    regularidad_geometrica_req_3: tri(c.regularidadGeometrica),
    soportes_continuos_req_4: tri(c.soportesContinuos),
    regularidad_mecanica_req_5: tri(c.regularidadMecanica),
    excentricidad_declarada_req_6: tri(c.excentricidadDeclarada),
    nota: 'Las firma el proyectista en el panel. NO son campos de tu propuesta.',
  };
}

/**
 * ¿Sigue el usuario con la plantilla de fábrica? Se compara la tabla entera —
 * alturas, superficies y componentes—, no sólo su longitud: diez plantas con
 * las cargas cambiadas ya son datos del usuario.
 */
function plantasSonDeFabrica(c: SeismicState): boolean {
  return JSON.stringify(plantasContext(c)) === JSON.stringify(plantasContext(SEISMIC_DEFAULTS));
}

function buildSnapshot(c: SeismicState): string {
  const valores: Record<string, unknown> = {};
  const sinConfirmar: PayloadKey[] = [];
  for (const key of KEY_ORDER) {
    const read = SNAPSHOT_READ[key];
    valores[key] = read(c);
    if (read(c) === read(SEISMIC_DEFAULTS)) sinConfirmar.push(key);
  }
  // Contexto de SOLO LECTURA, dentro de `valores`: `decorateSnapshot` reconstruye
  // el objeto quedándose únicamente con valores/sin_confirmar/pendientes_de_aplicar,
  // de modo que una clave hermana de primer nivel desaparecería en silencio en
  // cuanto el modelo hiciera su primera propuesta.
  valores.emplazamiento = emplazamientoContext(c);
  valores.terreno_modo = c.terrenoModo === 'perfil' ? 'perfil de estratos' : 'tipo tabulado';
  if (c.terrenoModo === 'perfil') {
    valores.estratos = c.estratos.map((e) => ({ C: e.C, espesor_m: e.espesor }));
  }
  valores.plantas = plantasContext(c);
  valores.plantas_por_defecto = plantasSonDeFabrica(c);
  valores.direcciones = direccionesContext(c);
  valores.declaraciones = declaracionesContext(c);
  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

const ALCANCE_LINEA =
  'ATENCION: estas comprobaciones son de APLICABILIDAD (¿se puede usar el método '
  + 'simplificado?), NO de resistencia. Este módulo no comprueba ninguna sección: entrega '
  + 'las fuerzas. Que salga CUMPLE no significa que el edificio aguante el sismo.';

/** Requisitos del art. 3.5.1 → filas de comprobación, con su vía. */
function requisitosChecks(ev: SeismicEvaluation): CheckRow[] {
  const met = ev.aplicabilidad.metodoSimplificado;
  if (!met) return [];
  return met.requisitos.map((r) => ({
    id: `art351-${r.id}`,
    description: `Aplicabilidad art. 3.5.1 (${r.id}) — ${r.texto}`,
    valueStr: r.detalle ?? (r.tipo === 'declarado' ? 'declarado por el proyectista' : ''),
    utilization: r.cumple === true ? 0 : 1.2,
    status: r.cumple === true ? ('ok' as const) : ('fail' as const),
    article: `NCSE-02 art. 3.5.1 (${r.id}) · ${r.tipo === 'declarado' ? 'DECLARADO' : 'comprobado'}`,
    tag: r.tipo === 'declarado' ? 'DECLARADO' : undefined,
  }));
}

/**
 * `SeismicEvaluation` → resumen para el prompt.
 *
 * Discriminador de «no hay nada que interpretar»: la puerta SIN RESOLVER —falta
 * ac, o quedan requisitos sin declarar—. Es el mismo criterio que niega el PDF
 * (`seismicPdfBlocker`), y por la misma razón: un veredicto sobre una puerta a
 * medio resolver no significa nada. Los demás estados sí producen resumen, el de
 * exención incluido: «la Norma no rige» es una respuesta completa.
 */
export function summarizeSeismicResults(ev: SeismicEvaluation): AiResultsSummary {
  const { obligatoriedad: obl, metodoSimplificado: met, puedeCalcular } = ev.aplicabilidad;
  const e = ev.emplazamiento;

  if (obl.estado === 'indeterminada') {
    return summarizeCalcResults({
      valid: false,
      error:
        'Todavía no se puede decidir si la NCSE-02 es de aplicación: falta '
        + `${obl.falta ?? 'un dato del emplazamiento'}. Es la contraexcepción del art. 1.2.3 `
        + '(más de siete plantas con ac >= 0,08 g), que necesita el emplazamiento resuelto.',
      checks: [],
    });
  }

  const sinDeclarar = (met?.requisitos ?? []).filter((r) => r.cumple === null).map((r) => r.id);
  if (sinDeclarar.length > 0) {
    return summarizeCalcResults({
      valid: false,
      error:
        `Quedan sin declarar los requisitos (${sinDeclarar.join(', ')}) del art. 3.5.1. `
        + 'Son juicios del proyectista y los marca él en la sección "Declaraciones" del '
        + 'panel: el módulo no calcula mientras alguno esté sin contestar, y tú no puedes '
        + 'declararlos por él.',
      checks: [],
    });
  }

  const emplaz =
    `Emplazamiento: ab = ${e.ab.toFixed(2)} g · K = ${e.K.toFixed(1)} · rho = ${e.rho.toFixed(1)} · `
    + `C = ${e.C.toFixed(2)} · S = ${e.S.toFixed(4)} · ac = ${e.ac.toFixed(4)} g · `
    + `T_A = ${e.TA.toFixed(3)} s · T_B = ${e.TB.toFixed(3)} s`;

  if (obl.estado === 'exenta') {
    const motivo: Record<string, string> = {
      'importancia-moderada': 'la construcción es de importancia moderada (art. 1.2.2)',
      'ab-inferior-0.04g': 'ab < 0,04 g',
      'porticos-arriostrados-ab-inferior-0.08g':
        'importancia normal con pórticos bien arriostrados y ab < 0,08 g',
    };
    return summarizeCalcResults(
      {
        valid: true,
        checks: [
          {
            id: 'art123',
            description: 'Obligatoriedad de la NCSE-02',
            valueStr: 'EXENTA',
            utilization: 0,
            status: 'ok',
            article: 'NCSE-02 art. 1.2.3',
            neutral: true,
            tag: 'NO OBLIGATORIA',
          },
        ],
      },
      [
        `La NCSE-02 NO es de aplicación obligatoria: ${motivo[obl.motivo ?? ''] ?? 'exenta por el art. 1.2.3'}.`,
        'Que no sea obligatoria no impide calcular la acción sísmica si el proyectista quiere; lo que no hay es obligación de justificarla.',
        emplaz,
        ...obl.avisos.map((a) => `Aviso (art. ${a.articulo}): ${a.texto}`),
      ],
    );
  }

  const checks = requisitosChecks(ev);
  const extras: string[] = [emplaz];

  if (met?.via === 'pasarela-4-plantas') {
    extras.push(
      'El edificio entra por la PASARELA del art. 3.5.1 (edificios de pisos de importancia '
      + 'normal de hasta cuatro plantas EN TOTAL, sótanos incluidos) sin cumplir todos los '
      + 'requisitos. Se requiere un estudio especial de los efectos de torsión.',
    );
  }

  const r = ev.resultado;
  if (!puedeCalcular || !r) {
    extras.push(
      met?.bloqueo
        ?? 'El método simplificado no es aplicable; el edificio requiere un análisis modal completo (art. 3.6.2).',
      'NO hay acción sísmica calculada: este módulo sólo implementa el método simplificado.',
    );
    extras.push(...ev.aplicabilidad.avisos.map((a) => `Aviso (art. ${a.articulo}): ${a.texto}`));
    extras.push(ALCANCE_LINEA);
    return summarizeCalcResults({ valid: true, checks }, extras);
  }

  const dir = (eje: 'x' | 'y') => {
    const d = r[eje];
    return (
      `Dirección ${eje.toUpperCase()}: T_F = ${d.TF.toFixed(3)} s`
      + `${d.TFManual ? ' (impuesto)' : ''} · ${d.nModos} modo(s) · `
      + `cortante basal = ${Math.round(d.cortanteBasal)} kN `
      + `(${((d.cortanteBasal / Math.max(1e-9, r.pesoSismico)) * 100).toFixed(1)} % del peso sísmico) · `
      + `masa movilizada ${(d.participacionTotal * 100).toFixed(1)} % · L_e = ${d.Le.toFixed(2)} m`
    );
  };

  extras.push(
    `Peso sísmico total: Sum P_k = ${Math.round(r.pesoSismico)} kN en ${r.plantas.length} plantas (art. 3.2).`,
    `nu = ${r.nu.toFixed(3)} (art. 2.5) · beta = nu/mu = ${r.beta.toFixed(3)} (art. 3.7.3.1)`,
    dir('x'),
    dir('y'),
  );

  const negativas = (['x', 'y'] as const).filter((eje) => r[eje].Fk.some((f) => f < 0));
  if (negativas.length > 0) {
    extras.push(
      `Hay fuerzas de planta NEGATIVAS en ${negativas.map((s) => s.toUpperCase()).join(' y ')}. `
      + 'No es un error: el cortante de planta se combina por SRSS (art. 3.6.2.4), que destruye '
      + 'el signo, y la diferencia V_k − V_k+1 no tiene por qué ser monótona.',
    );
  }

  extras.push(...r.avisos.map((a) => `Aviso (art. ${a.articulo}): ${a.texto}`));
  extras.push(...ev.aplicabilidad.avisos.map((a) => `Aviso (art. ${a.articulo}): ${a.texto}`));
  extras.push(ALCANCE_LINEA);

  return summarizeCalcResults({ valid: true, checks }, extras);
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const seismicNCSE02Adapter: AiModuleAdapter<SeismicState> = {
  id: 'seismic-ncse02',
  label: 'Acción sísmica NCSE-02',
  payloadSchema: SEISMIC_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  snapshot: buildSnapshot,
  // `system` no se usa: este módulo no ofrece sistema técnico en ningún sitio
  // (ni pantalla ni PDF), y convertir aquí enseñaría números que el usuario no
  // ve en ninguna otra parte.
  buildPlan: (payload, current, _system, confirmed) =>
    buildSeismicPlan(parsePayload(payload), current, confirmed),
};
