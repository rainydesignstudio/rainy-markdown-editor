'use client';

import { formatDiagnosticMessage, formatDiagnosticName, formatDiagnosticSource, formatProductMessage } from "../../lib/i18n/productMessages";

import { useUITranslation } from './UILocaleProvider';

import { useState } from 'react';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { useAnimatedMaxHeight } from '../../hooks/useAnimatedMaxHeight';
import { articleFormatSeverity, articleFormatTierLabel, type ArticleFormatIssue, type ArticleFormatSeverity } from '../../lib/articleFormat';
import { hasFormatConcerns, type ArticleFormatReport, type FormatCheckSection } from '../../lib/articleFormatReport';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader } from './DialogFrame';

type FormatTab = 'theme' | 'body';
const TABS: Array<{ id: FormatTab }> = [{ id: 'theme' }, { id: 'body' }];
const ISSUE_SOURCES = [
  { id: 'html' },
  { id: 'styles' },
  { id: 'check' },
] as const;
const GROUPS: Array<{ severity: ArticleFormatSeverity }> = [
  { severity: 'safe' },
  { severity: 'warning' },
  { severity: 'error' },
];

function FormatTabIcon({ tab }: { tab: FormatTab }) {
  return <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {tab === 'theme' ? <path d="M4 19h16M6 15 16 5l3 3-10 10H6v-3Z" /> : <path d="M12 6.2C9.5 4.7 6.5 4.5 3 5v13c3.5-.5 6.5-.3 9 1.2 2.5-1.5 5.5-1.7 9-1.2V5c-3.5-.5-6.5-.3-9 1.2ZM12 6.2v13" />}
  </svg>;
}

function FormatActionIcon({ copy = false }: { copy?: boolean }) {
  return <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {copy ? <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></> : <path d="m6 6 12 12M6 18 18 6" />}
  </svg>;
}

function issueSource(issue: ArticleFormatIssue): (typeof ISSUE_SOURCES)[number]['id'] {
  if (issue.kind === 'element' || issue.kind === 'attribute') return 'html';
  if (issue.kind === 'engine') return 'check';
  return 'styles';
}

function issueLocation(issue: ArticleFormatIssue, tab: FormatTab, t: ReturnType<typeof useUITranslation>['t']): string | null {
  const lines = issue.lines?.length ? issue.lines : issue.line ? [issue.line] : [];
  if (!lines.length) return issue.source === '主题节点样式' ? t('messages:locations.themeNodes') : null;
  return t('messages:locations.' + (tab === 'body' ? 'body' : 'theme'), { lines: lines.join('、') });
}

function FormatDisclosure({ section, tab, group }: { section: FormatCheckSection; tab: FormatTab; group: (typeof GROUPS)[number] }) {
  const { t } = useUITranslation('dialogs');
  const issues = section.issues.filter(issue => articleFormatSeverity(issue.tier) === group.severity);
  const names = group.severity === 'safe' ? section.passed : [];
  const count = group.severity === 'safe' ? names.length : issues.length;
  const [open, setOpen] = useState(group.severity === 'error' && count > 0);
  const bodyRef = useAnimatedMaxHeight(open);
  const bodyId = `format-check-${tab}-${group.severity}`;
  const tone = count === 0 ? 'text-faint' : group.severity === 'safe' ? 'text-success' : group.severity === 'warning' ? 'text-warning-strong' : 'text-danger';

  return <section className="rounded-lg border border-line bg-list/50 p-4">
    <button type="button" className="group/format flex w-full items-center justify-between gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(value => !value)}>
      <span className={`text-sm font-medium ${tone}`}>{t('dialogs:formatGroups.' + group.severity)}</span>
      <span className="flex items-center gap-2 text-xs text-muted"><span>{t('dialogs:formatSummaries.' + group.severity, { count })}</span><svg className="size-4 shrink-0 text-faint transition-transform duration-200 ease-out motion-reduce:transition-none group-aria-expanded/format:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></span>
    </button>
    <div id={bodyId} ref={bodyRef} className="overflow-hidden transition-[max-height] duration-200 ease-out motion-reduce:transition-none">
      {count ? <div className="grid gap-3 pt-3">
        {names.length ? <ul className="grid gap-2 text-sm text-secondary">{names.map(name => <li key={name} className="break-words">{formatProductMessage(name, t)}</li>)}</ul> : null}
        {ISSUE_SOURCES.map(source => {
          const entries = issues.filter(issue => issueSource(issue) === source.id);
          return entries.length ? <section key={source.id} className="grid gap-2">
            <h3 className="text-xs font-medium text-muted">{t('dialogs:templates.sourceCount', { source: t('dialogs:formatSources.' + source.id), count: entries.length })}</h3>
            <ul className="grid gap-3 text-sm text-secondary">{entries.map((issue, index) => {
              const location = issueLocation(issue, tab, t);
              const provenance = (issue.sourceKind === 'utility' || !issue.sourceKind && issue.source.startsWith('工具类 ')) ? t('dialogs:templates.from', { source: formatDiagnosticSource(issue.source, t) }) : null;
              return <li key={`${issue.kind}:${issue.name}:${issue.line ?? ''}:${index}`} className="break-words">
                <span className="font-medium text-primary">{formatDiagnosticName(issue, t)}</span>
                <span className="ml-2 text-xs text-faint">{formatProductMessage(articleFormatTierLabel(issue.tier), t)}</span>
                {location || provenance ? <p className="mt-1 text-xs text-faint">{[location, provenance].filter(Boolean).join(' · ')}</p> : null}
                {issue.message !== issue.name ? <p className="mt-1 text-sm text-muted">{formatDiagnosticMessage(issue, t)}</p> : null}
              </li>;
            })}</ul>
          </section> : null;
        })}
      </div> : <p className="pt-3 text-sm text-faint">{t('dialogs:ui.noItems')}</p>}
    </div>
  </section>;
}

