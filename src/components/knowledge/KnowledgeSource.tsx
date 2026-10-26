'use client';

import { useLayoutEffect, useMemo, useState, type RefObject } from 'react';
import { ScrollViewport } from '../global/ScrollViewport';
import { useUITranslation } from '../global/UILocaleProvider';

/** Raw source remains unwrapped; only the visible gutter is rendered for long files. */
export function KnowledgeSource({ text, textareaRef, showLineNumbers, onSelection }: { text: string; textareaRef: RefObject<HTMLTextAreaElement | null>; showLineNumbers: boolean; onSelection?: () => void }) {
  const { t } = useUITranslation('knowledge');
  const count = useMemo(() => showLineNumbers ? text.split('\n').length : 1, [text, showLineNumbers]);
  const [viewport, setViewport] = useState({ first: 0, rows: 1, offset: 0 });
  const sync = () => {
    const area = textareaRef.current;
    if (!area || !showLineNumbers) return;
    const line = parseFloat(getComputedStyle(area).lineHeight) || parseFloat(getComputedStyle(area).fontSize) * 1.5;
    const next = { first: Math.floor(area.scrollTop / line), rows: Math.ceil(area.clientHeight / line) + 2, offset: -(area.scrollTop % line) };
    setViewport(previous => previous.first === next.first && previous.rows === next.rows && previous.offset === next.offset ? previous : next);
  };
  useLayoutEffect(() => {
    sync(); const area = textareaRef.current;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    if (area) observer?.observe(area);
    return () => observer?.disconnect();
  }, [text, showLineNumbers]);
  const width = `${String(count).length + 5}ch`;
  return <div className="relative flex min-h-0 min-w-0 flex-1 bg-editor-surface">
    <ScrollViewport as="textarea" horizontal ref={textareaRef} readOnly spellCheck={false} wrap="off" aria-label={t('sourceView')} value={text} onScroll={sync} onSelect={onSelection}
      className="w-full flex-1 resize-none border-0 bg-editor-surface p-4 font-article-source text-editor-source text-editor-text outline-none focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-accent"
      style={showLineNumbers ? { paddingLeft: width } : undefined} />
    {showLineNumbers ? <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden bg-editor-surface px-3 py-4 text-right font-article-source text-editor-source text-faint" style={{ width }}><pre className="font-article-source text-editor-source" style={{ transform: `translateY(${viewport.offset}px)` }}>{Array.from({ length: Math.max(0, Math.min(viewport.rows, count - viewport.first)) }, (_, index) => viewport.first + index + 1).join('\n')}</pre></div> : null}
  </div>;
}
