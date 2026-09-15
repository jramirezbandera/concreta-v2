/**
 * Adapter del asistente IA para el módulo «Incendio» (CTE DB SI 6).
 *
 * El módulo tiene dos mitades y sólo una es conversable.
 *
 * LA R EXIGIDA NO ES SUYA, Y ESTA ES LA EXCLUSIÓN QUE MANDA
 * La resistencia que hay que exigirle a cada sector sale de la tabla 3.1 del DB
 * SI 6 cruzando el USO con la ALTURA DE EVACUACIÓN, y la resuelve esta
 * aplicación. Un modelo al que se le pregunta «¿qué R necesita un edificio de
 * viviendas de cuatro plantas?» contesta «R 60» de memoria, con toda la
 * seguridad del mundo y sin haber mirado ninguna tabla —y acierta lo bastante a
 * menudo como para que nadie lo compruebe—. Aquí ese número es el que se
 * imprime en la memoria y en el plano. Así que `minutosManual` (la R pisada a
 * mano, sector a sector), `exigidaManual` (la de un elemento suelto) y las
 * exigencias tecleadas a pelo quedan FUERA del payload: el modelo dice QUÉ ES
 * cada sector —uso, sótano, aparcamiento robotizado, escalera protegida— y la
 * R la pone la tabla. Es la misma doctrina que la zona eólica en viento y nieve
 * y la `ab` del IGN en el sísmico.
 *
 * LA ALTURA DE EVACUACIÓN SÍ, PERO SÓLO LA QUE DIGA EL USUARIO
 * Es la entrada principal de la tabla, y a la vez un dato del edificio que el
 * proyectista conoce. Va en el payload con la misma regla que el `sk` de viento
 * y nieve: se escribe SÓLO con el número que dé el usuario, nunca sumando las
 * alturas de las plantas. Esa suma la hace `alturasDeEvacuacion` con el
 * convenio del Anejo A, y el dibujo de la sección la enseña; un total calculado
 * por el modelo que no cuadre con la cadena de cotas sería un número con aire
 * de cálculo que no ha salido de ninguna parte.
 *
 * EL λp DEL PRODUCTO TAMPOCO
 * La conductividad declarada de un revestimiento sale de su marcado CE o de su
 * ensayo UNE-EN 13381, y es EL dato que más invita a citar de memoria: un
 * modelo da el λ de catálogo de una lana de roca a 20 ºC sin pestañear, y con
 * él salen 7 mm donde en obra van 40 (ver la cabecera de `protecciones.ts`). El
 * payload elige la FAMILIA del revestimiento; el λp lo teclea quien tenga la
 * ficha del producto delante.
 *
 * LAS LISTAS SON PROYECCIONES, Y LO QUE NO PROYECTAN SE CONSERVA
 * `sectores` y `elementos` reemplazan la lista entera, pero no llevan todos los
 * campos del estado. Al reconstruir se emparejan POR NOMBRE con los que ya
 * había y se arrastra lo que el payload no trae: el tiempo equivalente del
 * Anejo B de un sector —que es media hora de tecleo— y el λp de un elemento. Un
 * reemplazo literal los borraría sin que ninguna fila de la tarjeta lo dijera.
 *
 * SEGURIDAD — la altura y la R, no los campos
 * Lo que este módulo entrega es una exigencia. Una tabla de reglas campo a
 * campo sería ciega a lo que de verdad la mueve: marcar una cubierta como «de
 * ocupación nula» no toca ningún número y baja la altura de evacuación de todo
 * el edificio, y con ella la R de cada sector. Así que el detector EVALÚA el
 * estado antes y después y compara la altura de evacuación resuelta y la R de
 * cada sector, más lo que desaparece de las listas.
 */

import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import type { AiResultsSummary } from '../resultsSummary';
import { higherIsSafer, type AiSafetyRisk, type ResolvedSafetyRule, type SafetyRule } from '../safety';
import type { UnitSystem } from '../../units/types';
import { TIPOS_HORMIGON, type TipoHormigon } from '../../incendio/anejoC';
import {
  MODOS_CALENTAMIENTO,
  ROTULOS_PERFIL,
  TIPOS_ACERO,
  type ModoCalentamiento,
  type TipoAcero,
} from '../../incendio/anejoD';
import { FAMILIAS } from '../../incendio/protecciones';
import { clasesValidas } from '../../incendio/sectores';
import { REGLAS_SUELTAS, TABLA_3_2, USOS_DB_SI, type NivelRiesgo } from '../../incendio/tabla31';
import {
  defaultIncendioState,
  esEstadoInicial,
  evaluar,
  nuevoElemento,
  nuevoId,
  type AnotacionPlanta,
  type Evaluacion,
  type IncendioState,
  type SectorUI,
} from '../../../features/incendio/state';
import { plantasPublicadas } from '../../../features/incendio/plantasPub';
import type { ElementoEntrada } from '../../incendio/elementos';

// ── Catálogo del módulo ──────────────────────────────────────────────────────

const USOS = USOS_DB_SI.map((u) => u.id);
const CLASES = clasesValidas(USOS);
const TIPOS_H = TIPOS_HORMIGON.map((t) => t.id);
const TIPOS_A = TIPOS_ACERO.map((t) => t.id);
const MODOS = MODOS_CALENTAMIENTO.map((m) => m.id);
const PROTECCIONES = FAMILIAS.map((f) => f.id);

const ETIQUETA_CLASE = new Map<string, string>([
  ...USOS_DB_SI.map((u) => [`uso:${u.id}`, u.etiqueta] as [string, string]),
  ['riesgo:bajo', 'Zona de riesgo especial bajo'],
  ['riesgo:medio', 'Zona de riesgo especial medio'],
  ['riesgo:alto', 'Zona de riesgo especial alto'],
  ...REGLAS_SUELTAS.map((r) => [`regla:${r.id}`, r.etiqueta] as [string, string]),
]);

const ETIQUETA_TIPO_H = new Map(TIPOS_HORMIGON.map((t) => [t.id, t.etiqueta]));
const ETIQUETA_TIPO_A = new Map(TIPOS_ACERO.map((t) => [t.id, t.etiqueta]));
const ETIQUETA_PROTECCION = new Map(FAMILIAS.map((f) => [f.id, f.etiqueta]));

/** Tres estados, no dos: lo propuesto por el uso del forjado NO es una decisión. */
const CUENTA = ['como_proponga', 'si', 'no'] as const;
type Cuenta = (typeof CUENTA)[number];

const norm = (s: string) => s.trim().toLocaleLowerCase('es');

// ── Esquema del payload ──────────────────────────────────────────────────────

