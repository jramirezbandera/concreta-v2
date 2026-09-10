/**
 * Qué cálculo de esta obra tienes abierto en el módulo, y el salto a los otros.
 *
 * Va en la miga de pan de la topbar, detrás del nombre del módulo, porque es la
 * continuación natural de dónde estás: «HORMIGÓN / Vigas / V-3». Antes de esto,
 * el módulo tenía un único cálculo y no había nada que decir; ahora el anejo
 * guarda las vigas de la obra y saltar entre ellas sin pasar por el anejo es lo
 * que convierte el módulo en un editor de documentos.
 *
 * Como el modal de previsualización, no recibe nada de los módulos: la ruta
 * dice cuál es (`useModuloEnPantalla`), así que los veinte siguen sin saber que
 * el anejo existe. Y no aparece hasta que hay algo que enseñar —ningún cálculo
 * guardado de este módulo y ninguno abierto—, para que un módulo que nunca has
 * guardado no cargue con un desplegable vacío.
 *
 * Saltar y empezar de nuevo REMONTAN el módulo (`pedirRemonte`): los módulos
 * leen el almacén sólo al montarse, así que sin eso se les cambiarían los datos
 * por debajo y seguirían enseñando los de antes.
 *
 * A11y: igual que `ExportarMenu` —Escape y clic fuera cierran, `aria-expanded`
 * en el disparador, `menuitem` en las opciones—, y la opción abierta lleva
 * `aria-current`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, FilePlus2 } from 'lucide-react';
import { showToast } from '../ui/Toast';
import {
  hayTrabajoSinGuardar,
  nuevoCalculo,
  piezaAbierta,
  restaurarPieza,
  type Pieza,
} from '../../lib/anejo';
import { pedirRemonte } from '../../lib/anejo/remonte';
import { useAnejo } from '../../lib/anejo/useAnejo';
import { useModuloEnPantalla } from '../../lib/anejo/useModuloEnPantalla';

const OPCION =
  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-text-primary hover:bg-bg-elevated transition-colors';

export function PiezaMenu() {
  const adaptador = useModuloEnPantalla();
  const anejo = useAnejo();
  const [abierto, setAbierto] = useState(false);
  const [confirmando, setConfirmando] = useState<{ hacer: () => void } | null>(null);
  // Dónde cae el panel. La miga de pan trunca con `overflow-hidden`, que se
  // come cualquier hijo posicionado: en absoluto el menú se abría —el DOM decía
  // que sí— y no se veía nada. Fijo escapa del recorte, y como sigue siendo
  // hijo del mismo `div` el cierre por clic fuera sigue funcionando igual.
  const [donde, setDonde] = useState<{ top: number; left: number } | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);

  // Antes del primer `return`: es lo que usa el efecto de cerrar con Escape y
  // con clic fuera, y el compilador de React exige tenerlo declarado ya.
  const cerrar = useCallback(() => {
    setAbierto(false);
    setConfirmando(null);
    disparador.current?.focus();
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) cerrar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto, cerrar]);

  if (!adaptador) return null;
  const modulo = adaptador.modulo;
  const propias = anejo.piezas.filter((p) => p.modulo === modulo);
  const abiertaAhora = piezaAbierta(modulo);
  if (propias.length === 0 && abiertaAhora === null) return null;

  /** Con trabajo sin guardar pregunta antes; si no, va. */
  const conAviso = (hacer: () => void) => {
    if (hayTrabajoSinGuardar(modulo)) {
      setConfirmando({ hacer });
      return;
    }
    cerrar();
    hacer();
  };

  const saltar = (pieza: Pieza) => {
    const r = restaurarPieza(pieza.id);
    if (!r.ok) {
      showToast('No se ha podido abrir ese cálculo. Ábrelo desde el anejo para saber por qué.', { autoDismiss: 5000 });
      return;
    }
    pedirRemonte();
  };

  const empezar = () => {
    if (nuevoCalculo(modulo)) pedirRemonte();
  };

  return (
    <div ref={caja} className="min-w-0 shrink-0">
      <button
        ref={disparador}
        type="button"
        onClick={() => {
          const r = disparador.current?.getBoundingClientRect();
          if (r) setDonde({ top: r.bottom + 4, left: r.left });
          setAbierto((v) => !v);
        }}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label={abiertaAhora ? `Cálculo abierto: ${abiertaAhora.titulo}. Cambiar de cálculo` : 'Elegir un cálculo guardado'}
        title="Los cálculos de este módulo guardados en el anejo de la obra"
        className="inline-flex max-w-[9rem] items-center gap-1 rounded px-1 text-[12.5px] text-text-secondary hover:text-text-primary transition-colors sm:max-w-[14rem]"
      >
        <span className="truncate">{abiertaAhora ? abiertaAhora.titulo : 'Sin guardar'}</span>
        <ChevronDown size={13} className="shrink-0" aria-hidden="true" />
      </button>

      {abierto && (
        <div
          role="menu"
          aria-label={`Cálculos de ${adaptador.capitulo} en el anejo`}
          style={donde ? { top: donde.top, left: donde.left } : undefined}
          className="fixed z-50 w-72 overflow-hidden rounded border border-border-main bg-bg-surface py-1 shadow-2xl"
        >
          {confirmando ? (
            <div className="px-3 py-2">
              <p className="m-0 text-[12.5px] text-text-primary">
                Lo que hay en {adaptador.capitulo} no está guardado en el anejo. Si cambias de cálculo, se pierde.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  className="rounded border border-border-main bg-bg-primary px-2 py-0.5 text-[11.5px] text-text-primary hover:bg-bg-elevated transition-colors"
                  onClick={() => {
                    const { hacer } = confirmando;
                    cerrar();
                    hacer();
                  }}
                >
                  Cambiar igualmente
                </button>
                <button type="button" className="text-[11.5px] text-text-secondary hover:text-text-primary" onClick={cerrar}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              {propias.length > 0 && (
                <div role="group" aria-label="Guardados en el anejo">
                  {propias.map((p) => {
                    const esLaAbierta = abiertaAhora?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="menuitem"
                        aria-current={esLaAbierta ? 'true' : undefined}
                        className={OPCION}
                        onClick={() => (esLaAbierta ? cerrar() : conAviso(() => saltar(p)))}
                      >
                        <Check
                          size={13}
                          className={esLaAbierta ? 'shrink-0 text-accent' : 'shrink-0 opacity-0'}
                          aria-hidden="true"
                        />
                        <span className="truncate">{p.titulo}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="my-1 h-px bg-border-sub" />
              <button type="button" role="menuitem" className={OPCION} onClick={() => conAviso(empezar)}>
                <FilePlus2 size={13} className="shrink-0 text-text-disabled" aria-hidden="true" />
                Nuevo cálculo
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
