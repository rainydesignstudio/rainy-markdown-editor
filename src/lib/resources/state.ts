import type { ImportResource, ImportTask } from '../imports/model';
import { localResourceReference } from './references';
import { resourceReference, type ResourceStorage } from './types';

type Entry = { version: number; state?: ImportResource['state']; error?: ImportResource['error'] };
type Session = { id: number; ready: boolean; entries: Map<string, Entry>; listeners: Map<string, Set<() => void>>; documents: Map<string, number>; documentListeners: Map<string, Set<() => void>>; diagnostics: Map<string, ImportTask['diagnostics']> };
const sessions = new WeakMap<FileSystemDirectoryHandle, Session>();
function session(root: FileSystemDirectoryHandle): Session { let value = sessions.get(root); if (!value) { value = { id: -1, ready: false, entries: new Map(), listeners: new Map(), documents: new Map(), documentListeners: new Map(), diagnostics: new Map() }; sessions.set(root, value); } return value; }
function key(articleId: string, reference: string): string | null {
  const local = localResourceReference(reference); if (!local) return null;
  return JSON.stringify([local.shared ? 'shared' : articleId, local.storage, local.fileName]);
}
export function beginResourceSession(root: FileSystemDirectoryHandle, id: number) {
  const current = session(root); if (current.id === id) return;
  current.id = id; current.ready = false; current.entries.clear(); current.documents.clear(); current.diagnostics.clear();
  for (const listeners of current.listeners.values()) for (const listener of listeners) listener();
  for (const listeners of current.documentListeners.values()) for (const listener of listeners) listener();
}
export function resourceSessionReady(root: FileSystemDirectoryHandle): boolean { return session(root).ready; }
export function importedResourceDiagnostics(root: FileSystemDirectoryHandle, id: string) { return session(root).diagnostics.get(id) ?? []; }
export function unfinishedResourceReferences(root: FileSystemDirectoryHandle, id: string): string[] {
  const result: string[] = [];
  for (const [name, entry] of session(root).entries) {
    const [owner, storage, fileName] = JSON.parse(name) as [string, ResourceStorage, string];
    if (owner === id && entry.state && entry.state !== 'complete') result.push(resourceReference(storage, fileName));
  }
  return result;
}
export function resourceState(root: FileSystemDirectoryHandle, articleId: string, reference: string): Readonly<Entry> | null {
  const name = key(articleId, reference); return name ? session(root).entries.get(name) ?? null : null;
}
export function resourceVersion(root: FileSystemDirectoryHandle | null, articleId: string, references: readonly string[]): string {
  return root ? references.map(reference => resourceState(root, articleId, reference)?.version ?? 0).join(':') : '0';
}
export function subscribeResources(root: FileSystemDirectoryHandle | null, articleId: string, references: readonly string[], listener: () => void) {
  if (!root) return () => {};
  const current = session(root), names = [...new Set(references.flatMap(reference => key(articleId, reference) ?? []))];
  for (const name of names) { let rows = current.listeners.get(name); if (!rows) { rows = new Set(); current.listeners.set(name, rows); } rows.add(listener); }
  return () => { for (const name of names) { const rows = current.listeners.get(name); rows?.delete(listener); if (!rows?.size) current.listeners.delete(name); } };
}
export function publishResourceTasks(root: FileSystemDirectoryHandle, tasks: readonly ImportTask[], ready = true) {
  const current = session(root); current.ready ||= ready;
  const changed = new Set<string>();
  for (const task of tasks) {
    const diagnostics = task.diagnostics ?? [];
    if (JSON.stringify(current.diagnostics.get(task.target.articleId) ?? []) !== JSON.stringify(diagnostics)) { current.diagnostics.set(task.target.articleId, diagnostics); changed.add(task.target.articleId); }
  }
  for (const task of tasks) for (const resource of task.resources) {
    const name = key(task.target.articleId, resource.reference); if (!name) continue;
    const previous = current.entries.get(name), error = resource.error;
    if (previous?.state === resource.state && previous.error?.message === error?.message) continue;
    current.entries.set(name, { version: (previous?.version ?? 0) + 1, state: resource.state, error });
    for (const listener of current.listeners.get(name) ?? []) listener();
    changed.add(task.target.articleId);
  }
  for (const id of changed) notifyDocument(current, id);
}
function notifyDocument(current: Session, id: string) { current.documents.set(id, (current.documents.get(id) ?? 0) + 1); for (const listener of current.documentListeners.get(id) ?? []) listener(); }
export function notifyResourceChanged(root: FileSystemDirectoryHandle, articleId: string, reference: string) {
  const name = key(articleId, reference); if (!name) return;
  const current = session(root), previous = current.entries.get(name);
  current.entries.set(name, { ...previous, version: (previous?.version ?? 0) + 1 });
  for (const listener of current.listeners.get(name) ?? []) listener();
  notifyDocument(current, articleId);
}
export function resourceDocumentVersion(root: FileSystemDirectoryHandle | null, id: string) { return root ? session(root).documents.get(id) ?? 0 : 0; }
export function subscribeResourceDocument(root: FileSystemDirectoryHandle | null, id: string, listener: () => void) {
  if (!root) return () => {};
  const current = session(root); let rows = current.documentListeners.get(id); if (!rows) { rows = new Set(); current.documentListeners.set(id, rows); } rows.add(listener);
  return () => { rows!.delete(listener); if (!rows!.size) current.documentListeners.delete(id); };
}