export function FormatCheckDialog({ mode, report, onDecision }: { mode: 'save' | 'copy' | 'inspect' | 'export'; report: ArticleFormatReport; onDecision: (proceed: boolean) => void }) {
  const { t } = useUITranslation('dialogs');
  const format = useFormatSnapshot();
  const [tab, setTab] = useState<FormatTab>(() => TABS.find(item => report[item.id].issues.some(issue => articleFormatSeverity(issue.tier) === 'error'))?.id ?? (report.theme.issues.length ? 'theme' : report.body.issues.length ? 'body' : 'theme'));
  const concerns = hasFormatConcerns(report);
  const chooseTab = (next: FormatTab) => setTab(next);

  return <DialogFrame titleId="format-check-title" descriptionId="format-check-description" onClose={() => onDecision(false)} large wide>
    <DialogHeader titleId="format-check-title" eyebrow={t('common:eyebrows.formatCheck')} title={t('dialogs:ui.formatCheck')} onClose={() => onDecision(false)} />
    <p id="format-check-description" className="p-4 text-sm text-muted">{mode === 'save'
      ? t('dialogs:ui.sourceSavedChecksUseTheCurrentLibraryConfiguration')
      : mode === 'inspect' ? t('dialogs:ui.resultsUseTheCurrentDraftAndLibraryConfiguration')
      : mode === 'export' ? t('dialogs:ui.reviewThemeAndBodyBeforeExportingIncompleteChecks') : concerns ? t('dialogs:ui.reviewThemeAndBodyBeforeCopyingIncompleteChecks') : t('dialogs:ui.noActionableConcernsFoundInTheThemeOr')}<span className="mt-1 block text-xs text-faint">{format.bundle.support.meta.name}{format.officialDefault ? t('dialogs:ui.officialDefaults') : t('dialogs:ui.customLibraryConfiguration')}{report.complete === false ? t('dialogs:ui.layoutConversionChecksIncomplete') : ''}</span></p>
    <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-line p-4" role="tablist" aria-label={t('dialogs:ui.checkTarget')}>
      {TABS.map((item, index) => {
        const errorCount = report[item.id].issues.filter(issue => articleFormatSeverity(issue.tier) === 'error').length;
        return <button key={item.id} id={`format-check-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls="format-check-panel" aria-label={errorCount ? t('dialogs:templates.tabErrors', { name: t('dialogs:formatTabs.' + item.id), count: errorCount }) : undefined} tabIndex={tab === item.id ? 0 : -1} onClick={() => chooseTab(item.id)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null;
        if (next !== null) { event.preventDefault(); chooseTab(TABS[next].id); document.getElementById(`format-check-tab-${TABS[next].id}`)?.focus(); }
      }} className={`flex min-h-9 items-center justify-center gap-2 rounded-md border border-transparent px-4 py-2 text-sm font-medium hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${errorCount ? 'text-danger aria-selected:border-danger aria-selected:bg-danger/10 aria-selected:text-danger' : 'text-muted aria-selected:border-accent-line aria-selected:bg-accent-soft aria-selected:text-accent-text'}`}><FormatTabIcon tab={item.id} />{t('dialogs:formatTabs.' + item.id)}</button>;
      })}
    </div>
    <div id="format-check-panel" role="tabpanel" aria-labelledby={`format-check-tab-${tab}`} tabIndex={0} className="min-h-0 flex-1 overflow-x-clip overflow-y-auto p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent">
      <div className="grid gap-3">{GROUPS.map(group => <FormatDisclosure key={`${tab}:${group.severity}`} section={report[tab]} tab={tab} group={group} />)}</div>
    </div>
    <DialogFooter><DialogActions>
      {mode === 'copy' || mode === 'export' ? <><DialogButton autoFocus onClick={() => onDecision(false)}><FormatActionIcon />{mode === 'export' ? t('dialogs:ui.cancelExport') : t('dialogs:ui.doNotCopy')}</DialogButton><DialogButton variant="primary" onClick={() => onDecision(true)}><FormatActionIcon copy />{mode === 'export' ? (concerns ? t('dialogs:ui.exportAnyway') : t('dialogs:ui.continueExport')) : concerns ? t('dialogs:ui.copyAnyway') : t('dialogs:ui.copyRichText')}</DialogButton></> : <DialogButton autoFocus variant="primary" onClick={() => onDecision(false)}><FormatActionIcon />{t('common:actions.close')}</DialogButton>}
    </DialogActions></DialogFooter>
  </DialogFrame>;
}
