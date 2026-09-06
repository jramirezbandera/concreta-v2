/**
 * La sección del edificio, alineada con las filas de la tabla.
 *
 * Un forjado por PLANTA, dibujado a la altura de sus filas (las cotas las mide
 * `useCotasFilas`) y partido en tantos trozos como zonas tenga: las zonas de
 * una misma planta son partes del mismo forjado y van a la misma altura, no
 * escalonadas. Encima de cada forjado, su carga de cálculo a escala: gris
 * lo permanente (Gd), azul lo variable (Qd) y rayada la nieve cuando no manda.
 * El alto del bloque ES el número: dos plantas iguales se ven iguales y el vaso
 * de piscina destaca sin leer una cifra.
 *
 * No hay escala de alturas de planta —este módulo no las pide y no las
 * necesita— y por eso el dibujo dice «sin escala vertical»: lo que está a
 * escala es la carga.
 *
 * Cerramientos y petos vienen de las cargas lineales: se dibujan en la fachada
 * y sobre la última planta, que es donde apoyan.
 */

import type { KeyboardEvent } from 'react';
import { Marcadores } from '../../components/canvas/Marcadores';
import { COLOR, dec, mezcla } from '../../components/canvas/paleta';
import { Rotulo, Suelo } from '../../components/canvas/primitivas';
import { useMarcadores } from '../../components/canvas/useMarcadores';
import type { CargasResultado, LinealResuelto, ZonaCargasResuelta } from '../../lib/acciones/cargas';
import type { CotaFila } from './useCotasFilas';

/** Píxeles por kN/m²: con qd = 25 salen 55 px, que caben entre dos filas de 46. */
const ESCALA = 2.2;
const ALTO_NIEVE = 5;
const GRUESO_FORJADO = 5;

interface Props {
  resultado: CargasResultado;
  /** Dónde cae cada zona, medido en la tabla. Vacío = reparto uniforme (la sección debajo). */
  cotas: CotaFila[];
  lineales: LinealResuelto[];
  zonaSel: string | null;
  onSeleccionar: (id: string | null) => void;
  width?: number;
  height?: number;
}

/** Las cargas lineales que el dibujo sabe situar: el resto sólo cuenta en la tabla. */
const esPeto = (concepto: string) => /peto|barandilla/i.test(concepto);
const esFachada = (concepto: string) => /cerramiento|fachada|tabic|tabique|vidrio|muro/i.test(concepto);

