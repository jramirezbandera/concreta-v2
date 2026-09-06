/**
 * De los datos ensamblados a los bloques del documento: la ficha entera como
 * `Block[]`, apartado a apartado, en el orden y con los rótulos de la ficha
 * colegial (JS-662).
 *
 * Aquí sólo se COMPONE: los valores vienen resueltos y etiquetados de
 * `ensamblar.ts`, y los textos fijos de `plantilla.ts`. Un valor sin resolver
 * imprime «—»: la exportación ya está bloqueada por sus huecos, y esto es
 * para que los tests y la pantalla puedan componer siempre.
 *
 * Los apartados que no proceden no aparecen —como hace la ficha colegial, que
 * suprime el 3.1.8 y el 3.1.9 en vez de dejarlos con una coletilla— y el
 * índice de la primera página dice «No procede» en su fila.
 *
 * La numeración va en el texto de los encabezados (3.1.5.1, 3.1.6.2…), no la
 * pone Word: el índice Procede / No procede los referencia por su número, y
 * los forjados se renumeran consecutivos según las tipologías que haya.
 */

import { cuadroAceroEstructural, cuadroCoeficientesMinoracion, cuadroDurabilidadMadera, cuadroMadera, num } from '../materiales/cuadros';
import { DESCRIPCION_CLASE_SERVICIO } from '../materiales/tablasMadera';
import { aceroDesdePub, maderaDesdePub } from './adaptadores';
import type { FichaDatos, Juntas, Tipologia } from './ensamblar';
import type { ApartadoId, Block, Valor } from './model';
import { CE, FORJADOS, FORMULAS, INDICE, NCSE, RD_314, SE, SEA, SEAE, SEC, SEF, SEM, TITULO } from './plantilla';

export interface Apartado {
  id: ApartadoId;
  /** «3.1.4»; el índice no lleva número. */
  numero: string;
  titulo: string;
  procede: boolean;
  bloques: Block[];
}

// ── Ayudantes de composición ────────────────────────────────────────────────

const GUION = '—';

/** El valor de un `Valor`, o «—» si no está resuelto. */
function v<T>(x: Valor<T> | null | undefined, f: (t: NonNullable<T>) => string = String): string {
  return x && x.valor !== null && x.valor !== undefined ? f(x.valor as NonNullable<T>) : GUION;
}

/** Une trozos de frase con un espacio, saltándose los vacíos: sin espacios de más al principio ni al final. */
const frase = (...partes: string[]) => partes.filter((t) => t.trim() !== '').join(' ');

/**
 * Los cuadros del cuadro de materiales traen sus propios encabezados de nivel
 * 2 («MADERA», «COEFICIENTES DE MINORACIÓN»); dentro de la ficha son
 * subapartados, así que bajan a nivel 3.
 */
const rebajar = (bs: Block[]): Block[] => bs.map((b) => (b.kind === 'heading' && b.level < 3 ? { ...b, level: 3 } : b));

const h2 = (text: string): Block => ({ kind: 'heading', level: 2, text });
const h3 = (text: string): Block => ({ kind: 'heading', level: 3, text });
const p = (text: string): Block => ({ kind: 'paragraph', text });
const kv = (rows: [string, string][], caption?: string): Block => ({ kind: 'kvTable', rows, ...(caption ? { caption } : {}) });
const tabla = (head: string[], rows: string[][], caption?: string): Block => ({ kind: 'table', head, rows, ...(caption ? { caption } : {}) });

/** Una lista dentro de una celda: sin saltos de línea (los renderers no los tienen), con punto y coma. */
const lista = (items: readonly string[]) => items.join('; ');


// ── Índice ──────────────────────────────────────────────────────────────────

const PROCEDE_DE_NUMERO: Record<string, ApartadoId> = {
  '3.1.1': 'se',
  '3.1.2': 'seae',
  '3.1.3': 'sec',
  '3.1.4': 'ncse',
  '3.1.5': 'ce',
  '3.1.7': 'sea',
  '3.1.8': 'sef',
  '3.1.9': 'sem',
};

