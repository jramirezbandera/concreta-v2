/**
 * Las columnas de «¿qué hay encima del forjado?».
 *
 * Son una proyección del estado, no estado: lo que se comprueba aquí es que
 * agrupan lo que hay que agrupar, que respetan el orden de la obra y que las
 * cuatro operaciones de la tabla (teclear una celda, vaciarla, añadir columna,
 * quitarla) dejan el estado exactamente como lo dejaba el formulario.
 */

import { describe, expect, it } from 'vitest';
import {
  anadirColumna,
  claveColumna,
  columnasEncima,
  permanenteDe,
  ponerEnCelda,
  ponerEspesor,
  quitarColumna,
  renombrarColumna,
} from '../../features/cargas-planta/columnas';
import { nuevaPlanta, nuevaZona, nuevoPermanente, type PermanenteUI, type PlantaUI } from '../../features/cargas-planta/state';

/** Una obra como la del oráculo: dos plantas de vivienda y una cubierta. */
function obra(): PlantaUI[] {
  const baja = nuevaPlanta('Planta Baja');
  const primera = nuevaPlanta('Planta Primera');
  const cubierta = nuevaPlanta('Cubierta', true);
  return [baja, primera, cubierta];
}

const claves = (plantas: PlantaUI[]) => columnasEncima(plantas).map((c) => c.clave);
const conPermanentes = (ps: PermanenteUI[]): PlantaUI => ({ ...nuevaPlanta('P'), zonas: [{ ...nuevaZona(false), permanentes: ps }] });

describe('claveColumna', () => {
  it('agrupa por la entrada del catálogo, no por el concepto tecleado', () => {
    const a = nuevoPermanente('solado');
    const b = { ...nuevoPermanente('solado'), concepto: 'Solado de gres' };
    expect(claveColumna(a)).toBe(claveColumna(b));
  });

  it('agrupa dos cargas libres que se llaman igual, sin distinguir mayúsculas ni espacios', () => {
    const a: PermanenteUI = { id: 'c1', concepto: 'Falso techo', valor: 0.3, catalogoId: null, espesor: null };
    const b: PermanenteUI = { id: 'c2', concepto: '  falso TECHO ', valor: 0.25, catalogoId: null, espesor: null };
    expect(claveColumna(a)).toBe(claveColumna(b));
  });

  it('no agrupa dos cargas libres sin nombre: cada una espera a que se le ponga', () => {
    const a: PermanenteUI = { id: 'c1', concepto: '', valor: 1, catalogoId: null, espesor: null };
    const b: PermanenteUI = { id: 'c2', concepto: '', valor: 2, catalogoId: null, espesor: null };
    expect(claveColumna(a)).not.toBe(claveColumna(b));
  });
});

describe('columnasEncima', () => {
  it('es la unión de lo que llevan todas las zonas, en el orden de la obra', () => {
    // El arranque: solado y tabiquería en las plantas de piso, grava en la cubierta.
    expect(claves(obra())).toEqual(['cat:solado', 'cat:tabiqueria', 'cat:cubierta-grava']);
  });

  it('una carga que sólo tiene una zona cae detrás de las que llevan todas', () => {
    const plantas = obra();
    plantas[0].zonas.push({ ...nuevaZona(false, 'Vaso piscina'), permanentes: [nuevoPermanente('agua', 1.2)] });
    expect(claves(plantas)).toEqual(['cat:solado', 'cat:tabiqueria', 'cat:agua', 'cat:cubierta-grava']);
  });

  it('trae la densidad de las que se teclean por espesor y no la de las demás', () => {
    const plantas = [conPermanentes([nuevoPermanente('agua', 1.2), nuevoPermanente('solado')])];
    const [agua, solado] = columnasEncima(plantas);
    expect(agua.porEspesor).toBe(10);
    expect(agua.etiqueta).toBe('Agua (piscina, aljibe)');
    expect(solado.porEspesor).toBeNull();
  });

  it('sin cargas no hay columnas', () => {
    expect(columnasEncima([conPermanentes([])])).toEqual([]);
  });
});

