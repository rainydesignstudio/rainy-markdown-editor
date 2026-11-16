'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { formatProductMessage } from '../../lib/i18n/productMessages';
import { preloadPreparedLibraries } from '../../lib/preparedLibrary';
import { getFontPreloadState, getServerFontPreloadState, preloadFonts, subscribeFontPreload, type FontPreloadState } from '../../lib/fontPreload';
import { GUIDE_OUTRO, guideOutroDuration, guideOutroState, guidePreparationPercent, type GuidePreparationProgress } from '../../lib/entryGuide';
import { useUILocale, useUITranslation } from '../global/UILocaleProvider';
import { TooltipButton } from '../global/TooltipButton';

type Props = {
  enabled?: boolean;
  preparing?: boolean;
  preparation?: Partial<GuidePreparationProgress> | null;
  preparationReady?: boolean;
  preparationIssue?: string;
  onRetryPreparation?: () => void;
  preparationId?: number;
};

export function GuideFontPreload({ enabled = false, preparing = false, preparation = null, preparationReady = false, preparationIssue, onRetryPreparation, preparationId = 0 }: Props) {
  const { locale } = useUILocale();
  const state = useSyncExternalStore(subscribeFontPreload, getFontPreloadState, getServerFontPreloadState);
  const run = `${state.source}:${String('runId' in state ? state.runId ?? 0 : 0)}`;
  const pending = state.phase !== 'idle' && state.phase !== 'complete';
  const [visibleFontRun, setVisibleFontRun] = useState<string | null>(null);

  useEffect(() => {
    if (enabled) { void preloadFonts(); void preloadPreparedLibraries({ locale, preset: 'empty' }).catch(() => {}); }
  }, [enabled, locale]);
  useLayoutEffect(() => {
    if (preparation !== null || !enabled) { setVisibleFontRun(null); return; }
    if (enabled && pending) setVisibleFontRun(run);
  }, [enabled, pending, run, preparation !== null]);

  if (preparation !== null) return <GuideProgressBar key={`preparation:${preparationId}`} state={state} preparing={preparing} preparation={preparation} preparationReady={preparationReady} preparationIssue={preparationIssue} onRetryPreparation={onRetryPreparation} />;
  if (!enabled || visibleFontRun !== run) return null;
  return <GuideProgressBar key={`font:${run}`} state={state} preparing={false} preparation={null} preparationReady={false} />;
}

