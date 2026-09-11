/**
 * Adapter del asistente IA para el módulo «Viento y nieve» (ola 8).
 *
 * El tercero de la ola y el que tiene la exclusión más nítida de los tres.
 *
 * LA ZONA EÓLICA Y LA DE CLIMA INVERNAL NO SON SUYAS
 * Salen de los mapas D.1 y E.2 del DB SE-AE, y esta aplicación las resuelve a
 * partir de la PROVINCIA con la tabla de `lib/acciones/provincias`. Un modelo
 * al que se le pregunta «¿en qué zona eólica está Ronda?» contesta una letra de
 * memoria con toda la seguridad del mundo, y aquí esa letra decide la presión
 * dinámica de todo el edificio. Así que los dos campos de zona quedan FUERA del
 * payload: existen en el estado como forzado del usuario —los mapas van por
 * líneas y no por provincias, y quien sabe que su municipio está al otro lado
 * de la frontera tiene que poder decirlo— pero esa es una decisión que firma el
 * proyectista en el panel, no una conversación. Es exactamente la doctrina de
 * la `ab` del IGN en el sísmico.
 *
 * LA PROVINCIA SÍ, Y AQUÍ ESTÁ LA DIFERENCIA CON CARGAS POR PLANTA
 * En cargas por planta la provincia se dejó fuera porque no entra en el
 * cálculo: sólo se imprime. Aquí es la ENTRADA PRINCIPAL —sin ella no hay zona,
 * y sin zona no hay nada que calcular—, y elegirla no es citar una norma de
 * memoria sino identificar una división administrativa. Viaja por su código
 * INE, en un enum de los 52, para que el modelo no pueda inventarse uno.
 *
 * sk Y qb TAMPOCO SE CITAN
 * Los dos tienen modo «un valor propio» para quien trae una ordenanza municipal
 * o un estudio de viento, y ese campo SÍ está en el payload. Pero se escribe
 * sólo con el número que dé el usuario: la tabla 3.8, la E.2 y el mapa D.1 los
 * resuelve el motor, y un sk «estimado para 800 m» es la misma alucinación con
 * barniz normativo que la nieve inventada en cargas por planta.
 *
 * SEGURIDAD — las acciones resueltas, no los campos
 * Lo que este módulo entrega son fuerzas y cargas: la fuerza total por
 * dirección y la carga de nieve de cada faldón. Una tabla de reglas campo a
 * campo sería ciega a lo que de verdad las mueve —bajar el grado de aspereza de
 * I a V rebaja ce en todas las plantas sin tocar ningún número visible—, así
 * que el detector evalúa el estado antes y después y compara qb, la F total de
 * cada dirección, la sk efectiva y el qn de cada faldón. Aparte van los
 * apagados: quitar el viento o la nieve del cálculo no es una caída de
 * magnitud y ninguna función de nivel lo ve.
 *
 * El gate de los riesgos escalares es propio por lo mismo que en los otros dos
 * de la ola: las claves de primer nivel del estado son objetos, y el gate
 * genérico de `detectResolvedRisks` los compara por identidad.
 */

import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import type { AiResultsSummary } from '../resultsSummary';
import { higherIsSafer, type AiSafetyRisk, type ResolvedSafetyRule, type SafetyRule } from '../safety';
import type { UnitSystem } from '../../units/types';
import {
  ORDEN_ASPEREZAS,
  PROVINCIAS,
  QB_SIMPLIFICADO,
  type ExposicionNieve,
  type GradoAspereza,
  type SuperficieExterior,
} from '../../acciones';
import {
  ALTURA_PLANTA_TIPO,
  type AreaModo,
  type EjeCumbrera,
  type LimahoyaUI,
  type QbModo,
  type SkModo,
} from '../../../features/viento-nieve/catalogos';
import {
  alturaCoronacionEfectiva,
  cotasPlantas,
  defaultVientoNieveState,
  esEstadoInicial,
  evaluar,
  nuevoId,
  zonasEfectivas,
  type Evaluacion,
  type FaldonUI,
  type PlantaUI,
  type VientoNieveState,
} from '../../../features/viento-nieve/state';

// ── Catálogo del módulo ──────────────────────────────────────────────────────

const INES: readonly string[] = PROVINCIAS.map((p) => p.ine);
const ASPEREZAS: readonly GradoAspereza[] = ORDEN_ASPEREZAS;
const SUPERFICIES: readonly SuperficieExterior[] = ['rugosa', 'lisa', 'muyRugosa'];
const QB_MODOS: readonly QbModo[] = ['zona', 'simplificado', 'manual'];
const SK_MODOS: readonly SkModo[] = ['auto', 'manual'];
const EXPOSICIONES: readonly ExposicionNieve[] = ['normal', 'protegida', 'expuesta'];
const CUMBRERAS: readonly EjeCumbrera[] = ['x', 'y'];
const AREA_MODOS: readonly AreaModo[] = ['zona', 'local', 'propia'];
const LIMAHOYAS: readonly LimahoyaUI[] = ['ninguna', 'contrario', 'mismoSentido', 'cambioNivel'];

/** «29 Málaga; 09 Burgos; …» — para que el modelo vea el código de cada provincia. */
const listaProvincias = (): string =>
  [...PROVINCIAS]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((p) => `"${p.ine}" ${p.nombre}`)
    .join('; ');

const D = defaultVientoNieveState();

// ── Payload schema ───────────────────────────────────────────────────────────
//
// Presupuesto de uniones Anthropic: 5 anulables de primer nivel + la unión de
// `proposal` del envelope = 6, sobre un tope de 16. `plantas` y `faldones` van
// SUELTOS en vez de dentro de sus bloques a propósito: son lo que más se
// corrige durante la entrevista, y meterlos dentro obligaría a reenviar el
// bloque entero para mover una altura.

