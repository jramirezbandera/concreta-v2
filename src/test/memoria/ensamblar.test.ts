/**
 * El ensamblado de la ficha con las publicaciones REALES de los cuatro módulos
 * —construidas con sus `datosPublicacion`, como hace `sismoPub.test.ts`— y sin
 * localStorage: los sobres se inyectan.
 *
 * Lo que se fija: las tres reglas de la cabecera de `ensamblar.ts` (Procede
 * derivado, viento opcional, «revisar»), qué falta cuando falta un sobre, y
 * la propiedad que sostiene «Siguiente hueco»: todo hueco se resuelve con la
 * acción que declara, y resueltos todos, la ficha está lista.
 */

import { describe, expect, it } from 'vitest';
import { defaultCargasState, datosPublicacion as pubCargas, evaluar as evaluarCargas } from '../../features/cargas-planta/state';
import { defaultMaterialesState, datosPublicacion as pubMateriales, evaluar as evaluarMateriales, filaMaderaDesdePreset } from '../../features/materiales/state';
import { defaultSeismicState, datosPublicacion as pubSismo, evaluarSismo } from '../../features/seismic-ncse02/state';
import { ejemploVientoNieveState, datosPublicacion as pubViento, evaluar as evaluarViento } from '../../features/viento-nieve/state';
import { provinciaPorIne } from '../../lib/acciones/provincias';
import { ZONAS_EOLICAS } from '../../lib/acciones/tablasAE';
import { lookupFk, lookupGammaM } from '../../lib/calculations/masonryWalls';
import { SIN_SOBRES, ensamblar, esDeOtraObra, estadoSobre, evaluar, tipologiasDe, type Sobres } from '../../lib/memoria/ensamblar';
import { asegurarForjados, confirmar, estadoPorDefecto, teclear, tomarPublicacion, type MemoriaState } from '../../lib/memoria/estado';
import type { Publicacion } from '../../lib/pub';

const TS = '2026-09-06T10:00:00.000Z';

function sobre<T>(modulo: string, datos: T, obra: Partial<Publicacion<T>['obra']> = {}, ts = TS): Publicacion<T> {
  return { v: 1, ts, modulo, obra: { municipio: null, provincia: null, ine: null, ...obra }, datos };
}

/** Los cuatro sobres de una obra en Granada, con acero y madera en el cuadro de materiales. */
function sobresGranada(): Sobres {
  const m = { ...defaultMaterialesState(), usaAceroEstructural: true, usaMadera: true, maderaGrupos: [filaMaderaDesdePreset('Vigas y pilares')] };
  const materiales = pubMateriales(m, evaluarMateriales(m))!;
  const v = ejemploVientoNieveState();
  const viento = pubViento(v, evaluarViento(v))!;
  const c = defaultCargasState();
  c.emplazamiento = { provincia: '18', municipio: 'Granada', altitud: 680 };
  const cargas = pubCargas(c, evaluarCargas(c, null))!;
  const s = defaultSeismicState();
  const sismo = pubSismo(s, evaluarSismo(s));
  return {
    materiales: sobre('materiales', materiales, { municipio: 'Granada', ine: '18087' }),
    vientoNieve: sobre('viento-nieve', viento, { municipio: viento.municipio, provincia: viento.provincia, ine: viento.provinciaIne }),
    cargasPlanta: sobre('cargas-planta', cargas, { municipio: 'Granada', provincia: 'Granada', ine: '18' }),
    sismo: sobre('sismo', sismo, { municipio: 'Granada', ine: '18087' }),
  };
}

const fichaGranada = () => estadoPorDefecto({ denominacion: 'Edificio en Granada', municipio: 'Granada', ine: '18087', provincia: '18', altitud: 680, uso: 'Edificio de viviendas' });

/** Acepta los cuatro sobres tal como están. */
function tomarTodo(s: MemoriaState, sobres: Sobres): MemoriaState {
  let t = s;
  for (const m of ['materiales', 'vientoNieve', 'cargasPlanta', 'sismo'] as const) {
    const so = sobres[m];
    if (so) t = tomarPublicacion(t, m, so);
  }
  return t;
}

