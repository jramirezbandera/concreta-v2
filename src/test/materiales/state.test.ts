/**
 * Estado del módulo: traducción al motor, persistencia y lectura defensiva.
 *
 * Lo que se fija aquí es el puente entre la pregunta de obra y la norma. Si
 * «Muro contra el terreno, con cara vista» dejara de marcar `expuestoAireExterior`,
 * el interruptor de costa se quedaría sin efecto y nadie se enteraría: el cuadro
 * seguiría saliendo, sólo que con menos cemento y menos recubrimiento.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { TIMBER_GRADES } from '../../data/timberGrades';
import { deriveMadera } from '../../lib/materiales/derive';
import { ESPECIES, SITUACIONES, TIPOS_MADERA } from '../../features/materiales/catalogos';
import {
  cargarEstado,
  defaultMaterialesState,
  elementoAceroDeMotor,
  elementoDeMotor,
  evaluar,
  filaDesdePreset,
  filaMaderaDesdePreset,
  grupoDeMotor,
  guardarEstado,
  normalizar,
  opcionesObra,
  SCHEMA_VERSION_KEY,
  STORAGE_KEY,
} from '../../features/materiales/state';

beforeEach(() => {
  localStorage.clear();
});

describe('presets', () => {
  it('un nombre conocido rellena la fila entera', () => {
    const fila = filaDesdePreset('Forjados');
    expect(fila.situacion).toBe('interior_seco');
    expect(fila.consistencia).toBe('fluida');
    expect(fila.fck).toBe(30);
  });

  it('un nombre desconocido deja el hueco de la situación abierto', () => {
    const fila = filaDesdePreset('Brochal del hueco de escalera');
    expect(fila.situacion).toBe('');
  });

  it('los grupos de madera conocidos traen tipo, clase y especie', () => {
    const g = filaMaderaDesdePreset('Vigas y pilares');
    expect(g.tipo).toBe('laminada');
    expect(g.claseResistente).toBe('GL24h');
    expect(g.especie).toBe('Pinus sylvestris');
  });
});

describe('la situación de obra llega al motor', () => {
  const estudio = defaultMaterialesState().estudio;

  it('«enterrado» va contra el terreno pero sin caras al aire', () => {
    const e = elementoDeMotor(filaDesdePreset('Cimentación'), estudio)!;
    expect(e.contraTerreno).toBe(true);
    expect(e.expuestoAireExterior).toBeUndefined();
  });

  it('«muro con cara vista» sí declara caras al aire — es lo que activa la costa', () => {
    const e = elementoDeMotor(filaDesdePreset('Muros de sótano'), estudio)!;
    expect(e.contraTerreno).toBe(true);
    expect(e.expuestoAireExterior).toBe(true);
  });

  it('el vaso de piscina arrastra los cloruros y el hidrófugo', () => {
    const e = elementoDeMotor(filaDesdePreset('Vaso de piscina'), estudio)!;
    expect(e.situacion.cloruros).toBe('piscina');
    expect(e.hidrofugo).toBe(true);
  });

  it('el hormigón de limpieza no se deriva: no es un elemento del motor', () => {
    expect(elementoDeMotor(filaDesdePreset('Hormigón de limpieza'), estudio)).toBeNull();
  });

  it('toda situación del catálogo salvo la de limpieza produce un elemento', () => {
    // Guardia contra añadir una opción al desplegable y olvidar su traducción.
    for (const [id, opcion] of Object.entries(SITUACIONES)) {
      const fila = { ...filaDesdePreset(''), situacion: id as keyof typeof SITUACIONES };
      const e = elementoDeMotor(fila, estudio);
      if (id === 'limpieza') expect(e, id).toBeNull();
      else expect(e, id).not.toBeNull();
      expect(opcion.etiqueta.length).toBeGreaterThan(0);
      expect(opcion.ayuda.length).toBeGreaterThan(0);
    }
  });

  it('sólo la laminada lleva clase de láminas', () => {
    const aserrada = grupoDeMotor(filaMaderaDesdePreset('Correas y riostras'))!;
    expect(aserrada.claseLaminas).toBeUndefined();

    const laminada = grupoDeMotor(filaMaderaDesdePreset('Vigas y pilares'))!;
    // C24, no T14: la tabla D.2 del DB SE-M da las láminas en clases de madera
    // aserrada. Las T son la nomenclatura de la EN 14080, que el DB no usa.
    expect(laminada.claseLaminas).toBe('C24');
  });

  it('la calidad ya no es una entrada: la pone la tabla C.1', () => {
    // Antes el estado escribía «ME-1» en toda fila aserrada, fuese cual fuese
    // la especie y la clase. Ahora el grupo que llega al motor no la trae.
    const aserrada = grupoDeMotor(filaMaderaDesdePreset('Correas y riostras'))!;
    expect('calidad' in aserrada).toBe(false);
    expect(deriveMadera(aserrada).calidad).toBe('ME-1'); // Pinus pinaster C24
  });
});

describe('evaluación del estado por defecto', () => {
  const state = defaultMaterialesState();
  const ev = evaluar(state);

  it('las cuatro filas de arranque salen resueltas, sin huecos', () => {
    expect(ev.hormigon).toHaveLength(3);
    expect(ev.limpieza).toHaveLength(1);
    expect(ev.huecos).toHaveLength(0);
    expect(ev.listo).toBe(true);
  });

  it('reproduce el cuadro del estudio: XC2 en muros y cimentación, XC1 en forjados', () => {
    const clases = ev.hormigon.map((h) => h.derivacion.clases.join('+'));
    expect(clases).toEqual(['XC2', 'XC2', 'XC1']);
  });

  it('sin materiales de acero ni madera marcados, sus bloques no se evalúan', () => {
    expect(ev.acero).toBeNull();
    expect(ev.madera).toHaveLength(0);
  });

  it('con la fila de hormigón de limpieza, la nota de los 70 mm se matiza', () => {
    // Antes el motor tenía el indicador y la UI nunca lo ponía: la cimentación
    // decía «70 mm» a secas aunque el mismo cuadro llevase el HL.
    const cimentacion = ev.hormigon.find((h) => h.fila.nombre === 'Cimentación')!.derivacion;
    const nota = cimentacion.notas.find((n) => n.texto.startsWith('Contra el terreno'))!;
    expect(nota.texto).toContain('no rige sobre el hormigón de limpieza');

    const sinHL = evaluar({
      ...state,
      elementos: state.elementos.filter((f) => f.situacion !== 'limpieza'),
    });
    const notaSinHL = sinHL.hormigon
      .find((h) => h.fila.nombre === 'Cimentación')!
      .derivacion.notas.find((n) => n.texto.startsWith('Contra el terreno'))!;
    expect(notaSinHL.texto).toBe('Contra el terreno: 70 mm.');
  });
});

describe('heladas y terreno agresivo', () => {
  const base = defaultMaterialesState();
  const porNombre = (ev: ReturnType<typeof evaluar>) =>
    new Map(ev.hormigon.map((h) => [h.fila.nombre, h.derivacion]));

  it('«heladas» alcanza al muro con cara vista y no a la cimentación ni al forjado', () => {
    const d = porNombre(evaluar({ ...base, heladas: true }));
    expect(d.get('Muros de sótano')!.clases).toEqual(['XC2', 'XF1']);
    expect(d.get('Cimentación')!.clases).toEqual(['XC2']);
    expect(d.get('Forjados')!.clases).toEqual(['XC1']);
  });

  it('el terreno agresivo alcanza a todo lo enterrado', () => {
    const d = porNombre(evaluar({ ...base, terrenoAgresivo: 'debil' }));
    expect(d.get('Cimentación')!.clases).toEqual(['XC2', 'XA1']);
    expect(d.get('Muros de sótano')!.clases).toEqual(['XC2', 'XA1']);
    expect(d.get('Cimentación')!.cnom).toBe(50);
    expect(d.get('Forjados')!.clases).toEqual(['XC1']);
  });

  it('un terreno XA2 deja el recubrimiento sin determinar y bloquea exportar', () => {
    const ev = evaluar({ ...base, terrenoAgresivo: 'moderada' });
    expect(porNombre(ev).get('Cimentación')!.cnom).toBeNull();
    expect(ev.errores).toBeGreaterThan(0);
    expect(ev.listo).toBe(false);
  });

  it('viajan al motor por `opcionesObra`', () => {
    const o = opcionesObra({ ...base, heladas: true, terrenoAgresivo: 'alta' });
    expect(o.heladas).toBe(true);
    expect(o.terrenoAgresivo).toBe('alta');
  });
});

describe('acero estructural', () => {
  it('S355 soldado con PC1 declarado sale PC2 y cuenta como aviso de la obra', () => {
    const base = defaultMaterialesState();
    const ev = evaluar({
      ...base,
      usaAceroEstructural: true,
      estudio: { ...base.estudio, aceroEstructural: 'S355JR' },
    });
    expect(ev.acero?.categoriaEjecucionDeclarada).toBe('PC1');
    expect(ev.acero?.categoriaEjecucion).toBe('PC2');
    expect(ev.avisos).toBeGreaterThan(0);
  });

  it('la protección se sugiere por corrosividad y se puede cambiar en la fila', () => {
    const fila = defaultMaterialesState().aceroEstr.elementos[0];
    expect(elementoAceroDeMotor(fila, 'S275JR').proteccion).toBe('pintura');
    const cambiada = elementoAceroDeMotor(
      { ...fila, proteccion: 'galvanizado', caracteristicasProteccion: 'Z275' },
      'S275JR',
    );
    expect(cambiada.proteccion).toBe('galvanizado');
    expect(cambiada.caracteristicasProteccion).toBe('Z275');
  });
});

describe('el interruptor de costa', () => {
  it('endurece el muro con cara vista y deja igual la cimentación', () => {
    const base = defaultMaterialesState();
    const costa = evaluar({ ...base, costa: true });
    const porNombre = new Map(costa.hormigon.map((h) => [h.fila.nombre, h.derivacion]));

    const muro = porNombre.get('Muros de sótano')!;
    expect(muro.clases).toEqual(['XC2', 'XS1']);
    expect(muro.cementoMin).toBe(300);
    expect(muro.acMax).toBe(0.5);
    expect(muro.cnom).toBe(40);

    const cimentacion = porNombre.get('Cimentación')!;
    expect(cimentacion.clases).toEqual(['XC2']);
    expect(cimentacion.cementoMin).toBe(275);
    expect(cimentacion.cnom).toBe(30);
  });

  it('viaja al motor por `opcionesObra`, no por cada elemento', () => {
    expect(opcionesObra({ ...defaultMaterialesState(), costa: true }).costa).toBe(true);
  });
});

describe('una fila sin situación bloquea la exportación', () => {
  it('cuenta como hueco y deja `listo` en falso', () => {
    const base = defaultMaterialesState();
    const ev = evaluar({
      ...base,
      elementos: [...base.elementos, filaDesdePreset('Brochal raro')],
    });
    expect(ev.huecos).toHaveLength(1);
    expect(ev.listo).toBe(false);
  });
});

describe('persistencia', () => {
  it('lo guardado vuelve tal cual', () => {
    const state = { ...defaultMaterialesState(), costa: true, ayuda: false };
    guardarEstado(state);
    const leido = cargarEstado();
    expect(leido.costa).toBe(true);
    expect(leido.ayuda).toBe(false);
    expect(leido.elementos.map((e) => e.nombre)).toEqual(state.elementos.map((e) => e.nombre));
  });

  it('una versión de esquema distinta descarta el estado guardado', () => {
    guardarEstado({ ...defaultMaterialesState(), costa: true });
    localStorage.setItem(SCHEMA_VERSION_KEY, '0');
    expect(cargarEstado().costa).toBe(false);
  });

  it('un localStorage corrupto no tumba el módulo', () => {
    localStorage.setItem(STORAGE_KEY, '{no es json');
    localStorage.setItem(SCHEMA_VERSION_KEY, '1');
    expect(cargarEstado().elementos.length).toBeGreaterThan(0);
  });
});

describe('lectura defensiva', () => {
  it('un estado que no es un objeto cae entero a los valores por defecto', () => {
    expect(normalizar(null).elementos).toHaveLength(4);
    expect(normalizar('nada').usaHormigon).toBe(true);
  });

  it('una situación que ya no existe se convierte en hueco, no en error', () => {
    // Es el caso real de retirar una opción del catálogo: el estado guardado
    // sigue nombrándola. Mejor un hueco rojo que una derivación fantasma.
    const s = normalizar({
      elementos: [{ id: 'x', nombre: 'Muro', situacion: 'ambiente_lunar', fck: 30 }],
    });
    expect(s.elementos[0].situacion).toBe('');
    expect(s.elementos[0].nombre).toBe('Muro');
  });

  it('descarta los campos con tipo equivocado y conserva el resto de la fila', () => {
    const s = normalizar({
      costa: 'sí',
      elementos: [{ id: 'x', nombre: 'Muro', situacion: 'enterrado', fck: 'treinta' }],
    });
    expect(s.costa).toBe(false);
    expect(s.elementos[0].fck).toBe(30);
    expect(s.elementos[0].situacion).toBe('enterrado');
  });

  it('un cemento inventado cae al del perfil por defecto', () => {
    expect(normalizar({ estudio: { cemento: 'CEM XIV' } }).estudio.cemento).toBe('CEM II/B-S');
  });

  it('una clase resistente que no es del tipo, o una especie desconocida, caen a las habituales', () => {
    const s = normalizar({
      maderaGrupos: [
        { id: 'a', nombre: 'A', situacion: 'interior', tipo: 'maciza', claseResistente: 'GL24h', especie: 'Pinus sylvestris' },
        { id: 'b', nombre: 'B', situacion: 'interior', tipo: 'laminada', claseResistente: 'C24', especie: 'Quercus lunaris' },
      ],
    });
    expect(s.maderaGrupos[0].claseResistente).toBe('C24');
    expect(s.maderaGrupos[1].claseResistente).toBe('GL24h');
    expect(s.maderaGrupos[1].especie).toBe('Pinus sylvestris');
  });

  it('un fck de anclaje fuera de la tabla A19.3.1 no llega al render', () => {
    // Con [27] guardado, `fctd` lanzaba al pintar la pestaña de anclajes.
    expect(normalizar({ hormigonesAnclaje: [27] }).hormigonesAnclaje).toEqual([25, 30]);
    expect(normalizar({ hormigonesAnclaje: [35, 27] }).hormigonesAnclaje).toEqual([35]);
    expect(normalizar({ diametrosAnclaje: [] }).diametrosAnclaje).toEqual([8, 10, 12, 16, 20, 25]);
  });

  it('los modificadores de obra nuevos se leen y se validan', () => {
    const s = normalizar({ heladas: true, terrenoAgresivo: 'moderada', resistenciaFuego: 60 });
    expect(s.heladas).toBe(true);
    expect(s.terrenoAgresivo).toBe('moderada');
    expect(s.resistenciaFuego).toBe(60);
    const malo = normalizar({ heladas: 'sí', terrenoAgresivo: 'mucho', resistenciaFuego: 45 });
    expect(malo.heladas).toBe(false);
    expect(malo.terrenoAgresivo).toBe('ninguna');
    expect(malo.resistenciaFuego).toBeNull();
  });
});

describe('consistencia', () => {
  it('los presets de pilares, vigas y forjados arrastran la prescripción del 33.5', () => {
    for (const n of ['Forjados', 'Pilares', 'Vigas', 'Losa de escalera']) {
      const fila = filaDesdePreset(n);
      expect(fila.consistencia, n).toBe('fluida');
      expect(fila.prescripcionFluida, n).toBe(true);
    }
    // La cimentación no: ahí la blanda es lo normal y no hay nada que avisar.
    expect(filaDesdePreset('Cimentación').prescripcionFluida).toBeUndefined();
  });

  it('la marca llega al motor con la fila', () => {
    const e = elementoDeMotor(filaDesdePreset('Forjados'), defaultMaterialesState().estudio)!;
    expect(e.prescripcionFluida).toBe(true);
  });

  it('una consistencia seca sobrevive a recargar', () => {
    // Antes, `normalizar` colapsaba a blanda todo lo que no fuera fluida: una
    // consistencia elegida a conciencia se cambiaba sola al volver al módulo.
    const base = defaultMaterialesState();
    const elementos = base.elementos.map((e) => ({ ...e, consistencia: 'seca' as const }));
    guardarEstado({ ...base, elementos });
    expect(cargarEstado().elementos.map((e) => e.consistencia)).toEqual(
      elementos.map(() => 'seca'),
    );
  });

  it('un valor que no es una consistencia cae a blanda', () => {
    const s = normalizar({
      elementos: [{ id: 'x', nombre: 'Muro', situacion: 'enterrado', consistencia: 'gelatinosa' }],
    });
    expect(s.elementos[0].consistencia).toBe('blanda');
  });
});

describe('catálogo de madera', () => {
  it('las clases resistentes son las mismas que las de vigas y pilares de madera', () => {
    // El cuadro tiene que poder declarar cualquier clase con la que se haya
    // calculado un elemento. Si las dos listas se separan, hay piezas que se
    // calculan pero no se pueden escribir en el cuadro.
    const enElCuadro = TIPOS_MADERA.flatMap((t) => t.clases).sort();
    const enLosModulos = TIMBER_GRADES.map((g) => g.id).sort();
    expect(enElCuadro).toEqual(enLosModulos);
  });

  it('aserrada separa conífera de frondosa, y laminada va aparte', () => {
    const aserrada = TIPOS_MADERA.find((t) => t.id === 'maciza')!;
    expect(aserrada.grupos.map((g) => g.etiqueta)).toEqual(['Conífera y chopo', 'Frondosa']);
    expect(aserrada.grupos[0].clases).toContain('C14');
    expect(aserrada.grupos[1].clases).toContain('D30');
    expect(aserrada.clases).not.toContain('GL24h');

    const laminada = TIPOS_MADERA.find((t) => t.id === 'laminada')!;
    expect(laminada.clases.every((c) => c.startsWith('GL'))).toBe(true);
  });

  it('cambiar de tipo recoloca la clase en la habitual, no en la primera', () => {
    // La primera de aserrada es ahora C14; caer ahí al cambiar de laminada a
    // aserrada sería degradar la pieza sin decírselo a nadie.
    expect(TIPOS_MADERA.find((t) => t.id === 'maciza')!.porDefecto).toBe('C24');
    expect(TIPOS_MADERA.find((t) => t.id === 'laminada')!.porDefecto).toBe('GL24h');
  });

  it('las especies son las de la tabla C.3 del DB SE-M más las dos frondosas españolas', () => {
    const ids = ESPECIES.map((e) => e.id);
    // Tabla C.3 del DB SE-M, once especies.
    for (const e of [
      'Pinus sylvestris', 'Pinus pinaster', 'Pinus radiata', 'Pinus nigra',
      'Picea abies', 'Abies alba', 'Pseudotsuga menziesii', 'Populus sp.',
      'Milicia excelsa', 'Eucalyptus marginata', 'Tectona grandis',
    ]) expect(ids, e).toContain(e);
    // UNE 56546:2013, posterior al DB: las dos frondosas con norma española.
    expect(ids).toContain('Eucalyptus globulus');
    expect(ids).toContain('Castanea sativa');
    expect(ESPECIES).toHaveLength(13);
    // La etiqueta lleva el nombre común delante: es como se pide la madera.
    expect(ESPECIES[0].etiqueta).toBe('Pino silvestre (Pinus sylvestris)');
  });

  it('las especies sin datos de durabilidad avisan en vez de callar', () => {
    // Sólo los cuatro pinos españoles traen los valores de UNE-EN 350. Del
    // resto no hay dato cargado, y el cuadro de durabilidad tiene que decirlo.
    const grupo = { ...grupoDeMotor(filaMaderaDesdePreset('Correas y riostras'))!, especie: 'Tectona grandis' };
    const avisos = deriveMadera(grupo).mensajes.map((m) => m.texto);
    expect(avisos.some((t) => /No hay datos de durabilidad natural/.test(t))).toBe(true);
  });
});
