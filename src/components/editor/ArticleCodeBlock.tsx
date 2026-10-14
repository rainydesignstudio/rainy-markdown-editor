'use client';

import { createElement, type CSSProperties, useState } from 'react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import type { FormatFormatter } from '../../lib/article-format/config';
import { sanitizeHtml } from '../../lib/article-format/sanitize';

for (const [name, language] of Object.entries({ javascript, typescript, jsx, tsx, css, markup, bash, json, yaml })) SyntaxHighlighter.registerLanguage(name, language);
function camelCase(name: string): string { return name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()); }
export function ArticleCodeBlock({ text, language, formatter }: { text: string; language: string; formatter: FormatFormatter }) {
  const layout = formatter.codeLayout;
  const [copied, setCopied] = useState(false);
  const styles = Object.fromEntries(Object.entries(formatter.codeHighlight.prismStyles ?? {}).map(([selector, declarations]) => [selector,
    Object.fromEntries(Object.entries(declarations).map(([key, value]) => [camelCase(key), value])) as CSSProperties]));
  const code = <SyntaxHighlighter language={language} style={styles} PreTag={layout?.preTag ?? 'pre'} showLineNumbers={false} wrapLines={false} className={layout?.contentClasses.join(' ')}>
    {text.replace(/\n$/, '')}
  </SyntaxHighlighter>;
  if (!layout) return code;
  return createElement('div', { className: layout.wrapperClasses.join(' '), 'data-code-block': '' },
    layout.copyHtml ? <div className={layout.copyClasses.join(' ')} role="button" tabIndex={0} aria-label={layout.copyLabel}
      data-render-action="copy-code" onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied(true)); }}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void navigator.clipboard.writeText(text).then(() => setCopied(true)); } }}>
      <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(layout.copyHtml) }} />
      {copied ? <span role="status" className="sr-only">{layout.copyLabel}</span> : null}
    </div> : null, code);
}