function bloquesIndice(d: FichaDatos): Block[] {
  const fila = (x: { doc: string; numero: string; titulo: string }) => [x.doc, x.numero, x.titulo, d.procede[PROCEDE_DE_NUMERO[x.numero]] ? INDICE.procede : INDICE.noProcede];
  return [
    h3(INDICE.rotulo),
    p(INDICE.intro),
    tabla([...INDICE.cabecera], INDICE.documentos.map(fila)),
    p(INDICE.intro2),
    tabla([...INDICE.cabecera], INDICE.normativa.map(fila)),
    h3(RD_314.titulo),
    p(RD_314.subtitulo),
    ...RD_314.parrafos.map(p),
  ];
}

// ── 3.1.1 ───────────────────────────────────────────────────────────────────

function bloquesSE(d: FichaDatos): Block[] {
  return [
    h3(SE.bloque),
    kv([[SE.proceso.rotulo, lista(SE.proceso.pasos)]]),
    tabla([SE.situaciones.rotulo, ''], SE.situaciones.filas.map((f) => [...f])),
    kv([
      [SE.periodoServicio.rotulo, v(d.se.periodoServicio, (a) => SE.periodoServicio.texto(a))],
      [SE.metodo.rotulo, SE.metodo.texto],
      [SE.definicion.rotulo, SE.definicion.texto],
      [SE.elu.rotulo, `${SE.elu.titulo} ${SE.elu.texto} ${lista(SE.elu.items)}`],
      [SE.els.rotulo, `${SE.els.titulo}: ${SE.els.texto} ${lista(SE.els.items)}`],
    ]),
    h3(SE.acciones.bloque),
    tabla([SE.acciones.rotulo, ''], SE.acciones.filas.map((f) => [...f])),
    kv([
      [SE.acciones.valores.rotulo, SE.acciones.valores.texto],
      [SE.acciones.geometria.rotulo, SE.acciones.geometria.texto],
      [SE.acciones.materiales.rotulo, SE.acciones.materiales.texto],
      [SE.acciones.modelo.rotulo, d.se.modeloAnalisis],
    ]),
    h3(SE.estabilidad.rotulo),
    kv([[SE.estabilidad.formula, lista(SE.estabilidad.leyenda)]]),
    h3(SE.resistencia.rotulo),
    kv([[SE.resistencia.formula, lista(SE.resistencia.leyenda)]]),
    h3(SE.combinacion.rotulo),
    p(SE.combinacion.texto),
    h3(SE.aptitud.rotulo),
    p(SE.aptitud.texto),
    kv([
      [SE.flechas.rotulo, SE.flechas.texto(d.se.flechaActiva)],
      [SE.desplome.rotulo, SE.desplome.texto(d.se.desplome)],
    ]),
  ];
}

// ── 3.1.2 ───────────────────────────────────────────────────────────────────

function bloquesSEAE(d: FichaDatos): Block[] {
  const c = SEAE.variables.climaticas;
  const viento = d.seae.viento.valor;
  const fraseViento = viento ? c.viento.zona(viento.lugar, viento.zona, num(viento.vb)) : GUION;
  const nieve = d.seae.nieve.valor;
  const textoViento = `${c.viento.titulo} ${c.viento.intro} ${c.viento.presion} ${fraseViento} ${c.viento.cierre}`;
  const textoNieve = `${c.nieve.titulo} ${c.nieve.texto}${nieve ? ` ${c.nieve.valor(nieve.lugar, String(nieve.zona), num(nieve.sk, 2))}` : ''}`;
  const climaticas = `${textoViento} ${c.temperatura.titulo} ${c.temperatura.texto} ${textoNieve}`;

  const niveles = d.seae.niveles.valor ?? [];
  const hayNieve = niveles.some((n) => n.nieve !== null);
  const cabecera = SEAE.niveles.cabecera.filter((col) => hayNieve || col !== 'Nieve');
  const filas = niveles.map((n) => (hayNieve ? [n.nivel, n.uso, n.pp, n.resto, n.nieve ?? GUION, n.total] : [n.nivel, n.uso, n.pp, n.resto, n.total]));

  return [
    tabla([SEAE.permanentes.rotulo, ''], SEAE.permanentes.filas.map((f) => [...f])),
    tabla(
      [SEAE.variables.rotulo, ''],
      [
        [SEAE.variables.uso.rotulo, SEAE.variables.uso.texto],
        [c.rotulo, climaticas],
        [SEAE.variables.quimicas.rotulo, SEAE.variables.quimicas.texto],
        [SEAE.variables.accidentales.rotulo, SEAE.variables.accidentales.texto],
      ],
    ),
    h3(SEAE.niveles.titulo),
    p(SEAE.niveles.intro),
    ...(filas.length > 0 ? [tabla(cabecera, filas)] : [p(GUION)]),
  ];
}

