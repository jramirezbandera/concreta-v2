/**
 * El sismo publicado, leído por el cuadro del plano. La otra mitad de
 * `test/sismo/publicacion.test.ts`: allí se prueba lo que se escribe, aquí lo
 * que se lee, y entre las dos queda cerrado el cable de punta a punta sin que
 * ningún módulo toque el localStorage interno del otro.
 *
 * La vida útil entra por otra puerta —el cuadro de materiales— y esa costura es
 * la que más fácil se descose: el cuadro la enseña en la ficha del sismo, pero
 * no la calcula la NCSE-02.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { resumenSismoPublicado } from '../../features/cargas-planta/sismoPub';
import { cuadroAccionesPlanoCargas } from '../../lib/acciones/cuadrosCargas';
import { defaultCargasState, evaluar } from '../../features/cargas-planta/state';
import {
  defaultSeismicState,
  evaluarSismo,
  publicarResultado as publicarSismo,
  type SeismicState,
} from '../../features/seismic-ncse02/state';
import {
  defaultMaterialesState,
  evaluar as evaluarMateriales,
  publicarResultado as publicarMateriales,
} from '../../features/materiales/state';
import type { Block } from '../../lib/materiales/cuadros';

beforeEach(() => {
  localStorage.clear();
});

const publicar = (s: SeismicState) => publicarSismo(s, evaluarSismo(s));

/** El cuadro del plano de una obra cualquiera, con el sismo que haya publicado. */
function bloquesPlano(): Block[] {
  const estado = defaultCargasState();
  return cuadroAccionesPlanoCargas(evaluar(estado, null).resultado, null, resumenSismoPublicado());
}

const kvTables = (bs: Block[]) => bs.filter((b): b is Extract<Block, { kind: 'kvTable' }> => b.kind === 'kvTable');

describe('sin publicación de sismo', () => {
  it('no hay resumen, y el cuadro lo dice en vez de callarlo', () => {
    expect(resumenSismoPublicado()).toBeNull();
    const plano = bloquesPlano();
    expect(plano.some((b) => b.kind === 'paragraph' && b.text.includes('módulo Sismo'))).toBe(true);
  });
});

describe('con el sismo publicado', () => {
  it('el cuadro toma ac, K y la ductilidad del sobre, sin leer el estado del otro módulo', () => {
    const s = defaultSeismicState(); // Granada, μ = 3
    publicar(s);
    const r = resumenSismoPublicado()!;
    expect(r.ac).toBeCloseTo(evaluarSismo(s).emplazamiento.ac, 12);
    expect(r.K).toBe(1);
    expect(r.mu).toBe(3);
    expect(r.ductilidad).toBe('alta');
    expect(r.obligatoria).toBe(true);
    // Sin cuadro de materiales publicado no hay vida útil que enseñar, y el
    // cuadro no se la inventa.
    expect(r.vidaUtil).toBeUndefined();

    const kv = kvTables(bloquesPlano());
    expect(kv[0].rows).toEqual([
      ['Aceleración sísmica de cálculo', `${r.ac.toFixed(2).replace('.', ',')}g`],
      ['Coeficiente de contribución K', '1,00'],
      ['Ductilidad', 'alta, μ = 3,0'],
    ]);
  });

  it('la vida útil la pone el cuadro de materiales, no el de sismo', () => {
    publicar(defaultSeismicState());
    const m = defaultMaterialesState();
    publicarMateriales(m, evaluarMateriales(m));
    expect(resumenSismoPublicado()!.vidaUtil).toBe(50);
    expect(kvTables(bloquesPlano())[0].rows.map(([k]) => k)).toContain('Vida útil');
  });

  it('exento: el cuadro no declara ductilidad y escribe el motivo con su artículo', () => {
    publicar({ ...defaultSeismicState(), ab: 0.02 });
    const r = resumenSismoPublicado()!;
    expect(r.obligatoria).toBe(false);
    expect(r.exencion).toBeTruthy();

    const plano = bloquesPlano();
    expect(kvTables(plano)[0].rows.map(([k]) => k)).not.toContain('Ductilidad');
    expect(plano.some((b) => b.kind === 'paragraph' && b.text === r.exencion)).toBe(true);
  });

  it('lo que se imprime es SIEMPRE lo último publicado: el sismo no se congela en el estado', () => {
    publicar(defaultSeismicState());
    const antes = resumenSismoPublicado()!.mu;
    publicar({ ...defaultSeismicState(), mu: 2 });
    expect(antes).toBe(3);
    expect(resumenSismoPublicado()!.mu).toBe(2);
    expect(kvTables(bloquesPlano())[0].rows).toContainEqual(['Ductilidad', 'baja, μ = 2,0']);
  });

  it('un sobre de otro módulo en la misma clave no se lee como sismo', () => {
    localStorage.setItem('concreta-pub-sismo', JSON.stringify({ v: 1, ts: '2026-09-06T00:00:00Z', modulo: 'viento-nieve', obra: {}, datos: { ac: 9 } }));
    expect(resumenSismoPublicado()).toBeNull();
  });
});

describe('el cuadro del plano completo', () => {
  it('viento y sismo se ensamblan cada uno de su publicación, en su orden', () => {
    publicar(defaultSeismicState());
    const r = evaluar(defaultCargasState(), null).resultado;
    const plano = cuadroAccionesPlanoCargas(r, { zonaEolica: 'A', vb: 26, aspereza: 'IV' }, resumenSismoPublicado());
    const titulos = plano.filter((b): b is Extract<Block, { kind: 'heading' }> => b.kind === 'heading').map((b) => b.text);
    expect(titulos).toContain('VIENTO (SEGÚN DB SE-AE)');
    expect(titulos).toContain('SISMO (SEGÚN NCSE-02)');
    expect(titulos.indexOf('VIENTO (SEGÚN DB SE-AE)')).toBeLessThan(titulos.indexOf('SISMO (SEGÚN NCSE-02)'));
  });
});

describe('el sobre de otra obra no entra en el cuadro', () => {
  it('provincia distinta: se descarta, y el cuadro dice que no hay publicación', () => {
    publicar(defaultSeismicState()); // Granada, INE 18087
    expect(resumenSismoPublicado('18')).not.toBeNull();
    // Ávila. El caso real: abrir el módulo de sismo una vez, con su ejemplo de
    // Granada dentro, y que el plano de otra obra declarase su aceleración.
    expect(resumenSismoPublicado('05')).toBeNull();
  });

  it('sin provincia en el cuadro, o sin INE en el sobre, no hay discrepancia que demostrar', () => {
    publicar(defaultSeismicState());
    expect(resumenSismoPublicado('')).not.toBeNull();
    localStorage.clear();
    // ab y K a mano y sin obra guardada: el sobre no sabe de dónde es.
    publicar({ ...defaultSeismicState(), municipioIne: null, municipioNombre: '' });
    expect(resumenSismoPublicado('05')).not.toBeNull();
  });
});
