#!/usr/bin/env node
/**
 * Cosecha el Anejo 1 de la NCSE-02 (aceleracion sismica basica `ab` y coeficiente
 * de contribucion `K` por municipio) desde la capa INSPIRE del IGN, y escribe el
 * dataset que consume `features/seismic-ncse02/hazard.ts`.
 *
 *   node scripts/harvest-ign-hazard.mjs                  barrido completo
 *   node scripts/harvest-ign-hazard.mjs --resume         continua desde la cache
 *   node scripts/harvest-ign-hazard.mjs --region canarias
 *   node scripts/harvest-ign-hazard.mjs --solo-escribir  reescribe desde la cache
 *
 * Script DE DESARROLLO, no de build. El dataset que produce se commitea; este
 * fichero solo se ejecuta cuando hay que regenerarlo.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTE BARRIDO ES ASI (leer antes de "simplificarlo")
 * ---------------------------------------------------------------------------
 * El IGN NO publica esta capa como descarga ni como WFS. Solo hay WMS, y la
 * unica via de leer atributos es GetFeatureInfo. Verificado el 2026-08-26:
 *
 *   - `wfs-inspire/geofisica`, `wfs/geofisica`, `geoserver/wfs` -> 404
 *   - el registro CSW del dataset no declara servicio de descarga
 *   - `application/json` SI esta entre los formatos de GetFeatureInfo, y devuelve
 *     ademas LA GEOMETRIA, que es lo que hace viable este barrido
 *
 * GetFeatureInfo pasa por el pipeline de RENDERIZADO. Un elemento se devuelve
 * solo si su geometria, generalizada a la escala de la peticion, llega a pintar
 * el pixel consultado. Consecuencias medidas, no supuestas:
 *
 *   - Pedir toda Espana en una imagen de 1x1 devuelve 339 municipios de ~8.100,
 *     y NO son "los primeros": son los que sobreviven a la generalizacion.
 *   - Subdividir NO es monotono. Sobre un bbox de Burgos, el bbox entero devolvio
 *     98 municipios y la union de sus cuatro cuadrantes 57, con solo 3 en comun.
 *     Por eso "subdividir hasta que el conjunto deje de crecer" NO es criterio de
 *     parada valido: los conjuntos de escalas distintas son casi disjuntos.
 *   - Excluir lo ya encontrado con `cql_filter` para que aflore el resto NO
 *     funciona: la segunda ronda devuelve cero. Lo que no pinta a una escala no
 *     pinta nunca a esa escala.
 *   - `buffer` viene capado por el servidor (se piden 1024 px y actuan ~6).
 *
 * De ahi la regla que gobierna todo el fichero: **el pixel consultado tiene que
 * ser mas pequeno que el municipio que se busca**. Cada sondeo es un punto a
 * escala fija (PIXEL_GRADOS), nunca una celda grande.
 *
 * ---------------------------------------------------------------------------
 * POR QUE LA COBERTURA VA EN UN RASTER Y NO EN UN MUESTREO DE PUNTOS
 * ---------------------------------------------------------------------------
 * Lo que hace el barrido asequible es que cada respuesta trae el POLIGONO del
 * municipio: al encontrarlo se marca su superficie entera y el arbol solo
 * desciende donde queda hueco.
 *
 * La primera version probaba la cobertura muestreando puntos de la celda. Es 375
 * veces mas barato que la fuerza bruta, pero SE DEJA MUNICIPIOS: contrastado
 * contra un barrido exhaustivo de 7.500 sondeos sobre la vega de Granada, el
 * muestreo perdio Pinos Puente (18158), cuya franja dentro de la celda no
 * contenia ningun punto de prueba. Un barrido con efectos de visado no puede
 * tener un agujero probabilistico.
 *
 * Por eso la cobertura vive en una mascara de bits a RESOLUCION_GRADOS, y el
 * sondeo NO va al centro de la celda: va al PRIMER HUECO real de la mascara. Y
 * de paso la prueba de cobertura es O(1) en vez de recorrer los 8.100 poligonos
 * ya encontrados.
 *
 * La garantia, enunciada sin adornos: **toda celda del raster o se sondea, o
 * cae en un rectangulo cuyo centro y cuyas cuatro esquinas devolvieron "no hay
 * dato"**. Lo segundo es lo que hace asequibles el Atlantico y la frontera. Lo
 * que esa concesion puede perder es una isla entera contenida en un rectangulo
 * de MIN_CELDA que ademas esquive los cinco puntos; los municipios costeros NO
 * se pierden, porque se encuentran desde tierra adentro, donde su poligono ya
 * cubre la franja de costa.
 *
 * Y por encima de la garantia geometrica hay un control independiente que no
 * depende de ninguna de estas decisiones: `gid` es clave serie densa de la capa,
 * asi que los huecos de la secuencia miden al final lo que falta. Si el barrido
 * se dejara algo, el resumen lo canta.
 */

import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { suplementar } from './ncse02-suplemento.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const DESTINO = join(RAIZ, 'src', 'features', 'seismic-ncse02');
const CACHE = join(RAIZ, 'node_modules', '.cache', 'ign-hazard-crudo.json');
const FIXTURES = join(RAIZ, 'src', 'test', 'fixtures');

// --- servicio ---------------------------------------------------------------

const ENDPOINT = 'https://www.ign.es/wms-inspire/geofisica';
const CAPA = 'HazardArea2002.NCSE-02';
const INFO_FORMAT = 'application/json';
/** Sube con cada cambio del parser. Va al manifest y lo comprueba un test. */
const PARSER_VERSION = 1;
const USER_AGENT =
  'concreta-v2-harvest-ign-hazard/1.0 (herramienta de calculo estructural; contacto: jramirezbandera@gmail.com)';

