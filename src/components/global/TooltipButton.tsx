'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Render outside scroll/clipping containers; only the anchor geometry is dynamic.
export function TooltipButton({ as: Trigger = 'button', tooltip, animated = false, children, onClick, onFocus, onBlur, onPointerEnter, onPointerLeave, ...props }: ButtonHTMLAttributes<HTMLElement> & { tooltip: ReactNode; as?: 'button' | 'summary'; animated?: boolean }) {
  const id = useId();
  const buttonRef = useRef<HTMLElement>(null);
  const disabledRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; bottom: number } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const hasTooltip = tooltip != null && tooltip !== false && tooltip !== '';
  const lastTooltip = useRef(tooltip);
  if (hasTooltip) lastTooltip.current = tooltip;
  const hide = () => {
    if (!animated) { setAnchor(null); return; }
    setVisible(false); setClosing(true);
  };
  const show = () => {
    if (!hasTooltip) return;
    const rect = (props.disabled ? disabledRef.current : buttonRef.current)?.getBoundingClientRect();
    if (rect) { setClosing(false); setAnchor({ left: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom }); }
  };
  const present = anchor !== null;
  useEffect(() => { if (animated && present && !hasTooltip) hide(); }, [animated, present, hasTooltip]);
  useEffect(() => {
    if (!animated || !present || closing) return;
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [animated, present, closing]);
  useEffect(() => {
    if (!animated || !closing) return;
    const timer = window.setTimeout(() => { setAnchor(null); setPosition(null); setClosing(false); }, 150);
    return () => window.clearTimeout(timer);
  }, [animated, closing]);
  useEffect(() => {
    if (!animated || !present || closing) return;
    let frame = 0;
    const track = () => {
      const rect = (props.disabled ? disabledRef.current : buttonRef.current)?.getBoundingClientRect();
      if (rect) setAnchor(previous => previous && previous.left === rect.left + rect.width / 2 && previous.top === rect.top && previous.bottom === rect.bottom ? previous : { left: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
      frame = window.requestAnimationFrame(track);
    };
    frame = window.requestAnimationFrame(track);
    return () => window.cancelAnimationFrame(frame);
  }, [animated, present, closing, props.disabled]);
  useLayoutEffect(() => {
    if (!anchor || !tooltipRef.current) return;
    const element = tooltipRef.current;
    const place = () => {
      const rect = element.getBoundingClientRect();
      let width = rect.width, height = rect.height;
      if (animated && contentRef.current) {
        const content = contentRef.current.getBoundingClientRect(), css = getComputedStyle(element);
        const value = (key: string) => Number.parseFloat(css.getPropertyValue(key)) || 0;
        width = content.width + value('padding-left') + value('padding-right') + value('border-left-width') + value('border-right-width');
        height = content.height + value('padding-top') + value('padding-bottom') + value('border-top-width') + value('border-bottom-width');
        setDimensions(previous => previous?.width === width && previous.height === height ? previous : { width, height });
      }
      const next = { left: Math.max(8, Math.min(anchor.left - width / 2, window.innerWidth - width - 8)), top: anchor.bottom + height + 16 > window.innerHeight ? Math.max(8, anchor.top - height - 8) : anchor.bottom + 8 };
      setPosition(previous => previous?.left === next.left && previous.top === next.top ? previous : next);
    };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(animated && contentRef.current ? contentRef.current : element);
    return () => observer?.disconnect();
  }, [anchor, tooltip, animated]);
  useEffect(() => {
    if (!anchor || !hasTooltip) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('keydown', key);
    };
  }, [anchor, hasTooltip, animated]);
  const description = [props['aria-describedby'], anchor && hasTooltip ? id : null].filter(Boolean).join(' ') || undefined;
  const button = <Trigger {...props} style={props.disabled ? undefined : props.style} ref={(node: HTMLElement | null) => { buttonRef.current = node; }} type={Trigger === 'button' ? props.type ?? 'button' : undefined} className={props.disabled ? 'contents [text-align:inherit]' : props.className} aria-hidden={props.disabled ? true : props['aria-hidden']} aria-describedby={description}
      onPointerEnter={event => { onPointerEnter?.(event); if (event.pointerType !== 'touch' && !event.defaultPrevented) show(); }}
      onPointerLeave={event => { hide(); onPointerLeave?.(event); }}
      onFocus={event => { onFocus?.(event); if (!event.defaultPrevented) show(); }}
      onBlur={event => { hide(); onBlur?.(event); }}
      onClick={event => { hide(); if (props.disabled) { event.preventDefault(); event.stopPropagation(); return; } onClick?.(event); }}>{children}</Trigger>;
  return <>
    {props.disabled ? <span ref={disabledRef} role={props.role ?? 'button'} aria-current={props['aria-current']} aria-checked={props['aria-checked']} aria-pressed={props['aria-pressed']} aria-haspopup={props['aria-haspopup']} aria-expanded={props['aria-expanded']} aria-controls={props['aria-controls']} aria-disabled="true" aria-label={props['aria-label'] ?? (typeof tooltip === 'string' ? tooltip : undefined)} aria-describedby={description} tabIndex={props.tabIndex ?? 0} style={props.style} className={`${props.className ?? ''} inline-flex shrink-0 aria-disabled:pointer-events-auto focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-accent`}
      onPointerEnter={event => { if (event.pointerType !== 'touch') show(); }} onPointerLeave={hide} onFocus={show} onBlur={hide} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); } }}>{button}</span> : button}
    {anchor && (hasTooltip || animated) && typeof document !== 'undefined' ? createPortal(<span ref={tooltipRef} id={id} role="tooltip" data-animated={animated} data-positioned={position !== null} data-open={position !== null && (!animated || visible)} aria-hidden={!position || animated && closing}
      className="pointer-events-none fixed z-70 w-max max-w-xs wrap-anywhere rounded-md border border-line-strong bg-popup-bg px-2.5 py-1.5 text-xs font-medium text-popup-text shadow-(--editor-popup-shadow) data-[positioned=false]:invisible data-[animated=true]:transition-[opacity,translate,width,height] data-[animated=true]:duration-150 data-[open=false]:translate-y-1 data-[open=false]:opacity-0"
      style={{ left: position?.left, top: position?.top, width: animated ? dimensions?.width : undefined, height: animated ? dimensions?.height : undefined }}>{animated ? <span ref={contentRef} className="inline-block w-max max-w-64">{hasTooltip ? tooltip : lastTooltip.current}</span> : tooltip}</span>, document.body) : null}
  </>;
}
