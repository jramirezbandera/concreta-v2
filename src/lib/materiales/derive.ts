/**
 * Motor de derivación del cuadro de materiales.
 *
 * Entra la situación de obra en lenguaje llano; sale la prescripción normativa
 * con su referencia. Ninguna función de este fichero contiene un número de la
 * norma: todos vienen de `tablasCE.ts` y `tablasMadera.ts`.
 *
 * Cuando la norma no da un valor (casillas `*` de las tablas 44.2.1.1.b, 44.3 y
 * 44.4, o clases XA2/XA3), el motor devuelve `null` y un mensaje de error. No
 * inventa el número: un recubrimiento inventado en un plano es peor que un
 * hueco rojo.
 */

import {
  AC_MAX,
  CEMENTO_MAX_XM,
  CEMENTO_MIN,
  CMIN_CLORUROS_ARMADO,
  CMIN_CLORUROS_PRETENSADO,
  CMIN_X0,
  CMIN_XA1,
  CMIN_XC123,
  CMIN_XC4,
  CMIN_XF13,
  CMIN_XF24,
  CONSISTENCIAS,
  CLASE_EJECUCION,
  DELTA_CDEV,
  FCK_MIN,
  GAMMA_MATERIALES,
  ORDEN_CLASES,
  SOBREESPESOR_XM,
  familiaCarbonatacion,
  familiaCloruros,
  familiaXA1,
  familiaXF,
} from './tablasCE';
import {
  DURABILIDAD_ESPECIES,
  DURABILIDAD_EXIGIDA_EN460,
  GAMMA_M_EXTRAORDINARIA,
  GAMMA_M_MADERA,
  PROTECCION_HERRAJES,
  PROTECCION_POR_CLASE_USO,
  SITUACION_MADERA,
} from './tablasMadera';
import type {
  CategoriaEjecucion,
  CategoriaUso,
  ClaseExposicion,
  DerivacionAcero,
  DerivacionHormigon,
  DerivacionMadera,
  ElementoAcero,
  ElementoHormigon,
  GrupoMadera,
  Mensaje,
  NivelRiesgo,
  NotaCuadro,
  OpcionesObra,
  SituacionElemento,
  TipoHormigon,
  Traza,
} from './types';

// ── 1. Situación de obra → clases de exposición (CE tabla 27.1.a) ───────────

const CLASE_POR_UBICACION: Record<SituacionElemento['ubicacion'], ClaseExposicion> = {
  interior_muy_seco: 'X0',
  interior_seco: 'XC1',
  sumergido_agua_no_agresiva: 'XC1',
  enterrado: 'XC2',
  interior_humedo: 'XC3',
  exterior_protegido: 'XC3',
  exterior_lluvia: 'XC4',
};

const CLASE_POR_MARINO = {
  aereo: 'XS1',
  sumergido: 'XS2',
  carrera_mareas: 'XS3',
} as const;

const CLASE_POR_CLORUROS = {
  aerosoles: 'XD1',
  piscina: 'XD2',
  salpicaduras: 'XD3',
} as const;

const CLASE_POR_HELADA = {
  moderada: 'XF1',
  moderada_con_sales: 'XF2',
  alta: 'XF3',
  alta_con_sales: 'XF4',
} as const;

const CLASE_POR_QUIMICO = {
  debil: 'XA1',
  moderada: 'XA2',
  alta: 'XA3',
} as const;

const CLASE_POR_EROSION = {
  moderada: 'XM1',
  intensa: 'XM2',
  extrema: 'XM3',
} as const;

/**
 * Traduce la situación de obra a clases de exposición.
 *
 * Para hormigón en masa se omiten las clases de corrosión (XC, XS, XD): la
 * tabla 43.2.1.a las deja en blanco y la 27.1.a dice que en masa la clase es X0
 * «salvo donde haya ataque hielo/deshielo, abrasión o ataque químico».
 */