/** Pausa entre peticiones. El IGN es un servicio publico: no se le aprieta. */
const PAUSA_MS = 120;
const REINTENTOS = 4;

// --- geometria del barrido --------------------------------------------------

/**
 * Medio lado del bbox de cada sondeo, en grados. El pixel resultante mide el
 * doble. Tiene que quedar por debajo del municipio mas pequeno de Espana
 * (Emperador, Valencia: 0,03 km2, unos 170 m de lado) o ese municipio no pinta
 * y no se encuentra nunca.
 */
const PIXEL_GRADOS = 0.0005;
/**
 * Lado de celda de la mascara de cobertura. Fija la garantia del barrido: no se
 * escapa ninguna superficie descubierta mayor que esto. 0,001 grados son ~85 m
 * en longitud y ~111 m en latitud a la latitud de Espana.
 */
const RESOLUCION_GRADOS = 0.001;
/**
 * Suelo de subdivision del arbol (~1,5 km). Por debajo, la celda se resuelve
 * sondeando sus huecos en bucle en vez de seguir partiendo.
 */
const MIN_CELDA = 0.016;
/**
 * Lado por encima del cual no se escanea la mascara buscando huecos: se
 * subdivide y punto. Escanear es barato cuando hay hueco (sale al primero), y
 * solo cuesta cuando la celda esta entera cubierta.
 */
const MAX_ESCANEO = 2.0;
/**
 * Sondeos maximos por celda hoja antes de rendirse y seguir. Es un tope de
 * coste, no de correccion: lo que se abandona es agua de una costa recortada,
 * y un municipio con superficie en la hoja se alcanza igual desde la vecina.
 * Si alguna vez se dejara algo, lo canta la auditoria de `gid` del resumen.
 */
const SONDEOS_POR_HOJA = 6;
/**
 * Lado en pixeles de la imagen del oraculo de vacio. Fija la resolucion con la
 * que se decide que una celda no tiene NADA: en la celda mas grande a la que se
 * aplica (MAX_ESCANEO) son unos 800 m.
 */
const TAM_MAPA = 256;

const REGIONES = {
  // Peninsula + Baleares + Ceuta + Melilla en un solo rectangulo.
  peninsula: [-9.6, 35.1, 4.4, 43.9],
  canarias: [-18.3, 27.5, -13.3, 29.5],
};

// --- red --------------------------------------------------------------------

let nPeticiones = 0;
let nReintentos = 0;
let nSondeos = 0;

const esperar = (ms) => new Promise((s) => setTimeout(s, ms));

async function sondear(lon, lat) {
  const cuerpo = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetFeatureInfo',
    layers: CAPA,
    query_layers: CAPA,
    // CRS:84 es lon/lat. EPSG:4326 bajo WMS 1.3.0 seria lat/lon: no cambiar sin
    // repetir la asercion de ejes de comprobarEjes().
    crs: 'CRS:84',
    bbox: [lon - PIXEL_GRADOS, lat - PIXEL_GRADOS, lon + PIXEL_GRADOS, lat + PIXEL_GRADOS].join(','),
    width: '1',
    height: '1',
    i: '0',
    j: '0',
    info_format: INFO_FORMAT,
    feature_count: '50',
  }).toString();

  nSondeos++;
  for (let intento = 0; intento < REINTENTOS; intento++) {
    nPeticiones++;
    try {
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: cuerpo,
      });
      const texto = await r.text();
      await esperar(PAUSA_MS);
      if (!texto.trimStart().startsWith('{')) {
        // El servicio devuelve XML de excepcion en texto plano ante un error.
        throw new Error(`respuesta no JSON: ${texto.replace(/\s+/g, ' ').slice(0, 180)}`);
      }
      return JSON.parse(texto).features ?? [];
    } catch (err) {
      nReintentos++;
      if (intento === REINTENTOS - 1) {
        throw new Error(`sondeo (${lon}, ${lat}) agotado tras ${REINTENTOS} intentos: ${err.message}`);
      }
      await esperar(600 * 2 ** intento);
    }
  }
  return [];
}

// --- oraculo de vacio -------------------------------------------------------

/**
 * "¿Hay ALGO de esta capa dentro de este rectangulo?", en una sola peticion y
 * sin ambiguedad.
 *
 * GetFeatureInfo solo sabe responder por un punto, asi que deducir el vacio de
 * una celda pinchando unos cuantos puntos es un muestreo, y los muestreos se
 * dejan cosas: una celda casi toda mar con un trozo pequeno de costa espanola
 * se daria por agua entera y perderia esos municipios.
 *
 * GetMap si sabe responder por el rectangulo entero. Y no hace falta decodificar
 * el PNG: **una imagen completamente vacia sale byte a byte identica se pida
 * donde se pida**, asi que basta comparar el hash contra el de una zona vacia
 * conocida. Verificado: Atlantico profundo, otro punto del Atlantico e interior
 * de Marruecos devuelven los mismos 1.784 bytes a 256x256; el Estrecho, que es
 * mar con un pedazo de Cadiz, sale distinto; y 2 grados de oceano con una sola
 * isla pequena dentro tambien salen distintos, que es justo el caso que el
 * muestreo fallaba.
 */
let hashVacio = null;
let nMapas = 0;

