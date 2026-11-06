'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { BrandMark } from '../global/BrandMark';
import { useUITranslation } from '../global/UILocaleProvider';

export function GuideWelcome({ onDone }: { onDone: () => void }) {
  const { t } = useUITranslation('onboarding');
  const button = useRef<HTMLButtonElement>(null), mark = useRef<HTMLSpanElement>(null);
  const done = useRef(false), skipping = useRef(false), callback = useRef(onDone), skipTimer = useRef<number | null>(null);
  callback.current = onDone;
  const [leaving, setLeaving] = useState(false);
  const finish = useCallback(() => { if (!done.current) { done.current = true; callback.current(); } }, []);
  const skip = useCallback(() => {
    if (done.current || skipping.current) return;
    skipping.current = true; setLeaving(true);
    const seconds = Number.parseFloat(getComputedStyle(button.current!).transitionDuration) || 0;
    if (!seconds || window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else skipTimer.current = window.setTimeout(finish, seconds * 1000);
  }, [finish]);
  useLayoutEffect(() => {
    done.current = false;
    // CSS owns the silent introduction and its fallback completion deadline.
    const seconds = Number.parseFloat(getComputedStyle(mark.current!).animationDuration) || 0;
    const timer = window.setTimeout(finish, seconds * 1000);
    const visibility = () => { if (document.hidden) finish(); };
    const keydown = (event: KeyboardEvent) => {
      if (!event.altKey && !event.ctrlKey && !event.metaKey && ['Enter', ' ', 'Escape'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); skip(); }
    };
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('keydown', keydown);
    return () => { window.clearTimeout(timer); if (skipTimer.current !== null) window.clearTimeout(skipTimer.current); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('keydown', keydown); };
  }, [finish, skip]);

  return <button ref={button} data-guide-welcome data-leaving={leaving} type="button" aria-label={t('skipWelcome')} onClick={event => { event.stopPropagation(); skip(); }} onTransitionEnd={event => { if (leaving && event.target === event.currentTarget && event.propertyName === 'opacity') finish(); }} className="group/welcome absolute inset-0 z-40 flex items-center justify-center opacity-100 transition-opacity duration-200 data-[leaving=true]:opacity-0 focus-visible:outline-none motion-reduce:transition-none">
    <span ref={mark} data-guide-welcome-mark aria-hidden="true" onAnimationEnd={event => { if (event.target === event.currentTarget) finish(); }} className="block size-28 animate-guide-welcome rounded-xl text-on-accent group-focus-visible/welcome:outline-2 group-focus-visible/welcome:outline-offset-8 group-focus-visible/welcome:outline-accent md:size-36 motion-reduce:animate-guide-welcome-still"><BrandMark /></span>
  </button>;
}
