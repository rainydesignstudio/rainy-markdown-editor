'use client';
import { useEffect, useState } from 'react';
import { useUITranslation } from '../global/UILocaleProvider';
import { readKnowledgePreview } from '../../lib/knowledge/preview';
import { formatProductMessage, productErrorMessage } from '../../lib/i18n/productMessages';
import type { ReadonlyKnowledgeSource } from '../../lib/knowledge/source';
export function KnowledgeHoverPreview({ source, path, title }: { source: ReadonlyKnowledgeSource; path: string; title: string }) {
  const { t } = useUITranslation('knowledge'), [preview, setPreview] = useState<Awaited<ReturnType<typeof readKnowledgePreview>> | null>(null), [issue, setIssue] = useState<ReturnType<typeof productErrorMessage> | null>(null);
  useEffect(() => { let active = true; setPreview(null); setIssue(null); void readKnowledgePreview(source, path).then(value => { if (active) setPreview(value); }).catch(error => { if (active) setIssue(productErrorMessage(error)); }); return () => { active = false; }; }, [source, path]);
  return <span className="grid min-w-48 gap-2"><span className="line-clamp-2 font-semibold">{title}</span><span className="line-clamp-6 whitespace-pre-wrap wrap-anywhere font-normal">{issue ? formatProductMessage(issue, t) : preview ? preview.text || t('emptyPreview') : t('reading')}</span><span className="line-clamp-2 wrap-anywhere font-mono text-2xs opacity-80">{source.binding.name} · {path}</span>{preview?.truncated ? <span className="text-2xs font-normal">{t('hoverPartial')}</span> : null}</span>;
}
