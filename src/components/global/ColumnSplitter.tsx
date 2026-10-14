'use client';

import { createPortal } from 'react-dom';
import type { useResizableColumns } from '../../hooks/useResizableColumns';

export function ColumnSplitter({ layout, label, controls }: { layout: ReturnType<typeof useResizableColumns>; label: string; controls?: string }) {
  if (!layout.wideEnough) return null;
  return <><button className="editor-splitter" type="button" role="separator" aria-label={label} aria-controls={controls} aria-orientation="vertical"
    aria-valuemin={Math.ceil(layout.minRatio)} aria-valuemax={Math.floor(layout.maxRatio)} aria-valuenow={Math.round(layout.ratio)} data-dragging={layout.dragging}
    onPointerDown={layout.startDrag} onPointerMove={layout.moveDrag} onPointerUp={layout.stopDrag} onPointerCancel={layout.stopDrag} onLostPointerCapture={layout.stopDrag} onKeyDown={layout.keyResize}><span /></button>
    {/* Keep the drag in this document without changing an iframe's hit-testing state. */}
    {layout.dragging ? createPortal(<div aria-hidden="true" data-column-drag-shield className="fixed inset-0 z-90 cursor-col-resize touch-none select-none" onPointerMove={layout.moveDrag} onPointerUp={layout.stopDrag} onPointerCancel={layout.stopDrag} />, document.body) : null}
  </>;
}
