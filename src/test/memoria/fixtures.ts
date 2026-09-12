/**
 * Una obra completa para los tests de la ficha: los cuatro sobres construidos
 * con los `datosPublicacion` REALES de cada módulo (Granada, con acero y
 * madera en el cuadro de materiales), la ficha de esa obra, y cómo dejarla
 * sin huecos resolviendo cada uno con la acción que declara.
 */

import { defaultCargasState, datosPublicacion as pubCargas, evaluar as evaluarCargas } from '../../features/cargas-planta/state';
import { defaultMaterialesState, datosPublicacion as pubMateriales, evaluar as evaluarMateriales, filaMaderaDesdePreset, type FilaFuego } from '../../features/materiales/state';
import { defaultSeismicState, datosPublicacion as pubSismo, evaluarSismo, type SeismicState } from '../../features/seismic-ncse02/state';
import { ejemploVientoNieveState, datosPublicacion as pubViento, evaluar as evaluarViento } from '../../features/viento-nieve/state';
import { evaluar, tipologiasDe, type Sobres } from '../../lib/memoria/ensamblar';
import { aceptar, asegurarForjados, confirmar, estadoPorDefecto, MODULOS_PUB, teclear, type MemoriaState, type ModuloPub } from '../../lib/memoria/estado';
import type { Publicacion } from '../../lib/pub';

export const TS = '2026-09-06T10:00:00.000Z';

/**
 * `configurado: true` a mano, y es importante: estos sobres se construyen con
 * los `datosPublicacion` REALES de cada módulo pero SIN pasar por `publicar()`,
 * que es quien estampa la marca. Y el de viento sale del CASO DE EJEMPLO
 * (`ejemploVientoNieveState`, más abajo), que `publicar()` marcaría como no
 * configurado. Aquí se afirma que el usuario lo hizo suyo, que es lo que
 * supone el documento que estos tests congelan.
 */
export function sobre<T>(modulo: string, datos: T, obra: Partial<Publicacion<T>['obra']> = {}, ts = TS): Publicacion<T> {
  return { v: 1, ts, modulo, obra: { municipio: null, provincia: null, ine: null, ...obra }, configurado: true, datos };
}

export interface OpcionesSobres {
  /** Con acero estructural en el cuadro de materiales. */
  acero?: boolean;
  /** Con madera en el cuadro de materiales. */
  madera?: boolean;
  /** El estado de sismo, si no es el de Granada por defecto. */
  sismo?: SeismicState;
  /** Exigencias de resistencia al fuego del cuadro de materiales. */
  fuego?: FilaFuego[];
}

/** Los cuatro sobres de una obra en Granada. */
export function sobresGranada(o: OpcionesSobres = {}): Sobres {
  const acero = o.acero ?? true;
  const madera = o.madera ?? true;
  const m = {
    ...defaultMaterialesState(),
    usaAceroEstructural: acero,
    usaMadera: madera,
    maderaGrupos: madera ? [filaMaderaDesdePreset('Vigas y pilares')] : [],
    exigenciasFuego: o.fuego ?? [],
  };
  const materiales = pubMateriales(m, evaluarMateriales(m))!;
  const v = ejemploVientoNieveState();
  const viento = pubViento(v, evaluarViento(v))!;
  const c = defaultCargasState();
  c.emplazamiento = { provincia: '18', municipio: 'Granada', altitud: 680 };
  const cargas = pubCargas(c, evaluarCargas(c, null))!;
  const s = o.sismo ?? defaultSeismicState();
  const sismo = pubSismo(s, evaluarSismo(s));
  return {
    materiales: sobre('materiales', materiales, { municipio: 'Granada', ine: '18087' }),
    vientoNieve: sobre('viento-nieve', viento, { municipio: viento.municipio, provincia: viento.provincia, ine: viento.provinciaIne }),
    cargasPlanta: sobre('cargas-planta', cargas, { municipio: 'Granada', provincia: 'Granada', ine: '18' }),
    sismo: sobre('sismo', sismo, { municipio: 'Granada', ine: '18087' }),
  };
}

