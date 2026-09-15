/**
 * Del estado derivado a los bloques del documento de incendio.
 *
 * `Block[]` es la frontera testeable: un array plano que pintan cinco
 * renderers distintos (React en pantalla, .docx, .pdf, .xlsx y .dxf) sin que
 * ninguno vuelva a decidir qué dice el documento. Ver `lib/memoria/model`.
 */

import type { Block } from '../memoria/model';
import { resumenElementos, type ElementoResuelto } from './elementos';
import { ROTULO_ORIENTATIVO } from './protecciones';
import type { ExigenciaFuego } from './exigencias';
import { notasResistenciaFuego, type MaterialesPresentes } from './notas';
import type { SectorResuelto } from './sectores';

/** Lo que hace falta para justificar la R, además de la lista de exigencias. */
export interface DetalleIncendio {
  /** m. `null` cuando no se ha podido saber. */
  alturaEvacuacion: number | null;
  /** `true` si la puso el proyectista en vez de salir de las plantas. */
  alturaAMano: boolean;
  sectores: readonly SectorResuelto[];
  /** Exigencias tecleadas sueltas, las que no son sector. */
  sueltas: readonly ExigenciaFuego[];
  /** Las secciones comprobadas por los anejos C y D. */
  elementos?: readonly ElementoResuelto[];
}

const m2 = (v: number) => v.toFixed(2).replace('.', ',');
/** Los milímetros se acotan enteros o con un decimal, no con dos. */
const mm = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');

/**
 * La justificación del tiempo equivalente, sector a sector.
 *
 * Un número sin su cuenta no vale en una memoria: quien la revise tiene que
 * poder rehacerla. Va en una tabla propia, detrás de la de exigencias, y sólo
 * si algún sector se ha acogido al Anejo B.
 */
function bloquesAnejoB(sectores: readonly SectorResuelto[]): Block[] {
  const conTed = sectores.filter((s) => s.ted?.ted != null && s.nombre !== '');
  if (conTed.length === 0) return [];

  return [
    { kind: 'heading', level: 3, text: 'Tiempo equivalente de exposición al fuego (Anejo B)' },
    {
      kind: 'table',
      head: ['Sector', 'wf', 'kc', 'qf,d (MJ/m²)', 'te,d (min)', 'Se declara'],
      rows: conTed.map((s) => {
        const t = s.ted!;
        return [
          s.nombre,
          t.ventilacion.wf === null ? '—' : m2(t.ventilacion.wf),
          t.kc === null ? '—' : m2(t.kc),
          m2(t.carga.qfd),
          m2(t.ted as number),
          `R ${t.declarado}`,
        ];
      }),
    },
    {
      kind: 'notes',
      items: [
        'te,d = kb · wf · kc · qf,d (expresión B.2), con qf,d = qf,k · m · δq1 · δq2 · δn · δc (B.7).',
        ...conTed.map((s) => {
          const t = s.ted!;
          const deLaTabla = s.deLaTabla === null ? '' : ` La tabla 3.1 pedía R ${s.deLaTabla}.`;
          return `${s.nombre}: kb = ${m2(t.kb)}; δq1 = ${m2(t.carga.dq1)}; δq2 = ${m2(t.carga.dq2)}; δn = ${m2(t.carga.dn)}; δc = ${m2(t.carga.dc)}.${deLaTabla}`;
        }),
        'Se declara el tiempo equivalente por la vía del DB SI 6 § 3.1.b, que lo admite como alternativa a la clase de la tabla 3.1.',
      ],
    },
  ];
}

/**
 * La comprobación de las secciones, elemento a elemento (anejos C y D).
 *
 * Es la segunda mitad del capítulo y contesta a la pregunta que el SI 6 § 3.1
 * deja abierta: si la estructura aguanta «por su propia configuración» o
 * «mediante la aplicación de productos de protección». Sin elementos
 * comprobados no sale nada y la memoria se queda como estaba, enunciando la R
 * exigida y dejando las dos vías abiertas.
 *
 * La cuenta de la distancia al eje va escrita al pie y no en la tabla: es lo
 * que permite a quien revise rehacerla, y es donde está el error clásico de
 * confundir el recubrimiento con la distancia al eje de la armadura.
 */