describe('estadoSobre y otra obra', () => {
  const so = sobre('materiales', {}, { ine: '18087' });
  it('sin sobre: falta si es obligatorio, derivado si no (viento)', () => {
    expect(estadoSobre(null, null, '18', true)).toBe('falta');
    expect(estadoSobre(null, null, '18', false)).toBe('derivado');
  });
  it('sin aceptar, con otra fecha o aceptado desde otra provincia: revisar; si no, ok', () => {
    expect(estadoSobre(so, null, '18', true)).toBe('revisar');
    expect(estadoSobre(so, { ts: '2026-09-05T00:00:00.000Z', ine: '18087', provinciaFicha: '18' }, '18', true)).toBe('revisar');
    expect(estadoSobre(so, { ts: TS, ine: '18087', provinciaFicha: '29' }, '18', true)).toBe('revisar');
    expect(estadoSobre(so, { ts: TS, ine: '18087', provinciaFicha: '18' }, '18', true)).toBe('ok');
  });
  it('otra obra sólo cuando las dos provincias se conocen y difieren', () => {
    expect(esDeOtraObra(so, undefined, '18')).toBe(false);
    expect(esDeOtraObra(so, undefined, '29')).toBe(true);
    expect(esDeOtraObra(so, undefined, '')).toBe(false);
    expect(esDeOtraObra(sobre('x', {}, { ine: null }), undefined, '29')).toBe(false);
    // El de sismo lleva su propio INE dentro de los datos, que manda sobre el del sobre.
    expect(esDeOtraObra(so, '29067', '18')).toBe(true);
  });
});

describe('sin ninguna publicación', () => {
  const d = ensamblar(fichaGranada(), SIN_SOBRES);

  it('materiales, cargas y sismo faltan; viento no: se deriva de la provincia', () => {
    expect(d.fuentes.materiales.estado).toBe('falta');
    expect(d.fuentes.cargasPlanta.estado).toBe('falta');
    expect(d.fuentes.sismo.estado).toBe('falta');
    expect(d.fuentes.vientoNieve.estado).toBe('derivado');
    const p = provinciaPorIne('18')!;
    expect(d.seae.viento.valor).toEqual({ lugar: 'Granada (Granada)', zona: p.zonaEolica, vb: ZONAS_EOLICAS[p.zonaEolica].vb, qb: ZONAS_EOLICAS[p.zonaEolica].qb });
    expect(d.seae.viento.origen).toBe('norma');
    expect(d.seae.nieve.valor).toBeNull();
  });

  it('Málaga sin sobre: zona A, 26 m/s, 0,42 kN/m²', () => {
    const m = ensamblar(estadoPorDefecto({ denominacion: '', municipio: 'Málaga', ine: '29067', provincia: '29', altitud: 10, uso: '' }), SIN_SOBRES);
    expect(m.seae.viento.valor).toMatchObject({ lugar: 'Málaga (Málaga)', zona: 'A', vb: 26, qb: 0.42 });
  });

  it('sin provincia, el viento no puede derivarse y el hueco es la provincia', () => {
    const d0 = ensamblar(estadoPorDefecto(null), SIN_SOBRES);
    expect(d0.seae.viento.estado).toBe('falta');
    expect(d0.seae.viento.id).toBeUndefined();
    expect(evaluar(estadoPorDefecto(null), SIN_SOBRES).huecos.map((h) => h.id)).toContain('obra.provincia');
  });

  it('acero, madera y fábrica no proceden; el resto sí', () => {
    expect(d.procede).toEqual({ indice: true, se: true, seae: true, sec: true, ncse: true, ce: true, forjados: true, sea: false, sef: false, sem: false });
    expect(d.sea).toBeNull();
    expect(d.sem).toBeNull();
    expect(d.sef).toBeNull();
  });

  it('cada sobre que falta es UN hueco, aunque alimente varios apartados', () => {
    const ids = evaluar(fichaGranada(), SIN_SOBRES).huecos.map((h) => h.id);
    expect(ids.filter((i) => i === 'pub.cargasPlanta')).toHaveLength(1);
    expect(ids.filter((i) => i === 'pub.materiales')).toHaveLength(1);
    expect(ids).not.toContain('pub.vientoNieve');
    // Y las fuentes van antes que los apartados, después de la obra.
    expect(ids.indexOf('pub.materiales')).toBeLessThan(ids.indexOf('obra.geotecnia.empresa'));
  });

  it('el periodo de servicio cae al perfil de estudio', () => {
    expect(d.se.periodoServicio).toMatchObject({ valor: 50, origen: 'estudio' });
  });
});