export const fichaGranada = (): MemoriaState =>
  estadoPorDefecto({ denominacion: 'Edificio en Granada', municipio: 'Granada', provincia: '18', altitud: 680, uso: 'Edificio de viviendas' });

/** La misma ficha con la fábrica marcada: el único Procede que se pone a mano. */
export const fichaGranadaConFabrica = (): MemoriaState => {
  const s = fichaGranada();
  return { ...s, obra: { ...s.obra, fabrica: { ...s.obra.fabrica, procede: true } } };
};

const OBRA_VACIA = { denominacion: '', uso: '', provincia: '', municipio: '', altitud: null };

/** Los cinco ids que ya no son campos de la ficha, con su nombre en `Obra`. */
const DATOS_OBRA: Record<string, 'denominacion' | 'uso' | 'provincia' | 'municipio' | 'altitud'> = {
  'obra.denominacion': 'denominacion',
  'obra.uso': 'uso',
  'obra.provincia': 'provincia',
  'obra.municipio': 'municipio',
  'obra.altitud': 'altitud',
};

/** Lo que `completar` teclea en los campos que no admiten un texto cualquiera. */
const VALORES: Record<string, unknown> = {
  'obra.fabrica.pieza': 'macizo',
  'obra.fabrica.fb': 10,
  'obra.fabrica.fm': 5,
  'obra.altitud': 680,
};

/**
 * Da por buenos los sobres que haya. Desde que se acabó el «tomar» sólo hace
 * falta cuando el sobre es de OTRA provincia: con los de Granada sobre una
 * ficha de Granada no cambia nada, y se conserva porque los tests de la ficha
 * lo nombran y no se tocan.
 */
export function tomarTodo(s: MemoriaState, sobres: Sobres): MemoriaState {
  let t = s;
  for (const m of MODULOS_PUB) {
    const so = sobres[m];
    if (so) t = aceptar(t, m, so);
  }
  return t;
}

/**
 * Resuelve todos los huecos con la acción que cada uno declara, en orden de
 * cola, y devuelve la ficha lista para exportar. Los textos tecleados son
 * reconocibles («dato de la obra») para poder buscarlos en el documento.
 */
export function completar(s0: MemoriaState, sobres: Sobres): MemoriaState {
  let s = asegurarForjados(s0, tipologiasDe(sobres.cargasPlanta));
  for (let vuelta = 0; vuelta < 80; vuelta++) {
    const ev = evaluar(s, sobres);
    // No `ev.listo`: desde F4 eso significa «no quedan FALTAS», y `completar`
    // tiene que dejar la ficha sin ningún hueco, también los ámbares.
    if (ev.huecos.length === 0) return s;
    const h = ev.huecos[0];
    if (h.accion === 'usarPublicado') {
      const m = h.id.replace('pub.', '') as ModuloPub;
      const so = sobres[m];
      if (!so) throw new Error(`no hay sobre que dar por bueno para ${h.id}`);
      s = aceptar(s, m, so);
    } else if (h.id in DATOS_OBRA) {
      // Los cinco datos de la obra ya no son campos de la ficha: viven en
      // `concreta-obra` y se teclean en su diálogo. Aquí se escriben donde les
      // toca, no con `teclear`, que no los encontraría.
      s = { ...s, datosObra: { ...(s.datosObra ?? OBRA_VACIA), [DATOS_OBRA[h.id]]: VALORES[h.id] ?? `dato de la obra (${h.id.split('.').pop()})` } };
    } else if (h.accion === 'confirmar') s = confirmar(s, h.id);
    else if (h.accion === 'teclear') s = teclear(s, h.id, h.id in VALORES ? VALORES[h.id] : `dato de la obra (${h.id.split('.').pop()})`);
    else throw new Error(`hueco sin salida: ${h.id} (${h.accion})`);
  }
  throw new Error('la ficha no se deja completar en 80 pasos');
}