// ── 3.1.3 ───────────────────────────────────────────────────────────────────

function bloquesSEC(d: FichaDatos): Block[] {
  const g = d.sec.geotecnia;
  const r = SEC.geotecnia.rotulos;
  const pf = SEC.geotecnia.parametros.filas;
  const parametros: [string, string][] = (Object.keys(pf) as (keyof typeof pf)[]).map((k) => [`${SEC.geotecnia.parametros.rotulo} ${pf[k]}`, v(g[k])]);
  const cim = d.sec.cimentacion;
  const con = d.sec.contenciones;
  const bloques: Block[] = [
    h3(SEC.bases.bloque),
    kv(SEC.bases.filas.map((f) => [...f] as [string, string])),
    h3(SEC.geotecnia.bloque),
    kv([
      [SEC.geotecnia.generalidades.rotulo, SEC.geotecnia.generalidades.texto],
      [r.empresa, v(g.empresa)],
      [r.autores, v(g.autores)],
      [r.titulacion, v(g.titulacion)],
      [r.sondeos, v(g.sondeos)],
      [r.descripcionTerrenos, v(g.descripcionTerrenos)],
      ...parametros,
    ]),
    h3(SEC.cimentacion.bloque),
    kv([
      [SEC.cimentacion.rotulos.descripcion, v(cim.descripcion)],
      [SEC.cimentacion.rotulos.material, v(cim.material)],
      [SEC.cimentacion.rotulos.dimensiones, cim.dimensiones],
      [SEC.cimentacion.rotulos.ejecucion, cim.ejecucion],
    ]),
  ];
  if (con.existen.valor) {
    bloques.push(
      h3(SEC.contenciones.bloque),
      kv([
        [SEC.cimentacion.rotulos.descripcion, v(con.descripcion)],
        [SEC.cimentacion.rotulos.material, v(con.material)],
        [SEC.cimentacion.rotulos.dimensiones, cim.dimensiones],
        [SEC.cimentacion.rotulos.ejecucion, con.ejecucion],
      ]),
    );
  }
  return bloques;
}

// ── 3.1.4 ───────────────────────────────────────────────────────────────────

function bloquesNCSE(d: FichaDatos): Block[] {
  const r = NCSE.rotulos;
  const s = d.ncse.valor;
  if (!s) return [p(NCSE.rd), kv([[r.clasificacion, GUION], [r.ab, GUION], [r.observaciones, d.ncse.nota ?? GUION]])];
  const filas: [string, string][] = [
    [r.clasificacion, s.clasificacion],
    [r.tipoEstructura, v(s.tipoEstructura)],
    [r.ab, s.ab],
  ];
  if (s.completo === null) {
    filas.push([r.observaciones, frase(s.exencion ?? '', NCSE.textos.exento)]);
  } else {
    const c = s.completo;
    filas.push(
      [r.K, c.K],
      [r.rho, c.rho],
      [r.S, c.S],
      [r.C, c.C],
      [r.ac, c.ac],
      [r.metodo, c.metodo],
      [r.amortiguamiento, c.amortiguamiento],
      [r.periodo, c.periodo],
      [r.modos, c.modos],
      [r.fraccion, c.fraccion],
      [r.ductilidad, c.ductilidad],
      [r.segundoOrden, c.segundoOrden],
      [r.medidas, c.medidas],
    );
  }
  return [p(NCSE.rd), kv(filas)];
}

// ── 3.1.5 ───────────────────────────────────────────────────────────────────

