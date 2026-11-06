'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { BrandMark } from '../global/BrandMark';
import { ContentIcon } from '../global/ContentIcon';
import { useUILocale, useUITranslation } from '../global/UILocaleProvider';
import { useToast } from '../global/Toast';
import type { GuideProfileId, GuideResources } from '../../lib/entryGuide';

export function GuideHandoff({ name, profile, resources, headingRef, onEnter, leaving, error }: {
  name: string; profile: GuideProfileId; resources: GuideResources | null; headingRef: RefObject<HTMLHeadingElement | null>; onEnter: () => void; leaving: boolean; error?: string;
}) {
  const { locale } = useUILocale();
  const { t } = useUITranslation('onboarding');
  const notify = useToast();
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [copying, setCopying] = useState(false);
  const prompt = resources ? t('agentPrompt', { ...resources, name: JSON.stringify(name), profile: t(`profiles.${profile}.title`), delivery: t(`profiles.${profile}.delivery`), autoSave: t(resources.autoSave ? 'enabled' : 'disabled'), autoSnapshot: t(resources.autoSnapshot ? 'enabled' : 'disabled') }) : t('promptUnavailable');
  const copy = async () => {
    if (pending.current || leaving) return;
    pending.current = true; setCopying(true);
    try {
      await navigator.clipboard.writeText(prompt);
      if (alive.current) notify({ key: 'guide-prompt-copy', label: t('promptCopied'), tone: 'success' });
    } catch {
      if (alive.current) notify({ key: 'guide-prompt-copy', label: t('promptCopyFailed'), tone: 'error' });
    } finally { pending.current = false; if (alive.current) setCopying(false); }
  };
  return <div data-guide-handoff className="guide-welcome flex min-h-0 flex-col">
    <p className="guide-greeting shrink-0">{t('handoffReady')}</p>
    <div className="guide-wordmark shrink-0"><span><BrandMark /></span><h1 ref={headingRef} tabIndex={-1} data-locale={locale} className="text-3xl data-[locale=en-US]:text-xl md:text-5xl md:data-[locale=en-US]:text-3xl">{locale === 'en-US' ? t('common:app.title').replace(' ', '\n') : t('common:app.title')}</h1></div>
    <div className="mx-auto flex min-h-0 w-full max-w-108 flex-col gap-6">
      <textarea aria-label={t('promptLabel')} readOnly value={prompt} rows={5} className="field min-h-24 w-full resize-none rounded-2xl p-4 text-sm" />
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      <div className="flex shrink-0 items-center justify-between gap-4">
        {/* Geometry rationale: reserve room for the expanding entry label next to the copy action. */}
        <button type="button" className="guide-action max-w-[calc(100%-12rem)] px-3" disabled={copying || leaving} aria-busy={copying} onClick={() => void copy()}><ContentIcon name="copy" />{t('copyPrompt')}</button>
        <button type="button" className="guide-next guide-next-round" aria-label={t('entering')} disabled={leaving} onClick={onEnter}><span className="guide-nav-label" aria-hidden="true"><span>{t('entering')}</span></span><span className="guide-nav-icon"><ContentIcon name="expand" /></span></button>
      </div>
    </div>
  </div>;
}
