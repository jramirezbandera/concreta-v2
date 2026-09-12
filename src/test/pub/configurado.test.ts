/**
 * `configurado`: la marca que cada módulo estampa en su publicación para decir
 * si tenía algo que decir de ESTA obra.
 *
 * Es lo que impide que los valores de arranque de un módulo entren en un
 * documento firmado por el hecho de haberlo abierto una vez. Los dos casos que
 * hay que distinguir son el estado de partida y el CASO DE EJEMPLO: el segundo
 * es el que se escapaba, porque «Ver ejemplo» deja un edificio entero escrito
 * y con él el módulo parece calculado.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { defaultCargasState, ejemploCargasState, evaluar as evaluarCargas, publicarResultado as publicarCargas } from '../../features/cargas-planta/state';
import { defaultMaterialesState, evaluar as evaluarMateriales, publicarResultado as publicarMateriales } from '../../features/materiales/state';
import { defaultSeismicState, evaluarSismo, publicarResultado as publicarSismo } from '../../features/seismic-ncse02/state';
import { defaultVientoNieveState, ejemploVientoNieveState, evaluar as evaluarViento, publicarResultado as publicarViento } from '../../features/viento-nieve/state';
import { leerPublicacion } from '../../lib/pub';
import { guardarObra } from '../../lib/obra';
import { _reiniciarAlmacenParaTests } from '../../lib/storage/seguro';

const marcaDe = (modulo: string) => leerPublicacion(modulo)?.configurado;

beforeEach(() => {
  localStorage.clear();
  _reiniciarAlmacenParaTests();
  // Viento y cargas heredan el emplazamiento de la obra, y sin provincia su
  // publicación ni siquiera se escribe.
  guardarObra({ denominacion: 'Obra', provincia: '18', municipio: 'Granada', altitud: 680, uso: 'Viviendas' });
});

describe('viento y nieve', () => {
  it('los valores de arranque no cuentan como configurar', () => {
    const s = defaultVientoNieveState();
    publicarViento(s, evaluarViento(s));
    expect(marcaDe('viento-nieve')).toBe(false);
  });

  it('el CASO DE EJEMPLO tampoco', () => {
    // El fallo que destapó la revisión: `verEjemplo()` escribe un edificio
    // entero —Aranda de Duero, cubierta a 40°, tres faldones— y sin esto la
    // ficha lo daba por calculado.
    const s = ejemploVientoNieveState();
    publicarViento(s, evaluarViento(s));
    expect(marcaDe('viento-nieve')).toBe(false);
  });

  it('tocar el edificio sí', () => {
    const s = defaultVientoNieveState();
    const tocado = { ...s, viento: { ...s.viento, dimensiones: { x: 32, y: 14 } } };
    publicarViento(tocado, evaluarViento(tocado));
    expect(marcaDe('viento-nieve')).toBe(true);
  });

  it('cambiar sólo el municipio NO basta: el emplazamiento no dice si hay edificio modelado', () => {
    const s = ejemploVientoNieveState();
    const movido = { ...s, emplazamiento: { ...s.emplazamiento, municipio: 'Otro sitio' } };
    publicarViento(movido, evaluarViento(movido));
    expect(marcaDe('viento-nieve')).toBe(false);
  });
});

describe('cargas por planta', () => {
  it('arranque y ejemplo, no; tocar las plantas, sí', () => {
    const s = defaultCargasState();
    publicarCargas(s, evaluarCargas(s, null));
    expect(marcaDe('cargas-planta')).toBe(false);

    const ej = ejemploCargasState();
    publicarCargas(ej, evaluarCargas(ej, null));
    expect(marcaDe('cargas-planta')).toBe(false);

    const tocado = { ...s, plantas: s.plantas.slice(0, 2) };
    publicarCargas(tocado, evaluarCargas(tocado, null));
    expect(marcaDe('cargas-planta')).toBe(true);
  });
});

describe('cuadro de materiales', () => {
  it('HA-25 + B500SD + control estadístico es el arranque, no un cuadro de esta obra', () => {
    const s = defaultMaterialesState();
    publicarMateriales(s, evaluarMateriales(s));
    expect(marcaDe('materiales')).toBe(false);

    const tocado = { ...s, costa: true };
    publicarMateriales(tocado, evaluarMateriales(tocado));
    expect(marcaDe('materiales')).toBe(true);
  });
});

describe('acción sísmica', () => {
  it('Granada con ab = 0,23 g es el arranque, y publica IGUAL: por eso hace falta la marca', () => {
    // Este módulo es el único cuyo `publicarResultado` no tiene guarda: abrirlo
    // una vez deja el sobre escrito. La marca es lo único que distingue «hay un
    // sobre» de «hay un cálculo de esta obra».
    const s = defaultSeismicState();
    expect(s.municipioNombre).toBe('Granada');
    expect(s.ab).toBeCloseTo(0.23);

    publicarSismo(s, evaluarSismo(s));
    expect(leerPublicacion('sismo')).not.toBeNull();
    expect(marcaDe('sismo')).toBe(false);
  });

  it('aquí el emplazamiento SÍ configura: ab y K son el resultado, no el contexto', () => {
    const s = { ...defaultSeismicState(), municipioIne: '41091', municipioNombre: 'Sevilla', ab: 0.07 };
    publicarSismo(s, evaluarSismo(s));
    expect(marcaDe('sismo')).toBe(true);
  });
});

describe('el sobre', () => {
  it('un sobre escrito antes de la marca se lee como «sin configurar», no como configurado', () => {
    localStorage.setItem(
      'concreta-pub-materiales',
      JSON.stringify({ v: 2, ts: '2026-09-01T10:00:00.000Z', modulo: 'materiales', obra: { municipio: null, provincia: null, ine: null }, datos: {} }),
    );
    expect(leerPublicacion('materiales')?.configurado).toBeUndefined();
  });
});