/** La frase de las cargas térmicas según lo que haya de juntas. */
function fraseTermica(j: Juntas): string {
  const t = CE.cargas.termicas;
  if (!j.existen.valor) return j.termicasConsideradas.valor ? t.sinJuntas : t.sinJuntasNiTermicas;
  const n = j.numero.valor ?? 1;
  const juntas = n === 1 ? 'una junta' : `${num(n)} juntas`;
  const sep = j.separacionMax.valor !== null ? num(j.separacionMax.valor) : GUION;
  return j.termicasConsideradas.valor ? t.conJuntasYTermicas(juntas, sep) : `${t.conJuntas(juntas, sep)} ${t.calavera}`;
}

function bloquesCE(d: FichaDatos): Block[] {
  const ce = d.ce;
  const m = ce.memoria;
  const c = CE.cargas;
  const viento = d.seae.viento.valor;
  const cargas = ce.cargas.valor;
  const usos: Block[] = cargas
    ? cargas.usos.map((u) =>
        kv(
          [
            [c.verticales.pesoPropio, u.pp],
            [c.verticales.resto, u.resto],
            [c.verticales.sobrecarga, u.uso],
            ...(u.nieve ? ([[c.verticales.nieve, u.nieve]] as [string, string][]) : []),
          ],
          c.verticales.forjadoUso(u.rotulo),
        ),
      )
    : [p(GUION)];
  const lineales = cargas ? cargas.lineales.map((l) => `${l.concepto}: ${l.gk}`).join('; ') : GUION;

  const mat = ce.materiales.valor ?? [];
  const rm = CE.materiales.rotulos;
  const materiales: Block[] =
    mat.length > 0
      ? mat.map((e) =>
          kv(
            [
              [rm.hormigon, e.hormigon],
              [rm.cemento, e.cemento],
              [rm.arido, e.arido],
              [rm.ac, e.ac],
              [rm.cementoMin, e.cementoMin],
              [rm.fck, e.fck],
              [rm.acero, e.acero],
              [rm.fyk, e.fyk],
              [rm.ubicacion, e.ubicacion],
            ],
            e.ubicacion,
          ),
        )
      : [p(ce.materiales.nota ?? GUION)];

  const co = ce.coeficientes.valor;
  const cc = CE.coeficientes;
  const dur = ce.durabilidad.valor ?? [];
  const rd = CE.durabilidad;
  const lineaRec = (x: (typeof dur)[number]) =>
    x.cnom !== null && x.cmin !== null
      ? rd.recubrimientos.elemento(x.nombre, x.clases, num(x.cmin), num(x.cnom))
      : `${x.nombre}: clase de exposición ${x.clases}; la norma no tabula recubrimiento para esa combinación de clases.`;

  return [
    p(CE.subtitulo),
    h3(CE.estructura.titulo),
    kv([[CE.estructura.rotulo, v(ce.descripcionSistema)]]),
    h3(CE.programa.titulo),
    kv([
      [CE.programa.rotulos.nombre, `${ce.programa.nombre} ${ce.programa.version}`.trim()],
      [CE.programa.rotulos.empresa, `${ce.programa.empresa}. ${ce.programa.domicilio}`],
      [CE.programa.rotulos.descripcion, ce.programa.descripcion],
    ]),
    h3(CE.memoriaCalculo.bloque),
    kv([
      [CE.memoriaCalculo.rotulos.metodo, m.metodo],
      [CE.memoriaCalculo.rotulos.redistribucion, CE.memoriaCalculo.redistribucion(m.redistribucion)],
      [
        CE.memoriaCalculo.rotulos.deformaciones,
        `${CE.memoriaCalculo.cabeceraFlechas[0]} ${m.flechas.total}; ${CE.memoriaCalculo.cabeceraFlechas[1]} ${m.flechas.activa}; ${CE.memoriaCalculo.cabeceraFlechas[2]} ${m.flechas.maxRecomendada}. ${CE.memoriaCalculo.flechasNota}`,
      ],
      [CE.memoriaCalculo.rotulos.cuantias, m.cuantias],
    ]),
    h3(c.titulo),
    kv([
      [c.combinaciones.rotulo, c.combinaciones.texto],
      [c.valores.rotulo, c.valores.texto],
    ]),
    h3(c.verticales.bloque),
    ...usos,
    kv([
      [c.cerramientos, lineales],
      [c.barandillas.rotulo, ce.barandillas],
      [c.viento.rotulo, viento ? c.viento.texto(num(viento.qb, 2), num(viento.vb)) : GUION],
      [c.termicas.rotulo, fraseTermica(ce.juntas)],
      [c.terreno.rotulo, v(ce.sobrecargaTerreno, (q) => c.terreno.texto(num(q)))],
    ]),
    h3(CE.materiales.titulo),
    ...materiales,
    h3(cc.titulo),
    p(co ? cc.intro(co.nivelEjecucion.toLowerCase(), co.nivelHormigon.toLowerCase(), co.nivelAcero.toLowerCase()) : GUION),
    tabla(
      [...cc.cabecera],
      co
        ? [
            [cc.hormigon, cc.minoracion, num(co.gammaC, 2), co.nivelHormigon],
            [cc.acero, cc.minoracion, num(co.gammaS, 2), co.nivelAcero],
            [cc.ejecucion, `${cc.mayoracion} — ${cc.permanentes}`, num(co.gammaG, 2), co.nivelEjecucion],
            [cc.ejecucion, `${cc.mayoracion} — ${cc.variables}`, num(co.gammaQ, 2), co.nivelEjecucion],
          ]
        : [[GUION, GUION, GUION, GUION]],
    ),
    h3(rd.titulo),
    kv([
      [rd.exigidos.rotulo, rd.exigidos.texto],
      [rd.recubrimientos.rotulo, frase(rd.recubrimientos.intro, ...dur.map(lineaRec), rd.recubrimientos.separadores)],
      [rd.cementoMin.rotulo, frase(rd.cementoMin.intro, dur.map((x) => `${x.nombre} (${x.clases}): ${x.cementoMin !== null ? `${num(x.cementoMin)} kg/m³` : GUION}`).join('; '))],
      [rd.cementoMax.rotulo, rd.cementoMax.texto],
      [rd.resistenciaMin.rotulo, frase(rd.resistenciaMin.intro, mat.map((e) => `${e.ubicacion}: ${e.fck}`).join('; '))],
      [rd.agua.rotulo, frase(rd.agua.intro, dur.map((x) => `${x.nombre} (${x.clases}): ${x.acMax !== null ? `≤ ${num(x.acMax, 2)}` : GUION}`).join('; '))],
    ]),
  ];
}

