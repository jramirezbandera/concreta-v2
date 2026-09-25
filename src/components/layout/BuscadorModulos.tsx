import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';

import { ModuleIcon } from '../ui/ModuleIcon';
import { buscarDestinos } from './destinos';

interface Props {
  /** Cerrar sin ir a ningún sitio (Escape, clic fuera). */
  onCerrar: () => void;
  /** Ya se ha navegado: el Sidebar cierra el buscador y, en móvil, el cajón. */
  onElegido: () => void;
}

const KEYCAP = 'font-mono text-[10px] text-text-disabled border border-border-sub rounded px-1 py-px';

/**
 * El buscador de la lupa del pie de la barra lateral (y de Ctrl+K): se
 * escribe, se elige con las flechas o el ratón, e Intro lleva al módulo. Busca
 * lo mismo que lista la barra —ver `destinos.ts`—, con las palabras de obra de
 * cada módulo además de su nombre.
 *
 * Patrón combobox: el foco no sale nunca del campo, y la fila activa se anuncia
 * con `aria-activedescendant`. Las filas se eligen en `mousedown` con
 * `preventDefault` para que el clic no le robe el foco al campo.
 */
export function BuscadorModulos({ onCerrar, onElegido }: Props) {
  const navigate = useNavigate();
  const [consulta, setConsulta] = useState('');
  const [activa, setActiva] = useState(0);
  const listaRef = useRef<HTMLUListElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const idLista = `${id}-lista`;
  const idOpcion = (i: number) => `${id}-op-${i}`;

  const resultados = buscarDestinos(consulta);
  const indice = Math.min(activa, Math.max(resultados.length - 1, 0));

  // Scroll del body bloqueado, y el foco vuelve a quien lo tenía (la lupa, o
  // el campo desde el que se pulsó Ctrl+K) si se cierra sin elegir. Si se
  // elige, no: el foco se queda donde lo deje la pantalla nueva. El campo se
  // enfoca aquí y no con `autoFocus`, que llegaría ANTES de este efecto y le
  // haría apuntar el campo como disparador.
  const elegidoRef = useRef(false);
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const disparador = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    campoRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      if (!elegidoRef.current) disparador?.focus?.();
    };
  }, []);

  // La fila activa, siempre a la vista al moverse con las flechas.
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [indice, consulta]);

  const ir = (i: number) => {
    const destino = resultados[i];
    if (!destino) return;
    elegidoRef.current = true;
    navigate(destino.route);
    onElegido();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // `stopPropagation`: el Escape es de este diálogo, no de la calculadora
    // que pueda haber abierta debajo (escucha en `window`).
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCerrar();
    } else if (e.key === 'ArrowDown' && resultados.length > 0) {
      e.preventDefault();
      setActiva((indice + 1) % resultados.length);
    } else if (e.key === 'ArrowUp' && resultados.length > 0) {
      e.preventDefault();
      setActiva((indice - 1 + resultados.length) % resultados.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      ir(indice);
    }
  };

  // Portal a `body` por lo mismo que `ConfirmDialog`: por debajo de `lg` el
  // Sidebar es un cajón con `translate`, y dentro de él un `fixed inset-0`
  // mediría los 204 px del cajón en vez de la pantalla.
  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        className="bg-bg-surface rounded-lg shadow-2xl border border-border-main w-[480px] max-w-full flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar un módulo"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 px-4 border-b border-border-main">
          <Search size={15} className="text-text-disabled shrink-0" aria-hidden="true" />
          <input
            ref={campoRef}
            type="text"
            value={consulta}
            onChange={(e) => {
              setConsulta(e.target.value);
              setActiva(0);
            }}
            placeholder="Buscar un módulo: viga, zapata, sismo…"
            aria-label="Buscar un módulo"
            role="combobox"
            aria-expanded="true"
            aria-controls={idLista}
            aria-autocomplete="list"
            aria-activedescendant={resultados.length > 0 ? idOpcion(indice) : undefined}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent py-3 text-sm text-text-primary placeholder:text-text-disabled outline-none"
          />
          {/* Con teclado es un recordatorio; en móvil, la forma de cerrar que
              no sea tocar fuera. */}
          <button type="button" onClick={onCerrar} title="Cerrar (Esc)" aria-label="Cerrar el buscador" className={`${KEYCAP} hover:text-text-secondary transition-colors`}>
            Esc
          </button>
        </div>

        {resultados.length > 0 ? (
          <ul ref={listaRef} id={idLista} role="listbox" aria-label="Módulos" className="max-h-[min(60vh,420px)] overflow-y-auto py-1.5 m-0 list-none">
            {resultados.map((d, i) => (
              <li
                key={d.key}
                id={idOpcion(i)}
                role="option"
                aria-selected={i === indice}
                onMouseMove={() => {
                  if (i !== indice) setActiva(i);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  ir(i);
                }}
                className={[
                  'flex items-center gap-2.5 px-4 py-1.5 text-[13px] cursor-pointer',
                  i === indice ? 'bg-bg-elevated text-text-primary' : 'text-text-secondary',
                ].join(' ')}
              >
                <span style={{ opacity: i === indice ? 1 : 0.75 }}>
                  <ModuleIcon moduleKey={d.key} />
                </span>
                <span>{d.label}</span>
                <span className="ml-auto text-[11px] text-text-disabled">{d.group}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p id={idLista} className="px-4 py-5 m-0 text-[13px] text-text-secondary">
            Nada con «{consulta.trim()}». Prueba con el elemento que calculas —viga, pilar, muro— o con la norma.
          </p>
        )}

        {/* Las flechas y el Intro no existen en un teléfono. */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-border-main text-[11px] text-text-disabled max-sm:hidden">
          <span>
            <span className={KEYCAP}>↑</span> <span className={KEYCAP}>↓</span> para moverte
          </span>
          <span>
            <span className={KEYCAP}>Intro</span> para abrir
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
