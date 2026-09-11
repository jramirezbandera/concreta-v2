/**
 * Adapter del asistente IA para el módulo «Cargas por planta» (ola 8).
 *
 * Es el primer adapter de un módulo de ACCIONES que se teclea en tabla, y eso
 * decide su forma: el payload NO es un puñado de escalares, es la tabla entera.
 * La pantalla ya dice «una fila por zona de carga», así que el payload es esa
 * misma lista plana —`zonas`, de arriba abajo, la cubierta primero— con
 * semántica de REEMPLAZO completo, como los nudos y barras del FEM 2D. Las
 * plantas se reconstruyen agrupando filas consecutivas con el mismo nombre,
 * que es exactamente lo que el usuario ve en la primera columna.
 *
 * POR QUÉ LA TABLA ENTERA Y NO UNOS ESCALARES
 * Aquí el trabajo del usuario ES la tabla: cinco plantas por tres cargas
 * encima por un uso son sesenta decisiones tecleadas a mano. Un asistente que
 * sólo supiera mover la altitud no ahorraría nada. La contrapartida es la de
 * todo reemplazo: el plan congela la lista al proponerla, y aplicar diez
 * minutos después pisa lo que se haya tecleado entre medias. Va dicho en el
 * handler del módulo y en la regla 12 del prompt.
 *
 * QUÉ QUEDA FUERA DEL PAYLOAD, A PROPÓSITO
 *
 * 1 · LA PROVINCIA Y EL MUNICIPIO. Se heredan de los datos de obra y el botón
 *     «Usar los datos de la obra» los trae de una vez. No entran en el cálculo
 *     —sólo se imprimen y viajan en el sobre— y dejarlos escribir sólo servía
 *     para que el módulo contradijese a la ficha del proyecto. La ALTITUD sí
 *     entra, porque por encima de 1.000 m cambian los ψ de la nieve.
 *
 * 2 · LA NIEVE PUBLICADA. Una cubierta en modo «la que publica Viento y nieve»
 *     lleva un valor copiado de un sobre, con su fecha y su emplazamiento, para
 *     poder avisar cuando aquel módulo vuelva a publicar. Escribir encima
 *     rompería esa trazabilidad en silencio: el número dejaría de ser el del
 *     sobre y la app seguiría diciendo de dónde salió. Se rechaza con motivo
 *     (`NIEVE_PUBLICADA_REASON`) y se le dice al usuario dónde cambiarlo.
 *
 * 3 · EL PESO PROPIO DE LA NORMA. `pp_kNm2 = 0` significa «el de la tabla C.5
 *     o el de la densidad», que es lo que resuelve el motor. Un peso tecleado
 *     PISA a la norma y sólo debe teclearse cuando el usuario trae el del
 *     fabricante o el del programa de cálculo. No se admite como campo
 *     anulable: 0 es el centinela, y un forjado que no pesa nada no existe.
 *
 * SEGURIDAD — qd por zona, no reglas campo a campo
 * Lo que este módulo entrega es la carga de cálculo de cada zona. Una tabla de
 * reglas por campo sería a la vez ruidosa (bajar el canto de un reticular no
 * cambia su peso de tabla) y agujereada (cambiar «Viviendas» por «Trasteros»
 * baja la sobrecarga un 40 % sin que ninguna función de nivel escalar lo vea).
 * Así que el detector EVALÚA el estado antes y después y compara `qd` zona a
 * zona, más `Gd` de las cargas lineales, más las eliminaciones. Es el mismo
 * giro que la descomposición del coeficiente sísmico en la ola 7.
 *
 * Y por qué no `detectResolvedRisks` para los escalares sueltos (altitud, el
 * terreno de los muros): su gate anti-ruido es
 * `current[k] !== defaults[k]` sobre claves del estado, y las de este módulo
 * —`emplazamiento`, `muros`— son OBJETOS. Dos objetos recién construidos nunca
 * son idénticos, así que el gate daría «establecido» siempre y la primera
 * propuesta de cada obra saldría en rojo. El gate de aquí compara la magnitud
 * RESUELTA con la de fábrica, que es lo que la regla genérica quería decir.
 */

import { AiError } from '../types';
import type { AiApplyPlan, AiFieldChange, AiModuleAdapter, AiSkippedField } from './types';
import type { AiResultsSummary } from '../resultsSummary';
import {
  higherIsSafer,
  lowerIsSafer,
  type AiSafetyRisk,
  type ResolvedSafetyRule,
  type SafetyRule,
} from '../safety';
import { formatQuantity } from '../../units/format';
import type { UnitSystem } from '../../units/types';
import {
  calcularCargas,
  CATEGORIAS_USO,
  type CategoriaUso,
  type FamiliaPsi,
  type TipoForjado,
} from '../../acciones';
import {
  CANTO_INICIAL,
  CATALOGO_LINEALES,
  CATALOGO_PERMANENTES,
  FORJADO_OPCIONES,
  USO_OPCIONES,
} from '../../../features/cargas-planta/catalogos';
import {
  asignarColumnas,
  defaultCargasState,
  entradaMotor,
  esEstadoInicial,
  nievePorDefecto,
  nuevoId,
  usoPorDefecto,
  type CargasState,
  type Evaluacion,
  type LinealUI,
  type PermanenteUI,
  type PlantaUI,
  type ZonaUI,
} from '../../../features/cargas-planta/state';

// ── Catálogo del módulo ──────────────────────────────────────────────────────

const TIPOS_FORJADO: readonly TipoForjado[] = FORJADO_OPCIONES.map((o) => o.id);
const CATEGORIAS: readonly (CategoriaUso | 'otro')[] = [...CATEGORIAS_USO, 'otro'];
const FAMILIAS: readonly FamiliaPsi[] = ['A', 'B', 'C', 'D', 'E', 'G'];
const IDS_ENCIMA: readonly string[] = CATALOGO_PERMANENTES.map((e) => e.id);

const ETIQUETA_FORJADO = new Map(FORJADO_OPCIONES.map((o) => [o.id, o.corta ?? o.etiqueta]));
const ETIQUETA_USO = new Map(USO_OPCIONES.map((o) => [o.id, o.corta ?? o.etiqueta]));

/** La entrada del catálogo de «¿qué hay encima?», por id. */
const ENCIMA_POR_ID = new Map(CATALOGO_PERMANENTES.map((e) => [e.id, e]));

/** El catálogo de cargas lineales, indexado por su etiqueta normalizada. */
const LINEAL_POR_ETIQUETA = new Map(
  CATALOGO_LINEALES.map((e) => [e.etiqueta.trim().toLocaleLowerCase('es'), e]),
);

const norm = (s: string) => s.trim().toLocaleLowerCase('es');

// ── Payload schema (JSON Schema canónico, todo lo de primer nivel anulable) ──
//
// Presupuesto de uniones Anthropic: 8 anulables de primer nivel + la unión de
// `proposal` del envelope = 9, muy por debajo del tope de 16. Los campos de
// DENTRO de las filas son obligatorios y NO anulables a propósito: la lista
// reemplaza entera, así que «sin cambio» no significa nada dentro de una fila,
// y cada centinela (0 = el peso de la norma, 0 = sin nieve, 0 = no es un muro)
// dice más que un null.

