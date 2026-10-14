'use client';

import { productText } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import { useEffect, useState } from 'react';
import { CollapsiblePanel, PanelIcon } from '../global/CollapsiblePanel';
import type { ThemeConfig, ThemeNodeKey } from '../../lib/types';
import { ButtonBar } from '../global/ButtonBar';
import { ColorSwatchButton } from '../global/ColorSwatchButton';
import { INSPECTION_ROW_CLASSES, type ThemeInspection } from '../global/ThemeInspection';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { articleDarkMode } from '../../lib/article-format/styleTypes';
import { themeColorValue } from '../../lib/themes';
import type { ArticleDarkColors } from '../../hooks/useArticleRenderMount';
import { TooltipButton } from '../global/TooltipButton';

export const ARTICLE_NODE_OPTIONS: Array<{ id: ThemeNodeKey; label: string }> = [
  { id: 'h1', label: productText("articleThemeFields.heading1") }, { id: 'h2', label: productText("articleThemeFields.heading2") }, { id: 'h3', label: productText("articleThemeFields.heading3") },
  { id: 'h4', label: productText("articleThemeFields.heading4") }, { id: 'h5', label: productText("articleThemeFields.heading5") }, { id: 'h6', label: productText("articleThemeFields.heading6") },
  { id: 'paragraph', label: productText("articleThemeFields.bodyParagraph") }, { id: 'blockquote', label: productText("articleThemeFields.quote") }, { id: 'inlineCode', label: productText("articleThemeFields.inlineCode") },
  { id: 'codeBlock', label: productText("articleThemeFields.codeBlock") }, { id: 'table', label: productText("articleThemeFields.table") }, { id: 'caption', label: productText("articleThemeFields.caption") }, { id: 'divider', label: productText("articleThemeFields.divider") },
];

