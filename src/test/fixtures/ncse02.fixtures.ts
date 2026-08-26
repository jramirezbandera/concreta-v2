// Fixtures de regresión del módulo de acción sísmica NCSE-02.
//
// Extraídos de las dos hojas de cálculo del autor (2018), en
// "sismo ejemplos/" en la raíz del workspace, fuera del repo.
//
// QUÉ ES Y QUÉ NO ES ESTE FICHERO
// ───────────────────────────────
// Es un fixture de REGRESIÓN, no un oráculo. Las hojas no son la Norma: son una
// implementación de 2018 de la Norma, y al extraerlas se ha comprobado que una
// de las dos está mal. El criterio, por tanto, es:
//
//   · `esperado`  valores recalculados desde el texto de la NCSE-02. Manda.
//   · `hoja`      lo que dice el Excel. Sólo se afirma en los tests cuando
//                 coincide con `esperado`; cuando no, se afirma la DIVERGENCIA,
//                 para que nadie "arregle" el motor hasta hacerlo coincidir.
//
// Precisión de las hojas: ambas usan pi truncado (3,1416 y 3,14159) en el seno
// de la forma modal, así que ni siquiera la hoja correcta reproduce la cadena
// bit a bit. La desviación relativa máxima medida es 2,1e-5 (en V2k de la
// planta 2 del caso MODOS). De ahí TOL_HOJA.

/** Tolerancia relativa al comparar contra una hoja: pi truncado. */
export const TOL_HOJA = 5e-5;

/** Tolerancia relativa al comparar contra valores recalculados. */
export const TOL_NORMA = 1e-12;

export interface EntradaSismo {
  /** ab/g, adimensional. */
  ab: number;
  K: number;
  /** Coeficiente del terreno, art. 2.4. */
  C: number;
  /** Coeficiente de riesgo: 1,0 normal / 1,3 especial. */
  rho: number;
  /** Período fundamental [s]. */
  TF: number;
  /** Amortiguamiento [%]. */
  omega: number;
  /** Ductilidad, art. 3.7.3.1. */
  mu: number;
  /** Alturas de planta sobre rasante [m], de la más baja a la cubierta. */
  h: number[];
  /** Pesos sísmicos de planta [kN], en el mismo orden que h. */
  P: number[];
  /** Modos a considerar. Ver nota de cada caso. */
  nModos: number;
}

export interface ModoEsperado {
  i: number;
  T: number;
  /** alpha del art. 3.7.3, NO el espectro elástico del art. 2.3. */
  alpha: number;
  Phi: number[];
  eta: number[];
  s: number[];
  F: number[];
  V: number[];
}

