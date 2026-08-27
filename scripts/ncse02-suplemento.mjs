/**
 * Suplemento del Anejo 1 de la NCSE-02: lo que la capa del IGN no basta para
 * resolver. Lo consume `harvest-ign-hazard.mjs` al escribir el dataset.
 *
 * ---------------------------------------------------------------------------
 * POR QUE EXISTE ESTE FICHERO
 * ---------------------------------------------------------------------------
 * El barrido del WMS cosecha la capa entera sin un solo hueco (la auditoria de
 * `gid` lo demuestra), y aun asi el dataset resultante NO es el Anejo 1. Dos
 * razones, las dos comprobadas contra el texto legal:
 *
 *   1. La capa no le pone aceleracion a seis municipios que el Anejo 1 SI
 *      lista, Ceuta y Melilla entre ellos.
 *   2. El Anejo 1 se escribio con los limites municipales de 2002. Los 28
 *      municipios segregados despues no figuran en el, porque no existian.
 *
 * En los dos casos el sintoma en la aplicacion era el mismo y era el peor
 * posible: el buscador no encontraba el municipio, y el mensaje de "no figura
 * en el Anejo 1" se leia como "la Norma no es de aplicacion". Un hueco de
 * datos disfrazado de exencion normativa.
 *
 * ---------------------------------------------------------------------------
 * DE DONDE SALEN ESTOS NUMEROS
 * ---------------------------------------------------------------------------
 * Del BOE, no de una fuente secundaria. El PDF de paginas del BOE (a diferencia
 * del texto consolidado en HTML, que en el lugar del anejo solo dice "VER
 * IMAGENES") tiene capa de texto extraible, asi que el Anejo 1 se pudo leer
 * entero y contrastar municipio a municipio contra la cosecha:
 *
 *   BOE num. 244 de 11/10/2002, RD 997/2002, paginas 35949-35967
 *   https://www.boe.es/boe/dias/2002/10/11/pdfs/A35898-35967.pdf
 *
 * Los codigos INE son los del registro oficial del INE a 1 de enero de 2002
 * —el vigente cuando se publico la Norma—, no una deduccion:
 *
 *   https://www.ine.es/daco/daco42/codmun/codmun02/02codmun.xls   (8.108 municipios)
 *
 * El contraste completo BOE <-> capa dio: 2.615 entradas en el anejo frente a
 * 2.610 filas cosechadas, con las diferencias resueltas una a una. La inmensa
 * mayoria eran cambios de denominacion oficial posteriores a 2002 (Orcoyen ->
 * Orkoien, Urroz -> Urroz-Villa, San Jose -> Sant Josep de sa Talaia...) o
 * artefactos de la maquetacion a dos columnas del PDF, y NO discrepancias. Lo
 * que queda es lo que hay en este fichero.
 *
 * ---------------------------------------------------------------------------
 * COMO SE MANTIENE
 * ---------------------------------------------------------------------------
 * El harvester avisa cuando una fila de aqui deja de hacer falta: si el IGN
 * republica la capa con Ceuta ya rellena, o con el K de Benalup corregido, el
 * resumen del barrido lo canta y esa entrada se poda. Lo que no puede detectar
 * solo es una segregacion nueva: la pagina de modificaciones del INE hay que
 * mirarla a mano una vez al ano.
 *
 *   https://www.ine.es/daco/daco42/codmun/codmun_anual.htm
 */

/**
 * Municipios que el Anejo 1 lista con `ab` y la capa del IGN no resuelve.
 *
 * `enLaCapa` distingue los dos sintomas, porque se arreglan distinto si el IGN
 * republica: `null` = la fila NO EXISTE en la capa; una cadena = la fila existe
 * con ese nombre pero con `aceleracion = null`.
 *
 * Ceuta y Melilla son el caso mas claro de por que fallaron: el Anejo 1 las
 * pone al final del listado como entradas sueltas, DESPUES de Guipuzcoa y
 * fuera de cualquier bloque `PROVINCIA DE ...`. Cualquier proceso que indexe
 * por provincia las pierde. Y Melilla cae justo en el umbral que decide: con
 * `ab = 0,08 g` exactamente NO le vale la exencion de porticos arriostrados
 * del art. 1.2.3, que pide `ab < 0,08 g`.
 */
