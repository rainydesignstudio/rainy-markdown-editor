'use client';

import { useEffect, useRef, type RefObject } from 'react';

function getFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.getAttribute('aria-hidden') !== 'true');
}

export function useDialogFocus(dialogRef: RefObject<HTMLElement | null>, onClose: () => void, active = true): void {
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef<HTMLElement | null | undefined>(undefined);
  onCloseRef.current = onClose;

  // Suspending a parent for its child must preserve the child's opener.
  // Restore the original opener only when this dialog actually unmounts.
  useEffect(() => () => {
    if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
  }, []);

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (returnFocusRef.current === undefined) returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let cancelled = false;
    const focusFrame = window.requestAnimationFrame(() => {
      if (cancelled || !dialog.isConnected) return;
      if (document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement)) return;
      const autofocus = dialog.querySelector<HTMLElement>('[autofocus]');
      (autofocus ?? getFocusableElements(dialog)[0] ?? dialog).focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [dialogRef, active]);
}
