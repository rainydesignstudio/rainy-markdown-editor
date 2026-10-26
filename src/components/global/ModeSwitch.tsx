'use client';

import type { ReactNode } from 'react';
import { TooltipButton } from './TooltipButton';

/** One binary mode control, shared by preview and history. */
export function ModeSwitch({ checked, onToggle, label, start, end, disabled = false, reason }: {
  checked: boolean; onToggle: () => void; label: string; start: ReactNode; end: ReactNode; disabled?: boolean; reason?: string;
}) {
  return <TooltipButton className="group/mode mode-switch" type="button" role="switch" aria-checked={checked} aria-label={label} tooltip={reason ?? label} disabled={disabled} onClick={() => { if (!disabled) onToggle(); }}>
    {start != null ? <span aria-hidden="true">{start}</span> : null}<span className="mode-switch-track" aria-hidden="true"><span className="mode-switch-thumb" /></span>{end != null ? <span aria-hidden="true">{end}</span> : null}
  </TooltipButton>;
}