export const MUNICIPIOS_AUSENTES_DE_LA_CAPA = [
  {
    ine: '06005',
    nombre: 'Albuera (La)',
    ab: 0.05,
    k: 1.3,
    enLaCapa: null,
    boe: 'ALBUERA, LA 0,05 (1,3) · PROVINCIA DE BADAJOZ',
  },
  {
    ine: '20905',
    nombre: 'Orendain',
    ab: 0.04,
    k: 1.0,
    enLaCapa: 'Orendain',
    // La capa le da el dato a Altzaga (20906) y deja Orendain a null; el Anejo
    // 1 lista Orendain y no lista Altzaga. Son municipios distintos.
    boe: 'ORENDAIN 0,04 (1,0) · PROVINCIA DE GUIPUZCOA',
  },
  {
    ine: '22106',
    nombre: 'Fago',
    ab: 0.05,
    k: 1.0,
    enLaCapa: null,
    boe: 'FAGO 0,05 (1,0) · PROVINCIA DE HUESCA',
  },
  {
    ine: '31144',
    nombre: 'Larraun',
    ab: 0.04,
    k: 1.0,
    enLaCapa: 'Larraun',
    // Mismo patron que Orendain: la capa da el dato a Lekunberri (31908), que
    // se segrego de Larraun en 1998 y que el Anejo 1 no nombra.
    boe: 'LARRAUN 0,04 (1,0) · PROVINCIA DE NAVARRA',
  },
  {
    ine: '51001',
    nombre: 'Ceuta',
    ab: 0.05,
    k: 1.2,
    enLaCapa: 'Ceuta',
    boe: 'CIUDAD DE CEUTA 0,05 (1,2) · final del anejo, fuera de provincia',
  },
  {
    ine: '52001',
    nombre: 'Melilla',
    ab: 0.08,
    k: 1.0,
    enLaCapa: 'Melilla',
    boe: 'CIUDAD DE MELILLA 0,08 (1,0) · final del anejo, fuera de provincia',
  },
];

/**
 * Filas en las que la capa del IGN contradice al texto legal.
 *
 * Solo hay una, y no es inocua. La capa publica `K = 1,4` para Benalup-Casas
 * Viejas; el Anejo 1 dice `(1,2)`. Comprobado dos veces:
 *
 *   · En el texto del BOE, en la secuencia alfabetica limpia de Cadiz:
 *     ALCALA DE LOS GAZULES 0,05 (1,2) / BARBATE 0,05 (1,2) /
 *     BENALUP CASAS VIEJAS 0,05 (1,2) / CHICLANA 0,05 (1,3)
 *   · Barriendo TODO el anejo: los unicos valores de K que emplea la Norma son
 *     1,0 · 1,1 · 1,2 · 1,3. El 1,4 no aparece ni una vez en la NCSE-02.
 *
 * K entra en T_A = K·C/10 y T_B = K·C/2,5, asi que un K un 16,7 % alto ensancha
 * la meseta del espectro y, por encima de T_B, sube las fuerzas en la misma
 * proporcion. Queda del lado seguro, pero es un numero que no es el de la
 * Norma, y una memoria que lo cite no dice la verdad sobre el edificio.
 */
export const CORRECCIONES_DE_LA_CAPA = [
  {
    ine: '11901',
    nombre: 'Benalup-Casas Viejas',
    capa: { ab: 0.05, k: 1.4 },
    boe: { ab: 0.05, k: 1.2 },
    motivo:
      'La capa publica K = 1,4, valor que no existe en toda la NCSE-02. El ' +
      'Anejo 1 dice (1,2), como sus vecinos de Cadiz.',
  },
];

/**
 * Altas del registro de municipios del INE posteriores al Anejo 1.
 *
 * Verificadas por dos vias independientes que cuadran al municipio: las paginas
 * anuales de modificaciones del INE (2003-2026) y el diff del registro completo
 * entre el 1-1-2002 (8.108 municipios) y el 1-1-2026 (8.132). 28 altas y 4
 * bajas: 8.108 + 28 - 4 = 8.132.
 *
 * HEREDAR DEL PADRE ES EXACTO, NO UNA APROXIMACION. La Norma asigna un unico
 * `ab` y `K` a cada termino municipal de 2002, y ese valor cubria todo el
 * territorio, incluido el trozo que despues se segrego. El municipio nuevo
 * ocupa terreno que el Anejo 1 ya habia clasificado.
 *
 * Y funciona en los dos sentidos: si el padre no llega a 0,04 g y por tanto no
 * esta en el Anejo 1, el hijo tampoco entra, que es la respuesta correcta
 * (El Pinar de El Hierro, Villamayor de Gallego).
 *
 * OJO CON EL RANGO 9xx: tres de las 28 altas usan codigo normal, no 9xx
 * (Dehesas Viejas 18065, Fornes 18077, Jatar 18106), asi que detectar
 * segregaciones por "codigo >= 900" se deja tres fuera. Y las tres son de
 * Granada; dos salen de Arenas del Rey, area epicentral del terremoto de 1884.
 * Por eso la lista es explicita.
 */
