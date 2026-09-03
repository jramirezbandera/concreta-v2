/**
 * Estado del módulo: traducción al motor, persistencia y lectura defensiva.
 *
 * Lo que se fija aquí es el puente entre la pregunta de obra y la norma. Si
 * «Muro contra el terreno, con cara vista» dejara de marcar `expuestoAireExterior`,
 * el interruptor de costa se quedaría sin efecto y nadie se enteraría: el cuadro
 * seguiría saliendo, sólo que con menos cemento y menos recubrimiento.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { SITUACIONES } from '../../features/materiales/catalogos';
import {
  cargarEstado,
  defaultMaterialesState,
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

  it('la madera aserrada lleva calidad y la laminada, clase de láminas', () => {
    const aserrada = grupoDeMotor(filaMaderaDesdePreset('Correas y riostras'))!;
    expect(aserrada.calidad).toBe('ME-1');
    expect(aserrada.claseLaminas).toBeUndefined();

    const laminada = grupoDeMotor(filaMaderaDesdePreset('Vigas y pilares'))!;
    expect(laminada.claseLaminas).toBe('T14');
    expect(laminada.calidad).toBeUndefined();
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
});