export const INCENDIO_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['modo_altura', 'altura_evacuacion_m', 'plantas', 'sectores', 'elementos', 'warnings'],
  properties: {
    modo_altura: {
      type: ['string', 'null'],
      enum: ['total', 'libre', null],
      description:
        'Qué significa la altura que se teclea en cada planta. "total" de la cara superior de su forjado a la cara superior del forjado de encima (el canto va dentro; es como se acotan los planos de estructura). "libre" de su forjado a la cara inferior del de encima, y entonces la aplicación le suma el canto del forjado superior. Por obra, no por planta. null = sin cambio.',
    },
    altura_evacuacion_m: {
      type: ['number', 'null'],
      description:
        'Altura de evacuación del edificio en METROS, ADOPTADA A MANO. Escríbela SÓLO si el usuario te da el número; en cuanto haya plantas con sus alturas, la aplicación la calcula sola por el Anejo A del DB SI (máxima diferencia de cotas entre un origen de evacuación y la salida del edificio) y la dibuja en la sección. NUNCA la calcules tú sumando las alturas de las plantas: el convenio de cotas es de la aplicación y tu suma taparía el suyo. Pon 0 para volver a la que sale de las plantas.',
    },
    plantas: {
      type: ['array', 'null'],
      description:
        'Anotaciones de las plantas del edificio (REEMPLAZA la lista entera; null = sin cambio). LAS PLANTAS NO SE CREAN AQUÍ: vienen del módulo «Cargas por planta» y el snapshot te da sus nombres en plantas_publicadas. Usa EXACTAMENTE esos nombres o la anotación queda huérfana y no cuenta. De abajo arriba o de arriba abajo da igual: se emparejan por el nombre.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'altura_m', 'canto_m', 'bajo_rasante', 'cuenta_evacuacion'],
        properties: {
          nombre: {
            type: 'string',
            description: 'Nombre de la planta, EXACTAMENTE como aparece en plantas_publicadas ("Planta Primera", "Sótano -1").',
          },
          altura_m: {
            type: 'number',
            description: 'Altura de la planta en METROS, total o libre según modo_altura. 0 = sin decir. La planta más alta no lleva altura: no tiene forjado encima que medir.',
          },
          canto_m: {
            type: 'number',
            description: 'Canto del forjado de esta planta en METROS, tecleado a mano. 0 = el que publica «Cargas por planta», que es lo normal. Sólo hace falta cuando allí la planta tiene zonas con cantos distintos.',
          },
          bajo_rasante: {
            type: 'boolean',
            description: 'true si la planta está bajo rasante (sótanos). La planta de salida del edificio es la más baja que NO lo está, y su forjado es el cero de cotas.',
          },
          cuenta_evacuacion: {
            type: 'string',
            enum: [...CUENTA],
            description: '¿Es origen de evacuación? "como_proponga" deja que lo decida el uso con el que se dimensionó su forjado (una cubierta accesible sólo para conservación no cuenta, Anejo A del DB SI), y es lo que hay que poner casi siempre. "si"/"no" lo fuerzan. Marcar "no" BAJA la altura de evacuación de todo el edificio y con ella la R exigida: sólo para zonas de ocupación nula de verdad, como un trastero o un cuarto de instalaciones.',
          },
        },
      },
    },
    sectores: {
      type: ['array', 'null'],
      description:
        'Sectores de incendio y zonas de riesgo especial (REEMPLAZA la lista entera; null = sin cambio). TÚ DICES QUÉ ES CADA UNO; LA R LA PONE LA TABLA 3.1. No hay campo para los minutos, y es a propósito. Si un sector ya existe con el mismo nombre, se conservan su tiempo equivalente del Anejo B y la R que el proyectista hubiera declarado a mano.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'clase', 'sotano', 'robotizado', 'adosada', 'bajo_cubierta_sin_riesgo'],
        properties: {
          nombre: {
            type: 'string',
            description: 'Cómo se llama en el proyecto: "Plantas sobre rasante", "Aparcamiento en sótano", "Sala de calderas", "Escalera protegida".',
          },
          clase: {
            type: 'string',
            enum: [...CLASES],
            description:
              'Qué es el sector. "uso:*" los usos de la tabla 3.1; "riesgo:bajo|medio|alto" las zonas de riesgo especial del SI 1 (R 90 / R 120 / R 180, y nunca menos que la de la planta en la que están); "regla:cubiertaLigera" cubierta ligera no prevista para evacuación (§ 3.2), "regla:escaleraProtegida" escalera o pasillo protegido (§ 3.3), "regla:escaleraEspecialmenteProtegida" (sin exigencia), "regla:secundario" elemento estructural secundario (§ 4.1), "regla:carpa" (§ 4.2).',
          },
          sotano: {
            type: 'boolean',
            description: 'true si el sector está bajo rasante. La tabla 3.1 tiene COLUMNA APARTE para las plantas de sótano y suele pedir más: marcarlo mal cambia la R. También en las zonas de riesgo especial: la llamada 1 de la tabla 3.2 las compara con la estructura de SU lado de la rasante.',
          },
          robotizado: {
            type: 'boolean',
            description: 'Sólo con uso de aparcamiento: true si es un aparcamiento robotizado (llamada 4 de la tabla 3.1, que lo sube a R 180). false en todo lo demás.',
          },
          adosada: {
            type: 'boolean',
            description: 'Sólo con uso "viviendaUnifamiliar": true si es una vivienda unifamiliar ADOSADA y este sector es estructura común a varias, que entonces va por la fila de Residencial Vivienda (llamada 2). false en todo lo demás.',
          },
          bajo_cubierta_sin_riesgo: {
            type: 'boolean',
            description: 'Sólo con "riesgo:bajo|medio|alto": true si la zona de riesgo especial está bajo una cubierta NO prevista para evacuación y cuyo fallo no compromete la estabilidad de otras plantas ni la compartimentación. Es la excepción de la llamada 1 de la tabla 3.2 y REBAJA la zona a R 30 donde la tabla pedía R 90, R 120 o R 180: sólo con el usuario diciéndolo expresamente de esa zona, nunca por deducción. false en todo lo demás.',
          },
        },
      },
    },
    elementos: {
      type: ['array', 'null'],
      description:
        'Secciones que se comprueban por los anejos C (hormigón) y D (acero) (REEMPLAZA la lista entera; null = sin cambio). Cada elemento toma la R de su sector. Si un elemento ya existe con el mismo nombre se conservan los campos finos que aquí no viajan: la conductividad declarada de su revestimiento y los detalles de armado.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'nombre', 'sector', 'material', 'tipo_hormigon', 'b_mm', 'h_mm', 'alma_mm',
          'recubrimiento_mm', 'cerco_mm', 'barra_mm', 'arido_calizo',
          'perfil', 'tipo_acero', 'modo_calentamiento', 'masividad_m1', 'mufi', 'proteccion',
        ],
        properties: {
          nombre: {
            type: 'string',
            description: 'Cómo se llama en el proyecto: "Pilares de planta baja", "Vigas de cubierta", "Jácenas metálicas".',
          },
          sector: {
            type: 'string',
            description: 'Nombre del sector del que toma la R exigida, exactamente como esté en la lista de sectores. Cadena vacía si todavía no hay sector al que colgarlo.',
          },
          material: {
            type: 'string',
            enum: ['hormigon', 'acero'],
            description: 'De qué es el elemento: "hormigon" va por el anejo C y "acero" por el D. Madera y fábrica no se comprueban en este módulo todavía.',
          },
          tipo_hormigon: {
            type: 'string',
            enum: [...TIPOS_H],
            description: 'Sólo con material = "hormigon": tipo de elemento, que decide la tabla del anejo C. "soporte" (C.2), "muroUnaCara"/"muroDosCaras", "vigaTresCaras" la viga corriente con forjado encima, "vigaTodasCaras", "losaUnaDireccion"/"losaDosDirecciones" (C.4), "forjadoBidireccional" reticular, "forjadoUnidireccional" de viguetas.',
          },
          b_mm: {
            type: 'number',
            description: 'MILÍMETROS. Según el tipo: lado menor del soporte, espesor del muro o de la losa, ancho de la viga, ancho de nervio del forjado. 0 = sin decir.',
          },
          h_mm: {
            type: 'number',
            description: 'MILÍMETROS. Canto total de la viga, o espesor de la losa o del forjado. 0 = sin decir.',
          },
          alma_mm: {
            type: 'number',
            description: 'MILÍMETROS. Ancho del alma de una viga de canto variable o aligerada. 0 = el mismo que b_mm, que es lo normal.',
          },
          recubrimiento_mm: {
            type: 'number',
            description: 'MILÍMETROS. Recubrimiento NOMINAL, medido a la cara exterior del cerco. Ojo: no es la distancia al eje. La distancia al eje la calcula la aplicación como recubrimiento + diámetro del cerco + medio diámetro de la barra, y es el error clásico de esta comprobación. 0 = sin decir.',
          },
          cerco_mm: {
            type: 'number',
            description: 'MILÍMETROS. Diámetro del cerco o estribo. 0 en losas y forjados sin cercos.',
          },
          barra_mm: {
            type: 'number',
            description: 'MILÍMETROS. Diámetro de la armadura principal. 0 = sin decir.',
          },
          arido_calizo: {
            type: 'boolean',
            description: 'true si el hormigón es de árido calizo: el C.2.1.3 permite rebajar un 10 % las dimensiones mínimas de vigas, losas y forjados. Es un dato del hormigón que se pone en obra, no una hipótesis cómoda.',
          },
          perfil: {
            type: 'string',
            description: 'Sólo con material = "acero": perfil del catálogo, tal cual ("IPE 300", "HEB 200", "IPN 160"). Cadena vacía si se va a teclear la masividad directamente.',
          },
          tipo_acero: {
            type: 'string',
            enum: [...TIPOS_A],
            description: 'Sólo con material = "acero": "viga" viga arriostrada lateralmente, "tirante", "soporte". Las vigas y los tirantes van por la tabla D.1; los soportes, por el D.2.2.',
          },
          modo_calentamiento: {
            type: 'string',
            enum: [...MODOS],
            description: 'Sólo con material = "acero": cómo se calienta el perfil, que es lo que fija la masividad Am/V. "contorno3" siguiendo el contorno con forjado encima (lo normal en una jácena), "contorno4" las cuatro caras, "cajon3" y "cajon4" cuando el revestimiento va en cajón. Un cajón calienta menos que el contorno.',
          },
          masividad_m1: {
            type: 'number',
            description: 'Sólo con material = "acero": masividad Am/V en m⁻¹, tecleada a mano. 0 = la que sale del perfil y del modo de calentamiento, que es lo normal.',
          },
          mufi: {
            type: 'number',
            description: 'Coeficiente de sobredimensionado μfi = Efi,d / Rfi,d,0 (expresión 6.1): la fracción de la capacidad del elemento que está solicitada en el incendio. 0 = sin decir, y entonces la aplicación va por el lado seguro (la banda más exigente de la tabla D.1, y sin la corrección de la tabla C.1). SÓLO se escribe con un número que salga del cálculo del usuario: bajarlo rebaja el revestimiento que hace falta.',
          },
          proteccion: {
            type: 'string',
            enum: ['', ...PROTECCIONES],
            description: 'Familia del revestimiento con el que se protege el elemento si su sección no llega sola. Cadena vacía = sin elegir, y entonces sólo se enuncia la magnitud que hay que alcanzar. "placaYeso" placa de yeso tipo F, "morteroVermiculita" mortero proyectado, "lanaMineral", "silicatoCalcico", "intumescente" pintura intumescente, "morteroYeso" enfoscado sobre hormigón, "ensayoHormigon" otro producto sobre hormigón. NO propongas un espesor: el DB SI no tabula ningún producto y la aplicación lo estima con la conductividad de la familia.',
          },
        },
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Avisos para el usuario: conversiones de unidades, supuestos que has tenido que hacer, datos que faltan.',
    },
  },
};

