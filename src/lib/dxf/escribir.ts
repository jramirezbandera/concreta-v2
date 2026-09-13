/**
 * El dibujo a un DXF R12 (AC1009).
 *
 * R12 y no una versión moderna porque es el DXF que lee absolutamente todo —
 * AutoCAD, BricsCAD, LibreCAD, visores web— y porque no necesita manejadores ni
 * sección OBJECTS: el fichero es una lista de pares código/valor y punto. A
 * cambio se renuncia a MTEXT y al color verdadero, que aquí no hacen falta.
 *
 * **Formato del fichero: pares de líneas.** Un código de grupo entero en una
 * línea y su valor en la siguiente, siempre. Un salto de línea de más o de
 * menos y el CAD abre un dibujo vacío sin decir por qué. Los reales van con
 * punto decimal y, para que el CAD no los redondee mal, con precisión fija.
 *
 * **Codificación: cp1252, no UTF-8.** Es la limitación gorda de R12 y hay que
 * conocerla: los acentos, «Ø», «²», «·» y «°» viajan intactos, pero las griegas
 * y los símbolos matemáticos no existen en esa tabla. `dxfStr` los mapea a la
 * letra latina que la fuente Symbol dibuja como esa griega (γ→g, Δ→D, α→a,
 * σ→s), de modo que con un estilo de texto Symbol salen correctas de verdad y,
 * sin él, se leen como la abreviatura que ya se usa en obra («gc», «gs»).
 */

import type { Capa, Dibujo, Entidad } from './cuadro';
import { COLOR_DE_CAPA } from './cuadro';
import { aLatin1, dxfStr } from './texto';

export { aLatin1, dxfStr } from './texto';

/** Estilo de texto propio del cuadro, para no pisar el STANDARD del plano. */
export const ESTILO_TEXTO = 'CUADRO-MATERIALES';

// ── Pares código/valor ──────────────────────────────────────────────────────

const nl = '\r\n';

function par(codigo: number, valor: string | number): string {
  return `${codigo}${nl}${valor}${nl}`;
}

/** Los reales del DXF, con precisión fija y punto decimal. */
function real(v: number): string {
  return v.toFixed(6);
}

// ── Secciones ───────────────────────────────────────────────────────────────

function cabecera(d: Dibujo): string {
  return (
    par(0, 'SECTION') +
    par(2, 'HEADER') +
    par(9, '$ACADVER') +
    par(1, 'AC1009') +
    // Sin esto el CAD no sabe en qué tabla de caracteres está el fichero y los
    // acentos salen como símbolos.
    par(9, '$DWGCODEPAGE') +
    par(3, 'ANSI_1252') +
    par(9, '$INSUNITS') +
    par(70, 6) + // metros
    par(9, '$EXTMIN') +
    par(10, real(0)) +
    par(20, real(-d.alto)) +
    par(30, real(0)) +
    par(9, '$EXTMAX') +
    par(10, real(d.ancho)) +
    par(20, real(0)) +
    par(30, real(0)) +
    // Los límites, iguales a los extremos: es lo que mira el CAD cuando el
    // usuario hace «zoom todo» en vez de «zoom extensión».
    par(9, '$LIMMIN') +
    par(10, real(0)) +
    par(20, real(-d.alto)) +
    par(9, '$LIMMAX') +
    par(10, real(d.ancho)) +
    par(20, real(0)) +
    // La vista guardada del fichero. Va por duplicado —aquí y en la tabla
    // VPORT— porque no todos los programas miran la misma.
    par(9, '$VIEWCTR') +
    par(10, real(d.ancho / 2)) +
    par(20, real(-d.alto / 2)) +
    par(9, '$VIEWSIZE') +
    par(40, real(altoDeVista(d))) +
    par(0, 'ENDSEC')
  );
}

/**
 * Altura de la vista inicial, en unidades de dibujo.
 *
 * El cuadro mide unos pocos centímetros y está pegado al origen: la altura de
 * texto son 2,5 mm y las unidades del dibujo son metros. Un DXF que no diga con
 * qué vista abrirse lo abre el CAD con la de su plantilla —cientos de unidades
 * de ancho—, y el cuadro queda como un punto invisible en la esquina del 0,0:
 * hay que hacer «zoom extensión» a mano cada vez. De ahí que el fichero lleve
 * su propia vista, encuadrando el cuadro con un poco de aire.
 *
 * Insertado en un plano esto no pinta nada: la vista es del fichero, no de la
 * geometría, y al insertar se descarta.
 */
const RELACION_VISTA = 1.6; // ancho/alto de una pantalla apaisada
const AIRE_VISTA = 1.15;

function altoDeVista(d: Dibujo): number {
  // Un cuadro vacío no tiene caja, y una vista de altura 0 el CAD la ignora.
  const ancho = d.ancho > 0 ? d.ancho : 1;
  const alto = d.alto > 0 ? d.alto : 1;
  return Math.max(alto, ancho / RELACION_VISTA) * AIRE_VISTA;
}

/**
 * El registro *ACTIVE de la tabla VPORT: la vista con la que AutoCAD y ZWCAD
 * abren el dibujo. Los códigos son los de un R12 completo —dirección de vista,
 * rejilla, forzado de cursor, recortes— porque un VPORT al que le falten campos
 * hay programas que lo descartan entero y vuelven a su vista de plantilla.
 */
