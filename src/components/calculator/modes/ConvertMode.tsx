import { useEffect, useState } from 'react';
import { UNIT_GROUPS, type UnitGroupKey } from '../data';
import { convert, fmt } from '../eval';
import { showToast } from '../../ui/Toast';

export function ConvertMode() {
  const [group, setGroup] = useState<UnitGroupKey>('fuerza');
  const units = Object.keys(UNIT_GROUPS[group].units);
  const [from, setFrom] = useState(units[0]);
  const [to, setTo] = useState(units[1] || units[0]);
  const [val, setVal] = useState('1');

  useEffect(() => {
    const u = Object.keys(UNIT_GROUPS[group].units);
    setFrom(u[0]);
    setTo(u[1] || u[0]);
  }, [group]);

  const num = parseFloat((val || '0').replace(',', '.'));
  const out = isFinite(num) ? convert(num, from, to, group) : null;

  const copy = () => {
    if (out == null) return;
    navigator.clipboard?.writeText(String(out));
    showToast('Copiado al portapapeles', { autoDismiss: 1500 });
  };

  return (
    <div className="p-3">
      {/* Group selector */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled mb-1.5">Magnitud</p>
      <div className="grid grid-cols-2 gap-1 mb-3">
        {(Object.entries(UNIT_GROUPS) as Array<[UnitGroupKey, typeof UNIT_GROUPS[UnitGroupKey]]>).map(([k, g]) => (
          <button
            key={k}
            onClick={() => setGroup(k)}
            className={`text-[11px] px-2 py-1.5 rounded border transition-colors ${
              group === k
                ? 'bg-accent/10 border-accent/40 text-accent'
                : 'bg-bg-primary border-border-sub text-text-secondary hover:border-border-main'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* From */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled mb-1">Desde</p>
      <div className="flex gap-1 mb-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          inputMode="decimal"
          className="flex-1 min-w-0 bg-bg-primary border border-border-main rounded px-2 py-1.5 font-mono text-[13px] text-right text-text-primary focus:outline-none focus:border-accent"
          aria-label="Valor"
        />
        <select
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="bg-bg-elevated border border-border-main rounded px-2 py-1.5 font-mono text-[12px] text-text-primary focus:outline-none focus:border-accent"
          aria-label="Unidad origen"
        >
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* Swap */}
      <div className="flex justify-center my-1">
        <button
          onClick={() => { const a = from; setFrom(to); setTo(a); }}
          className="p-1 text-text-disabled hover:text-accent transition-colors"
          title="Intercambiar"
          aria-label="Intercambiar unidades"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
            <path d="M5 4h7l-2-2M11 12H4l2 2"/>
          </svg>
        </button>
      </div>

      {/* To */}
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled mb-1">A</p>
      <div className="flex gap-1 mb-3">
        <div
          className="flex-1 min-w-0 bg-bg-primary border border-accent/40 rounded px-2 py-1.5 font-mono text-[13px] text-right text-accent tabular-nums truncate"
          style={{ background: 'rgba(56,189,248,0.04)' }}
        >
          {out != null ? fmt(out) : '—'}
        </div>
        <select
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="bg-bg-elevated border border-border-main rounded px-2 py-1.5 font-mono text-[12px] text-text-primary focus:outline-none focus:border-accent"
          aria-label="Unidad destino"
        >
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* Quick row */}
      {out != null && num !== 0 && (
        <div className="border-t border-border-sub pt-2 mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-disabled mb-1">Equivalencias rápidas</p>
          <div className="space-y-0.5">
            {units.filter((u) => u !== from).slice(0, 4).map((u) => (
              <div key={u} className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-text-disabled">{u}</span>
                <span className="text-text-secondary tabular-nums">{fmt(convert(num, from, u, group))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={copy}
        disabled={out == null}
        className="w-full py-1.5 text-[11px] font-medium border border-border-main rounded text-text-secondary hover:text-accent hover:border-accent/40 disabled:opacity-40 transition-colors"
      >
        ⧉ Copiar resultado
      </button>
    </div>
  );
}
