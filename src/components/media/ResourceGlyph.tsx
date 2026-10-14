'use client';
import { CategoryIcon } from '../content/SnippetCategoryDialog';
import { useUITranslation } from '../global/UILocaleProvider';
import { resourceType } from '../../lib/resources/types';

export function ResourceGlyph({ fileName, mimeType = '', compact = false }: { fileName: string; mimeType?: string; compact?: boolean }) {
  const { t } = useUITranslation('messages'), type = resourceType(fileName, mimeType);
  return <div className="grid h-full w-full place-content-center justify-items-center gap-2 bg-list text-secondary data-[compact=true]:gap-1" data-compact={compact} role="img" aria-label={t('resources.typeNames.' + type.id)}>
    <CategoryIcon name={type.icon} className={compact ? 'size-6 shrink-0' : 'size-10 shrink-0'} /><span className="font-mono text-xs" aria-hidden="true">{type.badge || 'FILE'}</span>{compact ? null : <span className="text-xs text-muted">{t('resources.downloadOnly')}</span>}
  </div>;
}
