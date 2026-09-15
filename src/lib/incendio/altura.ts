/**
 * La altura de evacuación del edificio, que es la que entra en la tabla 3.1.
 *
 * El Anejo A del DB SI la define como «la máxima diferencia de cotas entre un
 * origen de evacuación y la salida de edificio que le corresponda», y añade
 * que «no se consideran las plantas más altas del edificio en las que
 * únicamente existan zonas de ocupación nula».
 *
 * CONVENIO DE ALTURAS. «La altura de una planta» significa dos cosas distintas
 * según quién lo diga, y de elegir mal salen cotas equivocadas en el canto de
 * un forjado por planta. Así que se admiten las dos y se dice cuál es:
 *
 *   TOTAL  —de la cara superior de su forjado a la cara superior del forjado de
 *           la planta de encima—. Es como se acotan los forjados en los planos
 *           de estructura, y lleva el canto dentro.
 *   LIBRE  —de la cara superior de su forjado a la cara inferior del forjado de
 *           encima—. Es la que se lee en una sección de arquitectura, y para
 *           subir a la planta siguiente hay que sumarle el canto de ESE forjado
 *           de encima, que «Cargas por planta» ya publica.
 *
 * De ahí la cota de cada forjado sale acumulando hacia arriba. La planta más
 * alta no necesita altura: no tiene forjado encima que medir.
 *
 * El ORIGEN DE COTAS es la cara superior del forjado de la planta de salida del
 * edificio: la más baja que no esté marcada «bajo rasante». Los sótanos quedan
 * con cota negativa, que es lo que hace que la evacuación ascendente salga con
 * su signo.
 */

/** Qué significa la altura que se teclea en cada planta. */
export type ModoAltura = 'total' | 'libre';

export interface PlantaParaAltura {
  nombre: string;
  /** m. Total o libre según el modo. `null` = sin decir. */
  altura: number | null;
  /** m. Canto del forjado de ESTA planta. Sólo se usa en modo libre. */
  canto: number | null;
  bajoRasante: boolean;
  /** ¿Es origen de evacuación? Falso en las plantas de ocupación nula. */
  cuenta: boolean;
}

export interface PlantaConCota extends PlantaParaAltura {
  /** m sobre la cara superior del forjado de la planta de salida. `null` = no se pudo acumular. */
  cota: number | null;
  /**
   * m. Lo que sube esta planta hasta el forjado de la de encima: en modo total
   * es la altura tal cual, y en modo libre la altura más el canto de arriba.
   * `null` en la más alta, y cuando falta algún dato.
   */
  subida: number | null;
  /** m. La otra altura, la que no se teclea, para enseñarla al lado. */
  otraAltura: number | null;
  /** m. El canto que se le ha sumado en modo libre. */
  cantoUsado: number | null;
  /** `true` en la planta de salida del edificio. */
  esSalida: boolean;
  /** `true` cuando no tiene forjado encima y por eso no se le pide altura. */
  esLaMasAlta: boolean;
}

export interface AlturasEdificio {
  /** Las plantas de abajo arriba, con su cota. */
  plantas: PlantaConCota[];
  /**
   * m. Altura de evacuación descendente: la cota del origen de evacuación más
   * alto. Es la que entra en la tabla 3.1. `null` si no se puede calcular, y
   * eso incluye la cadena de alturas cortada por debajo de un origen: no se
   * devuelve una altura «parcial», que sería más baja que la real.
   */
  descendente: number | null;
  /** m. Altura de evacuación ascendente, desde el sótano ocupado más bajo. Misma regla. */
  ascendente: number | null;
  /** Nombres de las plantas a las que les falta la altura para cerrar la cuenta. */
  sinAltura: string[];
  /** Lo que hay que decirle al proyectista antes de creerse el número. */
  avisos: string[];
}

/**
 * Las cotas y las dos alturas de evacuación.
 *
 * @param plantas DE ABAJO ARRIBA. Es el orden en que se acumulan las cotas, y
 *                el contrario al que publica «Cargas por planta».
 * @param modo    Qué significa la altura tecleada en cada planta.
 */
