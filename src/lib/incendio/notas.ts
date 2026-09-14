/**
 * La redacción de la resistencia al fuego exigida.
 *
 * Vivía en `lib/materiales/cuadros.ts`, junto a la tabla de coeficientes de
 * minoración que la lleva impresa. Se muda aquí con el módulo de incendio,
 * pero SIGUE SIENDO UNA FUNCIÓN PURA DE DOS ARGUMENTOS, y eso es lo que
 * deshace el nudo: la frase necesita las exigencias (que ahora son de este
 * módulo) y qué materiales tiene la obra (que son del cuadro de materiales),
 * y ninguno de los dos puede leer el estado del otro.
 *
 * Así que cada quien la llama con lo que tiene a mano:
 *
 * - el cuadro de materiales, con sus propios materiales y con las exigencias
 *   leídas del sobre `concreta-pub-incendio`;
 * - el documento de incendio, con sus propias exigencias y con los materiales
 *   deducidos de sus elementos (o del sobre de materiales si aún no hay);
 * - la ficha del DB SE, con los dos sobres.
 *
 * `MaterialesPresentes` se declara AQUÍ, no en `lib/materiales/cuadros.ts`
 * donde nació: si se quedara allí, `cuadros.ts` importaría el valor
 * `notasResistenciaFuego` de este fichero y este fichero importaría el tipo de
 * aquél, y eso es un ciclo. `cuadros.ts` lo re-exporta para que sus veintitantos
 * importadores sigan valiendo tal cual.
 *
 * REGLA: `lib/materiales/*` y `lib/memoria/*` importan de las HOJAS de
 * `lib/incendio` (`../incendio/notas`, `../incendio/exigencias`), NUNCA del
 * barrel `../incendio`. `lib/materiales/cuadros.ts` re-exporta `Block` y lo
 * importan veintitantos ficheros: colar el barrel por ahí metería los anejos B,
 * C y D en todos los chunks de la app.
 */

import { AMBITO_TODA_LA_ESTRUCTURA, fraseAmbito, type ExigenciaFuego } from './exigencias';

/** Qué materiales tiene la obra. Decide las filas de la tabla de γM y las letras de anejo de la nota de fuego. */
export interface MaterialesPresentes {
  maderaLaminada?: boolean;
  maderaMaciza?: boolean;
  aceroLaminado?: boolean;
  aceroDeArmar?: boolean;
  hormigon?: boolean;
}

/**
 * De qué está hecha la obra, según el sobre del cuadro de materiales.
 *
 * El argumento se tipa por su FORMA y no como `PubMateriales`, que vive en
 * `features/materiales/state.ts`: `lib/` no importa de `features/`, ni siquiera
 * un tipo, si puede evitarlo. Con el tipado estructural de TypeScript un
 * `PubMateriales` encaja aquí sin que este fichero sepa que existe.
 *
 * Lo usan los dos consumidores de la nota —la ficha del DB SE y el módulo de
 * incendio—, que antes deducían los materiales cada uno por su cuenta con el
 * mismo código copiado. `aceroDeArmar` va atado al hormigón a propósito: si hay
 * hormigón armado hay acero de armar, y el sobre no lo publica aparte.
 */
export function presentesDeSobre(
  d: {
    hormigon: unknown;
    aceroEstructural: unknown;
    madera: { grupos: readonly { tipo: string }[] } | null;
  } | null,
): MaterialesPresentes {
  if (!d) return {};
  return {
    hormigon: d.hormigon !== null,
    aceroDeArmar: d.hormigon !== null,
    aceroLaminado: d.aceroEstructural !== null,
    maderaLaminada: d.madera?.grupos.some((g) => g.tipo === 'laminada') ?? false,
    maderaMaciza: d.madera?.grupos.some((g) => g.tipo === 'maciza') ?? false,
  };
}

/**
 * Anejo del DB SI que trae las tablas y los métodos simplificados de cada
 * material. La nota de fuego cita sólo los de los materiales presentes.
 */
const ANEJO_FUEGO_DB_SI: [keyof MaterialesPresentes, string][] = [
  ['hormigon', 'C'],
  ['aceroLaminado', 'D'],
  ['maderaLaminada', 'E'],
  ['maderaMaciza', 'E'],
];

