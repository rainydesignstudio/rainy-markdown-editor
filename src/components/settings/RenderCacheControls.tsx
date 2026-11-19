'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUITranslation } from '../global/UILocaleProvider';
import { useToast } from '../global/Toast';

import { ButtonBar } from '../global/ButtonBar';

import { formatProductMessage, productCause, productReference } from '../../lib/i18n/productMessages';
import { browserCacheUsage, clearBrowserCache } from '../../lib/browserCache';
import { clearArticleStyleCache } from '../../lib/article-format/renderer';
import { clearArticleImageCache } from '../../lib/resources/imageCache';
import { scanRenderStorage, migrateRenderStorage, reclaimRenderStorage, type RenderStorageScan } from '../../lib/article-format/renderMaintenance';
import type { createArticleMutationQueue } from '../../lib/articleMutationQueue';
import { Button } from '../global/Button';
import { ConfirmDialog } from '../global/ConfirmDialog';

export type RenderCacheQueue = Pick<ReturnType<typeof createArticleMutationQueue>, 'run'>;
type Action = 'scan' | 'clear' | 'migrate' | 'reclaim';
type Phase = 'working' | 'stopping' | 'checking';
const busyMessage = { scan: 'renderCache.scanning', clear: 'renderCache.clearing', migrate: 'renderCache.migrating', reclaim: 'renderCache.reclaiming' } as const;

