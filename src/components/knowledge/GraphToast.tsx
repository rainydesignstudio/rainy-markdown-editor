'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createToastItem, ToastCard, type ToastItem, type ToastLifetime, type ToastTone } from '../global/Toast';

/** Local positioning remains with the graph; presentation and clocks are shared with global feedback. */
export function GraphToast({ label, details, tone, onClose, duration = 5000, locked = false, revealDetails }: {
  label: string; details?: string; tone: ToastTone; onClose: () => void; duration?: 5000 | null; locked?: boolean; revealDetails?: number;
}) {
  const lifetime: ToastLifetime = locked ? { mode: 'locked' } : duration === null ? { mode: 'manual' } : { mode: 'auto', durationMs: duration };
  const [runtime, setRuntime] = useState<ToastItem>({ id: 0, key: 'graph-feedback', label, tone, lifetime });
  const [exiting, setExiting] = useState(false), sequence = useRef(0), closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const item = createToastItem({ key: 'graph-feedback', label: '', tone, lifetime: locked ? { mode: 'locked' } : duration === null ? { mode: 'manual' } : { mode: 'auto', durationMs: duration } }, ++sequence.current);
    setRuntime(item); setExiting(false);
    return () => { if (item.ownsCountdown) item.countdown?.dispose(); };
  }, [duration, locked]);
  const dismiss = useCallback(() => { if (!locked) setExiting(true); }, [locked]);
  const remove = useCallback(() => closeRef.current(), []);
  return <div data-graph-toast className="pointer-events-auto flex w-full justify-end"><ToastCard item={{ ...runtime, label, details, tone, lifetime, exiting }} dismiss={dismiss} remove={remove} enterFrom="right" revealDetails={revealDetails} /></div>;
}
