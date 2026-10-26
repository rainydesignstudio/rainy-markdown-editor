import { useEffect, useState } from 'react';
import { compileArticleStyles } from '../lib/article-format/renderer';
import { productCause, type ProductMessageValue } from '../lib/i18n/productMessages';
import type { FormatSnapshot } from '../lib/article-format/runtime';
import type { ThemeConfig } from '../lib/types';

/** Shared compile state for resource previews; obsolete content never looks like a current success. */
export function useResourcePreviewStyles(source: string, theme: ThemeConfig, snapshot: FormatSnapshot, blocked: boolean, delay = 0) {
  const [result, setResult] = useState<{ source: string; theme: ThemeConfig; formatId: string; css: string; issue: ProductMessageValue } | null>(null);
  const current = !blocked && result?.source === source && result.theme === theme && result.formatId === snapshot.id ? result : null;
  useEffect(() => {
    if (blocked) return;
    let active = true;
    const compile = () => { void compileArticleStyles(source, theme, { snapshot }).then(value => {
      if (active) setResult({ source, theme, formatId: snapshot.id, css: value.css, issue: '' });
    }).catch(error => { if (active) setResult({ source, theme, formatId: snapshot.id, css: '', issue: productCause(error) }); }); };
    const timer = delay ? window.setTimeout(compile, delay) : null;
    if (!delay) compile();
    return () => { active = false; if (timer !== null) window.clearTimeout(timer); };
  }, [source, theme, snapshot.id, blocked, delay]);
  const retained = !blocked && result?.formatId === snapshot.id && result.theme === theme && !result.issue ? result.css : '';
  return { css: current?.css ?? retained, issue: current?.issue ?? '', pending: !blocked && !current, ready: Boolean(current && !current.issue && !snapshot.error), result: current };
}
