/**
 * Anchura de avance de cada carácter en Arial, para saber si un texto CABE.
 *
 * Existe porque un DXF no ajusta nada: si un texto no cabe en su celda, no se
 * recorta ni se envuelve, se SALE y pisa la siguiente. Estimar la anchura con
 * un factor por carácter ya falló una vez —el cuadro salía con «HA-30/B/20/XC2»
 * encima de «20,0 N/mm²»—, así que aquí se mide de verdad.
 *
 * **La trampa que costó el error: en AutoCAD la altura de un TEXT es la de una
 * MAYÚSCULA, no el cuerpo de la fuente.** En Arial la mayúscula mide 0,716 del
 * cuerpo, de modo que un texto de altura h se dibuja con glifos de un cuerpo
 * 1,4 veces mayor. Por eso los valores de aquí, que ya vienen divididos por esa
 * proporción, salen entre 0,6 y 0,9 y no entre 0,4 y 0,6.
 *
 * Los valores son milésimas de la altura del texto, para los 224 caracteres de
 * Latin-1 (32 a 255), que es todo lo que un DXF R12 sabe escribir. Medidos
 * sobre `C:\Windows\Fontsrial.ttf` con Pillow, normalizando por la caja de
 * la «H». Si algún día el cuadro cambia de fuente, esta tabla se regenera; con
 * otra fuente los textos no se salen, sobra o falta aire.
 */

const AVANCE_MILESIMAS = [
  388, 388, 496, 777, 777, 1242, 932, 267, 465, 465, 544, 816, 388, 465, 388, 388,  // 32-47  .!"#$%&'()*+,-./
  777, 777, 777, 777, 777, 777, 777, 777, 777, 777, 388, 388, 816, 816, 816, 777,  // 48-63  0123456789:;<=>?
  1418, 932, 932, 1009, 1009, 932, 853, 1087, 1009, 388, 698, 932, 777, 1164, 1009, 1087,  // 64-79  @ABCDEFGHIJKLMNO
  932, 1087, 1009, 932, 853, 1009, 932, 1319, 932, 932, 853, 388, 388, 388, 656, 777,  // 80-95  PQRSTUVWXYZ[\]^_
  465, 777, 777, 698, 777, 777, 388, 777, 777, 310, 310, 698, 310, 1164, 777, 777,  // 96-111  `abcdefghijklmno
  777, 777, 465, 698, 388, 777, 698, 1009, 698, 698, 698, 467, 363, 467, 816, 1048,  // 112-127  pqrstuvwxyz{|}~.
  1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048,  // 128-143  ................
  1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048, 1048,  // 144-159  ................
  388, 465, 777, 777, 777, 777, 363, 777, 465, 1029, 517, 777, 816, 465, 1029, 771,  // 160-175  ................
  559, 767, 465, 465, 465, 805, 750, 465, 465, 465, 510, 777, 1165, 1165, 1165, 853,  // 176-191  ................
  932, 932, 932, 932, 932, 932, 1397, 1009, 932, 932, 932, 932, 388, 388, 388, 388,  // 192-207  ................
  1009, 1009, 1087, 1087, 1087, 1087, 1087, 816, 1087, 1009, 1009, 1009, 1009, 932, 932, 853,  // 208-223  ................
  777, 777, 777, 777, 777, 777, 1242, 698, 777, 777, 777, 777, 388, 388, 388, 388,  // 224-239  ................
  777, 777, 777, 777, 777, 777, 777, 767, 853, 777, 777, 777, 777, 698, 777, 698,  // 240-255  ................
];

/** Anchura de `texto` dibujado a la altura `altura`, en unidades de dibujo. */
export function anchoDeTexto(texto: string, altura: number): number {
  let mil = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    // Lo que no es Latin-1 no llega hasta aquí (`dxfStr` lo mapea antes); si
    // llegara, se le da el ancho de la «M», que es de los más anchos.
    mil += c >= 32 && c < 256 ? AVANCE_MILESIMAS[c - 32] : AVANCE_MILESIMAS[77 - 32];
  }
  return (mil / 1000) * altura;
}
