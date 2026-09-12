/**
 * Lo que el panel de la obra necesita saber de la ficha DB SE, y nada más.
 *
 * Vive aparte de `index.tsx` y se carga con `import()` a propósito: ensamblar
 * la ficha arrastra `lib/memoria/plantilla.ts`, que son ochocientas líneas de
 * prosa del CTE, y la ruta de ENTRADA de la app no puede traérselas para
 * pintar diez filas. La cabecera, el anejo y las piezas salen al instante; el
 * bloque de estados rellena un fotograma después.
 */

import { MODULOS } from '../memoria-dbse/sobres';
import { cargarEstado } from '../memoria-dbse/state';
import { leerSobres } from '../memoria-dbse/sobres';
import { evaluar } from '../../lib/memoria/ensamblar';
import { apartados } from '../../lib/memoria/ficha';
import type { ApartadoId } from '../../lib/memoria/model';
import type { ModuloPub } from '../../lib/memoria/estado';

export type EstadoFila = 'hecho' | 'falta' | 'revisar' | 'noProcede';

export interface FilaResumen {
  id: string;
  etiqueta: string;
  estado: EstadoFila;
  /** Una línea en lenguaje de obra: qué pasa y qué hacer. */
  detalle: string | null;
  /** Adónde lleva al pincharla. */
  ruta: string;
}

export interface ResumenObra {
  /** Lo que impide exportar. */
  faltan: number;
  /** Lo que conviene mirar y no impide nada. */
  ambar: number;
  /** Los cuatro módulos que publican. */
  modulos: FilaResumen[];
  /** Los apartados de la ficha que proceden. */
  ficha: FilaResumen[];
  /** Los cinco datos de la obra que falten. */
  datosObra: string[];
}

const RUTA_FICHA = '/memorias/db-se';

/** El apartado de la ficha donde se rellena cada cosa; el índice no se rellena. */
const TITULO_CORTO: Partial<Record<ApartadoId, string>> = {
  se: 'La estructura y las juntas',
  seae: 'Acciones: viento, nieve y cargas',
  sec: 'El terreno y la cimentación',
  ncse: 'La acción sísmica',
  ce: 'Materiales y control',
  forjados: 'Los forjados',
  sea: 'Estructuras de acero',
  sef: 'Fábrica',
  sem: 'Estructuras de madera',
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function resumenDeObra(): ResumenObra {
  const ev = evaluar(cargarEstado(), leerSobres());
  const { datos, huecos } = ev;

  const modulos: FilaResumen[] = (Object.keys(datos.fuentes) as ModuloPub[]).map((m) => {
    const f = datos.fuentes[m];
    return {
      id: `pub.${m}`,
      etiqueta: MODULOS[m].etiqueta,
      estado: f.estado === 'falta' ? 'falta' : f.estado === 'revisar' ? 'revisar' : !f.valor && !f.obligatorio ? 'noProcede' : 'hecho',
      detalle: f.nota ?? null,
      ruta: MODULOS[m].ruta,
    };
  });

  // Los cinco datos de la obra se resuelven en su diálogo, no en la ficha: se
  // sacan aparte para que la fila lleve allí y no a una pantalla que no los pide.
  const idsObra = new Set(['obra.denominacion', 'obra.uso', 'obra.provincia', 'obra.municipio', 'obra.altitud']);
  const datosObra = huecos.filter((h) => idsObra.has(h.id)).map((h) => h.etiqueta);

  const deFicha = huecos.filter((h) => !idsObra.has(h.id) && !h.id.startsWith('pub.'));
  const ficha: FilaResumen[] = apartados(datos)
    .filter((a) => a.id !== 'indice')
    .map((a) => {
      const suyos = deFicha.filter((h) => h.apartado === a.id);
      const faltan = suyos.filter((h) => h.estado === 'falta').length;
      const ambar = suyos.length - faltan;
      return {
        id: a.id,
        etiqueta: TITULO_CORTO[a.id] ?? a.titulo,
        estado: !a.procede ? 'noProcede' : faltan > 0 ? 'falta' : ambar > 0 ? 'revisar' : 'hecho',
        detalle: !a.procede
          ? 'no procede en esta obra'
          : faltan > 0
            ? plural(faltan, 'dato', 'datos')
            : ambar > 0
              ? `${plural(ambar, 'dato', 'datos')} por confirmar`
              : null,
        ruta: RUTA_FICHA,
      };
    });

  return {
    faltan: huecos.filter((h) => h.estado === 'falta').length,
    ambar: huecos.filter((h) => h.estado !== 'falta').length,
    modulos,
    ficha,
    datosObra,
  };
}