export const CARGAS_PAYLOAD_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'altitud_m', 'zonas', 'lineales',
    'muros_hay', 'muros_terreno', 'muros_phi_grados', 'muros_gamma_kNm3', 'muros_sobrecarga_kNm2',
    'warnings',
  ],
  properties: {
    altitud_m: {
      type: ['number', 'null'],
      description:
        'Altitud del emplazamiento sobre el nivel del mar, en METROS. Decide los coeficientes psi de la nieve: por encima de 1.000 m, psi0 = 0,7 en vez de 0,5 (tabla 4.2). La PROVINCIA y el MUNICIPIO no son campos de tu propuesta: se heredan de los datos de obra o se eligen en la barra superior del módulo.',
    },
    zonas: {
      type: ['array', 'null'],
      description:
        'Lista COMPLETA de filas de la tabla (REEMPLAZA la actual entera; null = sin cambio). UNA FILA POR ZONA DE CARGA. El orden es el de la sección del edificio: la CUBIERTA PRIMERO y la planta baja o el sótano al final. Filas CONSECUTIVAS con el mismo texto en "planta" son la misma planta con varias zonas (una vivienda y un vaso de piscina en la misma planta baja). Conserva el orden de las filas existentes y añade las nuevas donde correspondan en el edificio.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'planta', 'es_cubierta', 'zona', 'forjado', 'canto_cm', 'pp_kNm2', 'encima',
          'uso', 'qk_propio_kNm2', 'psi_como', 'inclinacion_grados', 'ligera',
          'acceso_desde', 'escalera', 'balcon', 'nieve_kNm2',
        ],
        properties: {
          planta: {
            type: 'string',
            description: 'Nombre de la planta tal como se lee en el plano: "Cubierta", "Planta Primera", "Planta Baja", "Sótano -1".',
          },
          es_cubierta: {
            type: 'boolean',
            description: 'true si esta planta es la cubierta del edificio: es la única que admite carga de nieve. Todas las filas de la misma planta deben decir lo mismo.',
          },
          zona: {
            type: 'string',
            description: 'Nombre de la zona dentro de la planta ("Vivienda", "Vaso piscina", "Garaje"). CADENA VACÍA cuando la planta es toda igual, que es el caso normal.',
          },
          forjado: {
            type: 'string',
            enum: [...TIPOS_FORJADO],
            description: 'Tipo de forjado. "reticular" nervios y casetones; "losa" losa maciza de hormigón; "unidireccional" viguetas y bovedillas; "chapa" chapa colaborante; "solera" losa apoyada en el terreno; "madera" viguetas y tablero; "otro" existente o de otro tipo. De él y del canto sale el peso propio de la tabla C.5.',
          },
          canto_cm: {
            type: 'number',
            description: 'Canto del forjado en CENTÍMETROS. Los tramos de la tabla C.5 son estrechos: si el canto se sale, la aplicación da error y hay que teclear el peso propio.',
          },
          pp_kNm2: {
            type: 'number',
            description: 'Peso propio del forjado en kN/m². Pon 0 para que lo resuelva LA NORMA (tabla C.5, o la densidad del hormigón por el canto en losas y soleras), que es lo normal. Teclea un valor SÓLO si el usuario te da el del fabricante o el del programa de cálculo: pisa al de la norma.',
          },
          encima: {
            type: 'array',
            description: 'Cargas permanentes que hay ENCIMA del forjado, además de su peso propio: solado, tabiquería, formación de cubierta, agua, tierra (tabla C.5 y art. 2.1-3). Lista completa de esta zona; vacía si no hay nada.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['catalogo', 'concepto', 'valor_kNm2', 'espesor_m'],
              properties: {
                catalogo: {
                  type: 'string',
                  enum: [...IDS_ENCIMA],
                  description: 'Entrada del catálogo de la tabla C.5: "solado" cerámico/madera/hidráulico, "solado-ligero" moqueta o lámina, "solado-piedra" placas de piedra o peldañeado, "tabiqueria", "cubierta-plana" impermeabilización vista, "cubierta-grava" invertida o a la catalana, "cubierta-teja" faldones de teja o pizarra, "cubierta-palomeros" teja sobre tabiques palomeros, "cubierta-ligera" chapa o paneles, "agua", "tierra", "otro" cualquier otra cosa (falsos techos, instalaciones, recrecidos).',
                },
                concepto: {
                  type: 'string',
                  description: 'Cómo se llama la carga en el cuadro. Con "otro" es OBLIGATORIO y es lo que se imprime; con una entrada del catálogo, cadena vacía para usar el nombre del catálogo.',
                },
                valor_kNm2: {
                  type: 'number',
                  description: 'Peso en kN/m². Pon 0 para usar el de la tabla C.5 de esa entrada del catálogo, que es lo normal. Con "agua" y "tierra" NO se usa: la carga sale de la densidad por el espesor.',
                },
                espesor_m: {
                  type: 'number',
                  description: 'Espesor en METROS, sólo para "agua" (10 kN/m³) y "tierra" (20 kN/m³): la carga es la densidad por este espesor. 0 en todo lo demás.',
                },
              },
            },
          },
          uso: {
            type: 'string',
            enum: [...CATEGORIAS],
            description: 'Categoría de uso de la tabla 3.1, de la que sale la sobrecarga: "A1" viviendas y habitaciones de hotel u hospital, "A2" trasteros, "B" oficinas, "C1" cafeterías y aulas con mesas, "C2" salones con asientos fijos, "C3" vestíbulos y zonas de paso, "C4" gimnasios, "C5" aglomeraciones, "D1" locales comerciales, "D2" grandes superficies, "E" garaje de vehículos ligeros, "F" terraza transitable privada, "G" cubierta no transitable (sólo conservación), "otro" un valor propio. TÚ ELIGES LA CATEGORÍA, NO EL NÚMERO: la sobrecarga la pone la tabla.',
          },
          qk_propio_kNm2: {
            type: 'number',
            description: 'Sobrecarga de uso adoptada, kN/m². SÓLO con uso = "otro" (almacenes, bibliotecas, equipos pesados, helipuertos: la norma remite al suministrador y obliga a consignar el valor en la memoria, art. 3.1-2). 0 en todos los demás usos.',
          },
          psi_como: {
            type: 'string',
            enum: [...FAMILIAS],
            description: 'Con qué fila de la tabla 4.2 van los psi de un uso adoptado: "A" residencial, "B" administrativo, "C" público, "D" comercial, "E" tráfico y aparcamiento, "G" cubiertas de mantenimiento. SÓLO con uso = "otro"; en los demás, pon "A" y se ignora.',
          },
          inclinacion_grados: {
            type: 'number',
            description: 'Inclinación de la cubierta en GRADOS. SÓLO con uso = "G": la sobrecarga de conservación es 1,0 kN/m² hasta 20º, nada a partir de 40º e interpolada entre medias (tabla 3.1, nota 3). 0 en los demás usos y en cubierta plana.',
          },
          ligera: {
            type: 'boolean',
            description: 'SÓLO con uso = "G": true si es una cubierta LIGERA sobre correas, sin forjado — entonces la sobrecarga de conservación baja a 0,4 kN/m² (tabla 3.1, nota 5). false en todo lo demás.',
          },
          acceso_desde: {
            type: 'string',
            enum: [...CATEGORIAS_USO],
            description: 'SÓLO con uso = "F" (terraza transitable): categoría de la zona DESDE LA QUE SE ACCEDE a la terraza. Si el acceso es público, la sobrecarga es la de esa zona (tabla 3.1, nota 2). Pon "A1" cuando no aplique.',
          },
          escalera: {
            type: 'boolean',
            description: 'true si la zona es una escalera: la tabla 3.1 le suma 1 kN/m² a la sobrecarga de la categoría (nota 4).',
          },
          balcon: {
            type: 'boolean',
            description: 'true si la zona es un balcón volado: además de la sobrecarga de la zona, la tabla 3.1 pide una carga lineal en el borde (nota 6).',
          },
          nieve_kNm2: {
            type: 'number',
            description: 'Carga de nieve en PROYECCIÓN HORIZONTAL, kN/m². Sólo cuenta si es_cubierta = true. Pon 0 para que la cubierta no lleve nieve. Si esta cubierta ya toma su nieve del módulo Viento y nieve, la aplicación RECHAZARÁ tu valor: ese número viene de un cálculo publicado y no se pisa desde aquí.',
          },
        },
      },
    },
    lineales: {
      type: ['array', 'null'],
      description:
        'Lista COMPLETA de cargas que apoyan EN LÍNEA sobre vigas y bordes de forjado (REEMPLAZA la actual entera; null = sin cambio): cerramientos de fachada, muros, tabiques pesados, petos y barandillas. No son cargas por metro cuadrado de planta: van en kN por metro lineal.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['concepto', 'alzado_kNm2', 'altura_m', 'kN_por_m'],
        properties: {
          concepto: {
            type: 'string',
            description: 'Cómo se llama en el cuadro: "Cerramiento de fachada", "Peto de cubierta", "Barandilla", "Tabicón".',
          },
          alzado_kNm2: {
            type: 'number',
            description: 'UN MURO SE MIDE POR SU ALZADO: lo que pesa un metro cuadrado de fábrica con su revestimiento, kN/m². La tabla C.5 da los cerramientos en kN/m para una altura libre del orden de 3 m, así que el alzado es ese valor dividido por 3 (hoja exterior de fachada = 2,33 kN/m² de alzado; tabicón = 0,67). 0 si esta carga no es un muro.',
          },
          altura_m: {
            type: 'number',
            description: 'Altura REAL del muro en metros, normalmente la altura libre de la planta. La carga por metro sale de alzado_kNm2 por altura_m. 0 si no es un muro.',
          },
          kN_por_m: {
            type: 'number',
            description: 'Carga por metro lineal, kN/m, cuando NO se mide por alzado (una barandilla: 1 kN/m de peso propio). 0 cuando el elemento es un muro y lleva alzado y altura.',
          },
        },
      },
    },
    muros_hay: {
      type: ['boolean', 'null'],
      description: 'true si la obra tiene MUROS DE SÓTANO O DE CONTENCIÓN. Enciende el bloque donde se declara con qué terreno se han calculado, que es lo que la memoria y el cuadro del plano tienen que decir (DB SE-C, capítulos 3 y 6). false lo apaga entero.',
    },
    muros_terreno: {
      type: ['string', 'null'],
      description: 'Cómo se llama el terreno de relleno tras los muros, como lo nombra el estudio geotécnico: "Terreno de relleno", "Arenas limosas", "Arcillas margosas".',
    },
    muros_phi_grados: {
      type: ['number', 'null'],
      description: 'Ángulo de rozamiento interno del relleno, GRADOS. Lo dice el geotécnico, no tú. SUBIRLO REBAJA EL EMPUJE sobre el muro: no es una variable de ajuste.',
    },
    muros_gamma_kNm3: {
      type: ['number', 'null'],
      description: 'Peso específico del relleno, kN/m³. Lo dice el geotécnico.',
    },
    muros_sobrecarga_kNm2: {
      type: ['number', 'null'],
      description: 'Sobrecarga en la coronación del trasdós, kN/m². El valor corriente en el borde de un vial es 10 kN/m²; en una zona ajardinada, 2.',
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Avisos: conversiones de unidades realizadas, ambigüedades, datos del enunciado ignorados.',
    },
  },
};