export function ArticleThemeFields({ theme, disabled, nodeKey, onNodeKey, onToken, onDarkToken, darkColors, onNodeValue, onResetNode, onColor, inspection, nodeColors = {} }: {
  theme: ThemeConfig; disabled: boolean; nodeKey: ThemeNodeKey;
  onNodeKey: (key: ThemeNodeKey) => void; onToken: (key: string, value: string) => void;
  onDarkToken: (key: string, value: string | null) => void; darkColors?: ArticleDarkColors;
  onNodeValue: (key: 'fontSize' | 'lineHeight' | 'color', value: string) => void; onResetNode: () => void;
  onColor: (label: string, token: string, value: string, select: (color: string) => void, scheme?: 'light' | 'dark') => void;
  inspection?: ThemeInspection;
  nodeColors?: Partial<Record<ThemeNodeKey, string>>;
}) {
  const { t } = useUITranslation('dialogs');
  const snapshot = useFormatSnapshot();
  const automatic = articleDarkMode(snapshot.bundle.formatter) === 'algorithm';
  const node = theme.nodes?.[nodeKey] ?? {};
  const [colorsOpen, setColorsOpen] = useState(true);
  const [nodesOpen, setNodesOpen] = useState(true);
  useEffect(() => { if (!inspection?.selected) return; if (inspection.selected.kind === 'node') setNodesOpen(true); else setColorsOpen(true); }, [inspection?.selected]);
  const nodeColor = node.color ?? nodeColors[nodeKey] ?? '';
  const resolvedNodeColor = nodeColor.replace(/var\(--([a-z-]+)\)/g, (_, key: string) => theme.tokens[key] ?? nodeColor);
  return <div className="grid content-start gap-4">
    <CollapsiblePanel id="article-theme-colors" title={t('dialogs:ui.colors')} icon={<PanelIcon kind="colors" />} count={Object.keys(theme.tokens).filter(key => key.startsWith('color-')).length} open={colorsOpen} onToggle={() => setColorsOpen(value => !value)} className="shrink-0" contentClassName="pb-2">
      <p className="mb-3 text-xs text-muted">{t(automatic ? 'dialogs:articleDark.automatic' : 'dialogs:articleDark.manual')}</p>
      <div className="flex items-center justify-between gap-3 border-b border-line pb-2 text-2xs text-faint"><span>{t('dialogs:ui.semanticRoles')}</span><div className="flex shrink-0 gap-3"><span className="w-12 text-center">{t('dialogs:ui.light')}</span><span className="w-12 text-center">{t('dialogs:ui.dark')}</span></div></div>
      <div>{Object.entries(theme.tokens).filter(([token]) => token.startsWith('color-')).map(([token]) => {
        const label = t('dialogs:articleColors.' + token, { defaultValue: token.replace('color-article-', '') });
        const color = themeColorValue(theme, token), darkColor = themeColorValue(theme, token, true);
        const values = darkColors?.values[token] ?? [];
        const status = darkColors?.status ?? 'pending';
        const inherited = !Object.hasOwn(theme.dark?.tokens ?? {}, token);
        return <div key={token} {...inspection?.rowProps(token)} className={`flex items-start justify-between gap-3 border-b border-line/60 py-3 last:border-0 ${INSPECTION_ROW_CLASSES}`}>
          <div className="min-w-0"><p className="text-xs font-medium text-primary">{label}</p><p className="mt-1 break-all font-mono text-2xs text-faint">--{token}</p></div>
          <div className="flex shrink-0 gap-3">
            <div className="flex w-12 justify-center"><ColorSwatchButton color={color} className="size-8 shrink-0 rounded-full border border-line-strong hover:ring-2 hover:ring-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed" type="button" aria-haspopup="dialog" aria-label={`${label} · ${t('dialogs:ui.light')}`} disabled={disabled} onClick={() => onColor(`${label} · ${t('dialogs:ui.light')}`, `--${token}`, color, value => onToken(token, value), 'light')} /></div>
            <div className="grid w-12 justify-items-center gap-1">
              {automatic ? status !== 'ready' || !values.length ? <span className="text-center text-2xs text-faint" role="status">{t(status === 'error' ? 'dialogs:articleDark.failed' : status === 'pending' ? 'dialogs:articleDark.pending' : 'dialogs:articleDark.unused')}</span> : <>
                <TooltipButton type="button" aria-disabled="true" aria-label={`${label} · ${t('dialogs:articleDark.readOnly')}: ${values.join(' / ')}`} className="grid size-8 grid-cols-2 overflow-hidden rounded-full border border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" tooltip={<span className="grid max-w-72 gap-1 break-all text-2xs"><span>{t('dialogs:articleDark.readOnly')}</span>{values.map(value => <span key={value} className="font-mono">{value}</span>)}</span>}>
                  {values.slice(0, 4).map((value, index) => <span key={value} className={values.length === 1 ? 'col-span-2 row-span-2 size-full' : values.length === 2 || values.length === 3 && index === 2 ? 'col-span-2' : ''} style={{ background: /url\(/i.test(value) ? undefined : value }} aria-hidden="true" />)}
                </TooltipButton>
                {values.length > 1 ? <span className="text-center text-2xs text-faint">{t('dialogs:articleDark.multiple', { count: values.length })}</span> : null}
              </> : <>
                <ColorSwatchButton color={darkColor} className="size-8 shrink-0 rounded-full border border-line-strong hover:ring-2 hover:ring-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed" type="button" aria-haspopup="dialog" aria-label={`${label} · ${t('dialogs:ui.dark')}`} disabled={disabled} onClick={() => onColor(`${label} · ${t('dialogs:ui.dark')}`, `--${token}`, darkColor, value => onDarkToken(token, value), 'dark')} />
                {inherited ? <span className="text-center text-2xs text-faint">{t('dialogs:articleDark.inherited')}</span> : <button type="button" className="text-center text-2xs text-muted underline hover:text-primary focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed" disabled={disabled} aria-label={t('dialogs:articleDark.reset', { name: label })} onClick={() => onDarkToken(token, null)}>{t('dialogs:articleDark.inherit')}</button>}
                {status === 'ready' && !values.length ? <span className="text-center text-2xs text-faint">{t('dialogs:articleDark.unused')}</span> : null}
              </>}
            </div>
          </div>
        </div>;
      })}</div>
    </CollapsiblePanel>
    <CollapsiblePanel id="article-theme-nodes" title={t('dialogs:ui.typographyNodes')} icon={<PanelIcon kind="nodes" />} count={ARTICLE_NODE_OPTIONS.length} open={nodesOpen} onToggle={() => setNodesOpen(value => !value)} className="shrink-0"><div className="grid gap-4"><label className="grid gap-2 text-xs text-muted">{t('dialogs:ui.chooseLevel')}<select className="field" value={nodeKey} disabled={disabled} onChange={event => onNodeKey(event.target.value as ThemeNodeKey)}>{ARTICLE_NODE_OPTIONS.map(option => <option key={option.id} value={option.id}>{t('dialogs:nodes.' + option.id)}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="grid min-w-0 gap-2 text-xs text-muted">{t('dialogs:ui.fontSize')}<input className="field min-w-0 w-full" value={node.fontSize ?? ''} placeholder={t('dialogs:ui.themeDefault')} disabled={disabled} onChange={event => onNodeValue('fontSize', event.target.value)} /></label><label className="grid min-w-0 gap-2 text-xs text-muted">{t('dialogs:ui.lineHeight')}<input className="field min-w-0 w-full" value={node.lineHeight ?? ''} placeholder={t('dialogs:ui.themeDefault')} disabled={disabled} onChange={event => onNodeValue('lineHeight', event.target.value)} /></label></div><div {...inspection?.rowProps(`node:${nodeKey}`)} className={`flex items-center justify-between gap-3 ${INSPECTION_ROW_CLASSES}`}><p className="text-xs text-muted">{t('dialogs:ui.nodeTextColor')}</p><ButtonBar label={t('dialogs:ui.typographyNodeActions')}><button className="button button-quiet size-8 min-h-0 p-0" type="button" aria-label={t('dialogs:ui.resetThisNode')} title={t('dialogs:ui.resetThisNode')} data-tooltip={t('dialogs:ui.resetThisNode')} disabled={disabled || !theme.nodes?.[nodeKey]} onClick={onResetNode}><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /></svg></button><ColorSwatchButton color={resolvedNodeColor} className="size-8 rounded-full border border-line-strong focus-visible:outline-2 focus-visible:outline-accent" type="button" aria-label={t('dialogs:ui.changeNodeTextColor')} aria-haspopup="dialog" disabled={disabled} onClick={() => onColor('节点文字色', nodeKey, resolvedNodeColor, value => onNodeValue('color', value))} /></ButtonBar></div></div></CollapsiblePanel>
  </div>;
}
