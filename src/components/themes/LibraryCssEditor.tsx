'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { libraryCssPaths, readLibraryCss, saveLibraryCss, type LibraryCssSource } from '../../lib/article-format/sourceStyles';
import { activateLibraryFormat } from '../../lib/article-format/library';
import { disposeRendererRunners } from '../../lib/article-format/package';
import type { FormatSnapshot } from '../../lib/article-format/runtime';
import { ProductError, productCause, productReference, type ProductMessageValue } from '../../lib/i18n/productMessages';
import { useUITranslation } from '../global/UILocaleProvider';
import { SelectField } from '../global/SelectField';
import { OperationFeedback } from '../global/OperationFeedback';
import { ContentIcon } from '../global/ContentIcon';
import { IconButton } from '../global/IconButton';
import { UnsavedChangesDialog } from '../global/UnsavedChangesDialog';
import { SnippetTextarea } from '../content/SnippetTextarea';

export type LibraryCssEditorState = { dirty: boolean; busy: boolean; blocking: boolean; source: boolean };
export type LibraryCssEditorHandle = { leave: (next: () => void) => void; save: () => Promise<boolean> };

export const LibraryCssEditor = forwardRef<LibraryCssEditorHandle, {
  root: FileSystemDirectoryHandle | null; snapshot: FormatSnapshot; isRootCurrent: (root: FileSystemDirectoryHandle) => boolean;
  themeCss: string; onThemeCss: (text: string) => void; onState: (state: LibraryCssEditorState) => void;
}>(function LibraryCssEditor({ root, snapshot, isRootCurrent, themeCss, onThemeCss, onState }, ref) {
  const { t } = useUITranslation('dialogs');
  const paths = libraryCssPaths(snapshot);
  const [selected, setSelected] = useState(() => paths[0] ?? 'theme');
  const [source, setSource] = useState<LibraryCssSource | null>(null), [text, setText] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const [scopeVisible, setScopeVisible] = useState(true);
  const [departure, setDeparture] = useState<(() => void) | null>(null);
  const [notice, setNotice] = useState<ProductMessageValue>(''), [failed, setFailed] = useState(false), [revision, setRevision] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null), operation = useRef(false), active = useRef(true);
  const latestRoot = useRef(root); latestRoot.current = root;
  const dirty = Boolean(source && text !== source.text), dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const isSource = selected !== 'theme';
  const current = () => active.current && root !== null && latestRoot.current === root && isRootCurrent(root);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    onState({ dirty, busy, blocking: Boolean(departure), source: isSource });
  }, [dirty, busy, departure, isSource, onState]);
  useEffect(() => () => onState({ dirty: false, busy: false, blocking: false, source: false }), [onState]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || operation.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  useEffect(() => {
    if (operation.current || !isSource || !root) return;
    if (source?.root === root && source.snapshot.id === snapshot.id && source.path === selected) return;
    if (dirtyRef.current) { setFailed(true); setNotice(productReference('libraryCss.changed')); return; }
    let cancelled = false;
    setLoading(true); setSource(null); setText(''); setNotice('');
    void readLibraryCss(root, snapshot, selected, () => !cancelled && current()).then(value => {
      if (!cancelled && current()) { setSource(value); setText(value.text); }
    }).catch(error => { if (!cancelled && current()) { setFailed(true); setNotice(productCause(error)); } })
      .finally(() => { if (!cancelled && active.current) setLoading(false); });
    return () => { cancelled = true; };
  }, [root, snapshot.id, selected, isSource]);
  const resume = () => { setDeparture(null); requestAnimationFrame(() => input.current?.focus()); };
  const leave = (next: () => void) => {
    if (operation.current) return;
    if (dirty) setDeparture(() => next); else next();
  };
  const discard = () => {
    if (source) setText(source.text);
    dirtyRef.current = false;
    const next = departure; setDeparture(null); next?.();
  };
  const reloadSource = async () => {
    if (!root || !current()) throw new ProductError('libraryCss.changed');
    disposeRendererRunners();
    const result = await activateLibraryFormat(root, current);
    if (!current() || !result.snapshot) throw new ProductError('libraryCss.changed');
    if (result.snapshot.error) throw result.snapshot.issue ?? result.snapshot.error;
    return readLibraryCss(root, result.snapshot, selected, current);
  };
  const retry = () => leave(() => {
    operation.current = true; setBusy(true); setFailed(false); setNotice(''); setRevision(value => value + 1);
    void reloadSource().then(value => {
      if (current()) { setSource(value); setText(value.text); setNotice(productReference('libraryCss.reloaded')); }
    }).catch(error => { if (current()) { setFailed(true); setNotice(productCause(error)); } })
      .finally(() => { operation.current = false; if (active.current) { setBusy(false); setRevision(value => value + 1); } });
  });
  const save = async (): Promise<boolean> => {
    if (!source || !dirty || operation.current || !current()) return false;
    operation.current = true; setBusy(true); setFailed(false); setNotice(''); setRevision(value => value + 1);
    let written = false;
    try {
      await saveLibraryCss(source, text, current); written = true;
      if (!current()) return false;
      // Mark the successful file write separately from a subsequent reload failure.
      setSource({ ...source, text }); dirtyRef.current = false;
      const saved = await reloadSource();
      if (!current()) return false;
      setSource(saved); setText(saved.text); setNotice(productReference('libraryCss.saved')); setRevision(value => value + 1);
      return true;
    } catch (error) {
      if (current()) { setFailed(true); setNotice(written ? productReference('libraryCss.reloadFailed', { cause: productCause(error) }) : productCause(error)); setRevision(value => value + 1); }
      return false;
    } finally { operation.current = false; if (active.current) setBusy(false); }
  };
  useImperativeHandle(ref, () => ({ leave, save }));
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3" onKeyDown={event => {
    if (!isSource || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's') return;
    event.preventDefault(); event.stopPropagation();
    if (!event.repeat && !event.nativeEvent.isComposing && event.keyCode !== 229 && !departure) void save();
  }}>
    <div className="flex shrink-0 min-w-0 items-end gap-2"><label className="grid min-w-0 flex-1 gap-2 text-xs text-muted"><span>{t('libraryCss.source')}</span><SelectField label={t('libraryCss.source')} title={isSource ? selected : t('libraryCss.themeSource')} value={selected} disabled={busy || loading} options={[...paths.map(path => ({ value: path, label: path })), ...isSource && !paths.includes(selected) ? [{ value: selected, label: selected, disabled: true }] : [], { value: 'theme', label: t('libraryCss.themeSource') }]} onChange={next => leave(() => { setSource(null); setText(''); setNotice(''); setSelected(next); })} /></label>{isSource ? <IconButton tooltip={t('libraryCss.reload')} icon={<ContentIcon name="reset" />} disabled={busy || loading || !root} onClick={retry} /> : null}<OperationFeedback id="library-css-result" revision={revision} announce={revision > 0 && Boolean(notice)} hideTrigger={!failed} label={t('libraryCss.problems')} notice={notice} tone={failed ? 'error' : 'success'} summary={failed ? productReference('libraryCss.failed') : undefined} /></div>
    {scopeVisible ? <div className="flex shrink-0 items-start gap-2 rounded-md border border-line bg-list p-3"><p className="min-w-0 flex-1 text-xs text-muted">{t(isSource ? 'libraryCss.sharedScope' : 'previewCss.libraryExplanation')}{!paths.length ? ' ' + t('libraryCss.noSources') : ''}</p><IconButton tooltip={t('common:actions.close')} icon={<ContentIcon name="close" />} onClick={() => setScopeVisible(false)} /></div> : null}
    {isSource ? <>
      {loading ? <p className="text-xs text-muted" role="status">{t('libraryCss.loading')}</p> : null}
      <div className="flex min-h-48 min-w-0 flex-1 flex-col"><SnippetTextarea key={selected} ref={input} sourceFont="editor" value={text} snippets={[]} showLineNumbers disabled={busy || loading || !source} ariaLabel={t('libraryCss.editor', { path: selected })} onChange={setText} /></div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2"><button type="button" className="button button-quiet px-2" disabled={!dirty || busy} onClick={() => { setText(source!.text); setNotice(''); }}><ContentIcon name="reset" />{t('ui.resetChanges')}</button><button type="button" className="button button-primary px-2" disabled={!dirty || busy || loading || !root} onClick={() => void save()}><ContentIcon name="save" />{t(busy ? 'ui.saving' : 'libraryCss.save')}</button></div>
    </> : <SnippetTextarea sourceFont="editor" value={themeCss} snippets={[]} readOnly={!root} ariaLabel={t('ui.themeCss')} onChange={onThemeCss} />}
    {departure ? <UnsavedChangesDialog entries={[{ label: selected }]} description={t('libraryCss.unsaved')} saveDisabled={busy || !current()} saveLabel={t('libraryCss.save')} onCancel={resume} onContinue={resume} onDiscard={discard} onSave={async () => { if (!await save()) return false; const next = departure; setDeparture(null); next?.(); return true; }} /> : null}
  </div>;
});
