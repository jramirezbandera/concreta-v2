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
    par(0, 'ENDSEC')
  );
}

function tablas(capas: Capa[]): string {
  let s = par(0, 'SECTION') + par(2, 'TABLES');

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
    tablas(capas.length ? capas : ['CUADRO-LINEAS']) +
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