/**
 * La rama de cero letras —«de los anejos C a F»— ya no es teórica: desde que
 * las exigencias viven en su propio módulo, la ficha del DB SE puede tener
 * sobre de incendio y no tenerlo de materiales, y entonces no sabe de qué está
 * hecha la obra. Se escribió para este caso y hasta ahora no la alcanzaba nadie.
 */
export function anejosFuego(presentes: MaterialesPresentes): string {
  const letras = [...new Set(ANEJO_FUEGO_DB_SI.filter(([c]) => presentes[c]).map(([, l]) => l))];
  // Contraído: la frase dice «los métodos simplificados …», y sin el «de» salía
  // «los métodos simplificados el anejo C del DB SI» en todo documento.
  if (letras.length === 0) return 'de los anejos C a F';
  if (letras.length === 1) return `del anejo ${letras[0]}`;
  return `de los anejos ${letras.slice(0, -1).join(', ')} y ${letras[letras.length - 1]}`;
}

/**
 * La R exigida (R30, R60…) la fija el DB SI 6 según uso y altura de
 * evacuación, y es un dato de la obra: sólo se imprime lo que se haya
 * indicado. El oráculo decía «R30» y así salía en todos los documentos.
 *
 * Y no es UNA cifra: el DB SI 6 tiene columna aparte para las plantas de
 * sótano y regla propia para la cubierta ligera, así que lo corriente es el
 * sótano con aparcamiento por un lado, las plantas sobre rasante por otro y la
 * cubierta por un tercero. Con una sola exigencia —la que hereda lo guardado
 * antes, con ámbito «toda la estructura»— la nota se redacta como siempre; con
 * varias, se enumeran.
 *
 * La nota NO certifica que «la estructura será R30»: el DB SI 6 §6.1 admite
 * justificar la R con las tablas o los métodos de los anejos C a F, y esos
 * mismos anejos (C.2.4 capas protectoras, D acero revestido, E.2.3.2 madera
 * protegida) permiten alcanzarla con protecciones añadidas. Las dos vías son
 * válidas y cuál se adopta lo decide el proyecto elemento a elemento, así que
 * el cuadro deja las dos abiertas en vez de comprometer la sección desnuda.
 */
export function notasResistenciaFuego(
  presentes: MaterialesPresentes,
  fuego: readonly ExigenciaFuego[],
): string[] {
  if (fuego.length === 0) return [];

  // Con una sola cifra en toda la obra la frase puede hablar de «dicha
  // resistencia»; con varias hay que decir en cuál de ellas, y el objetivo de
  // las protecciones deja de ser un número concreto.
  const valores = [...new Set(fuego.map((e) => e.minutos))];
  const unica = valores.length === 1 ? `R${valores[0]}` : null;
  const todaLaObra = fuego.length === 1 && fuego[0].ambito === AMBITO_TODA_LA_ESTRUCTURA;

  return [
    todaLaObra
      ? `Resistencia al fuego exigida a la estructura: R${fuego[0].minutos}, según el CTE DB SI 6 (tabla 3.1).`
      : `Resistencia al fuego exigida a la estructura, según el CTE DB SI 6 (tabla 3.1): ${fuego
          .map((e) => `R${e.minutos} en ${fraseAmbito(e.ambito)}`)
          .join('; ')}.`,
    `${
      unica
        ? 'La estructura alcanzará dicha resistencia'
        : 'La estructura alcanzará en cada zona la resistencia exigida'
    } bien por su propia configuración —dimensiones de la sección y recubrimientos, comprobados con las tablas o los métodos simplificados ${anejosFuego(presentes)} del DB SI—, bien disponiendo protecciones adicionales (morteros o placas de protección, pinturas intumescentes u otros revestimientos) que garanticen ${unica ?? 'la resistencia exigida'} en los elementos que no la alcancen por sí mismos. Ambas vías son válidas; la contribución de las protecciones se justificará por ensayo (UNE-EN 13381) o por su marcado CE.`,
  ];
}
