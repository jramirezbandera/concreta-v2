// FEM 2D — documentación del método, en DATOS.
//
// Todo lo que el motor asume, simplifica o directamente no hace vive aquí como
// contenido estructurado, no como prosa suelta en un JSX: el panel lo pinta,
// los tests anclan que las limitaciones conocidas no desaparezcan en un
// refactor, y cuando el motor cambie (p. ej. si el αcr por fórmula de planta
// pasa a autovalores) el diff de la documentación sale en la misma revisión
// que el del código. La regla editorial: cada entrada dice QUÉ hace la app,
// no qué debería hacer un ingeniero — y las limitaciones se cuentan con la
// misma letra que las virtudes.

export interface MethodSection {
  id: string;
  title: string;
  /** Viñetas de la sección: afirmaciones autocontenidas, una idea por entrada. */
  items: string[];
}

export const FEM2D_METHOD_SECTIONS: MethodSection[] = [
  {
    id: 'analisis',
    title: 'Modelo de análisis',
    items: [
      'Pórtico plano con análisis elástico y LINEAL de primer orden por rigidez directa: 3 grados de libertad por nudo (ux, uy, θ), elementos viga-columna de Euler-Bernoulli (sin deformación por cortante), esfuerzos muestreados a lo largo de cada barra.',
      'Cada hipótesis (G, Q, W, S, E) se resuelve por separado y los esfuerzos de cada combinación salen por superposición lineal. Las reacciones y la deformada que se dibujan son por hipótesis o combinación SIN amplificar (valores de primer orden).',
      'Las rótulas se declaran por extremo de barra. Una biela no se declara: se DERIVA — birrotulada y sin cargas de barra (el peso propio no cuenta: se concentra en los nudos). Cargar una barra birrotulada es válido; pasa a trabajar como viga-columna y flecta.',
      'El peso propio es opcional y entra como hipótesis G adicional a partir de la sección y el material de cada barra.',
      'Apoyos ideales (empotrado, articulado, deslizante) y nudos rígidos salvo rótula declarada. Las uniones en sí (soldaduras, tornillos, placas) no se comprueban en este módulo.',
    ],
  },
  {
    id: 'combinaciones',
    title: 'Combinaciones (CTE DB-SE 4.3.2)',
    items: [
      'ELU persistente/transitoria multi-principal: 1,35·G + 1,50·(variable principal) + 1,50·ψ0·(simultáneas) — una combinación por cada variable presente. ELS característica con el mismo esquema (γ = 1) y cuasi-permanente única con ψ2.',
      'Los coeficientes ψ de cada hipótesis salen de la PRIMERA carga de esa hipótesis (su categoría de uso o la altitud de nieve). Cargas de la misma hipótesis con categorías distintas comparten los ψ de la primera.',
      'Madera: si el juego multi-principal no contiene ninguna combinación de duración permanente se añade la sintética 1,35·G — con kmod permanente puede gobernar aunque la variable sea pequeña (§3.1.3(2)).',
      'La flecha se comprueba con la combinación CARACTERÍSTICA (CTE DB-SE 4.3.3.1) y se mide RELATIVA A LA CUERDA de la barra: el desplome de pórtico no computa como flecha. El límite lo declara el usuario por barra (L/500 tabiquería frágil · L/400 ordinaria · L/300 apariencia · no aplica); una biela derivada no flecta y no emite fila.',
    ],
  },
  {
    id: 'alphacr',
    title: 'Estabilidad global: αcr y 2º orden',
    items: [
      'αcr se estima con la fórmula de PLANTA (CE Anejo 22 §5.2.1(4)B): una sonda lateral unitaria mide la rigidez de cada planta (cortante/deriva) y αcr es el mínimo de S·h/V por plantas y combinaciones. Las plantas se detectan por cotas de nudos, sin filtros de etiqueta — una celosía se salva por su propia rigidez, no por una lista blanca.',
      'αcr ≥ 10: primer orden suficiente (fila verde informativa). 3 ≤ αcr < 10: método de esfuerzos amplificados — los factores de W y E se multiplican por k = 1/(1−1/αcr) (fila ámbar). αcr < 3: fuera del rango del método simplificado — fila roja pidiendo análisis de 2º orden real.',
      'Sismo: una combinación con E y αcr < 5 equivale a θ > 0,2 y EN 1998-1 §4.4.2.2 exige análisis de 2º orden real — fila roja aunque EC3 lo diera por amplificable.',
      'NOTA 2B (§5.2.1(4)B): con compresión significativa en un dintel (N_Ed ≥ 0,09·N_cr) la fórmula de planta sobreestima αcr y la fila se degrada a ámbar nombrando la barra.',
      'Imperfección global de desplome (§5.3.2): en las combinaciones sensibles (αcr < 10) se añaden cargas nocionales H = φ·V por planta, con φ = (1/200)·αh (αh = 2/√h, acotado entre 2/3 y 1) y αm = 1 del lado seguro. Se aplican en los dos sentidos — el lado pésimo es por barra —, se amplifican con el mismo k que el viento/sismo y se etiquetan «± Hφ» en la combinación pésima.',
      'Exención de la imperfección (§5.3.2(4)): si el empuje real de la combinación cumple H_Ed ≥ 0,15·V_Ed en todas las plantas, las cargas nocionales se omiten y la fila αcr lo dice.',
    ],
  },
  {
    id: 'acero',
    title: 'Acero (CE Anejo 22 / EC3)',
    items: [
      'El enrutado va por MECANISMO, no por etiqueta: toda barra de acero pasa por el motor de flexión (clasificación de la sección, flexión, cortante, interacción M-V §6.2.8, vuelco lateral §6.3.2 con correas) y, cuando la compresión es relevante (utilización del axil ≥ 5% sobre el eje fuerte), se suma el motor de soportes: pandeo §6.3.1 y flexocompresión §6.3.3 (fórmulas int1/int2).',
      'Longitudes de pandeo = longitud de SISTEMA (β = 1) por eje. El arriostramiento del eje débil (dato de barra) acorta solo ese eje; se comprueban los dos y gobierna el menor Nb,Rd. Las correas acortan solo el vuelco.',
      'El χLT de la interacción §6.3.3 se evalúa con la longitud completa entre coacciones de vuelco — conservador cuando el tramo pésimo real es más corto.',
      'Las bielas derivadas se comprueban a axil puro: tracción §6.2.3 o pandeo §6.3.1 con curva c.',
    ],
  },
  {
    id: 'ha',
    title: 'Hormigón armado (CE Anejo 19 / EC2)',
    items: [
      'La comprobación de una barra HA la ELIGE el usuario en el inspector: «Pilar» (jaula, flexocompresión §5.8 por fibras parábola-rectángulo, con esbeltez, e_imp y 2º orden de barra) o «Viga» (armado de vano y apoyo, flexión, cortante, fisuración y flecha fisurada). Sin elegir, la barra queda PENDIENTE — nunca un verde por adivinanza.',
      'La imperfección de BARRA del pilar (e_imp) es independiente de la global §5.3.2 y ambas aplican a la vez (EC2 §5.2): una es el desplome de la estructura, la otra la curvatura del elemento.',
      'Una viga HA con axil apreciable pasa el filtro de esbeltez (λ frente a λ_lim §5.8.3.1): si el 2º orden de barra no es despreciable, la app pide comprobarla como pilar.',
    ],
  },
  {
    id: 'madera',
    title: 'Madera (CTE DB-SE-M / EC5)',
    items: [
      'Las resistencias dependen del kmod de la DURACIÓN de cada combinación, así que la madera se comprueba combinación a combinación, nunca con la envolvente. Flexocompresión 6.23/6.24, flexotracción, cortante y vuelco con kcrit.',
      'Correas (vuelco) y arriostramiento del eje débil (kc,z) son datos separados: unas correas en el ala no coaccionan el eje débil.',
      'Flecha diferida δ_fin = δ_c + kdef·δ_cp, con kdef de la clase de servicio.',
    ],
  },
  {
    id: 'auditoria',
    title: 'Auto-auditoría de mecanismos',
    items: [
      'La app mantiene un registro de los mecanismos resistentes que cada barra DEBERÍA tener comprobados (según material, formulación y demanda) y lo confronta con las filas realmente emitidas: si falta una — compresión relevante sin fila M+N, límite de flecha declarado sin fila de flecha — aparece una fila de discrepancia. El silencio nunca es un veredicto.',
      'Una barra PENDIENTE contagia el veredicto global: lo no comprobado no puede quedar tapado por el verde de las demás.',
    ],
  },
  {
    id: 'limitaciones',
    title: 'Limitaciones conocidas',
    items: [
      'La amplificación de 2º orden va por HIPÓTESIS (W y E), no por dirección de la fuerza: un empuje horizontal modelado bajo G o Q (tierras, una estructura adosada) NO se amplifica con k. Sí cuenta para la exención de la imperfección, y la fila αcr avisa igualmente de la sensibilidad; si ese empuje domina el desplome, considere un análisis de 2º orden real.',
      'αcr sale de la fórmula de planta, no de un análisis de autovalores: en geometrías muy irregulares (plantas incompletas, niveles mezclados) es una estimación, y la propia app la degrada o invalida cuando detecta sus supuestos rotos (NOTA 2B, sismo).',
      'El 2º orden es el método simplificado — amplificación + imperfección §5.3.2 —, no un P-Δ iterativo. La deformada y las reacciones mostradas son de primer orden sin imperfección.',
      'Pandeo y vuelco usan la longitud de sistema (β = 1) por barra; los modos traslacionales más largos que la barra se cubren por la vía global (αcr + imperfección + amplificación, EN 1993-1-1 §5.2.2(7)b), no bajando β.',
      'Fuera del plano del pórtico no hay modelo: solo existen las coacciones que se declaren (correas, arriostramiento del eje débil).',
      'Uniones, placas de anclaje y cimentaciones tienen sus módulos propios; aquí los nudos son rígidos o rótula ideal y los apoyos, ideales.',
      'Predimensionamiento: los resultados orientan una sección, no sustituyen un proyecto de cálculo firmado.',
    ],
  },
];