export const SEGREGACIONES_POST_2002 = [
  { ine: '46904', nombre: 'Benicull de Xúquer', padres: ['46197'], anio: 2003 },
  { ine: '48915', nombre: 'Ziortza-Bolibar', padres: ['48060'], anio: 2005 },
  { ine: '50903', nombre: 'Villamayor de Gállego', padres: ['50297'], anio: 2006 },
  { ine: '38901', nombre: 'Pinar de El Hierro, El', padres: ['38013'], anio: 2007 },
  { ine: '10902', nombre: 'Vegaviana', padres: ['10128'], anio: 2009 },
  { ine: '10903', nombre: 'Alagón del Río', padres: ['10076'], anio: 2009 },
  { ine: '29902', nombre: 'Villanueva de la Concepción', padres: ['29015'], anio: 2010 },
  { ine: '43907', nombre: 'Canonja, La', padres: ['43148'], anio: 2010 },
  { ine: '06903', nombre: 'Guadiana', padres: ['06015'], anio: 2012 },
  { ine: '10904', nombre: 'Tiétar', padres: ['10180'], anio: 2013 },
  // Fusion: el termino nuevo cubre los dos anteriores.
  { ine: '15902', nombre: 'Oza-Cesuras', padres: ['15026', '15063'], anio: 2013, fusion: true },
  { ine: '18065', nombre: 'Dehesas Viejas', padres: ['18105'], anio: 2014 },
  { ine: '18914', nombre: 'Valderrubio', padres: ['18158'], anio: 2014 },
  { ine: '04904', nombre: 'Balanegra', padres: ['04029'], anio: 2015 },
  { ine: '10905', nombre: 'Pueblonuevo de Miramontes', padres: ['10180'], anio: 2015 },
  { ine: '18106', nombre: 'Játar', padres: ['18020'], anio: 2015 },
  { ine: '29903', nombre: 'Montecorto', padres: ['29084'], anio: 2015 },
  { ine: '29904', nombre: 'Serrato', padres: ['29084'], anio: 2015 },
  { ine: '18915', nombre: 'Domingo Pérez de Granada', padres: ['18105'], anio: 2015 },
  { ine: '36902', nombre: 'Cerdedo-Cotobade', padres: ['36011', '36012'], anio: 2016, fusion: true },
  { ine: '11903', nombre: 'San Martín del Tesorillo', padres: ['11021'], anio: 2018 },
  { ine: '14901', nombre: 'Fuente Carreteros', padres: ['14030'], anio: 2018 },
  { ine: '14902', nombre: 'Guijarrosa, La', padres: ['14060'], anio: 2018 },
  { ine: '18077', nombre: 'Fornes', padres: ['18020'], anio: 2018 },
  { ine: '18916', nombre: 'Torrenueva Costa', padres: ['18140'], anio: 2018 },
  { ine: '21902', nombre: 'Zarza-Perrunal, La', padres: ['21017'], anio: 2018 },
  { ine: '41904', nombre: 'Palmar de Troya, El', padres: ['41095'], anio: 2018 },
  { ine: '48916', nombre: 'Usansolo', padres: ['48036'], anio: 2023 },
];

/**
 * Aplica el suplemento a las filas cosechadas.
 *
 * `cosechadas` son las filas de la capa CON aceleracion, tal como salen del
 * parser: `{ ine, nombre, ab, k }`. Devuelve las filas finales (sin ordenar; de
 * eso se encarga quien escribe), el mapa de procedencia de las que no son
 * cosecha directa, y un informe de lo que hizo, para que el barrido lo imprima.
 *
 * Es idempotente y no muta la entrada.
 */