export const VIENTO_NIEVE_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['emplazamiento', 'viento', 'plantas', 'nieve', 'faldones', 'warnings'],
  properties: {
    emplazamiento: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['provincia_ine', 'municipio', 'altitud_m', 'es_capital'],
      description: 'Dónde está la obra. De la PROVINCIA salen la zona eólica (mapa D.1) y la de clima invernal (mapa E.2); de la ALTITUD, la carga de nieve. null = sin cambio.',
      properties: {
        provincia_ine: {
          type: 'string',
          enum: [...INES],
          description: `Código INE de la provincia, dos dígitos: ${listaProvincias()}. Eliges la PROVINCIA; la zona eólica y la de clima invernal las pone la aplicación con los mapas del DB. NO digas tú en qué zona está un municipio.`,
        },
        municipio: {
          type: 'string',
          description: 'Nombre del municipio. Sólo se imprime y viaja en la publicación; no entra en el cálculo salvo a través de "es_capital".',
        },
        altitud_m: {
          type: 'number',
          description: 'Altitud del emplazamiento sobre el nivel del mar, METROS. La carga de nieve sube con ella (tabla E.2). Por encima de lo tabulado para su zona, la norma remite a la ordenanza municipal (art. 3.5.2-3) y hay que dar un valor propio.',
        },
        es_capital: {
          type: 'boolean',
          description: 'true SÓLO si la obra está en la capital de provincia: entonces la carga de nieve sale de la tabla 3.8, que da el valor de la capital con su altitud, en vez de la tabla E.2 por zona y altitud. No lo marques por estar "cerca" de la capital.',
        },
      },
    },
    viento: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['activo', 'qb_modo', 'qb_manual_kNm2', 'aspereza', 'superficie', 'dimension_x_m', 'dimension_y_m', 'cubierta', 'paramentos'],
      description: 'El bloque de viento, entero. Mándalo SÓLO si el enunciado habla del viento, del entorno o de la forma del edificio; si no, null.',
      properties: {
        activo: {
          type: 'boolean',
          description: 'false apaga el cálculo de viento por completo: el documento deja de decir nada de él. Sólo se apaga cuando el viento se trata fuera de esta herramienta.',
        },
        qb_modo: {
          type: 'string',
          enum: [...QB_MODOS],
          description: 'De dónde sale la presión dinámica qb. "zona": la del mapa D.1 (0,42, 0,45 o 0,52 kN/m² según zona A, B o C), que es lo que el DB recomienda y lo normal. "simplificado": 0,5 kN/m² para cualquier punto del territorio (art. 3.3.2) — OJO, queda POR DEBAJO en la zona C. "manual": un valor propio de un estudio de viento.',
        },
        qb_manual_kNm2: {
          type: 'number',
          description: 'Presión dinámica adoptada, kN/m². SÓLO cuenta con qb_modo = "manual", y sólo se escribe con el número que dé el usuario: la qb de una zona NO se cita de memoria, la pone la aplicación.',
        },
        aspereza: {
          type: 'string',
          enum: [...ASPEREZAS],
          description: 'Grado de aspereza del entorno (tabla 3.4 / D.2), en orden de MÁS a MENOS expuesto: "I" borde del mar o de un lago; "II" campo llano y despejado; "III" campo con obstáculos sueltos; "IV" pueblo, ciudad, polígono o bosque, que es el caso habitual en edificación; "V" centro de una gran ciudad con edificios en altura. Bajarlo de I hacia V rebaja el coeficiente de exposición de TODAS las plantas.',
        },
        superficie: {
          type: 'string',
          enum: [...SUPERFICIES],
          description: 'Cómo es la superficie exterior, para el rozamiento del art. 3.3.2-3: "rugosa" hormigón, revoco o ladrillo (0,02), que es lo habitual; "lisa" acero, aluminio o vidrio (0,01); "muyRugosa" chapa grecada, nervaduras o pliegues (0,04).',
        },
        dimension_x_m: { type: 'number', description: 'Dimensión del edificio en planta según el eje X, METROS.' },
        dimension_y_m: { type: 'number', description: 'Dimensión del edificio en planta según el eje Y, METROS.' },
        cubierta: {
          type: 'object',
          additionalProperties: false,
          required: ['activa', 'pendiente_grados', 'cumbrera', 'altura_coronacion_m', 'area_modo', 'area_propia_m2'],
          description: 'Cubierta a DOS AGUAS (Anejo D.6). La mayoría de los edificios de pisos van con cubierta plana y esto va apagado.',
          properties: {
            activa: { type: 'boolean', description: 'true si la cubierta es a dos aguas y se quieren sus zonas de presión. false = cubierta plana.' },
            pendiente_grados: { type: 'number', description: 'Pendiente de los faldones, GRADOS. Negativa si bajan hacia el centro (cubierta a dos aguas invertida).' },
            cumbrera: {
              type: 'string',
              enum: [...CUMBRERAS],
              description: '"x" la cumbrera corre a lo largo del lado X y los faldones vierten a las fachadas Y; "y" al revés.',
            },
            altura_coronacion_m: {
              type: 'number',
              description: 'Altura de coronación sobre rasante, METROS. Pon 0 para que la calcule la aplicación con el último forjado más lo que sube el faldón, que es lo normal.',
            },
            area_modo: {
              type: 'string',
              enum: [...AREA_MODOS],
              description: 'Qué área de influencia manda en el coeficiente (Anejo D.3-3): "zona" la estructura de la cubierta —cerchas, pórticos, correas principales—, que es lo habitual; "local" correas, paneles y anclajes de hasta 1 m², el coeficiente más desfavorable; "propia" un elemento con su área tecleada.',
            },
            area_propia_m2: { type: 'number', description: 'Área de asignación de carga del elemento, m². SÓLO con area_modo = "propia"; entre 1 y 10 m² la norma interpola.' },
          },
        },
        paramentos: {
          type: 'object',
          additionalProperties: false,
          required: ['activos', 'area_modo', 'area_propia_m2'],
          description: 'Zonas de presión de las FACHADAS (tabla D.3), para las comprobaciones locales de cerramiento. Opcional.',
          properties: {
            activos: { type: 'boolean', description: 'true para calcular las zonas de las fachadas.' },
            area_modo: {
              type: 'string',
              enum: [...AREA_MODOS],
              description: 'Igual que en la cubierta, con las palabras de fachada: "zona" cerramientos grandes; "local" carpinterías, aplacados y anclajes de hasta 1 m²; "propia" un elemento con su área.',
            },
            area_propia_m2: { type: 'number', description: 'Área de asignación de carga, m². SÓLO con area_modo = "propia".' },
          },
        },
      },
    },
    plantas: {
      type: ['array', 'null'],
      description: 'Lista COMPLETA de plantas del edificio, de ABAJO ARRIBA (la primera apoyada en la rasante). REEMPLAZA la actual entera; null = sin cambio. Cada planta lleva su ALTURA de forjado a forjado, no su cota: la cota sobre rasante la acumula la aplicación en el orden de la lista.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'altura_m'],
        properties: {
          nombre: { type: 'string', description: 'Cómo se llama en el plano: "Planta Baja", "Planta Primera", "Cubierta".' },
          altura_m: { type: 'number', description: 'Altura de la planta de forjado a forjado, METROS. Lo corriente en vivienda son 3 m.' },
        },
      },
    },
    nieve: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['activo', 'exposicion', 'sk_modo', 'sk_manual_kNm2'],
      description: 'El bloque de nieve, sin los faldones (van aparte). null = sin cambio.',
      properties: {
        activo: { type: 'boolean', description: 'false apaga el cálculo de nieve por completo.' },
        exposicion: {
          type: 'string',
          enum: [...EXPOSICIONES],
          description: 'Exposición al viento de la cubierta (art. 3.5.1-3): "normal"; "protegida" rodeada de edificios más altos o arbolado, la norma PERMITE bajar la nieve un 20 %; "expuesta" en un alto, campo abierto o primera línea, la norma OBLIGA a subirla un 20 %. No pongas "protegida" sin que el entorno lo justifique: es una rebaja del 20 % de la carga.',
        },
        sk_modo: {
          type: 'string',
          enum: [...SK_MODOS],
          description: '"auto": la sobrecarga de nieve sale de la norma (tabla 3.8 si la obra está en la capital, tabla E.2 por zona y altitud si no), y es lo normal. "manual": un valor propio de la ordenanza municipal o de datos empíricos, que es lo que la norma pide por encima de las altitudes tabuladas.',
        },
        sk_manual_kNm2: {
          type: 'number',
          description: 'Sobrecarga de nieve sobre terreno horizontal adoptada, kN/m². SÓLO cuenta con sk_modo = "manual", y sólo se escribe con el número que dé el usuario. NO estimes un sk a partir de la altitud ni de la provincia: eso lo hace la aplicación con las tablas.',
        },
      },
    },
    faldones: {
      type: ['array', 'null'],
      description: 'Lista COMPLETA de faldones de cubierta para la nieve. REEMPLAZA la actual entera; null = sin cambio. Una cubierta plana es UN faldón de 0º. Una cubierta a dos aguas son DOS faldones.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'inclinacion_grados', 'impedimento', 'L_m', 'limahoya', 'inclinacion_otro_grados', 'voladizo'],
        properties: {
          nombre: { type: 'string', description: 'Cómo se llama: "Cubierta", "Faldón norte", "Faldón sur".' },
          inclinacion_grados: {
            type: 'number',
            description: 'Inclinación del faldón, GRADOS. 0 = plana. El coeficiente de forma es 1 hasta 30º, baja linealmente hasta 0 en 60º, y es 0 por encima (art. 3.5.3).',
          },
          impedimento: {
            type: 'boolean',
            description: 'true si hay algo que IMPIDE que la nieve resbale (petos, barreras quitanieves, limatesas): entonces el coeficiente de forma es 1 sea cual sea la inclinación (art. 3.5.3-2).',
          },
          L_m: {
            type: 'number',
            description: 'Proyección horizontal del faldón, METROS. Se necesita para la acumulación que descarga al pie. Pon 0 si no se conoce: entonces no se calcula acumulación.',
          },
          limahoya: {
            type: 'string',
            enum: [...LIMAHOYAS],
            description: 'Qué hay al pie del faldón (art. 3.5.3-3 y 3.5.4): "ninguna" un alero, la nieve cae fuera y no se acumula; "contrario" limahoya con el faldón de enfrente, los dos bajan uno hacia el otro; "mismoSentido" limahoya con otro faldón que sigue bajando; "cambioNivel" descarga sobre una cubierta más baja.',
          },
          inclinacion_otro_grados: {
            type: 'number',
            description: 'Inclinación del OTRO faldón de la limahoya, GRADOS. Sólo cuenta con limahoya "contrario" o "mismoSentido"; en el resto, pon la misma que este faldón.',
          },
          voladizo: {
            type: 'boolean',
            description: 'true si el faldón termina en voladizo: la norma añade una carga lineal de hielo en el borde (art. 3.5.4-3).',
          },
        },
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.',
    },
  },
};

