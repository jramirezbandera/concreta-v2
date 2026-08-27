// PDF del módulo de acción sísmica NCSE-02 (RD 997/2002).
//
// Este documento no se parece a los demás de Concreta, y la diferencia es
// deliberada: en los otros módulos el PDF justifica un CÁLCULO, y aquí lo
// primero que hay que justificar es si existe cálculo que hacer. Por eso el
// veredicto de las dos puertas (art. 1.2.3 y art. 3.5.1) va ANTES que ningún
// número, igual que en pantalla, y por eso el documento de EXENCIÓN es un
// documento completo y no un PDF a medias: «esta obra no está obligada a
// justificar sismo, y éste es el artículo» es exactamente el papel que se
// adjunta a una memoria.
//
// Tres invariantes que este exportador cumple sí o sí
// ───────────────────────────────────────────────────
//  1. DECLARADO no es COMPROBADO. Los requisitos (3), (4) y (5) del art. 3.5.1
//     son un juicio del proyectista, no una comprobación de la herramienta. La
//     tabla los rotula como declarados. `codes/seismic/types.ts` lo pide por
//     escrito, y `seismicNCSE02.test.ts` lo vigila.
//  2. Las sobrecargas EXCLUIDAS de la masa sísmica (art. 3.2) se listan una a
//     una, con la planta y la carga que se dejó fuera. Excluir es una decisión,
//     y una decisión que no aparece en el papel es una decisión que nadie puede
//     revisar.
//  3. `ab` y `K` viajan con su procedencia: la capa del IGN, su licencia y el
//     sha256 del dataset cosechado. Una memoria que afirma ab = 0,23 g tiene
//     que poder decir de dónde lo sacó.
//
// Qué NO se exporta, y por qué (ver `seismicPdfBlocker`)
// ──────────────────────────────────────────────────────
// Con la puerta sin resolver —falta `ac`, o quedan requisitos sin declarar— el
// documento no diría nada y aun así parecería una justificación. Ahí el botón
// avisa en vez de generar. Los otros tres estados SÍ producen documento, el de
// exención incluido.
//
// Sin conversión de unidades, a propósito: el módulo trabaja en kN y m en
// pantalla y no ofrece sistema técnico. Un PDF que convirtiera lo que la
// pantalla no convierte enseñaría números distintos de los que el usuario vio.

import jsPDF from 'jspdf';

import {
  PAGE_W,
  drawFootersAllPages,
  drawHeader,
  drawTable,
  embedSvgAsImage,
  ensureSpace,
  inputsFingerprint,
  pdfStr,
  setGray,
  slugTitle,
  titledFilename,
  type PdfResult,
  type TableCol,
} from './utils';
import { FRACCION_MASA, NCSE02_ENGINE_VERSION } from '../codes/seismic/ncse02';
import { MOTIVO_EXENCION } from '../codes/seismic/applicability';
import type {
  AvisoNorma,
  CasoDireccional,
  CategoriaMasa,
  MotivoImpedimento,
  PlantaResuelta,
  DireccionResult,
  Importancia,
  Requisito,
  SistemaEstructural,
  TipoTerreno,
} from '../codes/seismic/types';
import {
  plantasSobreRasante,
  type DireccionUI,
  type SeismicEvaluation,
  type SeismicState,
} from '../../features/seismic-ncse02/state';
import manifiesto from '../../features/seismic-ncse02/ncse02.hazard.manifest.json';

const M = 20;
const ANCHO = PAGE_W - 2 * M;
/** Interlínea real de jsPDF: fontSize (pt) × lineHeightFactor (1,15) → mm. */
const PT2MM = 25.4 / 72;

// ── Rótulos ──────────────────────────────────────────────────────────────────

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
  permanente: 'Permanente',
  tabiqueria: 'Tabiquería',
  'uso-residencial': 'Uso · residencial',
  'uso-publico': 'Uso · público',
  'uso-aglomeracion': 'Uso · aglomeración',
  'uso-almacen': 'Uso · almacén',
  'nieve-persistente': 'Nieve persistente',
  agua: 'Agua',
};

// MOTIVO_EXENCION vive en `lib/codes/seismic/applicability.ts`: es el texto del
// artículo, no una decisión de este exportador.

/**
 * Las cinco expresiones del art. 3.7.2.2, para que el PDF diga por CUÁL se ha
 * obtenido T_F y no sólo cuánto vale. Los sistemas sin expresión tabulada no
 * figuran: ahí T_F sólo puede venir impuesto (art. 3.6.2.3.2).
 */
const EXPRESION_TF: Partial<Record<SistemaEstructural, string>> = {
  fabrica: '(1) T_F = 0,06·H·√(H/(2L+H))/√L',
  'porticos-ha': '(2) T_F = 0,09·n',
  'porticos-ha-pantallas': '(3) T_F = 0,07·n·√(H/(B+H))',
  'porticos-acero': '(4) T_F = 0,11·n',
  'acero-triangulado': '(5) T_F = 0,085·n·√(H/(B+H))',
};

const SEVERIDAD_LABEL: Record<AvisoNorma['severidad'], string> = {
  info: 'Nota',
  aviso: 'Aviso',
  bloqueo: 'Bloqueo',
};

const ESTADO_REQUISITO: Record<string, string> = {
  true: 'CUMPLE',
  false: 'NO CUMPLE',
  null: 'SIN DECLARAR',
};

// ── Formato numérico ─────────────────────────────────────────────────────────
//
// Coma decimal y punto de millar, como en pantalla. `toLocaleString('es-ES')`
// NO agrupa los números de cuatro cifras (minimumGroupingDigits = 2): un
// cortante de 2277 kN sale «2277» y está bien.

const num = (v: number, dec = 0): string =>
  Number.isFinite(v)
    ? v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : '—';

const pct = (v: number, dec = 1): string => `${num(v * 100, dec)} %`;

// ── Puerta de exportación ────────────────────────────────────────────────────