describe('con los cuatro sobres de Granada, recién publicados', () => {
  const sobres = sobresGranada();

  it('sin aceptarlos están en «revisar» y lo que sale de ellos falta', () => {
    const d = ensamblar(fichaGranada(), sobres);
    expect(d.fuentes.materiales.estado).toBe('revisar');
    expect(d.fuentes.sismo.estado).toBe('revisar');
    expect(d.ncse.estado).toBe('falta');
    expect(d.seae.niveles.estado).toBe('falta');
    // El viento con sobre sin tomar: se deriva de la provincia y se avisa.
    expect(d.seae.viento.origen).toBe('norma');
    expect(d.seae.viento.nota).toContain('sin tomar');
  });

  it('aceptados, todo lo derivado se resuelve', () => {
    const d = ensamblar(tomarTodo(fichaGranada(), sobres), sobres);
    for (const f of Object.values(d.fuentes)) expect(f.estado, f.modulo).toBe('ok');
    expect(d.procede.sea).toBe(true);
    expect(d.procede.sem).toBe(true);
    expect(d.se.periodoServicio).toMatchObject({ valor: 50, origen: 'materiales' });
    expect(d.seae.viento.origen).toBe('viento-nieve');
    expect(d.seae.viento.valor?.lugar).toBe(sobres.vientoNieve!.datos.municipio);
    expect(d.seae.nieve.valor?.sk).toBe(sobres.vientoNieve!.datos.nieve!.sk);
  });

  it('la tabla de niveles: una fila por zona, uso con su etiqueta de la tabla 3.1, total = suma simple', () => {
    const d = ensamblar(tomarTodo(fichaGranada(), sobres), sobres);
    const filas = d.seae.niveles.valor!;
    const zonas = sobres.cargasPlanta!.datos.plantas.flatMap((p) => p.zonas.map((z) => ({ p, z })));
    expect(filas).toHaveLength(zonas.length);
    const vivienda = zonas.findIndex(({ z }) => z.categoria === 'A1');
    expect(filas[vivienda].uso).toMatch(/kN\/m² \(viviendas\)$/);
    expect(filas[vivienda].pp).toMatch(/\(reticular h = 30 cm\)$/);
    const z0 = zonas[0].z;
    expect(filas[0].total).toBe(`${(z0.pp + z0.resto + z0.qUso + (z0.nieve ?? 0)).toFixed(2).replace('.', ',')} kN/m²`);
  });

  it('el estado de cargas del 3.1.5.3 y las lineales salen de la misma publicación', () => {
    const d = ensamblar(tomarTodo(fichaGranada(), sobres), sobres);
    expect(d.ce.cargas.valor?.usos.length).toBe(d.seae.niveles.valor?.length);
    expect(d.ce.cargas.valor?.lineales.map((l) => l.concepto)).toEqual(sobres.cargasPlanta!.datos.lineales.map((l) => l.concepto));
  });

  it('los materiales del CE: una fila por elemento más los prescritos, con el acero y el cemento del cuadro', () => {
    const d = ensamblar(tomarTodo(fichaGranada(), sobres), sobres);
    const h = sobres.materiales!.datos.hormigon!;
    expect(d.ce.materiales.valor).toHaveLength(h.elementos.length + h.prescritos.length);
    expect(d.ce.materiales.valor![0]).toMatchObject({ hormigon: h.elementos[0].tipificacion, acero: h.aceroPasivo.designacion, cemento: h.cemento, ubicacion: h.elementos[0].nombre });
    expect(d.ce.coeficientes.valor).toMatchObject({ gammaC: 1.5, gammaS: 1.15, gammaG: 1.35, gammaQ: 1.5, nivelHormigon: 'ESTADÍSTICO', nivelEjecucion: 'NORMAL' });
    expect(d.ce.durabilidad.valor![0].cnom).toBe(h.elementos[0].cnom);
  });

  it('los forjados: una tipología por (tipo, canto) de cargas, con la geometría típica heredada hasta confirmarla', () => {
    const s = tomarTodo(fichaGranada(), sobres);
    const d = ensamblar(s, sobres);
    const tip = d.forjados.valor!;
    expect(tip.map((t) => t.clave)).toEqual(tipologiasDe(sobres.cargasPlanta).map((t) => `${t.tipo}-${t.canto}`));
    const ret = tip.find((t) => t.tipo === 'reticular')!;
    expect(ret.intereje).toMatchObject({ valor: 82, estado: 'heredado', id: `obra.forjados.${ret.clave}.intereje` });
    expect(ret.hormigon).toBe(sobres.materiales!.datos.hormigon!.elementos.find((e) => /forjad/i.test(e.nombre))?.tipificacion);
    expect(ret.acero).toBe('B500SD');
    expect(ret.flechas.total).toBe('L/250');
    // Confirmada la geometría, deja de ser hueco.
    let c = asegurarForjados(s, tipologiasDe(sobres.cargasPlanta));
    for (const campo of ['intereje', 'anchoNervio', 'capaCompresion', 'pieza']) c = confirmar(c, `obra.forjados.${ret.clave}.${campo}`);
    expect(ensamblar(c, sobres).forjados.valor!.find((t) => t.tipo === 'reticular')!.intereje!.estado).toBe('ok');
  });

  it('el sismo de Granada es obligatorio y calculado: la tabla completa, con el tipo de estructura del módulo', () => {
    const d = ensamblar(tomarTodo(fichaGranada(), sobres), sobres);
    const s = d.ncse.valor!;
    expect(d.ncse.estado).toBe('derivado');
    expect(s.obligatoria).toBe(true);
    expect(s.exencion).toBeNull();
    expect(s.clasificacion).toBe('Edificio de viviendas (Construcción de normal importancia)');
    expect(s.ab).toBe('ab=0,23 g, (siendo g la aceleración de la gravedad)');
    expect(s.tipoEstructura).toMatchObject({ valor: 'Pórticos de hormigón armado', origen: 'sismo' });
    expect(Object.keys(s.completo!)).toEqual(['K', 'rho', 'S', 'C', 'ac', 'metodo', 'amortiguamiento', 'periodo', 'modos', 'fraccion', 'ductilidad', 'segundoOrden', 'medidas']);
    expect(s.completo!.C).toBe('Terreno tipo II (C=1,30)');
    expect(s.completo!.S).toMatch(/^Para 0,1g ≤ ρ·ab < 0,4g/);
    expect(s.completo!.ductilidad).toBe('μ = 3 (ductilidad alta)');
    expect(s.completo!.modos).toMatch(/^\d+ modos en la dirección X y \d+ en la dirección Y/);
  });

  it('un tipo de estructura tecleado manda sobre el del módulo', () => {
    const s = teclear(tomarTodo(fichaGranada(), sobres), 'obra.tipoEstructuraSismo', 'Mixta: pórticos de hormigón y paredes de carga');
    expect(ensamblar(s, sobres).ncse.valor!.tipoEstructura).toMatchObject({ valor: 'Mixta: pórticos de hormigón y paredes de carga', estado: 'ok' });
  });

  it('acero y madera se redactan desde el cuadro de materiales', () => {
    const d = ensamblar(tomarTodo(fichaGranada(), sobres), sobres);
    expect(d.sea!.acero.designacion).toBe('S275JR');
    expect(d.sea!.verificacion).toContain('Cypecad Espacial');
    expect(d.sem!.madera.grupos[0].nombre).toBe('Vigas y pilares');
  });
});

