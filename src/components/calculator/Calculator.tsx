import { useEffect, useRef, useState } from 'react';
import { NumericMode } from './modes/NumericMode';
import { ConvertMode } from './modes/ConvertMode';
import { FormulaMode } from './modes/FormulaMode';

type Mode = 'num' | 'conv' | 'form';

interface CalculatorProps {
  open: boolean;
  onClose: () => void;
  onMinimize: () => void;
}

const DOCK_X_MARGIN = 16;

export function Calculator({ open, onClose, onMinimize }: CalculatorProps) {
  const [mode, setMode] = useState<Mode>('num');
  const [vw, setVw] = useState(() => window.innerWidth);
  const [pos, setPos] = useState(() => ({ x: DOCK_X_MARGIN, y: 64 }));
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [sheetDrag, setSheetDrag] = useState<{ startY: number; dy: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Track viewport
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Dock to bottom-left whenever viewport changes (and on mount)
  useEffect(() => {
    const h = Math.min(540, window.innerHeight - 80);
    const maxY = Math.max(64, window.innerHeight - h - DOCK_X_MARGIN);
    setPos({ x: DOCK_X_MARGIN, y: maxY });
  }, [vw]);

  // Drag handling
  useEffect(() => {
    if (!drag) return;
    const move = (e: MouseEvent | TouchEvent) => {
      const t = 'touches' in e ? e.touches[0] : e;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - 100, t.clientX - drag.dx)),
        y: Math.max(8, Math.min(window.innerHeight - 60, t.clientY - drag.dy)),
      });
    };
    const up = () => setDrag(null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [drag]);

  if (!open) return null;

  const isMobile = vw < 1024;
  const isSmallDisplay = vw <= 1280 || window.innerHeight <= 720;

  const onDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const t = 'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    setDrag({ dx: t.clientX - pos.x, dy: t.clientY - pos.y });
  };

  // Sheet swipe-to-close (mobile)
  const onSheetTouchStart = (e: React.TouchEvent) => {
    setSheetDrag({ startY: e.touches[0].clientY, dy: 0 });
  };
  const onSheetTouchMove = (e: React.TouchEvent) => {
    if (!sheetDrag) return;
    const dy = Math.max(0, e.touches[0].clientY - sheetDrag.startY);
    setSheetDrag({ ...sheetDrag, dy });
  };
  const onSheetTouchEnd = () => {
    if (!sheetDrag) return;
    if (sheetDrag.dy > 90) onClose();
    setSheetDrag(null);
  };

  const sheetTransform = sheetDrag ? `translateY(${sheetDrag.dy}px)` : 'translateY(0)';
  const sheetTransition = sheetDrag ? 'none' : 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)';

  const panelWidth = isMobile
    ? '100%'
    : Math.round(Math.min(400, Math.max(320, vw * 0.26)));
  const panelMaxH = isMobile ? '88vh' : 'min(620px, calc(100vh - 24px))';

  const radius = isMobile ? 16 : 8;

  const positionStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        left: 0, right: 0, bottom: 0, top: 'auto',
        width: '100%', height: 'auto',
        maxHeight: '88vh',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        transform: sheetTransform,
        transition: sheetTransition,
      }
    : {
        position: 'fixed',
        left: pos.x,
        top: Math.max(8, pos.y),
        width: panelWidth,
        maxHeight: panelMaxH,
        borderRadius: radius,
      };

  // Premium skin (selected default per design save state)
  const panelStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, #1a1f28, #11151c)',
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 30px 80px -16px rgba(0,0,0,0.9), 0 0 0 1px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02) inset',
    zIndex: 60,
  };

  const headerStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    ...(isMobile ? {} : { borderTopLeftRadius: radius, borderTopRightRadius: radius }),
  };

  return (
    <>
      {/* Mobile scrim */}
      {isMobile && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-55"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
          aria-hidden="true"
        />
      )}

      <div
        ref={ref}
        className="flex flex-col"
        style={{ ...positionStyle, ...panelStyle }}
        role="dialog"
        aria-label="Calculadora Concreta"
      >
        {/* Mobile drag handle */}
        {isMobile && (
          <div
            className="flex items-center justify-center pt-2 pb-1 touch-none"
            onTouchStart={onSheetTouchStart}
            onTouchMove={onSheetTouchMove}
            onTouchEnd={onSheetTouchEnd}
          >
            <span className="block w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.18)' }} />
          </div>
        )}

        {/* Header */}
        <div
          className={`relative flex items-center gap-2 px-3 ${isMobile ? 'h-12' : 'h-10'} ${isMobile ? '' : 'cursor-move'} select-none`}
          style={headerStyle}
          onMouseDown={isMobile ? undefined : onDragStart}
          onTouchStart={isMobile ? undefined : onDragStart}
        >
          {/* Premium gold rail */}
          <span
            className="absolute left-0 top-0 bottom-0 w-0.5"
            style={{ background: 'linear-gradient(180deg, #d4a44a, #8a6920)' }}
          />
          <span
            className="w-1.25 h-1.25 rounded-full"
            style={{ background: '#d4a44a', boxShadow: '0 0 8px rgba(212,164,74,0.7)' }}
          />
          <span className={`${isMobile ? 'text-[14px]' : 'text-[12px]'} font-semibold text-text-primary tracking-tight`}>
            Calculadora
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <span className="font-mono text-[10px] text-text-disabled border border-border-main rounded px-1 hidden md:inline">
              Esc
            </span>
            {!isMobile && (
              <button
                onClick={onMinimize}
                title="Minimizar"
                className="p-1.5 text-text-disabled hover:text-text-primary"
                aria-label="Minimizar"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 8h10" strokeLinecap="round" />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              title="Cerrar"
              className={`${isMobile ? 'p-2' : 'p-1.5'} text-text-disabled hover:text-text-primary`}
              aria-label="Cerrar"
            >
              <svg width={isMobile ? 16 : 12} height={isMobile ? 16 : 12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex items-center px-2 py-1.5 border-b border-border-sub gap-0.5">
          {(['num', 'conv', 'form'] as const).map((k) => {
            const labels: Record<Mode, string> = { num: 'Numérica', conv: 'Unidades', form: 'Fórmulas' };
            return (
              <button
                key={k}
                onClick={() => setMode(k)}
                className={`flex-1 text-[11px] font-medium px-2 py-1 rounded transition-colors ${
                  mode === k ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
                }`}
              >
                {labels[k]}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {mode === 'num' && <NumericMode density={isSmallDisplay ? 'compact' : 'normal'} />}
          {mode === 'conv' && <ConvertMode />}
          {mode === 'form' && <FormulaMode />}
        </div>
      </div>
    </>
  );
}