// ── Prompt del módulo ────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Viento y nieve (CTE DB SE-AE, art. 3.3 y 3.5, Anejos D y E):
1. UNIDADES: las presiones y cargas en kN/m², las longitudes y alturas en METROS, las inclinaciones y pendientes en GRADOS, las áreas en m². Añade un warning con cada conversión.
2. LA ZONA EÓLICA Y LA DE CLIMA INVERNAL NO LAS PONES TÚ. Salen de los mapas D.1 y E.2 del DB, y esta aplicación las resuelve a partir de la PROVINCIA. NO son campos de tu propuesta y NO puedes escribirlas. NUNCA digas de memoria en qué zona eólica o invernal está un municipio: la letra o el número que dijeras decidirían la presión de todo el edificio, y el documento los imprimiría como si vinieran del mapa. Tú eliges la provincia por su código INE y la aplicación pone la zona. Si el usuario sabe que su municipio cae al otro lado de una frontera del mapa, dile que fuerce la zona en el panel «¿Dónde está la obra?», donde queda marcada como forzada.
3. NI sk NI qb SE CITAN DE MEMORIA. La sobrecarga de nieve sale de la tabla 3.8 (capital) o de la E.2 por zona y altitud; la presión dinámica, del mapa D.1. Las dos las calcula la aplicación. Los modos "manual" existen para quien trae una ordenanza municipal o un estudio de viento: escribe ahí SÓLO el número que te dé el usuario. Si te pide "la nieve de Ávila a 1.100 m", no la estimes — pon la provincia y la altitud y deja que salga.
4. LA ALTITUD IMPORTA MUCHO EN LA NIEVE. La tabla E.2 sube deprisa con la altitud, y por encima de lo tabulado para cada zona la norma remite a la ordenanza municipal (art. 3.5.2-3). Pregúntala siempre: sin ella no hay nieve que calcular.
5. LAS PLANTAS SE TECLEAN DE FORJADO A FORJADO. Cada planta lleva su ALTURA, no su cota: la cota sobre rasante se acumula sola en el orden de la lista, de abajo arriba. La lista REEMPLAZA la actual entera, así que mándala completa cada turno.
6. EL GRADO DE ASPEREZA VA DE I A V DE MÁS A MENOS EXPUESTO. "IV" (pueblo, ciudad, polígono o bosque) es el caso habitual en edificación. "V" es el centro de una gran ciudad con edificios en altura que se protegen unos a otros, y no es lo mismo que "una ciudad": no lo uses para un barrio corriente. Cambiar de I hacia V rebaja el coeficiente de exposición de todas las plantas a la vez.
7. LA EXPOSICIÓN DE LA NIEVE NO ES UNA VARIABLE DE AJUSTE. "protegida" rebaja la carga un 20 % y exige que el entorno lo justifique —edificios más altos alrededor o arbolado que frene el viento—; "expuesta" la sube un 20 % y es OBLIGATORIA en un alto, en campo abierto o en primera línea. En la duda, "normal".
8. UNA CUBIERTA PLANA ES UN FALDÓN DE 0º. No hace falta activar la cubierta a dos aguas para calcular la nieve: el bloque "viento.cubierta" es para las zonas de presión del Anejo D.6, y sólo se enciende cuando la cubierta es de verdad a dos aguas. La nieve se calcula siempre por faldones.
9. QUÉ HAY AL PIE DEL FALDÓN DECIDE LA ACUMULACIÓN. Un alero deja caer la nieve fuera y no acumula nada; una limahoya o un cambio de nivel concentran la descarga en una banda de 2 m que puede ser la carga que gobierna un faldón pequeño (art. 3.5.4). Pregúntalo si el edificio tiene más de un faldón.
10. NO APAGUES UNA ACCIÓN PARA SIMPLIFICAR. Poner viento.activo o nieve.activo a false borra esa acción del cálculo y del documento. Sólo se apaga cuando esa acción se trata fuera de esta herramienta.
11. LO QUE NO CAMBIAS, DÉJALO EN NULL. null es «sin cambio», y cada bloque o lista que devuelvas con el valor que ya tiene se convierte en una fila de «no aplicado» que el usuario tiene que leer entera para descubrir que no dice nada.
12. ESTE MÓDULO NO COMPRUEBA NADA. Entrega la presión dinámica, el coeficiente de exposición por planta, la fuerza de viento de cada dirección con su excentricidad y su rozamiento, las zonas de presión de cubierta y fachadas, y la carga de nieve de cada faldón con sus acumulaciones. No dimensiona nada. Lo que publica lo consumen el cuadro de acciones y el módulo de cargas por planta, que toma de aquí la nieve de la cubierta.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Edificio de viviendas de 4 plantas de 3 m en Segovia capital, a 1.000 m; 22 por 14 m en planta, '
  + 'en un barrio urbano corriente. Cubierta a dos aguas con 25º de pendiente y la cumbrera paralela al lado largo.';

// ── Parseo defensivo ─────────────────────────────────────────────────────────

export interface EmplazamientoAi {
  provincia_ine: string;
  municipio: string;
  altitud_m: number;
  es_capital: boolean;
}

export interface CubiertaAi {
  activa: boolean;
  pendiente_grados: number;
  cumbrera: EjeCumbrera;
  altura_coronacion_m: number;
  area_modo: AreaModo;
  area_propia_m2: number;
}

export interface ParamentosAi {
  activos: boolean;
  area_modo: AreaModo;
  area_propia_m2: number;
}

export interface VientoAi {
  activo: boolean;
  qb_modo: QbModo;
  qb_manual_kNm2: number;
  aspereza: GradoAspereza;
  superficie: SuperficieExterior;
  dimension_x_m: number;
  dimension_y_m: number;
  cubierta: CubiertaAi;
  paramentos: ParamentosAi;
}

export interface PlantaAi {
  nombre: string;
  altura_m: number;
}

export interface NieveAi {
  activo: boolean;
  exposicion: ExposicionNieve;
  sk_modo: SkModo;
  sk_manual_kNm2: number;
}

export interface FaldonAi {
  nombre: string;
  inclinacion_grados: number;
  impedimento: boolean;
  L_m: number;
  limahoya: LimahoyaUI;
  inclinacion_otro_grados: number;
  voladizo: boolean;
}