export interface EsperadoSismo {
  S: number;
  ac: number;
  TA: number;
  TB: number;
  nu: number;
  beta: number;
  H: number;
  modos: ModoEsperado[];
  /** Cortante de planta combinado por SRSS, art. 3.7.4. */
  Vk: number[];
  /** F_k = V_k - V_(k+1), con V_(n+1) = 0. */
  Fk: number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CASO 1 · Modos.xlsx  ·  ORÁCULO DE PARIDAD
// ─────────────────────────────────────────────────────────────────────────────
//
// Procedencia: "sismo ejemplos/Modos.xlsx", hoja "NCSE-02", filas 19-22.
//   entradas   I3 (ab), I4 (rho), I6 (K), I7 (C), I11 (TF), I12 (W), I13 (mu)
//   plantas    H19:H22 (h_k), J19:J22 (P_k)
//   modo 1     L/O/P/Q/R    modo 2  T/W/X/Y/Z    modo 3  AB/AE/AF/AG/AH
//
// Esta hoja implementa la Norma CORRECTAMENTE en todo lo que este fixture
// afirma. Verificado celda a celda:
//   N3   S por tramos, con rho*ab en unidades de g. Bien.
//   N16  alpha = IF(T <= TB; 2,5; 2,5*TB/T). Es la alpha del art. 3.7.3, SIN la
//        rama ascendente del espectro elástico. Bien, y es la trampa nº 3.
//   N13  beta = nu/mu. Bien.
//   N11  número de modos por TF. Bien.
//   D19  F_k = V_k - V_(k+1). Bien.
//
// POR QUÉ ESTE CASO ES EL QUE MÁS VALE. El modo 3 tiene T3 = 0,088 s y el
// emplazamiento tiene T_A = K·C/10 = 0,16 s. Es decir T3 < T_A: el único
// régimen donde las dos alphas de la NCSE-02 difieren.
//
//     alpha del art. 3.7.3 (correcta) = 2,500
//     espectro elástico art. 2.3      = 1 + 1,5·(0,088/0,16) = 1,825
//
// Cablear `elasticSpectrum` dentro de s_ik rompe este fixture. Es el test de
// extremo a extremo que pide el design doc, y no hay que fabricarlo: el caso
// real del autor ya cae del lado que muerde.
//
// Nota sobre el número de modos: la hoja tiene N11 = 1 y su columna "final"
// (E19) sólo usa el modo 1. Las tres columnas modales están calculadas de todos
// modos, y de ahí sale el SRSS de tres modos. Con TF = 0,44 s el art. 3.7.2.1
// pediría UN modo; el fixture fuerza tres a propósito, para ejercitar el SRSS y
// el F_k negativo. El motor no debe elegir 3 aquí por su cuenta.
//
// Nota sobre I9 = 8 ("Núm. plantas"): la hoja sólo tiene 4 plantas con datos, y
// su H (N9) sale del MAX de la columna de alturas, = 16 m. El 8 sólo alimenta la
// estimación de TF (AU18), que además el autor sobreescribió a mano con 0,44.
// Es una incoherencia de la hoja, no un dato: aquí n = 4.

export const CASO_MODOS = {
  id: "modos-4-plantas-3-modos",
  origen: "sismo ejemplos/Modos.xlsx · hoja NCSE-02 · filas 19-22",
  descripcion:
    "4 plantas, terreno III, tres modos con SRSS. El modo 3 cae por debajo " +
    "de T_A: es el caso que distingue las dos alphas de la Norma.",

  entrada: {
    ab: 0.23,
    K: 1.0,
    C: 1.6,
    rho: 1.0,
    TF: 0.44,
    omega: 5,
    mu: 3,
    h: [4, 8, 12, 16],
    P: [4373, 4373, 3632, 800],
    nModos: 3,
  } satisfies EntradaSismo,

  esperado: {
    S: 1.158788,
    ac: 0.26652124,
    TA: 0.16,
    TB: 0.64,
    nu: 1.0,
    beta: 0.3333333333333333,
    H: 16,
    modos: [
      {
        i: 1,
        T: 0.44,
        alpha: 2.5,
        Phi: [0.3826834323650898, 0.7071067811865476, 0.9238795325112867, 1.0],
        eta: [
          0.5075041416002671, 0.9377453781783933, 1.2252233816118803,
          1.3261722318725708,
        ],
        s: [
          0.11271719427036564, 0.20827421749697858, 0.2721233791201596,
          0.2945442230768709,
        ],
        F: [
          492.9122905443089, 910.7831531142873, 988.3521129644197,
          235.6353784614967,
        ],
        V: [
          2627.682935084513, 2134.7706445402036, 1223.9874914259165,
          235.6353784614967,
        ],
      },
      {
        i: 2,
        T: 0.14666666666666667,
        alpha: 2.5,
        Phi: [
          0.9238795325112867, 0.7071067811865476, -0.38268343236508967, -1.0,
        ],
        eta: [
          0.629732454180189, 0.48197635407473277, -0.26084372318792787,
          -0.681617496675624,
        ],
        s: [
          0.13986422879695595, 0.10704744628223067, -0.057933660458552735,
          -0.15138795034973596,
        ],
        F: [
          611.6262725290884, 468.1184825921947, -210.41505478546352,
          -121.11036027978876,
        ],
        V: [
          748.2193400560308, 136.59306752694243, -331.5254150652523,
          -121.11036027978876,
        ],
      },
      {
        i: 3,
        // T3 = 0,088 s < T_A = 0,16 s. AQUÍ MUERDE LA TRAMPA DE LAS DOS ALPHAS.
        T: 0.088,
        alpha: 2.5,
        Phi: [
          0.9238795325112867, -0.7071067811865475, -0.3826834323650904, 1.0,
        ],
        eta: [
          0.04561957501326835, -0.03491571109822843, -0.018896246680192547,
          0.04937827217501545,
        ],
        s: [
          0.010132154750674412, -0.0077548155144846675, -0.0041968759137923336,
          0.010966965274285511,
        ],
        F: [
          44.30791272469921, -33.91180824484145, -15.243053318893756,
          8.77357221942841,
        ],
        V: [
          3.9266233803924084, -40.3812893443068, -6.469481099465346,
          8.77357221942841,
        ],
      },
    ],
    Vk: [
      2732.1356493665194, 2139.5172398034388, 1268.1073827507637,
      265.0824900276941,
    ],
    // F_k de la planta 4 sale igual a V_k porque V_5 = 0 por definición.
    Fk: [
      592.6184095630806, 871.4098570526751, 1003.0248927230696,
      265.0824900276941,
    ],
  } satisfies EsperadoSismo,

  /**
   * Lo que imprime la hoja. Coincide con `esperado` dentro de TOL_HOJA, así
   * que aquí sí se puede afirmar paridad.
   */
  hoja: {
    S: 1.158788,
    ac: 0.26652124,
    TB: 0.64,
    // Cortantes por modo, columnas R (modo 1), Z (modo 2) y AH (modo 3).
    V: [
      [
        2627.6826545623217, 2134.77054755724, 1223.9876084430798,
        235.63547941577713,
      ],
      [
        748.2239427106902, 136.5959550147179, -331.52496490828696,
        -121.11074982508245,
      ],
      [
        3.926541190469891, -40.38092786337457, -6.469594969640063,
        8.773478339233842,
      ],
    ],
  },

  /** Entradas de las dos puertas para este mismo edificio. */
  aplicabilidad: {
    importancia: "normal" as const,
    n: 4,
    nTotal: 4,
    H: 16,
    // Con ab = 0,23 g no hay exención posible por el art. 1.2.3.
    abExento: false,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CASO 2 · Sismo_ISA.xlsx  ·  NO ES ORÁCULO. La hoja tiene un error de unidades
// ─────────────────────────────────────────────────────────────────────────────
//
// Procedencia: "sismo ejemplos/Sismo_ISA.xlsx", hoja "Hoja2", filas 98-102
// (tabla de plantas) y 10-36 (parámetros del emplazamiento).
//
// EL ERROR. La celda Q12 calcula el coeficiente de amplificación del terreno así:
//
//     =(J12/1,25)+(3,33*(((J32*J10)/9,8116)-0,1)*(1-(J12/1,25)))
//                              ^^^^^^^^^^^^^^
//
// J10 es ab y ya está en unidades de g (vale 0,23, que significa 0,23 g).
// Dividirla entre 9,8116 la convierte en 0,0234, y el paréntesis
// (rho·ab/g - 0,1) pasa de +0,13 a -0,0766. Como C = 1,3 hace que (1 - C/1,25)
// sea NEGATIVO, el doble error cambia el signo del término corrector: en vez de
// restar un 1,7% a C/1,25, le suma un 1,0%.
//
//     S de la hoja  = 1,050198        S correcta = 1,022684
//
// La hoja se queda un 2,69% ALTA, y ese 2,69% viaja intacto hasta ac, s_ik, F_1k
// y el cortante basal. Es conservador, pero está mal, y una memoria de visado
// que arrastre este número no dice la verdad sobre el edificio.
//
// La otra hoja del autor, Modos.xlsx (N3), calcula lo mismo BIEN. No es que el
// autor no supiera la fórmula: es que esta hoja concreta tiene un fallo.
//
// SEGUNDO PROBLEMA, INDEPENDIENTE DEL PRIMERO. La hoja titula "Cortante basal"
// la celda J96 = J95 * I103 = s_1k(sin eta) · P_total = 3.283,72 kN. Eso NO es
// el cortante basal: es el que habría si participase el 100% de la masa. El
// cortante basal del método es la suma de las fuerzas de planta, que en la
// propia hoja da 2.915,96 kN (columna O). La diferencia es exactamente la
// participación modal del modo 1, que la hoja calcula en O104: 88,80%.
//
//     Cortante basal real (hoja, con su S mala) = 2.915,96 kN
//     Cortante basal correcto                   = 2.839,56 kN
//     "Cortante basal" de J96                   = 3.283,72 kN   (+15,6%)
//
// El design doc y el plan de tests recogían 3.283,7 kN como criterio de éxito.
// Ese criterio queda RETIRADO: pedía reproducir dos errores a la vez.
//
// OTROS DOS FALLOS LATENTES de esta hoja, sin efecto aquí porque Omega = 5% y
// TF = 0,45 s, pero que hay que evitar al portar:
//   · J35/J36 multiplican T_A y T_B por nu. El art. 2.5 aplica nu a las
//     ordenadas del espectro, no a los períodos de esquina. Con Omega = 5%,
//     nu = 1 y no se nota.
//   · J95 toma alpha de la celda G62, que es el valor del espectro elástico
//     tabulado en T_A, o sea 2,5 fijo. Con TF > T_B daría 2,5 en vez de
//     2,5·T_B/T_F, y las fuerzas saldrían altas.
//
// QUÉ SE USA DE ESTE CASO. Sus ENTRADAS, que son un edificio real de cinco
// plantas con torreón: sirven de caso de integración honesto. Sus SALIDAS
// esperadas son las recalculadas. Y el bloque `hoja` existe para que el test
// afirme la divergencia y su causa.

export const CASO_SISMO_ISA = {
  id: "sismo-isa-5-plantas-1-modo",
  origen: "sismo ejemplos/Sismo_ISA.xlsx · hoja Hoja2 · filas 98-102",
  descripcion:
    "5 plantas con torreón, terreno II, un modo. La hoja de origen tiene un " +
    "error de unidades en S: se usan sus entradas, no sus resultados.",

  entrada: {
    ab: 0.23,
    K: 1.0,
    C: 1.3,
    rho: 1.0,
    TF: 0.45,
    omega: 5,
    mu: 3,
    h: [4, 8, 12, 16, 19],
    P: [3968.342, 3940.278, 3940.178, 3840.418, 624.336],
    nModos: 1,
  } satisfies EntradaSismo,

  esperado: {
    S: 1.022684,
    ac: 0.23521731999999998,
    TA: 0.13,
    TB: 0.52,
    nu: 1.0,
    beta: 0.3333333333333333,
    H: 19,
    modos: [
      {
        i: 1,
        T: 0.45,
        alpha: 2.5,
        Phi: [
          0.32469946920468346, 0.6142127126896678, 0.8371664782625285,
          0.9694002659393304, 1.0,
        ],
        eta: [
          0.4142632803803827, 0.7836347063744604, 1.0680871525875753,
          1.23679578273807, 1.2758360258336,
        ],
        s: [
          0.08120158215456848, 0.15360371291032288, 0.20936049796506706,
          0.2424298245024592, 0.25008227563002505,
        ],
        F: [
          322.23564893042453, 605.2413306988611, 824.917628151002,
          931.0318617560854, 156.13536763774732,
        ],
        V: [
          2839.5618371741202, 2517.326188243696, 1912.0848575448347,
          1087.1672293938327, 156.13536763774732,
        ],
      },
    ],
    // Con un solo modo, el SRSS es la identidad: V_k = V_1k.
    Vk: [
      2839.5618371741202, 2517.326188243696, 1912.0848575448347,
      1087.1672293938327, 156.13536763774732,
    ],
    Fk: [
      322.23564893042453, 605.2413306988611, 824.917628151002,
      931.0318617560854, 156.13536763774732,
    ],
  } satisfies EsperadoSismo,

  /**
   * Lo que imprime la hoja. NO es lo correcto: sólo se afirma la divergencia.
   */
  hoja: {
    /** Q12. Un 2,69% alta por dividir ab entre 9,8116 estando ya en g. */
    S: 1.050197573484447,
    /** J34 = Q12·ab·rho. Hereda el mismo 2,69%. */
    ac: 0.24154544190142285,
    /** Columna O. Suma = 2.915,96 kN, el cortante basal real de la hoja. */
    F: [
      330.90524056372925, 621.5248859949813, 847.1110069511428,
      956.0794113148969, 160.33575173658477,
    ],
    /** Suma de la columna O. */
    cortanteBasal: 2915.956296561335,
    /** J96. La hoja lo llama cortante basal y no lo es. */
    J96CortanteBasalDeLaMasaTotal: 3283.720105684867,
    /** O104. Explica la diferencia entre las dos cifras anteriores. */
    participacionModal: 0.888003911025532,
    /** Factor por el que la hoja se pasa: S_hoja / S_correcta. */
    factorError: 1.0269032990488236,
  },

  /** Entradas de las dos puertas para este mismo edificio. */
  aplicabilidad: {
    importancia: "normal" as const,
    n: 5,
    nTotal: 5,
    H: 19,
    abExento: false,
  },
};

/**
 * Coeficientes de torsión del art. 3.7.5, filas 126-130 de Sismo_ISA.xlsx.
 * Esta parte de la hoja SÍ está bien: gamma_a = 1 + 0,6·x/L_e.
 *
 * Ojo con el convenio: la hoja guarda x sin signo. El módulo guarda el signo y
 * aplica abs(x) dentro de gamma_a. Ver los Convenios de notación en types.ts.
 */
export const CASO_TORSION_ISA = {
  origen: "sismo ejemplos/Sismo_ISA.xlsx · hoja Hoja2 · filas 126-130",
  longitudinal: {
    Le: 24.8,
    x: [12.457, 6.257],
    gamma: [1.3013790322580645, 1.1513790322580646],
  },
  transversal: {
    Le: 16.32,
    x: [8.16, 2.4],
    gamma: [1.3, 1.088235294117647],
  },
};

/**
 * Las cinco expresiones de T_F del art. 3.7.2.2, tal como las implementa
 * Modos.xlsx en AU18. Corroboración independiente de que la expresión (1)
 * lleva el /sqrt(L): hasta ahora sólo se había verificado por inspección
 * visual de la fórmula impresa a 600 ppp (design doc, R1).
 *
 *   =IF(AW18=1; 0,06*N9*SQRT(N9/(2*AB3+N9))/SQRT(AB3);
 *    IF(AW18=2; 0,09*I9;
 *    IF(AW18=3; 0,07*I9*SQRT(N9/(AB4+N9));
 *    IF(AW18=4; 0,11*I9;
 *               0,085*I9*SQRT(N9/(AB4+N9))))))
 *
 * con N9 = H, I9 = n, AB3 = L, AB4 = B.
 */
export const TF_FORMULAS_MODOS_XLSX = {
  origen: "sismo ejemplos/Modos.xlsx · hoja NCSE-02 · celda AU18",
  /** H = 16, L = 100, B = 16, n = 8, según AB3, AB4, I9 y N9 de la hoja. */
  entrada: { H: 16, L: 100, B: 16, n: 8 },
  esperado: {
    fabrica: 0.06 * 16 * Math.sqrt(16 / (2 * 100 + 16)) / Math.sqrt(100),
    porticosHA: 0.72,
    porticosHAPantallas: 0.07 * 8 * Math.sqrt(16 / (16 + 16)),
    porticosAcero: 0.88,
    aceroTriangulado: 0.085 * 8 * Math.sqrt(16 / (16 + 16)),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CASO 3 · Granada, 10 plantas · REGRESIÓN PURA, sin hoja detrás
// ─────────────────────────────────────────────────────────────────────────────
//
// POR QUÉ EXISTE. Al calcular el caso del mockup salió un hueco de cobertura
// que ninguno de los dos fixtures anteriores tapa:
//
//     Modos.xlsx      T = 0,440 · 0,147 · 0,088    con T_B = 0,64
//     Sismo_ISA.xlsx  T = 0,450                    con T_B = 0,52
//
// Los cinco períodos de las dos hojas caen POR DEBAJO de T_B. Es decir: ambas
// ejercitan `alpha_i = 2,5` y NINGUNA ejercita `alpha_i = 2,5·T_B/T_i`. La rama
// descendente del art. 3.7.3 no tenía ni un solo test, y es la mitad de la
// función. Este caso la cubre, y cubre las dos ramas a la vez.
//
// ESTÁNDAR DE EVIDENCIA. Igual que el SRSS de tres modos de `Modos.xlsx`: es un
// fixture de REGRESIÓN, no paridad contra una autoridad. Su única fuente es la
// aritmética de la sesión que lo escribió. Congela el mecanismo de la rama
// descendente, que es más de lo que había, pero no se presenta como oráculo.
//
// Es además el caso dibujado en `docs/mockup-sismo-ncse02.html`, con el peso
// sísmico desglosado en cargas por planta (300 m², 8,00 kN/m² en planta tipo y
// 6,00 en cubierta → 2.400 y 1.800 kN, total 23.400 kN).
//
// Ojo con T_F: es `0,09 · 10`, que en coma flotante NO es 0,9 exacto. El fixture
// guarda el valor que produce la propia expresión, no el redondeo bonito.

export const CASO_GRANADA = {
  id: "granada-10-plantas-rama-descendente",
  origen: "calculado en esta sesión · docs/mockup-sismo-ncse02.html",
  descripcion:
    "10 plantas de pórticos de HA en Granada, terreno II. T_F = 0,90 s por " +
    "encima de T_B = 0,52 s: el modo 1 cae en la rama descendente de alpha y " +
    "el modo 2 en el tramo plano.",

  entrada: {
    ab: 0.23,
    K: 1.0,
    C: 1.3,
    rho: 1.0,
    TF: 0.8999999999999999, // 0,09 · 10
    omega: 5,
    mu: 3,
    h: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30],
    P: [2400, 2400, 2400, 2400, 2400, 2400, 2400, 2400, 2400, 1800],
    nModos: 2,
  } satisfies EntradaSismo,

  esperado: {
    S: 1.022684,
    ac: 0.23521731999999998,
    TA: 0.13,
    TB: 0.52,
    nu: 1.0,
    beta: 0.3333333333333333,
    H: 30,
    modos: [
      {
        i: 1,
        T: 0.8999999999999999,
        // T_1 > T_B: RAMA DESCENDENTE. 2,5·0,52/0,90.
        alpha: 1.4444444444444446,
        Phi: [
          0.15643446504023087, 0.3090169943749474, 0.45399049973954675,
          0.5877852522924731, 0.7071067811865475, 0.8090169943749475,
          0.8910065241883678, 0.9510565162951535, 0.9876883405951378, 1.0,
        ],
        eta: [
          0.19675291172526221, 0.3886611137783717, 0.5709991893179738,
          0.739277369778905, 0.8893520878749558, 1.0175280059771674,
          1.1206490075903797, 1.1961759114158927, 1.2422489944220996,
          1.257733784397591,
        ],
        s: [
          0.02228281495469503, 0.044016953052782505, 0.06466724768281865,
          0.08372522005661331, 0.10072159964453965, 0.11523787917339307,
          0.12691661966440348, 0.13547025176716473, 0.14068815667142948,
          0.14244185224122108,
        ],
        F: [
          53.47875589126807, 105.640687326678, 155.20139443876474,
          200.94052813587194, 241.73183914689517, 276.57091001614333,
          304.59988719456834, 325.1286042411954, 337.65157601143073,
          256.39533403419796,
        ],
        V: [
          2257.3395164370136, 2203.8607605457455, 2098.2200732190677,
          1943.018678780303, 1742.078150644431, 1500.3463114975357,
          1223.7754014813925, 919.1755142868241, 594.0469100456287,
          256.39533403419796,
        ],
      },
      {
        i: 2,
        T: 0.3,
        // T_2 entre T_A y T_B: TRAMO PLANO.
        alpha: 2.5,
        Phi: [
          0.45399049973954675, 0.8090169943749475, 0.9876883405951378,
          0.9510565162951536, 0.7071067811865476, 0.3090169943749475,
          -0.15643446504023073, -0.587785252292473, -0.8910065241883678, -1.0,
        ],
        eta: [
          0.15847726422081854, 0.2824085527125463, 0.3447784616861281,
          0.3319911648113924, 0.2468341259535646, 0.1078704684225264,
          -0.054607543690111934, -0.20518182381810857, -0.311029143643494,
          -0.3490761685800398,
        ],
        s: [
          0.031063831142460682, 0.05535615242843654, 0.06758155479294475,
          0.06507506004217835, 0.04838305132611658, 0.021144168741242735,
          -0.010703866732142532, -0.04021859892600638, -0.060966201341431395,
          -0.06842396737438763,
        ],
        F: [
          74.55319474190564, 132.8547658282477, 162.1957315030674,
          156.18014410122802, 116.11932318267979, 50.74600497898256,
          -25.689280157142075, -96.52463742241531, -146.31888321943535,
          -123.16314127389774,
        ],
        V: [
          300.95322226322065, 226.40002752131502, 93.54526169306732,
          -68.65046981000009, -224.8306139112281, -340.9499370939079,
          -391.6959420728905, -366.0066619157484, -269.4820244933331,
          -123.16314127389774,
        ],
      },
    ],
    Vk: [
      2277.313007572456, 2215.4591452642326, 2100.304309295359,
      1944.2310750253653, 1756.5264267594782, 1538.5986851770672,
      1284.932661390204, 989.3657072241571, 652.3130328759228,
      284.4428355275661,
    ],
    Fk: [
      61.8538623082236, 115.15483596887361, 156.0732342699937,
      187.70464826588704, 217.92774158241104, 253.6660237868632,
      295.5669541660469, 337.0526743482343, 367.87019734835667,
      284.4428355275661,
    ],
  } satisfies EsperadoSismo,

  /** Participación modal, para el pie de la tabla de modos. */
  participacion: [0.8517892236081233, 0.0656137846379725],

  /** Desglose de cargas que produce los P_k. Reproduce el del mockup. */
  cargas: {
    area: 300,
    tipo: { pesoPropio: 4.5, permanente: 1.5, tabiqueria: 1.0, uso: 2.0 },
    cubierta: { pesoPropio: 4.5, permanente: 1.5, usoExcluida: 1.0 },
    pesoSismicoTotal: 23400,
  },
};
