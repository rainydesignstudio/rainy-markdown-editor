import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { TooltipButton } from './TooltipButton';

/** The asset-card frame also accommodates independently interactive research regions. */
export function LibraryCardFrame({ className = '', children, ...props }: HTMLAttributes<HTMLElement>) {
  return <article {...props} className={`group relative grid min-w-0 content-start overflow-hidden rounded-lg border border-line bg-panel shadow-panel transition duration-300 hover:border-accent-line data-[selected=true]:border-accent-line data-[selected=true]:bg-accent-soft ${className}`}>{children}</article>;
}

export function LibraryCard({ icon, title, titleClassName = 'truncate font-sub-heading text-sm font-semibold text-primary', collapsed = false, children, className = '', ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> & { icon: ReactNode; title: ReactNode; titleClassName?: string; collapsed?: boolean }) {
  const label = props['aria-label'] ?? (typeof title === 'string' ? title : undefined);
  return <TooltipButton {...props} type="button" aria-label={label} tooltip={label} data-collapsed={collapsed} className={`group flex w-full min-w-0 items-start gap-3 rounded-lg border border-transparent p-3 text-left transition-colors hover:border-line hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent aria-pressed:border-accent-line aria-pressed:bg-accent-soft data-[collapsed=true]:justify-center data-[collapsed=true]:gap-0 data-[collapsed=true]:p-2 ${className}`}>
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-panel text-muted group-aria-pressed:border-accent-line group-aria-pressed:text-accent-text">{icon}</span>
    {!collapsed ? <span className="grid min-w-0 flex-1 gap-1"><span className={titleClassName}>{title}</span>{children}</span> : null}
  </TooltipButton>;
}

export function LibraryCardGrid({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  // Geometry rationale: research cards need an 18rem readable excerpt; min(100%,18rem) keeps narrow containers within their own width.
  return <div {...props} className={`grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] content-start items-start gap-3 ${className}`} />;
}