export function bloquesElementos(elementos: readonly ElementoResuelto[]): Block[] {
  const conNombre = elementos.filter((e) => e.nombre !== '' && e.via !== 'sinResolver');
  if (conNombre.length === 0) return [];

  const como = (e: ElementoResuelto) =>
    e.via === 'propia'
      ? `Por su propia sección${e.justificacion === '' ? '' : ` (${e.justificacion})`}`
      : `Con protección: ${e.loQueFalta}`;

  const seccion = (e: ElementoResuelto) =>
    e.material === 'acero'
      ? [e.tipo, e.acero?.masividad === null ? null : `Am/V = ${e.acero?.masividad} m⁻¹`]
          .filter(Boolean)
          .join(', ')
      : [e.tipo, e.am === null ? null : `am = ${mm(e.am)} mm`].filter(Boolean).join(', ');

  const notas = conNombre
    .map((e) => ({
      nombre: e.nombre,
      cuenta: [
        e.material === 'acero' ? (e.acero?.cuentaMasividad ?? '') : e.amCuenta,
        e.proteccion?.cuenta ?? '',
      ]
        .filter((t) => t !== '')
        .join('. '),
    }))
    .filter((x) => x.cuenta !== '')
    .map((x) => `${x.nombre}: ${x.cuenta}.`);

  // Toda cifra de protección arrastra su coletilla, y una sola vez: el DB SI no
  // tabula ningún producto, sólo la magnitud que hay que alcanzar.
  const conProteccion = conNombre.some((e) => e.proteccion?.orientativo === true);

  const n = resumenElementos(conNombre);
  const total = conNombre.length;
  const plural = (k: number, uno: string, varios: string) => (k === 1 ? uno : varios);
  // Con todos los elementos por la misma vía la frase no necesita repartir, y
  // repartir sin sujeto —«3 la alcanzan mediante…»— deja la línea coja.
  const resumen =
    n.proteccion === 0
      ? `${plural(total, 'El elemento comprobado alcanza', `Los ${total} elementos comprobados alcanzan`)} la resistencia exigida por su propia configuración.`
      : n.propia === 0
        ? `${plural(total, 'El elemento comprobado alcanza', `Los ${total} elementos comprobados alcanzan`)} la resistencia exigida mediante productos de protección.`
        : `De los ${total} elementos comprobados, ${n.propia} ${plural(n.propia, 'alcanza', 'alcanzan')} la resistencia exigida por su propia configuración y ${n.proteccion} mediante productos de protección.`;

  return [
    { kind: 'heading', level: 3, text: 'Comprobación de las secciones (anejos C y D)' },
    { kind: 'paragraph', text: resumen },
    {
      kind: 'table',
      head: ['Elemento', 'Sector', 'R exigida', 'Sección', 'Cómo alcanza la R'],
      rows: conNombre.map((e) => [
        e.nombre,
        e.sector === '' ? '—' : e.sector,
        e.exigida === null ? '—' : `R ${e.exigida}`,
        seccion(e),
        como(e),
      ]),
    },
    {
      kind: 'notes',
      items: [
        'Distancia mínima equivalente al eje am = Σ[Asi·fyki·(asi + Δasi)] / Σ Asi·fyki (expresión C.1), con asi medida desde el paramento expuesto.',
        ...notas,
        'Las comprobaciones se han hecho por las tablas de los anejos C y D del DB SI, que es la vía del SI 6 § 6.1.a.',
        'Los recubrimientos que exija la durabilidad pueden ser mayores que estos mínimos.',
        ...(conProteccion ? [ROTULO_ORIENTATIVO] : []),
      ],
    },
  ];
}

