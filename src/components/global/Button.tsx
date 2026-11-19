import type { ComponentPropsWithRef, ReactNode } from 'react';
import { ContentIcon, type ContentIconName } from './ContentIcon';

export type ButtonVariant = 'quiet' | 'primary' | 'danger';

const variants: Record<ButtonVariant, string> = {
  quiet: 'button button-quiet',
  primary: 'button button-primary',
  danger: 'button button-danger',
};

export type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: ButtonVariant;
  icon?: ContentIconName;
  label?: ReactNode;
};

export function Button({ variant = 'quiet', icon, label, type = 'button', className, children, ...props }: ButtonProps) {
  const classes = className ? `${variants[variant]} ${className}` : variants[variant];
  return <button {...props} type={type} className={classes}>{icon ? <ContentIcon name={icon} /> : null}{label ?? children}</button>;
}