// ── Reglas del prompt ────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Incendio (CTE DB SI 6):
1. TÚ NO DICES LA R. La resistencia al fuego exigida sale de la tabla 3.1 cruzando el USO del sector con la ALTURA DE EVACUACIÓN, y la resuelve la aplicación. No hay campo de minutos en tu propuesta y no es un olvido: un "R 90" citado de memoria se imprime en la memoria y en el plano como si viniera de la tabla. Tu trabajo es decir QUÉ ES cada sector; el número lo pone la norma. Si el usuario te pregunta qué R le toca, describe el sector, aplica y lee la respuesta en los resultados.
2. LA ALTURA DE EVACUACIÓN, SÓLO SI TE LA DAN. Con las plantas y sus alturas, la aplicación la calcula por el Anejo A y la dibuja. Escribe altura_evacuacion_m únicamente cuando el usuario te dé el número («la altura de evacuación es 12,50 m»); nunca la sumes tú de las alturas de las plantas.
3. LAS PLANTAS NO SE CREAN AQUÍ. Vienen del módulo «Cargas por planta»; el snapshot te da sus nombres en plantas_publicadas y hay que usarlos EXACTAMENTE. Lo que se anota aquí es la altura de cada una, si está bajo rasante y si es origen de evacuación. Si el usuario describe un edificio del que no hay plantas publicadas, dile que las calcule en Cargas por planta, y mientras tanto usa la altura de evacuación a mano.
4. "cuenta_evacuacion" SE DEJA EN "como_proponga". Lo decide el uso con el que se dimensionó el forjado en Cargas por planta, y las cubiertas accesibles sólo para conservación ya salen fuera. Ponerlo a "no" baja la altura de evacuación de todo el edificio y con ella la R: hazlo sólo si el usuario dice que esa planta es de ocupación nula (un trastero, un cuarto de instalaciones bajo cubierta).
5. EL SÓTANO ES UNA COLUMNA DISTINTA. La tabla 3.1 pide su propia R a las plantas bajo rasante, y casi siempre más. Marca "sotano" en los sectores que estén abajo. Y un aparcamiento tiene dos filas: "aparcamientoExclusivo" cuando el edificio es sólo aparcamiento o está sobre otro uso, y "aparcamientoBajoOtroUso" cuando está debajo de otro uso, que pide R 120.
6. LAS ZONAS DE RIESGO ESPECIAL SON SECTORES APARTE. Una sala de calderas, una cocina de más de 20 kW o un almacén de residuos no son "el mismo sector con un matiz": van como "riesgo:bajo|medio|alto" en su propia fila, con su nombre y con "sotano" si están abajo. La aplicación les pone R 90, R 120 o R 180 y además comprueba que no queden por debajo de la de la planta. "bajo_cubierta_sin_riesgo" las deja en R 30 y es una excepción de la norma: sólo si el usuario dice que ESA zona está bajo una cubierta no prevista para evacuación cuyo fallo no compromete nada.
7. LOS MILÍMETROS SON MILÍMETROS. Las secciones de los elementos van en mm (250×500, recubrimiento 30, cerco 8, barra 20), no en cm. Y el RECUBRIMIENTO NOMINAL no es la distancia al eje: la aplicación calcula el eje como recubrimiento + cerco + medio diámetro de barra. Si el usuario te da "35 mm al eje", eso no es el recubrimiento; dilo y pregunta.
8. μfi SÓLO CON UN NÚMERO DEL USUARIO. Es el coeficiente de sobredimensionado del elemento en incendio, y sale de su cálculo: cuánta de su capacidad está solicitada en la situación accidental. Con 0 la aplicación va por el lado seguro. Bajarlo rebaja el revestimiento que hace falta, así que no lo estimes ni lo pongas "típico".
9. EL ESPESOR DEL REVESTIMIENTO NO LO DICES TÚ. El DB SI no tabula ningún producto de protección: remite a la UNE-EN 13381 y al marcado CE. Tú eliges la FAMILIA y la aplicación estima el espesor con la conductividad que le corresponde. Y NUNCA des la conductividad de un producto de memoria: el λ de catálogo de una lana de roca a 20 ºC no es el efectivo en incendio, y con él salen 7 mm donde en obra van 40. Ese dato lo teclea quien tenga la ficha del producto delante.
10. LA ESTRUCTURA PUEDE LLEGAR SOLA. Antes de proponer un revestimiento, deja que la aplicación compruebe la sección: muchas veces una viga de 250 con 30 de recubrimiento ya da R 120 y no hay nada que poner. Y un enfoscado NO ensancha un pilar: si a una sección le falta ANCHO y no recubrimiento, el revestimiento no lo arregla y hay que agrandarla.
11. ESTE MÓDULO NO DIMENSIONA. Dice qué R se exige y si la sección la alcanza por sí sola o necesita protección. No calcula esfuerzos, ni armados, ni la estabilidad del edificio en incendio: eso son otros módulos y otras normas.
12. CHECKPOINT: "plantas", "sectores" y "elementos" reemplazan cada lista entera, así que cada turno tienes que volver a mandarlas COMPLETAS, incluyendo lo que propusiste antes y sigue pendiente de aplicar. Una lista a medias borra filas.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Edificio de viviendas de 4 plantas y bajo cubierta no habitable, con aparcamiento en sótano '
  + 'y sala de calderas; pilares de hormigón de 30×30 con 30 mm de recubrimiento y jácenas IPE 300.';