async function pedirMapa(x0, y0, x1, y1) {
  const u = new URL(ENDPOINT);
  u.search = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: CAPA,
    styles: '',
    crs: 'CRS:84',
    bbox: [x0, y0, x1, y1].join(','),
    width: String(TAM_MAPA),
    height: String(TAM_MAPA),
    format: 'image/png',
    transparent: 'true',
  }).toString();
  for (let intento = 0; intento < REINTENTOS; intento++) {
    nMapas++;
    nPeticiones++;
    try {
      const r = await fetch(u, { headers: { 'User-Agent': USER_AGENT } });
      const b = Buffer.from(await r.arrayBuffer());
      await esperar(PAUSA_MS);
      if (b.length < 8 || b[0] !== 0x89 || b[1] !== 0x50) {
        throw new Error(`respuesta no PNG: ${b.toString('utf8', 0, 160).replace(/\s+/g, ' ')}`);
      }
      return createHash('sha256').update(b).digest('hex');
    } catch (err) {
      nReintentos++;
      if (intento === REINTENTOS - 1) throw new Error(`GetMap agotado: ${err.message}`);
      await esperar(600 * 2 ** intento);
    }
  }
  return '';
}

const estaVacia = async (x0, y0, x1, y1) => (await pedirMapa(x0, y0, x1, y1)) === hashVacio;

/**
 * Fija el hash del vacio contra el servicio, en vez de llevarlo escrito. Y
 * comprueba lo contrario: que una zona con datos NO da ese hash. Sin esa segunda
 * mitad, un servicio que empezara a devolver una imagen uniforme de error haria
 * que todo pareciese vacio y el barrido terminaria en segundos con cero
 * municipios y sin quejarse.
 */
async function calibrarVacio() {
  const vacioA = await pedirMapa(-15.0, 40.0, -13.0, 42.0); // Atlantico profundo
  const vacioB = await pedirMapa(-6.0, 32.0, -4.0, 34.0); // interior de Marruecos
  if (vacioA !== vacioB) {
    throw new Error('dos zonas vacias dan imagenes distintas: el oraculo de vacio no es fiable');
  }
  const conDatos = await pedirMapa(-4.0, 37.0, -2.0, 38.5); // Granada y alrededores
  if (conDatos === vacioA) {
    throw new Error('una zona CON datos da la misma imagen que el vacio: el servicio no esta pintando la capa');
  }
  hashVacio = vacioA;
  console.log(`  oraculo de vacio: OK (hash ${hashVacio.slice(0, 16)})`);
}

// --- mascara de cobertura ---------------------------------------------------

/**
 * Dos mascaras de bits sobre el bbox de la region en curso, deliberadamente
 * separadas:
 *
 *   tierra -> la celda cae dentro de un municipio YA ENCONTRADO
 *   vacio  -> se ha confirmado que ahi no hay dato (mar, Francia, Portugal)
 *
 * Estan separadas y no fundidas en una porque la diferencia importa dos veces:
 * para no volver a sondear una esquina cuyo estado ya se conoce, y sobre todo
 * para no dar por agua una celda que contiene tierra conocida (y por tanto,
 * probablemente, tierra desconocida al lado).
 */
let tierra = null;
let vacio = null;
let mX0 = 0;
let mY0 = 0;
let mCols = 0;
let mFilas = 0;

function abrirMascara([x0, y0, x1, y1]) {
  mX0 = x0;
  mY0 = y0;
  mCols = Math.ceil((x1 - x0) / RESOLUCION_GRADOS);
  mFilas = Math.ceil((y1 - y0) / RESOLUCION_GRADOS);
  const bytes = Math.ceil((mCols * mFilas) / 8);
  tierra = new Uint8Array(bytes);
  vacio = new Uint8Array(bytes);
  return (mCols * mFilas) / 1e6;
}

const esTierra = (c, f) => {
  const i = f * mCols + c;
  return (tierra[i >> 3] & (1 << (i & 7))) !== 0;
};
const esVacio = (c, f) => {
  const i = f * mCols + c;
  return (vacio[i >> 3] & (1 << (i & 7))) !== 0;
};
const marcado = (c, f) => esTierra(c, f) || esVacio(c, f);
const marcar = (c, f) => {
  const i = f * mCols + c;
  tierra[i >> 3] |= 1 << (i & 7);
};
const marcarVacio = (c, f) => {
  const i = f * mCols + c;
  vacio[i >> 3] |= 1 << (i & 7);
};
const colDe = (x) => Math.floor((x - mX0) / RESOLUCION_GRADOS);
const filaDe = (y) => Math.floor((y - mY0) / RESOLUCION_GRADOS);
const lonDe = (c) => mX0 + (c + 0.5) * RESOLUCION_GRADOS;
const latDe = (f) => mY0 + (f + 0.5) * RESOLUCION_GRADOS;

/** Rellena el poligono en la mascara por lineas de barrido, con sus huecos. */
function marcarPoligono(anillos) {
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const anillo of anillos) {
    for (const [, y] of anillo) {
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
    }
  }
  const f0 = Math.max(0, filaDe(ymin));
  const f1 = Math.min(mFilas - 1, filaDe(ymax) + 1);
  const cortes = [];
  for (let f = f0; f <= f1; f++) {
    const y = latDe(f);
    cortes.length = 0;
    // Regla par-impar sobre TODOS los anillos a la vez: asi los huecos del
    // poligono (patios, enclaves) quedan sin marcar sin tratarlos aparte.
    for (const anillo of anillos) {
      for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
        const [xi, yi] = anillo[i];
        const [xj, yj] = anillo[j];
        if (yi > y !== yj > y) cortes.push(xi + ((xj - xi) * (y - yi)) / (yj - yi));
      }
    }
    if (cortes.length < 2) continue;
    cortes.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cortes.length; k += 2) {
      const c0 = Math.max(0, colDe(cortes[k]));
      const c1 = Math.min(mCols - 1, colDe(cortes[k + 1]));
      for (let c = c0; c <= c1; c++) marcar(c, f);
    }
  }
}

