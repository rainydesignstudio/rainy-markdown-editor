'use client';

import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatProductMessage, type ProductMessageInfo } from '../../lib/i18n/productMessages';
import { additionalFeedback, formatBriefFeedback } from '../../lib/i18n/feedback';
import { useAnimatedSize } from '../../hooks/useAnimatedMaxHeight';
import { createToastCountdown, type ToastCountdown } from '../../lib/toastCountdown';
import { ContentIcon } from './ContentIcon';
import { IconButton } from './IconButton';
import { useUILocale, useUITranslation } from './UILocaleProvider';

export type ToastLifetime = { mode: 'auto'; durationMs: number; countdown?: ToastCountdown } | { mode: 'manual' } | { mode: 'locked' };
export type ToastAction = { id: string; label: ProductMessageInfo; presentation: 'icon' | 'text' | 'icon-text'; icon?: ComponentProps<typeof ContentIcon>['name']; disabled?: boolean; run: () => void | Promise<void> };
export type ToastNotice = { key: string; label: string; tone: ToastTone; summary?: ProductMessageInfo; details?: unknown; lifetime?: ToastLifetime; actions?: ToastAction[] };
export type ToastContainerOptions = { maxVisible?: number; enterFrom?: 'top' | 'bottom' | 'left' | 'right'; motionDurationMs?: number };
export type ToastItem = ToastNotice & { id: number; countdown?: ToastCountdown; ownsCountdown?: boolean; exiting?: boolean };
const ToastContext = createContext<((notice: ToastNotice | { key: string; dismiss: true }, event?: string) => void) | null>(null);
const ToastReadyContext = createContext(true);
const ToastReadinessContext = createContext<((ready: boolean) => void) | null>(null);
const modalSelector = '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]';
export type ToastTone = 'success' | 'warning' | 'error' | 'info';
const motionCurve = 'cubic-bezier(.2,0,0,1)';
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function createToastItem(notice: ToastNotice, id: number): ToastItem {
  const lifetime = notice.lifetime ?? (notice.tone === 'success' ? { mode: 'auto' as const, durationMs: 3000 } : { mode: 'manual' as const });
  return { ...notice, lifetime, id, ...(lifetime.mode === 'auto' ? { countdown: lifetime.countdown ?? createToastCountdown(lifetime.durationMs), ownsCountdown: !lifetime.countdown } : {}) };
}

export const ToastSurface = forwardRef<HTMLElement, HTMLAttributes<HTMLElement> & { tone: ToastTone; animated?: boolean }>(function ToastSurface({ tone, className = '', animated = false, children, ...props }, ref) {
  return <section {...props} ref={ref} data-tone={tone} data-animated={animated} className={`toast-surface ${className}`}>{children}</section>;
});

