'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { TooltipButton } from './TooltipButton';

const tones = { default: '', danger: 'text-danger' };
const variants = {
  preference: 'mode-picker-trigger',
  surface: 'button button-quiet icon-button-surface icon-button-toggle',
  inline: 'icon-button-inline',
  history: 'button button-quiet icon-button-surface history-retain',
};

/** Shared compact action: fixed square, existing button theme and tooltip behavior. */
export function IconButton({ icon, tooltip, tone = 'default', variant = 'surface', className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode; tooltip: ReactNode; tone?: 'default' | 'danger'; variant?: keyof typeof variants; as?: 'button' | 'summary';
}) {
  return <TooltipButton {...props} tooltip={tooltip} aria-label={props['aria-label'] ?? (typeof tooltip === 'string' ? tooltip : undefined)}
    className={`icon-button ${variants[variant]} ${tones[tone]} ${className}`}>
    {icon}{children}
  </TooltipButton>;
}
