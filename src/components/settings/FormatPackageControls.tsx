'use client';
import { ProductError, productReference, productCause, type ProductMessageValue } from '../../lib/i18n/productMessages';
import { OperationFeedback } from '../global/OperationFeedback';
import { SelectField } from '../global/SelectField';
import { useEffect, useRef, useState } from 'react';
import { useFormatSnapshot } from '../../hooks/useFormatSnapshot';
import { getFormatSnapshot, invalidateFormatBundle } from '../../lib/article-format/runtime';
import { activateLibraryFormat } from '../../lib/article-format/library';
import { validateLibraryConfiguration } from '../../lib/article-format/libraryConfiguration';
import { canonicalFormatJson } from '../../lib/article-format/config';
import { disposeRendererRunners } from '../../lib/article-format/package';
import { useUITranslation } from '../global/UILocaleProvider';
import { DialogFrame, DialogHeader, DialogFooter, DialogActions, DialogButton } from '../global/DialogFrame';
import { ContentIcon } from '../global/ContentIcon';
import { UnsavedChangesDialog } from '../global/UnsavedChangesDialog';

export function FormatPackageControls({ root }: { root: FileSystemDirectoryHandle }) {
  const { t } = useUITranslation('messages'), snapshot = useFormatSnapshot();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [message, setMessage] = useState<ProductMessageValue>('');
  const [revision, setRevision] = useState(0);
  const [values, setValues] = useState(snapshot.renderer?.declaration.values ?? {}), [discard, setDiscard] = useState(false);
  const currentRoot = useRef(root); currentRoot.current = root;
  const operation = useRef<object | null>(null);
  useEffect(() => { operation.current = null; setBusy(false); setMessage(''); return () => { operation.current = null; }; }, [root]);
  const declaration = snapshot.renderer?.declaration;
  const dirty = canonicalFormatJson(values) !== canonicalFormatJson(declaration?.values ?? {});
  useEffect(() => { setOpen(false); setValues(snapshot.renderer?.declaration.values ?? {}); }, [root, snapshot.id]);
  const close = () => { if (busy) return; if (dirty) setDiscard(true); else setOpen(false); };
  const reload = async (save = false) => {
    if (operation.current) return;
    const token = {}; operation.current = token; setBusy(true); setRevision(value => value + 1); setFailed(false); setMessage('');
    const current = () => currentRoot.current === root && operation.current === token;
    try {
      if (save && declaration) {
        const dir = await root.getDirectoryHandle('format'), handle = await dir.getFileHandle('config.json');
        const original = await (await handle.getFile()).text(), config = validateLibraryConfiguration(JSON.parse(original));
        if (canonicalFormatJson(config.renderer) !== canonicalFormatJson(declaration) || !current() || getFormatSnapshot().id !== snapshot.id) throw new ProductError('formatPackage.changed');
        config.renderer = { ...declaration, values }; validateLibraryConfiguration(config);
        if (await (await handle.getFile()).text() !== original || !current()) throw new ProductError('formatPackage.changed');
        const stream = await handle.createWritable();
        try { if (!current()) throw new ProductError('formatPackage.changed'); await stream.write(JSON.stringify(config, null, 2) + '\n'); await stream.close(); }
        catch (error) { try { await stream.abort(); } catch { /* preserve cause */ } throw error; }
      }
      if (!current()) return;
      disposeRendererRunners(); invalidateFormatBundle(root.name, productReference('formatPackage.loading'), { loading: true });
      const result = await activateLibraryFormat(root, current);
      if (current()) { setMessage(result.snapshot?.error ? productCause(result.snapshot.issue ?? result.snapshot.error) : productReference('formatPackage.loaded')); if (!result.snapshot?.error) setOpen(false); }
    } catch (error) { if (current()) { setFailed(true); setMessage(productCause(error)); } }
    finally { if (operation.current === token) { operation.current = null; setBusy(false); } }
  };
  return <div className="grid gap-3">
    {declaration ? <p className="break-all font-mono text-xs text-muted">{declaration.id} · v{declaration.version} · {declaration.protocol}</p> : null}
    <div className="flex flex-wrap gap-2"><OperationFeedback hideTrigger revision={revision} id={snapshot.error ? "format-problem" : "format-reload-result"} announce={!busy && Boolean(message)} lifetime={snapshot.error ? { mode: 'locked' } : undefined} notice={message} tone={failed || snapshot.error ? 'error' : 'success'} summary={snapshot.error ? productReference('feedback.formatUnavailable') : failed ? productReference('feedback.saveFailed') : undefined} /><button type="button" className="button button-quiet" disabled={busy} onClick={() => void reload()}><ContentIcon name="reset" />{t('formatPackage.reload')}</button>{declaration?.settings.length ? <button type="button" className="button button-quiet" disabled={busy} onClick={() => { setValues(declaration.values); setOpen(true); }}><ContentIcon name="edit" />{t('formatPackage.settings')}</button> : null}</div>
    {open && declaration ? <DialogFrame titleId="format-settings-title" onClose={close} focusActive={!discard} dismissible={!busy} className="flex min-h-0 max-w-lg flex-col overflow-hidden">
      <DialogHeader eyebrow="FORMAT" titleId="format-settings-title" title={t('formatPackage.settings')} onClose={close} closeDisabled={busy} />
      <div className="grid min-h-0 gap-4 overflow-x-clip overflow-y-auto p-4">{declaration.settings.map(setting => <label key={setting.key} className="field-stack"><span className="field-label">{setting.label}</span>{setting.type === 'select' ? <SelectField label={setting.label} disabled={busy} value={String(values[setting.key])} onChange={nextValue => setValues({ ...values, [setting.key]: nextValue })} options={[...(setting.options?.map(option => ({ value: option, label: option })) ?? [])]} /> : setting.type === 'boolean' ? <input type="checkbox" disabled={busy} checked={Boolean(values[setting.key])} onChange={event => setValues({ ...values, [setting.key]: event.target.checked })} /> : <input className="field" disabled={busy} type={setting.type === 'number' ? 'number' : 'text'} value={String(values[setting.key])} onChange={event => setValues({ ...values, [setting.key]: setting.type === 'number' ? Number(event.target.value) : event.target.value })} />}</label>)}</div>
      <DialogFooter><DialogActions><DialogButton onClick={close} disabled={busy}>{t('formatPackage.cancel')}</DialogButton><DialogButton variant="primary" disabled={busy || !dirty} onClick={() => void reload(true)}>{t('formatPackage.save')}</DialogButton></DialogActions></DialogFooter>
    </DialogFrame> : null}
    {discard ? <UnsavedChangesDialog entries={[{ label: t('formatPackage.settings') }]} description={t('formatPackage.unsaved')} onContinue={() => setDiscard(false)} onSave={async () => { setDiscard(false); await reload(true); return !getFormatSnapshot().error; }} onCancel={() => setDiscard(false)} onDiscard={() => { setDiscard(false); setValues(declaration?.values ?? {}); setOpen(false); }} /> : null}
  </div>;
}