describe('sismo exento y sismo sin resolver', () => {
  it('exento (ab = 0,02 g): la tabla se colapsa y lleva el motivo del módulo', () => {
    const s = { ...defaultSeismicState(), ab: 0.02 };
    const sobres: Sobres = { ...SIN_SOBRES, sismo: sobre('sismo', pubSismo(s, evaluarSismo(s)), { ine: '18087' }) };
    const d = ensamblar(tomarTodo(fichaGranada(), sobres), sobres);
    expect(d.ncse.estado).toBe('derivado');
    expect(d.ncse.valor!.obligatoria).toBe(false);
    expect(d.ncse.valor!.completo).toBeNull();
    expect(d.ncse.valor!.exencion).toContain('0,04');
  });

  it('obligatorio pero sin cálculo (una declaración sin hacer): falta, y el hueco lleva al módulo', () => {
    const s = { ...defaultSeismicState(), regularidadGeometrica: null };
    const pub = pubSismo(s, evaluarSismo(s));
    expect(pub.obligatoria).toBe(true);
    expect(pub.calculo).toBeNull();
    const sobres: Sobres = { ...SIN_SOBRES, sismo: sobre('sismo', pub, { ine: '18087' }) };
    const ev = evaluar(tomarTodo(fichaGranada(), sobres), sobres);
    expect(ev.datos.ncse.estado).toBe('falta');
    expect(ev.datos.ncse.nota).toContain('Resuelva el cálculo');
    expect(ev.huecos.find((h) => h.id === 'pub.sismo')?.accion).toBe('publicarModulo');
  });
});