function marcarGeometria(g) {
  if (!g) return;
  if (g.type === 'Polygon') marcarPoligono(g.coordinates);
  else if (g.type === 'MultiPolygon') for (const p of g.coordinates) marcarPoligono(p);
}

/** Marca un rectangulo como confirmado sin dato. Nunca toca la mascara `tierra`. */
function marcarVacioRectangulo(x0, y0, x1, y1) {
  const c0 = Math.max(0, colDe(x0));
  const c1 = Math.min(mCols - 1, colDe(x1));
  const f0 = Math.max(0, filaDe(y0));
  const f1 = Math.min(mFilas - 1, filaDe(y1));
  for (let f = f0; f <= f1; f++) for (let c = c0; c <= c1; c++) marcarVacio(c, f);
}

/**
 * Da por resuelta la celda que acaba de sondearse, haya salido municipio o no.
 * Es lo que garantiza que el barrido avanza: cada peticion retira al menos una
 * celda del conjunto de huecos, asi que el recorrido termina siempre.
 */
function consumir([lon, lat], hayDato) {
  const c = colDe(lon);
  const f = filaDe(lat);
  if (c < 0 || c >= mCols || f < 0 || f >= mFilas) return;
  if (hayDato) marcar(c, f);
  else marcarVacio(c, f);
}

/**
 * Centro de la primera celda sin marcar dentro del rectangulo, o `null` si esta
 * entero cubierto. Sale al primer hueco, asi que es barato justo cuando hay algo
 * que hacer.
 */
function primerHueco(x0, y0, x1, y1) {
  const c0 = Math.max(0, colDe(x0));
  const c1 = Math.min(mCols - 1, colDe(x1));
  const f0 = Math.max(0, filaDe(y0));
  const f1 = Math.min(mFilas - 1, filaDe(y1));
  for (let f = f0; f <= f1; f++) {
    for (let c = c0; c <= c1; c++) {
      if (!marcado(c, f)) return [lonDe(c), latDe(f)];
    }
  }
  return null;
}

// --- estado del barrido -----------------------------------------------------

/** ine_mun -> props + geometria cruda, para poder rehacer la mascara al reanudar. */
const encontrados = new Map();

/** Sondeos que no han traido ni un municipio nuevo. Si sube, el barrido patina. */
let nRepetidos = 0;
/** Features con codigo pero sin geometria: no se pueden marcar en la mascara. */
let nSinGeometria = 0;
const sinGeometria = new Map();

function registrar(feats) {
  let nuevos = 0;
  for (const f of feats) if (f.properties?.ine_mun && !encontrados.has(f.properties.ine_mun)) nuevos++;
  if (feats.length && !nuevos) nRepetidos++;
  for (const f of feats) {
    const ine = f.properties?.ine_mun;
    if (ine && !f.geometry) {
      // Sin geometria no se puede marcar la mascara, y el barrido volveria a
      // pinchar la misma zona sin fin. Es un fallo del barrido, no un dato raro.
      if (sinGeometria.size < 12) sinGeometria.set(ine, f.properties?.nombre ?? '?');
      nSinGeometria++;
    }
    if (!ine || !f.geometry) continue;
    if (!encontrados.has(ine)) {
      encontrados.set(ine, { props: f.properties, geom: f.geometry });
      // Un barrido de horas no puede perderlo todo si se corta la luz.
      if (encontrados.size % 250 === 0) guardarCache();
    }
    marcarGeometria(f.geometry);
  }
}

let ultimoAviso = Date.now();
function avisar() {
  if (Date.now() - ultimoAviso < 15000) return;
  ultimoAviso = Date.now();
  process.stdout.write(
    `\r  ${encontrados.size} municipios · ${nSondeos} sondeos (${nRepetidos} en balde, ` +
      `${nSinGeometria} sin geometria) · ${nMapas} mapas · ${nReintentos} reintentos    `,
  );
}

