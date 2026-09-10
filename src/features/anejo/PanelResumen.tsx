/**
 * El panel derecho del anejo (280 px, § Espaciado de DESIGN.md): lo que va a
 * salir antes de generar nada —capítulos, páginas de cálculo, portada e
 * índice, total—, el aviso de piezas por recalcular, y dos líneas de la
 * portada. Los datos de portada son datos de obra y se editan en Datos de
 * obra: aquí sólo se muestran.
 */

import { AlertTriangle, Download } from 'lucide-react';
import { Link } from 'react-router';
import type { ResumenAnejo } from '../../lib/anejo/maqueta';
import { emplazamientoDe } from '../../lib/anejo/maqueta';
import type { Obra } from '../../lib/obra';
import type { EstadoGeneracion } from './useGenerarAnejo';

export interface PanelResumenProps {
  nombreObra: string | null;
  obra: Obra | null;
  resumen: ResumenAnejo;
  /** Piezas incluidas cuyo PDF es de antes del último cambio del cálculo. */
  /** Piezas incluidas hechas con una versión anterior de Concreta. */
  deVersionAnterior: number;
  /** Por qué no se puede generar ahora mismo, o `null`. */
  motivoBloqueo: string | null;
  generacion: EstadoGeneracion;
  onDescargarOtraVez: () => void;
}

function Cabecera({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="m-0 border-b border-border-sub px-4 pb-1.5 pt-3 text-[10px] font-semibold uppercase text-text-disabled" style={{ letterSpacing: '0.08em' }}>
      {children}
    </h2>
  );
}

function Valor({ rotulo, valor, destacado = false }: { rotulo: string; valor: string; destacado?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-sub px-4 py-1.5">
      <span className={['text-[12px]', destacado ? 'text-text-primary' : 'text-text-secondary'].join(' ')}>{rotulo}</span>
      <span className={['font-mono text-[11px] tabular-nums', destacado ? 'font-semibold text-text-primary' : 'text-text-primary'].join(' ')}>{valor}</span>
    </div>
  );
}

const ENLACE = 'text-accent hover:text-accent-hover underline-offset-2 hover:underline';

export function PanelResumen(p: PanelResumenProps) {
  const denominacion = p.obra?.denominacion.trim() || p.nombreObra || '';
  const emplazamiento = emplazamientoDe(p.obra);
  const segunda = [emplazamiento, p.obra?.uso.trim()].filter((x): x is string => !!x).join(' · ');
  const { resumen } = p;

  return (
    <aside
      aria-label="Resumen del anejo"
      className="shrink-0 overflow-y-auto border-t border-border-main bg-bg-surface lg:w-[280px] lg:border-l lg:border-t-0"
    >
      <Cabecera>Obra</Cabecera>
      <div className="flex items-baseline justify-between gap-3 border-b border-border-sub px-4 py-2">
        <span className={['min-w-0 truncate text-[12.5px]', p.nombreObra ? 'text-text-primary' : 'text-text-disabled'].join(' ')}>
          {p.nombreObra ?? 'Sin obra'}
        </span>
        <Link to="/proyecto/datos" className={`${ENLACE} shrink-0 text-[11.5px]`}>
          Datos de obra
        </Link>
      </div>

      <Cabecera>Portada</Cabecera>
      <div className="border-b border-border-sub px-4 py-2">
        <p className={['m-0 truncate text-[12.5px] font-semibold', denominacion ? 'text-text-primary' : 'text-text-disabled'].join(' ')}>
          {denominacion || 'Obra sin nombre'}
        </p>
        <p className={['m-0 truncate text-[11.5px]', segunda ? 'text-text-secondary' : 'text-text-disabled'].join(' ')}>
          {segunda || 'Sin emplazamiento ni uso'}
        </p>
        <p className="m-0 mt-1.5 text-[11px] text-text-disabled">La portada sale de los datos de obra; se edita allí.</p>
      </div>

      <Cabecera>Documento</Cabecera>
      {resumen.capitulos === 0 ? (
        <p className="m-0 border-b border-border-sub px-4 py-2 font-mono text-[11px] text-text-disabled">0 piezas · nada que generar</p>
      ) : (
        <>
          <Valor rotulo="Capítulos" valor={String(resumen.capitulos)} />
          <Valor rotulo="Páginas de cálculo" valor={String(resumen.paginasCalculo)} />
          <Valor rotulo="Portada e índice" valor={String(1 + resumen.paginasIndice)} />
          <Valor rotulo="Total" valor={`${resumen.total} ${resumen.total === 1 ? 'página' : 'páginas'}`} destacado />
        </>
      )}
      {p.motivoBloqueo !== null && resumen.capitulos > 0 && (
        <p className="m-0 border-b border-border-sub px-4 py-2 text-[11.5px] text-text-secondary">{p.motivoBloqueo}</p>
      )}

      {p.deVersionAnterior > 0 && (
        <div className="border-b border-border-sub px-4 py-2.5">
          <p className="m-0 flex items-center gap-1.5 text-[12px] font-medium text-state-warn">
            <AlertTriangle size={13} aria-hidden="true" />
            {p.deVersionAnterior === 1
              ? '1 pieza de una versión anterior'
              : `${p.deVersionAnterior} piezas de una versión anterior`}
          </p>
          <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-text-secondary">
            Su cálculo se hizo con una versión anterior de Concreta y ya no se puede abrir ni renombrar. El PDF sigue siendo
            válido y entra en el anejo tal cual; si hay que tocar el cálculo, hay que rehacerlo.
          </p>
        </div>
      )}

      {p.generacion.fase === 'hecho' && (
        <>
          <Cabecera>Último anejo</Cabecera>
          <div className="border-b border-border-sub px-4 py-2">
            <p className="m-0 truncate font-mono text-[11px] text-text-secondary" title={p.generacion.filename}>
              {p.generacion.filename}
            </p>
            <p className="m-0 mt-0.5 font-mono text-[11px] tabular-nums text-text-primary">
              {p.generacion.paginas} {p.generacion.paginas === 1 ? 'página' : 'páginas'} · {new Date(p.generacion.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <button
              type="button"
              onClick={p.onDescargarOtraVez}
              className="mt-2 inline-flex items-center gap-1.5 rounded border border-border-main bg-bg-primary px-2.5 py-1 text-[12px] text-text-primary hover:bg-bg-elevated transition-colors"
            >
              <Download size={13} aria-hidden="true" />
              Descargar otra vez
            </button>
          </div>
        </>
      )}

      {p.generacion.fase === 'error' && p.generacion.piezaId === null && (
        <div className="border-b border-border-sub px-4 py-2.5">
          <p className="m-0 text-[12px] font-medium text-state-fail" role="alert">
            No se pudo generar el anejo
          </p>
          <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-text-secondary">{p.generacion.mensaje}</p>
        </div>
      )}
    </aside>
  );
}
