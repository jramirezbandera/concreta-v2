/**
 * Las cuatro publicaciones vistas desde la ficha: una fila por módulo con si
 * hay sobre, de cuándo y de qué obra, y en qué estado entra. El botón «Usar lo
 * publicado» es lo que acepta un sobre; si es de otra obra, el botón lo dice
 * en su rótulo y no lo esconde: el cuadro de materiales no tiene emplazamiento
 * propio y estampa el `concreta-obra` que hubiera al publicar.
 */

import { Link } from 'react-router';
import type { Fuente } from '../../lib/memoria/ensamblar';
import type { ModuloPub } from '../../lib/memoria/estado';
import { QUE_TOMA } from './catalogos';
import { idDom } from './ids';
import { BOTON_ACENTO, BOTON_MENOR } from './estilos';
import { MODULOS } from './sobres';

const fecha = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const ESTADO_TEXTO: Record<Fuente['estado'], { texto: string; clase: string }> = {
  ok: { texto: 'tomada', clase: 'text-text-secondary border-border-main' },
  revisar: { texto: 'revisar', clase: 'text-state-warn border-state-warn/50' },
  falta: { texto: 'sin publicar', clase: 'text-state-fail border-state-fail/50' },
  derivado: { texto: 'opcional', clase: 'text-accent border-accent/40' },
  heredado: { texto: 'revisar', clase: 'text-state-warn border-state-warn/50' },
};

interface Props {
  fuentes: Record<ModuloPub, Fuente>;
  ayuda: boolean;
  onTomar: (modulo: ModuloPub) => void;
}

export function Fuentes({ fuentes, ayuda, onTomar }: Props) {
  return (
    <div className="rounded border border-border-main bg-bg-surface px-3 py-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled">Lo que publican los otros módulos</p>
      <ul className="flex flex-col gap-1.5">
        {(Object.keys(fuentes) as ModuloPub[]).map((m) => {
          const f = fuentes[m];
          const e = ESTADO_TEXTO[f.estado];
          const obraSobre = f.obraSobre ? f.obraSobre.municipio || f.obraSobre.provincia || (f.obraSobre.ine ? `INE ${f.obraSobre.ine}` : null) : null;
          return (
            <li key={m} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
              <span className={`rounded border px-1.5 font-mono text-[10px] ${e.clase}`}>{e.texto}</span>
              <span className="text-text-primary">{MODULOS[m].etiqueta}</span>
              {f.ts ? <span className="text-text-disabled">publicado el {fecha(f.ts)}</span> : null}
              {obraSobre ? <span className={f.otraObra ? 'text-state-warn' : 'text-text-disabled'}>obra: {obraSobre}</span> : null}
              {f.estado === 'revisar' && (
                <button type="button" id={idDom(f.id!)} className={BOTON_ACENTO} onClick={() => onTomar(m)} title={f.otraObra ? f.nota : 'Aceptar esta publicación tal como está ahora'}>
                  {f.otraObra ? 'Usar aunque sea de otra obra' : 'Usar lo publicado'}
                </button>
              )}
              {f.estado === 'falta' && (
                <Link to={MODULOS[m].ruta} id={idDom(f.id!)} className={BOTON_MENOR}>
                  Abrir el módulo
                </Link>
              )}
              {ayuda ? <span className="basis-full text-[10.5px] leading-snug text-text-disabled">{f.nota ?? QUE_TOMA[m]}</span> : f.nota && f.estado !== 'ok' ? <span className="basis-full text-[10.5px] text-text-disabled">{f.nota}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