// ── 3.1.6 ───────────────────────────────────────────────────────────────────

function bloquesForjado(t: Tipologia, n: number): Block[] {
  const r = FORJADOS.rotulos;
  const numero = `3.1.6.${n}.`;
  const cm = (x: Valor<number | null> | null) => v(x, (c) => `${num(c)} cm`);
  if (t.tipo === 'chapa' || t.tipo === 'madera' || t.tipo === 'otro') {
    return [h3(`${numero} ${t.titulo}`), p(FORJADOS.otro(t.tipo, num(t.canto), num(t.pp, 2)))];
  }
  const es = t.tipo === 'reticular' ? FORJADOS.reticular : t.tipo === 'unidireccional' ? FORJADOS.unidireccional : FORJADOS.losa;
  const material =
    t.tipo === 'reticular'
      ? t.pieza?.valor && /recuperable/i.test(t.pieza.valor)
        ? FORJADOS.reticular.materialRecuperable
        : FORJADOS.reticular.materialPerdido
      : t.tipo === 'unidireccional'
        ? FORJADOS.unidireccional.material
        : FORJADOS.losa.material;
  const dimensiones: [string, string][] = [[r.cantoTotal, `${num(t.canto)} cm`]];
  if (t.tipo === 'reticular' || t.tipo === 'unidireccional') {
    dimensiones.push(
      [r.capaCompresion, cm(t.capaCompresion)],
      [r.intereje, cm(t.intereje)],
      [r.anchoNervio, cm(t.anchoNervio)],
      [t.tipo === 'reticular' ? r.tipoCaseton : r.tipoBovedilla, v(t.pieza)],
    );
  }
  dimensiones.push([r.hormigonInSitu, t.hormigon ?? GUION], [r.aceroRefuerzos, t.acero ?? GUION], [r.pesoPropio, `${num(t.pp, 2)} kN/m²`]);
  return [
    h3(`${numero} ${t.titulo} (h = ${num(t.canto)} cm)`),
    kv([
      [r.material, material],
      [r.unidades, es.unidades],
    ]),
    kv(dimensiones, r.dimensiones),
    p(es.observaciones),
    tabla(
      [...FORJADOS.cabeceraFlechas],
      [[FORJADOS.flecha(t.flechas.total), FORJADOS.flecha(t.flechas.activa), FORJADOS.flecha(t.flechas.absoluta)]],
    ),
  ];
}