export function ToastIcon({ tone }: { tone: ToastTone }) {
  const path = tone === 'success' ? 'm5 12 4 4L19 6'
    : tone === 'warning' ? 'm12 3 10 18H2L12 3Zm0 6v5m0 3v1'
      : tone === 'info' ? 'M12 11v6m0-10v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
        : 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 6 6 6m0-6-6 6';
  return <svg data-tone={tone} className="size-5 shrink-0 text-success data-[tone=warning]:text-warning-strong data-[tone=error]:text-danger data-[tone=info]:text-accent-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

export function ToastProvider({ children, initiallyReady = true, maxVisible = 3, enterFrom = 'top', motionDurationMs = 240 }: { children: ReactNode; initiallyReady?: boolean } & ToastContainerOptions) {
  if (!Number.isInteger(maxVisible) || maxVisible < 1) throw new RangeError('Toast maxVisible must be a positive integer');
  if (!Number.isFinite(motionDurationMs) || motionDurationMs < 0) throw new RangeError('Invalid Toast motion duration');
  const [queue, setQueue] = useState<{ visible: ToastItem[]; pending: ToastItem[] }>({ visible: [], pending: [] });
  const options = useRef({ maxVisible, enterFrom }); options.current = { maxVisible, enterFrom };
  const capture = useRef<(() => void) | null>(null), currentItems = useRef<ToastItem[]>([]), previousItems = useRef<ToastItem[]>([]);
  currentItems.current = [...queue.visible, ...queue.pending];
  const sequence = useRef(0);
  const available = useRef(initiallyReady), [ready, setReady] = useState(initiallyReady);
  const updateReady = useCallback((value: boolean) => { available.current = value; setReady(value); }, []);
  // Retain only the current event per producer so remounting a page cannot replay it.
  const events = useRef(new Map<string, string>());
  const notify = useCallback((notice: ToastNotice | { key: string; dismiss: true }, event?: string) => {
    if (event !== undefined) {
      if (events.current.get(notice.key) === event) return;
      events.current.set(notice.key, event);
    }
    if (!('dismiss' in notice) && !available.current) return;
    capture.current?.();
    const item = 'dismiss' in notice ? null : createToastItem(notice, ++sequence.current);
    setQueue(previous => {
      if (!item) return { visible: previous.visible.map(value => value.key === notice.key ? { ...value, exiting: true } : value), pending: previous.pending.filter(value => value.key !== notice.key) };
      if (previous.visible.some(value => value.key === notice.key)) return { ...previous, visible: previous.visible.map(value => value.key === notice.key ? item : value) };
      if (previous.pending.some(value => value.key === notice.key)) return { ...previous, pending: previous.pending.map(value => value.key === notice.key ? item : value) };
      if (previous.visible.length >= options.current.maxVisible) return { ...previous, pending: [...previous.pending, item] };
      return { ...previous, visible: options.current.enterFrom === 'bottom' ? [...previous.visible, item] : [item, ...previous.visible] };
    });
  }, []);
  const dismiss = useCallback((id: number) => setQueue(previous => ({ ...previous, visible: previous.visible.map(item => item.id === id && item.lifetime?.mode !== 'locked' ? { ...item, exiting: true } : item) })), []);
  const remove = useCallback((id: number) => {
    capture.current?.();
    setQueue(previous => {
      if (!previous.visible.some(item => item.id === id)) return previous;
      const visible = previous.visible.filter(item => item.id !== id), pending = [...previous.pending];
      while (visible.length < options.current.maxVisible && pending.length) {
        const next = pending.shift()!;
        if (options.current.enterFrom === 'bottom') visible.push(next); else visible.unshift(next);
      }
      return { visible, pending };
    });
  }, []);
  useEffect(() => {
    const clocks = new Set(currentItems.current.map(item => item.countdown));
    for (const item of previousItems.current) if (item.ownsCountdown && item.countdown && !clocks.has(item.countdown)) item.countdown.dispose();
    previousItems.current = currentItems.current;
  }, [queue]);
  useEffect(() => () => { for (const item of currentItems.current) if (item.ownsCountdown) item.countdown?.dispose(); }, []);
  return <ToastContext.Provider value={notify}><ToastReadinessContext.Provider value={updateReady}><ToastReadyContext.Provider value={ready}>{children}<ToastViewport items={queue.visible} dismiss={dismiss} remove={remove} capture={capture} enterFrom={enterFrom} motionDurationMs={motionDurationMs} /></ToastReadyContext.Provider></ToastReadinessContext.Provider></ToastContext.Provider>;
}

export const useToastReady = () => useContext(ToastReadyContext);

export function ToastReadiness({ ready }: { ready: boolean }) {
  const update = useContext(ToastReadinessContext);
  useLayoutEffect(() => { update?.(ready); }, [ready, update]);
  return null;
}

export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error('useToast must be used inside ToastProvider');
  return notify;
}

function ToastViewport({ items, dismiss, remove, capture, enterFrom, motionDurationMs }: { items: ToastItem[]; dismiss: (id: number) => void; remove: (id: number) => void; capture: { current: (() => void) | null }; enterFrom: NonNullable<ToastContainerOptions['enterFrom']>; motionDurationMs: number }) {
  const ready = useToastReady();
  const node = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<Element | null>(null);
  const [native, setNative] = useState(true);
  const present = ready && items.length > 0;
  useLayoutEffect(() => {
    const locate = () => setTarget(Array.from(document.querySelectorAll(modalSelector)).at(-1) ?? document.body);
    locate();
    if (!present) return;
    const observer = new MutationObserver(records => {
      // Source editing and toast content changes do not require a document-wide modal lookup.
      if (records.some(record => record.type === 'attributes'
        ? record.attributeName === 'aria-modal'
        : [...record.addedNodes, ...record.removedNodes].some(element => element instanceof Element && (element.matches(modalSelector) || element.querySelector(modalSelector))))) locate();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'hidden'] });
    return () => observer.disconnect();
  }, [present]);
  useLayoutEffect(() => {
    const element = node.current;
    if (!element?.isConnected) return;
    if (typeof element.showPopover !== 'function') { setNative(false); return; }
    if (present && !element.matches(':popover-open')) element.showPopover();
    else if (!present && element.matches(':popover-open')) element.hidePopover();
  }, [native, present, target]);
  if (!target) return null;
  // Geometry rationale: fixed top-12 plus a 6-unit bottom gap keeps the viewport independent of toolbar layout.
  return createPortal(<div ref={node} data-toast-viewport popover={native ? 'manual' : undefined} hidden={!present} aria-live="polite" aria-atomic={false}
    className="pointer-events-none fixed inset-x-4 top-12 bottom-auto z-80 mx-auto grid max-h-[calc(100dvh-4.5rem)] w-auto max-w-2xl justify-items-center gap-2 overflow-x-clip overflow-y-auto border-0 bg-transparent p-0 text-primary scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
    <ToastStack items={items} dismiss={dismiss} remove={remove} capture={capture} enterFrom={enterFrom} motionDurationMs={motionDurationMs} />
  </div>, target);
}

