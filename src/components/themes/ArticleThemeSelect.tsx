'use client';

import { SelectField } from '../global/SelectField';
import { useUITranslation } from '../global/UILocaleProvider';

import type { ThemeConfig } from '../../lib/types';
import { useLibraryCapability } from '../../hooks/useLibraryCapability';

export function ArticleThemeSelect({ themes, value, onChange }: {
  themes: readonly ThemeConfig[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useUITranslation('dialogs');
  const capability = useLibraryCapability('articleTheme');
  return <label className="flex min-w-0 items-center gap-2 text-xs text-muted" title={capability.reason} tabIndex={!capability.enabled ? 0 : undefined} aria-label={capability.reason}>
    <span className="shrink-0">{t('dialogs:ui.previewTheme')}</span>
    <SelectField label={t('dialogs:ui.previewTheme')} title={capability.reason} className="min-h-9 min-w-0 w-40 py-1.5 text-xs" value={value} disabled={!capability.enabled} onChange={nextValue => { if (capability.enabled) onChange(nextValue); }} options={[...(themes.map((theme) => ({ value: theme.id, label: theme.name })) ?? [])]} />
  </label>;
}
