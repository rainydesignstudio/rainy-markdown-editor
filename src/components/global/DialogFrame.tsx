'use client';

import { useUITranslation } from './UILocaleProvider';

import { useRef, type KeyboardEventHandler, type ReactNode } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { ActionMenuAnchorContext, ActionMenuContext, IconButton } from './IconButton';
import { ButtonBar } from './ButtonBar';
export { Button as DialogButton } from './Button';

export type DialogFrameProps = {
  titleId: string;
  descriptionId?: string;
  role?: 'dialog' | 'alertdialog';
  onClose: () => void;
  dismissible?: boolean;
  wide?: boolean;
  large?: boolean;
  focusActive?: boolean;
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
  children: ReactNode;
};

export function DialogFrame({ titleId, descriptionId, role = 'dialog', onClose, dismissible = true, wide = false, large = false, focusActive = true, className = '', onKeyDown, children }: DialogFrameProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  useDialogFocus(panelRef, () => { if (dismissible) onClose(); }, focusActive);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (dismissible && event.currentTarget === event.target) onClose(); }}>
      <section ref={panelRef} tabIndex={-1} className={`${large ? `dialog-card flex h-4/5 min-h-0 flex-col overflow-hidden ${wide ? 'max-w-2xl' : 'max-w-6xl'}` : wide ? 'dialog-card max-w-xl' : 'dialog-card'} ${className}`} role={role} aria-modal={focusActive ? 'true' : undefined} aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={onKeyDown}>
        <ActionMenuAnchorContext.Provider value={null}><ActionMenuContext.Provider value={false}>{children}</ActionMenuContext.Provider></ActionMenuAnchorContext.Provider>
      </section>
    </div>
  );
}

export function DialogHeader({ titleId, eyebrow, title, onClose, closeDisabled = false, actions }: {
  titleId: string;
  eyebrow: string;
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  actions?: ReactNode;
}) {
  const { t } = useUITranslation('dialogs');
  return (
    <header className="dialog-header">
      <div className="min-w-0"><p className="eyebrow">{eyebrow}</p><h2 className="font-heading dialog-title" id={titleId}>{title}</h2></div>
      <ButtonBar label={actions ? t('dialogs:ui.dialogActions') : t('dialogs:ui.closeDialog')}>{actions}<IconButton variant="dialog" icon="close" label={t('dialogs:ui.closeDialog')} disabled={closeDisabled} tabIndex={closeDisabled ? -1 : undefined} onClick={onClose} /></ButtonBar>
    </header>
  );
}

export function DialogActions({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { t } = useUITranslation('dialogs');
  return <ButtonBar label={t('dialogs:ui.dialogActions')} className={`dialog-actions ${className}`}>{children}</ButtonBar>;
}

export function DialogFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`dialog-footer ${className}`.trim()}>{children}</div>;
}
