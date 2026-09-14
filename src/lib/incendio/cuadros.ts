/**
 * Del estado derivado a los bloques del documento de incendio.
 *
 * `Block[]` es la frontera testeable: un array plano que pintan cinco
 * renderers distintos (React en pantalla, .docx, .pdf, .xlsx y .dxf) sin que
 * ninguno vuelva a decidir qué dice el documento. Ver `lib/memoria/model`.
 */

import type { Block } from '../memoria/model';
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
}

const m2 = (v: number) => v.toFixed(2).replace('.', ',');

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

  if (exigencias.length === 0 && conAlgoQueDecir.length === 0) return [];

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
