/**
 * Una fila del esquema de la obra: marca, nombre, qué pasa, y adónde lleva.
 *
 * CUATRO estados y cuatro en toda la app. Nunca color solo: la marca va
 * SIEMPRE con su palabra al lado, porque el color no lo ve todo el mundo y
 * porque un icono sin texto hay que aprendérselo. La fila entera es el
 * objetivo táctil, con su `aria-label` diciendo estado y destino.
 */

import { Link } from 'react-router';
import { AlertTriangle, Check, ChevronRight, Circle, X } from 'lucide-react';

export type EstadoFila = 'hecho' | 'falta' | 'revisar' | 'noProcede' | 'sinEmpezar';

const ESTADOS = {
  hecho: { icono: Check, palabra: 'hecho', clase: 'text-state-ok' },
  falta: { icono: X, palabra: 'falta', clase: 'text-state-fail' },
  revisar: { icono: AlertTriangle, palabra: 'revíselo', clase: 'text-state-warn' },
  noProcede: { icono: Circle, palabra: 'no procede', clase: 'text-text-disabled' },
  sinEmpezar: { icono: Circle, palabra: 'sin empezar', clase: 'text-text-disabled' },
} as const;

interface Props {
  estado: EstadoFila;
  etiqueta: string;
  /** Una línea en lenguaje de obra: qué pasa. */
  detalle?: string | null;
  /** Adónde lleva. Sin ella la fila no es un enlace. */
  a?: string;
  onClick?: () => void;
}

export function FilaEstado({ estado, etiqueta, detalle, a, onClick }: Props) {
  const e = ESTADOS[estado];
  const Icono = e.icono;
  const cuerpo = (
    <>
      <span className={`flex shrink-0 items-center gap-1 ${e.clase}`}>
        <Icono size={13} aria-hidden="true" className="stroke-current" />
        <span className="font-mono text-[10px]">{e.palabra}</span>
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-primary">{etiqueta}</span>
      {detalle && <span className="shrink-0 text-[11.5px] text-text-secondary">{detalle}</span>}
      {(a || onClick) && <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-text-disabled" />}
    </>
  );

  const clases = 'flex min-h-[44px] w-full items-center gap-2.5 border-b border-border-sub px-3 text-left last:border-b-0';
  const etiquetaAria = `${etiqueta}: ${e.palabra}${detalle ? `, ${detalle}` : ''}`;

  if (a) {
    return (
      <Link to={a} className={`${clases} hover:bg-bg-elevated`} aria-label={`${etiquetaAria}. Ir a resolverlo`}>
        {cuerpo}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${clases} hover:bg-bg-elevated`} aria-label={`${etiquetaAria}. Ir a resolverlo`}>
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