function bloquesForjados(d: FichaDatos): Block[] {
  const tipos = d.forjados.valor ?? [];
  return [p(FORJADOS.intro), ...(tipos.length > 0 ? tipos.flatMap((t, i) => bloquesForjado(t, i + 1)) : [p(GUION)])];
}

// ── 3.1.7 ───────────────────────────────────────────────────────────────────

function frasesJuntas(j: Juntas): string {
  const m = SEA.bases.modelado;
  const partes: string[] = [m.pilaresYVigas];
  if (j.existen.valor) partes.push(m.juntas(j.separacionMax.valor !== null ? num(j.separacionMax.valor) : GUION));
  else partes.push(m.sinJuntas);
  partes.push(j.termicasConsideradas.valor ? m.termicasSi : m.termicasNo);
  if (j.existen.valor && !j.termicasConsideradas.valor) partes.push(m.calavera);
  return partes.join(' ');
}

function bloquesSEA(d: FichaDatos): Block[] {
  const a = d.sea;
  if (!a) return [];
  const b = SEA.bases;
  const t41 = SEA.materiales.tabla41;
  return [
    h3(b.titulo),
    kv([
      [b.criterios.bloque, `${b.criterios.intro} ${a.verificacion}`],
      [b.criterios.estados, `${b.criterios.elu[0]}: ${b.criterios.elu[1]} ${b.criterios.els[0]}: ${b.criterios.els[1]}`],
    ]),
    kv([[b.modelado.bloque, `${b.modelado.texto} ${frasesJuntas(a.juntas)} ${b.modelado.constructivo}`]]),
    kv([
      [b.elu.bloque, `${b.elu.estabilidad} ${FORMULAS.estabilidad}, ${b.elu.leyendaEstabilidad}; ${b.elu.resistencia} ${FORMULAS.resistencia}, ${b.elu.leyendaResistencia}. ${b.elu.segundoOrden}`],
      [b.els.bloque, `${b.els.texto} ${FORMULAS.servicio}, ${b.els.leyenda}`],
      [b.geometria.bloque, b.geometria.texto],
    ]),
    h3(SEA.durabilidad.titulo),
    p(SEA.durabilidad.texto),
    h3(SEA.materiales.titulo),
    kv([[SEA.materiales.rotulo, a.acero.designacion]]),
    tabla([...t41.cabecera], t41.filas.map((f) => [...f]), t41.caption),
    { kind: 'notes', items: [...t41.notas] },
    ...rebajar(cuadroAceroEstructural(aceroDesdePub(a.acero), a.vidaUtilAnios)),
    h3(SEA.analisis.titulo),
    p(SEA.analisis.texto),
    h3(SEA.elu.titulo),
    p(SEA.elu.texto),
    kv([
      [SEA.elu.secciones.intro, lista(SEA.elu.secciones.items)],
      [SEA.elu.barras.intro, lista(SEA.elu.barras.items)],
    ]),
    h3(SEA.els.titulo),
    p(SEA.els.texto),
  ];
}

// ── 3.1.8 ───────────────────────────────────────────────────────────────────