describe('otra obra y revisar', () => {
  it('el sobre de sismo de Granada en una ficha de Málaga: se avisa, y sigue siendo tomable', () => {
    const sobres = sobresGranada();
    const malaga = estadoPorDefecto({ denominacion: 'Bloque', municipio: 'Málaga', ine: '29067', provincia: '29', altitud: 10, uso: 'Viviendas' });
    const d = ensamblar(malaga, sobres);
    expect(d.fuentes.sismo.otraObra).toBe(true);
    expect(d.fuentes.sismo.nota).toContain('otra obra');
    expect(d.fuentes.sismo.estado).toBe('revisar');
    const t = ensamblar(tomarTodo(malaga, sobres), sobres);
    expect(t.fuentes.sismo.estado).toBe('ok');
    expect(t.fuentes.sismo.otraObra).toBe(true);
  });

  it('cambiar la provincia de la ficha después de aceptar devuelve los sobres a revisar', () => {
    const sobres = sobresGranada();
    const s = tomarTodo(fichaGranada(), sobres);
    expect(ensamblar(s, sobres).fuentes.materiales.estado).toBe('ok');
    const movida = teclear(s, 'obra.provincia', '29');
    expect(ensamblar(movida, sobres).fuentes.materiales.estado).toBe('revisar');
  });

  it('un sobre nuevo del mismo módulo (otra fecha) también vuelve a revisar', () => {
    const sobres = sobresGranada();
    const s = tomarTodo(fichaGranada(), sobres);
    const nuevos: Sobres = { ...sobres, materiales: { ...sobres.materiales!, ts: '2026-09-07T08:00:00.000Z' } };
    expect(ensamblar(s, nuevos).fuentes.materiales.estado).toBe('revisar');
  });
});

