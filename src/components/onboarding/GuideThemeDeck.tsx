'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { getBuiltinEditorThemes, resolveEditorThemeColors } from '../../lib/editorThemes';
import { useUILocale, useUITranslation } from '../global/UILocaleProvider';

// The same cards remain mounted from the choice to the illustration's paper stack.
export function GuideThemeDeck({ expanded, visible, selectedId, scheme, onSelect, disabled, returning = false, gathering = false, reset = false }: {
  expanded: boolean; visible: boolean; selectedId: string; scheme: 'light' | 'dark';
  onSelect: (id: string) => void; disabled: boolean; returning?: boolean; gathering?: boolean; reset?: boolean;
}) {
  const { locale } = useUILocale();
  const { t } = useUITranslation('onboarding');
  const themes = getBuiltinEditorThemes(locale);
  const [bounds, setBounds] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [dealt, setDealt] = useState(false);
  const hasDealt = useRef(false);
  const deck = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (reset) { hasDealt.current = false; setDealt(false); return; }
    const target = document.querySelector<HTMLElement>(expanded ? '[data-theme-stage]' : '[data-scene-anchor]');
    if (!target || !visible) return;
    const measure = () => {
      const rect = target.getBoundingClientRect();
      setBounds({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    window.addEventListener('resize', measure);
    let frame = 0;
    if (expanded && !hasDealt.current) {
      // Two paints establish the stacked starting geometry before dealing the cards.
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => { setDealt(true); hasDealt.current = true; }); });
    }
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); cancelAnimationFrame(frame); };
  }, [expanded, visible, reset]);
  useLayoutEffect(() => { if (expanded) deck.current?.scrollTo({ top: 0 }); }, [expanded]);
  const columns = bounds.width >= 1000 ? 6 : bounds.width >= 700 ? 4 : bounds.width >= 480 ? 3 : 2;
  const gap = 16, cardWidth = Math.max(120, (bounds.width - gap * (columns - 1)) / columns);
  const cardHeight = cardWidth * .91;
  const rows = Math.ceil(themes.length / columns);
  const selectedIndex = Math.max(0, themes.findIndex(theme => theme.id === selectedId));
  const spread = expanded && dealt;
  const gatheredWidth = bounds.width * (gathering ? 224 / 480 : .57), gatheredHeight = bounds.height * (gathering ? 306 / 480 : .72);
  // Class hooks below also anchor focus/geometry queries; appearance stays in utilities.
  // Geometry rationale: retain the existing per-property durations and easing, including the 850ms deck geometry.
  return <div ref={deck} className="guide-deck group/deck pointer-events-none fixed z-0 overflow-visible opacity-0 transition-[left,top,width,height,opacity] duration-[850ms,850ms,850ms,850ms,400ms] ease-[cubic-bezier(.2,0,0,1),cubic-bezier(.2,0,0,1),ease,ease,ease] data-[visible=true]:opacity-100 data-[expanded=true]:pointer-events-auto data-[expanded=true]:z-20 data-[expanded=true]:overflow-x-clip data-[expanded=true]:overflow-y-auto data-[expanded=true]:scrollbar-thin data-[dealt=false]:transition-none motion-reduce:transition-none" data-dealt={dealt} data-expanded={expanded} data-gathering={gathering} data-collecting={(disabled || returning) && expanded} data-visible={visible && bounds.width > 0} aria-hidden={!expanded} inert={!expanded || disabled}
    style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}>
    {/* Geometry rationale: the existing paper drop uses its measured distance and original easing. */}
    <div className="relative w-full translate-y-0 transition-[translate] duration-650 ease-[cubic-bezier(.22,1,.36,1)] group-data-[gathering=true]/deck:translate-y-(--packing-drop) group-data-[gathering=true]/deck:delay-350 motion-reduce:transition-none" style={{ height: expanded ? rows * (cardHeight + gap) - gap : bounds.height, '--packing-drop': `${bounds.height * 24 / 480}px` } as CSSProperties}>
      {themes.map((theme, index) => {
        const selected = theme.id === selectedId;
        const colors = resolveEditorThemeColors(theme, scheme);
        const depth = selected ? 0 : ((index - selectedIndex + themes.length) % themes.length);
        const rowCount = Math.min(columns, themes.length - Math.floor(index / columns) * columns);
        const x = spread ? ((columns - rowCount) / 2 + index % columns) * (cardWidth + gap) : gathering ? bounds.width * 139 / 480 : bounds.width * .52 - gatheredWidth / 2 + depth * .8;
        const y = spread ? Math.floor(index / columns) * (cardHeight + gap) : gathering ? bounds.height * 73 / 480 : bounds.height * .48 - gatheredHeight / 2 + depth * .7;
        const rotation = spread || gathering ? 0 : selected ? -9 : -9 + depth * 1.4;
        // Runtime data colors/font belong to each simultaneous swatch, independently of the active tool theme.
        const style = {
          '--deck-x': `${x}px`, '--deck-y': `${y}px`, '--deck-rotation': `${rotation}deg`,
          '--deck-delay': `${expanded ? index * 45 : 0}ms`,
          '--sample-canvas': colors.canvas, '--sample-panel': colors.panel, '--sample-rail': colors.rail,
          '--sample-ink': colors.primary, '--sample-muted': colors.muted, '--sample-line': colors.line,
          '--sample-accent': colors.accent, '--sample-accent-text': colors['accent-text'], '--sample-font': theme.fonts.heading,
          width: spread ? cardWidth : gatheredWidth, height: spread ? cardHeight : gatheredHeight, zIndex: selected ? 30 : themes.length - depth,
        } as CSSProperties;
        // Geometry rationale: preserve composite transforms, the existing 850/300ms timelines and 12/25px resting versus 8/20px active shadows.
        return <button key={theme.id} type="button" className="guide-theme-card group/card absolute top-0 left-0 flex flex-col rounded-3_6 border border-(--sample-line) bg-(--sample-panel) p-1_8 text-(--sample-ink) transform-[translate(var(--deck-x),var(--deck-y))_rotate(var(--deck-rotation))] shadow-[0_12px_25px] shadow-canvas/35 transition-[transform,width,height,border-color,box-shadow] duration-[850ms,850ms,850ms,300ms,300ms] ease-[cubic-bezier(.2,0,0,1),ease,ease,ease,ease] delay-[var(--deck-delay),0ms,0ms,0ms,0ms] group-data-[expanded=true]/deck:cursor-pointer group-data-[expanded=true]/deck:hover:border-(--sample-accent-text) group-data-[expanded=true]/deck:hover:shadow-[0_8px_20px] group-data-[expanded=true]/deck:hover:shadow-canvas/25 group-data-[expanded=true]/deck:aria-pressed:border-(--sample-accent-text) group-data-[expanded=true]/deck:aria-pressed:shadow-[0_8px_20px] group-data-[expanded=true]/deck:aria-pressed:shadow-canvas/25 focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-(--sample-accent-text) group-data-[gathering=true]/deck:rounded-lg motion-safe:group-data-[gathering=true]/deck:transition-[transform,width,height] group-data-[gathering=true]/deck:duration-500 group-data-[gathering=true]/deck:ease-[cubic-bezier(.22,1,.36,1)] group-data-[gathering=true]/deck:delay-0 group-data-[dealt=false]/deck:transition-none motion-reduce:transition-none" style={style} aria-label={theme.name} aria-pressed={selected} disabled={disabled || !expanded} onClick={() => onSelect(theme.id)}>
          <div className="min-h-0 flex-1 overflow-hidden rounded-2_2 border border-(--sample-line) bg-(--sample-canvas) transition-[opacity,background,color] duration-350 ease-[ease] group-data-[expanded=false]/deck:opacity-0 motion-reduce:transition-none">
            <div className="flex h-3/20 items-center gap-0.75 border-b border-(--sample-line) bg-(--sample-panel) px-2_2">{[0, 1, 2].map(dot => <span key={dot} className="size-0.75 rounded-full bg-(--sample-muted) opacity-60" />)}</div>
            <div className="flex h-17/20">
              <div className="grid w-1/5 content-start gap-1_8 bg-(--sample-rail) px-1_6 py-2_6">{[0, 1, 2].map(line => <i key={line} className="h-0.75 rounded-xs bg-(--sample-muted) opacity-45" />)}</div>
              {/* Geometry rationale: preserve the original 3px sample-line corners. */}
              <div className="relative grid flex-1 content-center gap-1_4 px-3_2 py-2_4"><strong className="font-(family-name:--sample-font) text-28 font-medium tracking-tighter">Aa</strong>{[0, 1, 2].map(line => <i key={line} className="block h-0.75 w-17/20 rounded-[3px] bg-(--sample-muted) opacity-35 last-of-type:w-29/50" />)}<span className="absolute top-4_4 right-3_2 size-1_8 rounded-full bg-(--sample-accent)" /></div>
            </div>
          </div>
          <div className="pt-2_6 pb-1 text-left text-xs whitespace-nowrap transition-[opacity,background,color] duration-350 ease-[ease] group-data-[expanded=false]/deck:opacity-0 motion-reduce:transition-none"><span data-theme-title data-id={theme.id} className="group-data-[collecting=true]/deck:group-aria-pressed/card:invisible">{theme.name}</span><span className="absolute top-3 right-3 grid size-4 place-items-center rounded-full border border-(--sample-line) bg-(--sample-panel) text-10_4 group-aria-pressed/card:border-(--sample-accent-text) group-aria-pressed/card:text-(--sample-accent-text)" aria-hidden="true">{selected ? '✓' : ''}</span></div>
          <span className="sr-only">{t('appearance')}</span>
        </button>;
      })}
    </div>
  </div>;
}
