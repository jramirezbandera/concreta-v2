interface ModulePlaceholderProps {
  label: string;
  group: string;
}

export function ModulePlaceholder({ label, group }: ModulePlaceholderProps) {
  return (
    <div className="flex-1 flex items-center justify-center text-center p-8">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-md border border-border-main flex items-center justify-center text-text-disabled">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
        </div>
        <div>
          <p className="text-base font-medium text-text-secondary">
            {group} — {label}
          </p>
          <p className="text-sm text-text-disabled mt-1">En desarrollo — próximamente</p>
        </div>
      </div>
    </div>
  );
}