export function clasesDeExposicion(
  situacion: SituacionElemento,
  tipoHormigon: TipoHormigon,
  opciones: { costa?: boolean; expuestoAireExterior?: boolean } = {},
): ClaseExposicion[] {
  const clases = new Set<ClaseExposicion>();
  const conArmadura = tipoHormigon !== 'masa';

  if (conArmadura) {
    clases.add(CLASE_POR_UBICACION[situacion.ubicacion]);

    const marino = situacion.marino ?? 'ninguno';
    if (marino !== 'ninguno') {
      clases.add(CLASE_POR_MARINO[marino]);
    } else if (opciones.costa && opciones.expuestoAireExterior) {
      // CE 27.1.a: «en general, la clase XS1 se aplicará en estructuras marinas
      // aéreas ubicadas a menos de 5 km de la costa».
      clases.add('XS1');
    }

    const cloruros = situacion.cloruros ?? 'ninguno';
    if (cloruros !== 'ninguno') clases.add(CLASE_POR_CLORUROS[cloruros]);
  }

  const helada = situacion.helada ?? 'ninguna';
  if (helada !== 'ninguna') clases.add(CLASE_POR_HELADA[helada]);

  const quimico = situacion.quimico ?? 'ninguna';
  if (quimico !== 'ninguna') clases.add(CLASE_POR_QUIMICO[quimico]);

  const erosion = situacion.erosion ?? 'ninguna';
  if (erosion !== 'ninguna') clases.add(CLASE_POR_EROSION[erosion]);

  // En masa sin ataques específicos la clase es X0.
  if (clases.size === 0) clases.add('X0');

  return ORDEN_CLASES.filter((c) => clases.has(c));
}

// ── 2. Dosificación (CE tablas 43.2.1.a y 43.2.1.b) ────────────────────────

export interface Dosificacion {
  acMax: number | null;
  cementoMin: number | null;
  fckMin: number | null;
}

/**
 * CE 43.2.1: «cuando el elemento esté expuesto a más de una clase de exposición
 * se procederá fijando para cada parámetro el criterio más exigente». Más
 * exigente es a/c menor y contenido de cemento mayor, y se decide parámetro a
 * parámetro — no eligiendo una clase «dominante» y leyendo su fila entera.
 */
export function dosificacion(
  clases: ClaseExposicion[],
  tipoHormigon: TipoHormigon,
): Dosificacion {
  const ac = clases.map((c) => AC_MAX[tipoHormigon][c]).filter((v): v is number => v !== null);
  const cem = clases.map((c) => CEMENTO_MIN[tipoHormigon][c]).filter((v): v is number => v !== null);
  const fck = clases.map((c) => FCK_MIN[tipoHormigon][c]).filter((v): v is number => v !== null);

  return {
    acMax: ac.length ? Math.min(...ac) : null,
    cementoMin: cem.length ? Math.max(...cem) : null,
    fckMin: fck.length ? Math.max(...fck) : null,
  };
}

/** CE tabla 43.3.5 — sólo aplica si hay alguna clase XM. */
export function cementoMaximo(
  clases: ClaseExposicion[],
  tamMaxArido: number,
): number | null {
  if (!clases.some((c) => c.startsWith('XM'))) return null;
  const fila =
    CEMENTO_MAX_XM.find((f) => f.tamMaxArido >= tamMaxArido) ??
    CEMENTO_MAX_XM[CEMENTO_MAX_XM.length - 1];
  return fila.cementoMax;
}

// ── 3. Recubrimiento (CE tablas 44.2.1.1.a/b, 44.3, 44.4, 44.5 y 43.4.1) ───

interface ResultadoCmin {
  cmin: number | null;
  mensajes: Mensaje[];
  /** Sobre-espesor de la tabla 44.5, que se SUMA (no se compara). */
  sobreespesorXM: number;
  /**
   * El cmin que pide cada clase por separado. El cuadro sólo imprime el máximo,
   * pero un elemento con dos clases suele tener caras a las que sólo le aplica
   * la menos exigente — el «40 / 35 mm» de los muros de ABAYALDE es eso — y sin
   * el desglose no hay forma de escribir esa nota.
   */
  porClase: { clase: ClaseExposicion; cmin: number }[];
}

