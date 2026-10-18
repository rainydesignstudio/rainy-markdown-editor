'use client';
import { useEffect, useState } from 'react';
import { useUITranslation } from '../../components/global/UILocaleProvider';
import { productErrorMessage, formatProductMessage, isProductMessage } from '../i18n/productMessages';
import { getFormatSnapshot } from './runtime';
import { MERMAID_IMAGE_CLASSES, renderMermaidImage, type MermaidImage, type MermaidPolicy } from './mermaid';

export function MermaidDiagram({ source, policy, session, line, rejected }: { source: string; policy: MermaidPolicy; session: string; line?: number; rejected?: string }) {
  const { t } = useUITranslation('messages'), key = JSON.stringify([source, policy, session]);
  const [state, setState] = useState<{ key: string; image?: MermaidImage; error?: ReturnType<typeof productErrorMessage> }>({ key });
  useEffect(() => {
    const abort = new AbortController(); setState({ key });
    if (rejected) { setState({ key, error: { message: '', messageKey: rejected } }); return; }
    void renderMermaidImage(source, policy, session, abort.signal, () => !abort.signal.aborted && getFormatSnapshot().id === session).then(image => {
      if (!abort.signal.aborted) setState({ key, image });
    }).catch(error => { if (!abort.signal.aborted) setState({ key, error: productErrorMessage(error) }); });
    return () => abort.abort();
  }, [key, policy, rejected, session, source]);
  const result = state.key === key ? state : null;
  if (result?.image) return <img src={result.image.dataUrl} alt={t('mermaid.alt')} width={result.image.width} height={result.image.height} className={MERMAID_IMAGE_CLASSES} data-render-kind="mermaid" data-diagram-source={source} data-source-line={line} />;
  if (result?.error) return <span data-render-error="mermaid" data-render-error-key={isProductMessage(result.error) ? result.error.messageKey : undefined} data-render-error-cause={isProductMessage(result.error) ? String(result.error.messageParams?.cause ?? '') : undefined} data-source-line={line} title={formatProductMessage(result.error, t)}><code>{source}</code><small role="status">{formatProductMessage(result.error, t)}</small></span>;
  return <span data-render-state="pending" data-render-kind="mermaid" data-source-line={line} aria-busy="true" role="status">{t('mermaid.pending')}</span>;
}
