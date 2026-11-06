'use client';

import type { ReactNode } from 'react';
import { TooltipButton } from './TooltipButton';

/** One binary mode control, shared by preview and history. */
export function ModeSwitch({ checked, onToggle, label, start, end, disabled = false, reason, className = '', children, showTooltip = true }: {
  checked: boolean; onToggle: () => void; label: string; start: ReactNode; end: ReactNode; disabled?: boolean; reason?: string; className?: string; children?: ReactNode; showTooltip?: boolean;
}) {
  return <TooltipButton className={`group/mode mode-switch ${className}`} type="button" role="switch" aria-checked={checked} aria-label={label} tooltip={showTooltip ? reason ?? label : null} disabled={disabled} onClick={() => { if (!disabled) onToggle(); }}>
    {children}
    {start != null ? <span aria-hidden="true">{start}</span> : null}<span className="mode-switch-track" aria-hidden="true"><span className="mode-switch-thumb" /></span>{end != null ? <span aria-hidden="true">{end}</span> : null}
  </TooltipButton>;
}