describe('la celda', () => {
  it('teclear un número en una celda vacía crea la carga en esa zona', () => {
    const plantas = obra();
    const [grava] = columnasEncima([plantas[2]]);
    const zona = ponerEnCelda(plantas[0].zonas[0], grava, 2.5);
    const puesta = permanenteDe(zona, grava.clave);
    expect(puesta).toMatchObject({ valor: 2.5, catalogoId: 'cubierta-grava' });
    expect(puesta?.concepto).toBe('Cubierta plana invertida o a la catalana con grava');
  });

  it('vaciarla la quita de esa zona y sólo de esa', () => {
    const plantas = obra();
    const [solado] = columnasEncima(plantas);
    const zona = ponerEnCelda(plantas[0].zonas[0], solado, null);
    expect(permanenteDe(zona, solado.clave)).toBeUndefined();
    expect(permanenteDe(plantas[1].zonas[0], solado.clave)).toBeDefined();
  });

  it('teclear sobre una carga que ya está cambia su valor y no la duplica', () => {
    const plantas = obra();
    const [solado] = columnasEncima(plantas);
    const zona = ponerEnCelda(plantas[0].zonas[0], solado, 1.5);
    expect(zona.permanentes).toHaveLength(plantas[0].zonas[0].permanentes.length);
    expect(permanenteDe(zona, solado.clave)?.valor).toBe(1.5);
  });

  it('el espesor manda sobre el valor en las cargas por espesor', () => {
    const plantas = [conPermanentes([nuevoPermanente('agua', 1)])];
    const [agua] = columnasEncima(plantas);
    const zona = ponerEspesor(plantas[0].zonas[0], agua, 1.6);
    expect(permanenteDe(zona, agua.clave)).toMatchObject({ espesor: 1.6, valor: 16 });
  });

  it('crear una carga por espesor desde la celda deja el espesor coherente con el valor', () => {
    const plantas = [conPermanentes([nuevoPermanente('agua', 1)]), conPermanentes([])];
    const [agua] = columnasEncima(plantas);
    const zona = ponerEnCelda(plantas[1].zonas[0], agua, 12);
    expect(permanenteDe(zona, agua.clave)).toMatchObject({ valor: 12, espesor: 1.2 });
  });
});

describe('la columna entera', () => {
  it('añadir del catálogo la pone en las zonas que no la tienen y respeta las que sí', () => {
    const plantas = obra();
    const antes = permanenteDe(plantas[0].zonas[0], 'cat:solado');
    const despues = anadirColumna(plantas, 'solado');
    // La cubierta no lo tenía y ahora sí; la planta baja conserva el suyo, con su id.
    expect(permanenteDe(despues[2].zonas[0], 'cat:solado')).toBeDefined();
    expect(permanenteDe(despues[0].zonas[0], 'cat:solado')?.id).toBe(antes?.id);
    expect(claves(despues)).toEqual(['cat:solado', 'cat:tabiqueria', 'cat:cubierta-grava']);
  });

  it('quitarla la quita de todas las zonas', () => {
    const despues = quitarColumna(obra(), 'cat:solado');
    expect(claves(despues)).toEqual(['cat:tabiqueria', 'cat:cubierta-grava']);
    for (const p of despues) for (const z of p.zonas) expect(permanenteDe(z, 'cat:solado')).toBeUndefined();
  });

  it('renombrarla renombra la carga en todas las zonas que la llevan', () => {
    const despues = renombrarColumna(obra(), 'cat:tabiqueria', 'Tabiquería y falso techo');
    expect(permanenteDe(despues[0].zonas[0], 'cat:tabiqueria')?.concepto).toBe('Tabiquería y falso techo');
    expect(permanenteDe(despues[1].zonas[0], 'cat:tabiqueria')?.concepto).toBe('Tabiquería y falso techo');
    // La cubierta no la lleva: no se le añade por renombrar.
    expect(permanenteDe(despues[2].zonas[0], 'cat:tabiqueria')).toBeUndefined();
  });

  it('ninguna operación toca las zonas de otras plantas por referencia', () => {
    const plantas = obra();
    const copia = structuredClone(plantas);
    quitarColumna(plantas, 'cat:solado');
    anadirColumna(plantas, 'agua');
    ponerEnCelda(plantas[0].zonas[0], columnasEncima(plantas)[0], 9);
    expect(plantas).toEqual(copia);
  });
});
