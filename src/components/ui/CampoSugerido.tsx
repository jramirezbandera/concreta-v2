/**
 * Campo de texto libre con la lista de valores habituales DENTRO de la app.
 *
 * Sustituye al `<datalist>` que colgaba del campo «Uso» del diálogo de obra.
 * Lo que fallaba no era el comportamiento, era quién pintaba el desplegable: el
 * panel de un `<datalist>` lo dibuja el navegador con su propia tipografía, su
 * propio fondo y su propia flecha, y ni una sola de esas propiedades se puede
 * tocar desde la hoja de estilos. En una ventana de 440 px de fondo claro salía
 * un panel negro con el texto en negrita —el aspecto del autorrellenado de
 * Chrome, no el de esta aplicación—, y la flecha nativa que le aparecía al
 * campo tampoco se parecía a la del `<select>` de «Provincia», que está dos
 * campos más abajo.
 *
 * Aquí la lista es del mismo material que el resto: el panel de `MenuAnadir`
 * (borde, fondo elevado, 12 px) y el teclado del combobox del municipio de
 * sismo (flechas, Enter, Escape).
 *
 * El campo SIGUE siendo de texto libre: el uso acaba en la memoria en prosa y
 * ninguna lista cerrada cubre «Edificio de viviendas con local en planta baja».
 * La flecha ofrece, no obliga.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  id: string;
  value: string;
  onChange: (valor: string) => void;
  /** Valores habituales. Elegir uno rellena el campo; se puede escribir otro. */
  sugerencias: string[];
  /** Nombre accesible de la lista: «Usos habituales». */
  etiquetaLista: string;
  placeholder?: string;
  /** Clases del `<input>`: las pone quien llama para no duplicar el estilo del formulario. */
  className?: string;
}

const sinTildes = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function CampoSugerido({ id, value, onChange, sugerencias, etiquetaLista, placeholder, className = '' }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const caja = useRef<HTMLDivElement>(null);
  const idLista = `${id}-sugerencias`;

  // Lo escrito filtra la lista; en blanco se ofrecen todas. Si coincide con una
  // sugerencia, la lista sobra: sería una sola fila repitiendo lo que ya se lee
  // en el campo, que es el segundo de los tres males del datalist que
  // documenta `MenuAnadir`.
  const q = sinTildes(value.trim());
  const visibles = q === '' ? sugerencias : sugerencias.filter((s) => sinTildes(s).includes(q) && sinTildes(s) !== q);
  const desplegada = abierto && visibles.length > 0;

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);

  const elegir = (s: string) => {
    onChange(s);
    setAbierto(false);
    setActivo(-1);
  };

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && abierto) {
      // Sin esto Escape sigue hasta la ventana y cierra el diálogo entero:
      // quien sólo quería quitarse la lista de encima perdería lo tecleado.
      e.stopPropagation();
      setAbierto(false);
      setActivo(-1);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (visibles.length === 0) return;
      e.preventDefault(); // que no mueva el cursor dentro del texto
      setAbierto(true);
      const paso = e.key === 'ArrowDown' ? 1 : -1;
      setActivo((i) => {
        const n = visibles.length;
        // Desde «ninguna», abajo lleva a la primera y arriba a la última.
        if (i < 0) return paso === 1 ? 0 : n - 1;
        return (i + paso + n) % n;
      });
      return;
    }
    if (e.key === 'Enter' && desplegada && activo >= 0) {
      e.preventDefault(); // con la lista abierta, Enter elige; no confirma
      elegir(visibles[activo]);
      return;
    }
    if (e.key === 'Tab') setAbierto(false);
  };

  return (
    <div ref={caja} className="relative">
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={desplegada}
        aria-controls={idLista}
        aria-autocomplete="list"
        {...(desplegada && activo >= 0 ? { 'aria-activedescendant': `${idLista}-${activo}` } : {})}
        className={`${className} pr-7`}
        onChange={(e) => {
          onChange(e.target.value);
          setAbierto(true);
          setActivo(-1);
        }}
        onKeyDown={teclas}
      />

      {/* La flecha es el aviso de que hay lista. Fuera del orden de tabulación:
          con el teclado se abre con ↓, que es lo que se espera de un combobox,
          y una parada más entre «Uso» y «Provincia» no aportaría nada. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => {
          setAbierto((a) => !a);
          setActivo(-1);
        }}
        className="absolute right-0 top-0 flex h-full w-7 items-center justify-center text-text-disabled transition-colors hover:text-text-secondary"
      >
        <ChevronDown size={13} />
      </button>

      {desplegada && (
        <ul
          id={idLista}
          role="listbox"
          aria-label={etiquetaLista}
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded border border-border-main bg-bg-elevated py-1 shadow-lg"
        >
          {visibles.map((s, i) => (
            <li
              key={s}
              id={`${idLista}-${i}`}
              role="option"
              aria-selected={i === activo}
              onMouseDown={(e) => e.preventDefault()} // que el campo no pierda el foco al elegir
              onClick={() => elegir(s)}
              onMouseEnter={() => setActivo(i)}
              className={`cursor-pointer px-2.5 py-1.5 text-[12px] transition-colors ${
                i === activo ? 'bg-bg-primary text-text-primary' : 'text-text-secondary'
              }`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
