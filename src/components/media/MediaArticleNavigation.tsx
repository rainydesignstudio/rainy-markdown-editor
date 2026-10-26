'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getArticleOrganization, orderArticlesForGroup, orderEditorProjects, type EditorWorkspace } from '../../lib/editorWorkspace';
import type { ArticleSummary } from '../../lib/types';
import { CollapsiblePanel } from '../global/CollapsiblePanel';
import { ContentIcon } from '../global/ContentIcon';
import { LibraryCard } from '../global/LibraryCard';
import { ScrollViewport } from '../global/ScrollViewport';
import { useUITranslation } from '../global/UILocaleProvider';

export function MediaArticleNavigation({ articles, workspace, selected, onSelect, disabled }: { articles: ArticleSummary[]; workspace: EditorWorkspace; selected: string; onSelect: (id: string) => void; disabled: boolean }) {
  const { t } = useUITranslation('articles');
  const groups = useMemo(() => [
    ...orderEditorProjects(workspace, articles).map(project => ({ id: project.id, name: project.name, items: orderArticlesForGroup(articles, workspace, project.id) })),
    { id: 'unclassified', name: t('collections.unclassified'), items: orderArticlesForGroup(articles, workspace, null) },
    { id: 'archived', name: t('collections.archived'), items: articles.filter(article => getArticleOrganization(workspace, article.id).archived) },
  ].filter(group => group.items.length), [articles, workspace, t]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(groups.filter(group => group.items.some(article => article.id === selected)).map(group => group.id)));
  const lastSelection = useRef<string | null>(null);
  useEffect(() => {
    if (lastSelection.current === selected) return;
    const group = groups.find(group => group.items.some(article => article.id === selected));
    if (selected === 'all' || group) { lastSelection.current = selected; if (group) setExpanded(previous => new Set([...previous, group.id])); }
  }, [selected, groups]);
  return <aside className="flex max-h-56 min-w-0 shrink-0 flex-col border-b border-line lg:max-h-none lg:w-60 lg:border-b-0 lg:border-r" aria-label={t('navigation.label')}><ScrollViewport className="p-2"><LibraryCard title={t('collections.all')} icon={<ContentIcon name="book" />} aria-pressed={selected === 'all'} disabled={disabled} onClick={() => onSelect('all')} />
    {groups.map(group => <CollapsiblePanel key={group.id} id={'media-articles-' + group.id} title={group.name} icon={<ContentIcon name={group.id === 'archived' ? 'changes' : 'folder'} />} count={group.items.length} open={expanded.has(group.id)} onToggle={() => setExpanded(previous => { const next = new Set(previous); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })} className="mt-2" contentClassName="p-0">
      {group.items.map(article => <LibraryCard key={article.id} title={article.parse.metadata.title || t('untitled')} icon={<ContentIcon name="document" />} aria-pressed={selected === article.id} disabled={disabled} onClick={() => onSelect(article.id)} />)}
    </CollapsiblePanel>)}
  </ScrollViewport></aside>;
}
