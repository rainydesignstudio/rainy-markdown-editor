'use client';

import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { formatProductMessage, isProductMessage, type ProductMessageInfo } from '../../lib/i18n/productMessages';
import { feedbackNotice, formatBriefFeedback } from '../../lib/i18n/feedback';
import { ContentIcon } from './ContentIcon';
import { IconPopover } from './IconPopover';
import { useToast, type ToastLifetime, type ToastTone } from './Toast';
import { useUILocale, useUITranslation } from './UILocaleProvider';

function containsContent(node: ReactNode): boolean {
  return Children.toArray(node).some(child => typeof child === 'string' ? Boolean(child.trim()) : typeof child === 'number' || isValidElement<{ children?: ReactNode }>(child) && containsContent(child.props.children));
}

/** Operation results announce once; named diagnostics appear only while they have content. */
export function OperationFeedback({ id, notice, tone, summary, lifetime, children, onRetry, retryLabel, retryDisabled = false, label, hideTrigger = !label, announce = true, revision }: {
  id: string; label?: string; hideTrigger?: boolean; announce?: boolean; revision?: number; notice?: unknown; tone?: ToastTone | 'neutral'; summary?: ProductMessageInfo; lifetime?: ToastLifetime; children?: ReactNode; onRetry?: () => unknown; retryLabel?: ProductMessageInfo; retryDisabled?: boolean;
}) {
  const { t } = useUITranslation('common'), { locale } = useUILocale(), notify = useToast(), [open, setOpen] = useState(false);
  const model = feedbackNotice(notice, tone), full = formatProductMessage(notice, t).trim();
  const brief = summary ?? (['feedback.review', 'feedback.completed'].includes(model.summary.messageKey) ? isProductMessage(notice) ? notice : undefined : model.summary);
  const hasDetails = Boolean(full || onRetry || containsContent(children));
  const caption = label ?? t('feedback.operationDetails');
  const signature = JSON.stringify([revision ?? notice, tone, summary, lifetime?.mode, lifetime?.mode === 'auto' ? lifetime.durationMs : null, Boolean(onRetry), retryLabel, retryDisabled]);
  const announced = useRef(false);
  useEffect(() => {
    if (!announce) return;
    if (full) {
      announced.current = true;
      const heading = brief ? formatBriefFeedback(brief, t, locale).trim() : full;
      notify({ key: id, label: full, summary: brief, details: full !== heading ? notice : undefined, tone: model.tone,
        lifetime: lifetime ?? (model.tone === 'info' || model.tone === 'success' ? { mode: 'auto', durationMs: model.tone === 'success' ? 3000 : 5000 } : { mode: 'manual' }),
        actions: onRetry ? [{ id: 'retry', label: retryLabel ?? { messageKey: 'feedback.retryRefresh' }, presentation: 'icon', icon: 'reset', disabled: retryDisabled, run: async () => { await onRetry(); } }] : undefined }, signature);
    } else if (announced.current) { announced.current = false; notify({ key: id, dismiss: true }, signature); }
  }, [id, revision ?? signature, notify, announce, lifetime?.mode, retryDisabled]);
  useEffect(() => { if (!hasDetails) setOpen(false); }, [hasDetails]);
  if (hideTrigger || !hasDetails) return null;
  return <IconPopover label={caption} tooltip={caption} icon={<ContentIcon name="info" />} kind="dialog" open={open && hasDetails} onToggle={() => setOpen(value => !value)} onClose={() => setOpen(false)}><div className="grid max-h-80 gap-3 overflow-y-auto p-3 text-xs text-secondary">
    {full ? <p className="whitespace-pre-wrap break-words">{full}</p> : children ? null : <p>{t('feedback.noDetails')}</p>}{children}
    {onRetry ? <button type="button" className="button button-quiet" disabled={retryDisabled} onClick={onRetry}><ContentIcon name="reset" />{retryLabel ? formatProductMessage(retryLabel, t) : t('feedback.retryRefresh')}</button> : null}
  </div></IconPopover>;
}
