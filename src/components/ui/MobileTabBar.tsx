export type MobileTab = 'inputs' | 'diagramas' | 'results';

interface MobileTabBarProps {
  tab: MobileTab;
  setTab: (t: MobileTab) => void;
  /**
   * Optional list of tab keys to hide (rc-beams 'simple' mode uses this to
   * suppress the 'diagramas' tab since simple-view fuses diagram + results).
   */
  hide?: MobileTab[];
}

export function MobileTabBar({ tab, setTab, hide }: MobileTabBarProps) {
  const allTabs: { key: MobileTab; label: string }[] = [
    { key: 'inputs', label: 'Datos' },
    { key: 'diagramas', label: 'Diagramas' },
    { key: 'results', label: 'Resultados' },
  ];
  const tabs = hide && hide.length > 0
    ? allTabs.filter((t) => !hide.includes(t.key))
    : allTabs;

  return (
    <nav
      className="md:hidden flex border-b border-border-main bg-bg-surface shrink-0"
      aria-label="Secciones"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
            tab === t.key ? 'text-accent' : 'text-text-secondary'
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
