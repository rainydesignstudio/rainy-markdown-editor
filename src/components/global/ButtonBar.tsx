import type { ComponentPropsWithRef } from 'react';

export function ButtonBar({ label, className = '', children, ...props }: ComponentPropsWithRef<'div'> & { label: string }) {
  return <div {...props} className={`button-bar ${className}`.trim()} role="group" aria-label={label}>{children}</div>;
}