function cminPorClase(
  clase: ClaseExposicion,
  fck: number,
  tipoHormigon: TipoHormigon,
  opciones: OpcionesObra,
): { valor: number | null; mensaje?: Mensaje } {
  const { vidaUtil, cemento } = opciones;
  const microsilice = opciones.microsilice ?? false;
  const cenizas = opciones.cenizasVolantes ?? false;
  const conAdiciones = microsilice || cenizas;
  const fckAlta = fck >= 40;

  if (clase === 'X0') {
    if (fck < 25) {
      return {
        valor: null,
        mensaje: {
          severidad: 'error',
          texto: `La tabla 44.2.1.1.a sólo tabula X0 para fck ≥ 25 N/mm²; aquí fck = ${fck}.`,
          referencia: 'CE tabla 44.2.1.1.a',
        },
      };
    }
    return { valor: CMIN_X0[vidaUtil] };
  }

  if (clase === 'XC1' || clase === 'XC2' || clase === 'XC3' || clase === 'XC4') {
    const familia = familiaCarbonatacion(cemento, conAdiciones);
    const tabla = clase === 'XC4' ? CMIN_XC4 : CMIN_XC123;
    const fila = tabla.find((f) => f.familia === familia && f.fckAlta === fckAlta);
    return { valor: fila ? fila.cmin[vidaUtil] : null };
  }

  if (clase.startsWith('XS') || clase.startsWith('XD')) {
    const columna = clase.startsWith('XD') ? 'XD' : (clase as 'XS1' | 'XS2' | 'XS3');
    const valor =
      tipoHormigon === 'pretensado'
        ? CMIN_CLORUROS_PRETENSADO[
            cemento === 'CEM II/A-D' || microsilice ? 'A' : 'resto'
          ][vidaUtil][columna]
        : CMIN_CLORUROS_ARMADO[familiaCloruros(cemento, microsilice, cenizas)][vidaUtil][columna];
    if (valor === null) {
      return {
        valor: null,
        mensaje: {
          severidad: 'error',
          texto: `Con ${cemento} y vida útil ${vidaUtil} años, la tabla 44.2.1.1.b marca ${clase} con «*»: obligaría a un recubrimiento excesivo. Cambie el tipo de cemento o encargue un estudio específico.`,
          referencia: 'CE tabla 44.2.1.1.b',
        },
      };
    }
    return { valor };
  }

  if (clase.startsWith('XF')) {
    const familia = familiaXF(cemento, conAdiciones);
    const tabla = clase === 'XF1' || clase === 'XF3' ? CMIN_XF13 : CMIN_XF24;
    const fila = tabla.find((f) => f.familia === familia && f.fckAlta === fckAlta);
    const valor = fila ? fila.cmin[vidaUtil] : null;
    if (valor === null) {
      return {
        valor: null,
        mensaje: {
          severidad: 'error',
          texto: `Con ${cemento} y vida útil ${vidaUtil} años, la tabla 44.3 marca ${clase} con «*»: recubrimiento excesivo.`,
          referencia: 'CE tabla 44.3',
        },
      };
    }
    return { valor };
  }

  if (clase === 'XA1') {
    const valor = CMIN_XA1[familiaXA1(cemento, microsilice, cenizas)][vidaUtil];
    if (valor === null) {
      return {
        valor: null,
        mensaje: {
          severidad: 'error',
          texto: `Para XA1 la tabla 44.4 sólo tabula CEM III, CEM IV, CEM II/B-S, B-P, B-V, A-D o adiciones; con ${cemento} está marcado «*».`,
          referencia: 'CE tabla 44.4',
        },
      };
    }
    return { valor };
  }

  if (clase === 'XA2' || clase === 'XA3') {
    return {
      valor: null,
      mensaje: {
        severidad: 'error',
        texto: `${clase}: la tabla 44.4 remite al autor del proyecto, que debe fijar el recubrimiento mínimo y las medidas adicionales frente a la agresión química concreta.`,
        referencia: 'CE tabla 44.4, nota (1)',
      },
    };
  }

  // XM1..XM3 no dan cmin: dan sobre-espesor (tabla 44.5). Se tratan aparte.
  return { valor: null };
}