// ── Parseo defensivo del payload ─────────────────────────────────────────────

export interface PlantaAi {
  nombre: string;
  altura_m: number;
  canto_m: number;
  bajo_rasante: boolean;
  cuenta_evacuacion: Cuenta;
}

export interface SectorAi {
  nombre: string;
  clase: string;
  sotano: boolean;
  robotizado: boolean;
  adosada: boolean;
  bajo_cubierta_sin_riesgo: boolean;
}

export interface ElementoAi {
  nombre: string;
  sector: string;
  material: 'hormigon' | 'acero';
  tipo_hormigon: TipoHormigon;
  b_mm: number;
  h_mm: number;
  alma_mm: number;
  recubrimiento_mm: number;
  cerco_mm: number;
  barra_mm: number;
  arido_calizo: boolean;
  perfil: string;
  tipo_acero: TipoAcero;
  modo_calentamiento: ModoCalentamiento;
  masividad_m1: number;
  mufi: number;
  proteccion: string;
}

export interface IncendioPayload {
  modo_altura: 'total' | 'libre' | null;
  altura_evacuacion_m: number | null;
  plantas: PlantaAi[] | null;
  sectores: SectorAi[] | null;
  elementos: ElementoAi[] | null;
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

function parsePlanta(raw: Record<string, unknown>): PlantaAi {
  return {
    nombre: textoO(raw.nombre, ''),
    altura_m: numeroO(raw.altura_m, 0),
    canto_m: numeroO(raw.canto_m, 0),
    bajo_rasante: boolO(raw.bajo_rasante, false),
    cuenta_evacuacion: unoDe(raw.cuenta_evacuacion, CUENTA, 'como_proponga'),
  };
}

function parseSector(raw: Record<string, unknown>): SectorAi {
  return {
    nombre: textoO(raw.nombre, ''),
    clase: unoDe(raw.clase, CLASES, ''),
    sotano: boolO(raw.sotano, false),
    robotizado: boolO(raw.robotizado, false),
    adosada: boolO(raw.adosada, false),
    bajo_cubierta_sin_riesgo: boolO(raw.bajo_cubierta_sin_riesgo, false),
  };
}

function parseElemento(raw: Record<string, unknown>): ElementoAi {
  return {
    nombre: textoO(raw.nombre, ''),
    sector: textoO(raw.sector, ''),
    material: unoDe(raw.material, ['hormigon', 'acero'] as const, 'hormigon'),
    tipo_hormigon: unoDe(raw.tipo_hormigon, TIPOS_H, 'soporte'),
    b_mm: numeroO(raw.b_mm, 0),
    h_mm: numeroO(raw.h_mm, 0),
    alma_mm: numeroO(raw.alma_mm, 0),
    recubrimiento_mm: numeroO(raw.recubrimiento_mm, 0),
    cerco_mm: numeroO(raw.cerco_mm, 0),
    barra_mm: numeroO(raw.barra_mm, 0),
    arido_calizo: boolO(raw.arido_calizo, false),
    perfil: textoO(raw.perfil, ''),
    tipo_acero: unoDe(raw.tipo_acero, TIPOS_A, 'viga'),
    modo_calentamiento: unoDe(raw.modo_calentamiento, MODOS, 'contorno3'),
    masividad_m1: numeroO(raw.masividad_m1, 0),
    mufi: numeroO(raw.mufi, 0),
    proteccion: unoDe(raw.proteccion, ['', ...PROTECCIONES], ''),
  };
}

export function parsePayload(raw: unknown): IncendioPayload {
  if (!esObjeto(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  return {
    modo_altura: raw.modo_altura === 'total' || raw.modo_altura === 'libre' ? raw.modo_altura : null,
    altura_evacuacion_m: finito(raw.altura_evacuacion_m),
    plantas: Array.isArray(raw.plantas) ? raw.plantas.filter(esObjeto).map(parsePlanta) : null,
    sectores: Array.isArray(raw.sectores) ? raw.sectores.filter(esObjeto).map(parseSector) : null,
    elementos: Array.isArray(raw.elementos) ? raw.elementos.filter(esObjeto).map(parseElemento) : null,
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Proyección plana del estado ──────────────────────────────────────────────
//
// La misma forma que una fila del payload: la usan el snapshot (para que el
// modelo lea lo que va a escribir) y los textos de la tarjeta de cambios.

function plantaDe(a: AnotacionPlanta): PlantaAi {
  return {
    nombre: a.nombre,
    altura_m: a.altura ?? 0,
    canto_m: a.cantoManual ?? 0,
    bajo_rasante: a.bajoRasante,
    cuenta_evacuacion: a.cuenta === null ? 'como_proponga' : a.cuenta ? 'si' : 'no',
  };
}

function sectorDe(s: SectorUI): SectorAi {
  return {
    nombre: s.nombre,
    clase: s.clase,
    sotano: s.sotano,
    robotizado: s.robotizado,
    adosada: s.adosada,
    bajo_cubierta_sin_riesgo: s.bajoCubiertaSinRiesgo,
  };
}

function elementoDe(e: ElementoEntrada, sectores: readonly SectorUI[]): ElementoAi {
  return {
    nombre: e.nombre,
    sector: sectores.find((s) => s.id === e.sectorId)?.nombre ?? '',
    material: e.material,
    tipo_hormigon: e.hormigon.tipo,
    b_mm: e.hormigon.b ?? 0,
    h_mm: e.hormigon.h ?? 0,
    alma_mm: e.hormigon.b0 ?? 0,
    recubrimiento_mm: e.hormigon.rnom ?? 0,
    cerco_mm: e.hormigon.dCerco,
    barra_mm: e.hormigon.dBarra ?? 0,
    arido_calizo: e.hormigon.aridoCalizo,
    perfil: e.acero.perfil,
    tipo_acero: e.acero.tipo,
    modo_calentamiento: e.acero.modo,
    masividad_m1: e.acero.masividadManual ?? 0,
    mufi: (e.material === 'acero' ? e.acero.mufi : e.hormigon.mufi) ?? 0,
    proteccion: e.proteccion.familia,
  };
}

// ── Del payload al estado ────────────────────────────────────────────────────

const cero = (v: number): number | null => (v > 0 ? v : null);

function anotacionDe(p: PlantaAi): AnotacionPlanta {
  return {
    nombre: p.nombre.trim(),
    altura: cero(p.altura_m),
    cantoManual: cero(p.canto_m),
    bajoRasante: p.bajo_rasante,
    cuenta: p.cuenta_evacuacion === 'como_proponga' ? null : p.cuenta_evacuacion === 'si',
  };
}

/**
 * Un sector propuesto, sobre el que ya había con ese nombre.
 *
 * Lo que se arrastra es lo que el payload NO proyecta: el tiempo equivalente
 * del Anejo B —media hora de tecleo, con la superficie, los huecos y la altura
 * del sector— y la R declarada a mano. Reemplazar la lista no puede significar
 * tirar eso, y menos sin una fila que lo diga.
 */
function sectorDePropuesta(s: SectorAi, previo: SectorUI | undefined): SectorUI {
  return {
    id: previo?.id ?? nuevoId('s'),
    nombre: s.nombre.trim(),
    clase: s.clase,
    sotano: s.sotano,
    robotizado: s.robotizado,
    adosada: s.adosada,
    bajoCubiertaSinRiesgo: s.bajo_cubierta_sin_riesgo,
    minutosManual: previo?.minutosManual ?? null,
    anejoB: previo?.anejoB ?? null,
  };
}

/**
 * Lo mismo con un elemento: se conservan el armado fino y el λp del producto,
 * pero éste SÓLO si la familia del revestimiento es la misma. Con otra familia
 * el λp guardado es el de otro producto, y el espesor saldría con la
 * conductividad de una lana para una placa.
 */
function elementoDePropuesta(
  e: ElementoAi,
  previo: ElementoEntrada | undefined,
  base: ElementoEntrada,
  sectores: readonly SectorUI[],
): ElementoEntrada {
  const anterior = previo ?? base;
  const sector = sectores.find((s) => norm(s.nombre) === norm(e.sector));
  return {
    ...anterior,
    id: previo?.id ?? nuevoId('e'),
    nombre: e.nombre.trim(),
    sectorId: sector?.id ?? '',
    material: e.material,
    hormigon: {
      ...anterior.hormigon,
      tipo: e.tipo_hormigon,
      b: cero(e.b_mm),
      h: cero(e.h_mm),
      b0: cero(e.alma_mm),
      rnom: cero(e.recubrimiento_mm),
      dCerco: Math.max(0, e.cerco_mm),
      dBarra: cero(e.barra_mm),
      aridoCalizo: e.arido_calizo,
      mufi: e.material === 'hormigon' ? cero(e.mufi) : anterior.hormigon.mufi,
    },
    acero: {
      ...anterior.acero,
      tipo: e.tipo_acero,
      perfil: e.perfil.trim(),
      modo: e.modo_calentamiento,
      masividadManual: cero(e.masividad_m1),
      mufi: e.material === 'acero' ? cero(e.mufi) : anterior.acero.mufi,
    },
    proteccion:
      e.proteccion === anterior.proteccion.familia
        ? anterior.proteccion
        : { familia: e.proteccion, lambda: null },
  };
}

// ── Textos de la tarjeta ─────────────────────────────────────────────────────

const ALREADY = 'Ya coincide con el valor actual';
const m2 = (v: number) => `${v.toFixed(2).replace('.', ',')} m`;

const textoPlanta = (p: PlantaAi) =>
  [
    p.altura_m > 0 ? m2(p.altura_m) : 'sin altura',
    p.bajo_rasante ? 'bajo rasante' : null,
    p.cuenta_evacuacion === 'no' ? 'de ocupación nula' : p.cuenta_evacuacion === 'si' ? 'origen de evacuación' : null,
  ]
    .filter(Boolean)
    .join(', ');

const textoSector = (s: SectorAi) =>
  [
    ETIQUETA_CLASE.get(s.clase) ?? s.clase ?? 'sin clasificar',
    s.sotano ? 'bajo rasante' : null,
    s.robotizado ? 'robotizado' : null,
    s.adosada ? 'adosada' : null,
    // Baja la zona a R 30: tiene que verse en la tarjeta, no sólo aplicarse.
    s.bajo_cubierta_sin_riesgo ? 'bajo cubierta sin riesgo (R 30)' : null,
  ]
    .filter(Boolean)
    .join(', ');

function textoElemento(e: ElementoAi): string {
  const trozos: string[] = [];
  if (e.material === 'acero') {
    trozos.push(ETIQUETA_TIPO_A.get(e.tipo_acero) ?? e.tipo_acero);
    if (e.perfil !== '') trozos.push(e.perfil);
    if (e.masividad_m1 > 0) trozos.push(`Am/V = ${e.masividad_m1} m⁻¹`);
  } else {
    trozos.push(ETIQUETA_TIPO_H.get(e.tipo_hormigon) ?? e.tipo_hormigon);
    if (e.b_mm > 0) trozos.push(e.h_mm > 0 ? `${e.b_mm}×${e.h_mm} mm` : `${e.b_mm} mm`);
    if (e.recubrimiento_mm > 0) trozos.push(`rnom ${e.recubrimiento_mm} mm`);
  }
  if (e.sector !== '') trozos.push(`sector «${e.sector}»`);
  if (e.mufi > 0) trozos.push(`μfi = ${e.mufi}`);
  if (e.proteccion !== '') trozos.push(ETIQUETA_PROTECCION.get(e.proteccion) ?? e.proteccion);
  return trozos.join(', ');
}

/**
 * Filas de la tarjeta para una lista que se reemplaza entera.
 *
 * Posición a posición, que es como se lee una lista: la fila 2 de antes y la
 * fila 2 de ahora. Lo que sobra al final se rotula como eliminado, y lo que
 * falta, como nuevo.
 */
function cambiosDeLista<T>(
  campo: string,
  singular: string,
  antes: readonly T[],
  despues: readonly T[],
  nombre: (x: T) => string,
  texto: (x: T) => string,
): AiFieldChange[] {
  const filas: AiFieldChange[] = [];
  const n = Math.max(antes.length, despues.length);
  for (let i = 0; i < n; i++) {
    const a = antes[i];
    const b = despues[i];
    const textoA = a === undefined ? '' : `${nombre(a) || singular}: ${texto(a)}`;
    const textoB = b === undefined ? '' : `${nombre(b) || singular}: ${texto(b)}`;
    if (textoA === textoB) continue;
    filas.push({
      field: `${campo}[${i}]`,
      label: b === undefined ? `${singular} eliminado` : `${singular} ${i + 1}`,
      before: textoA === '' ? 'no estaba' : textoA,
      after: textoB === '' ? 'se elimina' : textoB,
    });
  }
  return filas;
}

// ── Seguridad ────────────────────────────────────────────────────────────────

/**
 * Vacía, y por el mismo motivo que en viento y nieve y en cargas por planta:
 * las claves de primer nivel del estado son ARRAYS, y el gate genérico de
 * `detectSafetyRisks` los compara por identidad. Lo que hay que vigilar aquí no
 * es un campo sino lo que sale de ellos —la altura de evacuación y la R de cada
 * sector—, y de eso se ocupa `riesgosDeIncendio`.
 */
export const INCENDIO_SAFETY_RULES: ReadonlyArray<SafetyRule<IncendioState>> = [];

const ALTURA_WHY =
  'La altura de evacuación es la ENTRADA de la tabla 3.1: con ella bajan los minutos que se le '
  + 'exigen a toda la estructura, y los tramos de la tabla son escalones (28 m, 15 m). La bajan '
  + 'teclearla a mano, acortar la altura de una planta y marcar una planta como de ocupación nula, '
  + 'que no toca ningún número y quita la planta de arriba de la cuenta.';

const R_MAXIMA_WHY =
  'La resistencia al fuego más alta que se le exige a la estructura baja. Sale de la tabla 3.1 y la '
  + 'mueven el uso del sector, que esté o no bajo rasante y la altura de evacuación del edificio: '
  + 'compruebe cuál de los tres ha cambiado y que responde al edificio real.';

/**
 * Magnitudes resueltas. Entran en el test de contrato como `ResolvedSafetyRule`
 * pero las consume un detector propio, cuyo gate compara la magnitud con la de
 * fábrica en vez de comparar arrays del estado por identidad.
 */
export const INCENDIO_RESOLVED_RULES: ReadonlyArray<ResolvedSafetyRule<IncendioState>> = [
  {
    id: 'altura_evacuacion',
    label: 'Altura de evacuación',
    resolve: (s) => evaluar(s).alturaEvacuacion,
    level: higherIsSafer,
    format: (v) => m2(v),
    why: ALTURA_WHY,
    fields: ['plantas', 'alturaEvacuacionManual'],
    confirmKeys: ['plantas', 'altura_evacuacion_m'],
  },
  {
    id: 'r_maxima',
    label: 'Resistencia al fuego más exigente',
    resolve: (s) => {
      const rs = evaluar(s).exigencias.map((e) => e.minutos);
      return rs.length > 0 ? Math.max(...rs) : null;
    },
    level: higherIsSafer,
    format: (v) => `R ${v}`,
    why: R_MAXIMA_WHY,
    fields: ['sectores', 'plantas', 'alturaEvacuacionManual'],
    confirmKeys: ['sectores', 'plantas', 'altura_evacuacion_m'],
  },
];

const EPS = 1e-9;

const R_SECTOR_WHY =
  'La R exigida a este sector baja. La pone la tabla 3.1 según lo que el sector ES —el uso, si está '
  + 'bajo rasante, si el aparcamiento está bajo otro uso— y según la altura de evacuación del '
  + 'edificio. Un sector reclasificado a un uso menos exigente cambia la R sin que se vea ningún '
  + 'número moverse.';

const ELIMINAR_SECTORES_WHY =
  'La propuesta deja menos sectores de los que hay. Un sector que desaparece deja de tener R '
  + 'exigida, y con él se va la fila que lo justificaba en la memoria y en el cuadro del plano.';

const BAJO_CUBIERTA_WHY =
  'La excepción de la llamada 1 de la tabla 3.2 deja una zona de riesgo especial en R 30 donde la '
  + 'tabla pedía R 90, R 120 o R 180. Sólo vale bajo una cubierta no prevista para evacuación y '
  + 'cuyo fallo no compromete la estabilidad de otras plantas ni la compartimentación: es un dato '
  + 'del edificio, no una hipótesis cómoda.';

const ELIMINAR_ELEMENTOS_WHY =
  'La propuesta deja menos elementos de los que hay. Un elemento que desaparece deja de '
  + 'comprobarse: ni se dice si su sección llega sola ni qué protección necesita.';

const MUFI_WHY =
  'Bajar μfi rebaja la protección que hace falta: es la fracción de la capacidad del elemento que '
  + 'está solicitada en el incendio, y con ella bajan la banda de la tabla D.1 y el d/λp exigido. '
  + 'Sale del cálculo del elemento en la situación accidental, no de un valor típico.';

/**
 * Los riesgos del módulo: se EVALÚA el estado antes y después y se comparan las
 * exigencias resueltas, más lo que desaparece de las listas.
 */
function riesgosDeIncendio(
  actual: IncendioState,
  final: IncendioState,
  confirmed: ReadonlySet<string>,
): AiSafetyRisk[] {
  const riesgos: AiSafetyRisk[] = [];
  const fabrica = defaultIncendioState();

  for (const r of INCENDIO_RESOLVED_RULES) {
    const antes = r.resolve(actual);
    const despues = r.resolve(final);
    if (antes === null || despues === null) continue;
    const establecida = r.resolve(fabrica) !== antes || r.confirmKeys.some((k) => confirmed.has(k));
    if (!establecida) continue;
    const nivelAntes = r.level(antes);
    const nivelDespues = r.level(despues);
    if (nivelAntes === null || nivelDespues === null) continue;
    if (nivelDespues >= nivelAntes - EPS) continue;
    riesgos.push({ field: r.id, label: r.label, before: r.format(antes), after: r.format(despues), why: r.why });
  }

  // Sector a sector, por nombre: la R máxima puede no moverse y haber bajado la
  // de uno de ellos, que es el caso corriente en un edificio con tres sectores.
  const antesSec = evaluar(actual).sectores;
  const despuesSec = evaluar(final).sectores;
  for (const a of antesSec) {
    if (a.minutos === null || a.nombre === '') continue;
    const b = despuesSec.find((x) => norm(x.nombre) === norm(a.nombre));
    if (b === undefined || b.minutos === null) continue;
    if (b.minutos >= a.minutos) continue;
    riesgos.push({
      field: `r_sector_${a.id}`,
      label: `R exigida a «${a.nombre}»`,
      before: `R ${a.minutos}`,
      after: `R ${b.minutos}`,
      why: R_SECTOR_WHY,
    });
  }

  // La excepción de la llamada (1) de la tabla 3.2. En un sector que ya
  // existía la ve la comparación de arriba (R 180 → R 30); una zona NUEVA que
  // llega con la casilla marcada no tiene «antes», y era la puerta por la que
  // un R 30 entraba sin que saltara nada.
  for (const b of final.sectores) {
    if (!b.bajoCubiertaSinRiesgo || !b.clase.startsWith('riesgo:') || b.nombre.trim() === '') continue;
    if (actual.sectores.some((x) => norm(x.nombre) === norm(b.nombre))) continue;
    const nivel = b.clase.slice('riesgo:'.length) as NivelRiesgo;
    riesgos.push({
      field: `bajo_cubierta_${b.id}`,
      label: `R exigida a «${b.nombre.trim()}»`,
      before: `R ${TABLA_3_2[nivel]} (tabla 3.2)`,
      after: 'R 30 (bajo cubierta sin riesgo)',
      why: BAJO_CUBIERTA_WHY,
    });
  }

  if (final.sectores.length < actual.sectores.length) {
    riesgos.push({
      field: 'sectores_eliminados',
      label: 'Sectores de incendio',
      before: `${actual.sectores.length}`,
      after: `${final.sectores.length}`,
      why: ELIMINAR_SECTORES_WHY,
    });
  }
  if (final.elementos.length < actual.elementos.length) {
    riesgos.push({
      field: 'elementos_eliminados',
      label: 'Elementos comprobados',
      before: `${actual.elementos.length}`,
      after: `${final.elementos.length}`,
      why: ELIMINAR_ELEMENTOS_WHY,
    });
  }

  // μfi elemento a elemento: no lo ve ninguna magnitud global, y es lo que
  // decide el espesor del revestimiento.
  const mufiDe = (e: ElementoEntrada) => (e.material === 'acero' ? e.acero.mufi : e.hormigon.mufi);
  for (const a of actual.elementos) {
    if (a.nombre.trim() === '') continue;
    const antes = mufiDe(a);
    if (antes === null) continue;
    const b = final.elementos.find((x) => norm(x.nombre) === norm(a.nombre));
    const despues = b === undefined ? null : mufiDe(b);
    if (despues === null || despues >= antes - EPS) continue;
    riesgos.push({
      field: `mufi_${a.id}`,
      label: `μfi de «${a.nombre.trim()}»`,
      before: antes.toFixed(2).replace('.', ','),
      after: despues.toFixed(2).replace('.', ','),
      why: MUFI_WHY,
    });
  }

  return riesgos;
}

// ── El plan ──────────────────────────────────────────────────────────────────

function buildIncendioPlan(
  payload: IncendioPayload,
  current: IncendioState,
  confirmed: ReadonlySet<string> = new Set<string>(),
): AiApplyPlan<IncendioState> {
  const fields: Partial<IncendioState> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const notFound: string[] = [];
  const warnings = [...payload.warnings];

  // ── El convenio de alturas ─────────────────────────────────────────────────
  if (payload.modo_altura !== null) {
    if (payload.modo_altura === current.modoAltura) {
      skipped.push({ field: 'modo_altura', label: 'Qué altura se teclea', reason: ALREADY });
    } else {
      fields.modoAltura = payload.modo_altura;
      changes.push({
        field: 'modo_altura',
        label: 'Qué altura se teclea',
        before: current.modoAltura === 'libre' ? 'libre (bajo el forjado)' : 'total (forjado a forjado)',
        after: payload.modo_altura === 'libre' ? 'libre (bajo el forjado)' : 'total (forjado a forjado)',
      });
    }
  }

  // ── La altura de evacuación a mano ────────────────────────────────────────
  if (payload.altura_evacuacion_m !== null) {
    const antes = current.alturaEvacuacionManual;
    const pedida = payload.altura_evacuacion_m > 0 ? payload.altura_evacuacion_m : null;
    if (payload.altura_evacuacion_m < 0 || payload.altura_evacuacion_m > 500) {
      skipped.push({
        field: 'altura_evacuacion_m',
        label: 'Altura de evacuación',
        reason: `Fuera de rango: ${payload.altura_evacuacion_m} m.`,
      });
    } else if (antes === pedida) {
      skipped.push({ field: 'altura_evacuacion_m', label: 'Altura de evacuación', reason: ALREADY });
    } else {
      fields.alturaEvacuacionManual = pedida;
      changes.push({
        field: 'altura_evacuacion_m',
        label: 'Altura de evacuación',
        before: antes === null ? 'la que sale de las plantas' : m2(antes),
        after: pedida === null ? 'la que sale de las plantas' : `${m2(pedida)} (adoptada)`,
      });
    }
  }

  // ── Las anotaciones de planta ─────────────────────────────────────────────
  if (payload.plantas !== null) {
    const publicadas = plantasPublicadas();
    const conNombre = payload.plantas.filter((p) => p.nombre.trim() !== '');
    // Una planta que no existe en el sobre se queda huérfana y no cuenta para
    // nada: mejor decirlo que guardar una anotación que no hace nada.
    const huerfanas =
      publicadas === null
        ? []
        : conNombre.filter((p) => !publicadas.some((x) => norm(x.nombre) === norm(p.nombre)));
    for (const p of huerfanas) notFound.push(`Planta «${p.nombre.trim()}»`);
    if (huerfanas.length > 0) {
      warnings.push(
        `Estas plantas no están publicadas por «Cargas por planta» y su anotación no contará: ${huerfanas
          .map((p) => p.nombre.trim())
          .join(', ')}.`,
      );
    }

    const validas = conNombre.filter((p) => !huerfanas.includes(p));
    const antes = current.plantas.map(plantaDe);
    const filas = cambiosDeLista('plantas', 'Planta', antes, validas, (p) => p.nombre.trim(), textoPlanta);
    if (filas.length === 0) {
      skipped.push({ field: 'plantas', label: 'Anotaciones de planta', reason: ALREADY });
    } else {
      fields.plantas = validas.map(anotacionDe);
      changes.push(...filas);
    }
  }

  // ── Los sectores ──────────────────────────────────────────────────────────
  if (payload.sectores !== null) {
    const conNombre = payload.sectores.filter((s) => s.nombre.trim() !== '');
    if (payload.sectores.length > 0 && conNombre.length === 0) {
      skipped.push({
        field: 'sectores',
        label: 'Sectores de incendio',
        reason: 'Ningún sector trae nombre: sin él no se puede imprimir la fila que justifica su R.',
      });
    } else {
      const antes = current.sectores.map(sectorDe);
      const filas = cambiosDeLista('sectores', 'Sector', antes, conNombre, (s) => s.nombre.trim(), textoSector);
      if (filas.length === 0) {
        skipped.push({ field: 'sectores', label: 'Sectores de incendio', reason: ALREADY });
      } else {
        fields.sectores = conNombre.map((s) =>
          sectorDePropuesta(
            s,
            current.sectores.find((x) => norm(x.nombre) === norm(s.nombre)),
          ),
        );
        changes.push(...filas);
        // Lo que se conserva del sector anterior no sale en ninguna fila, y es
        // justo lo que más cuesta volver a teclear: se dice.
        const conTed = conNombre.filter((s) =>
          current.sectores.some((x) => norm(x.nombre) === norm(s.nombre) && x.anejoB !== null),
        );
        if (conTed.length > 0) {
          warnings.push(
            `Se conserva el tiempo equivalente del Anejo B de: ${conTed.map((s) => s.nombre.trim()).join(', ')}.`,
          );
        }
      }
    }
  }

  // ── Los elementos ─────────────────────────────────────────────────────────
  if (payload.elementos !== null) {
    const conNombre = payload.elementos.filter((e) => e.nombre.trim() !== '');
    // Los sectores a los que colgar los elementos son los de DESPUÉS de aplicar
    // esta misma propuesta: describir el edificio y sus pilares en el mismo
    // turno es lo normal, y con los de antes no habría a qué colgarlos.
    const sectoresFinales = fields.sectores ?? current.sectores;
    // Los campos finos que el payload NO proyecta —cargas uniformes, entrevigado
    // protegido, soporte arriostrado— salen del elemento que ya había con ese
    // nombre; y si es nuevo, de los valores de fábrica del módulo. Nunca de cero.
    const base = nuevoElemento();

    const desconocidos = conNombre.filter(
      (e) => e.perfil.trim() !== '' && !ROTULOS_PERFIL.includes(e.perfil.trim()),
    );
    for (const e of desconocidos) notFound.push(`Perfil «${e.perfil.trim()}»`);

    const sinSector = conNombre.filter(
      (e) => e.sector.trim() !== '' && !sectoresFinales.some((s) => norm(s.nombre) === norm(e.sector)),
    );
    if (sinSector.length > 0) {
      warnings.push(
        `Estos elementos se quedan sin sector del que tomar la R: ${sinSector
          .map((e) => e.nombre.trim())
          .join(', ')}. Créelo o indique la R en el módulo.`,
      );
    }

    const antes = current.elementos.map((e) => elementoDe(e, current.sectores));
    const filas = cambiosDeLista('elementos', 'Elemento', antes, conNombre, (e) => e.nombre.trim(), textoElemento);
    if (filas.length === 0) {
      skipped.push({ field: 'elementos', label: 'Elementos comprobados', reason: ALREADY });
    } else {
      fields.elementos = conNombre.map((e) =>
        elementoDePropuesta(
          e,
          current.elementos.find((x) => norm(x.nombre) === norm(e.nombre)),
          base,
          sectoresFinales,
        ),
      );
      changes.push(...filas);
    }
  }

  const final: IncendioState = { ...current, ...fields };
  return {
    fields,
    changes,
    skipped,
    notFound,
    warnings,
    risks: riesgosDeIncendio(current, final, confirmed),
  };
}

// ── Snapshot ─────────────────────────────────────────────────────────────────

function buildSnapshot(c: IncendioState): string {
  const valores: Record<string, unknown> = {
    modo_altura: c.modoAltura,
    altura_evacuacion_m: c.alturaEvacuacionManual,
    plantas: c.plantas.map(plantaDe),
    sectores: c.sectores.map(sectorDe),
    elementos: c.elementos.map((e) => elementoDe(e, c.sectores)),
  };

  const sinConfirmar: string[] = [];
  const fabrica = defaultIncendioState();
  if (c.modoAltura === fabrica.modoAltura) sinConfirmar.push('modo_altura');
  if (c.alturaEvacuacionManual === null) sinConfirmar.push('altura_evacuacion_m');
  if (c.plantas.length === 0) sinConfirmar.push('plantas');
  if (esEstadoInicial(c)) sinConfirmar.push('sectores', 'elementos');

  // Contexto de SOLO LECTURA, dentro de `valores`: `decorateSnapshot` reconstruye
  // el objeto quedándose sólo con valores / sin_confirmar / pendientes_de_aplicar,
  // y una clave hermana de primer nivel desaparecería en silencio.
  const ev = evaluar(c);
  const publicadas = plantasPublicadas();
  valores.plantas_publicadas = {
    nombres: publicadas === null ? [] : publicadas.map((p) => p.nombre),
    nota:
      'Las plantas las publica el módulo «Cargas por planta» y NO son campos de tu propuesta: aquí '
      + 'sólo se anotan. Usa estos nombres exactamente.',
  };
  valores.altura_de_evacuacion_resuelta = {
    metros: ev.alturaEvacuacion,
    de_donde: ev.alturaAMano ? 'adoptada a mano' : 'de la cadena de alturas de las plantas',
    ascendente_m: ev.alturas.ascendente,
    nota: 'La calcula la aplicación por el Anejo A del DB SI. No la sumes tú.',
  };
  valores.r_exigida_resuelta = ev.exigencias.map((e) => ({ parte: e.ambito, minutos: e.minutos }));

  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

const ALCANCE_LINEA =
  'ATENCION: este módulo NO dimensiona. Dice qué resistencia al fuego exige el DB SI 6 a cada parte '
  + 'de la estructura y, de los elementos que se le den, si su sección la alcanza sola o necesita un '
  + 'revestimiento. No calcula esfuerzos ni armados, y los espesores de protección son orientativos: '
  + 'el DB SI no tabula ningún producto.';

/**
 * El resultado de este módulo es una EXIGENCIA y, si hay elementos, un
 * veredicto por elemento. No hay `CheckRow[]` que serializar, así que el
 * resumen se escribe a mano, como en cargas por planta.
 */
export function summarizeIncendioResults(ev: Evaluacion): AiResultsSummary {
  const lines: string[] = [];

  if (ev.huecos.length > 0) {
    lines.push(
      `SIN TERMINAR: ${ev.huecos.length} cosa${ev.huecos.length === 1 ? '' : 's'} a medias bloquea${ev.huecos.length === 1 ? '' : 'n'} la exportación: ${ev.huecos
        .map((h) => h.que)
        .join(', ')}.`,
    );
  } else if (ev.exigencias.length === 0) {
    lines.push('SIN EXIGENCIAS: todavía no hay ningún sector ni ninguna R que declarar.');
  } else {
    lines.push(`EXIGENCIAS RESUELTAS: ${ev.exigencias.length}.`);
  }

  lines.push(
    ev.alturaEvacuacion === null
      ? 'Altura de evacuación: sin determinar.'
      : `Altura de evacuación: ${m2(ev.alturaEvacuacion)}${ev.alturaAMano ? ' (adoptada a mano)' : ' (de las plantas)'}.`,
  );

  for (const s of ev.sectores) {
    if (s.nombre === '') continue;
    const r = s.sinExigencia ? 'no se le exige resistencia al fuego' : s.minutos === null ? 'sin resolver' : `R ${s.minutos}`;
    lines.push(`Sector "${s.nombre}": ${r} — ${s.referencia || 'sin procedencia'}.`);
  }

  for (const e of ev.elementos) {
    if (e.nombre === '') continue;
    if (e.via === 'propia') {
      lines.push(`Elemento "${e.nombre}": ALCANZA R ${e.exigida} por su propia sección (${e.justificacion}).`);
    } else if (e.via === 'proteccion') {
      lines.push(`Elemento "${e.nombre}": NO llega solo a R ${e.exigida} — ${e.loQueFalta}.`);
    } else {
      lines.push(`Elemento "${e.nombre}": sin comprobar, faltan datos de la sección.`);
    }
  }

  if (ev.avisos.length > 0) {
    lines.push(`AVISOS (${ev.avisos.length}): ${ev.avisos.slice(0, 6).join(' · ')}`);
  }

  lines.push(ALCANCE_LINEA);

  const verdict = ev.huecos.length > 0 ? 'invalid' : ev.avisos.length > 0 ? 'warn' : 'none';
  return { verdict, text: lines.join('\n') };
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export const incendioAdapter: AiModuleAdapter<IncendioState> = {
  id: 'incendio',
  label: 'Incendio',
  payloadSchema: INCENDIO_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  // El edificio se describe sector a sector y elemento a elemento: entrevista
  // larga, como la de los otros módulos de acciones.
  historyTurns: 16,
  snapshot: buildSnapshot,
  // `system` no se usa: el DB SI va en minutos, metros y milímetros, y ninguno
  // de los tres cambia con el sistema técnico.
  buildPlan: (payload, current, _system: UnitSystem, confirmed) =>
    buildIncendioPlan(parsePayload(payload), current, confirmed),
};
