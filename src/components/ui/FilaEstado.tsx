/**
 * Una fila del esquema de la obra: marca, nombre, qué pasa, y adónde lleva.
 *
 * CUATRO estados y cuatro en toda la app. Nunca color solo: la marca va
 * SIEMPRE con su palabra al lado, porque el color no lo ve todo el mundo y
 * porque un icono sin texto hay que aprendérselo. La fila entera es el
 * objetivo táctil, con su `aria-label` diciendo estado y destino.
 *
 * Dos cosas que vienen del rediseño del 2026-09-13:
 *
 *   - La marca vive en una columna de ancho FIJO. Sin ella «no procede» —seis
 *     caracteres más que «hecho»— empujaba el nombre de su fila, y catorce
 *     filas empezaban en cuatro sitios distintos.
 *   - Las dos que piden trabajo van en chip teñido. El ojo cae en lo que hay
 *     que hacer sin leerse la lista entera; lo hecho y lo que no procede se
 *     quedan en la palabra desnuda, que es su sitio.
 */

import { Link } from 'react-router';
import { AlertTriangle, Check, ChevronRight, Circle, X } from 'lucide-react';
import { ModuleIcon } from './ModuleIcon';

export type EstadoFila = 'hecho' | 'falta' | 'revisar' | 'noProcede' | 'sinEmpezar';

const ESTADOS = {
  hecho: { icono: Check, palabra: 'hecho', clase: 'text-state-ok', tinte: '' },
  falta: { icono: X, palabra: 'falta', clase: 'text-state-fail', tinte: 'bg-tint-fail' },
  revisar: { icono: AlertTriangle, palabra: 'revíselo', clase: 'text-state-warn', tinte: 'bg-tint-warn' },
  noProcede: { icono: Circle, palabra: 'no procede', clase: 'text-text-disabled', tinte: '' },
  sinEmpezar: { icono: Circle, palabra: 'sin empezar', clase: 'text-text-disabled', tinte: '' },
} as const;

/**
 * La marca de estado, suelta. La fila la usa a la izquierda; el bloque de lo
 * que se entrega, debajo del nombre de cada documento. El ancho fijo es el que
 * cabe «sin empezar», la palabra más larga de las cinco.
 */
export function Marca({ estado }: { estado: EstadoFila }) {
  const e = ESTADOS[estado];
  const Icono = e.icono;
  return (
    <span className={`flex w-[96px] shrink-0 items-center gap-1 rounded px-1.5 py-0.5 ${e.tinte} ${e.clase}`}>
      <Icono size={12} aria-hidden="true" className="shrink-0 stroke-current" />
      <span className="font-mono text-[10px] whitespace-nowrap">{e.palabra}</span>
    </span>
  );
}

interface Props {
  estado: EstadoFila;
  etiqueta: string;
  /** Una línea en lenguaje de obra: qué pasa. */
  detalle?: string | null;
  /** Clave de módulo para su icono (ver `ModuleIcon`). Sin ella la fila no lleva. */
  icono?: string;
  /** Adónde lleva. Sin ella la fila no es un enlace. */
  a?: string;
  onClick?: () => void;
}

export function FilaEstado({ estado, etiqueta, detalle, icono, a, onClick }: Props) {
  const e = ESTADOS[estado];
  const cuerpo = (
    <>
      <Marca estado={estado} />
      {icono && (
        <span className="flex shrink-0 text-text-secondary opacity-75" aria-hidden="true">
          <ModuleIcon moduleKey={icono} />
        </span>
      )}
      {/* Dos tercios para el nombre y uno para el detalle: en una pantalla
          estrecha el detalle no puede comerse la etiqueta hasta dejarla en
          «Cuadro de …», que es lo que pasaba cuando era `shrink-0`. Anchas las
          dos caben enteras y se ve igual que siempre. */}
      <span className="min-w-0 flex-2 truncate text-[13px] text-text-primary">{etiqueta}</span>
      {detalle && <span className="min-w-0 flex-1 truncate text-right text-[11.5px] text-text-secondary">{detalle}</span>}
      {(a || onClick) && <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-text-disabled" />}
    </>
  );

  const clases = 'flex min-h-[44px] w-full items-center gap-2.5 border-b border-border-sub px-3 text-left last:border-b-0';
  const etiquetaAria = `${etiqueta}: ${e.palabra}${detalle ? `, ${detalle}` : ''}`;
  // El destino se nombra por lo que hay que hacer allí: quien oye «hecho, ir a
  // resolverlo» deja de fiarse de las dos mitades de la frase.
  const destino = estado === 'falta' || estado === 'revisar' ? 'Ir a resolverlo' : 'Ir a verlo';

  if (a) {
    return (
      <Link to={a} className={`${clases} hover:bg-bg-elevated`} aria-label={`${etiquetaAria}. ${destino}`}>
        {cuerpo}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${clases} hover:bg-bg-elevated`} aria-label={`${etiquetaAria}. ${destino}`}>
        {cuerpo}
      </button>
    );
  }
  return (
    <div className={clases} aria-label={etiquetaAria}>
      {cuerpo}
    </div>
  );
}