/** Recubrimiento mínimo por durabilidad: el máximo entre las clases presentes. */
export function recubrimientoDurabilidad(
  clases: ClaseExposicion[],
  fck: number,
  tipoHormigon: TipoHormigon,
  opciones: OpcionesObra,
): ResultadoCmin {
  const mensajes: Mensaje[] = [];
  const porClase: { clase: ClaseExposicion; cmin: number }[] = [];
  let sobreespesorXM = 0;

  for (const clase of clases) {
    if (clase === 'XM1' || clase === 'XM2' || clase === 'XM3') {
      sobreespesorXM = Math.max(sobreespesorXM, SOBREESPESOR_XM[clase]);
      continue;
    }
    const { valor, mensaje } = cminPorClase(clase, fck, tipoHormigon, opciones);
    if (mensaje) mensajes.push(mensaje);
    if (valor !== null) porClase.push({ clase, cmin: valor });
  }

  return {
    cmin: porClase.length ? Math.max(...porClase.map((c) => c.cmin)) : null,
    mensajes,
    sobreespesorXM,
    porClase,
  };
}

/**
 * Redondeo a múltiplo de 5 mm hacia arriba. NO es normativo: es la convención
 * de plano del estudio, y sólo puede subir el recubrimiento, nunca bajarlo.
 * Con los valores tabulados (múltiplos de 5) y Δcdev ∈ {0, 5, 10} no cambia
 * nada; sólo actúa cuando manda el cmin por adherencia (ø o 0,8·TM del árido).
 */
function redondearA5(mm: number): number {
  return Math.ceil(mm / 5) * 5;
}

// ── 4. Derivación completa de un elemento de hormigón ───────────────────────