export function alturasDeEvacuacion(
  plantas: readonly PlantaParaAltura[],
  modo: ModoAltura = 'total',
): AlturasEdificio {
  const avisos: string[] = [];
  if (plantas.length === 0) {
    return { plantas: [], descendente: null, ascendente: null, sinAltura: [], avisos };
  }

  const ultima = plantas.length - 1;
  const iSalida = plantas.findIndex((p) => !p.bajoRasante);

  if (iSalida === -1) {
    avisos.push(
      'Todas las plantas están marcadas bajo rasante: sin planta de salida no hay cota de referencia.',
    );
  }

  const positivo = (v: number | null): number | null => (v !== null && v > 0 ? v : null);

  /**
   * Lo que sube la planta `i` hasta el forjado de la de encima.
   *
   * Tecleando la TOTAL es la altura tal cual. Tecleando la LIBRE hay que
   * sumarle el canto del forjado de ARRIBA —el de la planta `i+1`—, porque la
   * libre llega hasta la cara inferior de ese forjado y la cota se mide en su
   * cara superior.
   */
  const subidaDe = (i: number): number | null => {
    if (i >= ultima) return null;
    const h = positivo(plantas[i].altura);
    if (h === null) return null;
    if (modo === 'total') return h;
    const canto = positivo(plantas[i + 1].canto);
    return canto === null ? null : h + canto;
  };

  const subidas = plantas.map((_, i) => subidaDe(i));

  // A la más alta no se le pide altura: no tiene forjado encima que medir.
  const sinAltura = plantas
    .filter((p, i) => i !== ultima && positivo(p.altura) === null)
    .map((p) => p.nombre);

  // En modo libre, un canto que falta corta la cuenta igual que una altura.
  const sinCanto =
    modo === 'libre'
      ? plantas
          .filter((p, i) => i > 0 && positivo(plantas[i - 1].altura) !== null && positivo(p.canto) === null)
          .map((p) => p.nombre)
      : [];

  const base = iSalida === -1 ? 0 : iSalida;
  const cotas: (number | null)[] = plantas.map(() => null);
  cotas[base] = 0;

  for (let i = base; i < ultima; i++) {
    const previa = cotas[i];
    const sube = subidas[i];
    cotas[i + 1] = previa !== null && sube !== null ? previa + sube : null;
  }
  for (let i = base; i > 0; i--) {
    const actual = cotas[i];
    const sube = subidas[i - 1];
    cotas[i - 1] = actual !== null && sube !== null ? actual - sube : null;
  }

  const conCota: PlantaConCota[] = plantas.map((p, i) => {
    const cantoArriba = i < ultima ? positivo(plantas[i + 1].canto) : null;
    const h = positivo(p.altura);
    return {
      ...p,
      cota: cotas[i],
      subida: subidas[i],
      // La que NO se teclea, para poder enseñar las dos.
      otraAltura:
        i === ultima || h === null || cantoArriba === null
          ? null
          : modo === 'total'
            ? h - cantoArriba
            : h + cantoArriba,
      cantoUsado: modo === 'libre' ? cantoArriba : null,
      esSalida: i === iSalida,
      esLaMasAlta: i === ultima,
    };
  });

  // Un origen de evacuación SIN COTA es una cadena cortada, y entonces no hay
  // altura de evacuación: ni la de la tabla 3.1 ni ninguna. Devolver «la cota
  // más alta que se pudo acumular» daría un número más bajo que el real —una
  // planta en blanco a media altura deja fuera todas las de encima—, siempre
  // del lado inseguro y con la misma pinta que uno bueno. Las plantas que no
  // cuentan pueden quedarse sin cota sin cortar nada: no son origen.
  const encima = conCota.filter((p, i) => p.cuenta && i > iSalida);
  const debajo = conCota.filter((p, i) => p.cuenta && i < iSalida);
  const cortadaArriba = encima.some((p) => p.cota === null);
  const cortadaAbajo = debajo.some((p) => p.cota === null);
  const arriba = encima.map((p) => p.cota).filter((c): c is number => c !== null && c > 0);
  const abajo = debajo.map((p) => p.cota).filter((c): c is number => c !== null && c < 0);

  const descendente =
    iSalida === -1 || cortadaArriba ? null : arriba.length > 0 ? Math.max(...arriba) : 0;
  const ascendente =
    iSalida === -1 || cortadaAbajo ? null : abajo.length > 0 ? Math.abs(Math.min(...abajo)) : 0;

  const lista = (ns: string[]) =>
    ns.length === 1 ? ns[0] : `${ns.slice(0, -1).join(', ')} y ${ns[ns.length - 1]}`;

  if (sinAltura.length > 0) {
    const que = sinAltura.length === 1 ? `Falta la altura de ${sinAltura[0]}` : `Faltan las alturas de ${lista(sinAltura)}`;
    avisos.push(
      cortadaArriba || cortadaAbajo
        ? `${que}: sin ${sinAltura.length === 1 ? 'ella' : 'ellas'} no se puede cerrar la altura de evacuación.`
        : `${que}. No cambia la altura de evacuación, porque las plantas que se quedan sin cota no son origen de evacuación, pero la sección se dibuja sin ellas.`,
    );
  }
  if (sinCanto.length > 0) {
    avisos.push(
      `Tecleando alturas libres hace falta el canto del forjado de cada planta, y falta el de ${lista(sinCanto)}. Lo publica «Cargas por planta»; si allí hay zonas con cantos distintos, tecléelo aquí.`,
    );
  }
  if (descendente !== null && ascendente !== null && ascendente > 0) {
    avisos.push(
      `Hay evacuación ascendente desde ${ascendente.toFixed(2).replace('.', ',')} m bajo la planta de salida. La tabla 3.1 entra con la descendente; la ascendente cuenta en el coeficiente δc del Anejo B.`,
    );
  }
  const noCuentan = conCota.filter((p) => !p.cuenta).map((p) => p.nombre);
  if (noCuentan.length > 0) {
    avisos.push(
      `No se cuentan como origen de evacuación: ${noCuentan.join(', ')}. Compruébelo: sólo quedan fuera las plantas más altas con zonas de ocupación nula (Anejo A del DB SI).`,
    );
  }

  return { plantas: conCota, descendente, ascendente, sinAltura, avisos };
}

/** La banda de la tabla 3.1 en la que cae una altura de evacuación. */
export type BandaAltura = 'h15' | 'h28' | 'mas28';

export function bandaDeAltura(alturaEvacuacion: number): BandaAltura {
  if (alturaEvacuacion <= 15) return 'h15';
  if (alturaEvacuacion <= 28) return 'h28';
  return 'mas28';
}