export function ToastStack({ items, dismiss, remove, capture, enterFrom = 'top', motionDurationMs = 240 }: { items: ToastItem[]; dismiss: (id: number) => void; remove: (id: number) => void; capture?: { current: (() => void) | null } } & Pick<ToastContainerOptions, 'enterFrom' | 'motionDurationMs'>) {
  const slots = useRef(new Map<string, HTMLDivElement>()), positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    if (!capture) return;
    capture.current = () => { positions.current = new Map([...slots.current].map(([key, node]) => [key, node.getBoundingClientRect().top])); };
    return () => { capture.current = null; };
  }, [capture]);
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    for (const [key, element] of slots.current) {
      element.getAnimations?.().forEach(animation => animation.cancel());
      const top = element.getBoundingClientRect().top, previous = positions.current.get(key); next.set(key, top);
      if (previous !== undefined && previous !== top && !reducedMotion() && element.animate) element.animate([{ translate: `0px ${previous - top}px` }, { translate: '0px 0px' }], { duration: motionDurationMs, easing: motionCurve });
    }
    positions.current = next;
  }, [items, motionDurationMs]);
  return <div className="toast-stack" data-stack={enterFrom === 'bottom' ? 'bottom' : 'top'}>{items.map(item => <div key={item.key} className="toast-slot" ref={node => { if (node) slots.current.set(item.key, node); else slots.current.delete(item.key); }}><ToastCard item={item} dismiss={dismiss} remove={remove} enterFrom={enterFrom} motionDurationMs={motionDurationMs} /></div>)}</div>;
}

