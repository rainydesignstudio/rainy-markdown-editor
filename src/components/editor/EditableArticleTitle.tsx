'use client';

import { useEffect, useRef, useState } from 'react';
import { useUITranslation } from '../global/UILocaleProvider';
import { ContentIcon } from '../global/ContentIcon';

export function EditableArticleTitle({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const { t } = useUITranslation('editor');
  const [editing, setEditing] = useState(false);
  const original = useRef(value), input = useRef<HTMLTextAreaElement | null>(null);
  const cancelling = useRef(false);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  useEffect(() => { if (disabled) setEditing(false); }, [disabled]);
  const finish = (commit: boolean) => {
    cancelling.current = !commit;
    onChange(commit && value.trim() ? value.trim() : original.current);
    setEditing(false);
  };
  return <div className="min-w-0 max-w-full">
    {editing ? <textarea ref={input} rows={1} name="article-title" className="title-edit-input field-sizing-content min-h-0 max-w-full resize-none overflow-hidden font-heading" aria-label={t('title.edit')} value={value} disabled={disabled}
      onChange={event => onChange(event.target.value.replace(/[\r\n]/g, ' '))} onBlur={() => { if (!cancelling.current) finish(true); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(event.key === 'Enter'); }
      }} /> : <button className="title-trigger max-w-full font-heading" type="button" data-tooltip={t('title.change')} aria-label={t('title.edit')} disabled={disabled} onClick={() => { original.current = value; cancelling.current = false; setEditing(true); }}>
      <span>{value || t('dialogs:ui.unsavedManuscript')}</span><span className="title-edit-icon" aria-hidden="true"><ContentIcon name="edit" /></span>
    </button>}
  </div>;
}