export function SeccionSVG({ resultado, cotas, lineales, zonaSel, onSeleccionar, width = 228, height = 560 }: Props) {
  const m = useMarcadores();

  // Las zonas en el orden de la tabla, cada una sabiendo de qué planta es.
  const porId = new Map<string, CotaFila>(cotas.map((c) => [c.id, c]));
  const zonas: { z: ZonaCargasResuelta; iPlanta: number; iZona: number; nZonas: number }[] = [];
  resultado.plantas.forEach((p, iPlanta) => p.zonas.forEach((z, iZona) => zonas.push({ z, iPlanta, iZona, nZonas: p.zonas.length })));

  const arriba = 46;
  const usable = Math.max(60, height - arriba - 96);
  /** Sin medida (la sección va debajo de la tabla, o en un test) se reparte por igual. */
  const uniforme = cotas.length === 0;
  const paso = usable / Math.max(1, zonas.length);

  const bx = 34;
  const bw = Math.max(60, width - bx - 78);

  /** El eje del forjado que le toca a la fila i de la tabla. */
  const yFila = (i: number, id?: string) => {
    if (uniforme) return arriba + paso * (i + 1) - GRUESO_FORJADO;
    const c = id ? porId.get(id) : undefined;
    if (!c) return arriba + paso * (i + 1);
    return c.top + c.alto - GRUESO_FORJADO - 1;
  };

  /**
   * La cota de cada PLANTA: la de su última fila, que es donde acaba su bloque
   * de filas en la tabla. Todas sus zonas cuelgan de ahí.
   */
  const yPlanta = resultado.plantas.map((_, iPlanta) => {
    let ultima = -1;
    zonas.forEach((b, i) => {
      if (b.iPlanta === iPlanta) ultima = i;
    });
    return ultima < 0 ? arriba : yFila(ultima, zonas[ultima].z.id);
  });

  const yPrimero = zonas.length > 0 ? yPlanta[zonas[0].iPlanta] : arriba;
  const yUltimo = zonas.length > 0 ? yPlanta[zonas[zonas.length - 1].iPlanta] : arriba;
  const yRasante = yUltimo + GRUESO_FORJADO + 22;

  /** El rótulo de la planta, recortado a lo que cabe en el margen del dibujo. */
  const corto = (nombre: string) => (nombre.length > 15 ? `${nombre.slice(0, 14)}…` : nombre);

  const peto = lineales.find((l) => esPeto(l.concepto));
  const fachada = lineales.find((l) => esFachada(l.concepto));

  const teclado = (id: string) => (ev: KeyboardEvent<SVGGElement>) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      onSeleccionar(zonaSel === id ? null : id);
    }
  };

  const alturaTotal = Math.max(height, yRasante + 96);

  return (
    <svg width={width} height={alturaTotal} viewBox={`0 0 ${width} ${alturaTotal}`} role="img" aria-label="Sección del edificio con la carga de cálculo de cada forjado" style={{ display: 'block' }}>
      <title>Sección: la carga de cálculo qd de cada forjado</title>
      <Marcadores id={m.id} />

      <Rotulo x={4} y={16} tam={10} mono color={COLOR.secundario} peso={500}>
        SECCIÓN · qd por forjado
      </Rotulo>
      <Rotulo x={4} y={28} tam={8.5} mono color={COLOR.atenuado}>
        {uniforme ? 'sin escala vertical' : 'alineada con la tabla · sin escala vertical'}
      </Rotulo>

      {/* Fachadas: de la primera planta a la última */}
      {zonas.length > 0 && (
        <>
          <line x1={bx} y1={yPrimero} x2={bx} y2={yUltimo + GRUESO_FORJADO} stroke={COLOR.seccion} strokeWidth={1.75} />
          <line x1={bx + bw} y1={yPrimero} x2={bx + bw} y2={yUltimo + GRUESO_FORJADO} stroke={COLOR.seccion} strokeWidth={1.75} />
          {fachada && (
            <text x={bx - 8} y={(yPrimero + yUltimo) / 2} fontSize={8} fill={COLOR.atenuado} textAnchor="middle" transform={`rotate(-90 ${bx - 8} ${(yPrimero + yUltimo) / 2})`} style={{ fontFamily: 'var(--font-mono)' }}>
              {fachada.concepto} {dec(fachada.gk, 1)} kN/m
            </text>
          )}
        </>
      )}

      {/* Un forjado por planta, partido en sus zonas, con su carga encima */}
      {zonas.map(({ z, iPlanta, iZona, nZonas }, i) => {
        const p = resultado.plantas[iPlanta];
        const y = yPlanta[iPlanta];
        const ancho = (bw - 2 * (nZonas - 1)) / nZonas;
        const x = bx + iZona * (ancho + 2);
        const sel = z.id === zonaSel;
        const hueco = z.forjado.ppOrigen === 'sinDato';
        const hG = Math.max(0, z.Gd * ESCALA);
        const hQ = Math.max(0, z.Qd * ESCALA);
        const conNieve = p.esCubierta && p.nieve !== null && p.nieve > 0;
        const yTop = y - hG - hQ - (conNieve ? ALTO_NIEVE : 0);

        return (
          <g
            key={z.id ?? `${p.nombre}-${i}`}
            role="button"
            tabIndex={0}
            aria-label={`Seleccionar ${z.rotulo}`}
            aria-pressed={sel}
            onClick={() => z.id && onSeleccionar(sel ? null : z.id)}
            onKeyDown={z.id ? teclado(z.id) : undefined}
            style={{ cursor: 'pointer' }}
          >
            {/* Zona muerta clicable, para que la fila entera responda */}
            <rect x={x} y={yTop - 6} width={ancho} height={hG + hQ + GRUESO_FORJADO + 12 + (conNieve ? ALTO_NIEVE : 0)} fill="transparent" />

            {hueco ? (
              <>
                <rect x={x} y={y} width={ancho} height={GRUESO_FORJADO} fill="none" stroke={COLOR.fallo} strokeWidth={1} strokeDasharray="3 2" />
                <Rotulo x={x + ancho / 2} y={y - 6} tam={9.5} mono color={COLOR.fallo} peso={600} ancla="middle">
                  ¿PP?
                </Rotulo>
              </>
            ) : (
              <>
                <rect x={x} y={y} width={ancho} height={GRUESO_FORJADO} fill={COLOR.seccion} />
                <rect x={x} y={y - hG} width={ancho} height={hG} fill={mezcla(COLOR.seccion, 25)} stroke={mezcla(COLOR.seccion, 45)} strokeWidth={0.75} />
                <rect x={x} y={y - hG - hQ} width={ancho} height={hQ} fill={mezcla(COLOR.accent, 45)} stroke={COLOR.accent} strokeWidth={0.75} />
                {conNieve && <rect x={x} y={yTop} width={ancho} height={ALTO_NIEVE} fill={m.nieve} stroke={mezcla(COLOR.accent, 50)} strokeWidth={0.5} />}
                <Rotulo x={x + ancho / 2} y={yTop - 4} tam={9.5} mono color={COLOR.accent} peso={600} ancla="middle">
                  {dec(z.qd, 2)}
                </Rotulo>
              </>
            )}
            {sel && <rect x={x - 2} y={yTop - 14} width={ancho + 4} height={hG + hQ + GRUESO_FORJADO + 18 + (conNieve ? ALTO_NIEVE : 0)} fill="none" stroke={COLOR.accent} strokeWidth={1} strokeDasharray="2 2" />}
          </g>
        );
      })}

      {/* El nombre de cada planta, al lado de su forjado: sin él no se sabe qué
          extremo del dibujo es la cubierta y cuál la planta baja. */}
      {resultado.plantas.map((p, i) =>
        p.zonas.length === 0 ? null : (
          <Rotulo key={`rotulo-${p.id ?? i}`} x={bx + bw + 6} y={yPlanta[i] + 9} tam={8} mono color={COLOR.atenuado}>
            {corto(p.nombre)}
          </Rotulo>
        ),
      )}

      {/* Peto sobre la planta de arriba */}
      {peto && zonas.length > 0 && (
        <>
          <rect x={bx} y={yPrimero - 10} width={3} height={10} fill={COLOR.seccion} />
          <rect x={bx + bw - 3} y={yPrimero - 10} width={3} height={10} fill={COLOR.seccion} />
          <Rotulo x={bx + bw + 6} y={yPrimero - 3} tam={8} mono color={COLOR.atenuado}>
            {dec(peto.gk, 1)} kN/m
          </Rotulo>
        </>
      )}

      {/* Rasante */}
      {zonas.length > 0 && (
        <>
          <Suelo x1={bx - 18} x2={bx + bw + 18} y={yRasante} patron={m.suelo} />
          <Rotulo x={bx + bw + 22} y={yRasante + 4} tam={8} mono color={COLOR.atenuado}>
            rasante
          </Rotulo>
        </>
      )}

      {/* Leyenda */}
      <g transform={`translate(4 ${yRasante + 28})`}>
        <rect x={0} y={-8} width={10} height={8} fill={mezcla(COLOR.seccion, 25)} stroke={mezcla(COLOR.seccion, 45)} strokeWidth={0.75} />
        <Rotulo x={16} y={0} tam={8.5} mono color={COLOR.secundario}>
          permanente · Gd = 1,35 · G
        </Rotulo>
        <rect x={0} y={7} width={10} height={8} fill={mezcla(COLOR.accent, 45)} stroke={COLOR.accent} strokeWidth={0.75} />
        <Rotulo x={16} y={15} tam={8.5} mono color={COLOR.secundario}>
          variable · Qd = 1,50 · Q
        </Rotulo>
        <rect x={0} y={22} width={10} height={8} fill={m.nieve} stroke={mezcla(COLOR.accent, 50)} strokeWidth={0.5} />
        <Rotulo x={16} y={30} tam={8.5} mono color={COLOR.secundario}>
          nieve cuando no manda
        </Rotulo>
        <Rotulo x={0} y={48} tam={8.5} mono color={COLOR.atenuado}>
          alto del bloque ∝ kN/m²
        </Rotulo>
        <Rotulo x={0} y={60} tam={8.5} mono color={COLOR.atenuado}>
          clic en un bloque = su fila
        </Rotulo>
      </g>
    </svg>
  );
}
