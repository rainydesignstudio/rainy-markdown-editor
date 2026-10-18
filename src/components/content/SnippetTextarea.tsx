'use client';

import { formatProductMessage, productText } from "../../lib/i18n/productMessages";

import { useUITranslation } from '../global/UILocaleProvider';

import { findSourceMatches, replaceAllSourceMatches } from '../../lib/sourceSearch';
import { SourceFindBar, FindIcon, type ReplaceAllDecision } from './SourceFindBar';
import { IconButton } from '../global/IconButton';
import { insertUndoableText } from '../../lib/nativeTextareaEdit';
import { sourceOffsetRect, revealSourceRect, visibleSourceGutterDigits, sourceLinePaddingClass, SOURCE_LINE_NUMBER_CLASS } from '../../lib/sourceViewport';
import { formatInlineSelection, inlineFormatShortcut, type InlineFormat } from '../../lib/editor/inlineFormatting';
import { useTextInputHistory } from '../../hooks/useTextInputHistory';

import { forwardRef, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type ClipboardEvent, type CompositionEvent, type DragEvent, type ForwardedRef, type KeyboardEvent, type MutableRefObject, type ReactNode, type UIEvent } from 'react';
import { createPortal } from 'react-dom';
import { findSnippetMenuMatch, findSnippetSpaceExpansion, groupSnippetMatches, snippetTreeRows, prepareSnippetInsertion } from '../../lib/snippetComposer';
import { tokenizeEditorSource } from '../../lib/editorSourceHighlight';
import { logicalSourceLines, sourceLineMessages, sourceLineMessageLevels, type SourceLineConcern } from '../../lib/sourceLineDiagnostics';
import type { ArticleSnippet, SnippetCategory } from '../../lib/types';
import { CategoryIcon } from './SnippetCategoryDialog';

type Props = {
  value: string;
  historyKey?: number;
  snippets: ArticleSnippet[];
  categories?: SnippetCategory[];
  openFindRef?: MutableRefObject<(() => void) | null>;
  openPickerRef?: MutableRefObject<(() => void) | null>;
  insertTextRef?: MutableRefObject<((text: string, caretOffset: number) => boolean) | null>;
  formatSelectionRef?: MutableRefObject<((format: InlineFormat) => boolean) | null>;
  onChange: (value: string) => void;
  onSnippetInserted?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  ariaLabel?: string;
  id?: string;
  sourceFont?: 'article' | 'editor';
  onImportFiles?: (files: File[], selection: Selection) => void | Promise<void>;
  onPasteConflict?: () => void;
  showLineNumbers?: boolean;
  lineOffset?: number;
  sourceHeader?: ReactNode;
  lineConcerns?: ReadonlyMap<number, SourceLineConcern>;
};

const EMPTY_LINE_CONCERNS = new Map<number, SourceLineConcern>();

type Selection = { start: number; end: number };