// ── Prompt del módulo ────────────────────────────────────────────────────────

const PROMPT_RULES = `Reglas específicas del módulo Cargas por planta (CTE DB SE-AE, art. 2 y 3 y Anejo C):
1. UNIDADES: las cargas de superficie en kN/m², las lineales en kN/m, el canto en CENTÍMETROS, la altura, el espesor y la altitud en METROS, la inclinación y el ángulo de rozamiento en GRADOS. Añade un warning con cada conversión que hagas (kg/m² a kN/m² se divide por 100 con g = 9,81: 100 kg/m² = 0,98 kN/m²).
2. UNA FILA POR ZONA DE CARGA, y la lista "zonas" REEMPLAZA la tabla entera. El orden es el de la sección del edificio: la cubierta la primera y la planta baja o el sótano la última. Filas consecutivas con el mismo nombre de planta son la misma planta repartida en zonas, y eso es lo que se hace cuando una planta tiene partes con distinto uso o distinto forjado (una vivienda y un vaso de piscina en la misma planta baja). Si sólo cambias una fila, vuelve a mandar TODAS las demás tal como están en el estado. Y RESPETA LOS NOMBRES QUE YA HAY: si el formulario dice «Planta Primera», no lo reescribas como «Planta 1». Las plantas se nombran como en el plano —Cubierta, Planta Segunda, Planta Primera, Planta Baja, Sótano -1—, y las que añadas siguen esa manera de nombrar.
3. TÚ ELIGES LA CATEGORÍA DE USO, NO EL NÚMERO. La sobrecarga sale de la tabla 3.1 y la pone la aplicación. Sólo con uso = "otro" se teclea un valor, y entonces hay que decir con qué familia de psi va (art. 3.1-2 y 3.1.1-5: el valor adoptado tiene que quedar consignado en la memoria). Si el usuario te da directamente un kN/m² para una vivienda, comprueba si coincide con el de la tabla antes de aceptarlo como uso adoptado: casi siempre quiere la categoría.
4. EL PESO PROPIO DEL FORJADO LO PONE LA NORMA. pp_kNm2 = 0 significa "el de la tabla C.5", o la densidad por el canto en losas y soleras, y es lo que hay que poner casi siempre. Teclea un valor SÓLO cuando el usuario te dé el del fabricante o el de su programa de cálculo. Los tramos de la tabla C.5 son estrechos y un canto fuera de tramo hace que la aplicación pida el peso a mano: si ves ese error en los resultados, pregúntale el peso, no inventes uno.
5. LA TABIQUERÍA ES UNA CARGA PERMANENTE. En viviendas basta con considerar 1,0 kN/m² de superficie construida (art. 2.1-3), y se olvida con facilidad: ponla en las plantas de vivienda y de oficina. No va en la cubierta ni en el garaje. Tabiques de más de 1,2 kN/m² de alzado NO se asimilan a carga uniforme y hay que meterlos como carga lineal.
6. LA CARGA DE NIEVE NO LA CALCULAS TÚ. Sale del emplazamiento por las tablas 3.7 y 3.8 y del Anejo E, y esta aplicación la calcula en el módulo «Viento y nieve», que publica el resultado con su faldón, su fecha y su obra. NUNCA cites de memoria la nieve de un sitio ni la estimes a partir de la altitud o de la provincia: dirías un número con aire de norma que no ha salido de ninguna tabla, y el documento que genera esta herramienta lo imprimiría como si viniera de un cálculo. Sólo escribe nieve_kNm2 cuando el USUARIO te dé el número; en cualquier otro caso ponlo a 0 y dile que calcule la nieve en «Viento y nieve» y la traiga con «La que publica Viento y nieve». Y si esa cubierta YA la toma de un sobre publicado, tu valor se RECHAZARÁ: pisarlo rompería la trazabilidad del número.
7. LA CUBIERTA DE CONSERVACIÓN NO ES CONCOMITANTE. El uso "G" no actúa a la vez que la nieve ni que el viento (tabla 3.1, nota 7). La aplicación hace la combinación y elige la hipótesis que manda; no sumes tú la nieve a la sobrecarga de conservación.
8. UN MURO SE MIDE POR SU ALZADO. Peso por metro cuadrado de fábrica y altura real de la planta: la carga por metro sale de multiplicarlos. La tabla C.5 da los cerramientos en kN/m "para una altura libre del orden de 3,0 m", así que con 2,60 m de altura libre la carga baja, y con 4 m sube. Lo que no es un muro —una barandilla— va directamente en kN_por_m, con alzado y altura a 0.
9. EL EMPLAZAMIENTO NO ES TUYO, SALVO LA ALTITUD. La provincia y el municipio se heredan de los datos de obra y se eligen en la barra superior; no son campos de tu propuesta. La altitud sí, porque por encima de 1.000 m los psi de la nieve cambian (tabla 4.2). No la bajes para que salgan números más cómodos.
10. EL TERRENO DE LOS MUROS LO DICE EL GEOTÉCNICO. phi, gamma y la sobrecarga del trasdós son datos de un informe, no estimaciones de conversación: un empuje calculado con un phi optimista es la forma más barata de que un muro salga más delgado de lo que debe. Y si el enunciado NO habla de muros de sótano o de contención, deja los cinco campos muros_* en NULL — null es «sin cambio». Mandar el valor que el formulario ya tiene no cambia nada y llena la tarjeta de filas inútiles que el usuario tiene que leer.
11. ESTE MÓDULO NO COMPRUEBA NADA. Entrega, por zona, la carga permanente G, la variable Q y la carga de cálculo qd = 1,35·G + 1,50·Q en ELU persistente, más la carga por metro de los elementos lineales. No dimensiona forjados, ni vigas, ni pilares: eso son otros módulos. Dilo si el usuario da por predimensionado el edificio.
12. CHECKPOINT: como "zonas" y "lineales" reemplazan la lista entera, cada turno tienes que volver a mandarlas COMPLETAS, incluyendo lo que ya habías propuesto en turnos anteriores y sigue pendiente de aplicar. Una lista a medias borra filas.`;

const PLACEHOLDER_EXAMPLE =
  'Ej.: Edificio de viviendas de 4 plantas en Aranda de Duero, a 800 m; forjado reticular de 30 cm, '
  + 'solado cerámico y tabiquería, planta baja con locales comerciales y cubierta plana con grava.';

// ── Parseo defensivo del payload ─────────────────────────────────────────────

/** Una carga permanente propuesta, tal como viaja en el payload. */
export interface EncimaAi {
  catalogo: string;
  concepto: string;
  valor_kNm2: number;
  espesor_m: number;
}

