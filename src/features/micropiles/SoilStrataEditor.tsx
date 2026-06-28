/* eslint-disable react-refresh/only-export-components -- co-locates a small helper export with the editor component; HMR full-reload is acceptable. */
import { useEffect, useState } from 'react';
import { Trash2, ChevronDown } from 'lucide-react';
import { type SoilLayer } from '../../data/defaults';
import { type SoilType } from '../../data/micropileLookups';
import { useUnitSystem } from '../../lib/units/useUnitSystem';
import { formatNumber, getUnitLabel, getPrecision, parseQuantity } from '../../lib/units/format';
import type { Quantity } from '../../lib/units/types';

interface SoilStrataEditorProps {
  soil: SoilLayer[];
  onAdd: () => void;
  onRemove: (id: number) => void;
  onUpdate: (id: number, field: keyof SoilLayer, value: number | SoilType) => void;
  /** Campos de estrato a OCULTAR en este contexto (default: ninguno). Taludes
   *  pasa ['Nspt','rflim','Cu'] — su motor solo usa γ/c'/φ y su; los demás son
   *  específicos de micropilotes y mostrarlos siempre a 0 confunde. */
  hiddenFields?: ReadonlyArray<keyof SoilLayer>;
}

/**
 * Rangos físicos por propiedad del estrato. Antes la UI aceptaba γ=−1,
 * φ=200°, rflim=−2, etc. — el motor solo validaba thickness>0 y γ>0 y
 * dejaba pasar el resto. Aquí se acotan al rango razonable (CTE DB-SE-C
 * y experiencia geotécnica) y el blur fuerza al usuario al rango.
 */
export const SOIL_LIMITS = {
  thickness: { min: 0.05, max: 200  },     // m
  gamma:     { min: 10,   max: 26   },     // kN/m³
  c:         { min: 0,    max: 1000 },     // kPa
  phi:       { min: 0,    max: 50   },     // °
  Nspt:      { min: 0,    max: 200  },     // golpes/30cm
  su:        { min: 0,    max: 1000 },     // kN/m²
  rflim:     { min: 0,    max: 5    },     // MPa
  Cu:        { min: 0,    max: 50   },     // D60/D10 — opcional; 0 = sin dato (→<2)
} as const;

interface FieldProps {
  label: string;
  /** SI value (catalog base) when `quantity` is set; raw number otherwise. */
  value: number;
  /** Fixed unit suffix when `quantity` is omitted (m, °, NSPT=""). */
  unit?: string;
  /** When set, value + label convert with the unit system (γ kN/m³↔t/m³,
   *  c′/su kPa↔kg/cm², rfℓim N/mm²↔kg/cm²). min/max stay in SI. */
  quantity?: Quantity;
  /** Display-precision override (rfℓim needs 2 decimals, not the catalog 1). */
  precision?: number;
  min?: number;
  max?: number;
  /** Tooltip en la etiqueta (campos no obvios: Cu, rfℓim…). */
  hint?: string;
  /** Emits the SI value. */
  onChange: (n: number) => void;
}