describe('fábrica', () => {
  it('con el toggle, sus campos son huecos y fk y γM se derivan de la tabla 4.4 y la 4.8', () => {
    let s = fichaGranada();
    s = { ...s, obra: { ...s.obra, fabrica: { ...s.obra.fabrica, procede: true } } };
    const ids = evaluar(s, SIN_SOBRES).huecos.map((h) => h.id);
    expect(ids).toEqual(expect.arrayContaining(['obra.fabrica.pieza', 'obra.fabrica.fb', 'obra.fabrica.fm', 'obra.fabrica.categoriaControl', 'obra.fabrica.claseEjecucion']));
    s = teclear(s, 'obra.fabrica.pieza', 'macizo');
    s = teclear(s, 'obra.fabrica.fb', 10);
    s = teclear(s, 'obra.fabrica.fm', 5);
    s = confirmar(confirmar(s, 'obra.fabrica.categoriaControl'), 'obra.fabrica.claseEjecucion');
    const sef = ensamblar(s, SIN_SOBRES).sef!;
    expect(sef.fk).toMatchObject({ valor: lookupFk('macizo', 10, 5), estado: 'derivado' });
    expect(sef.gammaM.valor).toBe(lookupGammaM('II', 'A'));
    expect(sef.piezaEtiqueta).toBeTruthy();
  });

  it('una pareja fb/fm sin casilla en la tabla 4.4 es un hueco con nota, no un número inventado', () => {
    let s = fichaGranada();
    s = { ...s, obra: { ...s.obra, fabrica: { ...s.obra.fabrica, procede: true } } };
    s = teclear(teclear(teclear(s, 'obra.fabrica.pieza', 'macizo'), 'obra.fabrica.fb', 10), 'obra.fabrica.fm', 999);
    const sef = ensamblar(s, SIN_SOBRES).sef!;
    expect(sef.fk.estado).toBe('falta');
    expect(sef.fk.nota).toContain('tabla 4.4');
  });
});

describe('la propiedad de «Siguiente hueco»', () => {
  it('cada hueco se resuelve con la acción que declara, y sin huecos la ficha está lista', () => {
    const sobres = sobresGranada();
    let s = asegurarForjados(fichaGranada(), tipologiasDe(sobres.cargasPlanta));
    for (let vuelta = 0; vuelta < 50; vuelta++) {
      const ev = evaluar(s, sobres);
      if (ev.listo) break;
      const h = ev.huecos[0];
      if (h.accion === 'usarPublicado') s = tomarPublicacion(s, h.id.replace('pub.', '') as 'materiales', sobres[h.id.replace('pub.', '') as 'materiales']!);
      else if (h.accion === 'confirmar') s = confirmar(s, h.id);
      else if (h.accion === 'teclear') s = teclear(s, h.id, h.id.endsWith('altitud') ? 680 : 'dato de la obra');
      else throw new Error(`hueco sin salida: ${h.id} (${h.accion})`);
    }
    const ev = evaluar(s, sobres);
    expect(ev.huecos.map((h) => h.id)).toEqual([]);
    expect(ev.listo).toBe(true);
    expect(ev.mensajeBloqueo).toBeNull();
  });

  it('la cola va en el orden del documento: obra, fuentes, cimentación, hormigón, forjados', () => {
    const sobres = sobresGranada();
    const pos = (ids: string[], id: string) => ids.findIndex((i) => i.startsWith(id));
    // Sin tomar los sobres: las fuentes van justo detrás de la obra.
    const sinTomar = evaluar(fichaGranada(), sobres).huecos.map((h) => h.id);
    expect(pos(sinTomar, 'obra.sobrecargaTerreno')).toBeGreaterThan(pos(sinTomar, 'pub.'));
    expect(pos(sinTomar, 'pub.')).toBeLessThan(pos(sinTomar, 'obra.geotecnia'));
    // Tomados: los apartados en su orden.
    const tomados = evaluar(asegurarForjados(tomarTodo(fichaGranada(), sobres), tipologiasDe(sobres.cargasPlanta)), sobres).huecos.map((h) => h.id);
    expect(pos(tomados, 'pub.')).toBe(-1);
    expect(pos(tomados, 'obra.geotecnia')).toBeLessThan(pos(tomados, 'obra.descripcionSistema'));
    expect(pos(tomados, 'obra.descripcionSistema')).toBeLessThan(pos(tomados, 'obra.forjados'));
    expect(pos(tomados, 'obra.forjados')).toBeGreaterThan(-1);
  });
});