function vport(d: Dibujo): string {
  const altura = altoDeVista(d);
  // El dibujo ocupa x ∈ [0, ancho] e y ∈ [-alto, 0]: crece hacia abajo.
  const cx = (d.ancho > 0 ? d.ancho : 1) / 2;
  const cy = -(d.alto > 0 ? d.alto : 1) / 2;
  // Rejilla y forzado a una décima de la vista: números redondos para el
  // tamaño del cuadro, en vez de la unidad que traiga la plantilla del CAD.
  const paso = altura / 10;
  return (
    par(0, 'TABLE') +
    par(2, 'VPORT') +
    par(70, 1) +
    par(0, 'VPORT') +
    par(2, '*ACTIVE') +
    par(70, 0) +
    par(10, real(0)) + // esquina inferior izquierda de la ventana, en pantalla
    par(20, real(0)) +
    par(11, real(1)) + // y la superior derecha: la pantalla entera
    par(21, real(1)) +
    par(12, real(cx)) + // centro de la vista, en coordenadas del dibujo
    par(22, real(cy)) +
    par(13, real(0)) + // base del forzado de cursor
    par(23, real(0)) +
    par(14, real(paso)) + // paso del forzado
    par(24, real(paso)) +
    par(15, real(paso)) + // paso de la rejilla
    par(25, real(paso)) +
    par(16, real(0)) + // dirección de vista: desde arriba
    par(26, real(0)) +
    par(36, real(1)) +
    par(17, real(0)) + // punto mirado
    par(27, real(0)) +
    par(37, real(0)) +
    par(40, real(altura)) + // alto de la vista, en unidades de dibujo
    par(41, real(RELACION_VISTA)) +
    par(42, real(50)) + // distancia focal, la de por defecto
    par(43, real(0)) + // sin recorte delantero
    par(44, real(0)) + // ni trasero
    par(45, real(0)) +
    par(50, real(0)) + // rejilla sin girar
    par(51, real(0)) + // vista sin girar
    par(71, 0) +
    par(72, 100) +
    par(73, 1) +
    par(74, 3) +
    par(75, 0) +
    par(76, 0) +
    par(77, 0) +
    par(78, 0) +
    par(0, 'ENDTAB')
  );
}

function tablas(d: Dibujo, capas: Capa[]): string {
  let s = par(0, 'SECTION') + par(2, 'TABLES') + vport(d);

  // Dos estilos. STANDARD porque un DXF suelto lo necesita —es al que apunta
  // todo TEXT que no diga otra cosa— y el del cuadro, que es el que se usa.
  //
  // El del cuadro apunta a **arial.ttf**, no a la `txt.shx` de AutoCAD: con la
  // fuente de palo el cuadro sale ilegible y, peor, `txt.shx` no tiene glifo
  // para «²», así que «20,0 N/mm²» se dibujaba «20,0 N/mm?». Los anchos de
  // columna están medidos sobre Arial (ver `anchos.ts`), de modo que el estilo
  // y la medida tienen que ir juntos: cambiar uno sin el otro descuadra el
  // cuadro entero.
  const estilo = (nombre: string, fuente: string) =>
    par(0, 'STYLE') +
    par(2, nombre) +
    par(70, 0) +
    par(40, real(0)) + // altura 0 = la fija cada texto
    par(41, real(1)) + // sin factor de anchura: los anchos ya cuentan con ello
    par(50, real(0)) +
    par(71, 0) +
    par(42, real(0.2)) +
    par(3, fuente) +
    par(4, '');

  s +=
    par(0, 'TABLE') +
    par(2, 'STYLE') +
    par(70, 2) +
    estilo('STANDARD', 'txt') +
    estilo(ESTILO_TEXTO, 'arial.ttf') +
    par(0, 'ENDTAB');

  s += par(0, 'TABLE') + par(2, 'LAYER') + par(70, capas.length);
  for (const capa of capas) {
    s +=
      par(0, 'LAYER') +
      par(2, capa) +
      par(70, 0) +
      par(62, COLOR_DE_CAPA[capa]) +
      par(6, 'CONTINUOUS');
  }
  s += par(0, 'ENDTAB');

  return s + par(0, 'ENDSEC');
}

function entidad(e: Entidad): string {
  if (e.tipo === 'linea') {
    return (
      par(0, 'LINE') +
      par(8, e.capa) +
      par(10, real(e.x1)) +
      par(20, real(e.y1)) +
      par(30, real(0)) +
      par(11, real(e.x2)) +
      par(21, real(e.y2)) +
      par(31, real(0))
    );
  }
  // El punto de alineación (11/21) sólo lo mira el CAD cuando la justificación
  // no es la de por defecto; se emite siempre igual a 10/20 para que el texto
  // centrado y el alineado a la izquierda compartan camino.
  let s =
    par(0, 'TEXT') +
    par(8, e.capa) +
    par(10, real(e.x)) +
    par(20, real(e.y)) +
    par(30, real(0)) +
    par(40, real(e.altura)) +
    par(1, dxfStr(e.texto)) +
    par(7, ESTILO_TEXTO);
  if (e.centrado) {
    s += par(72, 1) + par(11, real(e.x)) + par(21, real(e.y)) + par(31, real(0));
  }
  return s;
}

export function escribirDxf(d: Dibujo): string {
  const capas = [...new Set(d.entidades.map((e) => e.capa))].sort();
  return (
    cabecera(d) +
    tablas(d, capas.length ? capas : ['CUADRO-LINEAS']) +
    par(0, 'SECTION') +
    par(2, 'ENTITIES') +
    d.entidades.map(entidad).join('') +
    par(0, 'ENDSEC') +
    par(0, 'EOF')
  );
}

/** El DXF como fichero, ya en cp1252. */
export function dxfBlob(d: Dibujo): Blob {
  return new Blob([aLatin1(escribirDxf(d))], { type: 'image/vnd.dxf' });
}