/** Una fila de la tabla, tal como viaja en el payload. Es la proyección PLANA del estado. */
export interface FilaAi {
  planta: string;
  es_cubierta: boolean;
  zona: string;
  forjado: TipoForjado;
  canto_cm: number;
  pp_kNm2: number;
  encima: EncimaAi[];
  uso: CategoriaUso | 'otro';
  qk_propio_kNm2: number;
  psi_como: FamiliaPsi;
  inclinacion_grados: number;
  ligera: boolean;
  acceso_desde: CategoriaUso;
  escalera: boolean;
  balcon: boolean;
  nieve_kNm2: number;
}

/** Una carga lineal propuesta. */
export interface LinealAi {
  concepto: string;
  alzado_kNm2: number;
  altura_m: number;
  kN_por_m: number;
}

interface CargasPayload {
  altitud_m: number | null;
  zonas: FilaAi[] | null;
  lineales: LinealAi[] | null;
  muros_hay: boolean | null;
  muros_terreno: string | null;
  muros_phi_grados: number | null;
  muros_gamma_kNm3: number | null;
  muros_sobrecarga_kNm2: number | null;
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

function parseEncima(raw: unknown): EncimaAi[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(esObjeto).map((e) => ({
    catalogo: unoDe(e.catalogo, IDS_ENCIMA, 'otro'),
    concepto: textoO(e.concepto, ''),
    valor_kNm2: numeroO(e.valor_kNm2, 0),
    espesor_m: numeroO(e.espesor_m, 0),
  }));
}

function parseFila(raw: Record<string, unknown>): FilaAi {
  const forjado = unoDe(raw.forjado, TIPOS_FORJADO, 'reticular');
  return {
    planta: textoO(raw.planta, ''),
    es_cubierta: boolO(raw.es_cubierta, false),
    zona: textoO(raw.zona, ''),
    forjado,
    canto_cm: numeroO(raw.canto_cm, CANTO_INICIAL[forjado]),
    pp_kNm2: numeroO(raw.pp_kNm2, 0),
    encima: parseEncima(raw.encima),
    uso: unoDe(raw.uso, CATEGORIAS, 'A1'),
    qk_propio_kNm2: numeroO(raw.qk_propio_kNm2, 0),
    psi_como: unoDe(raw.psi_como, FAMILIAS, 'A'),
    inclinacion_grados: numeroO(raw.inclinacion_grados, 0),
    ligera: boolO(raw.ligera, false),
    acceso_desde: unoDe(raw.acceso_desde, CATEGORIAS_USO, 'A1'),
    escalera: boolO(raw.escalera, false),
    balcon: boolO(raw.balcon, false),
    nieve_kNm2: numeroO(raw.nieve_kNm2, 0),
  };
}

function parseLineal(raw: Record<string, unknown>): LinealAi {
  return {
    concepto: textoO(raw.concepto, ''),
    alzado_kNm2: numeroO(raw.alzado_kNm2, 0),
    altura_m: numeroO(raw.altura_m, 0),
    kN_por_m: numeroO(raw.kN_por_m, 0),
  };
}

export function parsePayload(raw: unknown): CargasPayload {
  if (!esObjeto(raw)) {
    throw new AiError('bad-response', 'La propuesta del modelo no es un objeto JSON.');
  }
  return {
    altitud_m: finito(raw.altitud_m),
    zonas: Array.isArray(raw.zonas) ? raw.zonas.filter(esObjeto).map(parseFila) : null,
    lineales: Array.isArray(raw.lineales) ? raw.lineales.filter(esObjeto).map(parseLineal) : null,
    muros_hay: typeof raw.muros_hay === 'boolean' ? raw.muros_hay : null,
    muros_terreno: typeof raw.muros_terreno === 'string' ? raw.muros_terreno : null,
    muros_phi_grados: finito(raw.muros_phi_grados),
    muros_gamma_kNm3: finito(raw.muros_gamma_kNm3),
    muros_sobrecarga_kNm2: finito(raw.muros_sobrecarga_kNm2),
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

// ── Proyección plana del estado ──────────────────────────────────────────────
//
// La misma forma que una fila del payload. La usan el snapshot (para que el
// modelo lea lo que va a escribir), el mapper (identidad posicional) y el
// detector de riesgos (comparación fila a fila).

/** Dónde vive una fila dentro del estado anidado. */
interface Origen {
  planta: PlantaUI;
  zona: ZonaUI;
  /** Índice de la planta dentro del estado; la primera fila de cada planta manda. */
  primeraDeLaPlanta: boolean;
}

function filaDeZona(p: PlantaUI, z: ZonaUI): FilaAi {
  return {
    planta: p.nombre,
    es_cubierta: p.esCubierta,
    zona: z.nombre,
    forjado: z.forjado.tipo,
    canto_cm: z.forjado.canto,
    pp_kNm2: z.forjado.ppManual ?? 0,
    encima: z.permanentes.map((c) => ({
      catalogo: c.catalogoId ?? 'otro',
      concepto: c.concepto,
      valor_kNm2: c.valor,
      espesor_m: c.espesor ?? 0,
    })),
    uso: z.uso.categoria,
    qk_propio_kNm2: z.uso.qkManual,
    psi_como: z.uso.psiComo,
    inclinacion_grados: z.uso.inclinacion,
    ligera: z.uso.ligera,
    acceso_desde: z.uso.accesoDesde,
    escalera: z.uso.escalera,
    balcon: z.uso.balcon,
    nieve_kNm2: p.esCubierta && p.nieve.modo !== 'ninguna' ? p.nieve.valor : 0,
  };
}

function filasDe(s: CargasState): FilaAi[] {
  const out: FilaAi[] = [];
  for (const p of s.plantas) for (const z of p.zonas) out.push(filaDeZona(p, z));
  return out;
}

function origenesDe(s: CargasState): Origen[] {
  const out: Origen[] = [];
  for (const p of s.plantas) p.zonas.forEach((z, i) => out.push({ planta: p, zona: z, primeraDeLaPlanta: i === 0 }));
  return out;
}

function linealDe(l: LinealUI): LinealAi {
  const esMuro = l.alzado !== null && l.altura !== null;
  return {
    concepto: l.concepto,
    alzado_kNm2: esMuro ? (l.alzado ?? 0) : 0,
    altura_m: esMuro ? (l.altura ?? 0) : 0,
    kN_por_m: esMuro ? 0 : l.valor,
  };
}

// ── Mapper payload → estado ──────────────────────────────────────────────────

const ALREADY = 'Ya coincide con el valor actual';

export const NIEVE_PUBLICADA_REASON =
  'Esta cubierta toma su nieve del módulo Viento y nieve: el valor viene de un cálculo '
  + 'publicado, con su fecha y su emplazamiento, y no se pisa desde aquí. Cámbiela a «un '
  + 'valor propio» en la ficha de la zona, o recalcule Viento y nieve.';

const q2 = (v: number, system: UnitSystem) => formatQuantity(v, 'areaLoad', system);
const l2 = (v: number, system: UnitSystem) => formatQuantity(v, 'linearLoad', system);
const m2dec = (v: number) => `${v.toFixed(2).replace('.', ',')} m`;
const gr = (v: number) => `${v.toFixed(0)}º`;

/** El rótulo de una fila en la tarjeta de propuesta: «Planta Baja (Vaso piscina)». */
const rotuloFila = (f: FilaAi) => (f.zona.trim() ? `${f.planta.trim() || 'Planta'} (${f.zona.trim()})` : f.planta.trim() || 'Planta');

/** Una carga permanente propuesta → PermanenteUI, reusando la columna de la que ya estaba. */
function permanenteDePropuesta(e: EncimaAi, previa: PermanenteUI | undefined): PermanenteUI {
  const cat = e.catalogo === 'otro' ? undefined : ENCIMA_POR_ID.get(e.catalogo);
  if (cat && cat.id !== 'otro') {
    const porEspesor = cat.porEspesor;
    const espesor = porEspesor !== null ? (e.espesor_m > 0 ? e.espesor_m : 1) : null;
    const valor = porEspesor !== null
      ? porEspesor * (espesor ?? 1)
      : (e.valor_kNm2 > 0 ? e.valor_kNm2 : (cat.valor ?? 0));
    return {
      id: previa?.id ?? nuevoId('c'),
      concepto: e.concepto.trim() || cat.etiqueta,
      valor,
      catalogoId: cat.id,
      espesor,
    };
  }
  // Carga libre: conserva el id de columna de la que ocupaba su sitio, si lo
  // tenía; si no, `asignarColumnas` agrupará por nombre al final.
  const libre: PermanenteUI = {
    id: previa?.id ?? nuevoId('c'),
    concepto: e.concepto.trim(),
    valor: e.valor_kNm2,
    catalogoId: null,
    espesor: null,
  };
  if (previa && previa.catalogoId === null && previa.columna !== undefined && norm(previa.concepto) === norm(e.concepto)) {
    libre.columna = previa.columna;
  }
  return libre;
}

/** Una fila propuesta → ZonaUI, apoyada en la zona que ocupaba su sitio. */
function zonaDePropuesta(f: FilaAi, base: ZonaUI | undefined): ZonaUI {
  const uso = usoPorDefecto(f.uso);
  return {
    id: base?.id ?? nuevoId('z'),
    nombre: f.zona.trim(),
    forjado: {
      tipo: f.forjado,
      canto: f.canto_cm,
      ppManual: f.pp_kNm2 > 0 ? f.pp_kNm2 : null,
    },
    permanentes: f.encima.map((e, i) => permanenteDePropuesta(e, base?.permanentes[i])),
    uso: {
      ...uso,
      qkManual: f.uso === 'otro' ? f.qk_propio_kNm2 : 0,
      psiComo: f.uso === 'otro' ? f.psi_como : uso.psiComo,
      inclinacion: f.uso === 'G' ? f.inclinacion_grados : 0,
      ligera: f.uso === 'G' ? f.ligera : false,
      accesoDesde: f.uso === 'F' ? f.acceso_desde : 'A1',
      escalera: f.escalera,
      balcon: f.balcon,
    },
  };
}

/**
 * Filas propuestas → plantas. Agrupa filas CONSECUTIVAS con el mismo nombre de
 * planta, que es lo que la tabla enseña, y se apoya en las plantas y zonas que
 * ocupaban ese sitio para no perder sus ids ni la nieve tomada de un sobre.
 */
function plantasDePropuesta(
  filas: readonly FilaAi[],
  origenes: readonly Origen[],
  skipped: AiSkippedField[],
): PlantaUI[] {
  const plantas: PlantaUI[] = [];
  let i = 0;
  let nieveRechazada = false;

  while (i < filas.length) {
    const nombre = filas[i].planta.trim();
    let fin = i + 1;
    while (fin < filas.length && filas[fin].planta.trim() === nombre) fin += 1;

    const cabecera = filas[i];
    const base = origenes[i]?.planta;
    const esCubierta = cabecera.es_cubierta;

    // La nieve es de la PLANTA: manda la primera fila de la planta.
    let nieve = base && base.nombre.trim() === nombre ? { ...base.nieve } : nievePorDefecto();
    if (!esCubierta) {
      nieve = nievePorDefecto();
    } else if (nieve.modo === 'publicada') {
      // Un sobre vivo no se pisa (ver cabecera del fichero).
      if (Math.abs(nieve.valor - cabecera.nieve_kNm2) > 1e-9 && !nieveRechazada) {
        skipped.push({ field: 'zonas', label: `${nombre || 'Cubierta'} — nieve`, reason: NIEVE_PUBLICADA_REASON });
        nieveRechazada = true;
      }
    } else if (cabecera.nieve_kNm2 > 0) {
      nieve = { ...nievePorDefecto(), modo: 'manual', valor: cabecera.nieve_kNm2 };
    } else {
      nieve = nievePorDefecto();
    }

    plantas.push({
      id: base?.id ?? nuevoId('p'),
      nombre,
      esCubierta,
      nieve,
      zonas: filas.slice(i, fin).map((f, k) => zonaDePropuesta(f, origenes[i + k]?.zona)),
    });
    i = fin;
  }

  asignarColumnas(plantas);
  return plantas;
}

/** Una carga lineal propuesta → LinealUI, apoyada en la que ocupaba su sitio. */
function linealDePropuesta(l: LinealAi, base: LinealUI | undefined): LinealUI {
  const esMuro = l.alzado_kNm2 > 0 && l.altura_m > 0;
  const cat = LINEAL_POR_ETIQUETA.get(norm(l.concepto));
  return {
    id: base?.id ?? nuevoId('l'),
    concepto: l.concepto.trim(),
    valor: esMuro ? l.alzado_kNm2 * l.altura_m : l.kN_por_m,
    alzado: esMuro ? l.alzado_kNm2 : null,
    altura: esMuro ? l.altura_m : null,
    catalogoId: cat?.id ?? base?.catalogoId ?? null,
  };
}

// ── Cambios legibles ─────────────────────────────────────────────────────────

type Campo = { clave: string; etiqueta: string; texto: (f: FilaAi, system: UnitSystem) => string };

/** Lo que se pinta de cada fila, en el orden en que se lee la tabla. */
const CAMPOS_FILA: readonly Campo[] = [
  { clave: 'forjado', etiqueta: 'forjado', texto: (f) => `${ETIQUETA_FORJADO.get(f.forjado) ?? f.forjado}, ${f.canto_cm} cm` },
  { clave: 'pp', etiqueta: 'peso propio', texto: (f, s) => (f.pp_kNm2 > 0 ? q2(f.pp_kNm2, s) : 'el de la norma') },
  {
    clave: 'encima',
    etiqueta: 'encima del forjado',
    texto: (f, s) => (f.encima.length === 0
      ? 'nada'
      : f.encima
        .map((e) => {
          const cat = ENCIMA_POR_ID.get(e.catalogo);
          const nombre = e.concepto.trim() || cat?.etiqueta || 'carga';
          if (cat && cat.porEspesor !== null) return `${nombre} ${m2dec(e.espesor_m > 0 ? e.espesor_m : 1)}`;
          const v = e.valor_kNm2 > 0 ? e.valor_kNm2 : (cat?.valor ?? 0);
          return `${nombre} ${q2(v, s)}`;
        })
        .join(' · ')),
  },
  {
    clave: 'uso',
    etiqueta: 'uso',
    texto: (f, s) => {
      const base = ETIQUETA_USO.get(f.uso) ?? f.uso;
      const extras: string[] = [];
      if (f.uso === 'otro') extras.push(`${q2(f.qk_propio_kNm2, s)}, psi como ${f.psi_como}`);
      if (f.uso === 'G' && f.inclinacion_grados !== 0) extras.push(gr(f.inclinacion_grados));
      if (f.uso === 'G' && f.ligera) extras.push('ligera');
      if (f.uso === 'F') extras.push(`acceso desde ${f.acceso_desde}`);
      if (f.escalera) extras.push('escalera');
      if (f.balcon) extras.push('balcón');
      return extras.length > 0 ? `${base} (${extras.join(', ')})` : base;
    },
  },
  { clave: 'nieve', etiqueta: 'nieve', texto: (f, s) => (f.es_cubierta && f.nieve_kNm2 > 0 ? q2(f.nieve_kNm2, s) : 'sin nieve') },
];

const textoLineal = (l: LinealAi, s: UnitSystem) =>
  (l.alzado_kNm2 > 0 && l.altura_m > 0
    ? `${q2(l.alzado_kNm2, s)} de alzado × ${m2dec(l.altura_m)} = ${l2(l.alzado_kNm2 * l.altura_m, s)}`
    : l2(l.kN_por_m, s));

/** Filas propuestas vs. vigentes: una línea por dato que cambia. */
function cambiosDeFilas(
  propuestas: readonly FilaAi[],
  actuales: readonly FilaAi[],
  system: UnitSystem,
  changes: AiFieldChange[],
): void {
  const compartidas = Math.min(propuestas.length, actuales.length);
  for (let i = 0; i < compartidas; i++) {
    const a = actuales[i];
    const p = propuestas[i];
    if (rotuloFila(a) !== rotuloFila(p)) {
      changes.push({ field: `zonas[${i}].nombre`, label: `Fila ${i + 1} — nombre`, before: rotuloFila(a), after: rotuloFila(p) });
    }
    for (const c of CAMPOS_FILA) {
      if (c.clave === 'nieve' && !a.es_cubierta && !p.es_cubierta) continue;
      const antes = c.texto(a, system);
      const despues = c.texto(p, system);
      if (antes !== despues) {
        changes.push({ field: `zonas[${i}].${c.clave}`, label: `${rotuloFila(p)} — ${c.etiqueta}`, before: antes, after: despues });
      }
    }
  }
  for (let i = compartidas; i < propuestas.length; i++) {
    const p = propuestas[i];
    changes.push({
      field: `zonas[${i}]`,
      label: `Fila nueva — ${rotuloFila(p)}`,
      before: '—',
      after: CAMPOS_FILA.map((c) => c.texto(p, system)).join(' · '),
    });
  }
  if (propuestas.length < actuales.length) {
    changes.push({
      field: 'zonas.eliminadas',
      label: 'Filas que se eliminan',
      before: actuales.slice(propuestas.length).map(rotuloFila).join(' · '),
      after: '—',
    });
  }
}

function cambiosDeLineales(
  propuestas: readonly LinealAi[],
  actuales: readonly LinealAi[],
  system: UnitSystem,
  changes: AiFieldChange[],
): void {
  const compartidas = Math.min(propuestas.length, actuales.length);
  for (let i = 0; i < compartidas; i++) {
    const a = actuales[i];
    const p = propuestas[i];
    const antes = `${a.concepto.trim() || 'Sin nombre'}: ${textoLineal(a, system)}`;
    const despues = `${p.concepto.trim() || 'Sin nombre'}: ${textoLineal(p, system)}`;
    if (antes !== despues) {
      changes.push({ field: `lineales[${i}]`, label: `Carga lineal ${i + 1}`, before: antes, after: despues });
    }
  }
  for (let i = compartidas; i < propuestas.length; i++) {
    const p = propuestas[i];
    changes.push({
      field: `lineales[${i}]`,
      label: `Carga lineal nueva — ${p.concepto.trim() || 'Sin nombre'}`,
      before: '—',
      after: textoLineal(p, system),
    });
  }
  if (propuestas.length < actuales.length) {
    changes.push({
      field: 'lineales.eliminadas',
      label: 'Cargas lineales que se eliminan',
      before: actuales.slice(propuestas.length).map((l) => l.concepto.trim() || 'Sin nombre').join(' · '),
      after: '—',
    });
  }
}

// ── Seguridad ────────────────────────────────────────────────────────────────

/**
 * No hay ninguna regla ESCALAR: las claves de primer nivel de `CargasState`
 * son objetos y arrays, no magnitudes. Todo lo que este módulo protege va por
 * magnitud resuelta (los escalares de aquí abajo) o por evaluación de la tabla
 * (`riesgosDeTabla`). La tabla vacía es la declaración explícita que exige el
 * contrato de los adapters.
 */
export const CARGAS_SAFETY_RULES: ReadonlyArray<SafetyRule<CargasState>> = [];

/**
 * Magnitudes resueltas del módulo. Son `ResolvedSafetyRule` de verdad —entran
 * en el test de contrato como las de la ola 7— pero las consume un detector
 * PROPIO (`riesgosEscalares`), porque el gate genérico de `detectResolvedRisks`
 * compara `current[k] !== defaults[k]` sobre claves del estado y las de este
 * módulo (`emplazamiento`, `muros`) son OBJETOS: dos objetos recién construidos
 * nunca son idénticos, así que el gate daría «establecido» siempre y la primera
 * propuesta de cada obra saldría en rojo. El de aquí compara la magnitud
 * RESUELTA con la de fábrica, que es lo que la regla genérica quería decir.
 */
export const CARGAS_RESOLVED_RULES: ReadonlyArray<ResolvedSafetyRule<CargasState>> = [
  {
    id: 'altitud_m',
    label: 'Altitud del emplazamiento',
    resolve: (s) => s.emplazamiento.altitud,
    level: higherIsSafer,
    format: (v) => `${v.toFixed(0)} m`,
    why: 'Por encima de 1.000 m la nieve entra en las combinaciones con psi0 = 0,7 en vez de 0,5 '
      + '(tabla 4.2). Bajar la altitud rebaja la carga de cálculo de la cubierta sin tocar un solo '
      + 'número de carga. Es un dato del emplazamiento, no una variable de ajuste.',
    fields: ['emplazamiento'],
    confirmKeys: ['altitud_m'],
  },
  {
    id: 'muros_phi_grados',
    label: 'Muros — ángulo de rozamiento del relleno',
    resolve: (s) => (s.muros.hay ? s.muros.phi : null),
    level: lowerIsSafer,
    format: (v) => gr(v),
    why: 'El empuje del terreno baja al subir phi. Lo dice el estudio geotécnico, no una '
      + 'estimación de conversación: un phi optimista es la forma más barata de que un muro '
      + 'de contención salga más delgado de lo que debe.',
    fields: ['muros'],
    confirmKeys: ['muros_phi_grados'],
  },
  {
    id: 'muros_gamma_kNm3',
    label: 'Muros — peso específico del relleno',
    resolve: (s) => (s.muros.hay ? s.muros.gamma : null),
    level: higherIsSafer,
    format: (v) => `${v.toFixed(1).replace('.', ',')} kN/m³`,
    why: 'El empuje es proporcional a gamma: bajarlo rebaja la acción sobre el muro. Sale del geotécnico.',
    fields: ['muros'],
    confirmKeys: ['muros_gamma_kNm3'],
  },
  {
    id: 'muros_sobrecarga_kNm2',
    label: 'Muros — sobrecarga en el trasdós',
    resolve: (s) => (s.muros.hay ? s.muros.sobrecarga : null),
    level: higherIsSafer,
    format: (v) => `${v.toFixed(2).replace('.', ',')} kN/m²`,
    why: 'La sobrecarga de coronación añade un empuje uniforme en toda la altura del muro. '
      + 'Bajarla rebaja el empuje; el valor corriente en el borde de un vial es 10 kN/m².',
    fields: ['muros'],
    confirmKeys: ['muros_sobrecarga_kNm2'],
  },
];

const EPS = 1e-9;

function riesgosEscalares(
  actual: CargasState,
  final: CargasState,
  fabrica: CargasState,
  confirmed: ReadonlySet<string>,
): AiSafetyRisk[] {
  // La referencia de fábrica se lee con los MISMOS bloques encendidos que el
  // estado vigente. El de arranque trae los muros apagados, así que sus
  // magnitudes resuelven a null, y sin este ajuste el gate leería «null != 30»
  // y daría por establecida la primera declaración de terreno de cada obra —
  // justo el ruido que el gate existe para evitar.
  const referencia: CargasState = { ...fabrica, muros: { ...fabrica.muros, hay: actual.muros.hay } };

  const risks: AiSafetyRisk[] = [];
  for (const r of CARGAS_RESOLVED_RULES) {
    const antes = r.resolve(actual);
    const despues = r.resolve(final);
    if (antes === null || despues === null) continue;
    // Gate anti-ruido: la magnitud está establecida si difiere de la de fábrica
    // o si el hilo ya trató su clave.
    const establecida = r.resolve(referencia) !== antes || r.confirmKeys.some((k) => confirmed.has(k));
    if (!establecida) continue;
    const nivelAntes = r.level(antes);
    const nivelDespues = r.level(despues);
    if (nivelAntes === null || nivelDespues === null) continue;
    if (nivelDespues >= nivelAntes - EPS) continue;
    risks.push({ field: r.id, label: r.label, before: r.format(antes), after: r.format(despues), why: r.why });
  }
  return risks;
}

const QD_WHY =
  'La carga de cálculo de esta zona baja. Compruebe qué la ha rebajado —la categoría de uso, '
  + 'el peso propio del forjado, una carga permanente que desaparece o la nieve— y que responde '
  + 'a lo que de verdad hay en la obra. Es el número con el que se predimensiona todo lo que '
  + 'apoya en este forjado.';

const ELIMINAR_ZONAS_WHY =
  'La propuesta deja menos zonas de carga de las que hay. Lo que desaparece deja de contar en '
  + 'el cuadro y en la memoria, y un forjado sin fila no es un forjado sin carga.';

const ELIMINAR_LINEALES_WHY =
  'La propuesta deja menos cargas lineales de las que hay. Los cerramientos, petos y barandillas '
  + 'que desaparezcan dejan de llegar a las vigas y a los bordes de forjado.';

const GD_LINEAL_WHY =
  'La carga permanente de cálculo de este elemento lineal baja. Un cerramiento se mide por su '
  + 'alzado y la altura real de la planta: revise que no sea la altura la que se ha encogido.';

/**
 * Riesgos del módulo: se EVALÚA el estado antes y después y se comparan las
 * cargas de cálculo zona a zona, posicionalmente. Es lo que el módulo entrega,
 * y atrapa de una vez la categoría de uso, el forjado, el peso propio, las
 * cargas de encima y la nieve — que una tabla de reglas campo a campo sólo
 * vería a trozos.
 *
 * GATE ANTI-RUIDO: si el edificio sigue siendo el de arranque y el hilo no ha
 * tratado la tabla, la primera propuesta es RELLENARLA, no debilitarla.
 */
function riesgosDeTabla(
  actual: CargasState,
  final: CargasState,
  confirmed: ReadonlySet<string>,
  system: UnitSystem,
): AiSafetyRisk[] {
  if (esEstadoInicial(actual) && !confirmed.has('zonas')) return [];

  const risks: AiSafetyRisk[] = [];
  const antes = calcularCargas(entradaMotor(actual));
  const despues = calcularCargas(entradaMotor(final));

  const zonasDe = (r: typeof antes) => r.plantas.flatMap((p) => p.zonas);
  const za = zonasDe(antes);
  const zd = zonasDe(despues);
  const compartidas = Math.min(za.length, zd.length);

  for (let i = 0; i < compartidas; i++) {
    if (zd[i].qd >= za[i].qd - EPS) continue;
    risks.push({
      field: `zonas[${i}].qd`,
      label: `${zd[i].rotulo} — carga de cálculo qd`,
      before: q2(za[i].qd, system),
      after: q2(zd[i].qd, system),
      why: QD_WHY,
    });
  }
  if (zd.length < za.length) {
    risks.push({
      field: 'zonas.eliminadas',
      label: 'Zonas de carga que se eliminan',
      before: `${za.length} zonas`,
      after: `${zd.length} zonas`,
      why: ELIMINAR_ZONAS_WHY,
    });
  }

  const la = antes.lineales;
  const ld = despues.lineales;
  const compartidasL = Math.min(la.length, ld.length);
  for (let i = 0; i < compartidasL; i++) {
    if (ld[i].Gd >= la[i].Gd - EPS) continue;
    risks.push({
      field: `lineales[${i}].Gd`,
      label: `${ld[i].concepto.trim() || `Carga lineal ${i + 1}`} — Gd`,
      before: l2(la[i].Gd, system),
      after: l2(ld[i].Gd, system),
      why: GD_LINEAL_WHY,
    });
  }
  if (ld.length < la.length) {
    risks.push({
      field: 'lineales.eliminadas',
      label: 'Cargas lineales que se eliminan',
      before: `${la.length} cargas`,
      after: `${ld.length} cargas`,
      why: ELIMINAR_LINEALES_WHY,
    });
  }

  return risks;
}

// ── buildPlan ────────────────────────────────────────────────────────────────

function buildCargasPlan(
  payload: CargasPayload,
  current: CargasState,
  system: UnitSystem,
  confirmed: ReadonlySet<string> = new Set<string>(),
): AiApplyPlan<CargasState> {
  const fields: Partial<CargasState> = {};
  const changes: AiFieldChange[] = [];
  const skipped: AiSkippedField[] = [];
  const notFound: string[] = [];
  const warnings = [...payload.warnings];

  // ── Altitud ────────────────────────────────────────────────────────────────
  if (payload.altitud_m !== null) {
    const antes = current.emplazamiento.altitud;
    if (payload.altitud_m < 0 || payload.altitud_m > 4000) {
      skipped.push({
        field: 'altitud_m',
        label: 'Altitud del emplazamiento',
        reason: `Fuera de rango: ${payload.altitud_m} m (se admite de 0 a 4.000 m).`,
      });
    } else if (antes !== null && Math.abs(antes - payload.altitud_m) < EPS) {
      skipped.push({ field: 'altitud_m', label: 'Altitud del emplazamiento', reason: ALREADY });
    } else {
      fields.emplazamiento = { ...current.emplazamiento, altitud: payload.altitud_m };
      changes.push({
        field: 'altitud_m',
        label: 'Altitud del emplazamiento',
        before: antes === null ? 'sin decir' : `${antes.toFixed(0)} m`,
        after: `${payload.altitud_m.toFixed(0)} m`,
      });
    }
  }

  // ── La tabla ───────────────────────────────────────────────────────────────
  if (payload.zonas !== null) {
    if (payload.zonas.length === 0) {
      skipped.push({
        field: 'zonas',
        label: 'Tabla de plantas y zonas',
        reason: 'La lista llega vacía: un edificio sin ninguna planta no se puede calcular. '
          + 'Manda la tabla completa, con todas las filas.',
      });
    } else {
      const actuales = filasDe(current);
      const origenes = origenesDe(current);
      const plantas = plantasDePropuesta(payload.zonas, origenes, skipped);
      // La nieve rechazada se queda con el valor del sobre, así que la fila
      // propuesta ya no describe lo que se va a aplicar: se relee del resultado.
      const finales = filasDe({ ...current, plantas });
      cambiosDeFilas(finales, actuales, system, changes);
      if (JSON.stringify(finales) !== JSON.stringify(actuales)) fields.plantas = plantas;
      else skipped.push({ field: 'zonas', label: 'Tabla de plantas y zonas', reason: ALREADY });
    }
  }

  // ── Cargas lineales ────────────────────────────────────────────────────────
  if (payload.lineales !== null) {
    const actuales = current.lineales.map(linealDe);
    const lineales = payload.lineales.map((l, i) => linealDePropuesta(l, current.lineales[i]));
    const finales = lineales.map(linealDe);
    cambiosDeLineales(finales, actuales, system, changes);
    if (JSON.stringify(finales) !== JSON.stringify(actuales)) fields.lineales = lineales;
    else skipped.push({ field: 'lineales', label: 'Cargas lineales', reason: ALREADY });
  }

  // ── Muros ──────────────────────────────────────────────────────────────────
  const murosPedidos = payload.muros_hay !== null
    || payload.muros_terreno !== null
    || payload.muros_phi_grados !== null
    || payload.muros_gamma_kNm3 !== null
    || payload.muros_sobrecarga_kNm2 !== null;

  if (murosPedidos) {
    const antes = current.muros;
    const muros = { ...antes };
    // Un solo skip benigno por el BLOQUE, no uno por campo. El modelo devuelve
    // los cinco muros_* con el valor que ya tienen en cuanto los ve en el
    // snapshot, aunque el enunciado no hable de sótanos, y cinco filas de «ya
    // coincide» es ruido que el usuario tiene que leer entero para descubrir
    // que no dice nada. La regla 10 del prompt le pide que los deje en null;
    // esto es la red por si no lo hace.
    const anota = (clave: string, label: string, before: string, after: string) => {
      if (before !== after) changes.push({ field: clave, label, before, after });
    };

    if (payload.muros_hay !== null) {
      muros.hay = payload.muros_hay;
      anota('muros_hay', 'Muros de sótano o contención', antes.hay ? 'sí' : 'no', muros.hay ? 'sí' : 'no');
    }
    if (payload.muros_terreno !== null && payload.muros_terreno.trim() !== '') {
      muros.terreno = payload.muros_terreno.trim();
      anota('muros_terreno', 'Muros — terreno declarado', antes.terreno, muros.terreno);
    }
    if (payload.muros_phi_grados !== null) {
      if (payload.muros_phi_grados <= 0 || payload.muros_phi_grados >= 60) {
        skipped.push({ field: 'muros_phi_grados', label: 'Muros — ángulo de rozamiento', reason: `Fuera de rango: ${payload.muros_phi_grados}º (se admite de 0 a 60º).` });
      } else {
        muros.phi = payload.muros_phi_grados;
        anota('muros_phi_grados', 'Muros — ángulo de rozamiento', gr(antes.phi), gr(muros.phi));
      }
    }
    if (payload.muros_gamma_kNm3 !== null) {
      if (payload.muros_gamma_kNm3 <= 0 || payload.muros_gamma_kNm3 > 30) {
        skipped.push({ field: 'muros_gamma_kNm3', label: 'Muros — peso específico', reason: `Fuera de rango: ${payload.muros_gamma_kNm3} kN/m³ (se admite de 0 a 30).` });
      } else {
        muros.gamma = payload.muros_gamma_kNm3;
        anota('muros_gamma_kNm3', 'Muros — peso específico', `${antes.gamma} kN/m³`, `${muros.gamma} kN/m³`);
      }
    }
    if (payload.muros_sobrecarga_kNm2 !== null) {
      if (payload.muros_sobrecarga_kNm2 < 0 || payload.muros_sobrecarga_kNm2 > 100) {
        skipped.push({ field: 'muros_sobrecarga_kNm2', label: 'Muros — sobrecarga en el trasdós', reason: `Fuera de rango: ${payload.muros_sobrecarga_kNm2} kN/m² (se admite de 0 a 100).` });
      } else {
        muros.sobrecarga = payload.muros_sobrecarga_kNm2;
        anota('muros_sobrecarga_kNm2', 'Muros — sobrecarga en el trasdós', q2(antes.sobrecarga, system), q2(muros.sobrecarga, system));
      }
    }
    if (JSON.stringify(muros) !== JSON.stringify(antes)) fields.muros = muros;
    else if (!skipped.some((k) => k.field?.startsWith('muros_'))) {
      skipped.push({ field: 'muros_hay', label: 'Muros de sótano o contención', reason: ALREADY });
    }
  }

  // ── Riesgos ────────────────────────────────────────────────────────────────
  const final: CargasState = { ...current, ...fields };
  const fabrica = defaultCargasState();
  const risks = [
    ...riesgosDeTabla(current, final, confirmed, system),
    ...riesgosEscalares(current, final, fabrica, confirmed),
  ];

  return { fields, changes, skipped, notFound, warnings, risks };
}

// ── Snapshot del estado ──────────────────────────────────────────────────────

function buildSnapshot(c: CargasState): string {
  const fabrica = defaultCargasState();
  const valores: Record<string, unknown> = {
    altitud_m: c.emplazamiento.altitud,
    zonas: filasDe(c),
    lineales: c.lineales.map(linealDe),
    muros_hay: c.muros.hay,
    muros_terreno: c.muros.terreno,
    muros_phi_grados: c.muros.phi,
    muros_gamma_kNm3: c.muros.gamma,
    muros_sobrecarga_kNm2: c.muros.sobrecarga,
  };

  const sinConfirmar: string[] = [];
  if (c.emplazamiento.altitud === null || c.emplazamiento.altitud === fabrica.emplazamiento.altitud) sinConfirmar.push('altitud_m');
  if (esEstadoInicial(c)) sinConfirmar.push('zonas', 'lineales');
  if (!c.muros.hay) sinConfirmar.push('muros_hay', 'muros_terreno', 'muros_phi_grados', 'muros_gamma_kNm3', 'muros_sobrecarga_kNm2');

  // Contexto de SOLO LECTURA, dentro de `valores`: `decorateSnapshot`
  // reconstruye el objeto quedándose sólo con valores / sin_confirmar /
  // pendientes_de_aplicar, y una clave hermana de primer nivel desaparecería en
  // silencio en cuanto el modelo hiciera su primera propuesta.
  valores.emplazamiento_heredado = {
    provincia_ine: c.emplazamiento.provincia || null,
    municipio: c.emplazamiento.municipio || null,
    nota: 'La provincia y el municipio se heredan de los datos de obra y NO son campos de tu propuesta.',
  };
  valores.nieve_de_cada_cubierta = c.plantas
    .filter((p) => p.esCubierta)
    .map((p) => ({
      planta: p.nombre,
      modo: p.nieve.modo === 'publicada' ? 'tomada del módulo Viento y nieve' : (p.nieve.modo === 'manual' ? 'un valor propio' : 'sin nieve'),
      valor_kNm2: p.nieve.valor,
      ...(p.nieve.modo === 'publicada' ? { no_editable: true, faldon: p.nieve.faldon } : {}),
    }));
  valores.edificio_de_la_plantilla = esEstadoInicial(c);

  return JSON.stringify({ valores, sin_confirmar: sinConfirmar });
}

// ── Resumen de resultados para el prompt ─────────────────────────────────────

const ALCANCE_LINEA =
  'ATENCION: este módulo NO comprueba nada. Entrega la carga permanente G, la variable Q y la '
  + 'carga de cálculo qd de cada zona, más la carga por metro de los elementos lineales. No '
  + 'dimensiona forjados, ni vigas, ni pilares: que la tabla salga entera no significa que el '
  + 'edificio esté predimensionado.';

/**
 * El resultado de este módulo es una TABLA, no un veredicto: no hay ninguna
 * comprobación que cumpla o incumpla, así que el resumen se escribe a mano en
 * vez de pasar por `summarizeCalcResults`, que serializa `CheckRow[]`. El
 * veredicto lo da lo único que bloquea: los errores de entrada.
 */
export function summarizeCargasResults(ev: Evaluacion): AiResultsSummary {
  const r = ev.resultado;
  const lines: string[] = [];

  if (ev.errores > 0) {
    lines.push(`CÁLCULO NO VÁLIDO: ${r.errores.length} error${r.errores.length === 1 ? '' : 'es'} de entrada bloquean la exportación.`);
  } else {
    lines.push(`TABLA COMPLETA: ${r.plantas.length} planta${r.plantas.length === 1 ? '' : 's'} y ${r.plantas.reduce((n, p) => n + p.zonas.length, 0)} zonas de carga.`);
  }
  lines.push(`Coeficientes parciales: gammaG = ${r.gamma.G.toFixed(2)} · gammaQ = ${r.gamma.Q.toFixed(2)} (tabla 4.1).`);

  for (const p of r.plantas) {
    for (const z of p.zonas) {
      const trozos = [
        `pp = ${z.forjado.pp.toFixed(2)} (${z.forjado.ppOrigen === 'manual' ? 'tecleado' : (z.forjado.ppOrigen === 'sinDato' ? 'SIN DATO' : z.forjado.ppOrigen)})`,
        `resto permanente = ${z.resto.toFixed(2)}`,
        `G = ${z.G.toFixed(2)}`,
        `uso ${z.uso.etiqueta}: qk = ${z.uso.qUso.toFixed(2)}`,
      ];
      if (z.nieve !== null) trozos.push(`nieve = ${z.nieve.toFixed(2)}`);
      trozos.push(`Q = ${z.Q.toFixed(2)} (hipótesis ${z.hipotesis})`);
      trozos.push(`Gd = ${z.Gd.toFixed(2)} · Qd = ${z.Qd.toFixed(2)} · qd = ${z.qd.toFixed(2)} kN/m²`);
      if (z.uso.qkConcentrada !== null) trozos.push(`carga concentrada = ${z.uso.qkConcentrada.toFixed(1)} kN`);
      if (z.forjado.fueraDeTabla) trozos.push('CANTO FUERA DE LA TABLA C.5: el peso propio hay que teclearlo');
      lines.push(`- ${z.rotulo}: ${trozos.join(' | ')}`);
    }
  }

  for (const l of r.lineales) {
    const medida = l.alzado !== null && l.altura !== null
      ? `${l.alzado.toFixed(2)} kN/m² de alzado × ${l.altura.toFixed(2)} m`
      : 'tecleada';
    lines.push(`- Lineal · ${l.concepto.trim() || 'Sin nombre'}: gk = ${l.gk.toFixed(2)} kN/m (${medida}) · Gd = ${l.Gd.toFixed(2)} kN/m`);
  }

  if (r.muros !== null) {
    lines.push(`- Muros · terreno declarado "${r.muros.terreno}": phi = ${r.muros.phi}º · gamma = ${r.muros.gamma} kN/m³ · sobrecarga = ${r.muros.sobrecarga} kN/m²`);
  }

  if (r.psiPresentes.length > 0) {
    lines.push(`- Coeficientes psi presentes (tabla 4.2): ${r.psiPresentes.map((p) => `${p.etiqueta} psi0=${p.psi.psi0} psi1=${p.psi.psi1} psi2=${p.psi.psi2}`).join(' · ')}`);
  }

  for (const e of r.errores) lines.push(`ERROR: ${e}`);
  for (const a of r.avisos) lines.push(`Aviso: ${a}`);
  for (const a of ev.avisosNieve) lines.push(`Aviso de la nieve publicada: ${a}`);
  lines.push(ALCANCE_LINEA);

  // Nunca 'ok': aquí no hay ninguna comprobación que cumpla, y rotular «CUMPLE»
  // encima de una tabla de cargas diría lo que el módulo justamente no dice.
  const verdict = ev.errores > 0 ? 'invalid' : (ev.avisos > 0 ? 'warn' : 'none');
  return { verdict, text: lines.join('\n') };
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export const cargasPlantaAdapter: AiModuleAdapter<CargasState> = {
  id: 'cargas-planta',
  label: 'Cargas por planta',
  payloadSchema: CARGAS_PAYLOAD_SCHEMA,
  promptRules: PROMPT_RULES,
  placeholder: PLACEHOLDER_EXAMPLE,
  // La tabla se llena planta a planta y en lenguaje de obra: la entrevista es
  // larga, y la ventana por defecto (12 turnos) se queda corta antes de que el
  // usuario haya terminado de describir el edificio.
  historyTurns: 16,
  snapshot: buildSnapshot,
  buildPlan: (payload, current, system, confirmed) =>
    buildCargasPlan(parsePayload(payload), current, system, confirmed),
};