export function deriveHormigon(
  elemento: ElementoHormigon,
  opciones: OpcionesObra,
): DerivacionHormigon {
  const mensajes: Mensaje[] = [];
  const notas: NotaCuadro[] = [];
  const trazas: Traza[] = [];

  const clasesForzadas = !!elemento.clasesForzadas?.length;
  const clases = clasesForzadas
    ? ORDEN_CLASES.filter((c) => elemento.clasesForzadas!.includes(c))
    : clasesDeExposicion(elemento.situacion, elemento.tipoHormigon, {
        costa: opciones.costa,
        expuestoAireExterior: elemento.expuestoAireExterior,
      });

  trazas.push({
    referencia: 'CE tabla 27.1.a',
    explicacion: clasesForzadas
      ? `Clases fijadas a mano: ${clases.join(' + ')}.`
      : `De la situación declarada salen las clases ${clases.join(' + ')}.`,
  });

  const dosis = dosificacion(clases, elemento.tipoHormigon);
  trazas.push({
    referencia: 'CE tabla 43.2.1.a',
    explicacion:
      dosis.cementoMin !== null
        ? `Contenido mínimo de cemento ${dosis.cementoMin} kg/m³ y relación agua/cemento máxima ${dosis.acMax}, tomando el criterio más exigente de entre las clases presentes.`
        : 'La tabla no prescribe dosificación para estas clases.',
  });

  const fckMin = dosis.fckMin;
  const fckAdoptada = fckMin !== null ? Math.max(elemento.fckEspecificada, fckMin) : elemento.fckEspecificada;
  if (fckMin !== null && elemento.fckEspecificada < fckMin) {
    mensajes.push({
      severidad: 'aviso',
      texto: `La resistencia especificada (HA-${elemento.fckEspecificada}) es inferior a la mínima esperada para ${clases.join(' + ')} (${fckMin} N/mm²). Prevalece la de durabilidad: se prescribe ${fckAdoptada} N/mm².`,
      referencia: 'CE 43.2.1 y tabla 43.2.1.b',
    });
  }

  const cementoMax = cementoMaximo(clases, elemento.tamMaxArido);
  if (cementoMax !== null && dosis.cementoMin !== null && dosis.cementoMin > cementoMax) {
    mensajes.push({
      severidad: 'error',
      texto: `El contenido mínimo de cemento (${dosis.cementoMin} kg/m³) supera el máximo admisible por erosión con árido de ${elemento.tamMaxArido} mm (${cementoMax} kg/m³).`,
      referencia: 'CE tablas 43.2.1.a y 43.3.5',
    });
  }

  const durabilidad = recubrimientoDurabilidad(clases, fckAdoptada, elemento.tipoHormigon, opciones);
  mensajes.push(...durabilidad.mensajes);

  // CE 44.2.1.1 a): el recubrimiento ha de ser ≥ ø de la barra y ≥ 0,80·TM del árido.
  const cminAdherencia = Math.max(
    elemento.diametroArmadura ?? 0,
    0.8 * elemento.tamMaxArido,
  );

  const cminDurabilidad =
    durabilidad.cmin !== null ? durabilidad.cmin + durabilidad.sobreespesorXM : null;

  const cmin = Math.max(cminDurabilidad ?? 0, cminAdherencia);
  const deltaCdev = DELTA_CDEV[opciones.nivelControlEjecucion];
  const cnom = elemento.tipoHormigon === 'masa' ? 0 : redondearA5(cmin + deltaCdev);

  if (cminDurabilidad !== null) {
    trazas.push({
      referencia: 'CE tablas 44.2.1.1.a/b y 43.4.1',
      explicacion: `Recubrimiento mínimo por durabilidad ${cminDurabilidad} mm; por adherencia ${cminAdherencia} mm (ø y 0,8·TM). cnom = ${cmin} + Δcdev ${deltaCdev} = ${cnom} mm.`,
    });
  }
  if (durabilidad.sobreespesorXM > 0) {
    trazas.push({
      referencia: 'CE tabla 44.5',
      explicacion: `Sobre-espesor por erosión: +${durabilidad.sobreespesorXM} mm sobre el recubrimiento del resto de criterios.`,
    });
  }

  // Nota por caras: cuando una clase pide bastante más recubrimiento que otra,
  // el número del cuadro es el de la cara más castigada y conviene decirlo.
  if (durabilidad.porClase.length > 1 && elemento.tipoHormigon !== 'masa') {
    const orden = [...durabilidad.porClase].sort((a, b) => b.cmin - a.cmin);
    const gobierna = orden[0];
    const menor = orden[orden.length - 1];
    if (gobierna.cmin - menor.cmin >= 5) {
      const alternativo = redondearA5(
        Math.max(menor.cmin + durabilidad.sobreespesorXM, cminAdherencia) + deltaCdev,
      );
      notas.push({
        texto: `El recubrimiento de ${cnom} mm lo exige la clase ${gobierna.clase}; en las caras no expuestas a ese ambiente bastaría ${alternativo} mm (${menor.clase}).`,
        columna: 'recubrimiento',
      });
    }
  }

  if (elemento.contraTerreno && !elemento.conHormigonLimpieza) {
    notas.push({ texto: 'Contra el terreno: 70 mm.', columna: 'recubrimiento' });
    trazas.push({
      referencia: 'CE 44.2.1.1',
      explicacion:
        'En piezas hormigonadas contra el terreno el recubrimiento mínimo será 70 mm, salvo que se haya preparado el terreno y dispuesto un hormigón de limpieza.',
    });
  }
  if (elemento.hidrofugo) {
    notas.push({ texto: 'Se dispondrá hormigón hidrófugo.', columna: 'localizacion' });
  }
  if (cnom > 50 && elemento.tipoHormigon !== 'masa') {
    notas.push({
      texto:
        'Recubrimiento superior a 50 mm: valórese disponer una malla de reparto de ø ≤ 12 mm en medio del espesor del recubrimiento, con cuantía del 5 ‰ del área del recubrimiento.',
      columna: 'recubrimiento',
    });
  }

  const gammaC = GAMMA_MATERIALES.hormigon.persistente;
  const prefijo = elemento.tipoHormigon === 'masa' ? 'HM' : elemento.tipoHormigon === 'pretensado' ? 'HP' : 'HA';
  const ambiente = clases.join('+');
  const tipificacion = `${prefijo}-${fckAdoptada}/${CONSISTENCIAS[elemento.consistencia].letra}/${elemento.tamMaxArido}/${ambiente}`;

  trazas.push({
    referencia: 'CE 33.6',
    explicacion: `Tipificación T-R/C/TM/A: ${tipificacion}.`,
  });

  return {
    elemento,
    clases,
    clasesForzadas,
    acMax: dosis.acMax,
    cementoMin: dosis.cementoMin,
    cementoMax,
    fckMin,
    fckAdoptada,
    cminDurabilidad,
    cminAdherencia,
    cmin,
    deltaCdev,
    cnom,
    tipificacion,
    fcd: fckAdoptada / gammaC,
    notas,
    mensajes,
    trazas,
  };
}

