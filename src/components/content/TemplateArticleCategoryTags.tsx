'use client';

import { useUITranslation } from '../global/UILocaleProvider';

export function TemplateArticleCategoryTags({ categories }: { categories: readonly string[] }) {
  const { t } = useUITranslation('content');
  const values = categories.map(category => category.trim()).filter(Boolean);
  return <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-left font-sans font-normal">
    <span className="text-xs text-faint">{t('content:articleCategories')}</span>
    {values.length ? values.map((category, index) => <span key={`${category}:${index}`} className="max-w-full break-words rounded-md border border-line bg-panel px-1.5 py-0.5 text-xs text-secondary">{category}</span>) : <span className="rounded-md border border-line px-1.5 py-0.5 text-xs text-faint">{t('content:ui.notSet')}</span>}
  </span>;
}
