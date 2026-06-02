import { useEffect, useState } from 'react';
import { Trash2, ChevronDown } from 'lucide-react';
import { type SoilLayer } from '../../data/defaults';
import { type SoilType } from '../../data/micropileLookups';

interface SoilStrataEditorProps {
  soil: SoilLayer[];
  onAdd: () => void;
  onRemove: (id: number) => void;
  onUpdate: (id: number, field: keyof SoilLayer, value: number | SoilType) => void;
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
  Cu:        { min: 1,    max: 50   },     // D60/D10 (coef. uniformidad, granulares)
} as const;

interface FieldProps {
  label: string;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}

function MiniNumField({ label, value, unit, min, max, onChange }: FieldProps) {
  const [local, setLocal] = useState(String(value));
  // Resync cuando el valor externo cambia (añadir/quitar estratos reordena
  // las cards y antes el local stale enmascaraba el valor real hasta el blur).
  useEffect(() => { setLocal(String(value)); }, [value]);

  const parsed = parseFloat(local);
  const isParsed = !isNaN(parsed);
  const belowMin = isParsed && min !== undefined && parsed < min;
  const aboveMax = isParsed && max !== undefined && parsed > max;
  const outOfRange = belowMin || aboveMax;
  const errMsg = belowMin ? `min: ${min}` : aboveMax ? `max: ${max}` : null;

  return (
    <div className="flex flex-col">
      <label className="flex items-center justify-between gap-1.5 min-w-0">
        <span className="text-[11px] text-text-secondary truncate">{label}</span>
        <span className="flex shrink-0">
          <input
            type="text"
            inputMode="decimal"
            value={local}
            aria-invalid={outOfRange || undefined}
            onChange={(e) => {
              setLocal(e.target.value);
              const n = parseFloat(e.target.value);
              // Solo propaga si está en rango; fuera de rango queda en local.
              if (!isNaN(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) {
                onChange(n);
              }
            }}
            onBlur={() => {
              let n = parseFloat(local);
              if (isNaN(n)) { setLocal(String(value)); return; }
              if (min !== undefined && n < min) n = min;
              if (max !== undefined && n > max) n = max;
              setLocal(String(n));
              onChange(n);
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
            {unit ?? ''}
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
  layer, index, total, depthTop, onRemove, onUpdate,
}: {
  layer: SoilLayer;
  index: number;
  total: number;
  /** Profundidad absoluta del techo del estrato (m desde rasante). */
  depthTop: number;
  onRemove: (id: number) => void;
  onUpdate: (id: number, field: keyof SoilLayer, value: number | SoilType) => void;
}) {
  const [open, setOpen] = useState(true);
  const palette =
    layer.type === 'granular' ? { dot: '#a8825a', label: 'Granular' }
                              : { dot: '#8a6a44', label: 'Cohesivo' };

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
          <MiniNumField label="Pot."   unit="m"     value={layer.thickness} {...SOIL_LIMITS.thickness} onChange={(n) => onUpdate(layer.id, 'thickness', n)} />
          <MiniNumField label="γ"      unit="kN/m³" value={layer.gamma}     {...SOIL_LIMITS.gamma}     onChange={(n) => onUpdate(layer.id, 'gamma', n)} />
          {/* c′ solo se muestra en cohesivos — en granulares la cohesión efectiva
              es cero por definición y mostrarlo confundía al usuario. */}
          {layer.type === 'cohesive' && (
            <MiniNumField label="c′"   unit="kPa"   value={layer.c}         {...SOIL_LIMITS.c}         onChange={(n) => onUpdate(layer.id, 'c', n)} />
          )}
          <MiniNumField label="φ"      unit="°"     value={layer.phi}       {...SOIL_LIMITS.phi}       onChange={(n) => onUpdate(layer.id, 'phi', n)} />
          <MiniNumField label="NSPT"               value={layer.Nspt}      {...SOIL_LIMITS.Nspt}      onChange={(n) => onUpdate(layer.id, 'Nspt', n)} />
          {layer.type === 'cohesive' && (
            <MiniNumField label="su" unit="kN/m²" value={layer.su} {...SOIL_LIMITS.su} onChange={(n) => onUpdate(layer.id, 'su', n)} />
          )}
          {/* Cu = D60/D10 — solo granulares. Condiciona el pandeo (Tabla 3.6):
              en arena de compacidad media activa la comprobación si Cu≥2, y en
              arena floja saturada Cu<2 la clasifica como terreno inestable.
              Vacío (0) ⇒ se trata como Cu<2 (sin dato granulométrico). */}
          {layer.type === 'granular' && (
            <MiniNumField label="Cu" value={layer.Cu ?? 0} {...SOIL_LIMITS.Cu} onChange={(n) => onUpdate(layer.id, 'Cu', n)} />
          )}
          <MiniNumField label="rfℓim" unit="MPa"   value={layer.rflim}     {...SOIL_LIMITS.rflim}     onChange={(n) => onUpdate(layer.id, 'rflim', n)} />
        </div>
      )}
    </div>
  );
}

export function SoilStrataEditor({ soil, onAdd, onRemove, onUpdate }: SoilStrataEditorProps) {
  // Profundidad del techo de cada estrato (acumulada DESDE LA RASANTE).
  // Se pasa a cada card para que el header muestre el rango absoluto
  // [techo–base] del estrato, no solo su espesor.
  let depthAcc = 0;
  const depthTops = soil.map((l) => {
    const top = depthAcc;
    depthAcc += l.thickness;
    return top;
  });

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
