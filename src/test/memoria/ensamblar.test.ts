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
import { ejemploSeismicState, datosPublicacion as pubSismo, evaluarSismo } from '../../features/seismic-ncse02/state';
import { provinciaPorIne } from '../../lib/acciones/provincias';
import { ZONAS_EOLICAS } from '../../lib/acciones/tablasAE';
import { lookupFk, lookupGammaM } from '../../lib/calculations/masonryWalls';
import { SIN_SOBRES, ensamblar, esDeOtroEmplazamiento, estadoSobre, evaluar, tipologiasDe, type Sobres } from '../../lib/memoria/ensamblar';
import { asegurarForjados, confirmar, estadoPorDefecto, teclear } from '../../lib/memoria/estado';
import { bloqueanExportar } from '../../lib/memoria/huecos';
import { completar, fichaGranada, sobre, sobresGranada, tomarTodo } from './fixtures';

// Los ayudantes viven en `./fixtures`, que es también quien estampa
// `configurado` en los sobres: la marca decide si un sobre sirve, y tenerla en
// dos sitios era pedir que se separaran.

describe('estadoSobre y otro emplazamiento', () => {
  const so = sobre('materiales', {}, { ine: '18087' });
  const sinConfigurar = { ...so, configurado: false };
  it('sin sobre: falta si es obligatorio, derivado si no (viento)', () => {
    expect(estadoSobre(null, false, false, true)).toBe('falta');
    expect(estadoSobre(null, false, false, false)).toBe('derivado');
  });
  it('un sobre con los valores de partida del módulo es FALTA, no un dato de esta obra', () => {
    expect(estadoSobre(sinConfigurar, false, false, true)).toBe('falta');
    // Y lo mismo si al sobre le falta la marca entera, que es todo sobre
    // escrito antes de que existiera.
    expect(estadoSobre({ ...so, configurado: undefined }, false, false, true)).toBe('falta');
  });
  it('configurado y del mismo sitio se usa sin preguntar: ya no hay nada que «tomar»', () => {
    expect(estadoSobre(so, false, false, true)).toBe('derivado');
  });
  it('de otra provincia: FALTA si la memoria lo necesita (E12), y darlo por bueno lo desbloquea', () => {
    // Un sismo de Granada no se puede imprimir en una memoria de Sevilla, y lo
    // que no se imprime bloquea. Del 12 al 13 de septiembre fue «revisar», y
    // eso dejaba exportar con la tabla sísmica en guiones.
    expect(estadoSobre(so, false, true, true)).toBe('falta');
    expect(estadoSobre(so, true, true, true)).toBe('derivado');
  });
  it('de otra provincia y OPCIONAL: revisar, porque la ficha imprime lo de la provincia y no el sobre', () => {
    expect(estadoSobre(so, false, true, false)).toBe('revisar');
    expect(estadoSobre(so, true, true, false)).toBe('derivado');
  });
  it('y un sobre calculado sobre otro que ha cambiado después: revisar, y se desbloquea igual', () => {
    // Es el caso de incendio: la R sale de la altura de evacuación, y ésta de
    // las plantas de «Cargas por planta». Si allí se publica algo después, el
    // sobre de incendio queda fresco de fecha y viejo de contenido.
    expect(estadoSobre(so, false, false, false, true)).toBe('revisar');
    expect(estadoSobre(so, true, false, false, true)).toBe('derivado');
    // Sin desfasar sigue entrando sin preguntar.
    expect(estadoSobre(so, false, false, false, false)).toBe('derivado');
  });

  it('darlo por bueno también desbloquea los valores de partida: «son los de esta obra»', () => {
    expect(estadoSobre(sinConfigurar, true, false, true)).toBe('derivado');
  });
  it('otro emplazamiento sólo cuando las dos provincias se conocen y difieren', () => {
    expect(esDeOtroEmplazamiento(so, undefined, '18')).toBe(false);
    expect(esDeOtroEmplazamiento(so, undefined, '29')).toBe(true);
    expect(esDeOtroEmplazamiento(so, undefined, '')).toBe(false);
    expect(esDeOtroEmplazamiento(sobre('x', {}, { ine: null }), undefined, '29')).toBe(false);
    // El de sismo lleva su propio INE dentro de los datos, que manda sobre el del sobre.
    expect(esDeOtroEmplazamiento(so, '29067', '18')).toBe(true);
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
    const m = ensamblar(estadoPorDefecto({ denominacion: '', municipio: 'Málaga', provincia: '29', altitud: 10, uso: '' }), SIN_SOBRES);
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

  it('se usan tal cual: la ficha ya no pide aceptarlos uno a uno', () => {
    const d = ensamblar(fichaGranada(), sobres);
    // Los tres de Granada entran solos: están configurados y son de aquí.
    expect(d.fuentes.materiales.estado).toBe('derivado');
    expect(d.fuentes.cargasPlanta.estado).toBe('derivado');
    expect(d.fuentes.sismo.estado).toBe('derivado');
    expect(d.ncse.estado).not.toBe('falta');
    expect(d.seae.niveles.estado).not.toBe('falta');

    // El de viento NO, y es el caso que justifica que quede un aviso: el
    // fixture lo calcula en Aranda de Duero (Burgos) sobre una ficha de
    // Granada, y la zona eólica de uno no vale para el otro.
    expect(d.fuentes.vientoNieve.estado).toBe('revisar');
    expect(d.fuentes.vientoNieve.otroEmplazamiento).toBe(true);
    expect(d.seae.viento.origen).toBe('norma');
  });

  it('un sobre SIN CONFIGURAR sí falta, y el viento cae a la provincia diciéndolo', () => {
    const arranque: Sobres = {
      ...sobres,
      materiales: { ...sobres.materiales!, configurado: false },
      vientoNieve: { ...sobres.vientoNieve!, configurado: false },
    };
    const d = ensamblar(fichaGranada(), arranque);
    expect(d.fuentes.materiales.estado).toBe('falta');
    expect(d.fuentes.materiales.nota).toContain('valores de partida');
    expect(d.seae.viento.origen).toBe('norma');
    expect(d.seae.viento.nota).toContain('no se usa');
  });

  it('dados por buenos, todo lo derivado se resuelve', () => {
    const d = ensamblar(tomarTodo(fichaGranada(), sobres), sobres);
    for (const f of Object.values(d.fuentes)) expect(f.estado, f.modulo).toBe('derivado');
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
    for (const campo of ['intereje', 'anchoNervio', 'capaCompresion', 'recuperable', 'pieza']) c = confirmar(c, `obra.forjados.${ret.clave}.${campo}`);
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
    const s = { ...ejemploSeismicState(), ab: 0.02 };
    const sobres: Sobres = { ...SIN_SOBRES, sismo: sobre('sismo', pubSismo(s, evaluarSismo(s)), { ine: '18087' }) };
    const d = ensamblar(tomarTodo(fichaGranada(), sobres), sobres);
    expect(d.ncse.estado).toBe('derivado');
    expect(d.ncse.valor!.obligatoria).toBe(false);
    expect(d.ncse.valor!.completo).toBeNull();
    expect(d.ncse.valor!.exencion).toContain('0,04');
  });

  it('irregular y calculado por ordenador: la tabla sísmica SALE, con lo que aporta cada uno', () => {
    // El caso que dejaba el apartado 3.1.4 en blanco hasta el 2026-09-15: un
    // edificio que no pasa el art. 3.5.1 y cuya acción sísmica calcula CypeCAD.
    const s = { ...ejemploSeismicState(), metodo: 'programa' as const, regularidadGeometrica: false };
    const pub = pubSismo(s, evaluarSismo(s));
    expect(pub.calculo).toBeNull();
    const sobres: Sobres = { ...SIN_SOBRES, sismo: sobre('sismo', pub, { ine: '18087' }) };
    const d = ensamblar(tomarTodo(fichaGranada(), sobres), sobres);

    expect(d.ncse.estado).toBe('derivado');
    const c = d.ncse.valor!.completo!;
    // El emplazamiento entero, igual que en la vía simplificada.
    expect(d.ncse.valor!.ab).toBe('ab=0,23 g, (siendo g la aceleración de la gravedad)');
    expect(c.K).toBe('K=1,00');
    expect(c.C).toBe('Terreno tipo II (C=1,30)');
    expect(c.ac).toMatch(/^ac = S·ρ·ab = /);
    expect(c.ductilidad).toBe('μ = 3 (ductilidad alta)');
    // El método nombra el programa del perfil del despacho y dice por qué.
    expect(c.metodo).toContain('art. 3.6.2');
    expect(c.metodo).toContain('Cypecad Espacial V2022 (Cype Ingenieros)');
    expect(c.metodo).toContain('no se cumplen los requisitos (3)');
    // Y lo que sólo puede decir el programa, remitido a sus listados.
    expect(c.periodo).toContain('listados');
    expect(c.modos).toContain('listados');
    expect(c.fraccion).toContain('art. 3.2');
  });

  it('por ordenador con los seis requisitos en cumple: se dice que se eligió, no que no valiera', () => {
    const s = { ...ejemploSeismicState(), metodo: 'programa' as const };
    const sobres: Sobres = { ...SIN_SOBRES, sismo: sobre('sismo', pubSismo(s, evaluarSismo(s)), { ine: '18087' }) };
    const c = ensamblar(tomarTodo(fichaGranada(), sobres), sobres).ncse.valor!.completo!;
    expect(c.metodo).toContain('sería aplicable, pero no se emplea');
  });

  it('obligatorio pero sin cálculo (una declaración sin hacer): falta, y el hueco lleva al módulo', () => {
    const s = { ...ejemploSeismicState(), regularidadGeometrica: null };
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

describe('otro emplazamiento: bloquea lo que la memoria necesita (E12), avisa lo opcional', () => {
  const malaga = () => estadoPorDefecto({ denominacion: 'Bloque', municipio: 'Málaga', provincia: '29', altitud: 10, uso: 'Viviendas' });

  it('el sobre de sismo de Granada en una ficha de Málaga es FALTA, y darlo por bueno lo resuelve', () => {
    const sobres = sobresGranada();
    const d = ensamblar(malaga(), sobres);
    expect(d.fuentes.sismo.otroEmplazamiento).toBe(true);
    expect(d.fuentes.sismo.configurado).toBe(true);
    expect(d.fuentes.sismo.nota).toContain('en otro sitio');
    expect(d.fuentes.sismo.estado).toBe('falta');
    const t = ensamblar(tomarTodo(malaga(), sobres), sobres);
    expect(t.fuentes.sismo.estado).toBe('derivado');
    expect(t.fuentes.sismo.otroEmplazamiento).toBe(true);
  });

  it('y bloquea exportar, con la publicación en la lista de faltas', () => {
    // Del 12 al 13-09-2026 el sobre quedaba en «revisar» (no bloquea) y, como
    // no se imprime, el capítulo caía a `faltaDeSobre()` con el MISMO id que la
    // fuente: la cola deduplica por id, se quedaba con el ámbar y la falta
    // desaparecía. Se podía exportar con la tabla sísmica en guiones.
    const sobres = sobresGranada();
    const ev = evaluar(malaga(), sobres);
    const pubs = ev.huecos.filter((h) => h.id.startsWith('pub.'));
    expect(bloqueanExportar(pubs)).toBe(true);
    const faltas = pubs.filter((h) => h.estado === 'falta').map((h) => h.id);
    expect(faltas).toEqual(expect.arrayContaining(['pub.sismo', 'pub.materiales', 'pub.cargasPlanta']));
    // La salida que declara el hueco es darlo por bueno, no volver a publicar:
    // el sobre está calculado, lo que no está es en esta provincia.
    for (const h of pubs.filter((x) => x.estado === 'falta')) expect(h.accion, h.id).toBe('usarPublicado');
    // El viento no: la ficha imprime la zona de Málaga, que es correcta.
    expect(faltas).not.toContain('pub.vientoNieve');
    expect(ev.datos.fuentes.vientoNieve.estado).toBe('revisar');

    // Dados por buenos los cuatro, la ficha se deja completar y exportar.
    const hecha = evaluar(completar(malaga(), sobres), sobres);
    expect(hecha.listo).toBe(true);
    expect(hecha.huecos).toEqual([]);
  });

  it('cambiar la provincia de la ficha después de aceptar devuelve el sobre a falta', () => {
    const sobres = sobresGranada();
    const s = tomarTodo(fichaGranada(), sobres);
    expect(ensamblar(s, sobres).fuentes.materiales.estado).toBe('derivado');
    // La provincia ya no se teclea en la ficha: es de `concreta-obra`, y la
    // ficha la refleja. Mover la obra es cambiarla ahí.
    const movida = { ...s, datosObra: { ...s.datosObra!, provincia: '29' } };
    expect(ensamblar(movida, sobres).fuentes.materiales.estado).toBe('falta');
  });

  it('republicar lo MISMO no reabre el aviso; republicar otra cosa sí', () => {
    // Era el ruido del viejo «revisar»: volver a entrar en un módulo bastaba
    // para que la ficha pidiera confirmar otra vez lo mismo. La huella mira el
    // resultado, no la fecha.
    const sobres = sobresGranada();
    const s = tomarTodo(malaga(), sobres);
    expect(ensamblar(s, sobres).fuentes.sismo.estado).toBe('derivado');

    const otraFecha: Sobres = { ...sobres, sismo: { ...sobres.sismo!, ts: '2026-09-07T08:00:00.000Z' } };
    expect(ensamblar(s, otraFecha).fuentes.sismo.estado).toBe('derivado');

    const otroResultado: Sobres = { ...sobres, sismo: { ...sobres.sismo!, datos: { ...sobres.sismo!.datos, ab: 0.19 } } };
    expect(ensamblar(s, otroResultado).fuentes.sismo.estado).toBe('falta');
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
    // `completar` es ese mismo bucle, y lanza si un hueco no tiene salida.
    const sobres = sobresGranada();
    const ev = evaluar(completar(fichaGranada(), sobres), sobres);
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
