/**
 * Las exigencias de resistencia al fuego de una obra.
 *
 * El DB SI 6 no le exige UNA R a la estructura: la exige por plantas y por
 * usos, y la tabla 3.1 tiene columna propia para las plantas de sótano. Un
 * edificio corriente sale con tres cifras distintas —el sótano con el
 * aparcamiento por un lado, las plantas sobre rasante por otro, y la cubierta
 * ligera con su propia regla— y con un solo campo no se podía decir.
 *
 * Aquí viven la forma del dato y los ámbitos habituales; la redacción de la
 * nota está en `cuadros.ts`, junto a la tabla de coeficientes que la lleva.
 *
 * El ámbito es TEXTO, no un id: la lista de abajo son atajos, pero un proyecto
 * puede exigir R90 a «los soportes del voladizo de la cafetería» y eso no se
 * enumera. Lo que la lista añade es la forma en prosa —«el sótano», no
 * «Sótano»—, que es la que entra en la frase del cuadro; el texto libre viaja
 * tal como se escribió.
 */

/** Una exigencia resuelta: la que ya se puede imprimir. */
export interface ExigenciaFuego {
  /** Parte de la estructura a la que se le exige esa R, en lenguaje de obra. */
  ambito: string;
  /** R exigida, en minutos. */
  minutos: number;
}

/**
 * El ámbito que reproduce el comportamiento anterior del módulo: una sola R
 * para todo. Es el que hereda lo guardado con el esquema viejo, y con él la
 * nota se redacta exactamente igual que antes.
 */
export const AMBITO_TODA_LA_ESTRUCTURA = 'Toda la estructura';

/**
 * Ámbitos habituales, con su forma en prosa. Son rótulos de zona, no valores
 * de la tabla 3.1: la R la sigue eligiendo el proyectista, porque la fija el
 * proyecto de incendios y no este módulo.
 */
export const AMBITOS_FUEGO: readonly { etiqueta: string; frase: string }[] = [
  { etiqueta: AMBITO_TODA_LA_ESTRUCTURA, frase: 'toda la estructura' },
  { etiqueta: 'Plantas sobre rasante', frase: 'las plantas sobre rasante' },
  { etiqueta: 'Plantas de sótano', frase: 'las plantas de sótano' },
  { etiqueta: 'Sótano con aparcamiento', frase: 'el sótano con aparcamiento' },
  { etiqueta: 'Aparcamiento', frase: 'el aparcamiento' },
  { etiqueta: 'Cubierta ligera', frase: 'la cubierta ligera' },
  { etiqueta: 'Soportes de la cubierta ligera', frase: 'los soportes de la cubierta ligera' },
  { etiqueta: 'Escaleras y zonas protegidas', frase: 'las escaleras y las zonas protegidas' },
  { etiqueta: 'Zonas de riesgo especial', frase: 'las zonas de riesgo especial' },
] as const;

/** Cómo se nombra el ámbito dentro de la frase del cuadro. */
export function fraseAmbito(ambito: string): string {
  const preset = AMBITOS_FUEGO.find((a) => a.etiqueta === ambito);
  return preset ? preset.frase : ambito.trim();
}

/**
 * Las exigencias que se pueden imprimir. Una fila a medio rellenar —ámbito en
 * blanco, o R sin elegir— es un hueco rojo del formulario y bloquea exportar,
 * pero el documento se sigue viendo en pantalla mientras se rellena: sin este
 * filtro saldría «R60 en .» en la nota.
 */
export function exigenciasResueltas(
  filas: readonly { ambito: string; minutos: number | null }[],
): ExigenciaFuego[] {
  return filas
    .filter((f) => f.ambito.trim() !== '' && f.minutos !== null)
    .map((f) => ({ ambito: f.ambito.trim(), minutos: f.minutos as number }));
}
