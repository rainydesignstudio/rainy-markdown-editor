'use client';

import { useUITranslation } from '../global/UILocaleProvider';

export function ThemeUpdateTag() {
  const { t } = useUITranslation('common');
  return <span className="inline-flex shrink-0 items-center rounded-md border border-accent-line bg-accent-soft h-4 px-1 text-2xs font-medium text-accent-text">{t('updateAvailable')}</span>;
}
