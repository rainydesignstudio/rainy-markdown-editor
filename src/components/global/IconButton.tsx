'use client';

import { createContext, useContext, type ButtonHTMLAttributes, type ReactNode } from 'react';

export const ActionMenuContext = createContext(false);
export const ActionMenuAnchorContext = createContext<{ anchor: () => HTMLElement | null; close: () => void } | null>(null);
import { TooltipButton } from './TooltipButton';

const tones = { default: '', danger: 'text-danger' };
const variants = {
  preference: 'mode-picker-trigger',
  surface: 'button button-quiet icon-button-surface icon-button-toggle',
  primary: 'button button-primary icon-button-surface',
  inline: 'icon-button-inline',
  history: 'button button-quiet icon-button-surface history-retain',
};

/** Shared compact action: fixed square, existing button theme and tooltip behavior. */
export function IconButton({ icon, tooltip, tone = 'default', variant = 'surface', className = '', children, menuLabel, shortcut, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode; tooltip: ReactNode; menuLabel?: ReactNode; shortcut?: string; tone?: 'default' | 'danger'; variant?: keyof typeof variants; as?: 'button' | 'summary';
}) {
  const menu = useContext(ActionMenuContext);
  if (menu) return <TooltipButton {...props} tooltip={tooltip} role="menuitem" aria-label={props['aria-label'] ?? (typeof tooltip === 'string' ? tooltip : undefined)}
    className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-popup-text hover:bg-hover aria-pressed:bg-accent-soft aria-pressed:text-accent-text disabled:opacity-50">
    {icon}<span className="flex-1">{menuLabel ?? tooltip}</span>{shortcut ? <kbd className="whitespace-nowrap font-mono text-2xs text-faint">{shortcut}</kbd> : null}{props['aria-pressed'] ? <span aria-hidden="true">✓</span> : null}{children}
  </TooltipButton>;
  return <TooltipButton {...props} tooltip={tooltip} aria-label={props['aria-label'] ?? (typeof tooltip === 'string' ? tooltip : undefined)}
    className={`icon-button ${variants[variant]} ${tones[tone]} ${className}`}>
    {icon}{children}
  </TooltipButton>;
}