async function visitar(x0, y0, x1, y1) {
  const lado = Math.max(x1 - x0, y1 - y0);

  // Celdas grandes: no se escanea la mascara, se parte y ya.
  if (lado > MAX_ESCANEO) {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    await visitar(x0, y0, cx, cy);
    await visitar(cx, y0, x1, cy);
    await visitar(x0, cy, cx, y1);
    await visitar(cx, cy, x1, y1);
    return;
  }

  let hueco = primerHueco(x0, y0, x1, y1);
  if (!hueco) return;

  const feats = await sondear(...hueco);
  avisar();
  // INVARIANTE: un sondeo consume SIEMPRE la celda que ha pinchado. Sin esto el
  // barrido se atasca: si el hueco cae dentro del municipio X pero el pixel lo
  // pinta el vecino Y —que ya se conocia—, se marcaria el poligono de Y, que no
  // cubre el hueco, y se volveria a pinchar el mismo punto hasta agotar el
  // presupuesto de la hoja. Medido: la mitad de los sondeos se iban en eso.
  consumir(hueco, feats.length > 0);

  if (feats.length) {
    registrar(feats);
  } else if (await estaVacia(x0, y0, x1, y1)) {
    // Nada de la capa dentro del rectangulo: agua o extranjero. Se marca entero
    // y no se vuelve. Esto es lo que hace asequibles el Atlantico y la frontera.
    marcarVacioRectangulo(x0, y0, x1, y1);
    avisar();
    return;
  } else {
    // Hay algo en la celda, pero no donde se ha pinchado: se sigue partiendo
    // hasta dar con ello. El hueco ya lo ha consumido `consumir`.
    avisar();
  }

  if (lado / 2 >= MIN_CELDA) {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    await visitar(x0, y0, cx, cy);
    await visitar(cx, y0, x1, cy);
    await visitar(x0, cy, cx, y1);
    await visitar(cx, cy, x1, y1);
    return;
  }

  // Hoja: se sondean los huecos que queden, en bucle, hasta cerrarla. Un hueco
  // sin dato marca su entorno inmediato, no una sola celda, para que una hoja
  // mitad tierra mitad mar no agote el presupuesto drenando agua de una en una.
  // El oraculo se consulta UNA vez por hoja, no una vez por pinchazo de agua:
  // en una hoja mitad tierra mitad mar la respuesta no cambia, y preguntarla en
  // cada iteracion se llevaba dos tercios de las peticiones del barrido.
  let oraculoPreguntado = false;
  for (let n = 0; n < SONDEOS_POR_HOJA; n++) {
    hueco = primerHueco(x0, y0, x1, y1);
    if (!hueco) return;
    const f = await sondear(...hueco);
    avisar();
    consumir(hueco, f.length > 0);
    if (f.length) {
      registrar(f);
    } else if (!oraculoPreguntado) {
      oraculoPreguntado = true;
      if (await estaVacia(x0, y0, x1, y1)) {
        // Lo que queda de la hoja es agua: se cierra de una vez en lugar de
        // drenarla celda a celda, que es lo que dispara el coste en la costa.
        marcarVacioRectangulo(x0, y0, x1, y1);
        return;
      }
    }
  }
}

// --- aserciones previas -----------------------------------------------------

/**
 * `CRS:84` es lon/lat; `EPSG:4326` bajo WMS 1.3.0 es lat/lon. Si alguien cambia
 * el CRS y no el orden, el barrido recorreria el oceano Indico devolviendo cero
 * y el fallo pareceria "el servicio no responde". Se comprueba contra un
 * municipio conocido antes de gastar una sola peticion del barrido.
 */
async function comprobarEjes() {
  const feats = await sondear(-3.5986, 37.1807); // Granada capital
  const granada = feats.find((f) => f.properties?.ine_mun === '18087');
  if (!granada) {
    throw new Error(
      'asercion de ejes fallida: el sondeo de Granada devolvio ' +
        `[${feats.map((f) => f.properties?.nombre).join(', ') || 'nada'}] y se esperaba ine_mun=18087. ` +
        'Revisa el orden lon/lat del bbox y el CRS.',
    );
  }
  const p = granada.properties;
  if (p.aceleracion !== '0.23' || p.coeficient !== '(1.0)') {
    throw new Error(
      `asercion de valores fallida: Granada devolvio ab=${p.aceleracion} K=${p.coeficient}, ` +
        'se esperaba 0.23 y (1.0). Si el IGN ha republicado la capa, revisa el parser y sube PARSER_VERSION.',
    );
  }
  console.log('  ejes y formato: OK (Granada 18087, ab 0,23, K 1,0)');
  return granada;
}

async function leerLicencia() {
  const u = new URL(ENDPOINT);
  u.search = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetCapabilities',
  }).toString();
  const xml = await (await fetch(u, { headers: { 'User-Agent': USER_AGENT } })).text();
  const m = /<AccessConstraints>([^<]*)<\/AccessConstraints>/.exec(xml);
  const licencia = m ? m[1].trim() : '';
  if (!licencia) {
    throw new Error('GetCapabilities no declara AccessConstraints: no se puede fijar la licencia');
  }
  console.log(`  licencia declarada por el servicio: ${licencia}`);
  return licencia;
}

// --- parser -----------------------------------------------------------------

/**
 * El Anejo 1 denota `K` entre parentesis y el servicio lo replica literalmente:
 * `coeficient = "(1.0)"`. `aceleracion` viaja como cadena. Un municipio que no
 * figura en el Anejo 1 (ab < 0,04 g) llega con ambos a `null`, que es dato
 * valido y NO un fallo del barrido.
 */
export function parsearFila(props) {
  const ine = String(props.ine_mun ?? '').padStart(5, '0');
  if (!/^\d{5}$/.test(ine)) throw new Error(`ine_mun ilegible: ${JSON.stringify(props.ine_mun)}`);
  const nombre = String(props.nombre ?? '').trim();
  const crudoAb = props.aceleracion;
  const crudoK = props.coeficient;

  if (!nombre) {
    // La capa incluye 84 poligonos sin nombre, sin coordenadas y sin ab, con el
    // codigo INE en el rango 8xx: son facerias de Navarra, entidades locales
    // menores de Burgos y Leon, y mancomunidades. Territorio que no pertenece a
    // ningun municipio, asi que no son filas del Anejo 1 ni fallos del barrido.
    // Un poligono sin nombre PERO con aceleracion si seria un fallo, y revienta.
    if (crudoAb != null || crudoK != null) {
      throw new Error(`la fila ${ine} no tiene nombre pero si ab=${crudoAb} K=${crudoK}`);
    }
    return { ine, nombre: '', gid: Number(props.gid), ab: null, k: null, noMunicipal: true };
  }
  if (crudoAb == null || crudoK == null) {
    if (crudoAb != null || crudoK != null) {
      throw new Error(`municipio ${ine} (${nombre}) con ab y K desparejados: ${crudoAb} / ${crudoK}`);
    }
    return { ine, nombre, gid: Number(props.gid), ab: null, k: null };
  }

  const ab = Number(String(crudoAb).trim());
  const mk = /^\(?\s*([\d.]+)\s*\)?$/.exec(String(crudoK).trim());
  if (!Number.isFinite(ab) || ab <= 0) throw new Error(`municipio ${ine} con ab ilegible: ${crudoAb}`);
  if (!mk) throw new Error(`municipio ${ine} con K ilegible: ${crudoK}`);
  const k = Number(mk[1]);
  if (!Number.isFinite(k) || k < 1 || k > 2) throw new Error(`municipio ${ine} con K fuera de rango: ${crudoK}`);
  return { ine, nombre, gid: Number(props.gid), ab, k };
}

