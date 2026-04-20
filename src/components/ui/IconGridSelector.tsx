import React from 'react';

export interface IconGridOption<T extends string> {
  value: T;
  label: string;
  Icon: () => React.ReactElement;
  tooltip: string;
}

interface IconGridSelectorProps<T extends string> {
  options: ReadonlyArray<IconGridOption<T>>;
  active: T;
  onSelect: (value: T) => void;
  groupLabel: string;
  className?: string;
}

export function IconGridSelector<T extends string>({
  options, active, onSelect, groupLabel, className = 'mb-1',
}: IconGridSelectorProps<T>) {
  return (
    <div
      role="group"
      aria-label={groupLabel}
      className={`flex rounded border border-border-main overflow-hidden ${className}`}
    >
      {options.map(({ value, label, Icon, tooltip }) => {
        const isActive = active === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            aria-label={tooltip}
            title={tooltip}
            onClick={() => onSelect(value)}
            onKeyDown={(e) => {
              const idx = options.findIndex((o) => o.value === value);
              if (e.key === 'ArrowRight') onSelect(options[(idx + 1) % options.length].value);
              else if (e.key === 'ArrowLeft') onSelect(options[(idx - 1 + options.length) % options.length].value);
            }}
            className={`flex-1 flex flex-col items-center gap-1 py-2 px-0 min-h-11 transition-colors
              ${isActive ? 'bg-accent/10 text-accent' : 'text-text-disabled hover:text-text-secondary'}`}
          >
            <Icon />
            <span className="text-[10px] font-mono leading-none">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
