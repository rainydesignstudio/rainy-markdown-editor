'use client';

import { useUITranslation } from '../global/UILocaleProvider';
import { ModeSwitch } from '../global/ModeSwitch';
import { useLibraryCapability } from '../../hooks/useLibraryCapability';

export function PreviewModeSwitch({ dark, onToggle, disabled = false, reason }: { dark: boolean; onToggle: () => void; disabled?: boolean; reason?: string }) {
  const { t } = useUITranslation('editor');
  const capability = useLibraryCapability('previewMode');
  return <ModeSwitch checked={dark} onToggle={onToggle} label={t('editor:preview.darkMode')} disabled={disabled || !capability.enabled} reason={disabled ? reason : capability.reason}
    start={<svg className="size-4 text-muted" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2.5 12h2m15 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>}
    end={<svg className="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19.5 15.7A8.4 8.4 0 0 1 8.3 4.5 8.6 8.6 0 1 0 19.5 15.7Z" /></svg>} />;
}