// --- claves de busqueda -----------------------------------------------------

const ARTICULOS = new Set([
  'el', 'la', 'los', 'las', 'lo', // castellano
  'a', 'o', 'as', 'os', // gallego
  'es', 'sa', 'ses', 'ets', 'els', 'les', // catalan / balear
  // `plegar` ya ha convertido el apostrofo en espacio, asi que el `(L')` de
  // `Ampolla (L')` llega aqui como `l`.
  'l', 's',
]);

/** Minusculas, sin diacriticos, sin puntuacion, con los espacios colapsados. */
export function plegar(s) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Variantes de busqueda de un nombre oficial. Cuatro formas que el nombre del
 * IGN obliga a tratar, medidas sobre los 2.610 nombres reales:
 *
 *   26,9 % llevan acento o enye         -> se pliegan
 *    8,5 % llevan el articulo al final  -> `Union (La)` se indexa como `union` y
 *                                          como `la union`, que son las dos
 *                                          formas en que se TECLEA.
 *    1,4 % son bilingues con barra      -> `Alicante/Alacant` se indexa por las
 *                                          DOS formas. Sin esto, quien escribe
 *                                          "Alacant" no encuentra Alicante, y
 *                                          Alicante es capital de provincia con
 *                                          ab alta.
 *   11,3 % NO SE ENCONTRABAN PEGADOS    -> ver abajo.
 *
 * La cuarta forma es el nombre oficial ENTERO, plegado tal cual: `union la`,
 * `alicante alacant`. La version anterior no la indexaba, razonando que nadie
 * escribe "Union La". Cierto mientras el usuario TECLEE — y falso en cuanto
 * PEGA, que es lo que hace quien copia el nombre del BOE, de un pliego o del
 * propio rotulo de la app, que muestra el nombre oficial. Medido: 295 de los
 * 2.610 nombres (11,3 %) no se encontraban pegados verbatim, la capital
 * Alicante entre ellos, y el "no encontrado" de este modulo no es inocuo:
 * significa "la Norma no te obliga". Un nombre sin barra ni articulo produce
 * aqui la misma clave que ya tenia, asi que el coste real son esas 295 filas.
 */
export function clavesDe(nombre) {
  const claves = new Set();
  for (const parte of nombre.split('/')) {
    const bruto = parte.trim();
    if (!bruto) continue;
    const m = /^(.*?)[,\s]*\(\s*([^)]+)\s*\)\s*$/.exec(bruto);
    if (m && ARTICULOS.has(plegar(m[2]).replace(/\s+/g, ''))) {
      claves.add(plegar(m[1]));
      claves.add(plegar(`${m[2]} ${m[1]}`));
    } else {
      claves.add(plegar(bruto));
    }
  }
  // El nombre oficial completo, para quien lo pega en vez de teclearlo.
  claves.add(plegar(nombre));
  return [...claves].filter(Boolean);
}

// --- escritura --------------------------------------------------------------

