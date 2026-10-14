'use client';

import { useEffect, useState } from 'react';
import { APP_VERSION, APP_VERSION_COMPACT } from '../../lib/appVersion';
import type { EditorColorMode } from '../../lib/editorWorkspace';
import type { ViewKey } from '../../hooks/useEditorController';
import { IconPopover } from './IconPopover';
import { useUILocale, useUITranslation } from './UILocaleProvider';
import { UI_LOCALES } from '../../lib/i18n/preferences';

type IconName = 'brand' | 'collapse' | 'articles' | 'assets' | 'themes' | 'templates' | 'settings' | 'sun' | 'moon' | 'system' | 'language' | 'chevron';

function Icon({ name }: { name: IconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  // Preserve icon.svg's viewBox and lettering geometry; UI colors come from the editor theme.
  if (name === 'brand') return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M10 0h16a6 6 0 0 1 6 6v16a10 10 0 0 1-10 10H6a6 6 0 0 1-6-6V10A10 10 0 0 1 10 0Z" className="fill-accent group-hover:fill-accent-strong group-focus-visible:fill-accent-strong" /><text x="16" y="22.5" className="fill-current" fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" fontSize="18" fontWeight="800" letterSpacing="-1.5" textAnchor="middle">R/</text></svg>;
  if (name === 'collapse') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 10l-2 2 2 2" /></svg>;
  if (name === 'articles') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M12 6.2C9.5 4.7 6.5 4.5 3 5v13c3.5-.5 6.5-.3 9 1.2 2.5-1.5 5.5-1.7 9-1.2V5c-3.5-.5-6.5-.3-9 1.2ZM12 6.2v13" /></svg>;
  if (name === 'assets') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m4 18 5-5 3 3 3-4 5 6" /></svg>;
  if (name === 'themes') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="4" y="4" width="10" height="16" rx="2" /><path d="m14 7 3-1.5a2 2 0 0 1 2.7.8l1 1.8a2 2 0 0 1-.8 2.7L14 14M8 9h2M8 13h2M8 17h2" /></svg>;
  if (name === 'templates') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
  if (name === 'settings') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M4 7h16M4 17h16M8 4v6M16 14v6" /><circle cx="8" cy="7" r="2" /><circle cx="16" cy="17" r="2" /></svg>;
  if (name === 'sun') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2.5 12h2m15 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
  if (name === 'moon') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M19.5 15.7A8.4 8.4 0 0 1 8.3 4.5 8.6 8.6 0 1 0 19.5 15.7Z" /></svg>;
  if (name === 'system') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="3.5" y="4" width="17" height="12" rx="2" /><path d="M9 20h6m-3-4v4" /></svg>;
  if (name === 'language') return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="m7 10 5 5 5-5" /></svg>;
}

const NAV_ITEMS: Array<{ id: ViewKey; icon: IconName }> = [
  { id: 'articles', icon: 'articles' },
  { id: 'themes', icon: 'themes' },
  { id: 'template', icon: 'templates' },
  { id: 'assets', icon: 'assets' },
  { id: 'settings', icon: 'settings' },
];

type Props = {
  view: ViewKey;
  mediaOperation: 'import' | 'rename' | null;
  collapsed: boolean;
  colorMode: EditorColorMode;
  onNavigate: (view: ViewKey) => void;
  onToggleCollapsed: () => void;
  onSetColorMode: (mode: EditorColorMode) => void;
  onOpenChangelog: () => void;
};

const COLOR_MODES: Array<{ id: EditorColorMode; icon: IconName }> = [
  { id: 'light', icon: 'sun' },
  { id: 'dark', icon: 'moon' },
  { id: 'system', icon: 'system' },
];

const preferenceOption = 'flex min-h-9 items-center gap-2 rounded-md px-2 text-left text-xs text-popup-text hover:bg-hover hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-checked:bg-accent-soft aria-checked:text-accent-text';

export function MainSidebar({ view, mediaOperation, collapsed, colorMode, onNavigate, onToggleCollapsed, onSetColorMode, onOpenChangelog }: Props) {
  const { locale, setLocale, preferenceSaved } = useUILocale();
  const { t } = useUITranslation();
  const [openPreference, setOpenPreference] = useState<'mode' | 'language' | null>(null);
  const selectedMode = COLOR_MODES.find((mode) => mode.id === colorMode) ?? COLOR_MODES[0];
  useEffect(() => { setOpenPreference(null); }, [collapsed]);
  const closePreference = () => setOpenPreference(null);
  const togglePreference = (id: 'mode' | 'language') => setOpenPreference(current => current === id ? null : id);
  const languageName = t('language.' + locale);
  const languageTooltip = preferenceSaved === false ? t('language.preferenceUnsaved') : t('language.current', { language: languageName });

  return (
    <aside className="sidebar" data-collapsed={collapsed} aria-label={t('shell:navigation.label')}>
      <div className="sidebar-brand">
        <div className="flex min-w-0 items-center gap-2.5">
          {collapsed ? <button className="brand-mark group rounded-lg border-0 p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" type="button" onClick={onToggleCollapsed} aria-label={t('shell:sidebar.expand')} data-tooltip={t('shell:sidebar.expand')}><Icon name="brand" /></button> : <span className="brand-mark"><Icon name="brand" /></span>}
          <div className="brand-copy"><p className="eyebrow whitespace-nowrap text-3xs font-normal">{t('shell:brand.name')}</p><strong>{t('shell:brand.workspace')}</strong></div>
        </div>
      </div>
      {collapsed ? null : <button className="sidebar-collapse md:right-2.5 md:w-8 md:opacity-50 hover:opacity-100" type="button" onClick={onToggleCollapsed} aria-label={t('shell:sidebar.collapse')} data-tooltip={t('shell:sidebar.collapse')}><Icon name="collapse" /></button>}

      <nav className="sidebar-nav" aria-label={t('shell:navigation.workspace')}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className="nav-item group relative flex min-h-11 min-w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-transparent px-2 text-center text-muted transition-colors hover:bg-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[current=page]:border-accent-line aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text disabled:cursor-not-allowed disabled:opacity-50 md:min-w-0 md:flex-row md:px-1 lg:justify-start lg:gap-2.5 lg:px-3 lg:text-left"
            type="button"
            data-active={view === item.id}
            aria-current={view === item.id ? 'page' : undefined}
            aria-label={t('shell:navigation.' + item.id)}
            data-tooltip={t('shell:navigation.' + item.id)}
            onClick={() => onNavigate(item.id)}
            disabled={mediaOperation !== null}
          >
            <span className="absolute bottom-3 left-0 top-3 w-0.5 rounded-full bg-accent-text opacity-0 group-aria-[current=page]:opacity-100" aria-hidden="true" /><span className="nav-icon text-faint transition-colors group-hover:text-primary group-aria-[current=page]:text-accent-text"><Icon name={item.icon} /></span>
            <span className="nav-copy">{t('shell:navigation.' + item.id)}</span>
          </button>
        ))}
      </nav>

      <footer className="sidebar-footer">
        <div className="mode-picker">
          <IconPopover label={t('displayMode.current', { mode: t('displayMode.' + selectedMode.id) })} icon={<Icon name={selectedMode.icon} />} open={openPreference === 'mode'} triggerVariant="preference" triggerChildren={<><span className="mode-copy">{t('displayMode.' + selectedMode.id)}</span><Icon name="chevron" /></>} onToggle={() => togglePreference('mode')} onClose={closePreference}>
            {COLOR_MODES.map(mode => <button key={mode.id} type="button" role="menuitemradio" aria-checked={colorMode === mode.id} className={preferenceOption} onClick={() => { onSetColorMode(mode.id); closePreference(); }}><span className="grid size-4 shrink-0 place-items-center [&_svg]:size-4"><Icon name={mode.icon} /></span><span>{t('displayMode.' + mode.id)}</span></button>)}
          </IconPopover>
        </div>
        <button className="version-button" type="button" aria-label={t('shell:updates.aria', { title: t('common:app.title'), version: APP_VERSION })} onClick={onOpenChangelog} data-tooltip={t('shell:updates.open')}>
          <span className="version-copy">{t('common:app.title')} v{APP_VERSION}</span><span className="version-compact" aria-hidden="true">v{APP_VERSION_COMPACT}</span>
        </button>
        <div className="mode-picker">
          <IconPopover label={t('language.title')} tooltip={languageTooltip} icon={<Icon name="language" />} open={openPreference === 'language'} triggerVariant="preference" triggerChildren={<><span className="mode-copy">{languageName}</span><Icon name="chevron" /></>} onToggle={() => togglePreference('language')} onClose={closePreference}>
            {UI_LOCALES.map(option => <button key={option} type="button" role="menuitemradio" aria-checked={locale === option} lang={option} className={preferenceOption} onClick={() => { closePreference(); void setLocale(option); }}><span className="grid size-4 shrink-0 place-items-center" aria-hidden="true">{locale === option ? '✓' : ''}</span><span>{t('language.' + option)}</span></button>)}
          </IconPopover>
        </div>
        <span className="sr-only" role="status">{preferenceSaved === false ? t('language.preferenceUnsaved') : ''}</span>
      </footer>
    </aside>
  );
}
