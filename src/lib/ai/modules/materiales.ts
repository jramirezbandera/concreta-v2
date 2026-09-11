/**
 * Adapter del asistente IA para el módulo «Cuadro de materiales» (ola 8).
 *
 * Segundo módulo cuyo payload es una TABLA —tres, en realidad: hormigón,
 * madera y acero—, con la misma semántica de reemplazo completo que las cargas
 * por planta. Y el primero cuyo payload se organiza en OBJETOS agrupados
 * (`estudio`, `obra`, `acero`) en vez de escalares sueltos: el formulario tiene
 * veintitantos campos de primer nivel y uno anulable por campo se habría
 * comido el tope de uniones de Anthropic. Agrupados son siete uniones.
 *
 * LO QUE ESTE MÓDULO HACE, Y POR QUÉ IMPORTA PARA EL PAYLOAD
 * El cuadro no se teclea: se DERIVA. El usuario dice dónde está cada elemento
 * —«enterrado», «al exterior a la lluvia», «vaso de piscina»— y el motor saca
 * las clases de exposición de la tabla 27.1.a, la relación a/c y el cemento
 * mínimo de la 43.2.1.a, la fck mínima de la 43.2.1.b, el recubrimiento de las
 * 44.2.1.1 y la tipificación del 33.6. El asistente, por tanto, tiene UN
 * trabajo: traducir el edificio a situaciones. No a números.
 *
 * QUÉ QUEDA FUERA DEL PAYLOAD, A PROPÓSITO
 *
 * 1 · EL RECUBRIMIENTO FORZADO A MANO. `recubrimientoManual` pisa el que sale
 *     de sumar cmin y Δcdev, y el cuadro lo imprime con el mismo aspecto que
 *     el derivado. Si el asistente pudiera escribirlo, el documento diría un
 *     recubrimiento con pinta de venir de las tablas 44.2 que en realidad
 *     habría salido de la memoria de un modelo de lenguaje. Es el mismo fallo
 *     que escribir la `ab` del IGN en el sísmico: la herramienta firmaría la
 *     alucinación. Si el proyectista quiere forzarlo, lo teclea él y el
 *     formulario lo deja marcado.
 *
 * 2 · LA RESISTENCIA AL FUEGO NO SE DEDUCE AQUÍ. `minutos` SÍ es un campo del
 *     payload —el usuario dice «R90 en las plantas sobre rasante» y eso hay que
 *     poder escribirlo—, pero la R exigida la fija el proyecto de incendios por
 *     la tabla 3.1 del DB SI 6 (uso y altura de evacuación), y este módulo no
 *     la calcula a propósito. El prompt prohíbe deducirla: sólo se escribe lo
 *     que el usuario diga.
 *
 * 3 · LA TABLA DE ANCLAJES. `diametrosAnclaje` y `hormigonesAnclaje` eligen QUÉ
 *     columnas tiene un cuadro de consulta del Anejo 19; no son materiales de
 *     la obra y no cambian una sola prescripción.
 *
 * SEGURIDAD — las magnitudes DERIVADAS, no los campos
 * Bajar la fck de una fila es visible; cambiar «al exterior a la lluvia» por
 * «interior seco» no lo es, y sin embargo rebaja a la vez el recubrimiento, la
 * fck mínima y el cemento mínimo de esa fila. Así que el detector evalúa el
 * cuadro antes y después y compara, fila a fila, el recubrimiento nominal y la
 * fck adoptada del hormigón, la clase de uso de la madera, y en el acero la
 * clase de ejecución. Aparte van los apagados: quitar un material del cuadro o
 * borrar filas no es una caída de magnitud y ninguna función de nivel lo ve.
 *
 * Y por qué el gate de los riesgos escalares es propio y no `detectResolvedRisks`:
 * su gate compara `current[k] !== defaults[k]` sobre claves del ESTADO, y las de
 * este módulo (`estudio`, `aceroEstr`) son objetos — dos objetos recién
 * construidos nunca son idénticos, así que daría «establecido» siempre. El de
 * aquí compara la magnitud resuelta con la de fábrica. Mismo giro que en
 * `cargasPlanta.ts`.
 */

import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import type { AiResultsSummary } from '../resultsSummary';
import {
  higherIsSafer,
  ordinalLevel,
  type AiSafetyRisk,
  type ResolvedSafetyRule,
  type SafetyRule,
} from '../safety';
import type { UnitSystem } from '../../units/types';
import { AMBITOS_FUEGO } from '../../materiales/fuego';
import { FY_ACERO_ESTRUCTURAL, FYK_ACERO_PASIVO } from '../../materiales/tablasCE';
import type {
  AceroEstructural,
  AceroPasivo,
  AgresividadQuimica,
  CategoriaEjecucion,
  CategoriaUso,
  ClaseCorrosividad,
  ClaseUso,
  Consistencia,
  MallaElectrosoldada,
  MedioUnion,
  NivelControlEjecucion,
  NivelControlHormigon,
  NivelRiesgo,
  ProteccionAcero,
  TipoCemento,
  TipoMadera,
} from '../../materiales/types';
import {
  ESPECIES,
  ORDEN_SITUACIONES,
  ORDEN_SITUACIONES_MADERA,
  PRESETS_HORMIGON,
  SITUACIONES,
  SITUACIONES_MADERA,
  TIPOS_MADERA,
  type SituacionId,
  type SituacionMaderaId,
} from '../../../features/materiales/catalogos';
import {
  defaultMaterialesState,
  evaluar,
  nuevoId,
  type Evaluacion,
  type FilaAcero,
  type FilaFuego,
  type FilaHormigon,
  type FilaMadera,
  type MaterialesState,
} from '../../../features/materiales/state';

// ── Catálogo del módulo ──────────────────────────────────────────────────────

const SITUACIONES_IDS: readonly SituacionId[] = ORDEN_SITUACIONES;
const SITUACIONES_MADERA_IDS: readonly SituacionMaderaId[] = ORDEN_SITUACIONES_MADERA;
const CONSISTENCIAS_IDS: readonly Consistencia[] = ['seca', 'plastica', 'blanda', 'fluida', 'liquida'];
const ACEROS_PASIVOS: readonly AceroPasivo[] = ['B400S', 'B500S', 'B400SD', 'B500SD'];
const MALLAS: readonly MallaElectrosoldada[] = ['ME-500 T', 'ME-500 SD'];
const ACEROS_ESTRUCTURALES: readonly AceroEstructural[] = ['S235JR', 'S275JR', 'S355JR', 'S355J2', 'S450J0'];
const CONTROLES_HORMIGON: readonly NivelControlHormigon[] = ['estadistico', 'indirecto', '100_por_100'];
const CONTROLES_EJECUCION: readonly NivelControlEjecucion[] = ['normal', 'in_situ_intenso', 'prefabricado_intenso'];
const CEMENTOS: readonly TipoCemento[] = [
  'CEM I', 'CEM II/A-D', 'CEM II/A-P', 'CEM II/A-S', 'CEM II/A-V',
  'CEM II/B-S', 'CEM II/B-P', 'CEM II/B-V', 'CEM III/A', 'CEM III/B', 'CEM IV', 'CEM V',
];
const AGRESIVIDADES: readonly AgresividadQuimica[] = ['ninguna', 'debil', 'moderada', 'alta'];
const NIVELES_RIESGO: readonly NivelRiesgo[] = ['CC1', 'CC2', 'CC3'];
const CATEGORIAS_USO: readonly CategoriaUso[] = ['SC1', 'SC2'];
const CATEGORIAS_EJECUCION: readonly CategoriaEjecucion[] = ['PC1', 'PC2'];
const CORROSIVIDADES: readonly ClaseCorrosividad[] = ['C1', 'C2', 'C3', 'C4', 'C5'];
const UNIONES: readonly MedioUnion[] = ['soldadura', 'atornillado'];
const TIPOS_MADERA_IDS: readonly TipoMadera[] = TIPOS_MADERA.map((t) => t.id);
const ESPECIES_IDS: readonly string[] = ESPECIES.map((e) => e.id);
const AMBITOS: readonly string[] = AMBITOS_FUEGO.map((a) => a.etiqueta);
const MINUTOS_FUEGO: readonly number[] = [30, 60, 90, 120, 180, 240];

/** Todas las clases resistentes del catálogo, con el tipo al que pertenecen. */
const CLASES_POR_TIPO = new Map<TipoMadera, readonly string[]>(
  TIPOS_MADERA.map((t) => [t.id, t.grupos.flatMap((g) => g.clases)] as const),
);
const CLASES_MADERA: readonly string[] = [...new Set([...CLASES_POR_TIPO.values()].flat())];

/**
 * `proteccion` es opcional en el estado: sin valor manda la sugerida para la
 * clase de corrosividad. En el payload no puede faltar un campo (el modo
 * strict exige `required` exhaustivo), así que el centinela es explícito.
 */
const PROTECCIONES: readonly string[] = ['sugerida', 'pintura', 'galvanizado', 'ninguna'];

const SIT_LABEL = (id: SituacionId) => SITUACIONES[id].etiqueta;
const SIT_MADERA_LABEL = (id: SituacionMaderaId) => SITUACIONES_MADERA[id].etiqueta;

/** Las situaciones y su explicación, para meterlas en la descripción del schema. */
const listaSituaciones = (): string =>
  SITUACIONES_IDS.map((id) => `"${id}" ${SITUACIONES[id].etiqueta}`).join('; ');

const listaSituacionesMadera = (): string =>
  SITUACIONES_MADERA_IDS.map((id) => `"${id}" ${SITUACIONES_MADERA[id].etiqueta}`).join('; ');

const listaEspecies = (): string => ESPECIES.map((e) => `"${e.id}" ${e.etiqueta}`).join('; ');

