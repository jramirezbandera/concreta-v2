// Invariantes FÍSICOS del catálogo de perfiles laminados (IPE / HEA / HEB / IPN).
//
// POR QUÉ EXISTE ESTE FICHERO
// El catálogo son ~900 números teclados a mano desde prontuario, y hasta 2026-07-25
// nada los validaba: steelCatalog.test.ts congela los valores literales (protege la
// migración, no la corrección) y sections.test.ts solo clava dos celdas de HEB 200.
// Con ese hueco, las columnas Wpl_y e Iw de TODA la serie IPN estuvieron mal desde el
// principio: IPN 600 declaraba Wpl_y = 11600 cm³ (correcto: 5480), o sea un factor de
// forma Wpl/Wel = 2.51. Como steelBeams.ts:203 usa Wpl_y para Mc,Rd en clase 1-2, ese
// perfil anunciaba 2.1x su momento resistente real: una viga dada por CUMPLE al 90%
// estaba en realidad al 192%.
//
// La raíz del fallo es estructural y va a volver: los prontuarios publican Wy y Wz, que
// son ELÁSTICOS, y NO publican Wpl ni Iw. Quien amplíe el catálogo tendrá que derivar esas
// dos columnas otra vez. Estos invariantes son la red para que no se pueda equivocar en
// silencio — no dependen de ninguna fuente externa, solo de la geometría de la sección.
import { describe, it, expect } from 'vitest';
import { STEEL_PROFILES, type SteelProfile } from '../../data/steelProfiles';

const key = (p: SteelProfile) => `${p.tipo} ${p.size}`;

/**
 * Filas con Iw incorrecta detectadas el 2026-07-25 y PENDIENTES de corregir: los
 * prontuarios no publican Iw, así que hace falta fuente o derivación deliberada.
 * El patrón apunta a un desplazamiento de fila al transcribir (la Iw de HEB 400 vale
 * aprox. la real de HEB 450, y la de HEB 360 aprox. la real de HEB 400).
 *
 * NO ampliar esta lista para silenciar un fallo nuevo: si aparece otra fila aquí es que
 * alguien ha metido un valor malo. Corregir el valor, no la lista.
 */
const IW_PENDIENTES = new Set(['HEA 160', 'HEB 280', 'HEB 320', 'HEB 360', 'HEB 400']);

