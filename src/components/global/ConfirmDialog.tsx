import type { ReactNode } from 'react';
import type { ButtonProps } from './Button';
import { DialogActions, DialogButton, DialogFooter, DialogFrame, DialogHeader, type DialogFrameProps } from './DialogFrame';

type ConfirmationAction = Pick<ButtonProps, 'disabled' | 'onClick' | 'autoFocus'> & { label: ReactNode };

export function ConfirmDialog({ title, eyebrow, closeDisabled, cancel, confirm, children, ...frame }: DialogFrameProps & {
  title: string; eyebrow: string; closeDisabled?: boolean;
  cancel: ConfirmationAction;
  confirm: ConfirmationAction & Required<Pick<ButtonProps, 'icon'>> & Pick<ButtonProps, 'variant'>;
}) {
  const { label: cancelLabel, ...cancelProps } = cancel;
  const { label: confirmLabel, ...confirmProps } = confirm;
  return <DialogFrame {...frame}>
    <DialogHeader titleId={frame.titleId} eyebrow={eyebrow} title={title} onClose={frame.onClose} closeDisabled={closeDisabled} />
    {children}
    <DialogFooter><DialogActions>
      <DialogButton {...cancelProps} icon="close">{cancelLabel}</DialogButton>
      <DialogButton variant="primary" {...confirmProps}>{confirmLabel}</DialogButton>
    </DialogActions></DialogFooter>
  </DialogFrame>;
}