function imageFilesFromTransfer(transfer: DataTransfer): File[] {
  const fromItems = Array.from(transfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  const files = fromItems.length ? fromItems : Array.from(transfer.files);
  return files.filter((file) => file.type.startsWith('image/') || /\.(?:png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name));
}

function selectionOf(textarea: HTMLTextAreaElement): Selection {
  return { start: textarea.selectionStart, end: textarea.selectionEnd };
}

export function highlightMarkdownSource(value: string): ReactNode[] {
  return tokenizeEditorSource(value).map((segment, index) => segment.tone
    ? <span key={index} className={segment.tone}>{segment.text || <span data-source-padding="true">{'\u200b'}</span>}</span>
    : segment.text || <span key={index} data-source-padding="true">{'\u200b'}</span>);
}

export const SnippetTextarea = forwardRef(function SnippetTextarea(
  { value, historyKey, snippets, categories = [], openFindRef, openPickerRef, insertTextRef, formatSelectionRef, onChange, onSnippetInserted, disabled = false, readOnly = false, ariaLabel: suppliedAriaLabel, id, sourceFont = 'article', onImportFiles, onPasteConflict, showLineNumbers = false, lineOffset = 0, sourceHeader, lineConcerns = EMPTY_LINE_CONCERNS }: Props,
  forwardedRef: ForwardedRef<HTMLTextAreaElement>,
) {
  const { t } = useUITranslation('editor');
  const ariaLabel = suppliedAriaLabel ?? t('editor:source.aria');
  const fontClass = sourceFont === 'article' ? 'font-article-source' : 'font-editor-source';
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLPreElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const tooltipCloseRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pendingSelectionRef = useRef<(Selection & { value: string }) | null>(null);
  const pointerFocusRef = useRef<{ top: number; left: number } | null>(null);
  const reportedValueRef = useRef(value);
  const composingRef = useRef(false);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const selectionRef = useRef<Selection>({ start: 0, end: 0 });
  const [isComposing, setIsComposing] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [activeState, setActiveState] = useState<{ key: string | null; index: number }>({ key: null, index: 0 });
  const [expandedState, setExpandedState] = useState<{ key: string | null; ids: string[] }>({ key: null, ids: [] });
  const [dismissedMatch, setDismissedMatch] = useState<string | null>(null);
  const [insertionIssue, setInsertionIssue] = useState<string | null>(null);
  const [hoveredConcern, setHoveredConcern] = useState<{ line: number; concern: SourceLineConcern; top: number; left: number } | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [focusFindQuery, setFocusFindQuery] = useState(true);
  const findPanelRef = useRef<HTMLDivElement | null>(null);
  const focusFindRef = useRef<(() => void) | null>(null);
  const [replaceAllDecision, setReplaceAllDecision] = useState<ReplaceAllDecision | null>(null);
  const [findQuery, setFindQuery] = useState('');
  const [findReplacement, setFindReplacement] = useState('');
  const [findCase, setFindCase] = useState(false);
  const [findIndex, setFindIndex] = useState(0);
  const found = useMemo(() => findOpen ? findSourceMatches(value, findQuery, findCase) : [], [value, findQuery, findCase, findOpen]);
  const activeFind = Math.min(findIndex, Math.max(0, found.length - 1));
  const selectedFind = findOpen && !isComposing && found[activeFind]?.start === selection.start && found[activeFind]?.end === selection.end;
  const highlightedSource = useMemo(() => {
    const match = findOpen ? found[activeFind] : null;
    if (!match) return highlightMarkdownSource(value);
    const segments = tokenizeEditorSource(value); let offset = 0;
    return segments.flatMap((segment, index) => {
      const start = offset; const end = start + segment.text.length; offset = end;
      if (end <= match.start || start >= match.end) return [<span key={index} className={segment.tone}>{segment.text || <span data-source-padding="true">{'\u200b'}</span>}</span>];
      const left = Math.max(0, match.start - start), right = Math.min(segment.text.length, match.end - start);
      return [<span key={index} className={segment.tone}>{segment.text.slice(0, left)}<mark data-source-find="true" className="rounded-sm bg-search-hit text-search-hit-ink">{segment.text.slice(left, right)}</mark>{segment.text.slice(right)}</span>];
    });
  }, [value, findOpen, found, activeFind]);
  const sourceLines = useMemo(() => logicalSourceLines(value), [value]);
  const [measuredGutterDigits, setGutterDigits] = useState(3);
  const initialGutterDigits = Math.max(3, String(lineOffset + 1).length);
  const maxGutterDigits = Math.max(3, String(lineOffset + sourceLines.length).length);
  const gutterDigits = Math.max(initialGutterDigits, Math.min(measuredGutterDigits, maxGutterDigits));
  const sourceBoxClass = `editor-inner ${fontClass} ${sourceLinePaddingClass(showLineNumbers)}`;
  const gutterNumberClass = SOURCE_LINE_NUMBER_CLASS;
  const measureGutter = () => {
    const viewport = viewportRef.current, rows = gutterRef.current?.firstElementChild?.children;
    if (!showLineNumbers || !viewport?.clientHeight || !rows?.length) return;
    const bottom = viewport.getBoundingClientRect().top + viewport.clientTop + viewport.clientHeight;
    const digits = visibleSourceGutterDigits(rows.length, bottom, index => (rows[index] as HTMLElement).getBoundingClientRect().top, lineOffset);
    // Keep the largest encountered width within a document to avoid threshold
    // oscillation when widening the gutter changes soft wrapping.
    setGutterDigits(previous => Math.max(Math.min(previous, maxGutterDigits), digits));
  };
  useLayoutEffect(() => { setGutterDigits(initialGutterDigits); }, [historyKey, initialGutterDigits]);
  useLayoutEffect(() => {
    measureGutter();
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.addEventListener('toggle', measureGutter, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureGutter);
    observer?.observe(viewport);
    return () => { viewport.removeEventListener('toggle', measureGutter, true); observer?.disconnect(); };
  }, [historyKey, value, showLineNumbers, sourceFont, lineOffset, sourceHeader]);
  const revealCaret = () => {
    const textarea = textareaRef.current, source = sourceRef.current, viewport = viewportRef.current;
    if (!textarea || !source || !viewport) return;
    const offset = textarea.selectionDirection === 'backward' ? textarea.selectionStart : textarea.selectionEnd;
    const rect = sourceOffsetRect(source, offset);
    if (rect) revealSourceRect(viewport, rect);
  };

  const cancelTooltipClose = () => {
    if (tooltipCloseRef.current !== null) window.clearTimeout(tooltipCloseRef.current);
    tooltipCloseRef.current = null;
  };
  const scheduleTooltipClose = () => {
    cancelTooltipClose();
    tooltipCloseRef.current = window.setTimeout(() => setHoveredConcern(null), 150);
  };

  useLayoutEffect(() => {
    cancelTooltipClose();
    setHoveredConcern(null);
    return cancelTooltipClose;
  }, [value, lineConcerns, showLineNumbers]);

  const showConcern = (element: HTMLElement, line: number, concern: SourceLineConcern) => {
    cancelTooltipClose();
    const bounds = element.getBoundingClientRect();
    setHoveredConcern({ line, concern, top: Math.max(8, Math.min(bounds.top, window.innerHeight - 272)), left: Math.max(8, Math.min(bounds.right + 8, window.innerWidth - 272)) });
  };

  const match = useMemo(() => selection.start === selection.end
    ? findSnippetMenuMatch(value, selection.start, snippets, isComposing)
    : null, [isComposing, selection, snippets, value]);
  const matchKey = match ? `${match.start}:${match.query}` : null;
  const visibleMatch = !findOpen && match && matchKey !== dismissedMatch ? match : null;
  const groups = visibleMatch ? groupSnippetMatches(visibleMatch.items, categories) : [];
  const expanded = expandedState.key === matchKey ? expandedState.ids : visibleMatch?.query ? groups.map(group => group.id) : [];
  const rows = snippetTreeRows(groups, expanded);
  const initialIndex = visibleMatch?.query ? Math.max(0, rows.findIndex(row => row.snippet)) : 0;
  const safeActiveIndex = Math.min(activeState.key === matchKey ? activeState.index : initialIndex, Math.max(0, rows.length - 1));
  const activeRow = rows[safeActiveIndex];
  const activeSnippet = activeRow?.snippet;
  const setActiveIndex = (index: number) => setActiveState({ key: matchKey, index });
  const toggleGroup = (id: string, open = !expanded.includes(id)) => setExpandedState({ key: matchKey, ids: open ? [...expanded.filter(item => item !== id), id] : expanded.filter(item => item !== id) });

  const restoreSelection = (target: HTMLTextAreaElement, next: Selection) => {
    target.setSelectionRange(next.start, next.end);
    selectionRef.current = next;
    setSelection(next);
    revealCaret();
  };

  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    const textarea = textareaRef.current;
    if (!pending || !textarea || pending.value !== value) return;
    pendingSelectionRef.current = null;
    if (document.activeElement === textarea) restoreSelection(textarea, pending);
  }, [value]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.scrollTop = 0;
    textarea.scrollLeft = 0;
    if (!pointerFocusRef.current && document.activeElement === textarea && textarea.selectionStart === textarea.selectionEnd) revealCaret();
  }, [showLineNumbers, sourceFont, value]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const option = menu?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (!menu || !option) return;
    const bounds = menu.getBoundingClientRect();
    const selectedBounds = option.getBoundingClientRect();
    const visibleTop = bounds.top + menu.clientTop + (menu.firstElementChild as HTMLElement).offsetHeight;
    const visibleBottom = bounds.top + menu.clientTop + menu.clientHeight;
    // Scroll only this popup, preserving the editor's position and keyboard focus.
    if (selectedBounds.top < visibleTop) menu.scrollTop -= visibleTop - selectedBounds.top;
    else if (selectedBounds.bottom > visibleBottom) menu.scrollTop += selectedBounds.bottom - visibleBottom;
  }, [activeRow?.id, matchKey]);

  const rememberSelection = (target: HTMLTextAreaElement) => {
    const next = selectionOf(target);
    const changed = selectionRef.current.start !== next.start || selectionRef.current.end !== next.end;
    selectionRef.current = next;
    setSelection(previous => previous.start === next.start && previous.end === next.end ? previous : next);
    return changed;
  };

  const sourceHistory = useTextInputHistory(textareaRef, value, next => {
    reportedValueRef.current = next;
    if (textareaRef.current) rememberSelection(textareaRef.current);
    setDismissedMatch(null);
    setActiveState({ key: null, index: 0 });
    setInsertionIssue(null);
    onChange(next);
  }, readOnly, historyKey);

  const importTransferFiles = (files: File[], target: HTMLTextAreaElement) => {
    if (!files.length || disabled || readOnly || !onImportFiles) return;
    void onImportFiles(files, selectionOf(target));
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = imageFilesFromTransfer(event.clipboardData);
    if (!files.length) return;
    if (event.clipboardData.getData('text/plain').trim()) {
      onPasteConflict?.();
      return;
    }
    event.preventDefault();
    importTransferFiles(files, event.currentTarget);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || readOnly || !Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragActive(true);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    setIsDragActive(false);
    const files = imageFilesFromTransfer(event.dataTransfer);
    if (!files.length || disabled || readOnly) return;
    event.preventDefault();
    const target = textareaRef.current;
    if (!target) return;
    selectionRef.current = selectionOf(target);
    importTransferFiles(files, target);
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.currentTarget.value;
    pointerFocusRef.current = null;
    if (findOpen && event.currentTarget.selectionStart === event.currentTarget.selectionEnd
      && findSnippetMenuMatch(nextValue, event.currentTarget.selectionStart, snippets, composingRef.current)) {
      setFindOpen(false); setReplaceAllDecision(null);
    }
    if (pendingSelectionRef.current?.value !== nextValue) pendingSelectionRef.current = null;
    reportedValueRef.current = nextValue;
    rememberSelection(event.currentTarget);
    setDismissedMatch(null);
    setActiveState({ key: null, index: 0 });
    setInsertionIssue(null);
    sourceHistory.events.onChange(event);
  };

  const commitInsertion = (insertion: { text: string; caretOffset: number; selectionEndOffset?: number }, start: number, end: number): boolean => {
    const textarea = textareaRef.current;
    if (!textarea || disabled || readOnly || composingRef.current) return false;
    const previous = textarea.value;
    const expected = `${previous.slice(0, start)}${insertion.text}${previous.slice(end)}`;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(start, end);
    reportedValueRef.current = previous;
    const nextCaret = start + insertion.caretOffset;
    const nextEnd = start + (insertion.selectionEndOffset ?? insertion.caretOffset);
    pendingSelectionRef.current = { value: expected, start: nextCaret, end: nextEnd };

    if (!insertUndoableText(textarea, insertion.text, start, end, () => reportedValueRef.current, previous => {
      reportedValueRef.current = previous;
      onChange(previous);
    })) {
      pendingSelectionRef.current = null;
      setInsertionIssue(productText("uiFeedback.undoableEditFailed"));
      restoreSelection(textarea, { start, end });
      return false;
    }

    setInsertionIssue(null);
    restoreSelection(textarea, { start: nextCaret, end: nextEnd });
    sourceHistory.finishInsertion();
    setDismissedMatch(null);
    setActiveState({ key: null, index: 0 });
    return true;
  };

  const formatSelection = (format: InlineFormat) => {
    const textarea = textareaRef.current;
    if (!textarea || disabled || readOnly || composingRef.current) return false;
    const plan = formatInlineSelection(textarea.value, textarea.selectionStart, textarea.selectionEnd, format);
    return commitInsertion(plan, plan.start, plan.end);
  };
  useLayoutEffect(() => {
    if (!formatSelectionRef) return;
    formatSelectionRef.current = formatSelection;
    return () => { formatSelectionRef.current = null; };
  }, [formatSelectionRef, disabled, readOnly, value]);

  const commitSnippet = (snippet: ArticleSnippet, start: number, end: number, compile = true) => {
    const inserted = commitInsertion(prepareSnippetInsertion(snippet.content.replace(/\r\n?/g, '\n'), textareaRef.current?.value ?? value, start), start, end);
    if (inserted && compile) onSnippetInserted?.();
    return inserted;
  };

  useLayoutEffect(() => {
    if (!insertTextRef) return;
    insertTextRef.current = (text, caretOffset) => {
      const textarea = textareaRef.current;
      return Boolean(textarea && commitInsertion({ text, caretOffset }, textarea.selectionStart, textarea.selectionEnd));
    };
    return () => { insertTextRef.current = null; };
  }, [insertTextRef, disabled, readOnly, value]);

  useLayoutEffect(() => {
    if (!openPickerRef) return;
    openPickerRef.current = () => {
      const textarea = textareaRef.current;
      if (textarea && commitSnippet({ id: 'picker', name: '', description: '', trigger: '//picker', content: '//' }, textarea.selectionStart, textarea.selectionEnd, false)) {
        setFindOpen(false); setReplaceAllDecision(null);
      }
    };
    return () => { openPickerRef.current = null; };
  }, [openPickerRef, disabled, readOnly, value]);

  const openFind = () => {
    const textarea = textareaRef.current;
    if (textarea && textarea.selectionStart !== textarea.selectionEnd) {
      const chosen = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
      if (!chosen.includes('\n')) setFindQuery(chosen);
    }
    setFocusFindQuery(true);
    setFindOpen(true);
    focusFindRef.current?.();
  };
  const closeFind = () => { setFindOpen(false); setReplaceAllDecision(null); if (!disabled) textareaRef.current?.focus({ preventScroll: true }); };
  const moveFind = (direction: 1 | -1) => {
    if (!findQuery) { openFind(); return; }
    const matches = findOpen ? found : findSourceMatches(value, findQuery, findCase);
    if (!findOpen) { setFocusFindQuery(false); setFindOpen(true); }
    if (!matches.length) return;
    const index = (Math.min(findIndex, matches.length - 1) + direction + matches.length) % matches.length;
    setFindIndex(index);
    const textarea = textareaRef.current;
    if (textarea) { textarea.setSelectionRange(matches[index].start, matches[index].end); rememberSelection(textarea); }
  };
  const replaceCurrent = () => {
    const item = found[activeFind];
    if (item) commitInsertion({ text: findReplacement, caretOffset: findReplacement.length }, item.start, item.end);
  };
  const requestReplaceAll = () => {
    if (disabled || readOnly || composingRef.current || !found.length) return;
    setReplaceAllDecision({ source: value, query: findQuery, replacement: findReplacement, matchCase: findCase, count: found.length });
  };
  const confirmReplaceAll = () => {
    if (!replaceAllDecision || disabled || readOnly || composingRef.current) return;
    if (replaceAllDecision.source !== value || replaceAllDecision.query !== findQuery || replaceAllDecision.replacement !== findReplacement || replaceAllDecision.matchCase !== findCase) {
      setReplaceAllDecision({ source: value, query: findQuery, replacement: findReplacement, matchCase: findCase, count: found.length, changed: true });
      return;
    }
    const next = replaceAllSourceMatches(value, findQuery, findReplacement, findCase);
    if (next === value || commitInsertion({ text: next, caretOffset: Math.min(selectionRef.current.start, next.length) }, 0, value.length)) setReplaceAllDecision(null);
  };
  useLayoutEffect(() => {
    if (replaceAllDecision && (replaceAllDecision.source !== value || replaceAllDecision.query !== findQuery || replaceAllDecision.replacement !== findReplacement || replaceAllDecision.matchCase !== findCase)) {
      setReplaceAllDecision({ source: value, query: findQuery, replacement: findReplacement, matchCase: findCase, count: found.length, changed: true });
    }
  }, [replaceAllDecision, value, findQuery, findReplacement, findCase, found.length]);
  useLayoutEffect(() => {
    if (!openFindRef) return;
    openFindRef.current = openFind;
    return () => { openFindRef.current = null; };
  }, [openFindRef, value]);
  useLayoutEffect(() => {
    const viewport = viewportRef.current, highlight = highlightRef.current;
    if (!findOpen || !found.length || !viewport || !highlight) return;
    const centerHit = () => {
      const markers = highlight.querySelectorAll<HTMLElement>('[data-source-find]');
      if (!markers.length) return;
      const first = markers[0].getBoundingClientRect(), last = markers[markers.length - 1].getBoundingClientRect();
      const top = Math.min(first.top, last.top), bottom = Math.max(first.bottom, last.bottom);
      const obscuredTop = Math.max(0, (findPanelRef.current?.getBoundingClientRect().bottom ?? 0) - viewport.getBoundingClientRect().top);
      revealSourceRect(viewport, { top, bottom, height: bottom - top }, 'center', obscuredTop);
    };
    centerHit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(centerHit);
    observer?.observe(viewport); observer?.observe(highlight);
    return () => observer?.disconnect();
  }, [findOpen, found, activeFind]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    pointerFocusRef.current = null;
    sourceHistory.events.onKeyDown(event);
    if (event.defaultPrevented) return;
    pendingSelectionRef.current = null;
    const composing = composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229;
    if (composing || disabled || readOnly) return;
    const format = formatSelectionRef ? inlineFormatShortcut(event) : null;
    if (format) { event.preventDefault(); event.stopPropagation(); formatSelection(format); return; }

    if (visibleMatch && event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((safeActiveIndex + 1) % rows.length);
      return;
    }
    if (visibleMatch && event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((safeActiveIndex - 1 + rows.length) % rows.length);
      return;
    }
    if (visibleMatch && activeRow && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault();
      if (event.key === 'ArrowRight') {
        if (!activeSnippet && !expanded.includes(activeRow.group.id)) toggleGroup(activeRow.group.id, true);
        else if (!activeSnippet && rows[safeActiveIndex + 1]?.snippet) setActiveIndex(safeActiveIndex + 1);
      } else if (activeSnippet) setActiveIndex(rows.findIndex(row => row.group.id === activeRow.group.id && !row.snippet));
      else toggleGroup(activeRow.group.id, false);
      return;
    }
    if (visibleMatch && activeRow && !activeSnippet && event.key === 'Enter') {
      event.preventDefault(); toggleGroup(activeRow.group.id); return;
    }
    if (visibleMatch && (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) && activeSnippet) {
      event.preventDefault();
      commitSnippet(activeSnippet, visibleMatch.start, visibleMatch.end);
      return;
    }
    if (visibleMatch && event.key === 'Escape') {
      event.preventDefault();
      setDismissedMatch(matchKey);
      return;
    }
    if (event.key === ' ' && event.currentTarget.selectionStart === event.currentTarget.selectionEnd) {
      const expansion = findSnippetSpaceExpansion(value, event.currentTarget.selectionStart, snippets);
      if (!expansion) return;
      event.preventDefault();
      commitSnippet(expansion.snippet, expansion.start, expansion.end);
    }
  };

  const handleCompositionStart = (event: CompositionEvent<HTMLTextAreaElement>) => {
    sourceHistory.events.onCompositionStart(event);
    composingRef.current = true;
    setIsComposing(true);
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLTextAreaElement>) => {
    sourceHistory.events.onCompositionEnd(event);
    composingRef.current = false;
    setIsComposing(false);
    rememberSelection(event.currentTarget);
    if (findOpen && event.currentTarget.selectionStart === event.currentTarget.selectionEnd
      && findSnippetMenuMatch(event.currentTarget.value, event.currentTarget.selectionStart, snippets)) {
      setFindOpen(false); setReplaceAllDecision(null);
    }
  };

  const handleViewportScroll = () => {
    setHoveredConcern(null);
    measureGutter();
  };
  const handleTextareaScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    // A focused native control can try to scroll internally while its content grows.
    // Its final height follows the pre, so keep that internal offset at the common origin.
    if (event.currentTarget.scrollTop || event.currentTarget.scrollLeft) {
      event.currentTarget.scrollTop = 0;
      event.currentTarget.scrollLeft = 0;
      if (!pointerFocusRef.current) revealCaret();
    }
  };

  return (
    <div style={{ '--source-gutter-extra': `${showLineNumbers ? gutterDigits - 3 : 0}ch` } as CSSProperties} data-source-gutter-digits={gutterDigits} className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-editor-surface data-[drop-active=true]:outline-2 data-[drop-active=true]:outline-offset-2 data-[drop-active=true]:outline-accent" data-drop-active={isDragActive} onKeyDownCapture={event => {
        if (event.nativeEvent.isComposing || composingRef.current || replaceAllDecision || event.keyCode === 229) return;
        const key = event.key.toLowerCase();
        if ((event.metaKey || event.ctrlKey) && !event.altKey && key === 'g') { event.preventDefault(); event.stopPropagation(); moveFind(event.shiftKey ? -1 : 1); return; }
        if (findOpen && key === 'escape' && event.target === textareaRef.current) { event.preventDefault(); event.stopPropagation(); closeFind(); return; }
        if ((event.metaKey || event.ctrlKey) && key === 'f' || event.ctrlKey && key === 'h') { event.preventDefault(); event.stopPropagation(); openFind(); }
      }} onDragEnter={handleDragOver} onDragOver={handleDragOver} onDragLeave={() => setIsDragActive(false)} onDrop={handleDrop}>
      <SourceFindBar open={findOpen} panelRef={findPanelRef} query={findQuery} replacement={findReplacement} matchCase={findCase} count={found.length} index={activeFind} disabled={disabled || readOnly} composing={isComposing} autoFocusQuery={findOpen && focusFindQuery} focusQueryRef={focusFindRef}
        decision={replaceAllDecision} scopeLabel={suppliedAriaLabel ? t('editor:find.currentScope', { name: suppliedAriaLabel }) : t('editor:find.scopeBody')} onConfirmAll={confirmReplaceAll} onCancelAll={() => setReplaceAllDecision(null)}
        onQuery={next => { setFindQuery(next); setFindIndex(0); }} onReplacement={setFindReplacement} onCase={() => { setFindCase(current => !current); setFindIndex(0); }} onMove={moveFind}
        onReplace={replaceCurrent} onReplaceAll={requestReplaceAll} onClose={closeFind} />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {!openFindRef && !findOpen ? <div className="absolute top-2 right-2 z-30"><IconButton tooltip={t('editor:source.find')} icon={<FindIcon />} onClick={openFind} /></div> : null}
      <div ref={viewportRef} data-source-viewport="true" className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto scrollbar-gutter-stable" onScroll={handleViewportScroll}>
      <div className="flex min-h-full min-w-0 flex-col">
      {sourceHeader}
      <div data-source-content="true" className="relative min-h-0 w-full flex-1">
      <div ref={highlightRef} className={`pointer-events-none ${isComposing ? 'opacity-0' : ''}`} aria-hidden="true"><pre ref={sourceRef} className={sourceBoxClass}>{highlightedSource}</pre></div>
      {showLineNumbers || lineConcerns.size > 0 ? <div ref={gutterRef} className="pointer-events-none absolute inset-0 z-20 overflow-clip">
        <div className={sourceBoxClass}>
          {sourceLines.map((line, index) => {
            const number = index + 1 + lineOffset;
            const concern = lineConcerns.get(index + 1);
            return <div key={number} className="relative min-w-0 whitespace-pre-wrap wrap-anywhere">
              {showLineNumbers ? concern ? <button className={`${gutterNumberClass} pointer-events-auto bg-transparent p-0 data-[severity=warning]:text-warning data-[severity=error]:text-danger focus-visible:outline-2 focus-visible:outline-accent`} type="button" data-severity={concern.severity} aria-label={t('editor:diagnostics.line', { line: number, severity: t('editor:diagnostics.' + concern.severity), messages: sourceLineMessages(concern, t).join('；') })} onMouseEnter={(event) => showConcern(event.currentTarget, number, concern)} onMouseLeave={scheduleTooltipClose} onFocus={(event) => showConcern(event.currentTarget, number, concern)} onBlur={scheduleTooltipClose}>{number}</button> : <span className={gutterNumberClass} aria-hidden="true">{number}</span> : null}
              {concern && (!showLineNumbers || concern.severities) ? <button type="button" className={`pointer-events-auto absolute top-0 flex h-6 items-center justify-center gap-0.5 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-accent ${showLineNumbers ? '-left-[calc(var(--spacing)*12+var(--source-gutter-extra))] w-3 md:-left-[calc(var(--spacing)*16+var(--source-gutter-extra))]' : '-left-5 w-4 md:-left-6'}`} aria-label={t('editor:diagnostics.lineLabel', { line: number, messages: sourceLineMessages(concern, t).join('；') })} onMouseEnter={event => showConcern(event.currentTarget, number, concern)} onMouseLeave={scheduleTooltipClose} onFocus={event => showConcern(event.currentTarget, number, concern)} onBlur={scheduleTooltipClose}>{(concern.severities ?? [concern.severity]).map(severity => <span key={severity} data-severity={severity} className="size-1.5 shrink-0 rounded-full data-[severity=warning]:bg-warning data-[severity=error]:bg-danger" aria-hidden="true" />)}</button> : null}
              <span className="invisible" aria-hidden="true">{line || '\u200b'}</span>
            </div>;
          })}
        </div>
      </div> : null}
      <textarea
        id={id}
        ref={(node) => {
          textareaRef.current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        className={`absolute inset-0 z-10 min-h-0 min-w-0 size-full resize-none overflow-hidden ${sourceBoxClass} caret-editor-text outline-0 selection:bg-selection/60 selection:text-editor-text data-[find-active=true]:selection:bg-transparent data-[find-active=true]:selection:text-transparent focus-visible:outline-none ${isComposing ? 'text-editor-text' : 'text-transparent'}`}
        data-find-active={selectedFind}
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        onChange={handleChange}
        onPointerDown={() => {
          const viewport = viewportRef.current;
          if (viewport) pointerFocusRef.current = { top: viewport.scrollTop, left: viewport.scrollLeft };
        }}
        onPointerUp={() => { pointerFocusRef.current = null; }}
        onPointerCancel={() => { pointerFocusRef.current = null; }}
        onClick={(event) => { pointerFocusRef.current = null; pendingSelectionRef.current = null; rememberSelection(event.currentTarget); }}
        onBlur={() => { sourceHistory.events.onBlur(); pointerFocusRef.current = null; pendingSelectionRef.current = null; setDismissedMatch(matchKey); }}
        onFocus={() => {
          const pointer = pointerFocusRef.current, viewport = viewportRef.current;
          if (pointer && viewport) {
            // Native focus can reveal the old caret before the click places a
            // new one. Keep the shared viewport at the pointer's actual target.
            viewport.scrollTop = pointer.top; viewport.scrollLeft = pointer.left;
          }
        }}
        name={id ?? "article-source"}
        onKeyUp={(event) => { rememberSelection(event.currentTarget); if (!event.nativeEvent.isComposing && !composingRef.current && /^(Arrow|Home$|End$|PageUp$|PageDown$)/.test(event.key)) revealCaret(); }}
        onSelect={(event) => {
          sourceHistory.events.onSelect(event);
          const changed = rememberSelection(event.currentTarget);
          if (changed && !pointerFocusRef.current && !composingRef.current && event.currentTarget.selectionStart === event.currentTarget.selectionEnd) revealCaret();
        }}
        onScroll={handleTextareaScroll}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        spellCheck={false}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-haspopup="tree"
        aria-expanded={Boolean(visibleMatch)}
        aria-controls={visibleMatch ? 'snippet-command-list' : undefined}
        aria-activedescendant={activeRow?.id}
      />
      </div>
      </div>
      </div>
      </div>
      {insertionIssue ? <div className="diagnostic" data-level="error" role="alert">{formatProductMessage(insertionIssue, t)}</div> : null}
      {visibleMatch ? (
        <div ref={menuRef} className="snippet-command-menu" aria-label={t('editor:snippets.results')}>
          <p className="snippet-command-hint">{t('editor:snippets.hint')}</p>
          <div className="snippet-command-list" id="snippet-command-list" role="tree" aria-label={t('editor:snippets.categories')}>
            {rows.map((row, index) => (
              <button
                key={row.id}
                id={row.id}
                className={`snippet-command-option ${row.snippet ? 'items-start' : 'items-center py-2.5'}`}
                type="button"
                role="treeitem"
                tabIndex={-1}
                aria-level={row.snippet ? 2 : 1}
                aria-expanded={row.snippet ? undefined : expanded.includes(row.group.id)}
                aria-selected={index === safeActiveIndex}
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => { if (row.snippet) commitSnippet(row.snippet, visibleMatch!.start, visibleMatch!.end); else { setActiveIndex(index); toggleGroup(row.group.id); } }}
              >
                {row.snippet ? <><span className="mt-0.5 inline-flex size-4 shrink-0"><CategoryIcon name={row.snippet.icon} /></span><span className="grid min-w-0 flex-1 gap-1"><span className="snippet-option-heading"><strong className="min-w-0 break-words">{row.snippet.name}</strong><code>{row.snippet.trigger}</code></span><span className="snippet-option-description">{row.snippet.description}</span></span></> : <><span className="inline-flex size-4 shrink-0 text-accent-text"><CategoryIcon name={row.group.icon ?? 'snippet'} /></span><strong className="min-w-0 flex-1 truncate font-sub-heading text-sm font-semibold">{row.group.name}</strong><span className="font-mono text-xs text-faint">{row.group.items.length}</span><svg className={`size-4 text-faint ${expanded.includes(row.group.id) ? 'rotate-90' : ''}`} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m9 5 7 7-7 7" /></svg></>}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {hoveredConcern && typeof document !== 'undefined' ? createPortal(
        <div id={`source-line-${hoveredConcern.line}-issue`} className="fixed z-50 max-h-64 w-64 overflow-x-clip overflow-y-auto rounded-md border border-line-strong bg-popup-bg p-3 text-xs text-popup-text shadow-(--editor-popup-shadow) scrollbar-thin scrollbar-thumb-line scrollbar-track-transparent" style={{ top: hoveredConcern.top, left: hoveredConcern.left }} role="tooltip" onMouseEnter={cancelTooltipClose} onMouseLeave={scheduleTooltipClose}>
          <div className="flex items-center gap-2 font-semibold data-[severity=warning]:text-warning data-[severity=error]:text-danger" data-severity={hoveredConcern.concern.severity}>
            <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" /></svg>
            <span>{t('editor:diagnostics.lineTitle', { line: hoveredConcern.line, severity: t('editor:diagnostics.' + (hoveredConcern.concern.severities ? 'mixed' : hoveredConcern.concern.severity)) })}</span>
          </div>
          <ul className="mt-2 grid gap-1 pl-6">{sourceLineMessageLevels(hoveredConcern.concern, t).map(({ message, severity }) => <li key={`${severity}:${message}`} className="break-words data-[severity=warning]:text-warning data-[severity=error]:text-danger" data-severity={severity}>{message}</li>)}</ul>
        </div>, document.body) : null}
    </div>
  );
});