function GuideProgressBar({ state, preparing = false, preparation = null, preparationReady = false, preparationIssue, onRetryPreparation }: Omit<Props, 'enabled' | 'preparationId'> & { state: FontPreloadState }) {
  const { t } = useUITranslation('onboarding');
  const composite = preparation !== null;
  const complete = composite ? preparationReady && !preparationIssue : state.phase === 'complete';
  const [settled, setSettled] = useState(composite);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [exit, setExit] = useState({ closing: false, fading: false, removed: false });
  const [reduced, setReduced] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync(); media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);
  useEffect(() => {
    if (composite) return;
    const timer = window.setTimeout(() => setSettled(true), reduced ? 0 : 800);
    return () => window.clearTimeout(timer);
  }, [composite, reduced]);

  useLayoutEffect(() => {
    if (!composite || !preparing || position || !container.current) return;
    const target = document.querySelector<HTMLElement>('[data-guide-preload-target]');
    if (!target) return;
    const rect = target.getBoundingClientRect(), panel = target.closest<HTMLElement>('[data-guide-panel]');
    const enteringY = panel ? Number.parseFloat((getComputedStyle(panel).translate || '').split(' ')[1]) || 0 : 0;
    // Pin the preparation bar once; later panels cannot move its closing centre.
    setPosition({ left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 - enteringY - container.current.getBoundingClientRect().height / 2 });
  }, [composite, preparing, position]);
  useLayoutEffect(() => {
    if (!complete) { setFinishedAt(null); setExit({ closing: false, fading: false, removed: false }); return; }
    setFinishedAt(previous => previous ?? (composite ? Date.now() : state.completedAt ?? Date.now()));
  }, [complete, composite, state.completedAt]);
  useEffect(() => {
    if (finishedAt === null) return;
    const hold = composite ? 0 : GUIDE_OUTRO.hold;
    const clock = { startedAt: finishedAt - GUIDE_OUTRO.hold + hold, reduced };
    const sync = () => {
      const next = guideOutroState(clock, Date.now());
      if (next.closing && container.current) {
        if (composite && !position) { setExit({ ...next, removed: true }); return; }
        if (!position) {
          const rect = container.current.getBoundingClientRect();
          setPosition({ left: rect.left + rect.width / 2, top: rect.top });
        }
        if (container.current.contains(document.activeElement)) {
          document.querySelector<HTMLElement>('[data-guide-panel] h1')?.focus({ preventScroll: true });
          if (container.current.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur();
        }
      }
      setExit(next);
    };
    sync();
    const timers = [hold, hold + (reduced ? 0 : GUIDE_OUTRO.collapse), hold + guideOutroDuration(reduced) - GUIDE_OUTRO.hold]
      .map(delay => window.setTimeout(sync, Math.max(0, finishedAt + delay - Date.now())));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [finishedAt, composite, reduced, position]);

  if (exit.removed) return null;
  const hidden = exit.closing || composite && !position;
  const showPreparation = composite;
  const percent = complete ? 100 : showPreparation ? guidePreparationPercent(state, preparation!, preparationReady) : state.percent;
  const retry = !complete && (composite && Boolean(preparationIssue) || state.phase === 'failed' || state.phase === 'cancelled');
  const label = complete ? composite ? `${t('preparationProgress.local')} 100%` : t('fontPreload.complete') : t(showPreparation ? retry ? 'preparationProgress.failed' : 'preparationProgress.loading' : state.phase === 'idle' ? 'fontPreload.preparing' : retry ? `fontPreload.${state.phase}` : 'fontPreload.loading', { percent: percent === null ? '…' : `${percent}%` });
  const preloadAtStart = preparation && 'preloadAtStart' in preparation ? preparation.preloadAtStart : undefined;
  const overlapping = typeof preloadAtStart === 'number' && preloadAtStart >= 0 && preloadAtStart < 1;
  const localPercent = preparationReady ? 100 : preparation?.localReady ? 99 : preparation?.totalBytes && Number.isFinite(preparation.completedBytes)
    ? Math.max(0, Math.min(99, Math.floor((preparation.completedBytes ?? 0) / preparation.totalBytes * 100))) : null;
  const displayPercent = (value: number | null) => value === null ? '…' : `${value}%`;
  const fontProgress = `${t('preparationProgress.fonts')} ${displayPercent(state.phase === 'complete' ? 100 : state.percent)}`;
  const localProgress = `${t('preparationProgress.local')} ${displayPercent(localPercent)}`;
  const progressText = complete ? composite ? localProgress : label : composite ? `${overlapping ? `${fontProgress} · ` : ''}${localProgress}` : fontProgress;
  const issue = preparationIssue || (state.issue ? formatProductMessage(state.issue, t) : null);
  // Geometry rationale: keep the popup within the existing 1.5rem viewport gutters.
  const detail = <span className="grid max-w-[calc(100vw-3rem)] gap-1"><span>{progressText}</span>{retry ? <>
    {issue ? <span>{issue}</span> : null}
    <span>{t(composite ? 'preparationProgress.retry' : 'fontPreload.retry')}</span>
  </> : null}</span>;
  return <div ref={container} data-guide-font-preload data-bouncing={!settled && !exit.closing} data-positioned={position !== null} data-located={!composite || position !== null} data-hiding={exit.closing} data-fading={exit.fading} data-progress-mode={showPreparation ? 'preparation' : 'download'} inert={hidden} aria-hidden={hidden} style={{ left: position?.left, top: position?.top, '--guide-bar-collapse': `${reduced ? 0 : GUIDE_OUTRO.collapse}ms`, '--guide-bar-fade': `${reduced ? GUIDE_OUTRO.reducedFade : GUIDE_OUTRO.fade}ms` } as CSSProperties} className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2 data-[positioned=true]:bottom-auto data-[positioned=true]:translate-y-0 data-[located=false]:invisible scale-100 opacity-100 transition-[opacity,scale] duration-(--guide-bar-fade) data-[fading=true]:scale-0 data-[fading=true]:opacity-0 motion-safe:data-[bouncing=true]:animate-guide-preload-ball md:bottom-10 motion-reduce:transition-opacity motion-reduce:data-[fading=true]:scale-100">
    {/* Geometry rationale: retain the approved landing-ball expansion curve. */}
    <TooltipButton animated tooltip={hidden ? null : detail} aria-label={label} data-expanded={settled && (!exit.closing || reduced)} onClick={retry ? () => { if (composite) onRetryPreparation?.(); else void preloadFonts(true); } : undefined} className="block h-1.5 w-1.5 overflow-hidden rounded-full bg-accent opacity-60 transition-[width,opacity,background-color] duration-(--guide-bar-collapse) hover:opacity-100 focus-visible:opacity-100 ease-[cubic-bezier(.22,1,.36,1)] data-[expanded=true]:w-40 data-[expanded=true]:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:duration-150">
      <span role="progressbar" aria-label={t(showPreparation ? 'preparationProgress.name' : 'fontPreload.name')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={label} className="block h-full w-full">
        <span data-indeterminate={percent === null} className="relative block h-full overflow-hidden rounded-full bg-accent transition-[width] duration-160 ease-out data-[indeterminate=true]:animate-pulse motion-reduce:animate-none motion-reduce:transition-none" style={{ width: percent === null ? '100%' : `${percent}%` }}>
          {!retry && !complete && settled ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-to-r from-transparent via-on-accent/45 to-transparent motion-safe:animate-guide-sheen" /> : null}
        </span>
      </span>
    </TooltipButton>
  </div>;
}
