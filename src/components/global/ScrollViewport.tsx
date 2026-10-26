'use client';

import { forwardRef, type ForwardedRef, type HTMLAttributes, type TextareaHTMLAttributes } from 'react';

type Props = ({ as?: 'div' } & HTMLAttributes<HTMLDivElement> | { as: 'textarea' } & TextareaHTMLAttributes<HTMLTextAreaElement>) & { horizontal?: boolean };

export const ScrollViewport = forwardRef<HTMLDivElement | HTMLTextAreaElement, Props>(function ScrollViewport({ as = 'div', horizontal = false, className = '', ...props }, ref) {
  const classes = `min-h-0 min-w-0 ${horizontal ? 'overflow-x-auto' : 'overflow-x-clip'} overflow-y-auto scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent scrollbar-gutter-stable ${className}`;
  return as === 'textarea'
    ? <textarea {...props as TextareaHTMLAttributes<HTMLTextAreaElement>} ref={ref as ForwardedRef<HTMLTextAreaElement>} data-scroll-viewport="true" className={classes} />
    : <div {...props as HTMLAttributes<HTMLDivElement>} ref={ref as ForwardedRef<HTMLDivElement>} data-scroll-viewport="true" className={classes} />;
});