/**
 * Motivo por el que este caso NO puede producir PDF, o `null` si sí puede.
 *
 * Fuente única: el módulo la usa como `valid` del `useTitledPdfExport` y como
 * texto del aviso, de modo que el mensaje que lee el usuario es el mismo que
 * decide. Sin esto habría dos reglas —la del botón y la del exportador— y
 * acabarían separándose.
 *
 * Sólo bloquea con la puerta SIN RESOLVER. Que la Norma no rija, o que el
 * método simplificado no sirva, no son motivos para negar el papel: son
 * justamente lo que el papel tiene que decir.
 */
export function seismicPdfBlocker(evaluacion: SeismicEvaluation): string | null {
  const { obligatoriedad: obl, metodoSimplificado: met } = evaluacion.aplicabilidad;
  if (obl.estado === 'indeterminada') {
    return (
      'Todavía no se puede decidir si la NCSE-02 es de aplicación: falta ' +
      `${obl.falta ?? 'un dato del emplazamiento'}. Un PDF con la puerta sin resolver ` +
      'parecería una justificación sin serlo.'
    );
  }
  // La pasarela de las cuatro plantas LEVANTA los requisitos (3) a (6): que
  // estén sin declarar es su régimen normal, no un descuido. Bloquear ahí
  // negaba el documento a un caso que el módulo calcula entero y enseña en
  // pantalla, y con un mensaje que además no venía a cuento.
  if (met?.via !== 'pasarela-4-plantas') {
    const sinDeclarar = (met?.requisitos ?? [])
      .filter((r) => r.cumple === null)
      .map((r) => r.id);
    if (sinDeclarar.length > 0) {
      return (
        `Quedan sin declarar los requisitos (${sinDeclarar.join(', ')}) del art. 3.5.1. ` +
        'El PDF no puede recogerlos como justificados mientras nadie los declare.'
      );
    }
  }
  return null;
}

/**
 * Nombre por defecto cuando el título va vacío. Fuente única compartida por el
 * exportador y la vista previa del `TitlePromptModal`.
 *
 * Lleva el municipio porque es el dato que identifica el caso: dos edificios
 * distintos en el mismo sitio se distinguen por el título; el mismo edificio en
 * otro sitio es otro cálculo entero.
 */
export function seismicNCSE02FallbackFilename(state?: SeismicState): string {
  const sitio = state?.municipioNombre ? slugTitle(state.municipioNombre) : '';
  const fecha = new Date().toISOString().slice(0, 10);
  return `sismo-ncse02${sitio ? `-${sitio}` : ''}-${fecha}.pdf`;
}

// ── Primitivas de maquetación ────────────────────────────────────────────────