// ── 5. Acero estructural (CE tabla 91.1) ───────────────────────────────────

export interface EntradaAcero {
  nivelRiesgo: NivelRiesgo;
  categoriaUso: CategoriaUso;
  categoriaEjecucion: CategoriaEjecucion;
  elementos: ElementoAcero[];
}

export function deriveAcero(entrada: EntradaAcero): DerivacionAcero {
  const clave = `${entrada.nivelRiesgo}|${entrada.categoriaUso}|${entrada.categoriaEjecucion}`;
  const claseEjecucion = CLASE_EJECUCION[clave];

  return {
    nivelRiesgo: entrada.nivelRiesgo,
    categoriaUso: entrada.categoriaUso,
    categoriaEjecucion: entrada.categoriaEjecucion,
    claseEjecucion,
    elementos: entrada.elementos,
    trazas: [
      {
        referencia: 'CE tabla 91.1',
        explicacion: `Nivel de riesgo ${entrada.nivelRiesgo} + categoría de uso ${entrada.categoriaUso} + categoría de ejecución ${entrada.categoriaEjecucion} → clase de ejecución EXC${claseEjecucion}.`,
      },
    ],
  };
}

// ── 6. Madera (DB SE-M) ────────────────────────────────────────────────────

export function deriveMadera(grupo: GrupoMadera): DerivacionMadera {
  const mensajes: Mensaje[] = [];
  const notas: string[] = [];
  const trazas: Traza[] = [];

  const base = SITUACION_MADERA[grupo.situacion];
  const claseServicioForzada = grupo.claseServicioForzada !== undefined;
  const claseServicio = grupo.claseServicioForzada ?? base.claseServicio;
  const claseUso = base.claseUso;

  trazas.push({
    referencia: 'DB SE-M 2.2.2.2 y 3.2.1.2',
    explicacion: `«${base.etiqueta}» → clase de servicio ${claseServicio} y clase de uso ${claseUso}.`,
  });

  const proteccion = PROTECCION_POR_CLASE_USO[claseUso];
  if (proteccion.nota) notas.push(proteccion.nota);

  const gammaM = GAMMA_M_MADERA[grupo.tipo];
  trazas.push({
    referencia: 'DB SE-M tabla 2.3',
    explicacion: `γM = ${gammaM.toFixed(2).replace('.', ',')} en situaciones persistentes y transitorias; 1,00 en situaciones extraordinarias.`,
  });

  if (grupo.especie) {
    const especie = DURABILIDAD_ESPECIES[grupo.especie];
    if (especie) {
      const exigida = DURABILIDAD_EXIGIDA_EN460[claseUso];
      trazas.push({
        referencia: 'UNE-EN 350-2 y UNE-EN 460 (fuera del DB SE-M)',
        explicacion: `${especie.nombre}: durabilidad natural del duramen ${especie.durabilidadDuramen}; para la clase de uso ${claseUso} basta con la clase ${exigida}.`,
      });
    } else {
      mensajes.push({
        severidad: 'info',
        texto: `No hay datos de durabilidad natural cargados para «${grupo.especie}»: rellénelos a mano desde UNE-EN 350-2.`,
      });
    }
  }

  if (claseServicio === 3 && grupo.tipo === 'laminada') {
    mensajes.push({
      severidad: 'aviso',
      texto:
        'Madera laminada encolada en clase de servicio 3: compruebe que el adhesivo es apto (DB SE-M tabla 4.1).',
      referencia: 'DB SE-M tabla 4.1',
    });
  }

  return {
    grupo,
    claseServicio,
    claseServicioForzada,
    claseUso,
    nivelPenetracion: proteccion.nivel,
    exigenciaPenetracion: proteccion.exigencia,
    gammaM,
    gammaMExtraordinaria: GAMMA_M_EXTRAORDINARIA,
    proteccionHerrajes: PROTECCION_HERRAJES[claseServicio],
    notas,
    mensajes,
    trazas,
  };
}