export function ToastCard({ item, dismiss, remove = dismiss, enterFrom = 'top', motionDurationMs = 240, revealDetails }: { item: ToastItem; dismiss: (id: number) => void; remove?: (id: number) => void; revealDetails?: number } & Pick<ToastContainerOptions, 'enterFrom' | 'motionDurationMs'>) {
  const ready = useToastReady();
  const { t } = useUITranslation('common'), { locale } = useUILocale();
  const [open, setOpen] = useState(false), [focused, setFocused] = useState(false), [hovered, setHovered] = useState(false), [entered, setEntered] = useState(false), [visible, setVisible] = useState(false), [busy, setBusy] = useState<string | null>(null), [actionError, setActionError] = useState<unknown>(null), detailsId = useId();
  const heading = item.summary ? formatBriefFeedback(item.summary, t, locale) : formatProductMessage(item, t);
  const label = actionError ? t('feedback.actionFailed') : heading;
  const details = [additionalFeedback(item.details, heading, t), additionalFeedback(actionError, heading, t)].filter(Boolean).join('\n');
  const expanded = Boolean(details && open);
  const { surfaceRef: card, bodyRef, size } = useAnimatedSize(JSON.stringify([label, details, expanded]));
  const returnFocus = useRef<HTMLElement | null>(null), ring = useRef<SVGCircleElement>(null), pauseOwner = useRef(Symbol('toast-reading')), enteredRef = useRef(false), origin = useRef(enterFrom), pendingAction = useRef(false);
  const locked = item.lifetime?.mode === 'locked', countdown = item.countdown;
  useEffect(() => { if (revealDetails) setOpen(true); }, [revealDetails]);
  useEffect(() => { setActionError(null); }, [item.id]);
  useLayoutEffect(() => {
    const surface = card.current;
    if (!ready || !surface || (!item.exiting && enteredRef.current)) return;
    const finish = () => { if (item.exiting) remove(item.id); else { enteredRef.current = true; setVisible(true); setEntered(true); } };
    if (reducedMotion() || motionDurationMs === 0 || !window.getComputedStyle(surface).transitionProperty.includes('opacity')) { finish(); return; }
    let timer: number | undefined;
    if (item.exiting) { timer = window.setTimeout(finish, motionDurationMs); return () => window.clearTimeout(timer); }
    surface.getBoundingClientRect();
    const frame = window.requestAnimationFrame(() => { setVisible(true); timer = window.setTimeout(finish, motionDurationMs); });
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [item.id, item.exiting, motionDurationMs, remove, card, ready]);
  useEffect(() => {
    if (!countdown) return;
    let animation: Animation | undefined;
    const draw = () => {
      animation?.cancel();
      const value = countdown.snapshot(), circle = ring.current, from = 1 - value.remainingMs / value.durationMs;
      if (circle) circle.style.strokeDashoffset = String(from);
      if (value.running && !reducedMotion()) animation = circle?.animate?.([{ strokeDashoffset: from }, { strokeDashoffset: 1 }], { duration: value.remainingMs, easing: 'linear', fill: 'forwards' });
    };
    const unsubscribe = countdown.subscribe(draw), expired = countdown.onElapsed(() => dismiss(item.id)); draw();
    return () => {
      const circle = ring.current;
      if (circle) circle.style.strokeDashoffset = String(1 - countdown.snapshot().remainingMs / countdown.snapshot().durationMs);
      animation?.cancel(); unsubscribe(); expired();
    };
  }, [countdown, item.id, dismiss]);
  useLayoutEffect(() => { countdown?.hold(pauseOwner.current, !ready || expanded || focused || hovered || busy !== null); return () => countdown?.hold(pauseOwner.current, false); }, [countdown, expanded, focused, hovered, busy, ready]);
  useEffect(() => { if (entered) countdown?.start(); }, [countdown, entered]);
  useLayoutEffect(() => () => {
    if (card.current?.contains(document.activeElement) && returnFocus.current?.isConnected) returnFocus.current.focus();
  }, [card]);
  const runAction = async (action: ToastAction) => {
    if (pendingAction.current || action.disabled) return;
    pendingAction.current = true; countdown?.hold(pauseOwner.current, true); setBusy(action.id); setActionError(null);
    try { await action.run(); } catch (error) { setActionError(error); setOpen(true); }
    finally { pendingAction.current = false; setBusy(null); }
  };
  return <ToastSurface ref={card} tone={actionError ? 'error' : item.tone} role="status" aria-atomic="true" data-toast-id={item.id} data-phase={item.exiting ? 'exiting' : visible ? 'visible' : 'entering'} data-enter-from={origin.current} data-motion-ms={motionDurationMs} style={size} animated inert={item.exiting}
    onPointerEnter={event => { if (event.pointerType !== 'touch') setHovered(true); }} onPointerLeave={() => setHovered(false)}
    onFocusCapture={event => { setFocused(true); if (event.relatedTarget instanceof HTMLElement && !event.currentTarget.contains(event.relatedTarget)) returnFocus.current = event.relatedTarget; }}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <div ref={bodyRef} className="toast-body">
      <ToastIcon tone={actionError ? 'error' : item.tone} />
      <div className="toast-copy">
        <p className="toast-heading"><span className="toast-label">{label}</span></p>
        {details ? <div id={detailsId} data-open={expanded} aria-hidden={!expanded} inert={!expanded} className="toast-details">{details}</div> : null}
      </div>
      <div className="toast-actions">
        {details ? <IconButton variant="inline" tooltip={t(expanded ? 'feedback.hideDetails' : 'feedback.showDetails')} aria-expanded={expanded} aria-controls={detailsId} onClick={() => setOpen(value => !value)} icon={<ContentIcon name="info" />} /> : null}
        {item.actions?.map(action => {
          const caption = formatProductMessage(action.label, t), disabled = action.disabled || busy !== null;
          return action.presentation === 'icon' ? <IconButton key={action.id} variant="inline" disabled={disabled} aria-busy={busy === action.id} tooltip={caption} onClick={() => void runAction(action)} icon={<ContentIcon name={action.icon ?? 'reset'} />} /> : <button key={action.id} type="button" className="button button-quiet" disabled={disabled} aria-busy={busy === action.id} onClick={() => void runAction(action)}>{action.presentation === 'icon-text' && action.icon ? <ContentIcon name={action.icon} /> : null}{caption}</button>;
        })}
        <IconButton variant="inline" className="relative" disabled={locked || busy !== null} tooltip={t(locked ? 'feedback.locked' : 'feedback.dismiss')} onClick={() => dismiss(item.id)} icon={<>
          {countdown ? <svg className="toast-countdown" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="12" r="10" className="opacity-25" /><circle ref={ring} cx="12" cy="12" r="10" pathLength="1" strokeDasharray="1" strokeDashoffset="0" /></svg> : null}
          <ContentIcon name="close" />
        </>} />
      </div>
    </div>
  </ToastSurface>;
}