function MiniNumField({ label, value, unit, quantity, precision, min, max, hint, onChange }: FieldProps) {
  const { system } = useUnitSystem();
  const prec = quantity ? (precision ?? getPrecision(quantity, system)) : undefined;
  // SI value → display string, and display string → SI value.
  const fmt = (si: number) => (quantity ? formatNumber(si, quantity, system, prec) : String(si));
  const toSi = (s: string): number | null => {
    if (quantity) return parseQuantity(s, quantity, system);
    const n = parseFloat(s.replace(',', '.'));
    return isNaN(n) ? null : n;
  };

  const [local, setLocal] = useState(() => fmt(value));
  // Resync cuando cambia el valor externo (reordenar estratos) o el sistema de
  // unidades. Salta el reformat si `local` ya representa `value` (no pisar lo
  // que el usuario teclea: "3" → "3.00").
  useEffect(() => {
    const parsed = toSi(local);
    if (parsed !== null && Math.abs(parsed - value) < 1e-9) return;
    setLocal(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, system]);

  const unitText = quantity ? getUnitLabel(quantity, system) : (unit ?? '');
  const fmtBound = (b: number) => fmt(b);

  const parsedSi = toSi(local);
  const isParsed = parsedSi !== null;
  const belowMin = isParsed && min !== undefined && parsedSi! < min;
  const aboveMax = isParsed && max !== undefined && parsedSi! > max;
  const outOfRange = belowMin || aboveMax;
  const errMsg = belowMin ? `min: ${fmtBound(min!)}` : aboveMax ? `max: ${fmtBound(max!)}` : null;

  return (
    <div className="flex flex-col">
      <label className="flex items-center justify-between gap-1.5 min-w-0">
        <span
          className={`text-[11px] text-text-secondary truncate ${hint ? 'underline decoration-dotted decoration-text-disabled underline-offset-2 cursor-help' : ''}`}
          title={hint}
        >
          {label}
        </span>
        <span className="flex shrink-0">
          <input
            type="text"
            inputMode="decimal"
            value={local}
            aria-invalid={outOfRange || undefined}
            onChange={(e) => {
              setLocal(e.target.value);
              const si = toSi(e.target.value);
              // Solo propaga si está en rango (SI); fuera de rango queda en local.
              if (si !== null && (min === undefined || si >= min) && (max === undefined || si <= max)) {
                onChange(si);
              }
            }}
            onBlur={() => {
              let si = toSi(local);
              if (si === null) { setLocal(fmt(value)); return; }
              if (min !== undefined && si < min) si = min;
              if (max !== undefined && si > max) si = max;
              setLocal(fmt(si));
              onChange(si);
            }}
            className={[
              'w-13 text-right rounded-l px-1.5 py-1 text-[11.5px] font-mono text-text-primary outline-none transition-colors',
              outOfRange
                ? 'bg-bg-primary border border-state-fail'
                : 'bg-bg-primary border border-border-main hover:border-accent/40 focus:border-accent',
            ].join(' ')}
          />
          {/* Chip de unidad: SIEMPRE se renderiza, también cuando no hay
              unidad (NSPT), porque el ancho fijo (min-w-10 = 40 px) es lo
              que alinea verticalmente todos los inputs de los estratos.
              Antes con `{unit && ...}`, NSPT se quedaba sin chip y su input
              "saltaba" hacia la derecha rompiendo la columna. */}
          <span className={[
            'border border-l-0 rounded-r px-1 py-1 text-[9.5px] font-mono whitespace-nowrap inline-flex items-center justify-center min-w-10',
            outOfRange ? 'bg-bg-elevated border-state-fail text-state-fail' : 'bg-bg-elevated border-border-main text-text-disabled',
          ].join(' ')}>
            {unitText}
          </span>
        </span>
      </label>
      {errMsg && (
        <div className="text-[9.5px] font-mono text-state-fail text-right pr-1">{errMsg}</div>
      )}
    </div>
  );
}

function StrataCard({
  layer, index, total, depthTop, onRemove, onUpdate, hiddenFields,
}: {
  layer: SoilLayer;
  index: number;
  total: number;
  /** Profundidad absoluta del techo del estrato (m desde rasante). */
  depthTop: number;
  onRemove: (id: number) => void;
  onUpdate: (id: number, field: keyof SoilLayer, value: number | SoilType) => void;
  hiddenFields?: ReadonlyArray<keyof SoilLayer>;
}) {
  const [open, setOpen] = useState(true);
  const hide = (f: keyof SoilLayer) => hiddenFields?.includes(f) ?? false;
  const palette =
    layer.type === 'granular' ? { dot: 'var(--color-geo-soil-line)', label: 'Granular' }
                              : { dot: 'var(--color-geo-ground)', label: 'Cohesivo' };

  // Header como div con role="button" — antes era <button> y dentro metía
  // otro <button> (la papelera), HTML inválido que React loguea como warning
  // en cada render. Cambio mínimo: div toggleable con keydown Enter/Space,
  // la papelera se queda como <button> dentro porque ya no anida buttons.
  const toggle = () => setOpen((o) => !o);
  return (
    <div className="rounded border border-border-main bg-bg-primary/40">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        }}
        className="flex items-center justify-between w-full px-2.5 py-2 text-left cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: palette.dot }} />
          <span className="text-[11.5px] text-text-primary font-medium truncate">
            E{layer.id} — {palette.label}
          </span>
          {/* Profundidad ABSOLUTA desde rasante (z=0 superficie del terreno).
              Antes solo se mostraba el espesor — el usuario no veía a qué cota
              acababa el estrato y no se daba cuenta de que la cota se mide
              desde la rasante, no desde la cabeza del pilote. */}
          <span className="text-[10px] text-text-disabled font-mono whitespace-nowrap">
            {depthTop.toFixed(2)}–{(depthTop + layer.thickness).toFixed(2)} m
          </span>
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {total > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(layer.id);
              }}
              className="p-1 text-text-disabled hover:text-state-fail transition-colors"
              aria-label={`Eliminar estrato ${index + 1}`}
            >
              <Trash2 size={11} />
            </button>
          )}
          <ChevronDown
            size={12}
            className="text-text-disabled transition-transform"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          />
        </span>
      </div>

      {open && (
        <div className="border-t border-border-sub px-2.5 py-2 grid grid-cols-1 gap-1.5">
          <label className="flex items-center justify-between gap-1.5 min-w-0">
            <span className="text-[11px] text-text-secondary">Tipo</span>
            <select
              value={layer.type}
              onChange={(e) => onUpdate(layer.id, 'type', e.target.value as SoilType)}
              className="bg-bg-primary border border-border-main rounded px-1.5 py-1 text-[11.5px] font-mono text-text-primary outline-none focus:border-accent transition-colors"
            >
              <option value="granular">Granular</option>
              <option value="cohesive">Cohesivo</option>
            </select>
          </label>
          <MiniNumField label="Pot."   unit="m"     hint="Potencia (espesor) del estrato." value={layer.thickness} {...SOIL_LIMITS.thickness} onChange={(n) => onUpdate(layer.id, 'thickness', n)} />
          <MiniNumField label="γ"      quantity="weightDensity" value={layer.gamma}     {...SOIL_LIMITS.gamma}     onChange={(n) => onUpdate(layer.id, 'gamma', n)} />
          {/* c′ solo se muestra en cohesivos — en granulares la cohesión efectiva
              es cero por definición y mostrarlo confundía al usuario. */}
          {layer.type === 'cohesive' && (
            <MiniNumField label="c′"   quantity="cohesion"   value={layer.c}         {...SOIL_LIMITS.c}         onChange={(n) => onUpdate(layer.id, 'c', n)} />
          )}
          <MiniNumField label="φ"      unit="°"     value={layer.phi}       {...SOIL_LIMITS.phi}       onChange={(n) => onUpdate(layer.id, 'phi', n)} />
          {!hide('Nspt') && (
            <MiniNumField label="NSPT"               value={layer.Nspt}      {...SOIL_LIMITS.Nspt}      onChange={(n) => onUpdate(layer.id, 'Nspt', n)} />
          )}
          {layer.type === 'cohesive' && (
            <MiniNumField label="su" quantity="cohesion" hint="Resistencia al corte sin drenaje del terreno cohesivo." value={layer.su} {...SOIL_LIMITS.su} onChange={(n) => onUpdate(layer.id, 'su', n)} />
          )}
          {/* Cu = D60/D10 — solo granulares. Condiciona el pandeo (Tabla 3.6):
              en arena de compacidad media activa la comprobación si Cu≥2, y en
              arena floja saturada Cu<2 la clasifica como terreno inestable.
              Vacío (0) ⇒ se trata como Cu<2 (sin dato granulométrico). */}
          {layer.type === 'granular' && !hide('Cu') && (
            <MiniNumField
              label="Cu (opc.)"
              value={layer.Cu ?? 0}
              hint="Coef. uniformidad D60/D10 (opcional). Vacío o 0 ⇒ se asume Cu<2. Solo afecta al pandeo en arenas (Guía 3.6.1)."
              {...SOIL_LIMITS.Cu}
              onChange={(n) => onUpdate(layer.id, 'Cu', n)}
            />
          )}
          {!hide('rflim') && (
            <MiniNumField label="rfℓim" quantity="stress" precision={2}   hint="Rozamiento límite por fuste (resistencia unitaria del terreno en el contacto con el micropilote)." value={layer.rflim}     {...SOIL_LIMITS.rflim}     onChange={(n) => onUpdate(layer.id, 'rflim', n)} />
          )}
        </div>
      )}
    </div>
  );
}

export function SoilStrataEditor({ soil, onAdd, onRemove, onUpdate, hiddenFields }: SoilStrataEditorProps) {
  // Profundidad del techo de cada estrato (acumulada DESDE LA RASANTE).
  // Se pasa a cada card para que el header muestre el rango absoluto
  // [techo–base] del estrato, no solo su espesor.
  // Prefix sum without render-time mutation: top of stratum i = Σ thickness[0..i-1].
  const depthTops = soil.map((_l, i) =>
    soil.slice(0, i).reduce((acc, s) => acc + s.thickness, 0),
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-text-disabled leading-snug px-0.5">
        Profundidades medidas desde la rasante (z=0 = superficie del terreno),
        tal y como las da el estudio geotécnico.
      </p>
      {soil.map((layer, i) => (
        <StrataCard
          key={layer.id}
          layer={layer}
          index={i}
          total={soil.length}
          depthTop={depthTops[i]}
          onRemove={onRemove}
          onUpdate={onUpdate}
          hiddenFields={hiddenFields}
        />
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="text-[11px] text-accent/80 hover:text-accent transition-colors text-left py-1 px-2"
      >
        + Añadir estrato
      </button>
    </div>
  );
}
