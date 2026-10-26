export const EDITOR_MIN_PANEL_PX = 360;
export const EDITOR_SPLITTER_PX = 12;

export type EditorSplitLimits = {
  usableWidth: number;
  minimumRatio: number;
  maximumRatio: number;
};

export function getEditorSplitLimits(containerWidth: number, minimumPanel = EDITOR_MIN_PANEL_PX): EditorSplitLimits | null {
  const usableWidth = containerWidth - EDITOR_SPLITTER_PX;
  if (!Number.isFinite(containerWidth) || usableWidth < minimumPanel * 2) return null;
  const minimumRatio = (minimumPanel / usableWidth) * 100;
  return { usableWidth, minimumRatio, maximumRatio: 100 - minimumRatio };
}

export function clampEditorSourceRatio(containerWidth: number, ratio: number, minimumPanel = EDITOR_MIN_PANEL_PX): number {
  const limits = getEditorSplitLimits(containerWidth, minimumPanel);
  if (!limits || !Number.isFinite(ratio)) return 50;
  return Math.max(limits.minimumRatio, Math.min(limits.maximumRatio, ratio));
}

export function getEditorSourceWidth(containerWidth: number, ratio: number, minimumPanel = EDITOR_MIN_PANEL_PX): number {
  const limits = getEditorSplitLimits(containerWidth, minimumPanel);
  if (!limits) return 0;
  return limits.usableWidth * clampEditorSourceRatio(containerWidth, ratio, minimumPanel) / 100;
}

export function editorSourceRatioFromPointer(clientX: number, containerLeft: number, containerWidth: number, minimumPanel = EDITOR_MIN_PANEL_PX): number {
  const limits = getEditorSplitLimits(containerWidth, minimumPanel);
  if (!limits) return 50;
  const sourceWidth = clientX - containerLeft - EDITOR_SPLITTER_PX / 2;
  return clampEditorSourceRatio(containerWidth, sourceWidth / limits.usableWidth * 100, minimumPanel);
}

export function resizeEditorSourceRatio(containerWidth: number, currentRatio: number, key: string, minimumPanel = EDITOR_MIN_PANEL_PX): number | null {
  const limits = getEditorSplitLimits(containerWidth, minimumPanel);
  if (!limits) return null;
  if (key === 'Home') return limits.minimumRatio;
  if (key === 'End') return limits.maximumRatio;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return clampEditorSourceRatio(containerWidth, currentRatio - 2, minimumPanel);
  if (key === 'ArrowRight' || key === 'ArrowDown') return clampEditorSourceRatio(containerWidth, currentRatio + 2, minimumPanel);
  return null;
}