const listaPresets = (): string => Object.keys(PRESETS_HORMIGON).join(', ');

// ── Payload schema ───────────────────────────────────────────────────────────
//
// Presupuesto de uniones Anthropic: 7 anulables de primer nivel + la unión de
// `proposal` del envelope = 8, sobre un tope de 16. El margen es a propósito:
// los campos de DENTRO de los objetos y las filas NO son anulables, porque un
// objeto agrupado se manda entero o no se manda, y una lista que reemplaza no
// tiene «sin cambio» dentro de una fila.

export const MATERIALES_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['materiales_usados', 'estudio', 'obra', 'fuego', 'hormigon', 'madera', 'acero', 'warnings'],
  properties: {
    materiales_usados: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['hormigon', 'acero_estructural', 'madera'],
      description: 'De qué es la estructura. Lo que se pone a false DESAPARECE del formulario y del cuadro: no lo apagues si la obra lo lleva. null = sin cambio.',
      properties: {
        hormigon: { type: 'boolean', description: 'La obra tiene hormigón estructural.' },
        acero_estructural: { type: 'boolean', description: 'La obra tiene acero estructural (perfiles laminados, chapas).' },
        madera: { type: 'boolean', description: 'La obra tiene madera estructural.' },
      },
    },
    estudio: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: [
        'acero_pasivo', 'malla', 'acero_estructural', 'control_hormigon', 'control_acero',
        'control_ejecucion', 'tam_max_arido_mm', 'vida_util_anios', 'cemento',
      ],
      description: 'Los datos generales del despacho: lo que no cambia de una obra a otra. Mándalo SÓLO si el usuario habla de alguno de estos campos; si no, null. Va entero: los nueve campos, con el valor que ya tienen los que no cambien.',
      properties: {
        acero_pasivo: {
          type: 'string',
          enum: [...ACEROS_PASIVOS],
          description: 'Acero de las armaduras pasivas (CE art. 32). "B400S" y "B500S" soldables; "B400SD" y "B500SD" además de ductilidad alta, que es lo que pide el cap. 4 de la NCSE-02 en zona sísmica. El número es el límite elástico en N/mm².',
        },
        malla: {
          type: 'string',
          enum: [...MALLAS, 'ninguna'],
          description: 'Malla electrosoldada (CE art. 34). "ninguna" si la obra no lleva.',
        },
        acero_estructural: {
          type: 'string',
          enum: [...ACEROS_ESTRUCTURALES],
          description: 'Grado del acero de los perfiles (UNE-EN 10025-2). El número es el límite elástico en N/mm² para espesores de hasta 16 mm. OJO: soldar S355 o superior obliga a categoría de ejecución PC2 aunque se suelde en taller (CE 91.2.2.2), y el motor lo corrige solo.',
        },
        control_hormigon: {
          type: 'string',
          enum: [...CONTROLES_HORMIGON],
          description: 'Modalidad de control de la resistencia del hormigón (CE art. 86): "estadistico" el habitual, "indirecto" para obras pequeñas con fck limitada, "100_por_100" control de toda la producción.',
        },
        control_acero: {
          type: 'string',
          description: 'Nivel de control del acero, texto libre como se imprime en el cuadro. Lo normal es "Normal".',
        },
        control_ejecucion: {
          type: 'string',
          enum: [...CONTROLES_EJECUCION],
          description: 'Control de ejecución (CE tabla 43.4.1), que fija el margen de recubrimiento: "normal" obra corriente, +10 mm; "in_situ_intenso" +5 mm; "prefabricado_intenso" +0 mm. SUBIR EL CONTROL BAJA EL RECUBRIMIENTO: declararlo intenso sin que la obra lo tenga adelgaza el recubrimiento de todo el cuadro.',
        },
        tam_max_arido_mm: {
          type: 'number',
          description: 'Tamaño máximo del árido, MILÍMETROS. Lo corriente es 20. Interviene en el recubrimiento por adherencia (>= 0,8 por el tamaño máximo) y en la tipificación.',
        },
        vida_util_anios: {
          type: 'number',
          enum: [50, 100],
          description: 'Vida útil de proyecto: 50 años en edificación, 100 en obra singular. A 100 años los recubrimientos suben.',
        },
        cemento: {
          type: 'string',
          enum: [...CEMENTOS],
          description: 'Tipo de cemento. La familia cambia el recubrimiento mínimo (tablas 44.2.1.1) y qué clases de exposición admite. "CEM II/B-S" con escoria es el habitual en edificación.',
        },
      },
    },
    obra: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['costa', 'heladas', 'terreno_agresivo'],
      description: 'Los tres modificadores del emplazamiento, que afectan a TODAS las filas de hormigón a la vez. null = sin cambio.',
      properties: {
        costa: {
          type: 'boolean',
          description: 'La obra está a menos de 5 km de la costa: añade la clase XS1 a todo lo que tenga caras al aire libre (CE tabla 27.1.a). Apagarlo quita esa clase de toda la obra.',
        },
        heladas: {
          type: 'boolean',
          description: 'Zona con heladas —humedad invernal por encima del 75 % y probabilidad anual mayor del 50 % de bajar de -5 °C (nota 1 de la tabla 27.1.a)—: añade XF1 a las caras al aire libre que reciben lluvia.',
        },
        terreno_agresivo: {
          type: 'string',
          enum: [...AGRESIVIDADES],
          description: 'Agresividad química del terreno (CE tabla 27.1.b), que añade XA1/XA2/XA3 a lo enterrado: "ninguna", "debil" XA1, "moderada" XA2, "alta" XA3. LO DICE EL ESTUDIO GEOTÉCNICO, no tú: si el usuario no te lo da, deja este objeto en null y pregúntaselo.',
        },
      },
    },
    fuego: {
      type: ['array', 'null'],
      description: 'Resistencia al fuego exigida a la estructura (DB SI 6), por partes. Lista COMPLETA: REEMPLAZA la actual entera; null = sin cambio; lista vacía = el cuadro no dice nada del fuego. NO DEDUZCAS LA R: la fija el proyecto de incendios por la tabla 3.1 del DB SI 6, y sólo se escribe la que el usuario diga.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ambito', 'minutos'],
        properties: {
          ambito: {
            type: 'string',
            description: `A qué parte de la estructura se le exige. Los habituales, tal cual: ${AMBITOS.map((a) => `"${a}"`).join(', ')}. Vale cualquier otro texto si el proyecto exige una R a una zona concreta.`,
          },
          minutos: {
            type: 'number',
            enum: [...MINUTOS_FUEGO],
            description: 'Minutos de la R exigida: 30, 60, 90, 120, 180 o 240.',
          },
        },
      },
    },
    hormigon: {
      type: ['array', 'null'],
      description: `Lista COMPLETA de elementos de hormigón del cuadro (REEMPLAZA la actual entera; null = sin cambio). Una fila por grupo de elementos que comparte ambiente y resistencia, en el orden en que se lee el cuadro. Conserva el orden de las filas existentes y añade las nuevas al final. Nombres que rellenan la fila sola: ${listaPresets()}.`,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'situacion', 'fck_Nmm2', 'consistencia'],
        properties: {
          nombre: {
            type: 'string',
            description: 'Cómo se llama el grupo en el cuadro: "Cimentación", "Pilares", "Forjados", "Muros de sótano".',
          },
          situacion: {
            type: 'string',
            enum: [...SITUACIONES_IDS],
            description: `DÓNDE ESTÁ el elemento. Es EL dato de esta fila: de aquí salen las clases de exposición de la tabla 27.1.a y, con ellas, el recubrimiento, la relación a/c, el cemento mínimo y la fck mínima. Opciones: ${listaSituaciones()}.`,
          },
          fck_Nmm2: {
            type: 'number',
            description: 'Resistencia característica especificada a 28 días, N/mm². Lo corriente en edificación es 25 o 30; el hormigón de limpieza va con 15. Es un MÍNIMO: si la durabilidad exige más (tabla 43.2.1.b), la aplicación sube la adoptada y lo dice. No hace falta que la infles tú.',
          },
          consistencia: {
            type: 'string',
            enum: [...CONSISTENCIAS_IDS],
            description: 'Consistencia del hormigón fresco (CE tabla 33.5.a): "seca", "plastica", "blanda", "fluida", "liquida". El art. 33.5 prescribe FLUIDA a pilares, vigas y forjados; la aplicación lo pone sola en esos nombres.',
          },
        },
      },
    },
    madera: {
      type: ['array', 'null'],
      description: 'Lista COMPLETA de grupos de madera del cuadro (REEMPLAZA la actual entera; null = sin cambio). Sólo tiene sentido con materiales_usados.madera = true.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'situacion', 'tipo', 'clase_resistente', 'especie'],
        properties: {
          nombre: { type: 'string', description: 'Cómo se llama el grupo: "Vigas y pilares", "Correas de cubierta", "Pérgola".' },
          situacion: {
            type: 'string',
            enum: [...SITUACIONES_MADERA_IDS],
            description: `DÓNDE ESTÁ la madera. De aquí salen la clase de servicio (DB SE-M 2.2.2.2), la clase de uso y el tratamiento exigido (tabla 3.1). Opciones: ${listaSituacionesMadera()}.`,
          },
          tipo: {
            type: 'string',
            enum: [...TIPOS_MADERA_IDS],
            description: '"maciza" madera aserrada; "laminada" laminada encolada.',
          },
          clase_resistente: {
            type: 'string',
            enum: [...CLASES_MADERA],
            description: 'Clase resistente. Las C son coníferas y chopo y las D frondosas, las dos de madera ASERRADA; las GL son de LAMINADA ENCOLADA. Tiene que corresponder con el tipo: una GL24h con tipo "maciza" se rechaza.',
          },
          especie: {
            type: 'string',
            enum: [...ESPECIES_IDS],
            description: `Especie botánica, que junto con la clase resistente da la calidad visual exigida (DB SE-M tabla C.1) y la durabilidad natural. Opciones: ${listaEspecies()}.`,
          },
        },
      },
    },
    acero: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['nivel_riesgo', 'categoria_uso', 'categoria_ejecucion', 'elementos'],
      description: 'El bloque de acero estructural: las tres categorías de las que sale la clase de ejecución EXC (CE art. 91) y la lista de elementos. Sólo tiene sentido con materiales_usados.acero_estructural = true. null = sin cambio.',
      properties: {
        nivel_riesgo: {
          type: 'string',
          enum: [...NIVELES_RIESGO],
          description: 'Clase de consecuencias (CE 91.2.1): "CC1" poca gente cerca (naves, almacenes), "CC2" edificios normales (viviendas, oficinas), "CC3" mucha ocupación (auditorios, hospitales).',
        },
        categoria_uso: {
          type: 'string',
          enum: [...CATEGORIAS_USO],
          description: 'CE 91.2.2.1: "SC1" cargas casi estáticas, que es la edificación corriente; "SC2" fatiga o vibraciones (puentes grúa, maquinaria) o uniones con ductilidad sísmica.',
        },
        categoria_ejecucion: {
          type: 'string',
          enum: [...CATEGORIAS_EJECUCION],
          description: 'CE 91.2.2.2: "PC1" sin soldaduras o soldadas en taller con acero por debajo de S355; "PC2" soldadura en S355 o superior, en obra de elementos principales, tratamiento térmico o huecos con boca de lobo. Declarar PC1 con un S355 soldado no sirve de nada: el motor lo sube a PC2 y lo dice.',
        },
        elementos: {
          type: 'array',
          description: 'Lista COMPLETA de grupos de elementos de acero, en el orden del cuadro.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['nombre', 'union', 'caracteristicas_union', 'corrosividad', 'proteccion', 'caracteristicas_proteccion'],
            properties: {
              nombre: { type: 'string', description: 'Cómo se llama el grupo: "Soportes", "Jácenas", "Chapas", "Correas".' },
              union: { type: 'string', enum: [...UNIONES], description: 'Medio de unión principal del grupo.' },
              caracteristicas_union: {
                type: 'string',
                description: 'Detalle que se imprime: con soldadura, el tipo ("En ángulo", "A tope con penetración completa"); con tornillos, el grado ("5.6", "8.8", "10.9").',
              },
              corrosividad: {
                type: 'string',
                enum: [...CORROSIVIDADES],
                description: 'Clase de corrosividad del ambiente (UNE-EN ISO 12944-2): "C1" interior seco y limpio, "C2" interior sin calefacción o rural, "C3" urbano o industrial y costa poco salina, "C4" industrial o costero de salinidad moderada, "C5" junto al mar o industria agresiva.',
              },
              proteccion: {
                type: 'string',
                enum: [...PROTECCIONES],
                description: 'Protección frente a la corrosión. "sugerida" deja la que la aplicación propone para esa clase de corrosividad, y es lo normal; "pintura", "galvanizado" o "ninguna" la prescriben a mano.',
              },
              caracteristicas_proteccion: {
                type: 'string',
                description: 'Detalle de la protección cuando se prescribe a mano ("Doble capa", "En fábrica", "Dúplex: galvanizado + pintura"). Cadena vacía con "sugerida".',
              },
            },
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

const PROMPT_RULES = `Reglas específicas del módulo Cuadro de materiales (Código Estructural, DB SE-M y DB SI 6):
1. UNIDADES: las resistencias en N/mm² (= MPa), el tamaño máximo del árido y los recubrimientos en MILÍMETROS, la vida útil en años, la resistencia al fuego en minutos. Añade un warning con cada conversión (kp/cm² a N/mm² se divide por 10,2: un H-250 de la vieja EHE son 25 N/mm²).
2. TU TRABAJO ES TRADUCIR EL EDIFICIO A SITUACIONES, NO A NÚMEROS. El cuadro no se teclea, se deriva: de dónde está cada elemento salen las clases de exposición de la tabla 27.1.a, y de ellas el recubrimiento (tablas 44.2.1.1), la relación a/c máxima y el cemento mínimo (43.2.1.a), la resistencia mínima (43.2.1.b) y la tipificación (33.6). Si aciertas la situación, el resto lo pone la norma. No cites de memoria un recubrimiento ni una relación a/c: el módulo los calcula y los enseña en los resultados.
3. EL RECUBRIMIENTO NO ES UN CAMPO DE TU PROPUESTA. Se puede forzar a mano en el formulario, pero no desde aquí: el cuadro lo imprime con el mismo aspecto tenga el origen que tenga, y un recubrimiento tuyo saldría con pinta de venir de las tablas 44.2. Si el usuario quiere forzarlo, dile que lo teclee en la fila, donde queda marcado como forzado.
4. LA RESISTENCIA AL FUEGO NO SE DEDUCE. La R exigida la fija el proyecto de incendios con la tabla 3.1 del DB SI 6, por uso y altura de evacuación, y este módulo NO la calcula a propósito. Escribe "fuego" SÓLO con lo que el usuario te diga ("R90 en las plantas sobre rasante"). Si no lo sabe, dile de dónde sale y no se lo adivines: un R60 inventado se imprime en la memoria como una exigencia del proyecto.
5. LA AGRESIVIDAD DEL TERRENO LA DICE EL GEOTÉCNICO. XA1, XA2 y XA3 salen de los sulfatos, el pH y el CO2 agresivo medidos en el informe (tabla 27.1.b), no de que el terreno "parezca" arcilloso. Si no te lo dan, deja "obra" en null y pregúntalo.
6. LA COSTA Y LAS HELADAS TIENEN CRITERIO ESCRITO. Costa es a menos de 5 km del mar (tabla 27.1.a). Helada es humedad invernal por encima del 75 % y probabilidad anual mayor del 50 % de bajar de -5 ºC (nota 1). No los marques "por si acaso" ni los desmarques porque el usuario no los mencione: si la obra está en un sitio que no conoces, pregunta.
7. UNA FILA POR GRUPO QUE COMPARTE AMBIENTE. No hace falta una fila por elemento: el cuadro agrupa. Lo habitual en un edificio de viviendas son cuatro o cinco filas —cimentación, muros de sótano, pilares, vigas y forjados, hormigón de limpieza—, y se añaden las que tengan ambiente propio (vaso de piscina, losa de aparcamiento, estructura a la intemperie). Las listas "hormigon", "madera" y "acero.elementos" REEMPLAZAN la actual entera: mándalas completas cada turno.
8. TODA FILA NECESITA SITUACIÓN. Una fila sin situación es un hueco rojo que bloquea exportar y publicar. Si no sabes dónde está un elemento, pregúntalo antes de proponer la fila; no la mandes a medias ni le pongas la situación más suave por defecto.
9. LA fck ES UN MÍNIMO, NO UN OBJETIVO. Pon la que el usuario especifique (25 o 30 es lo corriente en edificación; el hormigón de limpieza va con 15). Si la durabilidad exige más, la aplicación sube la adoptada y lo dice en los resultados: no la infles tú "por seguridad" ni la bajes para ajustar.
10. NO APAGUES UN MATERIAL PARA SIMPLIFICAR. Poner materiales_usados a false borra ese bloque del formulario y del cuadro impreso. Se apaga sólo cuando la obra de verdad no lo lleva.
11. LA CLASE RESISTENTE Y EL TIPO DE MADERA VAN JUNTOS. Las C y las D son madera ASERRADA (C coníferas y chopo, D frondosas); las GL son LAMINADA ENCOLADA. Una GL24h con tipo "maciza" se rechaza. Y la especie no es decorativa: con la clase resistente da la calidad visual que hay que exigir (tabla C.1 del DB SE-M).
12. LO QUE NO CAMBIAS, DÉJALO EN NULL. null es «sin cambio», y cada bloque o lista que devuelvas con el valor que ya tiene se convierte en una fila de «no aplicado» que el usuario tiene que leer entera para descubrir que no dice nada. Si el enunciado no habla de la madera, del acero o de los datos generales del estudio, esos campos van a null.
13. ESTE MÓDULO NO COMPRUEBA NINGUNA SECCIÓN. Entrega las prescripciones de material: tipificación, recubrimiento, clases de exposición, coeficientes parciales, tratamiento de la madera y clase de ejecución del acero. No dimensiona nada, y que el cuadro salga entero no significa que la estructura cumpla.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Edificio de viviendas de 4 plantas con sótano de garaje en Málaga capital, a 300 m del mar. '
  + 'Cimentación por zapatas, muros de sótano, pilares y forjados de hormigón. Se exige R90 en las '
  + 'plantas sobre rasante y R120 en el sótano.';

// ── Parseo defensivo ─────────────────────────────────────────────────────────

export interface MaterialesUsadosAi {
  hormigon: boolean;
  acero_estructural: boolean;
  madera: boolean;
}

export interface EstudioAi {
  acero_pasivo: AceroPasivo;
  malla: string;
  acero_estructural: AceroEstructural;
  control_hormigon: NivelControlHormigon;
  control_acero: string;
  control_ejecucion: NivelControlEjecucion;
  tam_max_arido_mm: number;
  vida_util_anios: number;
  cemento: TipoCemento;
}

export interface ObraAi {
  costa: boolean;
  heladas: boolean;
  terreno_agresivo: AgresividadQuimica;
}

export interface FuegoAi {
  ambito: string;
  minutos: number;
}

export interface HormigonAi {
  nombre: string;
  situacion: SituacionId;
  fck_Nmm2: number;
  consistencia: Consistencia;
}

export interface MaderaAi {
  nombre: string;
  situacion: SituacionMaderaId;
  tipo: TipoMadera;
  clase_resistente: string;
  especie: string;
}

export interface ElementoAceroAi {
  nombre: string;
  union: MedioUnion;
  caracteristicas_union: string;
  corrosividad: ClaseCorrosividad;
  proteccion: string;
  caracteristicas_proteccion: string;
}

export interface AceroAi {
  nivel_riesgo: NivelRiesgo;
  categoria_uso: CategoriaUso;
  categoria_ejecucion: CategoriaEjecucion;
  elementos: ElementoAceroAi[];
}

interface MaterialesPayload {
  materiales_usados: MaterialesUsadosAi | null;
  estudio: EstudioAi | null;
  obra: ObraAi | null;
  fuego: FuegoAi[] | null;
  hormigon: HormigonAi[] | null;
  madera: MaderaAi[] | null;
  acero: AceroAi | null;
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

const D = defaultMaterialesState();

function parseEstudio(raw: Record<string, unknown>): EstudioAi {
  const e = D.estudio;
  return {
    acero_pasivo: unoDe(raw.acero_pasivo, ACEROS_PASIVOS, e.aceroPasivo),
    malla: unoDe(raw.malla, [...MALLAS, 'ninguna'] as const, e.malla ?? 'ninguna'),
    acero_estructural: unoDe(raw.acero_estructural, ACEROS_ESTRUCTURALES, e.aceroEstructural),
    control_hormigon: unoDe(raw.control_hormigon, CONTROLES_HORMIGON, e.nivelControlHormigon),
    control_acero: textoO(raw.control_acero, e.nivelControlAcero),
    control_ejecucion: unoDe(raw.control_ejecucion, CONTROLES_EJECUCION, e.nivelControlEjecucion),
    tam_max_arido_mm: numeroO(raw.tam_max_arido_mm, e.tamMaxArido),
    vida_util_anios: numeroO(raw.vida_util_anios, e.vidaUtilAnios),
    cemento: unoDe(raw.cemento, CEMENTOS, e.cemento),
  };
}

function parseAcero(raw: Record<string, unknown>): AceroAi {
  const a = D.aceroEstr;
  return {
    nivel_riesgo: unoDe(raw.nivel_riesgo, NIVELES_RIESGO, a.nivelRiesgo),
    categoria_uso: unoDe(raw.categoria_uso, CATEGORIAS_USO, a.categoriaUso),
    categoria_ejecucion: unoDe(raw.categoria_ejecucion, CATEGORIAS_EJECUCION, a.categoriaEjecucion),
    elementos: Array.isArray(raw.elementos)
      ? raw.elementos.filter(esObjeto).map((e) => ({
        nombre: textoO(e.nombre, ''),
        union: unoDe(e.union, UNIONES, 'soldadura'),
        caracteristicas_union: textoO(e.caracteristicas_union, ''),
        corrosividad: unoDe(e.corrosividad, CORROSIVIDADES, 'C1'),
        proteccion: unoDe(e.proteccion, PROTECCIONES, 'sugerida'),
        caracteristicas_proteccion: textoO(e.caracteristicas_proteccion, ''),
      }))
      : [],
  };
}

export function parsePayload(raw: unknown): MaterialesPayload {
  if (!esObjeto(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  return {
    materiales_usados: esObjeto(raw.materiales_usados)
      ? {
        hormigon: boolO(raw.materiales_usados.hormigon, D.usaHormigon),
        acero_estructural: boolO(raw.materiales_usados.acero_estructural, D.usaAceroEstructural),
        madera: boolO(raw.materiales_usados.madera, D.usaMadera),
      }
      : null,
    estudio: esObjeto(raw.estudio) ? parseEstudio(raw.estudio) : null,
    obra: esObjeto(raw.obra)
      ? {
        costa: boolO(raw.obra.costa, D.costa),
        heladas: boolO(raw.obra.heladas, D.heladas),
        terreno_agresivo: unoDe(raw.obra.terreno_agresivo, AGRESIVIDADES, D.terrenoAgresivo),
      }
      : null,
    fuego: Array.isArray(raw.fuego)
      ? raw.fuego.filter(esObjeto).map((f) => ({
        ambito: textoO(f.ambito, ''),
        minutos: numeroO(f.minutos, 0),
      }))
      : null,
    hormigon: Array.isArray(raw.hormigon)
      ? raw.hormigon.filter(esObjeto).map((h) => ({
        nombre: textoO(h.nombre, ''),
        situacion: unoDe(h.situacion, SITUACIONES_IDS, 'interior_seco'),
        fck_Nmm2: numeroO(h.fck_Nmm2, 30),
        consistencia: unoDe(h.consistencia, CONSISTENCIAS_IDS, 'blanda'),
      }))
      : null,
    madera: Array.isArray(raw.madera)
      ? raw.madera.filter(esObjeto).map((m) => ({
        nombre: textoO(m.nombre, ''),
        situacion: unoDe(m.situacion, SITUACIONES_MADERA_IDS, 'interior'),
        tipo: unoDe(m.tipo, TIPOS_MADERA_IDS, 'maciza'),
        clase_resistente: textoO(m.clase_resistente, ''),
        especie: textoO(m.especie, ''),
      }))
      : null,
    acero: esObjeto(raw.acero) ? parseAcero(raw.acero) : null,
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Proyección plana del estado ──────────────────────────────────────────────

const hormigonDe = (f: FilaHormigon): HormigonAi => ({
  nombre: f.nombre,
  // Una fila sin situación es el hueco rojo; en la proyección se marca con la
  // cadena vacía, que NO está en el enum del payload: el modelo la ve y sabe
  // que hay algo que resolver.
  situacion: (f.situacion || '') as SituacionId,
  fck_Nmm2: f.fck,
  consistencia: f.consistencia,
});

const maderaDe = (f: FilaMadera): MaderaAi => ({
  nombre: f.nombre,
  situacion: (f.situacion || '') as SituacionMaderaId,
  tipo: f.tipo,
  clase_resistente: f.claseResistente,
  especie: f.especie,
});

const elementoAceroDe = (f: FilaAcero): ElementoAceroAi => ({
  nombre: f.nombre,
  union: f.union,
  caracteristicas_union: f.caracteristicasUnion,
  corrosividad: f.corrosividad,
  proteccion: f.proteccion ?? 'sugerida',
  caracteristicas_proteccion: f.caracteristicasProteccion ?? '',
});

const estudioDe = (s: MaterialesState): EstudioAi => ({
  acero_pasivo: s.estudio.aceroPasivo,
  malla: s.estudio.malla ?? 'ninguna',
  acero_estructural: s.estudio.aceroEstructural,
  control_hormigon: s.estudio.nivelControlHormigon,
  control_acero: s.estudio.nivelControlAcero,
  control_ejecucion: s.estudio.nivelControlEjecucion,
  tam_max_arido_mm: s.estudio.tamMaxArido,
  vida_util_anios: s.estudio.vidaUtilAnios,
  cemento: s.estudio.cemento,
});

// ── Mapper payload → estado ──────────────────────────────────────────────────

const ALREADY = 'Ya coincide con el valor actual';

export const RECUBRIMIENTO_REASON =
  'El recubrimiento no es un campo del asistente: sale de sumar el mínimo por durabilidad y '
  + 'el margen de ejecución (CE 44.2 y tabla 43.4.1). Si quiere forzarlo, tecléelo en la fila, '
  + 'donde el formulario lo deja marcado como forzado.';

/** Una fila de hormigón propuesta → FilaHormigon, sobre la que ocupaba su sitio. */
function filaHormigonDe(h: HormigonAi, base: FilaHormigon | undefined): FilaHormigon {
  const preset = PRESETS_HORMIGON[h.nombre.trim()];
  return {
    id: base?.id ?? nuevoId(),
    nombre: h.nombre.trim(),
    situacion: h.situacion,
    fck: h.fck_Nmm2,
    consistencia: h.consistencia,
    // El recubrimiento forzado del usuario SOBREVIVE: el asistente no lo
    // escribe, pero tampoco lo borra por debajo.
    recubrimientoManual: base?.recubrimientoManual ?? null,
    ...(preset?.prescripcionFluida ? { prescripcionFluida: true } : {}),
  };
}

function filaMaderaDe(m: MaderaAi, base: FilaMadera | undefined): FilaMadera {
  return {
    id: base?.id ?? nuevoId('m'),
    nombre: m.nombre.trim(),
    situacion: m.situacion,
    tipo: m.tipo,
    claseResistente: m.clase_resistente,
    especie: m.especie,
  };
}

function filaAceroDe(e: ElementoAceroAi, base: FilaAcero | undefined): FilaAcero {
  const fila: FilaAcero = {
    id: base?.id ?? nuevoId('a'),
    nombre: e.nombre.trim(),
    union: e.union,
    caracteristicasUnion: e.caracteristicas_union.trim(),
    corrosividad: e.corrosividad,
  };
  if (e.proteccion !== 'sugerida') {
    fila.proteccion = e.proteccion as ProteccionAcero;
    fila.caracteristicasProteccion = e.caracteristicas_proteccion.trim();
  }
  return fila;
}

// ── Cambios legibles ─────────────────────────────────────────────────────────

const textoHormigon = (h: HormigonAi) =>
  `${SITUACIONES[h.situacion] ? SIT_LABEL(h.situacion) : 'SIN SITUACIÓN'} · fck ${h.fck_Nmm2} N/mm² · ${h.consistencia}`;

const textoMadera = (m: MaderaAi) =>
  `${SITUACIONES_MADERA[m.situacion] ? SIT_MADERA_LABEL(m.situacion) : 'SIN SITUACIÓN'} · ${m.tipo === 'laminada' ? 'laminada' : 'aserrada'} ${m.clase_resistente} · ${m.especie}`;

const textoElementoAcero = (e: ElementoAceroAi) =>
  `${e.union === 'soldadura' ? 'soldadura' : 'tornillos'} ${e.caracteristicas_union} · corrosividad ${e.corrosividad}`
  + (e.proteccion === 'sugerida' ? '' : ` · ${e.proteccion} ${e.caracteristicas_proteccion}`.trimEnd());

const nombreO = (n: string, i: number, que: string) => n.trim() || `${que} ${i + 1}`;

/** Compara dos listas posicionalmente y escribe una línea por fila que cambia. */
function cambiosDeLista<T>(
  clave: string,
  que: string,
  propuestas: readonly T[],
  actuales: readonly T[],
  nombre: (x: T, i: number) => string,
  texto: (x: T) => string,
  changes: AiFieldChange[],
): void {
  const compartidas = Math.min(propuestas.length, actuales.length);
  for (let i = 0; i < compartidas; i++) {
    const antes = `${nombre(actuales[i], i)}: ${texto(actuales[i])}`;
    const despues = `${nombre(propuestas[i], i)}: ${texto(propuestas[i])}`;
    if (antes !== despues) changes.push({ field: `${clave}[${i}]`, label: `${que} ${i + 1}`, before: antes, after: despues });
  }
  for (let i = compartidas; i < propuestas.length; i++) {
    changes.push({
      field: `${clave}[${i}]`,
      label: `${que} nuevo — ${nombre(propuestas[i], i)}`,
      before: '—',
      after: texto(propuestas[i]),
    });
  }
  if (propuestas.length < actuales.length) {
    changes.push({
      field: `${clave}.eliminados`,
      label: `${que}s que se eliminan`,
      before: actuales.slice(propuestas.length).map((x, k) => nombre(x, propuestas.length + k)).join(' · '),
      after: '—',
    });
  }
}

// ── Seguridad ────────────────────────────────────────────────────────────────

/**
 * Igual que en `cargasPlanta.ts`: no hay ninguna regla ESCALAR porque las
 * claves de primer nivel del estado son objetos y arrays. Lo que se protege va
 * por magnitud resuelta o por evaluación del cuadro entero.
 */
export const MATERIALES_SAFETY_RULES: ReadonlyArray<SafetyRule<MaterialesState>> = [];

/** Clase de uso de la madera, de menos a más agresiva (DB SE-M 3.2.1.2). */
const NIVEL_CLASE_USO: Record<ClaseUso, number> = { '1': 1, '2': 2, '3.1': 3, '3.2': 4, '4': 5, '5': 6 };

const CORROSIVIDAD_NIVEL: Record<string, number> = { C1: 1, C2: 2, C3: 3, C4: 4, C5: 5 };

/**
 * Magnitudes resueltas. Entran en el test de contrato como las de la ola 7,
 * pero las consume un detector propio (`riesgosEscalares`) con un gate que
 * compara la magnitud con la de fábrica en vez de comparar objetos del estado
 * por identidad. Ver la cabecera del fichero.
 */
export const MATERIALES_RESOLVED_RULES: ReadonlyArray<ResolvedSafetyRule<MaterialesState>> = [
  {
    id: 'fyk_acero_pasivo',
    label: 'Acero pasivo — límite elástico',
    resolve: (s) => FYK_ACERO_PASIVO[s.estudio.aceroPasivo] ?? null,
    level: higherIsSafer,
    format: (v) => `${v} N/mm²`,
    why: 'Bajar el acero de las armaduras reduce el límite elástico de todo lo armado de la obra, '
      + 'y las secciones ya calculadas con el acero anterior dejan de tener el momento que se les '
      + 'supuso. Además, pasar de SD a S pierde la ductilidad alta que el cap. 4 de la NCSE-02 pide '
      + 'en zona sísmica.',
    fields: ['estudio'],
    confirmKeys: ['estudio'],
  },
  {
    id: 'fy_acero_estructural',
    label: 'Acero estructural — límite elástico',
    resolve: (s) => (s.usaAceroEstructural ? (FY_ACERO_ESTRUCTURAL[s.estudio.aceroEstructural] ?? null) : null),
    level: higherIsSafer,
    format: (v) => `${v} N/mm²`,
    why: 'Bajar el grado del acero reduce el límite elástico de todos los perfiles, y los que ya '
      + 'estén dimensionados con el grado anterior quedan sin comprobar.',
    fields: ['estudio'],
    confirmKeys: ['estudio'],
  },
  {
    id: 'clase_ejecucion',
    label: 'Acero — clase de ejecución EXC',
    resolve: (s) => (s.usaAceroEstructural ? (evaluar(s).acero?.claseEjecucion ?? null) : null),
    level: higherIsSafer,
    format: (v) => `EXC${v}`,
    why: 'La clase de ejecución fija el control de soldaduras, los ensayos no destructivos y las '
      + 'tolerancias que se exigen en taller y en obra (CE art. 91). Bajarla afloja el control de '
      + 'toda la estructura metálica, y va al plano y al pliego.',
    fields: ['aceroEstr'],
    confirmKeys: ['acero'],
  },
  {
    id: 'costa',
    label: 'Obra en la costa',
    resolve: (s) => (s.costa ? 1 : 0),
    // `higherIsSafer` sobre el 1/0, NO `trueIsSafer`: una ResolvedSafetyRule
    // resuelve a número, y los ayudantes booleanos devuelven null ante un
    // número — la regla no saltaría jamás y el campo quedaría sin red.
    level: higherIsSafer,
    format: (v) => (v > 0 ? 'sí' : 'no'),
    why: 'Desmarcarlo quita la clase XS1 de todo lo que tiene caras al aire libre, y con ella baja '
      + 'el recubrimiento de media obra. El criterio está escrito: menos de 5 km del mar (tabla 27.1.a).',
    fields: ['costa'],
    confirmKeys: ['obra'],
  },
  {
    id: 'heladas',
    label: 'Zona con heladas',
    resolve: (s) => (s.heladas ? 1 : 0),
    level: higherIsSafer,
    format: (v) => (v > 0 ? 'sí' : 'no'),
    why: 'Desmarcarlo quita la clase XF1 de las caras al aire libre que reciben lluvia. El criterio '
      + 'de la nota (1) de la tabla 27.1.a es de humedad y temperatura, no de impresión.',
    fields: ['heladas'],
    confirmKeys: ['obra'],
  },
  {
    id: 'terreno_agresivo',
    label: 'Agresividad química del terreno',
    resolve: (s) => ({ ninguna: 0, debil: 1, moderada: 2, alta: 3 })[s.terrenoAgresivo],
    level: higherIsSafer,
    format: (v) => ['ninguna', 'débil (XA1)', 'moderada (XA2)', 'alta (XA3)'][v] ?? String(v),
    why: 'Rebajar la agresividad del terreno quita las clases XA de lo enterrado y con ellas el '
      + 'cemento mínimo, la relación a/c y el recubrimiento que protegen la cimentación. Sale de los '
      + 'sulfatos y el pH medidos en el geotécnico (tabla 27.1.b), no de una apreciación.',
    fields: ['terrenoAgresivo'],
    confirmKeys: ['obra'],
  },
];

const EPS = 1e-9;

function riesgosEscalares(
  actual: MaterialesState,
  final: MaterialesState,
  confirmed: ReadonlySet<string>,
): AiSafetyRisk[] {
  // La referencia de fábrica se lee con los MISMOS materiales encendidos que el
  // estado vigente: si no, una magnitud que resuelve a null en el arranque
  // (acero apagado) daría «null != 355» y establecería la regla sin motivo.
  const fabrica: MaterialesState = {
    ...D,
    usaHormigon: actual.usaHormigon,
    usaAceroEstructural: actual.usaAceroEstructural,
    usaMadera: actual.usaMadera,
  };

  const risks: AiSafetyRisk[] = [];
  for (const r of MATERIALES_RESOLVED_RULES) {
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

const CNOM_WHY =
  'El recubrimiento nominal de esta fila baja. Es lo que protege la armadura durante la vida útil '
  + 'del edificio, y sale del ambiente (tabla 27.1.a), del cemento, de la vida útil y del control de '
  + 'ejecución. Compruebe cuál de los cuatro ha cambiado y que responde a la obra real.';

const FCK_WHY =
  'La resistencia adoptada de esta fila baja. Puede ser la especificada, o puede que la durabilidad '
  + 'ya no exija la que exigía: en los dos casos, lo que se pide en central es menos de lo que se pedía.';

const CLASE_USO_WHY =
  'La clase de uso de este grupo de madera baja, y con ella el tratamiento que se exige frente a '
  + 'hongos e insectos (DB SE-M tabla 3.1). La clase de uso la fija dónde está la madera, no lo que '
  + 'convenga al presupuesto.';

const CORROSIVIDAD_WHY =
  'La clase de corrosividad de este grupo baja, y con ella la protección que se prescribe. Sale del '
  + 'ambiente en que vive el perfil (UNE-EN ISO 12944-2), no de lo que se quiera pintar.';

const ELIMINAR_WHY = (que: string) =>
  `La propuesta deja menos ${que} de los que hay. Lo que desaparece deja de prescribirse: `
  + 'no aparece en el cuadro del plano ni en la memoria, y en obra se ejecuta sin指 indicación.';

const APAGAR_WHY =
  'Apagar un material borra su bloque del formulario Y del cuadro impreso: la obra se queda sin las '
  + 'prescripciones de ese material. Sólo se apaga cuando la obra de verdad no lo lleva.';

const FUEGO_WHY =
  'La resistencia al fuego exigida baja, o desaparece. La R la fija el proyecto de incendios con la '
  + 'tabla 3.1 del DB SI 6; rebajarla desde aquí cambia lo que la memoria declara sin que nadie haya '
  + 'revisado el proyecto de incendios.';

/**
 * Riesgos del cuadro: se EVALÚA el estado antes y después y se comparan las
 * magnitudes DERIVADAS fila a fila. Cambiar «al exterior a la lluvia» por
 * «interior seco» no mueve ningún número del formulario y sin embargo rebaja el
 * recubrimiento, la fck mínima y el cemento mínimo de esa fila a la vez.
 *
 * GATE ANTI-RUIDO: si el cuadro sigue siendo el de arranque y el hilo no lo ha
 * tratado, la primera propuesta es RELLENARLO, no debilitarlo.
 */
function riesgosDeCuadro(
  actual: MaterialesState,
  final: MaterialesState,
  confirmed: ReadonlySet<string>,
): AiSafetyRisk[] {
  const risks: AiSafetyRisk[] = [];
  const antes = evaluar(actual);
  const despues = evaluar(final);

  const cuadroDeFabrica =
    JSON.stringify(actual.elementos.map(hormigonDe)) === JSON.stringify(D.elementos.map(hormigonDe))
    && JSON.stringify(actual.maderaGrupos.map(maderaDe)) === JSON.stringify(D.maderaGrupos.map(maderaDe));
  const gateAbierto = !cuadroDeFabrica || confirmed.has('hormigon') || confirmed.has('madera');

  // ── Apagar un material ─────────────────────────────────────────────────────
  const apagados = ([
    ['usaHormigon', 'el hormigón'],
    ['usaAceroEstructural', 'el acero estructural'],
    ['usaMadera', 'la madera'],
  ] as const).filter(([k]) => actual[k] && !final[k]);
  for (const [k, que] of apagados) {
    risks.push({ field: `materiales_usados.${k}`, label: `Se apaga ${que}`, before: 'sí', after: 'no', why: APAGAR_WHY });
  }

  if (gateAbierto) {
    // ── Hormigón: recubrimiento nominal y resistencia adoptada ───────────────
    const compartidas = Math.min(antes.hormigon.length, despues.hormigon.length);
    for (let i = 0; i < compartidas; i++) {
      const a = antes.hormigon[i];
      const d = despues.hormigon[i];
      const rotulo = d.fila.nombre.trim() || `Elemento ${i + 1}`;
      if (a.derivacion.cnom !== null && d.derivacion.cnom !== null && d.derivacion.cnom < a.derivacion.cnom - EPS) {
        risks.push({
          field: `hormigon[${i}].cnom`,
          label: `${rotulo} — recubrimiento nominal`,
          before: `${a.derivacion.cnom} mm`,
          after: `${d.derivacion.cnom} mm`,
          why: CNOM_WHY,
        });
      }
      if (d.derivacion.fckAdoptada < a.derivacion.fckAdoptada - EPS) {
        risks.push({
          field: `hormigon[${i}].fck`,
          label: `${rotulo} — resistencia adoptada`,
          before: `${a.derivacion.fckAdoptada} N/mm²`,
          after: `${d.derivacion.fckAdoptada} N/mm²`,
          why: FCK_WHY,
        });
      }
    }
    if (final.elementos.length < actual.elementos.length) {
      risks.push({
        field: 'hormigon.eliminados',
        label: 'Elementos de hormigón que se eliminan',
        before: `${actual.elementos.length} filas`,
        after: `${final.elementos.length} filas`,
        why: ELIMINAR_WHY('elementos de hormigón'),
      });
    }

    // ── Madera: clase de uso ─────────────────────────────────────────────────
    const nivelUso = ordinalLevel(NIVEL_CLASE_USO);
    const compartidasM = Math.min(antes.madera.length, despues.madera.length);
    for (let i = 0; i < compartidasM; i++) {
      const a = nivelUso(antes.madera[i].derivacion.claseUso);
      const d = nivelUso(despues.madera[i].derivacion.claseUso);
      if (a === null || d === null || d >= a) continue;
      risks.push({
        field: `madera[${i}].clase_uso`,
        label: `${despues.madera[i].fila.nombre.trim() || `Grupo ${i + 1}`} — clase de uso`,
        before: antes.madera[i].derivacion.claseUso,
        after: despues.madera[i].derivacion.claseUso,
        why: CLASE_USO_WHY,
      });
    }
    if (final.maderaGrupos.length < actual.maderaGrupos.length) {
      risks.push({
        field: 'madera.eliminados',
        label: 'Grupos de madera que se eliminan',
        before: `${actual.maderaGrupos.length} grupos`,
        after: `${final.maderaGrupos.length} grupos`,
        why: ELIMINAR_WHY('grupos de madera'),
      });
    }
  }

  // ── Acero: corrosividad por elemento ───────────────────────────────────────
  if (actual.usaAceroEstructural && final.usaAceroEstructural) {
    const nivelCorr = ordinalLevel(CORROSIVIDAD_NIVEL);
    const ea = actual.aceroEstr.elementos;
    const ed = final.aceroEstr.elementos;
    const deFabrica = JSON.stringify(ea.map(elementoAceroDe)) === JSON.stringify(D.aceroEstr.elementos.map(elementoAceroDe));
    if (!deFabrica || confirmed.has('acero')) {
      for (let i = 0; i < Math.min(ea.length, ed.length); i++) {
        const a = nivelCorr(ea[i].corrosividad);
        const d = nivelCorr(ed[i].corrosividad);
        if (a === null || d === null || d >= a) continue;
        risks.push({
          field: `acero.elementos[${i}].corrosividad`,
          label: `${ed[i].nombre.trim() || `Elemento ${i + 1}`} — corrosividad`,
          before: ea[i].corrosividad,
          after: ed[i].corrosividad,
          why: CORROSIVIDAD_WHY,
        });
      }
      if (ed.length < ea.length) {
        risks.push({
          field: 'acero.elementos.eliminados',
          label: 'Elementos de acero que se eliminan',
          before: `${ea.length} elementos`,
          after: `${ed.length} elementos`,
          why: ELIMINAR_WHY('elementos de acero'),
        });
      }
    }
  }

  // ── Fuego: la R exigida ────────────────────────────────────────────────────
  const fa = antes.fuego;
  const fd = despues.fuego;
  if (fa.length > 0) {
    const porAmbito = new Map(fd.map((f) => [f.ambito, f.minutos]));
    for (const e of fa) {
      const ahora = porAmbito.get(e.ambito);
      if (ahora === undefined) {
        risks.push({
          field: `fuego.${e.ambito}`,
          label: `Fuego — ${e.ambito}`,
          before: `R${e.minutos}`,
          after: 'sin exigencia',
          why: FUEGO_WHY,
        });
      } else if (ahora < e.minutos) {
        risks.push({
          field: `fuego.${e.ambito}`,
          label: `Fuego — ${e.ambito}`,
          before: `R${e.minutos}`,
          after: `R${ahora}`,
          why: FUEGO_WHY,
        });
      }
    }
  }

  return risks;
}

// ── buildPlan ────────────────────────────────────────────────────────────────

function buildMaterialesPlan(
  payload: MaterialesPayload,
  current: MaterialesState,
  confirmed: ReadonlySet<string> = new Set<string>(),
): AiApplyPlan<MaterialesState> {
  const fields: Partial<MaterialesState> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const notFound: string[] = [];
  const warnings = [...payload.warnings];

  const anota = (clave: string, label: string, before: string, after: string) => {
    if (before !== after) changes.push({ field: clave, label, before, after });
  };

  // ── Qué materiales lleva la obra ───────────────────────────────────────────
  if (payload.materiales_usados !== null) {
    const m = payload.materiales_usados;
    const si = (b: boolean) => (b ? 'sí' : 'no');
    if (m.hormigon !== current.usaHormigon) { fields.usaHormigon = m.hormigon; anota('materiales_usados.hormigon', 'La obra tiene hormigón', si(current.usaHormigon), si(m.hormigon)); }
    if (m.acero_estructural !== current.usaAceroEstructural) { fields.usaAceroEstructural = m.acero_estructural; anota('materiales_usados.acero_estructural', 'La obra tiene acero estructural', si(current.usaAceroEstructural), si(m.acero_estructural)); }
    if (m.madera !== current.usaMadera) { fields.usaMadera = m.madera; anota('materiales_usados.madera', 'La obra tiene madera', si(current.usaMadera), si(m.madera)); }
    if (fields.usaHormigon === undefined && fields.usaAceroEstructural === undefined && fields.usaMadera === undefined) {
      skipped.push({ field: 'materiales_usados', label: 'Materiales de la obra', reason: ALREADY });
    }
  }

  // ── Perfil del estudio ─────────────────────────────────────────────────────
  if (payload.estudio !== null) {
    const e = payload.estudio;
    const antes = estudioDe(current);
    const estudio = { ...current.estudio };
    let rechazos = 0;

    if (e.tam_max_arido_mm <= 0 || e.tam_max_arido_mm > 100) {
      skipped.push({ field: 'estudio', label: 'Tamaño máximo del árido', reason: `Fuera de rango: ${e.tam_max_arido_mm} mm (se admite de 1 a 100 mm).` });
      rechazos += 1;
    } else {
      estudio.tamMaxArido = e.tam_max_arido_mm;
    }
    if (e.vida_util_anios !== 50 && e.vida_util_anios !== 100) {
      skipped.push({ field: 'estudio', label: 'Vida útil de proyecto', reason: `El Código Estructural sólo tabula 50 y 100 años; llegó ${e.vida_util_anios}.` });
      rechazos += 1;
    } else {
      // Los dos campos van juntos: el desplegable del formulario escribe los dos.
      estudio.vidaUtil = e.vida_util_anios;
      estudio.vidaUtilAnios = e.vida_util_anios;
    }
    estudio.aceroPasivo = e.acero_pasivo;
    estudio.malla = e.malla === 'ninguna' ? null : (e.malla as MallaElectrosoldada);
    estudio.aceroEstructural = e.acero_estructural;
    estudio.nivelControlHormigon = e.control_hormigon;
    estudio.nivelControlAcero = e.control_acero.trim() || current.estudio.nivelControlAcero;
    estudio.nivelControlEjecucion = e.control_ejecucion;
    estudio.cemento = e.cemento;

    const despues = estudioDe({ ...current, estudio });
    const CAMPOS_ESTUDIO: { k: keyof EstudioAi; label: string }[] = [
      { k: 'acero_pasivo', label: 'Acero pasivo' },
      { k: 'malla', label: 'Malla electrosoldada' },
      { k: 'acero_estructural', label: 'Acero estructural' },
      { k: 'control_hormigon', label: 'Control del hormigón' },
      { k: 'control_acero', label: 'Control del acero' },
      { k: 'control_ejecucion', label: 'Control de ejecución' },
      { k: 'tam_max_arido_mm', label: 'Tamaño máximo del árido' },
      { k: 'vida_util_anios', label: 'Vida útil de proyecto' },
      { k: 'cemento', label: 'Tipo de cemento' },
    ];
    for (const c of CAMPOS_ESTUDIO) {
      anota(`estudio.${c.k}`, c.label, String(antes[c.k]), String(despues[c.k]));
    }
    if (JSON.stringify(despues) !== JSON.stringify(antes)) fields.estudio = estudio;
    else if (rechazos === 0) skipped.push({ field: 'estudio', label: 'Datos generales del estudio', reason: ALREADY });
  }

  // ── Modificadores de obra ──────────────────────────────────────────────────
  if (payload.obra !== null) {
    const o = payload.obra;
    const si = (b: boolean) => (b ? 'sí' : 'no');
    const AGRES: Record<AgresividadQuimica, string> = { ninguna: 'no agresivo', debil: 'débil (XA1)', moderada: 'moderada (XA2)', alta: 'alta (XA3)' };
    let algo = false;
    if (o.costa !== current.costa) { fields.costa = o.costa; anota('obra.costa', 'Obra en la costa', si(current.costa), si(o.costa)); algo = true; }
    if (o.heladas !== current.heladas) { fields.heladas = o.heladas; anota('obra.heladas', 'Zona con heladas', si(current.heladas), si(o.heladas)); algo = true; }
    if (o.terreno_agresivo !== current.terrenoAgresivo) { fields.terrenoAgresivo = o.terreno_agresivo; anota('obra.terreno_agresivo', 'Agresividad del terreno', AGRES[current.terrenoAgresivo], AGRES[o.terreno_agresivo]); algo = true; }
    if (!algo) skipped.push({ field: 'obra', label: 'Modificadores de la obra', reason: ALREADY });
  }

  // ── Resistencia al fuego ───────────────────────────────────────────────────
  if (payload.fuego !== null) {
    const validas = payload.fuego.filter((f) => {
      if (f.ambito.trim() === '') {
        skipped.push({ field: 'fuego', label: 'Exigencia de fuego sin ámbito', reason: 'Una exigencia sin ámbito no se puede imprimir («R60 en .») y además bloquea la exportación.' });
        return false;
      }
      if (!MINUTOS_FUEGO.includes(f.minutos)) {
        skipped.push({ field: 'fuego', label: `Fuego — ${f.ambito.trim()}`, reason: `R${f.minutos} no es una de las resistencias tabuladas (30, 60, 90, 120, 180, 240).` });
        return false;
      }
      return true;
    });
    const filas: FilaFuego[] = validas.map((f, i) => ({
      id: current.exigenciasFuego[i]?.id ?? nuevoId('f'),
      ambito: f.ambito.trim(),
      minutos: f.minutos,
    }));
    const texto = (f: { ambito: string; minutos: number | null }) => `${f.ambito}: R${f.minutos ?? '—'}`;
    cambiosDeLista('fuego', 'Exigencia de fuego', filas, current.exigenciasFuego, (f) => f.ambito, texto, changes);
    if (JSON.stringify(filas) !== JSON.stringify(current.exigenciasFuego.map((f) => ({ id: f.id, ambito: f.ambito, minutos: f.minutos })))) {
      fields.exigenciasFuego = filas;
    } else if (validas.length === payload.fuego.length) {
      skipped.push({ field: 'fuego', label: 'Resistencia al fuego exigida', reason: ALREADY });
    }
  }

  // ── Hormigón ───────────────────────────────────────────────────────────────
  if (payload.hormigon !== null) {
    if (payload.hormigon.length === 0) {
      skipped.push({ field: 'hormigon', label: 'Elementos de hormigón', reason: 'La lista llega vacía. Si la obra no lleva hormigón, apágalo en materiales_usados; si lo lleva, manda las filas.' });
    } else {
      const validas: HormigonAi[] = [];
      for (const h of payload.hormigon) {
        if (h.fck_Nmm2 <= 0 || h.fck_Nmm2 > 100) {
          skipped.push({ field: 'hormigon', label: `${h.nombre.trim() || 'Elemento'} — resistencia`, reason: `Fuera de rango: ${h.fck_Nmm2} N/mm² (se admite de 1 a 100).` });
          continue;
        }
        validas.push(h);
      }
      const filas = validas.map((h, i) => filaHormigonDe(h, current.elementos[i]));
      cambiosDeLista('hormigon', 'Elemento de hormigón', filas.map(hormigonDe), current.elementos.map(hormigonDe),
        (x, i) => nombreO(x.nombre, i, 'Elemento'), textoHormigon, changes);
      if (JSON.stringify(filas.map(hormigonDe)) !== JSON.stringify(current.elementos.map(hormigonDe))) fields.elementos = filas;
      else if (validas.length === payload.hormigon.length) skipped.push({ field: 'hormigon', label: 'Elementos de hormigón', reason: ALREADY });
    }
  }

  // ── Madera ─────────────────────────────────────────────────────────────────
  if (payload.madera !== null) {
    const validas: MaderaAi[] = [];
    for (const m of payload.madera) {
      const clases = CLASES_POR_TIPO.get(m.tipo) ?? [];
      if (!clases.includes(m.clase_resistente)) {
        skipped.push({
          field: 'madera',
          label: `${m.nombre.trim() || 'Grupo'} — clase resistente`,
          reason: `«${m.clase_resistente}» no es una clase de madera ${m.tipo === 'laminada' ? 'laminada encolada' : 'aserrada'}. Las de ese tipo son: ${clases.join(', ')}.`,
        });
        continue;
      }
      if (!ESPECIES_IDS.includes(m.especie)) {
        notFound.push(`Especie «${m.especie}»`);
        skipped.push({
          field: 'madera',
          label: `${m.nombre.trim() || 'Grupo'} — especie`,
          reason: `«${m.especie}» no está en el catálogo del DB SE-M. Use el nombre botánico de una de las tabuladas.`,
        });
        continue;
      }
      validas.push(m);
    }
    const filas = validas.map((m, i) => filaMaderaDe(m, current.maderaGrupos[i]));
    cambiosDeLista('madera', 'Grupo de madera', filas.map(maderaDe), current.maderaGrupos.map(maderaDe),
      (x, i) => nombreO(x.nombre, i, 'Grupo'), textoMadera, changes);
    if (JSON.stringify(filas.map(maderaDe)) !== JSON.stringify(current.maderaGrupos.map(maderaDe))) fields.maderaGrupos = filas;
    else if (validas.length === payload.madera.length) skipped.push({ field: 'madera', label: 'Grupos de madera', reason: ALREADY });
  }

  // ── Acero estructural ──────────────────────────────────────────────────────
  if (payload.acero !== null) {
    const a = payload.acero;
    const antes = current.aceroEstr;
    const elementos = a.elementos.map((e, i) => filaAceroDe(e, antes.elementos[i]));
    const aceroEstr = {
      nivelRiesgo: a.nivel_riesgo,
      categoriaUso: a.categoria_uso,
      categoriaEjecucion: a.categoria_ejecucion,
      elementos: elementos.length > 0 ? elementos : antes.elementos,
    };
    anota('acero.nivel_riesgo', 'Acero — clase de consecuencias', antes.nivelRiesgo, aceroEstr.nivelRiesgo);
    anota('acero.categoria_uso', 'Acero — categoría de uso', antes.categoriaUso, aceroEstr.categoriaUso);
    anota('acero.categoria_ejecucion', 'Acero — categoría de ejecución', antes.categoriaEjecucion, aceroEstr.categoriaEjecucion);
    if (elementos.length > 0) {
      cambiosDeLista('acero.elementos', 'Elemento de acero', elementos.map(elementoAceroDe), antes.elementos.map(elementoAceroDe),
        (x, i) => nombreO(x.nombre, i, 'Elemento'), textoElementoAcero, changes);
    }
    const igual = aceroEstr.nivelRiesgo === antes.nivelRiesgo
      && aceroEstr.categoriaUso === antes.categoriaUso
      && aceroEstr.categoriaEjecucion === antes.categoriaEjecucion
      && JSON.stringify(aceroEstr.elementos.map(elementoAceroDe)) === JSON.stringify(antes.elementos.map(elementoAceroDe));
    if (!igual) fields.aceroEstr = aceroEstr;
    else skipped.push({ field: 'acero', label: 'Acero estructural', reason: ALREADY });
  }

  // ── Riesgos ────────────────────────────────────────────────────────────────
  const final: MaterialesState = { ...current, ...fields };
  const risks = [
    ...riesgosDeCuadro(current, final, confirmed),
    ...riesgosEscalares(current, final, confirmed),
  ];

  return { fields, changes, skipped, notFound, warnings, risks };
}

// ── Snapshot del estado ──────────────────────────────────────────────────────

function buildSnapshot(c: MaterialesState): string {
  const valores: Record<string, unknown> = {
    materiales_usados: { hormigon: c.usaHormigon, acero_estructural: c.usaAceroEstructural, madera: c.usaMadera },
    estudio: estudioDe(c),
    obra: { costa: c.costa, heladas: c.heladas, terreno_agresivo: c.terrenoAgresivo },
    fuego: c.exigenciasFuego.map((f) => ({ ambito: f.ambito, minutos: f.minutos })),
    hormigon: c.elementos.map(hormigonDe),
    madera: c.maderaGrupos.map(maderaDe),
    acero: {
      nivel_riesgo: c.aceroEstr.nivelRiesgo,
      categoria_uso: c.aceroEstr.categoriaUso,
      categoria_ejecucion: c.aceroEstr.categoriaEjecucion,
      elementos: c.aceroEstr.elementos.map(elementoAceroDe),
    },
  };

  const sinConfirmar: string[] = [];
  const igualQueFabrica = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (igualQueFabrica(c.elementos.map(hormigonDe), D.elementos.map(hormigonDe))) sinConfirmar.push('hormigon');
  if (igualQueFabrica(estudioDe(c), estudioDe(D))) sinConfirmar.push('estudio');
  if (!c.costa && !c.heladas && c.terrenoAgresivo === 'ninguna') sinConfirmar.push('obra');
  if (c.exigenciasFuego.length === 0) sinConfirmar.push('fuego');
  if (c.maderaGrupos.length === 0) sinConfirmar.push('madera');
  if (igualQueFabrica(c.aceroEstr.elementos.map(elementoAceroDe), D.aceroEstr.elementos.map(elementoAceroDe))) sinConfirmar.push('acero');

  // Contexto de SOLO LECTURA, dentro de `valores` (ver la nota de seismicNCSE02).
  const ev = evaluar(c);
  valores.derivado_por_la_norma = ev.hormigon.map((h) => ({
    elemento: h.fila.nombre,
    clases_exposicion: h.derivacion.clases,
    tipificacion: h.derivacion.tipificacion,
    recubrimiento_nominal_mm: h.derivacion.cnom,
    fck_adoptada: h.derivacion.fckAdoptada,
    nota: 'Esto NO se teclea: sale de la situación. No es un campo de tu propuesta.',
  }));
  valores.recubrimientos_forzados_a_mano = c.elementos
    .filter((f) => f.recubrimientoManual !== null)
    .map((f) => ({ elemento: f.nombre, mm: f.recubrimientoManual, no_editable: true }));
  valores.huecos_por_resolver = {
    hormigon_sin_situacion: ev.huecos.map((f) => f.nombre || 'sin nombre'),
    madera_sin_situacion: ev.huecosMadera.map((f) => f.nombre || 'sin nombre'),
    fuego_a_medias: ev.huecosFuego.map((f) => f.ambito || 'sin ámbito'),
  };
  valores.cuadro_de_la_plantilla = igualQueFabrica(c.elementos.map(hormigonDe), D.elementos.map(hormigonDe));

  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

const ALCANCE_LINEA =
  'ATENCION: este módulo NO comprueba ninguna sección. Entrega las prescripciones de material: '
  + 'tipificación, recubrimiento, clases de exposición, coeficientes parciales, tratamiento de la '
  + 'madera y clase de ejecución del acero. Que el cuadro salga entero no significa que la '
  + 'estructura cumpla.';

/**
 * Como en cargas por planta, el resultado es un CUADRO y no un veredicto: no
 * hay comprobación que cumpla o incumpla. El veredicto lo dan los huecos y los
 * errores, que son lo único que bloquea exportar y publicar.
 */
export function summarizeMaterialesResults(ev: Evaluacion): AiResultsSummary {
  const lines: string[] = [];
  const huecos = ev.huecos.length + ev.huecosMadera.length + ev.huecosFuego.length;

  if (huecos > 0 || ev.errores > 0) {
    lines.push(`CUADRO INCOMPLETO: ${huecos} hueco${huecos === 1 ? '' : 's'} sin resolver y ${ev.errores} error${ev.errores === 1 ? '' : 'es'}. Bloquean exportar y publicar.`);
  } else {
    lines.push(`CUADRO COMPLETO: ${ev.hormigon.length} elementos de hormigón, ${ev.madera.length} grupos de madera, ${ev.acero ? ev.acero.elementos.length : 0} elementos de acero.`);
  }

  for (const { fila, derivacion } of ev.hormigon) {
    const trozos = [
      `clases ${derivacion.clases.join('+') || '—'}`,
      `tipificación ${derivacion.tipificacion}`,
      `fck adoptada ${derivacion.fckAdoptada} N/mm²${derivacion.fckMin !== null && derivacion.fckMin > fila.fck ? ` (la durabilidad exige ${derivacion.fckMin}, se especificó ${fila.fck})` : ''}`,
      `recubrimiento ${derivacion.cnom === null ? '—' : `${derivacion.cnom} mm`} (cmin ${derivacion.cmin} + Δcdev ${derivacion.deltaCdev})`,
    ];
    if (derivacion.acMax !== null) trozos.push(`a/c ≤ ${derivacion.acMax}`);
    if (derivacion.cementoMin !== null) trozos.push(`cemento ≥ ${derivacion.cementoMin} kg/m³`);
    lines.push(`- Hormigón · ${fila.nombre || 'sin nombre'} [${SITUACIONES[fila.situacion as SituacionId]?.etiqueta ?? 'SIN SITUACIÓN'}]: ${trozos.join(' | ')}`);
    for (const m of derivacion.mensajes) {
      lines.push(`  · ${m.severidad === 'error' ? 'ERROR' : m.severidad === 'aviso' ? 'Aviso' : 'Nota'}: ${m.texto}${m.referencia ? ` — ${m.referencia}` : ''}`);
    }
  }

  for (const f of ev.limpieza) {
    lines.push(`- Hormigón de limpieza · ${f.nombre || 'sin nombre'}: HL-150/C/TM, no estructural.`);
  }

  for (const { fila, derivacion } of ev.madera) {
    lines.push(
      `- Madera · ${fila.nombre || 'sin nombre'} [${SITUACIONES_MADERA[fila.situacion as SituacionMaderaId]?.etiqueta ?? 'SIN SITUACIÓN'}]: `
      + `${fila.tipo === 'laminada' ? 'laminada' : 'aserrada'} ${fila.claseResistente} de ${fila.especie} | `
      + `clase de servicio ${derivacion.claseServicio} | clase de uso ${derivacion.claseUso} | `
      + `penetración ${derivacion.nivelPenetracion} | gammaM = ${derivacion.gammaM}`
      + (derivacion.calidad ? ` | calidad visual exigida ${derivacion.calidad}` : ''),
    );
    for (const m of derivacion.mensajes) {
      lines.push(`  · ${m.severidad === 'error' ? 'ERROR' : m.severidad === 'aviso' ? 'Aviso' : 'Nota'}: ${m.texto}`);
    }
  }

  if (ev.acero) {
    lines.push(
      `- Acero estructural: ${ev.acero.nivelRiesgo} / ${ev.acero.categoriaUso} / `
      + `categoría declarada ${ev.acero.categoriaEjecucionDeclarada}`
      + (ev.acero.categoriaEjecucion !== ev.acero.categoriaEjecucionDeclarada ? ` → EFECTIVA ${ev.acero.categoriaEjecucion}` : '')
      + ` ⇒ clase de ejecución EXC${ev.acero.claseEjecucion}`,
    );
    for (const m of ev.acero.mensajes) {
      lines.push(`  · ${m.severidad === 'error' ? 'ERROR' : m.severidad === 'aviso' ? 'Aviso' : 'Nota'}: ${m.texto}`);
    }
  }

  if (ev.fuego.length > 0) {
    lines.push(`- Fuego exigido: ${ev.fuego.map((f) => `${f.ambito} R${f.minutos}`).join(' · ')}`);
  }

  for (const f of ev.huecos) lines.push(`HUECO: el elemento de hormigón «${f.nombre || 'sin nombre'}» no tiene situación elegida.`);
  for (const f of ev.huecosMadera) lines.push(`HUECO: el grupo de madera «${f.nombre || 'sin nombre'}» no tiene situación elegida.`);
  for (const f of ev.huecosFuego) lines.push(`HUECO: la exigencia de fuego «${f.ambito || 'sin ámbito'}» está a medias.`);

  lines.push(ALCANCE_LINEA);

  const verdict = huecos > 0 || ev.errores > 0 ? 'invalid' : (ev.avisos > 0 ? 'warn' : 'none');
  return { verdict, text: lines.join('\n') };
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export const materialesAdapter: AiModuleAdapter<MaterialesState> = {
  id: 'materiales',
  label: 'Cuadro de materiales',
  payloadSchema: MATERIALES_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  // El cuadro se llena elemento a elemento y en lenguaje de obra: la entrevista
  // es larga, como la de las cargas por planta.
  historyTurns: 16,
  snapshot: buildSnapshot,
  // `system` no se usa: este módulo no ofrece sistema técnico en ningún sitio —
  // las resistencias del Código Estructural van siempre en N/mm².
  buildPlan: (payload, current, _system: UnitSystem, confirmed) =>
    buildMaterialesPlan(parsePayload(payload), current, confirmed),
};
