'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatProductMessage } from '../../lib/i18n/productMessages';
import { IconButton } from './IconButton';
import { useUITranslation } from './UILocaleProvider';

type ToastNotice = { key: string; label: string; tone: 'success' | 'warning' | 'error' };
type ToastItem = ToastNotice & { id: number; expiresAt: number | null };
const ToastContext = createContext<((notice: ToastNotice) => void) | null>(null);
const modalSelector = '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const sequence = useRef(0);
  const timers = useRef(new Map<number, number>());
  const notify = useCallback((notice: ToastNotice) => {
    const item = { ...notice, id: ++sequence.current, expiresAt: notice.tone === 'success' ? Date.now() + 3000 : null };
    setItems(previous => [...previous.filter(existing => existing.key !== notice.key), item].slice(-2));
  }, []);
  const dismiss = useCallback((id: number) => setItems(previous => previous.filter(item => item.id !== id)), []);
  useEffect(() => {
    const current = new Set(items.map(item => item.id));
    for (const [id, timer] of timers.current) if (!current.has(id)) { window.clearTimeout(timer); timers.current.delete(id); }
    for (const item of items) if (item.expiresAt !== null && !timers.current.has(item.id)) {
      timers.current.set(item.id, window.setTimeout(() => dismiss(item.id), Math.max(0, item.expiresAt - Date.now())));
    }
  }, [dismiss, items]);
  useEffect(() => {
    const scheduled = timers.current;
    return () => { for (const timer of scheduled.values()) window.clearTimeout(timer); scheduled.clear(); };
  }, []);
  return <ToastContext.Provider value={notify}>{children}<ToastViewport items={items} dismiss={dismiss} /></ToastContext.Provider>;
}

export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error('useToast must be used inside ToastProvider');
  return notify;
}

function ToastViewport({ items, dismiss }: { items: ToastItem[]; dismiss: (id: number) => void }) {
  const node = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<Element | null>(null);
  const [native, setNative] = useState(true);
  const [geometry, setGeometry] = useState({ top: 0, maxHeight: 0 });
  const present = items.length > 0;
  useLayoutEffect(() => {
    const locate = () => setTarget(Array.from(document.querySelectorAll(modalSelector)).at(-1) ?? document.body);
    const header = document.querySelector<HTMLElement>('.workspace-toolbar');
    const measure = () => {
      const top = Math.max(0, header?.hidden ? 0 : header?.getBoundingClientRect().bottom ?? 0);
      const maxHeight = Math.max(0, window.innerHeight - top - 24);
      setGeometry(previous => previous.top === top && previous.maxHeight === maxHeight ? previous : { top, maxHeight });
    };
    locate(); measure();
    if (!present) return;
    const observer = new MutationObserver(records => {
      // Source editing and toast content changes do not require a document-wide modal lookup.
      if (records.some(record => record.type === 'attributes'
        ? record.target === header || record.attributeName === 'aria-modal'
        : [...record.addedNodes, ...record.removedNodes].some(element => element instanceof Element && (element.matches(modalSelector) || element.querySelector(modalSelector))))) locate();
      if (records.some(record => record.target === header)) measure();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'hidden'] });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (header) resize?.observe(header);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); resize?.disconnect(); window.removeEventListener('resize', measure); };
  }, [present]);
  useLayoutEffect(() => {
    const element = node.current;
    if (!element?.isConnected) return;
    if (typeof element.showPopover !== 'function') { setNative(false); return; }
    if (present && !element.matches(':popover-open')) element.showPopover();
    else if (!present && element.matches(':popover-open')) element.hidePopover();
  }, [native, present, target]);
  if (!target) return null;
  return createPortal(<div ref={node} data-toast-viewport popover={native ? 'manual' : undefined} hidden={!present} aria-live="polite" aria-atomic={false}
    style={geometry} className="pointer-events-none fixed inset-x-4 bottom-auto z-80 mx-auto mt-3 grid w-auto max-w-2xl justify-items-center gap-2 overflow-x-clip overflow-y-auto border-0 bg-transparent p-0 text-primary scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
    {items.map(item => <ToastCard key={item.id} item={item} dismiss={dismiss} />)}
  </div>, target);
}

function ToastCard({ item, dismiss }: { item: ToastItem; dismiss: (id: number) => void }) {
  const { t } = useUITranslation('common');
  const card = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => () => {
    if (card.current?.contains(document.activeElement) && returnFocus.current?.isConnected) returnFocus.current.focus();
  }, []);
  const path = item.tone === 'success' ? 'm5 12 4 4L19 6'
    : item.tone === 'warning' ? 'M12 3 2 21h20L12 3Zm0 6v5m0 3v1'
      : 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 6 6 6m0-6-6 6';
  return <section ref={card} role="status" aria-atomic="true" data-tone={item.tone} data-toast-id={item.id}
    onFocusCapture={event => { if (event.relatedTarget instanceof HTMLElement && !event.currentTarget.contains(event.relatedTarget)) returnFocus.current = event.relatedTarget; }}
    className="pointer-events-auto flex min-w-0 max-w-full items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3 shadow-(--editor-dialog-shadow) data-[tone=success]:border-success/30 data-[tone=warning]:border-warning-line data-[tone=error]:border-danger/40">
    <svg data-tone={item.tone} className="size-5 shrink-0 text-success data-[tone=warning]:text-warning-strong data-[tone=error]:text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
    <p className="min-w-0 break-words text-sm font-medium">{formatProductMessage(item, t)}</p>
    <IconButton variant="inline" tooltip={t('feedback.dismiss')} onClick={() => dismiss(item.id)} icon={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19" /></svg>} />
  </section>;
}