interface VientoNievePayload {
  emplazamiento: EmplazamientoAi | null;
  viento: VientoAi | null;
  plantas: PlantaAi[] | null;
  nieve: NieveAi | null;
  faldones: FaldonAi[] | null;
  warnings: string[];
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const finito = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const numeroO = (v: unknown, def: number): number => finito(v) ?? def;
const textoO = (v: unknown, def: string): string => (typeof v === 'string' ? v : def);
const boolO = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def);
const unoDe = <T extends string>(v: unknown, permitidos: readonly T[], def: T): T =>
  permitidos.includes(v as T) ? (v as T) : def;

export function parsePayload(raw: unknown): VientoNievePayload {
  if (!esObjeto(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  const v = esObjeto(raw.viento) ? raw.viento : null;
  const cub = v && esObjeto(v.cubierta) ? v.cubierta : {};
  const par = v && esObjeto(v.paramentos) ? v.paramentos : {};
  const n = esObjeto(raw.nieve) ? raw.nieve : null;
  const e = esObjeto(raw.emplazamiento) ? raw.emplazamiento : null;

  return {
    emplazamiento: e
      ? {
        provincia_ine: textoO(e.provincia_ine, ''),
        municipio: textoO(e.municipio, ''),
        altitud_m: numeroO(e.altitud_m, -1),
        es_capital: boolO(e.es_capital, false),
      }
      : null,
    viento: v
      ? {
        activo: boolO(v.activo, D.viento.activo),
        qb_modo: unoDe(v.qb_modo, QB_MODOS, D.viento.qbModo),
        qb_manual_kNm2: numeroO(v.qb_manual_kNm2, QB_SIMPLIFICADO),
        aspereza: unoDe(v.aspereza, ASPEREZAS, D.viento.aspereza),
        superficie: unoDe(v.superficie, SUPERFICIES, D.viento.superficie),
        dimension_x_m: numeroO(v.dimension_x_m, D.viento.dimensiones.x),
        dimension_y_m: numeroO(v.dimension_y_m, D.viento.dimensiones.y),
        cubierta: {
          activa: boolO(cub.activa, D.viento.cubierta.activa),
          pendiente_grados: numeroO(cub.pendiente_grados, D.viento.cubierta.pendiente),
          cumbrera: unoDe(cub.cumbrera, CUMBRERAS, D.viento.cubierta.cumbrera),
          altura_coronacion_m: numeroO(cub.altura_coronacion_m, 0),
          area_modo: unoDe(cub.area_modo, AREA_MODOS, D.viento.cubierta.areaModo),
          area_propia_m2: numeroO(cub.area_propia_m2, D.viento.cubierta.areaPropia),
        },
        paramentos: {
          activos: boolO(par.activos, D.viento.paramentos.activos),
          area_modo: unoDe(par.area_modo, AREA_MODOS, D.viento.paramentos.areaModo),
          area_propia_m2: numeroO(par.area_propia_m2, D.viento.paramentos.areaPropia),
        },
      }
      : null,
    plantas: Array.isArray(raw.plantas)
      ? raw.plantas.filter(esObjeto).map((p) => ({
        nombre: textoO(p.nombre, ''),
        altura_m: numeroO(p.altura_m, ALTURA_PLANTA_TIPO),
      }))
      : null,
    nieve: n
      ? {
        activo: boolO(n.activo, D.nieve.activo),
        exposicion: unoDe(n.exposicion, EXPOSICIONES, D.nieve.exposicion),
        sk_modo: unoDe(n.sk_modo, SK_MODOS, D.nieve.skModo),
        sk_manual_kNm2: numeroO(n.sk_manual_kNm2, D.nieve.skManual),
      }
      : null,
    faldones: Array.isArray(raw.faldones)
      ? raw.faldones.filter(esObjeto).map((f) => {
        const inc = numeroO(f.inclinacion_grados, 0);
        return {
          nombre: textoO(f.nombre, ''),
          inclinacion_grados: inc,
          impedimento: boolO(f.impedimento, false),
          L_m: numeroO(f.L_m, 0),
          limahoya: unoDe(f.limahoya, LIMAHOYAS, 'ninguna'),
          inclinacion_otro_grados: numeroO(f.inclinacion_otro_grados, inc),
          voladizo: boolO(f.voladizo, false),
        };
      })
      : null,
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Proyección plana del estado ──────────────────────────────────────────────

const plantaDe = (p: PlantaUI): PlantaAi => ({ nombre: p.nombre, altura_m: p.altura });

const faldonDe = (f: FaldonUI): FaldonAi => ({
  nombre: f.nombre,
  inclinacion_grados: f.inclinacion,
  impedimento: f.impedimento,
  L_m: f.L ?? 0,
  limahoya: f.limahoya,
  inclinacion_otro_grados: f.inclinacionOtro,
  voladizo: f.voladizo,
});

const vientoDe = (s: VientoNieveState): VientoAi => ({
  activo: s.viento.activo,
  qb_modo: s.viento.qbModo,
  qb_manual_kNm2: s.viento.qbManual,
  aspereza: s.viento.aspereza,
  superficie: s.viento.superficie,
  dimension_x_m: s.viento.dimensiones.x,
  dimension_y_m: s.viento.dimensiones.y,
  cubierta: {
    activa: s.viento.cubierta.activa,
    pendiente_grados: s.viento.cubierta.pendiente,
    cumbrera: s.viento.cubierta.cumbrera,
    altura_coronacion_m: s.viento.cubierta.alturaCoronacion ?? 0,
    area_modo: s.viento.cubierta.areaModo,
    area_propia_m2: s.viento.cubierta.areaPropia,
  },
  paramentos: {
    activos: s.viento.paramentos.activos,
    area_modo: s.viento.paramentos.areaModo,
    area_propia_m2: s.viento.paramentos.areaPropia,
  },
});

const nieveDe = (s: VientoNieveState): NieveAi => ({
  activo: s.nieve.activo,
  exposicion: s.nieve.exposicion,
  sk_modo: s.nieve.skModo,
  sk_manual_kNm2: s.nieve.skManual,
});

// ── Mapper payload → estado ──────────────────────────────────────────────────

const ALREADY = 'Ya coincide con el valor actual';

export const ZONA_FORZADA_REASON =
  'La zona eólica y la de clima invernal salen de los mapas D.1 y E.2 y las resuelve la '
  + 'aplicación a partir de la provincia: no son campos del asistente. Si su municipio cae al '
  + 'otro lado de una frontera del mapa, fuércela en el panel «¿Dónde está la obra?».';

const gr = (v: number) => `${v.toFixed(0)}º`;
const m = (v: number) => `${v.toFixed(2).replace('.', ',')} m`;
const kNm2 = (v: number) => `${v.toFixed(2).replace('.', ',')} kN/m²`;
const kN = (v: number) => `${v.toFixed(1).replace('.', ',')} kN`;

const ETIQUETA_ASPEREZA: Record<GradoAspereza, string> = {
  I: 'I · borde del mar',
  II: 'II · campo llano',
  III: 'III · campo con obstáculos',
  IV: 'IV · pueblo o ciudad',
  V: 'V · gran ciudad',
};

const ETIQUETA_LIMAHOYA: Record<LimahoyaUI, string> = {
  ninguna: 'alero',
  contrario: 'limahoya con el faldón de enfrente',
  mismoSentido: 'limahoya con otro faldón que sigue bajando',
  cambioNivel: 'cambio de nivel',
};

const ETIQUETA_EXPOSICION: Record<ExposicionNieve, string> = {
  normal: 'normal',
  protegida: 'protegida (−20 %)',
  expuesta: 'muy expuesta (+20 %)',
};

const textoPlanta = (p: PlantaAi) => `${p.nombre.trim() || 'Planta'}: ${m(p.altura_m)}`;

const textoFaldon = (f: FaldonAi) =>
  `${f.nombre.trim() || 'Faldón'}: ${gr(f.inclinacion_grados)}`
  + (f.impedimento ? ', con impedimento' : '')
  + (f.L_m > 0 ? `, L = ${m(f.L_m)}` : '')
  + `, ${ETIQUETA_LIMAHOYA[f.limahoya]}`
  + (f.voladizo ? ', en voladizo' : '');

/** Compara dos listas posicionalmente y escribe una línea por fila que cambia. */
function cambiosDeLista<T>(
  clave: string,
  que: string,
  propuestas: readonly T[],
  actuales: readonly T[],
  texto: (x: T) => string,
  changes: AiFieldChange[],
): void {
  const compartidas = Math.min(propuestas.length, actuales.length);
  for (let i = 0; i < compartidas; i++) {
    const antes = texto(actuales[i]);
    const despues = texto(propuestas[i]);
    if (antes !== despues) changes.push({ field: `${clave}[${i}]`, label: `${que} ${i + 1}`, before: antes, after: despues });
  }
  for (let i = compartidas; i < propuestas.length; i++) {
    changes.push({ field: `${clave}[${i}]`, label: `${que} nuevo`, before: '—', after: texto(propuestas[i]) });
  }
  if (propuestas.length < actuales.length) {
    changes.push({
      field: `${clave}.eliminados`,
      label: `${que}s que se eliminan`,
      before: actuales.slice(propuestas.length).map(texto).join(' · '),
      after: '—',
    });
  }
}

// ── Seguridad ────────────────────────────────────────────────────────────────

/** Como en los otros dos de la ola: las claves de primer nivel del estado son objetos. */
export const VIENTO_NIEVE_SAFETY_RULES: ReadonlyArray<SafetyRule<VientoNieveState>> = [];

/**
 * Magnitudes resueltas. Entran en el test de contrato como `ResolvedSafetyRule`
 * pero las consume un detector propio (`riesgosEscalares`), cuyo gate compara la
 * magnitud con la de fábrica en vez de comparar objetos del estado por
 * identidad. Ver la cabecera del fichero.
 */
export const VIENTO_NIEVE_RESOLVED_RULES: ReadonlyArray<ResolvedSafetyRule<VientoNieveState>> = [
  {
    id: 'qb',
    label: 'Presión dinámica qb',
    resolve: (s) => evaluar(s).viento?.qb ?? null,
    level: higherIsSafer,
    format: (v) => kNm2(v),
    why: 'La presión dinámica multiplica a TODA la acción de viento del edificio. Sale del mapa D.1; '
      + 'el valor simplificado de 0,5 kN/m² que el art. 3.3.2 admite para cualquier punto queda POR '
      + 'DEBAJO en la zona C, y un valor propio tiene que venir de un estudio, no de una estimación.',
    fields: ['viento'],
    confirmKeys: ['viento'],
  },
  {
    id: 'sk_efectiva',
    label: 'Sobrecarga de nieve efectiva',
    resolve: (s) => evaluar(s).nieve?.skEfectiva ?? null,
    level: higherIsSafer,
    format: (v) => kNm2(v),
    why: 'Es la nieve que multiplica al coeficiente de forma de todos los faldones: la sobrecarga de '
      + 'la tabla por el factor de exposición. La rebajan la altitud, la zona y declarar la cubierta '
      + '«protegida», que vale un 20 % y exige que el entorno lo justifique.',
    fields: ['nieve'],
    confirmKeys: ['nieve'],
  },
];

const EPS = 1e-9;

function riesgosEscalares(
  actual: VientoNieveState,
  final: VientoNieveState,
  confirmed: ReadonlySet<string>,
): AiSafetyRisk[] {
  // La referencia de fábrica se lee con el MISMO emplazamiento: sin provincia
  // ni altitud las dos magnitudes resuelven a null, y el gate daría por
  // establecida cualquier primera propuesta.
  const fabrica: VientoNieveState = { ...D, emplazamiento: actual.emplazamiento };

  const risks: AiSafetyRisk[] = [];
  for (const r of VIENTO_NIEVE_RESOLVED_RULES) {
    const antes = r.resolve(actual);
    const despues = r.resolve(final);
    if (antes === null || despues === null) continue;
    const establecida = r.resolve(fabrica) !== antes || r.confirmKeys.some((k) => confirmed.has(k));
    if (!establecida) continue;
    const nivelAntes = r.level(antes);
    const nivelDespues = r.level(despues);
    if (nivelAntes === null || nivelDespues === null) continue;
    if (nivelDespues >= nivelAntes - EPS) continue;
    risks.push({ field: r.id, label: r.label, before: r.format(antes), after: r.format(despues), why: r.why });
  }
  return risks;
}

const F_WHY =
  'La fuerza total de viento de esta dirección baja. La mueven la presión dinámica, el grado de '
  + 'aspereza del entorno, la altura del edificio y su anchura expuesta: compruebe cuál ha cambiado '
  + 'y que responde al edificio real. Es lo que se reparte por plantas y va al cuadro de acciones.';

const QN_WHY =
  'La carga de nieve de este faldón baja. La mueven su inclinación —el coeficiente de forma cae de 1 '
  + 'a 0 entre 30º y 60º—, que haya o no algo que impida el deslizamiento, y la nieve efectiva del '
  + 'emplazamiento. Es la carga que el módulo de cargas por planta toma de aquí para la cubierta.';

const APAGAR_WHY = (que: string) =>
  `Apagar ${que} lo borra del cálculo Y del documento: la obra se queda sin esa acción, y lo que `
  + 'este módulo publica deja de traerla. Sólo se apaga cuando se trata fuera de esta herramienta.';

const ELIMINAR_PLANTAS_WHY =
  'La propuesta deja menos plantas de las que hay. El edificio se queda más bajo, y con él bajan el '
  + 'coeficiente de exposición de la coronación y la fuerza total de viento.';

const ELIMINAR_FALDONES_WHY =
  'La propuesta deja menos faldones de los que hay. Un faldón que desaparece deja de tener carga de '
  + 'nieve calculada, y con él su acumulación al pie.';

/**
 * Riesgos del módulo: se EVALÚA el estado antes y después y se comparan las
 * ACCIONES resueltas —la fuerza total de cada dirección y el qn de cada
 * faldón—, más los apagados y las eliminaciones. Bajar el grado de aspereza de
 * I a V no mueve ningún número visible del formulario y rebaja el coeficiente
 * de exposición de todas las plantas a la vez.
 *
 * GATE ANTI-RUIDO: si el edificio sigue siendo el de arranque y el hilo no lo
 * ha tratado, la primera propuesta es MODELARLO, no debilitarlo.
 */
function riesgosDeAcciones(
  actual: VientoNieveState,
  final: VientoNieveState,
  confirmed: ReadonlySet<string>,
): AiSafetyRisk[] {
  const risks: AiSafetyRisk[] = [];

  if (actual.viento.activo && !final.viento.activo) {
    risks.push({ field: 'viento.activo', label: 'Se apaga el viento', before: 'sí', after: 'no', why: APAGAR_WHY('el viento') });
  }
  if (actual.nieve.activo && !final.nieve.activo) {
    risks.push({ field: 'nieve.activo', label: 'Se apaga la nieve', before: 'sí', after: 'no', why: APAGAR_WHY('la nieve') });
  }

  const gateAbierto = !esEstadoInicial(actual)
    || confirmed.has('plantas') || confirmed.has('faldones')
    || confirmed.has('viento') || confirmed.has('nieve');
  if (!gateAbierto) return risks;

  const antes = evaluar(actual);
  const despues = evaluar(final);

  // ── Viento: la fuerza total de cada dirección ──────────────────────────────
  if (antes.viento && despues.viento) {
    for (const eje of ['x', 'y'] as const) {
      const a = antes.viento[eje].Ftotal;
      const d = despues.viento[eje].Ftotal;
      if (d >= a - EPS) continue;
      risks.push({
        field: `viento.F_${eje}`,
        label: `Viento ${eje.toUpperCase()} — fuerza total`,
        before: kN(a),
        after: kN(d),
        why: F_WHY,
      });
    }
  }
  if (final.viento.plantas.length < actual.viento.plantas.length) {
    risks.push({
      field: 'plantas.eliminadas',
      label: 'Plantas que se eliminan',
      before: `${actual.viento.plantas.length} plantas`,
      after: `${final.viento.plantas.length} plantas`,
      why: ELIMINAR_PLANTAS_WHY,
    });
  }

  // ── Nieve: el qn de cada faldón ────────────────────────────────────────────
  if (antes.nieve && despues.nieve) {
    const fa = antes.nieve.faldones;
    const fd = despues.nieve.faldones;
    for (let i = 0; i < Math.min(fa.length, fd.length); i++) {
      if (fd[i].qn >= fa[i].qn - EPS) continue;
      risks.push({
        field: `faldones[${i}].qn`,
        label: `${fd[i].nombre || `Faldón ${i + 1}`} — carga de nieve`,
        before: kNm2(fa[i].qn),
        after: kNm2(fd[i].qn),
        why: QN_WHY,
      });
    }
  }
  if (final.nieve.faldones.length < actual.nieve.faldones.length) {
    risks.push({
      field: 'faldones.eliminados',
      label: 'Faldones que se eliminan',
      before: `${actual.nieve.faldones.length} faldones`,
      after: `${final.nieve.faldones.length} faldones`,
      why: ELIMINAR_FALDONES_WHY,
    });
  }

  return risks;
}

// ── buildPlan ────────────────────────────────────────────────────────────────

function buildVientoNievePlan(
  payload: VientoNievePayload,
  current: VientoNieveState,
  confirmed: ReadonlySet<string> = new Set<string>(),
): AiApplyPlan<VientoNieveState> {
  const fields: Partial<VientoNieveState> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const notFound: string[] = [];
  const warnings = [...payload.warnings];

  const anota = (clave: string, label: string, before: string, after: string) => {
    if (before !== after) changes.push({ field: clave, label, before, after });
  };

  // ── Emplazamiento ──────────────────────────────────────────────────────────
  if (payload.emplazamiento !== null) {
    const e = payload.emplazamiento;
    const antes = current.emplazamiento;
    const emplazamiento = { ...antes };
    let rechazos = 0;

    if (e.provincia_ine !== '') {
      if (!INES.includes(e.provincia_ine)) {
        notFound.push(`Provincia con INE «${e.provincia_ine}»`);
        skipped.push({ field: 'emplazamiento', label: 'Provincia', reason: `«${e.provincia_ine}» no es un código INE de provincia.` });
        rechazos += 1;
      } else if (e.provincia_ine !== antes.provincia) {
        emplazamiento.provincia = e.provincia_ine;
        // Cambiar de provincia REARMA las zonas derivadas: una zona forzada
        // para el municipio anterior no dice nada del nuevo. Es lo que hace el
        // desplegable del panel.
        emplazamiento.zonaEolica = null;
        emplazamiento.zonaInvernal = null;
        const nombre = (ine: string) => PROVINCIAS.find((p) => p.ine === ine)?.nombre ?? 'sin decir';
        anota('emplazamiento.provincia_ine', 'Provincia', antes.provincia ? nombre(antes.provincia) : 'sin decir', nombre(e.provincia_ine));
      }
    }
    if (e.municipio.trim() !== '') {
      emplazamiento.municipio = e.municipio.trim();
      anota('emplazamiento.municipio', 'Municipio', antes.municipio || 'sin decir', emplazamiento.municipio);
    }
    if (e.altitud_m >= 0) {
      if (e.altitud_m > 4000) {
        skipped.push({ field: 'emplazamiento', label: 'Altitud', reason: `Fuera de rango: ${e.altitud_m} m (se admite de 0 a 4.000 m).` });
        rechazos += 1;
      } else {
        emplazamiento.altitud = e.altitud_m;
        anota('emplazamiento.altitud_m', 'Altitud', antes.altitud === null ? 'sin decir' : `${antes.altitud} m`, `${e.altitud_m} m`);
      }
    }
    if (e.es_capital !== antes.esCapital) {
      emplazamiento.esCapital = e.es_capital;
      anota('emplazamiento.es_capital', 'La obra está en la capital', antes.esCapital ? 'sí' : 'no', e.es_capital ? 'sí' : 'no');
    }

    if (JSON.stringify(emplazamiento) !== JSON.stringify(antes)) fields.emplazamiento = emplazamiento;
    else if (rechazos === 0) skipped.push({ field: 'emplazamiento', label: 'Emplazamiento', reason: ALREADY });
  }

  // ── Viento (sin las plantas) ───────────────────────────────────────────────
  const vientoBase = { ...current.viento };
  let vientoTocado = false;

  if (payload.viento !== null) {
    const v = payload.viento;
    const antes = vientoDe(current);
    let rechazos = 0;

    if (v.dimension_x_m <= 0 || v.dimension_y_m <= 0 || v.dimension_x_m > 1000 || v.dimension_y_m > 1000) {
      skipped.push({ field: 'viento', label: 'Dimensiones en planta', reason: `Fuera de rango: ${v.dimension_x_m} × ${v.dimension_y_m} m (se admite de 1 a 1.000 m).` });
      rechazos += 1;
    } else {
      vientoBase.dimensiones = { x: v.dimension_x_m, y: v.dimension_y_m };
    }
    if (v.cubierta.activa && Math.abs(v.cubierta.pendiente_grados) >= 75) {
      skipped.push({ field: 'viento', label: 'Pendiente de la cubierta', reason: `Fuera de rango: ${v.cubierta.pendiente_grados}º (el Anejo D.6 llega a 75º).` });
      rechazos += 1;
    }

    vientoBase.activo = v.activo;
    vientoBase.qbModo = v.qb_modo;
    vientoBase.qbManual = v.qb_manual_kNm2;
    vientoBase.aspereza = v.aspereza;
    vientoBase.superficie = v.superficie;
    vientoBase.cubierta = {
      activa: v.cubierta.activa,
      pendiente: Math.abs(v.cubierta.pendiente_grados) >= 75 ? current.viento.cubierta.pendiente : v.cubierta.pendiente_grados,
      cumbrera: v.cubierta.cumbrera,
      // 0 es el centinela de «la calcula la aplicación».
      alturaCoronacion: v.cubierta.altura_coronacion_m > 0 ? v.cubierta.altura_coronacion_m : null,
      areaModo: v.cubierta.area_modo,
      areaPropia: v.cubierta.area_propia_m2,
    };
    vientoBase.paramentos = {
      activos: v.paramentos.activos,
      areaModo: v.paramentos.area_modo,
      areaPropia: v.paramentos.area_propia_m2,
    };

    const despues = vientoDe({ ...current, viento: vientoBase });
    anota('viento.activo', 'Se calcula el viento', antes.activo ? 'sí' : 'no', despues.activo ? 'sí' : 'no');
    anota('viento.qb_modo', 'Presión dinámica', antes.qb_modo === 'manual' ? `valor propio ${kNm2(antes.qb_manual_kNm2)}` : antes.qb_modo, despues.qb_modo === 'manual' ? `valor propio ${kNm2(despues.qb_manual_kNm2)}` : despues.qb_modo);
    anota('viento.aspereza', 'Entorno del edificio', ETIQUETA_ASPEREZA[antes.aspereza], ETIQUETA_ASPEREZA[despues.aspereza]);
    anota('viento.superficie', 'Superficie exterior', antes.superficie, despues.superficie);
    anota('viento.dimensiones', 'Dimensiones en planta', `${m(antes.dimension_x_m)} × ${m(antes.dimension_y_m)}`, `${m(despues.dimension_x_m)} × ${m(despues.dimension_y_m)}`);
    anota('viento.cubierta', 'Cubierta a dos aguas',
      antes.cubierta.activa ? `${gr(antes.cubierta.pendiente_grados)}, cumbrera ${antes.cubierta.cumbrera.toUpperCase()}` : 'plana',
      despues.cubierta.activa ? `${gr(despues.cubierta.pendiente_grados)}, cumbrera ${despues.cubierta.cumbrera.toUpperCase()}` : 'plana');
    anota('viento.paramentos', 'Zonas de fachada', antes.paramentos.activos ? antes.paramentos.area_modo : 'no se calculan', despues.paramentos.activos ? despues.paramentos.area_modo : 'no se calculan');

    if (JSON.stringify(despues) !== JSON.stringify(antes)) vientoTocado = true;
    else if (rechazos === 0) skipped.push({ field: 'viento', label: 'Viento', reason: ALREADY });
  }

  // ── Plantas ────────────────────────────────────────────────────────────────
  if (payload.plantas !== null) {
    if (payload.plantas.length === 0) {
      skipped.push({ field: 'plantas', label: 'Plantas del edificio', reason: 'La lista llega vacía: un edificio sin plantas no tiene altura sobre la que calcular el viento.' });
    } else {
      const malas = payload.plantas.filter((p) => p.altura_m <= 0 || p.altura_m > 30);
      if (malas.length > 0) {
        skipped.push({ field: 'plantas', label: 'Plantas del edificio', reason: `Hay ${malas.length} planta${malas.length === 1 ? '' : 's'} con altura fuera de rango (se admite de 0 a 30 m por planta).` });
      } else {
        const plantas: PlantaUI[] = payload.plantas.map((p, i) => ({
          id: current.viento.plantas[i]?.id ?? nuevoId('p'),
          nombre: p.nombre.trim(),
          altura: p.altura_m,
        }));
        cambiosDeLista('plantas', 'Planta', plantas.map(plantaDe), current.viento.plantas.map(plantaDe), textoPlanta, changes);
        if (JSON.stringify(plantas.map(plantaDe)) !== JSON.stringify(current.viento.plantas.map(plantaDe))) {
          vientoBase.plantas = plantas;
          vientoTocado = true;
        } else {
          skipped.push({ field: 'plantas', label: 'Plantas del edificio', reason: ALREADY });
        }
      }
    }
  }

  if (vientoTocado) fields.viento = vientoBase;

  // ── Nieve (sin los faldones) ───────────────────────────────────────────────
  const nieveBase = { ...current.nieve };
  let nieveTocada = false;

  if (payload.nieve !== null) {
    const n = payload.nieve;
    const antes = nieveDe(current);
    nieveBase.activo = n.activo;
    nieveBase.exposicion = n.exposicion;
    nieveBase.skModo = n.sk_modo;
    if (n.sk_modo === 'manual' && (n.sk_manual_kNm2 <= 0 || n.sk_manual_kNm2 > 20)) {
      skipped.push({ field: 'nieve', label: 'Nieve — valor propio', reason: `Fuera de rango: ${n.sk_manual_kNm2} kN/m² (se admite de 0 a 20).` });
      nieveBase.skModo = current.nieve.skModo;
    } else {
      nieveBase.skManual = n.sk_manual_kNm2;
    }
    const despues = nieveDe({ ...current, nieve: nieveBase });
    anota('nieve.activo', 'Se calcula la nieve', antes.activo ? 'sí' : 'no', despues.activo ? 'sí' : 'no');
    anota('nieve.exposicion', 'Exposición al viento', ETIQUETA_EXPOSICION[antes.exposicion], ETIQUETA_EXPOSICION[despues.exposicion]);
    anota('nieve.sk_modo', 'Sobrecarga de nieve',
      antes.sk_modo === 'manual' ? `valor propio ${kNm2(antes.sk_manual_kNm2)}` : 'la de la norma',
      despues.sk_modo === 'manual' ? `valor propio ${kNm2(despues.sk_manual_kNm2)}` : 'la de la norma');
    if (JSON.stringify(despues) !== JSON.stringify(antes)) nieveTocada = true;
    else skipped.push({ field: 'nieve', label: 'Nieve', reason: ALREADY });
  }

  // ── Faldones ───────────────────────────────────────────────────────────────
  if (payload.faldones !== null) {
    if (payload.faldones.length === 0) {
      skipped.push({ field: 'faldones', label: 'Faldones', reason: 'La lista llega vacía. Si la obra no lleva nieve, apáguela en el bloque de nieve; si la lleva, una cubierta plana es UN faldón de 0º.' });
    } else {
      const malos = payload.faldones.filter((f) => f.inclinacion_grados < -90 || f.inclinacion_grados > 90);
      if (malos.length > 0) {
        skipped.push({ field: 'faldones', label: 'Faldones', reason: `Hay ${malos.length} faldón(es) con inclinación fuera de rango (se admite de −90º a 90º).` });
      } else {
        const faldones: FaldonUI[] = payload.faldones.map((f, i) => ({
          id: current.nieve.faldones[i]?.id ?? nuevoId('f'),
          nombre: f.nombre.trim(),
          inclinacion: f.inclinacion_grados,
          impedimento: f.impedimento,
          L: f.L_m > 0 ? f.L_m : null,
          limahoya: f.limahoya,
          inclinacionOtro: f.inclinacion_otro_grados,
          voladizo: f.voladizo,
        }));
        cambiosDeLista('faldones', 'Faldón', faldones.map(faldonDe), current.nieve.faldones.map(faldonDe), textoFaldon, changes);
        if (JSON.stringify(faldones.map(faldonDe)) !== JSON.stringify(current.nieve.faldones.map(faldonDe))) {
          nieveBase.faldones = faldones;
          nieveTocada = true;
        } else {
          skipped.push({ field: 'faldones', label: 'Faldones', reason: ALREADY });
        }
      }
    }
  }

  if (nieveTocada) fields.nieve = nieveBase;

  // ── Riesgos ────────────────────────────────────────────────────────────────
  const final: VientoNieveState = { ...current, ...fields };
  const risks = [
    ...riesgosDeAcciones(current, final, confirmed),
    ...riesgosEscalares(current, final, confirmed),
  ];

  return { fields, changes, skipped, notFound, warnings, risks };
}

// ── Snapshot del estado ──────────────────────────────────────────────────────

function buildSnapshot(c: VientoNieveState): string {
  const zonas = zonasEfectivas(c.emplazamiento);
  const valores: Record<string, unknown> = {
    emplazamiento: {
      provincia_ine: c.emplazamiento.provincia || null,
      municipio: c.emplazamiento.municipio || null,
      altitud_m: c.emplazamiento.altitud,
      es_capital: c.emplazamiento.esCapital,
    },
    viento: vientoDe(c),
    plantas: c.viento.plantas.map(plantaDe),
    nieve: nieveDe(c),
    faldones: c.nieve.faldones.map(faldonDe),
  };

  const sinConfirmar: string[] = [];
  if (!c.emplazamiento.provincia || c.emplazamiento.altitud === null) sinConfirmar.push('emplazamiento');
  if (esEstadoInicial(c)) sinConfirmar.push('viento', 'plantas', 'nieve', 'faldones');

  // Contexto de SOLO LECTURA, dentro de `valores` (ver la nota de seismicNCSE02).
  valores.zonas_que_pone_la_norma = {
    provincia: zonas.provincia?.nombre ?? null,
    zona_eolica: zonas.zonaEolica,
    zona_invernal: zonas.zonaInvernal,
    eolica_forzada_por_el_proyectista: zonas.eolicaForzada,
    invernal_forzada_por_el_proyectista: zonas.invernalForzada,
    sk_de_la_capital_tabla_3_8: zonas.skCapital,
    frontera: zonas.provincia?.frontera ?? null,
    nota: 'Las dos zonas salen de los mapas D.1 y E.2 a partir de la provincia. NO son campos de tu '
      + 'propuesta y NUNCA las cites de memoria: si el municipio cae al otro lado de una frontera del '
      + 'mapa, las fuerza el proyectista en el panel.',
  };
  valores.cotas_derivadas_m = cotasPlantas(c.viento.plantas);
  valores.altura_coronacion_efectiva_m = alturaCoronacionEfectiva(c.viento);
  valores.edificio_de_la_plantilla = esEstadoInicial(c);

  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

const ALCANCE_LINEA =
  'ATENCION: este módulo NO comprueba nada. Entrega la presión dinámica, el coeficiente de exposición '
  + 'por planta, la fuerza de viento de cada dirección con su excentricidad y su rozamiento, las zonas '
  + 'de presión de cubierta y fachadas, y la carga de nieve de cada faldón. No dimensiona nada.';

/**
 * Como en los otros dos de la ola, el resultado son ACCIONES y no un veredicto:
 * no hay comprobación que cumpla o incumpla. El veredicto lo dan los huecos y
 * los errores, que son lo único que bloquea exportar y publicar.
 */
export function summarizeVientoNieveResults(ev: Evaluacion): AiResultsSummary {
  const lines: string[] = [];

  if (ev.huecos.length > 0 || ev.errores > 0) {
    lines.push(
      `CÁLCULO INCOMPLETO: ${ev.huecos.length > 0 ? `falta ${ev.huecos.join(' y ')}` : 'sin huecos'}`
      + `${ev.errores > 0 ? ` · ${ev.errores} error${ev.errores === 1 ? '' : 'es'}` : ''}. Bloquea exportar y publicar.`,
    );
  } else {
    lines.push('CÁLCULO COMPLETO: viento y nieve resueltos con los datos actuales.');
  }

  lines.push(
    `Emplazamiento: ${ev.zonas.provincia?.nombre ?? 'sin provincia'}`
    + ` · zona eólica ${ev.zonas.zonaEolica ?? '—'}${ev.zonas.eolicaForzada ? ' (FORZADA por el proyectista)' : ''}`
    + ` · zona de clima invernal ${ev.zonas.zonaInvernal ?? '—'}${ev.zonas.invernalForzada ? ' (FORZADA)' : ''}`
    + (ev.zonas.skCapital !== null ? ` · sk de capital (tabla 3.8) = ${ev.zonas.skCapital} kN/m²` : ''),
  );

  const v = ev.viento;
  if (v) {
    lines.push(
      `- Viento: qb = ${v.qb.toFixed(2)} kN/m² (${v.qbOrigen})`
      + (v.vb !== null ? ` · vb = ${v.vb} m/s` : '')
      + ` · aspereza ${v.aspereza} (k = ${v.parametros.k}, L = ${v.parametros.L}, Z = ${v.parametros.Z})`
      + ` · H del último forjado = ${v.H.toFixed(2)} m · altura del edificio = ${v.alturaEdificio.toFixed(2)} m`,
    );
    for (const eje of ['x', 'y'] as const) {
      const d = v[eje];
      lines.push(
        `  · Dirección ${eje.toUpperCase()}: profundidad ${d.profundidad} m, fachada expuesta ${d.anchoExpuesto} m, `
        + `esbeltez ${d.esbeltez.toFixed(2)} ⇒ cp = ${d.cp.toFixed(2)}, cs = ${d.cs.toFixed(2)} · `
        + `F total = ${d.Ftotal.toFixed(1)} kN · excentricidad ${d.excentricidad.toFixed(2)} m`
        + (d.rozamiento
          ? ` · rozamiento: cfr = ${d.rozamiento.cfr}, área ${d.rozamiento.area.toFixed(1)} m², `
            + `F = ${d.rozamiento.F.toFixed(1)} kN (${(d.rozamiento.fraccion * 100).toFixed(1)} % de la perpendicular, `
            + `${d.rozamiento.aplicado ? 'APLICADO' : 'se desprecia por debajo del 10 %'})`
          : ''),
      );
      const porPlanta = d.plantas
        .map((p) => `${p.nombre} z=${p.z} m ce=${p.ce.toFixed(2)} qe=${p.qe.toFixed(2)} kN/m² F=${p.F.toFixed(1)} kN`)
        .join(' | ');
      if (porPlanta) lines.push(`    plantas: ${porPlanta}`);
    }
    if (v.cubierta) lines.push(`  · Cubierta a dos aguas (Anejo D.6): ce de coronación ${v.cubierta.ce.toFixed(2)}, cumbrera paralela a ${v.cubierta.cumbrera.toUpperCase()}`);
    if (v.paramentos) lines.push('  · Zonas de fachada (tabla D.3) calculadas.');
    for (const a of v.avisos) lines.push(`  Aviso: ${a}`);
    for (const e of v.errores) lines.push(`  ERROR: ${e}`);
  } else {
    lines.push('- Viento: no se calcula (apagado, o sin provincia).');
  }

  const n = ev.nieve;
  if (n) {
    lines.push(
      `- Nieve: sk = ${n.sk === null ? '— (altitud fuera de lo tabulado: la norma remite a la ordenanza municipal)' : `${n.sk.toFixed(2)} kN/m²`}`
      + ` (${n.skOrigen}) · factor de exposición ${n.factorExposicion}`
      + ` · sk efectiva = ${n.skEfectiva === null ? '—' : `${n.skEfectiva.toFixed(2)} kN/m²`}`,
    );
    for (const f of n.faldones) {
      const trozos = [`inclinación ${f.inclinacion}º`, `mu = ${f.mu.toFixed(2)}`, `qn = ${f.qn.toFixed(2)} kN/m²`, `asimétrica ${f.qnAsimetrica.toFixed(2)}`];
      if (f.limahoya) trozos.push(`limahoya: mu ${f.limahoya.mu.toFixed(2)}, qn ${f.limahoya.qn.toFixed(2)} en ${f.limahoya.ancho} m`);
      if (f.acumulacion) trozos.push(`acumulación: pd ${f.acumulacion.pd.toFixed(2)}, pa ${f.acumulacion.pa.toFixed(2)} kN/m² en ${f.acumulacion.ancho} m`);
      if (f.hielo !== undefined) trozos.push(`hielo en el borde ${f.hielo.toFixed(2)} kN/m`);
      lines.push(`  · ${f.nombre}: ${trozos.join(' | ')}`);
    }
    for (const a of n.avisos) lines.push(`  Aviso: ${a}`);
    for (const e of n.errores) lines.push(`  ERROR: ${e}`);
  } else {
    lines.push('- Nieve: no se calcula (apagada, o sin provincia o sin altitud).');
  }

  for (const h of ev.huecos) lines.push(`HUECO: falta ${h}.`);
  lines.push(ALCANCE_LINEA);

  const verdict = ev.huecos.length > 0 || ev.errores > 0 ? 'invalid' : (ev.avisos > 0 ? 'warn' : 'none');
  return { verdict, text: lines.join('\n') };
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export const vientoNieveAdapter: AiModuleAdapter<VientoNieveState> = {
  id: 'viento-nieve',
  label: 'Viento y nieve',
  payloadSchema: VIENTO_NIEVE_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  // El edificio se describe planta a planta y faldón a faldón: entrevista
  // larga, como la de los otros dos módulos de la ola.
  historyTurns: 16,
  snapshot: buildSnapshot,
  // `system` no se usa: este módulo no ofrece sistema técnico en ningún sitio —
  // el DB SE-AE va siempre en kN/m² y metros.
  buildPlan: (payload, current, _system: UnitSystem, confirmed) =>
    buildVientoNievePlan(parsePayload(payload), current, confirmed),
};