export function RenderCacheControls({ root, queue, disabled = false }: { root: FileSystemDirectoryHandle | null; queue?: RenderCacheQueue; disabled?: boolean }) {
  const { t } = useUITranslation('messages'), notify = useToast();
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof browserCacheUsage>> | null>(null);
  const [scan, setScan] = useState<RenderStorageScan | null>(null);
  const [activity, setActivity] = useState<{ action: Action; phase: Phase } | null>(null);
  const [confirm, setConfirm] = useState<'migrate' | 'reclaim' | null>(null);
  const operation = useRef<{ stop: boolean; checking: boolean } | null>(null);
  const currentRoot = useRef(root);
  currentRoot.current = root;

  useEffect(() => {
    let alive = true;
    operation.current = null;
    setActivity(null);
    setScan(null);
    setConfirm(null);
    void browserCacheUsage().then(value => { if (alive) setUsage(value); });
    return () => { alive = false; operation.current = null; };
  }, [root]);

  const amount = (bytes: number) => t('renderCache.amount', { size: (bytes / 1048576).toFixed(2) });
  const stateLabel = activity ? t(activity.phase === 'checking' ? 'renderCache.rechecking' : activity.phase === 'stopping' ? 'renderCache.stopping' : busyMessage[activity.action]) : '';
  const buttonLabel = (action: Action) => activity?.action === action ? stateLabel : t('renderCache.' + (action === 'scan' ? 'inspect' : action));

  const run = async (action: Action) => {
    if (operation.current || (action !== 'clear' && !root) || (action === 'reclaim' && !scan)) return;
    const token = { stop: false, checking: false };
    operation.current = token;
    setActivity({ action, phase: 'working' });
    const attached = () => operation.current === token && currentRoot.current === root;
    const current = () => attached() && !token.stop;
    let committed = 0, completed = false;
    let failure: unknown, checkFailure: unknown;
    const onCommit = (count: number) => { committed = count; };

    const execute = async () => {
      if (!current()) return;
      try {
        if (action === 'clear') {
          await clearBrowserCache();
          clearArticleStyleCache();
          clearArticleImageCache();
        } else if (root) {
          if (action === 'scan') {
            const result = await scanRenderStorage(root, current);
            if (!current()) return;
            setScan(result);
          } else if (action === 'migrate') {
            committed = await migrateRenderStorage(root, current, onCommit);
          } else if (scan) {
            committed = await reclaimRenderStorage(root, scan, current, onCommit);
          }
        }
        completed = true;
      } catch (error) {
        failure = error;
      }

      if (!attached()) return;
      if (root && (action === 'migrate' || action === 'reclaim')) {
        token.checking = true;
        setActivity({ action, phase: 'checking' });
        try {
          const result = await scanRenderStorage(root, attached);
          if (attached()) setScan(result);
        } catch (error) {
          checkFailure = error;
          if (attached()) setScan(null);
        }
      } else if (action === 'scan' && !completed) {
        setScan(null);
      }
    };

    try {
      if (queue) await queue.run(execute);
      else await execute();
      if (!attached()) return;
      if (completed && action === 'clear') {
        const nextUsage = await browserCacheUsage();
        if (attached()) setUsage(nextUsage);
      }
      if (!attached() || action === 'scan' && completed) return;

      const result = productReference('renderCache.' + (action === 'migrate' ? 'migrated' : action === 'reclaim' ? 'reclaimed' : 'cleared'), { count: committed, bytes: amount(committed) });
      const summary = completed ? checkFailure ? productReference('renderCache.checkAfterCommitFailed') : result
        : committed ? productReference('renderCache.partial')
        : token.stop ? productReference('renderCache.stopped') : productReference('renderCache.failed');
      const details = [
        ...(committed && (!completed || checkFailure) ? [result] : []),
        ...(failure && !token.stop ? [productCause(failure)] : []),
        ...(checkFailure ? [productReference('renderCache.recheckFailed'), productCause(checkFailure)] : []),
      ];
      notify({ key: 'render-cache', label: formatProductMessage(summary, t), summary,
        details: details.length ? details : undefined,
        tone: completed ? checkFailure ? 'warning' : 'success' : committed || checkFailure ? 'warning' : token.stop ? 'info' : 'error' });
    } finally {
      if (attached()) {
        operation.current = null;
        setActivity(null);
      }
    }
  };

  const stop = () => {
    const token = operation.current;
    if (!activity || !token || token.stop || token.checking || activity.action === 'clear') return;
    token.stop = true;
    setActivity({ action: activity.action, phase: 'stopping' });
  };

  return <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-list/50 p-5" aria-labelledby="render-cache-title">
    <header className="border-b border-line pb-4"><h3 id="render-cache-title" className="font-heading text-lg font-semibold text-primary">{t('renderCache.title')}</h3><p className="mt-1 text-xs text-muted">{t('renderCache.help')}</p></header>
    <dl className="grid grid-cols-3 divide-x divide-line text-xs text-secondary sm:text-sm">
      {([
        ['renderCache.browser', usage && (usage.persistent || typeof indexedDB === 'undefined') ? usage.bytes : null],
        ['renderCache.retained', scan?.bytes ?? null],
        ['renderCache.reclaimable', scan?.reclaimBytes ?? null],
      ] as const).map(([key, bytes]) => (
        <div key={key} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 px-3 first:pl-0 last:pr-0">
          <dt className="min-w-0 break-words text-muted">{t(key)}</dt>
          <dd className="whitespace-nowrap tabular-nums">{typeof bytes === 'number' ? amount(bytes) : t('renderCache.unchecked')}</dd>
        </div>
      ))}
    </dl>
    <span className="sr-only" role="status">{stateLabel}</span>
    <ButtonBar label={t('renderCache.title')} className="mt-auto" aria-busy={Boolean(activity)}>
      <Button icon="check"  disabled={disabled || Boolean(activity) || !root} onClick={() => void run('scan')} label={buttonLabel('scan')} />
      <Button icon="reset"  disabled={disabled || Boolean(activity)} onClick={() => void run('clear')} label={buttonLabel('clear')} />
      <Button icon="folder"  disabled={disabled || Boolean(activity) || !queue || !scan?.legacyRecords} onClick={() => setConfirm('migrate')} label={buttonLabel('migrate')} />
      <Button icon="delete"  disabled={disabled || Boolean(activity) || !queue || !scan?.candidates.length} onClick={() => setConfirm('reclaim')} label={buttonLabel('reclaim')} />
      {activity && activity.action !== 'clear' ? <Button icon="close"  disabled={activity.phase !== 'working'} onClick={stop} label={t('formatPackage.cancel')} /> : null}
    </ButtonBar>
    {confirm && scan ? createPortal(<ConfirmDialog titleId="cache-confirm-title" onClose={() => setConfirm(null)} title={t('renderCache.' + confirm)} eyebrow={t('renderCache.title')}
        cancel={{ label: t('formatPackage.cancel'), onClick: () => setConfirm(null) }} confirm={{ label: t('renderCache.' + confirm), icon: "check", onClick: () => { setConfirm(null); void run(confirm); }, variant: "primary" }}>
        <div className="dialog-content text-sm text-secondary"><p>{t('renderCache.confirm', { count: confirm === 'migrate' ? scan.legacyRecords : scan.candidates.length })}</p></div>
      </ConfirmDialog>, document.body) : null}
  </section>;
}