/**
 * El capítulo de la memoria: qué R se le exige a cada parte de la estructura,
 * de dónde sale y por qué vía se va a alcanzar.
 *
 * Con una sola exigencia de ámbito «toda la estructura» la tabla sobra —la
 * frase ya lo dice entero— y sólo salen las notas. Es el caso de las obras que
 * vienen del cuadro de materiales viejo, y así su documento no cambia.
 */
export function cuadroIncendioMemoria(
  presentes: MaterialesPresentes,
  exigencias: readonly ExigenciaFuego[],
  detalle?: DetalleIncendio,
): Block[] {
  const sectores = detalle?.sectores ?? [];
  const conAlgoQueDecir = sectores.filter((s) => s.nombre !== '' && (s.minutos !== null || s.sinExigencia));

  const elementos = (detalle?.elementos ?? []).filter((e) => e.nombre !== '' && e.via !== 'sinResolver');
  if (exigencias.length === 0 && conAlgoQueDecir.length === 0 && elementos.length === 0) return [];

  const bloques: Block[] = [
    { kind: 'heading', level: 2, text: 'RESISTENCIA AL FUEGO DE LA ESTRUCTURA' },
  ];

  // La altura de evacuación es el dato con el que se entra en la tabla 3.1:
  // sin escribirla, la R queda sin justificar.
  if (detalle && detalle.alturaEvacuacion !== null && conAlgoQueDecir.length > 0) {
    bloques.push({
      kind: 'kvTable',
      rows: [
        [
          'Altura de evacuación del edificio',
          `${m2(detalle.alturaEvacuacion)} m${detalle.alturaAMano ? ' (adoptada)' : ''}`,
        ],
      ],
    });
  }

  // Con sectores, la tabla dice de dónde sale cada R. Sin ellos —una obra que
  // viene del cuadro de materiales— basta con la pareja ámbito/R.
  if (conAlgoQueDecir.length > 0) {
    const filas = conAlgoQueDecir.map((s) => [
      s.nombre,
      s.sinExigencia ? 'No se exige' : `R ${s.minutos}`,
      s.referencia === '' ? '—' : s.referencia.charAt(0).toUpperCase() + s.referencia.slice(1),
    ]);
    for (const e of detalle?.sueltas ?? []) {
      filas.push([e.ambito, `R ${e.minutos}`, 'Indicado en el proyecto']);
    }
    bloques.push({
      kind: 'table',
      head: ['Parte de la estructura', 'Resistencia exigida', 'Procedencia'],
      rows: filas,
    });
  } else if (exigencias.length > 1) {
    bloques.push({
      kind: 'table',
      head: ['Parte de la estructura', 'Resistencia exigida'],
      rows: exigencias.map((e) => [e.ambito, `R ${e.minutos}`]),
    });
  }

  bloques.push({ kind: 'notes', items: notasResistenciaFuego(presentes, exigencias) });

  bloques.push(...bloquesAnejoB(sectores));
  bloques.push(...bloquesElementos(detalle?.elementos ?? []));

  // Lo que la norma dice que no se automatiza, y que en una memoria firmada
  // tiene que estar escrito aunque el módulo no pueda comprobarlo.
  const sinExigencia = conAlgoQueDecir.filter((s) => s.sinExigencia);
  if (sinExigencia.length > 0) {
    bloques.push({
      kind: 'notes',
      items: [
        `No se exige resistencia al fuego a ${sinExigencia
          .map((s) => `${s.nombre.toLowerCase()} (${s.referencia})`)
          .join('; ')}.`,
      ],
    });
  }

  return bloques;
}

// ── El cuadro del plano ─────────────────────────────────────────────────────

export const TITULO_INCENDIO_PLANO = 'RESISTENCIA AL FUEGO (SEGÚN DB SI 6)';
export const TITULO_PROTECCIONES_PLANO = 'PROTECCIONES PREVISTAS';