describe('catálogo de perfiles — invariantes físicos', () => {
  it('cubre las 4 familias y 69 perfiles', () => {
    expect(STEEL_PROFILES.length).toBe(69);
    expect(new Set(STEEL_PROFILES.map((p) => p.tipo))).toEqual(
      new Set(['IPE', 'HEA', 'HEB', 'IPN']),
    );
  });

  // Wel_y = Iy / (h/2) es una identidad exacta para cualquier sección simétrica: la
  // fibra extrema está a h/2 del eje neutro. Ata tres columnas entre sí, así que un
  // typo en Iy, en h o en Wel_y rompe la relación. Medido: error máx. real 0.35%
  // (redondeo del prontuario a 3 cifras).
  describe('Wel_y = Iy / (h/2)  —  identidad exacta, tolerancia 1%', () => {
    for (const p of STEEL_PROFILES) {
      it(key(p), () => {
        const WelCalc = p.Iy / (p.h / 20); // Iy cm⁴, h mm → h/2 en cm = h/20
        expect(Math.abs(p.Wel_y - WelCalc) / WelCalc).toBeLessThan(0.01);
      });
    }
  });

  // El factor de forma α = Wpl/Wel tiene un TECHO TEÓRICO de 1.5 para cualquier sección
  // maciza (el del rectángulo). Un perfil en I, con el material en las alas, se queda en
  // 1.10-1.20. Este es el invariante que pilla el bug de IPN: llegaba a 2.51, que no es
  // "un valor raro" sino imposible. Medido en el catálogo corregido: 1.098 (HEA 280) a
  // 1.184 (IPN 600).
  describe('factor de forma Wpl_y / Wel_y ∈ [1.05, 1.25]  —  techo físico 1.5', () => {
    for (const p of STEEL_PROFILES) {
      it(key(p), () => {
        const alpha = p.Wpl_y / p.Wel_y;
        expect(alpha).toBeGreaterThan(1.05);
        expect(alpha).toBeLessThan(1.25);
      });
    }
  });

  // Iw = Iz_alas · (h−tf)²/4. En un perfil en I el alma aporta menos del 1% de Iz
  // (para IPN 600: 45 de 4670 cm⁴), así que usar Iz total es exacto al ~1%. Iw entra en
  // computeMcr → Mcr → χ_LT → Mb,Rd, y un Iw inflado sobreestima el pandeo lateral.
  // Medido en las filas correctas: 0.954 a 1.003.
  describe('Iw = Iz·(h−tf)²/4  —  tolerancia 6%', () => {
    for (const p of STEEL_PROFILES) {
      const pendiente = IW_PENDIENTES.has(key(p));
      it(key(p) + (pendiente ? ' [PENDIENTE — valor malo conocido]' : ''), () => {
        const hs = (p.h - p.tf) / 10; // cm
        const IwCalc = p.Iz * hs * hs / 4;
        const ratio = p.Iw / IwCalc;
        if (pendiente) {
          // Se afirma que SIGUE mal, para que el día que se corrija este test falle y
          // obligue a sacar la fila de IW_PENDIENTES.
          expect(Math.abs(ratio - 1)).toBeGreaterThan(0.06);
          return;
        }
        expect(Math.abs(ratio - 1)).toBeLessThan(0.06);
      });
    }
  });

  it('IW_PENDIENTES tiene 5 entradas y todas existen en el catálogo', () => {
    // Si esto falla al renombrar o borrar un perfil, la exención se habría quedado
    // colgada y su invariante desactivado sin que nadie se enterase.
    expect(IW_PENDIENTES.size).toBe(5);
    const claves = new Set(STEEL_PROFILES.map(key));
    for (const k of IW_PENDIENTES) expect(claves.has(k)).toBe(true);
  });

  // El área bruta tiene que quedar por encima del rectángulo sin acuerdos (los acuerdos
  // añaden material) salvo en IPN, donde la conicidad del ala hace que el modelo
  // rectangular con tf medido a b/4 sobreestime ~0.5%. Medido: −0.8% (IPN) a +6% (HEA).
  describe('A coherente con 2·b·tf + (h−2tf)·tw  —  banda [−2%, +9%]', () => {
    for (const p of STEEL_PROFILES) {
      it(key(p), () => {
        const Arect = (2 * p.b * p.tf + (p.h - 2 * p.tf) * p.tw) / 100; // mm² → cm²
        const desv = (p.A / Arect - 1) * 100;
        expect(desv).toBeGreaterThan(-2);
        expect(desv).toBeLessThan(9);
      });
    }
  });
});

// Pin del incidente concreto, con los números a la vista: si alguien revierte el fichero
// de datos, esto lo dice por su nombre en vez de dejarlo en un invariante abstracto.
describe('regresión — el bug de Wpl_y de IPN (2026-07-25)', () => {
  const ipn600 = STEEL_PROFILES.find((p) => p.tipo === 'IPN' && p.size === 600)!;

  it('IPN 600: Wpl_y ≈ 5480 cm³, NO 11600', () => {
    expect(ipn600.Wpl_y).toBeGreaterThan(5300);
    expect(ipn600.Wpl_y).toBeLessThan(5650);
  });

  it('IPN 600: Iw ≈ 3.76e6 cm⁶, NO 1.89e7', () => {
    expect(ipn600.Iw).toBeGreaterThan(3.6e6);
    expect(ipn600.Iw).toBeLessThan(3.9e6);
  });

  it('ninguna fila de IPN supera el techo físico de 1.5 en Wpl/Wel', () => {
    const ipn = STEEL_PROFILES.filter((p) => p.tipo === 'IPN');
    expect(ipn.length).toBe(21);
    for (const p of ipn) expect(p.Wpl_y / p.Wel_y).toBeLessThan(1.5);
  });
});
