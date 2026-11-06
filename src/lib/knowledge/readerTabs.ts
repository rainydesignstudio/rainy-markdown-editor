import { fileTitle } from './model';
export type KnowledgeReadingFrame = { sourceId: string; sourceName?: string; path: string; line: number; fragment?: string; mode: 'preview' | 'source'; scroll: number };
export type KnowledgeReaderTab = { id: string; title: string; frame: KnowledgeReadingFrame; history: KnowledgeReadingFrame[] };
export function rememberReadingFrame(tabs: KnowledgeReaderTab[], activeId: string, frame?: KnowledgeReadingFrame): KnowledgeReaderTab[] {
  return frame ? tabs.map(tab => tab.id === activeId ? { ...tab, frame } : tab) : tabs;
}
export function openReadingTab(tabs: KnowledgeReaderTab[], activeId: string, frame: KnowledgeReadingFrame, newTab = false, previous?: KnowledgeReadingFrame) {
  const remembered = rememberReadingFrame(tabs, activeId, previous), active = remembered.find(tab => tab.id === activeId);
  if (newTab || !active) {
    const tab = { id: crypto.randomUUID(), title: fileTitle(frame.path), frame, history: [] };
    return { tabs: [...remembered, tab], activeId: tab.id };
  }
  return { tabs: remembered.map(tab => tab.id === activeId ? { ...tab, title: fileTitle(frame.path), frame, history: [...tab.history, tab.frame].slice(-100) } : tab), activeId };
}
export function backReadingTab(tabs: KnowledgeReaderTab[], activeId: string) {
  const active = tabs.find(tab => tab.id === activeId), frame = active?.history.at(-1);
  if (!active || !frame) return null;
  return { tabs: tabs.map(tab => tab.id === activeId ? { ...tab, title: fileTitle(frame.path), frame, history: tab.history.slice(0, -1) } : tab), frame };
}
export function closeReadingTab(tabs: KnowledgeReaderTab[], activeId: string, id: string) {
  const index = tabs.findIndex(tab => tab.id === id), remaining = tabs.filter(tab => tab.id !== id);
  return { tabs: remaining, activeId: id === activeId ? remaining[Math.min(Math.max(0, index), remaining.length - 1)]?.id ?? '' : activeId };
}