/**
 * El cuadro compacto que va rotulado en el plano.
 *
 * Tiene el mismo origen que el capítulo de la memoria y dice menos a propósito.
 * La diferencia no es de espacio, es de qué se está firmando en cada papel:
 *
 *  - **El plano no certifica secciones.** La memoria puede decir «el soporte
 *    P1 alcanza R 120 por su propia sección (tabla C.2, opción 250/45)»; el
 *    cuadro del plano NO, porque un cuadro es lo que hay que cumplir en obra,
 *    no la comprobación de que se cumple. De ahí que la columna «cómo alcanza
 *    la R» —la mitad del capítulo— se quede fuera, y que la nota de las dos
 *    vías siga abierta igual que antes de que este módulo existiera.
 *  - **Lo que sí entra son las protecciones**, y no por certificar nada, sino
 *    por lo contrario: un revestimiento es una PARTIDA que alguien tiene que
 *    ejecutar, y si no está en el plano no se ejecuta. Se enuncian como
 *    requisito («se protege con…»), no como resultado («alcanza R…»).
 *
 * Y el número de la protección va siempre con su «(orientativo)» pegado: en un
 * plano, un espesor sin ese rótulo se compra.
 */
export function cuadroIncendioPlano(
  presentes: MaterialesPresentes,
  exigencias: readonly ExigenciaFuego[],
  detalle?: DetalleIncendio,
): Block[] {
  const sectores = (detalle?.sectores ?? []).filter(
    (s) => s.nombre !== '' && (s.minutos !== null || s.sinExigencia),
  );
  if (exigencias.length === 0 && sectores.length === 0) return [];

  const bloques: Block[] = [{ kind: 'heading', level: 2, text: TITULO_INCENDIO_PLANO }];

  // La altura de evacuación es el dato con el que se entra en la tabla 3.1, y
  // en un plano es además la cota que cualquiera puede contrastar con la
  // sección dibujada al lado.
  if (detalle && detalle.alturaEvacuacion !== null && sectores.length > 0) {
    bloques.push({
      kind: 'kvTable',
      rows: [
        [
          'Altura de evacuación',
          `${m2(detalle.alturaEvacuacion)} m${detalle.alturaAMano ? ' (adoptada)' : ''}`,
        ],
      ],
    });
  }

  // Sin sectores —una obra que viene del cuadro de materiales viejo— quedan las
  // exigencias sueltas, que es exactamente lo que ese cuadro imprimía.
  const filas: string[][] =
    sectores.length > 0
      ? [
          ...sectores.map((s) => [s.nombre, s.sinExigencia ? 'No se exige' : `R ${s.minutos}`]),
          ...(detalle?.sueltas ?? []).map((e) => [e.ambito, `R ${e.minutos}`]),
        ]
      : exigencias.map((e) => [e.ambito, `R ${e.minutos}`]);

  bloques.push({ kind: 'table', head: ['Parte de la estructura', 'Exigida'], rows: filas });

  // Sólo los elementos que NO llegan solos: los que llegan por su sección no
  // le piden nada a nadie en obra, y una fila que no pide nada sobra en un
  // cuadro.
  const protegidos = (detalle?.elementos ?? []).filter(
    (e) => e.via === 'proteccion' && e.nombre !== '',
  );
  if (protegidos.length > 0) {
    bloques.push(
      { kind: 'heading', level: 3, text: TITULO_PROTECCIONES_PLANO },
      {
        kind: 'table',
        head: ['Elemento', 'R exigida', 'Protección'],
        rows: protegidos.map((e) => [
          e.nombre,
          e.exigida === null ? '—' : `R ${e.exigida}`,
          e.loQueFalta,
        ]),
      },
    );
  }

  bloques.push({
    kind: 'notes',
    items: [
      ...notasResistenciaFuego(presentes, exigencias),
      ...(protegidos.length > 0 ? [ROTULO_ORIENTATIVO] : []),
    ],
  });

  return bloques;
}