function escribir(licencia, muestraCruda) {
  const filas = [...encontrados.values()].map((m) => parsearFila(m.props));
  const gids = filas.map((f) => f.gid).filter(Number.isFinite);
  const gidMax = gids.length ? Math.max(...gids) : 0;
  const cosechadas = filas.filter((f) => f.ab != null);
  const noMunicipales = filas.filter((f) => f.noMunicipal).length;
  const sinDato = filas.length - cosechadas.length - noMunicipales;

  // La capa NO es el Anejo 1: le faltan seis municipios (Ceuta y Melilla entre
  // ellos), contradice al BOE en el K de uno, y no conoce las 28 segregaciones
  // posteriores a 2002. Ver `ncse02-suplemento.mjs`.
  const sup = suplementar(cosechadas.map(({ ine, nombre, ab, k }) => ({ ine, nombre, ab, k })));
  const conDato = sup.filas.sort((a, b) => a.ine.localeCompare(b.ine));

  const abValores = [...new Set(conDato.map((f) => f.ab))].sort((a, b) => a - b);
  const kValores = [...new Set(conDato.map((f) => f.k))].sort((a, b) => a - b);
  if (abValores.length > 255 || kValores.length > 255) {
    throw new Error('mas de 255 valores distintos: el formato columnar de indice de byte no sirve');
  }

  // Formato columnar (decision 2 del design doc): arrays paralelos con
  // diccionario de los valores repetidos. Medido sobre los datos reales: 22
  // valores distintos de ab y 4 de K, asi que ambos entran como indice de byte.
  //
  // `procedencia` es un mapa DISPERSO, no una columna: solo llevan entrada las
  // pocas filas que no son cosecha directa de la capa. Una columna de 2.600
  // cadenas vacias costaria mas que las ~35 entradas que de verdad hay, y el
  // formato de las demas filas no cambia.
  const datos = {
    ine: conDato.map((f) => f.ine),
    nombre: conDato.map((f) => f.nombre),
    clave: conDato.map((f) => clavesDe(f.nombre).join('|')),
    ab: conDato.map((f) => abValores.indexOf(f.ab)),
    k: conDato.map((f) => kValores.indexOf(f.k)),
    abValores,
    kValores,
    procedencia: sup.procedencia,
  };

  const json = `${JSON.stringify(datos)}\n`;
  const sha256 = createHash('sha256').update(json).digest('hex');

  const manifest = {
    source: `${ENDPOINT}?service=WMS&version=1.3.0&request=GetFeatureInfo&layers=${CAPA}&query_layers=${CAPA}&crs=CRS:84&info_format=${INFO_FORMAT}`,
    layer: CAPA,
    infoFormat: INFO_FORMAT,
    parserVersion: PARSER_VERSION,
    // La fecha DEL BARRIDO, no la de esta escritura. Sobrevive a un
    // `--solo-escribir` por la cache, igual que el coste: reescribir el dataset
    // no vuelve a preguntarle nada al IGN, asi que declarar la fecha de hoy
    // seria decir que los datos son de hoy cuando pueden ser de hace meses.
    harvestedAt: fechaBarrido,
    license: licencia,
    attribution: 'Instituto Geográfico Nacional (IGN)',
    sha256,
    layerRecordCount: filas.length,
    anejo1RecordCount: conDato.length,
    harvestedRecordCount: cosechadas.length,
    outsideAnejo1RecordCount: sinDato,
    // Facerias, entidades locales menores y mancomunidades: poligonos de la capa
    // que no son municipios. Ni son Anejo 1 ni cuentan como municipio ausente.
    nonMunicipalRecordCount: noMunicipales,
    // Filas que NO salen de la capa. No son invenciones: son el texto del BOE
    // (municipios que la capa no resuelve) y la herencia de los municipios
    // segregados despues de 2002. Ver `ncse02-suplemento.mjs`.
    syntheticRecordCount: sup.informe.ausentes + sup.informe.heredadas,
    fromBoeRecordCount: sup.informe.ausentes,
    inheritedRecordCount: sup.informe.heredadas,
    correctedRecordCount: sup.informe.corregidas,
    supplementSource: 'BOE núm. 244 de 11/10/2002 (RD 997/2002) · registro INE de municipios',
    // Oraculo de completitud: `gid` es clave serie densa de la capa, asi que los
    // huecos de la secuencia miden lo que falta sin depender de ningun registro
    // externo. Sustituye al `ineRegisterVersion` que planteaba el design doc.
    gidSeen: new Set(gids).size,
    gidMax,
    coverageResolutionDeg: RESOLUCION_GRADOS,
    ...costeTotal(),
    generatedBy: 'scripts/harvest-ign-hazard.mjs',
  };

  mkdirSync(DESTINO, { recursive: true });
  writeFileSync(join(DESTINO, 'ncse02.hazard.json'), json);
  writeFileSync(join(DESTINO, 'ncse02.hazard.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  // Respuesta cruda del servicio, para que el test del parser no dependa de la red.
  mkdirSync(FIXTURES, { recursive: true });
  writeFileSync(join(FIXTURES, 'ign-getfeatureinfo.crudo.json'), `${JSON.stringify(muestraCruda, null, 2)}\n`);

  return { manifest, informe: sup.informe };
}

// --- cache ------------------------------------------------------------------

/**
 * Coste del barrido que produjo la cache. Va al manifest, asi que tiene que
 * sobrevivir a un `--solo-escribir`: si no, reescribir el dataset declararia
 * que se cosecho con cuatro peticiones, que es falso y ademas invita a creer
 * que rehacerlo es barato.
 */
let costeAcumulado = { probeCount: 0, emptinessMapCount: 0, requestCount: 0, retryCount: 0, wastedProbeCount: 0 };

/**
 * Cuando se cosecharon los datos. Se fija al guardar la cache y se recupera al
 * cargarla, por la misma razon que el coste: un `--solo-escribir` no vuelve a
 * consultar al IGN y no puede declarar que los datos son de hoy.
 */
let fechaBarrido = new Date().toISOString();

const costeTotal = () => ({
  probeCount: costeAcumulado.probeCount + nSondeos,
  emptinessMapCount: costeAcumulado.emptinessMapCount + nMapas,
  requestCount: costeAcumulado.requestCount + nPeticiones,
  retryCount: costeAcumulado.retryCount + nReintentos,
  wastedProbeCount: costeAcumulado.wastedProbeCount + nRepetidos,
});

function guardarCache() {
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(
    CACHE,
    JSON.stringify({
      coste: costeTotal(),
      harvestedAt: fechaBarrido,
      filas: [...encontrados.values()].map((m) => ({ props: m.props, geom: m.geom })),
    }),
  );
}

function cargarCache() {
  if (!existsSync(CACHE)) return false;
  const c = JSON.parse(readFileSync(CACHE, 'utf8'));
  const filas = Array.isArray(c) ? c : c.filas;
  if (!Array.isArray(c) && c.coste) costeAcumulado = c.coste;
  // Una cache escrita antes de que se guardara la fecha no la trae. Antes de
  // estampar la de hoy —que seria falsa— se rescata la del manifest anterior,
  // que es la del barrido que produjo esa misma cache.
  if (!Array.isArray(c) && c.harvestedAt) fechaBarrido = c.harvestedAt;
  else {
    const previo = join(DESTINO, 'ncse02.hazard.manifest.json');
    if (existsSync(previo)) {
      const m = JSON.parse(readFileSync(previo, 'utf8'));
      if (m.harvestedAt) {
        fechaBarrido = m.harvestedAt;
        console.log(`  fecha del barrido recuperada del manifest anterior: ${fechaBarrido}`);
      }
    }
  }
  for (const f of filas) encontrados.set(f.props.ine_mun, { props: f.props, geom: f.geom });
  console.log(`  cache: ${encontrados.size} municipios ya cosechados`);
  return true;
}

/**
 * La mascara `tierra` se rehace sola desde los poligonos cacheados, pero la de
 * agua NO se puede reconstruir: cuesta lo mismo que ganarla. Y es la cara: la
 * mayor parte del barrido se va en cerrar costa y frontera. Asi que se guarda
 * comprimida, que siendo casi uniforme ocupa nada.
 */
const cacheVacio = (region) => join(dirname(CACHE), `ign-hazard-vacio-${region}.gz`);

function guardarVacio(region) {
  writeFileSync(cacheVacio(region), gzipSync(Buffer.from(vacio.buffer, 0, vacio.length)));
}

function cargarVacio(region) {
  const f = cacheVacio(region);
  if (!existsSync(f)) return 0;
  const bruto = gunzipSync(readFileSync(f));
  if (bruto.length !== vacio.length) {
    console.log('  cache de agua descartada: la mascara ha cambiado de tamano');
    return 0;
  }
  vacio.set(bruto);
  let n = 0;
  for (const b of vacio) n += POPCOUNT[b];
  return n;
}

const POPCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i++) POPCOUNT[i] = (i & 1) + POPCOUNT[i >> 1];

/** Rehace la mascara con lo que ya hay, para que reanudar no repita sondeos. */
function repintarMascara() {
  for (const m of encontrados.values()) marcarGeometria(m.geom);
}

// --- principal --------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const soloEscribir = args.includes('--solo-escribir');
  const resumir = args.includes('--resume') || soloEscribir;
  const iRegion = args.indexOf('--region');
  const iBbox = args.indexOf('--bbox');
  const regiones =
    iBbox >= 0
      ? { adhoc: args[iBbox + 1].split(',').map(Number) }
      : iRegion >= 0
        ? { [args[iRegion + 1]]: REGIONES[args[iRegion + 1]] }
        : REGIONES;

  console.log('Cosecha del Anejo 1 de la NCSE-02 desde el WMS INSPIRE del IGN');
  if (resumir) cargarCache();

  const licencia = await leerLicencia();
  const granada = await comprobarEjes();
  await calibrarVacio();

  if (!soloEscribir) {
    for (const [nombre, bbox] of Object.entries(regiones)) {
      if (!bbox) throw new Error(`region desconocida: ${nombre}`);
      const megaCeldas = abrirMascara(bbox);
      repintarMascara();
      const aguaRecuperada = resumir ? cargarVacio(nombre) : 0;
      console.log(
        `\n  region ${nombre}: ${bbox.join(', ')}  ` +
          `(mascara ${mCols}x${mFilas} = ${megaCeldas.toFixed(1)} M celdas` +
          (aguaRecuperada ? `, ${(aguaRecuperada / 1e6).toFixed(1)} M celdas de agua recuperadas` : '') +
          ')',
      );
      const antes = encontrados.size;
      const t0 = Date.now();
      const salvar = setInterval(() => guardarVacio(nombre), 120000);
      try {
        await visitar(...bbox);
      } finally {
        clearInterval(salvar);
        guardarCache();
        guardarVacio(nombre);
      }
      const seg = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(
        `\r  region ${nombre}: +${encontrados.size - antes} municipios en ${seg} s${' '.repeat(24)}`,
      );
    }
  }

  const { manifest, informe } = escribir(licencia, granada);

  console.log('\nResumen');
  console.log(
    `  sondeos / mapas / total: ${manifest.probeCount} / ${manifest.emptinessMapCount} / ` +
      `${manifest.requestCount} (${nReintentos} reintentos)`,
  );
  console.log(`  filas de la capa      : ${manifest.layerRecordCount}`);
  console.log(`  cosechadas con ab     : ${manifest.harvestedRecordCount}`);
  console.log(`  fuera del Anejo 1     : ${manifest.outsideAnejo1RecordCount} (ab < 0,04 g)`);
  console.log(`  no municipales        : ${manifest.nonMunicipalRecordCount} (facerias, ELM, mancomunidades)`);
  console.log(`  gid vistos / gid max  : ${manifest.gidSeen} / ${manifest.gidMax}`);
  const huecos = manifest.gidMax - manifest.gidSeen;
  console.log(
    `  huecos en la secuencia: ${huecos}` +
      (huecos > 0
        ? '  <-- REVISAR: o son gid inexistentes, o son municipios sin encontrar'
        : '  (secuencia completa)'),
  );
  console.log('\n  Suplemento (lo que la capa no resuelve, del BOE y del registro INE)');
  console.log(`    del texto del BOE   : ${manifest.fromBoeRecordCount} (Ceuta, Melilla y demas ausentes)`);
  console.log(`    heredadas del padre : ${manifest.inheritedRecordCount} (segregaciones posteriores a 2002)`);
  console.log(`    valores corregidos  : ${manifest.correctedRecordCount} (la capa contradice al BOE)`);
  console.log(`  en el Anejo 1 (total) : ${manifest.anejo1RecordCount}`);
  for (const a of informe.avisos) console.log(`    ! ${a}`);
  console.log(`\n  sha256                : ${manifest.sha256}`);
}

// Solo barre si se invoca como programa. Importado desde un test, el fichero
// expone `parsearFila`, `plegar` y `clavesDe` sin tocar la red.
if (process.argv[1] && process.argv[1].endsWith('harvest-ign-hazard.mjs')) {
  main().catch((err) => {
    console.error(`\nharvest-ign-hazard: ${err.message}`);
    process.exitCode = 1;
  });
}