function bloquesSEF(d: FichaDatos): Block[] {
  const f = d.sef;
  if (!f) return [];
  const r = SEF.materiales.rotulos;
  const nmm = (x: Valor<number | null>) => v(x, (n) => `${num(n, 1)} N/mm²`);
  return [
    h3(SEF.bases.titulo),
    p(SEF.bases.texto),
    p(d.sea ? d.sea.verificacion : SEF.bases.programa(d.ce.programa.nombre, d.ce.programa.version, d.ce.programa.empresa, d.ce.programa.domicilio)),
    p(SEF.bases.modelado),
    h3(SEF.durabilidad.titulo),
    p(SEF.durabilidad.texto),
    h3(SEF.materiales.titulo),
    p(SEF.materiales.intro),
    kv([
      [r.pieza, f.piezaEtiqueta ?? GUION],
      [r.fb, nmm(f.fb)],
      [r.fm, nmm(f.fm)],
      [r.fk, nmm(f.fk)],
      [r.categoria, f.categoriaEtiqueta ?? GUION],
      [r.ejecucion, f.ejecucionEtiqueta ?? GUION],
      [r.gammaM, v(f.gammaM, (g) => num(g, 2))],
    ]),
    h3(SEF.analisis.titulo),
    p(SEF.analisis.texto),
    h3(SEF.elu.titulo),
    p(SEF.elu.texto),
    h3(SEF.els.titulo),
    p(SEF.els.texto),
  ];
}

// ── 3.1.9 ───────────────────────────────────────────────────────────────────

function bloquesSEM(d: FichaDatos): Block[] {
  const m = d.sem;
  if (!m) return [];
  const derivaciones = maderaDesdePub(m.madera);
  const clases = m.madera.grupos.map((g) => SEM.bases.claseServicio(g.nombre, String(g.claseServicio), DESCRIPCION_CLASE_SERVICIO[g.claseServicio])).join(' ');
  const laminada = m.madera.grupos.some((g) => g.tipo === 'laminada');
  const maciza = m.madera.grupos.some((g) => g.tipo === 'maciza');
  return [
    h3(SEM.bases.titulo),
    p(SEM.bases.texto),
    p(d.sea ? d.sea.verificacion : SEM.bases.programa(d.ce.programa.nombre, d.ce.programa.version, d.ce.programa.empresa, d.ce.programa.domicilio)),
    p(clases),
    h3(SEM.durabilidad.titulo),
    p(SEM.durabilidad.texto),
    h3(SEM.materiales.titulo),
    p(SEM.materiales.intro),
    ...rebajar(cuadroMadera(derivaciones)),
    ...rebajar(cuadroDurabilidadMadera(derivaciones)),
    ...rebajar(cuadroCoeficientesMinoracion({ maderaLaminada: laminada, maderaMaciza: maciza }, m.resistenciaFuego)),
    h3(SEM.analisis.titulo),
    p(SEM.analisis.texto),
    h3(SEM.elu.titulo),
    p(SEM.elu.texto),
    h3(SEM.els.titulo),
    p(SEM.els.texto),
  ];
}

// ── La ficha ────────────────────────────────────────────────────────────────

export function apartados(d: FichaDatos): Apartado[] {
  const ap = (id: ApartadoId, numero: string, titulo: string, bloques: () => Block[]): Apartado => ({
    id,
    numero,
    titulo,
    procede: d.procede[id],
    bloques: d.procede[id] ? bloques() : [],
  });
  return [
    ap('indice', '', TITULO, () => bloquesIndice(d)),
    ap('se', '3.1.1', SE.titulo, () => bloquesSE(d)),
    ap('seae', '3.1.2', SEAE.titulo, () => bloquesSEAE(d)),
    ap('sec', '3.1.3', SEC.titulo, () => bloquesSEC(d)),
    ap('ncse', '3.1.4', NCSE.titulo, () => bloquesNCSE(d)),
    ap('ce', '3.1.5', CE.titulo, () => bloquesCE(d)),
    ap('forjados', '3.1.6', FORJADOS.titulo, () => bloquesForjados(d)),
    ap('sea', '3.1.7', SEA.titulo, () => bloquesSEA(d)),
    ap('sef', '3.1.8', SEF.titulo, () => bloquesSEF(d)),
    ap('sem', '3.1.9', SEM.titulo, () => bloquesSEM(d)),
  ];
}

/** La ficha entera: título, índice y los apartados que proceden, cada uno bajo su encabezado. */
export function bloquesFicha(d: FichaDatos): Block[] {
  const out: Block[] = [{ kind: 'heading', level: 1, text: TITULO }];
  for (const a of apartados(d)) {
    if (!a.procede) continue;
    if (a.id !== 'indice') out.push(h2(a.titulo));
    out.push(...a.bloques);
  }
  return out;
}
