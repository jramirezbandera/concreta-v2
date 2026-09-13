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
import { evaluar, type Fuente } from '../../lib/memoria/ensamblar';
import { apartados } from '../../lib/memoria/ficha';
import { bloquea, type ApartadoId } from '../../lib/memoria/model';
import type { ModuloPub } from '../../lib/memoria/estado';

export type EstadoFila = 'hecho' | 'falta' | 'revisar' | 'noProcede' | 'sinEmpezar';

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

/**
 * En qué está un módulo, en corto.
 *
 * La `nota` que la ficha imprime nombra su módulo y da la instrucción entera
 * —«Cuadro de materiales sigue con sus valores de partida: ábralo y calcule
 * los de esta obra.»—, que allí es lo suyo: se lee un apartado cada vez. En el
 * panel salían cuatro de esas seguidas, con el nombre del módulo repetido a
 * dos columnas de su propia etiqueta, y parecía un registro de errores. Aquí
 * la fila dice sólo EN QUÉ ESTÁ, y la instrucción se da una vez sobre el
 * bloque.
 *
 * Sale de las banderas del sobre, no de mirar el texto de la nota: `nota` es
 * prosa para una memoria firmada y puede cambiar de redacción cualquier día.
 */
function enQueEsta(f: Fuente): string | null {
  if (!f.valor) return f.obligatorio ? 'sin calcular en esta obra' : 'sin publicar: se toma lo de la provincia';
  if (!f.configurado) return 'con los valores de partida';
  if (f.otroEmplazamiento) return 'calculado en otro emplazamiento';
  return null;
}

export function resumenDeObra(): ResumenObra {
  const ev = evaluar(cargarEstado(), leerSobres());
  const { datos, huecos } = ev;

  const modulos: FilaResumen[] = (Object.keys(datos.fuentes) as ModuloPub[]).map((m) => {
    const f = datos.fuentes[m];
    return {
      id: `pub.${m}`,
      etiqueta: MODULOS[m].etiqueta,
      // Un módulo opcional sin publicar está SIN EMPEZAR, no «no procede»:
      // cuatro filas más abajo «no procede» quiere decir que ese capítulo no
      // va en esta obra (no hay acero, no hay fábrica), y la misma palabra no
      // puede significar dos cosas en la misma pantalla.
      estado: f.estado === 'falta' ? 'falta' : f.estado === 'revisar' ? 'revisar' : !f.valor && !f.obligatorio ? 'sinEmpezar' : 'hecho',
      detalle: enQueEsta(f),
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

  // `faltan` es EL MISMO número que impide exportar en la ficha, con los datos
  // de la obra dentro: `datosObra` sólo los nombra para llevar a su diálogo, no
  // los cuenta aparte. Y se pregunta a `bloquea()`, no a un literal: si un día
  // bloquea otro estado, el panel se entera solo.
  return {
    faltan: huecos.filter((h) => bloquea(h.estado)).length,
    ambar: huecos.filter((h) => !bloquea(h.estado)).length,
    modulos,
    ficha,
    datosObra,
  };
}