export function suplementar(cosechadas) {
  // El indice apunta a las COPIAS, no a la entrada: lo que se corrige tiene que
  // acabar en las filas que se escriben, y mutar el original ademas seria un
  // efecto de vuelta sobre quien llama.
  const filas = cosechadas.map((f) => ({ ...f }));
  const porIne = new Map(filas.map((f) => [f.ine, f]));
  const procedencia = {};
  const avisos = [];
  let ausentes = 0;
  let corregidas = 0;
  let heredadas = 0;

  // — 1. Municipios que el Anejo 1 lista y la capa no resuelve —
  for (const m of MUNICIPIOS_AUSENTES_DE_LA_CAPA) {
    const ya = porIne.get(m.ine);
    if (ya) {
      // El IGN ha rellenado el hueco. Si coincide con el BOE, esta entrada
      // sobra; si no coincide, hay que decidirlo a mano y no en silencio.
      if (ya.ab === m.ab && ya.k === m.k) {
        avisos.push(
          `PODAR: ${m.ine} ${m.nombre} ya viene de la capa con los valores del BOE. ` +
            'Quitar de MUNICIPIOS_AUSENTES_DE_LA_CAPA.',
        );
      } else {
        avisos.push(
          `REVISAR: ${m.ine} ${m.nombre} viene de la capa con ab=${ya.ab} K=${ya.k}, ` +
            `y el BOE dice ab=${m.ab} K=${m.k}. Gana el BOE, pero compruebalo.`,
        );
        ya.ab = m.ab;
        ya.k = m.k;
        procedencia[m.ine] = { tipo: 'anejo1-texto', boe: m.boe };
      }
      continue;
    }
    filas.push({ ine: m.ine, nombre: m.nombre, ab: m.ab, k: m.k });
    procedencia[m.ine] = { tipo: 'anejo1-texto', boe: m.boe };
    ausentes++;
  }

  // — 2. Filas en las que la capa contradice al texto legal —
  for (const c of CORRECCIONES_DE_LA_CAPA) {
    const fila = filas.find((f) => f.ine === c.ine);
    if (!fila) {
      avisos.push(`REVISAR: la correccion de ${c.ine} ${c.nombre} no encuentra su fila en la capa.`);
      continue;
    }
    if (fila.ab === c.boe.ab && fila.k === c.boe.k) {
      avisos.push(
        `PODAR: ${c.ine} ${c.nombre} ya viene de la capa con el valor del BOE. ` +
          'Quitar de CORRECCIONES_DE_LA_CAPA.',
      );
      continue;
    }
    if (fila.ab !== c.capa.ab || fila.k !== c.capa.k) {
      avisos.push(
        `REVISAR: ${c.ine} ${c.nombre} venia de la capa con ab=${c.capa.ab} K=${c.capa.k} ` +
          `cuando se escribio la correccion, y ahora trae ab=${fila.ab} K=${fila.k}. ` +
          'El IGN ha cambiado la capa: reconfirma contra el BOE antes de seguir corrigiendo.',
      );
    }
    fila.ab = c.boe.ab;
    fila.k = c.boe.k;
    procedencia[c.ine] = { tipo: 'correccion', motivo: c.motivo };
    corregidas++;
  }

  // — 3. Segregaciones posteriores al Anejo 1 —
  const finalPorIne = new Map(filas.map((f) => [f.ine, f]));
  for (const s of SEGREGACIONES_POST_2002) {
    if (finalPorIne.has(s.ine)) {
      avisos.push(
        `PODAR: ${s.ine} ${s.nombre} ya viene de la capa. ` +
          'El IGN ha actualizado los limites municipales; quitar de SEGREGACIONES_POST_2002.',
      );
      continue;
    }
    const padres = s.padres.map((p) => finalPorIne.get(p));
    // Un padre fuera del Anejo 1 no es un fallo: significa que el territorio
    // esta por debajo de 0,04 g, y el hijo queda exento igual que el padre.
    const conDato = padres.filter(Boolean);
    if (conDato.length === 0) continue;
    if (s.fusion && conDato.length < s.padres.length) {
      // Fusion con un solo padre en el Anejo 1: se hereda de ese, que es el
      // unico que clasifica territorio, pero conviene saberlo.
      avisos.push(
        `NOTA: ${s.ine} ${s.nombre} es fusion de ${s.padres.length} municipios y solo ` +
          `${conDato.length} esta(n) en el Anejo 1. Hereda del que si esta.`,
      );
    }
    // Con dos padres manda el mas desfavorable: el termino nuevo cubre ambos.
    const elegido = conDato.reduce((a, b) => (b.ab > a.ab ? b : a));
    filas.push({ ine: s.ine, nombre: s.nombre, ab: elegido.ab, k: elegido.k });
    procedencia[s.ine] = {
      tipo: 'segregado',
      padre: { ine: elegido.ine, nombre: elegido.nombre },
      anio: s.anio,
      ...(s.fusion ? { fusion: true } : {}),
    };
    heredadas++;
  }

  return {
    filas,
    procedencia,
    informe: { ausentes, corregidas, heredadas, avisos },
  };
}
