'use client';

import { createPortal } from 'react-dom';
import type { useResizableColumns } from '../../hooks/useResizableColumns';

export function ColumnSplitter({ layout, label, controls, showSizes = false }: { layout: ReturnType<typeof useResizableColumns>; label: string; controls?: string; showSizes?: boolean }) {
  if (!layout.wideEnough) return null;
  return <><button className="editor-splitter" type="button" role="separator" aria-label={label} aria-controls={controls} aria-orientation={layout.axis === 'y' ? 'horizontal' : 'vertical'} data-axis={layout.axis}
    aria-valuemin={Math.ceil(layout.minRatio)} aria-valuemax={Math.floor(layout.maxRatio)} aria-valuenow={Math.round(layout.ratio)} data-dragging={layout.dragging}
    onPointerDown={layout.startDrag} onPointerMove={layout.moveDrag} onPointerUp={layout.stopDrag} onPointerCancel={layout.stopDrag} onLostPointerCapture={layout.stopDrag} onKeyDown={layout.keyResize}>
      {showSizes && layout.resizing && layout.axis === 'x' ? <>
        <span data-split-size="source" aria-hidden="true" className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 whitespace-nowrap rounded-l-md border border-line-strong bg-popup-bg px-2 py-1 font-mono text-xs tabular-nums text-popup-text shadow-(--editor-popup-shadow)">{Math.round(layout.sourceWidth)} px</span>
        <span data-split-size="preview" aria-hidden="true" className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 whitespace-nowrap rounded-r-md border border-line-strong bg-popup-bg px-2 py-1 font-mono text-xs tabular-nums text-popup-text shadow-(--editor-popup-shadow)">{Math.round(layout.previewWidth)} px</span>
      </> : null}
    </button>
    {/* Keep the drag in this document without changing an iframe's hit-testing state. */}
    {layout.dragging ? createPortal(<div aria-hidden="true" data-column-drag-shield data-axis={layout.axis} className="data-[axis=y]:cursor-row-resize fixed inset-0 z-90 cursor-col-resize touch-none select-none" onPointerMove={layout.moveDrag} onPointerUp={layout.stopDrag} onPointerCancel={layout.stopDrag} />, document.body) : null}
  </>;
}