function seccion(doc: jsPDF, y: number, titulo: string, articulo?: string): number {
  // Reserva el rótulo MÁS la cabecera de su tabla y un par de filas: ningún
  // título se queda huérfano al fondo de la página con su contenido detrás.
  const ny = ensureSpace(doc, y, 28, M);
  doc.setLineWidth(0.3);
  setGray(doc, 180);
  doc.line(M, ny - 2, PAGE_W - M, ny - 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setGray(doc, 60);
  doc.text(pdfStr(titulo), M, ny + 3);
  if (articulo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setGray(doc, 140);
    doc.text(pdfStr(articulo), PAGE_W - M, ny + 3, { align: 'right' });
  }
  return ny + 8;
}

interface ParrafoOpts {
  size?: number;
  gray?: number;
  italic?: boolean;
  bold?: boolean;
}

function parrafo(doc: jsPDF, y: number, texto: string, opts: ParrafoOpts = {}): number {
  const size = opts.size ?? 7.5;
  doc.setFont('helvetica', opts.italic ? 'italic' : opts.bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  setGray(doc, opts.gray ?? 110);
  const lineas = doc.splitTextToSize(pdfStr(texto), ANCHO) as string[];
  const lh = size * 1.15 * PT2MM;
  const ny = ensureSpace(doc, y, lineas.length * lh + 2, M);
  doc.text(lineas, M, ny);
  return ny + lineas.length * lh + 2;
}

/** Banda de datos en columnas: rótulo en versalitas y sus líneas debajo. */
function banda(
  doc: jsPDF,
  y: number,
  columnas: { header: string; lines: string[] }[],
): number {
  const alto = 4.2 * (2 + Math.max(...columnas.map((c) => c.lines.length))) + 3;
  const ny = ensureSpace(doc, y, alto, M);
  const colW = ANCHO / columnas.length;
  let bottom = ny;
  columnas.forEach((col, i) => {
    const x = M + i * colW;
    let ry = ny;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setGray(doc, 100);
    // El rótulo también envuelve. Sin esto, un encabezado largo cabía por los
    // pelos hoy y pisaba a la columna vecina en cuanto alguien le añadiera una
    // palabra — el tipo de rotura que sólo se ve imprimiendo.
    const rot = doc.splitTextToSize(pdfStr(col.header), colW - 4) as string[];
    doc.text(rot, x, ry);
    ry += rot.length * 4.2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setGray(doc, 60);
    for (const linea of col.lines) {
      // Cada valor envuelve DENTRO de su columna: "Pórticos de hormigón con
      // pantallas" no cabe en 42 mm de una línea, y sin trocearlo pisaría a la
      // columna vecina.
      const partes = doc.splitTextToSize(pdfStr(linea), colW - 4) as string[];
      doc.text(partes, x, ry);
      ry += partes.length * 4.2;
    }
    bottom = Math.max(bottom, ry);
  });
  return bottom + 2;
}

/** Fila `Parámetro | Valor | Origen`, la forma de todas las tablas de datos. */
interface FilaParam {
  p: string;
  v: string;
  o: string;
}

const COLS_PARAM: TableCol<FilaParam>[] = [
  { key: 'p', label: 'Parametro', w: 34, render: (r) => r.p },
  { key: 'v', label: 'Valor', w: 30, align: 'right', render: (r) => r.v },
  { key: 'o', label: 'Origen', w: 106, wrap: true, render: (r) => r.o },
];

// ── Bloques del documento ────────────────────────────────────────────────────

/**
 * Titular del veredicto, uno por motivo.
 *
 * NO se deduce de `puedeCalcular`. Un edificio de adobe cumple los seis
 * requisitos del art. 3.5.1 y no se calcula igualmente, porque el art. 1.2.3
 * prohíbe el material: anunciar ahí «el método simplificado NO es aplicable»
 * es falso, y encima el documento imprime a continuación esos seis requisitos
 * en CUMPLE. El motivo lo declara la puerta y aquí sólo se rotula.
 */
const TITULAR: Record<MotivoImpedimento, string> = {
  'norma-no-obligatoria': 'La NCSE-02 NO es de aplicación obligatoria a esta construcción.',
  'obligatoriedad-indeterminada':
    'No se puede determinar todavía si la NCSE-02 es de aplicación a esta construcción.',
  'prohibicion-art-1.2.3':
    'La NCSE-02 es de aplicación y PROHÍBE esta construcción tal como está definida.',
  'metodo-simplificado-no-aplicable':
    'La NCSE-02 es de aplicación, pero el método simplificado del art. 3.5.1 NO es aplicable.',
  'faltan-datos-de-calculo':
    'La NCSE-02 es de aplicación y el método simplificado del art. 3.5.1 es aplicable, ' +
    'pero faltan datos para calcular la acción sísmica.',
};

function veredicto(doc: jsPDF, y: number, ev: SeismicEvaluation): number {
  const { obligatoriedad: obl, metodoSimplificado: met } = ev.aplicabilidad;
  const imp = ev.impedimento;

  let ny = seccion(doc, y, 'VEREDICTO', 'art. 1.2.3 · 3.5.1');

  const titular = imp
    ? TITULAR[imp.motivo]
    : 'La NCSE-02 es de aplicación y el método simplificado del art. 3.5.1 es aplicable.';

  ny = parrafo(doc, ny, titular, { size: 11, bold: true, gray: 20 });

  if (imp?.motivo === 'norma-no-obligatoria') {
    ny = parrafo(
      doc,
      ny + 1,
      `Motivo: ${MOTIVO_EXENCION[obl.motivo ?? ''] ?? 'exenta por el art. 1.2.3'}. ` +
        'Que no sea obligatoria no impide calcular la acción sísmica si el proyectista ' +
        'quiere hacerlo; lo que no hay es obligación de justificarla.',
      { size: 8, gray: 80 },
    );
  } else if (imp?.motivo === 'prohibicion-art-1.2.3') {
    // La causa, literal, y la advertencia de que los requisitos que vienen
    // después NO levantan la prohibición: sin esto, la tabla de seises en
    // CUMPLE que sigue se lee como una autorización.
    ny = parrafo(doc, ny + 1, imp.texto, { size: 8, gray: 80 });
    ny = parrafo(
      doc,
      ny,
      'La comprobación del art. 3.5.1 que sigue se recoge a título informativo: ' +
        'cumplirla NO levanta la prohibición del art. 1.2.3. Este documento NO ' +
        'contiene la acción sísmica.',
      { size: 8, gray: 80, italic: true },
    );
  } else if (imp) {
    ny = parrafo(doc, ny + 1, imp.texto, { size: 8, gray: 80 });
    ny = parrafo(
      doc,
      ny,
      imp.motivo === 'faltan-datos-de-calculo'
        ? 'Este documento recoge la comprobación de las dos puertas y los datos del ' +
            'emplazamiento. NO contiene la acción sísmica: falta el dato que se indica ' +
            'arriba.'
        : 'Este documento recoge la comprobación de las dos puertas y los datos del ' +
            'emplazamiento. NO contiene la acción sísmica: el edificio requiere un ' +
            'análisis modal completo, que esta herramienta no realiza.',
      { size: 8, gray: 80, italic: true },
    );
  } else if (met?.via === 'pasarela-4-plantas') {
    ny = parrafo(
      doc,
      ny + 1,
      'Entra por la vía de los edificios de pisos de importancia normal de hasta ' +
        'cuatro plantas EN TOTAL —sótanos incluidos—, sin cumplir todos los ' +
        'requisitos del art. 3.5.1.',
      { size: 8, gray: 80 },
    );
  }

  return ny + 1;
}

function emplazamiento(doc: jsPDF, y: number, state: SeismicState, ev: SeismicEvaluation): number {
  const e = ev.emplazamiento;
  const manual = !state.municipioIne;

  let ny = seccion(doc, y, 'EMPLAZAMIENTO Y ACELERACION DE CALCULO', 'cap. 2');

  ny = banda(doc, ny, [
    {
      header: 'MUNICIPIO',
      lines: manual
        ? ['Entrada manual', 'sin municipio del Anejo 1']
        : [state.municipioNombre, `INE ${state.municipioIne}`],
    },
    { header: 'IMPORTANCIA', lines: [IMPORTANCIA_LABEL[state.importancia], 'art. 1.2.2'] },
    {
      header: 'TERRENO',
      lines:
        state.terrenoModo === 'perfil'
          ? [`Perfil de ${state.estratos.length} estratos`, 'ponderado en 30 m']
          : [TERRENO_LABEL[state.terreno], 'art. 2.4'],
    },
    {
      header: 'SISTEMA',
      lines: [
        SISTEMA_LABEL[state.sistema],
        `n = ${plantasSobreRasante(state)} · H = ${num(state.H, 2)} m`,
      ],
    },
  ]);

  // Cuatro procedencias posibles, y el documento tiene que decir cuál es. La
  // que más importa es `segregado`: el municipio se creó después de 2002, el
  // Anejo 1 no lo nombra, y su peligrosidad es la del término del que salió.
  // Imprimir eso como "Anejo 1 de la NCSE-02" sería atribuirle a la Norma algo
  // que no dice.
  const proc = state.municipioProcedencia;
  const origenAb = manual
    ? 'Introducida a mano por el proyectista'
    : proc?.tipo === 'segregado'
      ? `Heredada de ${proc.padre.nombre} (INE ${proc.padre.ine}): ${state.municipioNombre} se ` +
        `constituyó en ${proc.anio} y el Anejo 1, de 2002, no lo nombra. La NCSE-02 clasificó ` +
        'ese mismo territorio dentro del término de origen.'
      : proc?.tipo === 'anejo1-texto'
        ? `Anejo 1 de la NCSE-02, leída del texto del BOE núm. 244 de 11/10/2002 (${proc.boe}). ` +
          `La capa ${manifiesto.layer} del ${manifiesto.attribution} no publica su aceleración.`
        : proc?.tipo === 'correccion'
          ? `Anejo 1 de la NCSE-02, texto del BOE núm. 244 de 11/10/2002. ${proc.motivo}`
          : `Anejo 1 de la NCSE-02 · ${manifiesto.attribution}, capa ${manifiesto.layer}`;

  const filas: FilaParam[] = [
    { p: 'ab', v: `${num(e.ab, 2)} g`, o: `Aceleración sísmica básica. ${origenAb}` },
    { p: 'K', v: num(e.K, 1), o: `Coeficiente de contribución. ${origenAb}` },
    {
      p: 'ρ',
      v: num(e.rho, 1),
      o: `Coeficiente de riesgo (art. 1.2.2) · importancia ${IMPORTANCIA_LABEL[state.importancia].toLowerCase()}`,
    },
    {
      p: 'C',
      v: num(e.C, 2),
      o:
        state.terrenoModo === 'perfil'
          ? 'Coeficiente del terreno (art. 2.4) · media ponderada en los 30 m superiores'
          : `Coeficiente del terreno (art. 2.4) · tipo ${state.terreno}`,
    },
    { p: 'S', v: num(e.S, 4), o: 'Coeficiente de amplificación del terreno (art. 2.2)' },
    { p: 'ac', v: `${num(e.ac, 4)} g`, o: 'Aceleración sísmica de cálculo (art. 2.2) · ac = S · ρ · ab' },
    { p: 'T_A', v: `${num(e.TA, 3)} s`, o: 'Período de esquina del espectro elástico (art. 2.3) · T_A = K·C/10' },
    { p: 'T_B', v: `${num(e.TB, 3)} s`, o: 'Decide la rama de alpha en el art. 3.7.3 · T_B = K·C/2,5' },
  ];

  ny = drawTable(doc, { x: M, y: ny, M, cols: COLS_PARAM, rows: filas });

  if (state.terrenoModo === 'perfil') {
    ny += 3;
    ny = drawTable(doc, {
      x: M,
      y: ny,
      M,
      cols: [
        { key: 'i', label: '#', w: 14, align: 'right', render: (r: { i: number; C: number; esp: number }) => String(r.i) },
        { key: 'C', label: 'C', w: 28, align: 'right', render: (r) => num(r.C, 2) },
        { key: 'esp', label: 'Espesor (m)', w: 32, align: 'right', render: (r) => num(r.esp, 2) },
        {
          key: 'nota',
          label: 'Nota',
          w: 96,
          wrap: true,
          render: () =>
            'Si el perfil no alcanza los 30 m, el último estrato se prolonga (lado seguro).',
        },
      ] as TableCol<{ i: number; C: number; esp: number }>[],
      rows: state.estratos.map((s, i) => ({ i: i + 1, C: s.C, esp: s.espesor })),
    });
  }

  if (!manual) {
    // Procedencia del dato normativo. Sin esto la memoria afirma un valor sin
    // poder decir de dónde salió, que es justo lo que un visado pregunta.
    ny = parrafo(
      doc,
      ny + 1,
      `Tabla de peligrosidad: ${manifiesto.anejo1RecordCount} municipios del Anejo 1, ` +
        `obtenidos de la capa ${manifiesto.layer} del servicio WMS INSPIRE de ` +
        `${manifiesto.attribution}. Licencia ${manifiesto.license}. ` +
        `sha256 ${manifiesto.sha256.slice(0, 16)}…`,
      { size: 6.5, gray: 140 },
    );
  }

  return ny;
}

function requisitos(doc: jsPDF, y: number, reqs: Requisito[], via: string | null): number {
  let ny = seccion(doc, y, 'REQUISITOS DEL METODO SIMPLIFICADO', 'art. 3.5.1');

  ny = parrafo(
    doc,
    ny,
    'La columna «Vía» distingue lo que comprueba la herramienta con los datos ' +
      'introducidos de lo que DECLARA el proyectista. Una declaración no es una ' +
      'comprobación: este documento la recoge como tal y no la respalda.' +
      (via === 'pasarela-4-plantas'
        ? ' El edificio entra por la vía de las cuatro plantas en total, que levanta los requisitos (3) a (6).'
        : ''),
    { size: 7, gray: 120 },
  );

  const cols: TableCol<Requisito>[] = [
    { key: 'id', label: '#', w: 8, align: 'right', render: (r) => String(r.id) },
    { key: 'texto', label: 'Requisito', w: 84, wrap: true, render: (r) => r.texto },
    {
      key: 'tipo',
      label: 'Via',
      w: 22,
      render: (r) => (r.tipo === 'declarado' ? 'declarado' : 'comprobado'),
    },
    { key: 'detalle', label: 'Detalle', w: 34, wrap: true, render: (r) => r.detalle ?? '' },
    {
      key: 'cumple',
      label: 'Estado',
      w: 22,
      align: 'right',
      bold: () => true,
      color: (r) => (r.cumple === true ? 60 : 30),
      render: (r) => ESTADO_REQUISITO[String(r.cumple)],
    },
  ];

  return drawTable(doc, { x: M, y: ny, M, cols, rows: reqs });
}

function masaSismica(doc: jsPDF, y: number, state: SeismicState, ev: SeismicEvaluation): number {
  const r = ev.resultado;
  if (!r) return y;

  let ny = seccion(doc, y, 'MASA SISMICA POR PLANTA', 'art. 3.2');

  interface FilaPlanta {
    k: number;
    nombre: string;
    h: number;
    P: number;
    origen: string;
  }

  // Por ID, no por posición: `calcularSismo` ordena las plantas por altura, así
  // que `state.plantas[i]` deja de ser la planta i del resultado en cuanto las
  // alturas no van en orden creciente. Emparejando por índice, la tabla
  // imprimía el nombre y el origen del peso de una planta junto a la altura y
  // el P_k de otra.
  const porId = new Map(state.plantas.map((p) => [p.id, p]));
  const filas: FilaPlanta[] = r.plantas.map((p, i) => {
    const ui = p.id === undefined ? undefined : porId.get(p.id);
    return {
      k: i + 1,
      nombre: ui?.nombre ?? `Planta ${i + 1}`,
      h: p.h,
      P: p.P,
      origen: ui?.pesoManual
        ? 'Peso introducido a mano'
        : `${num(ui?.area ?? 0, 0)} m² · ${(ui?.componentes ?? []).filter((c) => !c.excluida).length} componentes`,
    };
  });

  ny = drawTable(doc, {
    x: M,
    y: ny,
    M,
    cols: [
      { key: 'k', label: 'k', w: 10, align: 'right', render: (f: FilaPlanta) => String(f.k) },
      { key: 'nombre', label: 'Planta', w: 42, wrap: true, render: (f) => f.nombre },
      { key: 'h', label: 'h (m)', w: 24, align: 'right', render: (f) => num(f.h, 2) },
      { key: 'P', label: 'P_k (kN)', w: 30, align: 'right', render: (f) => num(f.P, 0) },
      { key: 'origen', label: 'Origen del peso', w: 64, wrap: true, render: (f) => f.origen },
    ] as TableCol<FilaPlanta>[],
    rows: filas,
  });

  ny = parrafo(
    doc,
    ny + 1,
    `Peso sísmico total: Σ P_k = ${num(r.pesoSismico, 0)} kN.  ` +
      `ν = ${num(r.nu, 3)} (art. 2.5, Ω = ${num(state.omega, 1)} %)  ·  ` +
      `μ = ${num(state.mu, 1)} (art. 3.7.3.1)  ·  β = ν/μ = ${num(r.beta, 3)}`,
    { size: 8, gray: 40, bold: true },
  );

  // ── Fracciones aplicadas y, sobre todo, lo EXCLUIDO ────────────────────────
  interface FilaComp {
    planta: string;
    cat: CategoriaMasa;
    q: number;
    excluida: boolean;
  }
  const comps: FilaComp[] = [];
  for (const p of state.plantas) {
    if (p.pesoManual) continue;
    for (const c of p.componentes ?? []) {
      comps.push({ planta: p.nombre, cat: c.categoria, q: c.q, excluida: c.excluida === true });
    }
  }
  const excluidas = comps.filter((c) => c.excluida);

  if (comps.length > 0) {
    ny += 2;
    ny = drawTable(doc, {
      x: M,
      y: ny,
      M,
      cols: [
        { key: 'planta', label: 'Planta', w: 40, wrap: true, render: (c: FilaComp) => c.planta },
        { key: 'cat', label: 'Categoria', w: 40, wrap: true, render: (c) => CATEGORIA_LABEL[c.cat] },
        { key: 'q', label: 'q (kN/m²)', w: 26, align: 'right', render: (c) => num(c.q, 2) },
        {
          key: 'fr',
          label: 'Fraccion',
          w: 24,
          align: 'right',
          render: (c) => num(FRACCION_MASA[c.cat], 2),
        },
        {
          key: 'ap',
          label: 'Aportacion',
          w: 40,
          align: 'right',
          bold: (c) => c.excluida,
          color: (c) => (c.excluida ? 30 : 80),
          render: (c) => (c.excluida ? 'EXCLUIDA' : `${num(FRACCION_MASA[c.cat] * c.q, 2)} kN/m²`),
        },
      ] as TableCol<FilaComp>[],
      rows: comps,
    });
  }

  if (excluidas.length > 0) {
    // Invariante 2 del encabezado: excluir una sobrecarga es una DECISIÓN, y
    // una decisión que no se lee en el papel no la puede revisar nadie.
    ny = parrafo(
      doc,
      ny + 1,
      `DECLARACION DEL PROYECTISTA — ${excluidas.length} ` +
        `${excluidas.length === 1 ? 'sobrecarga excluida' : 'sobrecargas excluidas'} ` +
        'de la masa sísmica. El art. 3.2 las computa «siempre que tengan un efecto ' +
        'desfavorable»; dejarlas fuera es un juicio del proyectista, no una ' +
        'comprobación de esta herramienta.',
      { size: 7.5, gray: 40 },
    );
  }

  ny = parrafo(
    doc,
    ny,
    'La fracción del art. 3.2 decide qué parte de la carga es MASA que se sacude. ' +
      'No es el ψ2 del CTE, que gobierna la gravedad concomitante del art. 3.4: allí ' +
      'la variable desfavorable entra entera.',
    { size: 6.5, gray: 140 },
  );

  return ny;
}

/**
 * La figura se incrusta con `await`: `embedSvgAsImage` rasteriza en un canvas y
 * `addImage` cae en la página ACTIVA en el momento en que resuelve. Sin esperar,
 * una tabla posterior habría llamado ya a `addPage` y la gráfica aparecería en
 * la página equivocada — o en ninguna, si el documento ya se serializó.
 */
async function espectro(doc: jsPDF, y: number): Promise<number> {
  const svg = document
    .getElementById('seismic-espectro-svg-pdf')
    ?.querySelector('svg') as SVGSVGElement | null;
  if (!svg) return y;

  const FIG_W = 112;
  const FIG_H = 69;
  const ny = ensureSpace(doc, y, FIG_H + 4, M);
  await embedSvgAsImage(doc, svg, { x: M, y: ny, width: FIG_W, height: FIG_H });

  // La nota va a la derecha de la figura, no debajo: es lo que hay que leer
  // MIENTRAS se mira la gráfica, y es el único error de este módulo que no se
  // delata con un número raro.
  const notaX = M + FIG_W + 6;
  const notaW = ANCHO - FIG_W - 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setGray(doc, 110);
  const nota = doc.splitTextToSize(
    pdfStr(
      'Dos curvas, y no son la misma. La discontinua es el espectro ELASTICO del ' +
        'art. 2.3 (alpha = 1 + 1,5·T/T_A por debajo de T_A). La continua es la alpha ' +
        'de las FUERZAS del art. 3.7.3, plana en 2,5 hasta T_B. Sólo difieren por ' +
        'debajo de T_A, y ahí la diferencia llega al 24 % del lado de la inseguridad ' +
        'si se usa la elástica para calcular fuerzas.',
    ),
    notaW,
  ) as string[];
  doc.text(nota, notaX, ny + 4);

  const alturaNota = 4 + nota.length * 7 * 1.15 * PT2MM;
  return Math.max(ny + FIG_H, ny + alturaNota) + 4;
}

async function direccion(
  doc: jsPDF,
  y: number,
  eje: 'x' | 'y',
  d: DireccionResult,
  ui: DireccionUI,
  state: SeismicState,
  pesoSismico: number,
  /** Plantas YA ORDENADAS por altura, en el mismo orden que `d.Vk` y `d.Fk`. */
  plantas: PlantaResuelta[],
): Promise<number> {
  const E = eje.toUpperCase();
  let ny = seccion(doc, y, `DIRECCION ${E}`, 'art. 3.7.2 · 3.7.3 · 3.7.4 · 3.7.5');

  const expr = EXPRESION_TF[state.sistema];
  ny = banda(doc, ny, [
    {
      header: 'PERIODO FUNDAMENTAL',
      lines: [
        `T_F = ${num(d.TF, 3)} s`,
        d.TFManual ? 'impuesto (art. 3.6.2.3.2)' : (expr ?? 'art. 3.7.2.2'),
      ],
    },
    { header: 'MODOS', lines: [String(d.nModos), 'art. 3.7.2.1'] },
    {
      header: 'CORTANTE BASAL',
      lines: [
        `${num(d.cortanteBasal, 0)} kN`,
        // Frente al peso sísmico: es el número con el que un proyectista
        // reconoce de un vistazo si el orden de magnitud es el suyo.
        `${pct(d.cortanteBasal / Math.max(1e-9, pesoSismico))} de Sum P_k`,
      ],
    },
    {
      header: 'GEOMETRIA · MASA MOVILIZADA',
      lines: [
        `L = ${num(ui.L, 2)} m · B = ${num(ui.B, 2)} m`,
        `L_e = ${num(d.Le, 2)} m · ${pct(d.participacionTotal)}`,
      ],
    },
  ]);

  // ── Alzado + tabla de modos, lado a lado ───────────────────────────────────
  const svg = document
    .getElementById(`seismic-alzado-${eje}-svg-pdf`)
    ?.querySelector('svg') as SVGSVGElement | null;

  const FIG_W = 78;
  const FIG_H = 70;
  if (svg) {
    ny = ensureSpace(doc, ny, FIG_H + 4, M);
    await embedSvgAsImage(doc, svg, { x: M, y: ny, width: FIG_W, height: FIG_H });
  }

  const xModos = svg ? M + FIG_W + 6 : M;
  const wModos = svg ? ANCHO - FIG_W - 6 : ANCHO;
  const yModos = drawTable(doc, {
    x: xModos,
    y: ny,
    M,
    cols: [
      { key: 'i', label: 'Modo', w: wModos * 0.16, align: 'right', render: (m: { i: number; T: number; alpha: number; part: number }) => String(m.i) },
      { key: 'T', label: 'T_i (s)', w: wModos * 0.26, align: 'right', render: (m) => num(m.T, 3) },
      { key: 'a', label: 'alpha_i', w: wModos * 0.24, align: 'right', render: (m) => num(m.alpha, 3) },
      { key: 'p', label: 'Particip.', w: wModos * 0.34, align: 'right', render: (m) => pct(m.part) },
    ] as TableCol<{ i: number; T: number; alpha: number; part: number }>[],
    rows: d.modos.map((m) => ({ i: m.i, T: m.T, alpha: m.alpha, part: m.participacion })),
  });

  ny = Math.max(svg ? ny + FIG_H : ny, yModos) + 3;

  // ── Fuerzas y cortantes por planta ─────────────────────────────────────────
  interface FilaFV {
    k: number;
    h: number;
    F: number;
    V: number;
  }
  // De cubierta a planta baja, que es como se lee un alzado.
  //
  // La altura sale de `plantas`, que viene ORDENADA por el motor igual que
  // `Vk` y `Fk`. Tomarla de `state.plantas[k]` —sin ordenar— emparejaba cada
  // cortante con la altura de otra planta en cuanto las filas de la tabla no
  // iban ya en orden creciente.
  const filasFV: FilaFV[] = d.Vk
    .map((_, i) => d.Vk.length - 1 - i)
    .map((k) => ({ k: k + 1, h: plantas[k]?.h ?? 0, F: d.Fk[k], V: d.Vk[k] }));

  ny = drawTable(doc, {
    x: M,
    y: ny,
    M,
    cols: [
      { key: 'k', label: 'k', w: 14, align: 'right', render: (f: FilaFV) => String(f.k) },
      { key: 'h', label: 'h_k (m)', w: 26, align: 'right', render: (f) => num(f.h, 2) },
      {
        key: 'F',
        label: 'F_k (kN)',
        w: 32,
        align: 'right',
        // Una F_k negativa NO es un error: el SRSS destruye el signo y el perfil
        // combinado no tiene por qué ser monótono. Se marca en negrita para que
        // se vea; recortarla a cero ocultaría un caso legítimo.
        bold: (f) => f.F < 0,
        color: (f) => (f.F < 0 ? 20 : 80),
        render: (f) => num(f.F, 0),
      },
      { key: 'V', label: 'V_k (kN)', w: 32, align: 'right', render: (f) => num(f.V, 0) },
      {
        key: 'r',
        label: 'V_k / Sum P_k',
        w: 66,
        align: 'right',
        render: (f) => pct(f.V / Math.max(1e-9, pesoSismico)),
      },
    ] as TableCol<FilaFV>[],
    rows: filasFV,
  });

  if (d.Fk.some((f) => f < 0)) {
    ny = parrafo(
      doc,
      ny + 1,
      'Alguna F_k sale negativa. No es un error: el cortante de planta se combina ' +
        'por SRSS (art. 3.6.2.4), que destruye el signo, y la diferencia V_k − V_k+1 ' +
        'no tiene por qué ser monótona.',
      { size: 7, gray: 110 },
    );
  }

  ny = repartoDireccion(doc, ny + 1, d, E);
  ny = avisos(doc, ny, d.avisos, `Avisos de la dirección ${E}`);
  return ny;
}

/**
 * Reparto por plano resistente — el resultado con el que termina el módulo.
 *
 * Dos tablas y no una: `gamma_a` sólo depende de `x` y de `L_e`, así que
 * repetirlo en cada planta sería ruido. Los coeficientes van una vez, y la
 * matriz de fuerzas después. Con más de ocho planos la matriz no cabe a lo
 * ancho y se cae a la forma larga, que siempre entra.
 */
function repartoDireccion(doc: jsPDF, y: number, d: DireccionResult, E: string): number {
  const primera = d.reparto[0];
  if (!primera || primera.elementos.length === 0) return y;

  const els = primera.elementos;
  const sumaK = els.reduce((a, e) => a + e.k, 0);

  let ny = seccion(doc, y, `PLANOS RESISTENTES · DIRECCION ${E}`, 'art. 3.7.4 · 3.7.5');

  ny = drawTable(doc, {
    x: M,
    y: ny,
    M,
    cols: [
      { key: 'j', label: 'j', w: 16, align: 'right', render: (r: { j: number; x: number; k: number; g: number }) => String(r.j) },
      { key: 'x', label: 'x (m)', w: 32, align: 'right', render: (r) => num(r.x, 2) },
      { key: 'k', label: 'k_j', w: 32, align: 'right', render: (r) => num(r.k, 3) },
      { key: 'r', label: 'k_j / Sum k', w: 36, align: 'right', render: (r) => pct(r.k / Math.max(1e-9, sumaK)) },
      { key: 'g', label: 'gamma_a', w: 34, align: 'right', render: (r) => num(r.g, 3) },
    ] as TableCol<{ j: number; x: number; k: number; g: number }>[],
    rows: els.map((e, j) => ({ j: j + 1, x: e.x, k: e.k, g: e.gamma })),
  });

  ny = parrafo(
    doc,
    ny + 1,
    'gamma_a = 1 + 0,6·|x|/L_e (art. 3.7.5). Amplifica, no redistribuye: la suma de ' +
      'las f_kj SUPERA F_k, y así es como está escrito el artículo.',
    { size: 6.5, gray: 140 },
  );

  // Matriz f_kj: filas = plantas de cubierta a baja, columnas = planos.
  if (els.length <= 8) {
    const colW = (ANCHO - 16) / els.length;
    const cols: TableCol<{ k: number; f: number[] }>[] = [
      { key: 'k', label: 'k', w: 16, align: 'right', render: (r) => String(r.k) },
      ...els.map((_, j) => ({
        key: `f${j}`,
        label: String(j + 1),
        w: colW,
        align: 'right' as const,
        render: (r: { k: number; f: number[] }) => num(r.f[j], 0),
      })),
    ];
    ny = drawTable(doc, {
      x: M,
      y: ny + 1,
      M,
      cols,
      rows: d.reparto
        .map((_, i) => d.reparto.length - 1 - i)
        .map((i) => ({ k: d.reparto[i].k, f: d.reparto[i].elementos.map((e) => e.f) })),
    });
    ny = parrafo(doc, ny, 'f_kj en kN, torsión incluida. Las columnas son los planos j de la tabla anterior.', {
      size: 6.5,
      gray: 140,
    });
  } else {
    // Más de ocho planos: la matriz no cabe a lo ancho y se lista fila a fila.
    interface FilaLarga {
      k: number;
      j: number;
      fBase: number;
      g: number;
      f: number;
    }
    const filas: FilaLarga[] = [];
    for (let i = d.reparto.length - 1; i >= 0; i--) {
      const p = d.reparto[i];
      p.elementos.forEach((e, j) =>
        filas.push({ k: p.k, j: j + 1, fBase: e.fBase, g: e.gamma, f: e.f }),
      );
    }
    ny = drawTable(doc, {
      x: M,
      y: ny + 1,
      M,
      cols: [
        { key: 'k', label: 'k', w: 20, align: 'right', render: (r: FilaLarga) => String(r.k) },
        { key: 'j', label: 'j', w: 20, align: 'right', render: (r) => String(r.j) },
        { key: 'fb', label: 'f base (kN)', w: 42, align: 'right', render: (r) => num(r.fBase, 0) },
        { key: 'g', label: 'gamma_a', w: 40, align: 'right', render: (r) => num(r.g, 3) },
        { key: 'f', label: 'f_kj (kN)', w: 48, align: 'right', render: (r) => num(r.f, 0) },
      ] as TableCol<FilaLarga>[],
      rows: filas,
    });
  }

  return ny;
}

function direccionales(doc: jsPDF, y: number, casos: CasoDireccional[]): number {
  let ny = seccion(doc, y, 'COMBINACION DIRECCIONAL', 'art. 3.4');

  ny = parrafo(
    doc,
    ny,
    'Ocho casos con signo, no cuatro. El 30 % transversal se recorre en los dos ' +
      'sentidos porque el sismo se combina con la gravedad: +0,3 y −0,3 no producen ' +
      'el mismo efecto. Una envolvente sin signo evalúa cada pilar con el signo ' +
      'equivocado frente a la gravedad, y no lo delata ningún número.',
    { size: 7, gray: 120 },
  );

  return drawTable(doc, {
    x: M,
    y: ny,
    M,
    cols: [
      { key: 'id', label: 'Caso', w: 34, render: (c: CasoDireccional) => c.id },
      { key: 'fx', label: 'f_x', w: 24, align: 'right', render: (c) => num(c.fx, 2) },
      { key: 'fy', label: 'f_y', w: 24, align: 'right', render: (c) => num(c.fy, 2) },
      { key: 'Vx', label: 'V_x basal (kN)', w: 44, align: 'right', render: (c) => num(c.Vx, 0) },
      { key: 'Vy', label: 'V_y basal (kN)', w: 44, align: 'right', render: (c) => num(c.Vy, 0) },
    ] as TableCol<CasoDireccional>[],
    rows: casos,
  });
}

function avisos(doc: jsPDF, y: number, lista: AvisoNorma[], titulo: string): number {
  if (lista.length === 0) return y;
  const ny = seccion(doc, y, titulo.toUpperCase());
  return drawTable(doc, {
    x: M,
    y: ny,
    M,
    cols: [
      { key: 'articulo', label: 'Articulo', w: 24, render: (a: AvisoNorma) => `art. ${a.articulo}` },
      {
        key: 'severidad',
        label: 'Tipo',
        w: 22,
        bold: (a) => a.severidad === 'bloqueo',
        color: (a) => (a.severidad === 'bloqueo' ? 30 : 90),
        render: (a) => SEVERIDAD_LABEL[a.severidad],
      },
      { key: 'texto', label: 'Aviso', w: 124, wrap: true, render: (a) => a.texto },
    ] as TableCol<AvisoNorma>[],
    rows: lista,
  });
}

function alcance(doc: jsPDF, y: number, hayResultado: boolean): number {
  let ny = seccion(doc, y, 'ALCANCE DE ESTE DOCUMENTO');
  ny = parrafo(
    doc,
    ny,
    hayResultado
      ? 'Entra emplazamiento, cargas, estructura y planos resistentes. Sale F_k, V_k, ' +
          'el cortante basal, f_kj con torsión y las ocho combinaciones direccionales. ' +
          'El módulo TERMINA en la fuerza que le toca a cada plano resistente.'
      : 'Este documento recoge la comprobación de las dos puertas normativas y los ' +
          'datos del emplazamiento. No contiene acción sísmica calculada.',
    { size: 8, gray: 60 },
  );
  ny = parrafo(
    doc,
    ny,
    'Lo que NO hace: esfuerzos N/V/M por pilar, comprobación de secciones, ' +
      'ductilidad y detalles del cap. 4, desplazamientos ni efectos de segundo ' +
      'orden del art. 3.8. Eso es otro cálculo. Predimensionamiento: no sustituye ' +
      'al proyecto ni al criterio del técnico que lo firma.',
    { size: 7, gray: 120, italic: true },
  );
  return ny;
}

// ── Exportador ───────────────────────────────────────────────────────────────

export interface SeismicPdfArgs {
  state: SeismicState;
  evaluacion: SeismicEvaluation;
  /** Nombre del elemento, del `TitlePromptModal`. Fuera del hash de procedencia. */
  title?: string;
}

export async function exportSeismicNCSE02PDF({
  state,
  evaluacion,
  title,
}: SeismicPdfArgs): Promise<PdfResult> {
  const elementTitle = title ?? '';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const { aplicabilidad: ap, resultado: r } = evaluacion;

  const { contentY } = drawHeader(
    doc,
    {
      title: 'Concreta - Accion sismica - NCSE-02 (RD 997/2002)',
      elementTitle,
      engineVersion: NCSE02_ENGINE_VERSION,
      // El título es metadato del documento y NO entra en el hash: teclearlo no
      // puede cambiar la huella del caso de cálculo.
      inputsHash: inputsFingerprint(state),
    },
    M,
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setGray(doc, 110);
  const traz = doc.splitTextToSize(
    pdfStr(
      'NCSE-02, Norma de Construcción Sismorresistente: Parte general y edificación ' +
        '(RD 997/2002)  ·  Método simplificado de cálculo, art. 3.5  ·  ' +
        `Motor NCSE-02 v${NCSE02_ENGINE_VERSION}  ·  Datos en kN y m`,
    ),
    ANCHO,
  ) as string[];
  doc.text(traz, M, contentY);

  let y = contentY + traz.length * 7.5 * 1.15 * PT2MM + 3;

  // 1 · El veredicto, antes que ningún número. Un cortante basal calculado
  //     sobre un edificio que no cumple el art. 3.5.1 no significa nada, y
  //     enseñarlo primero invita a copiarlo igual.
  y = veredicto(doc, y, evaluacion);

  // 2 · Emplazamiento — el único bloque que existe en los cuatro estados.
  y = emplazamiento(doc, y, state, evaluacion);

  // 3 · Requisitos del art. 3.5.1, cuando la Norma rige.
  if (ap.metodoSimplificado) {
    y = requisitos(doc, y, ap.metodoSimplificado.requisitos, ap.metodoSimplificado.via);
  }

  // 4 · Avisos de las puertas. Van aquí y no al final: un bloqueo del art. 1.2.3
  //     —fábrica por encima de sus alturas, material prohibido— condiciona todo
  //     lo que viene después.
  y = avisos(doc, y, ap.avisos, 'Avisos de aplicabilidad');

  if (r) {
    y = masaSismica(doc, y, state, evaluacion);
    y = await espectro(doc, y);
    y = await direccion(doc, y, 'x', r.x, state.x, state, r.pesoSismico, r.plantas);
    y = await direccion(doc, y, 'y', r.y, state.y, state, r.pesoSismico, r.plantas);
    y = direccionales(doc, y, r.direccionales);
    y = avisos(doc, y, r.avisos, 'Avisos del calculo');
  }

  alcance(doc, y, !!r);

  drawFootersAllPages(
    doc,
    { engineVersion: NCSE02_ENGINE_VERSION, proyecto: state.municipioNombre || undefined },
    M,
  );

  const filename = titledFilename(elementTitle, seismicNCSE02FallbackFilename(state));
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, filename, pageCount: doc.getNumberOfPages() };
}
