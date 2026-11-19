'use client';

import { createContext, useContext, type ButtonHTMLAttributes, type ReactNode } from 'react';

export const ActionMenuContext = createContext(false);
export const ActionMenuAnchorContext = createContext<{ anchor: () => HTMLElement | null; close: () => void } | null>(null);
import { TooltipButton } from './TooltipButton';
import { ContentIcon, type IconGraphic } from './ContentIcon';

const tones = { default: '', danger: 'text-danger' };
const variants = {
  preference: 'mode-picker-trigger',
  surface: 'button button-quiet icon-button-surface icon-button-toggle',
  primary: 'button button-primary icon-button-surface',
  inline: 'icon-button-inline',
  history: 'button button-quiet icon-button-surface history-retain',
  toolbar: 'toolbar-icon-button aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
  toolbarPrimary: 'toolbar-icon-button toolbar-icon-button--primary aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
  dialog: 'button button-quiet size-10 p-0',
  danger: 'button button-danger icon-button-surface',
};

/** Shared compact action: fixed square, existing button theme and tooltip behavior. */
export function IconButton({ icon, label, tooltip = label, tone = 'default', variant = 'surface', className = '', children, menuLabel, shortcut, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconGraphic; label?: string; tooltip?: ReactNode; menuLabel?: ReactNode; shortcut?: string; tone?: 'default' | 'danger'; variant?: keyof typeof variants; as?: 'button' | 'summary';
}) {
  const menu = useContext(ActionMenuContext);
  const graphic = typeof icon === 'string' ? <ContentIcon name={icon} /> : icon;
  const accessibleLabel = props['aria-label'] ?? label ?? (typeof tooltip === 'string' ? tooltip : undefined);
  if (menu) return <TooltipButton {...props} tooltip={tooltip} role="menuitem" aria-label={accessibleLabel}
    className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-popup-text hover:bg-hover aria-pressed:bg-accent-soft aria-pressed:text-accent-text disabled:opacity-50">
    {graphic}<span className="flex-1">{menuLabel ?? tooltip}</span>{shortcut ? <kbd className="whitespace-nowrap font-mono text-2xs text-faint">{shortcut}</kbd> : null}{props['aria-pressed'] ? <span aria-hidden="true">✓</span> : null}{children}
  </TooltipButton>;
  return <TooltipButton {...props} tooltip={tooltip} aria-label={accessibleLabel}
    className={`icon-button ${variants[variant]} ${tones[tone]} ${className}`}>
    {graphic}{children}
  </TooltipButton>;
}
