import { articleIdentityMap, adoptArticleReferences } from '../articleIdentity';
import { knowledgeSourceDirectory } from './source';
import { isKnowledgeId, knowledgePath, type KnowledgeCapture } from './model';
import { assertKnowledgeIndexTarget } from './store';
import type { ReadonlyKnowledgeSource } from './source';
import type { ArticleSort } from '../articleListSorting';
export type CollectedKnowledge = KnowledgeCapture & { id: string; note: string; createdAt?: string; updatedAt?: string; change?: 'same' | 'changed' | 'missing'; checkedAt?: string };
export type KnowledgeTopic = { id: string; name: string; note: string; articleIds: string[]; items: CollectedKnowledge[] };
export type KnowledgeCitationSource = CollectedKnowledge & { articleId: string; citationId: string };
export type KnowledgeResearch = { schemaVersion: 1; sourceId: string; topics: KnowledgeTopic[]; citations: KnowledgeCitationSource[] };
const queues = new WeakMap<FileSystemDirectoryHandle, Promise<unknown>>();
const residues = new WeakMap<FileSystemDirectoryHandle, { name: string; handle: FileSystemFileHandle; modified: number }>();
const missing = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';
const invalid = () => { throw new Error('researchInvalid'); };
const string = (value: unknown, length = 65536): value is string => typeof value === 'string' && value.length <= length;
const timestamp = (value: unknown) => value === undefined || typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
export type ResearchSort = 'manual' | ArticleSort;
export function sortCollectedKnowledge(items: readonly CollectedKnowledge[], sort: ResearchSort, locale: string) {
  if (sort === 'manual') return [...items];
  const [field, direction] = sort.split('-'), sign = direction === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    if (field === 'title') return sign * (a.title || a.path).localeCompare(b.title || b.path, locale, { numeric: true });
    const left = field === 'created' ? a.createdAt : a.updatedAt, right = field === 'created' ? b.createdAt : b.updatedAt;
    if (!left || !right) return left ? -1 : right ? 1 : 0;
    return sign * (Date.parse(left) - Date.parse(right));
  });
}
export function transferCollectedKnowledge(data: KnowledgeResearch, fromId: string, itemId: string, toId: string, copy: boolean, now = new Date().toISOString()) {
  const from = data.topics.find(topic => topic.id === fromId), to = data.topics.find(topic => topic.id === toId);
  const index = from?.items.findIndex(item => item.id === itemId) ?? -1, item = from?.items[index];
  if (!from || !to || from === to || !item || item.sourceId !== data.sourceId) throw new Error('researchChanged');
  to.items.push(copy ? { ...item, id: crypto.randomUUID(), createdAt: now, updatedAt: now } : item);
  if (!copy) from.items.splice(index, 1);
}
export function reorderCollectedKnowledge(data: KnowledgeResearch, topicId: string, ids: readonly string[]) {
  const topic = data.topics.find(item => item.id === topicId);
  if (!topic || ids.length !== topic.items.length || new Set(ids).size !== ids.length) throw new Error('researchChanged');
  const entries = new Map(topic.items.map(item => [item.id, item]));
  if (ids.some(id => !entries.has(id))) throw new Error('researchChanged');
  topic.items = ids.map(id => entries.get(id)!);
}
export function validateResearch(value: unknown, sourceId: string): KnowledgeResearch {
  const data = value as KnowledgeResearch;
  if (!data || data.schemaVersion !== 1 || data.sourceId !== sourceId || !isKnowledgeId(data.sourceId) || !Array.isArray(data.topics) || data.topics.length > 1000 || !Array.isArray(data.citations) || data.citations.length > 10000) return invalid();
  const ids = new Set<string>();
  const item = (entry: CollectedKnowledge) => {
    if (!entry || !timestamp(entry.createdAt) || !timestamp(entry.updatedAt)) return invalid();
    if (!entry || !isKnowledgeId(entry.id) || ids.has(entry.id) || entry.sourceId !== sourceId || !string(entry.path, 8192) || !string(entry.title, 200) || !string(entry.content, 2 * 1024 * 1024) || !string(entry.note) || entry.original !== undefined && !string(entry.original, 2 * 1024 * 1024) || entry.change !== undefined && !['same', 'changed', 'missing'].includes(entry.change) || entry.checkedAt !== undefined && !string(entry.checkedAt, 40) || !Number.isSafeInteger(entry.line) || entry.line < 1 || !Number.isSafeInteger(entry.endLine) || entry.endLine < entry.line || typeof entry.whole !== 'boolean') invalid();
    knowledgePath(entry.path); ids.add(entry.id);
  };
  for (const topic of data.topics) {
    if (!topic || !isKnowledgeId(topic.id) || ids.has(topic.id) || !string(topic.name, 200) || !topic.name.trim() || !string(topic.note) || !Array.isArray(topic.articleIds) || topic.articleIds.length > 1000 || topic.articleIds.some(id => !string(id, 8192)) || !Array.isArray(topic.items) || topic.items.length > 10000) return invalid();
    ids.add(topic.id); topic.items.forEach(item);
  }
  for (const entry of data.citations) { item(entry); if (!string(entry.articleId, 8192) || !/^rme-cite-[a-f0-9-]+$/.test(entry.citationId)) return invalid(); }
  return data;
}
function referenceIds(data: KnowledgeResearch) { return [...data.topics.flatMap(topic => topic.articleIds), ...data.citations.map(item => item.articleId)]; }
function mapReferences(data: KnowledgeResearch, ids: Map<string, string>) {
  for (const topic of data.topics) topic.articleIds = topic.articleIds.map(id => ids.get(id) ?? id);
  for (const entry of data.citations) entry.articleId = ids.get(entry.articleId) ?? entry.articleId;
  return data;
}
async function location(root: FileSystemDirectoryHandle, source: ReadonlyKnowledgeSource) {
  await assertKnowledgeIndexTarget(root, source);
  const directory = await knowledgeSourceDirectory(root, source, true); await source.assertTargetOutsideSource(directory);
  return { directory, name: 'research-' + source.binding.sourceId + '.json' };
}
async function cleanFailedCreation(root: FileSystemDirectoryHandle, source: ReadonlyKnowledgeSource, directory: FileSystemDirectoryHandle, name: string) {
  const owned = residues.get(root); if (!owned || owned.name !== name) return;
  await assertKnowledgeIndexTarget(root, source);
  let current: FileSystemFileHandle;
  try { current = await directory.getFileHandle(name); } catch (error) { if (!missing(error)) throw error; residues.delete(root); return; }
  await source.assertTargetOutsideSource(current);
  const file = await current.getFile();
  if (await current.isSameEntry(owned.handle) && file.size === 0 && file.lastModified === owned.modified) {
    await source.assertTargetOutsideSource(directory); await directory.removeEntry(name);
  }
  residues.delete(root);
}
export async function readResearch(root: FileSystemDirectoryHandle, source: ReadonlyKnowledgeSource): Promise<KnowledgeResearch> {
  await queues.get(root)?.catch(() => {});
  const { directory, name } = await location(root, source);
  await cleanFailedCreation(root, source, directory, name);
  try {
    const handle = await directory.getFileHandle(name); await source.assertTargetOutsideSource(handle); const file = await handle.getFile();
    if (file.size > 16 * 1024 * 1024) return invalid();
    const result = validateResearch(JSON.parse(await file.text()), source.binding.sourceId); await assertKnowledgeIndexTarget(root, source); return mapReferences(result, await articleIdentityMap(root, true));
  } catch (error) { if (missing(error)) return { schemaVersion: 1, sourceId: source.binding.sourceId, topics: [], citations: [] }; throw error; }
}
export function updateResearch(root: FileSystemDirectoryHandle, source: ReadonlyKnowledgeSource, mutate: (data: KnowledgeResearch) => void): Promise<KnowledgeResearch> {
  const task = (queues.get(root) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const { directory, name } = await location(root, source);
    await cleanFailedCreation(root, source, directory, name);
    let handle: FileSystemFileHandle | undefined;
    try { handle = await directory.getFileHandle(name); } catch (error) { if (!missing(error)) throw error; }
    if (handle) await source.assertTargetOutsideSource(handle);
    const file = handle ? await handle.getFile() : null; if (file && file.size > 16 * 1024 * 1024) return invalid();
    const previous = file ? await file.text() : '';
    const data = handle ? validateResearch(JSON.parse(previous), source.binding.sourceId) : { schemaVersion: 1 as const, sourceId: source.binding.sourceId, topics: [], citations: [] };
    mapReferences(data, await articleIdentityMap(root, true));
    mutate(data); mapReferences(data, await adoptArticleReferences(root, referenceIds(data), () => assertKnowledgeIndexTarget(root, source))); validateResearch(data, source.binding.sourceId);
    const text = JSON.stringify(data, null, 2) + '\n'; if (new Blob([text]).size > 16 * 1024 * 1024) return invalid();
    await assertKnowledgeIndexTarget(root, source);
    let owned: { name: string; handle: FileSystemFileHandle; modified: number } | undefined, writer: FileSystemWritableFileStream | undefined;
    try {
      if (!handle) {
        handle = await directory.getFileHandle(name, { create: true }); await source.assertTargetOutsideSource(handle);
        const initial = await handle.getFile(); if (initial.size !== 0) throw new Error('researchChanged');
        owned = { name, handle, modified: initial.lastModified };
      }
      writer = await handle.createWritable();
      await writer.write(text); await assertKnowledgeIndexTarget(root, source); await source.assertTargetOutsideSource(handle);
      if (await (await handle.getFile()).text() !== previous) throw new Error('researchChanged');
      await writer.close(); return data;
    } catch (error) {
      try { await writer?.abort(); } catch { /* retain primary failure */ }
      if (owned) { residues.set(root, owned); try { await cleanFailedCreation(root, source, directory, name); } catch { /* retry when access is restored; never clean an unauthorized target */ } }
      throw error;
    }
  });
  queues.set(root, task); return task;
}

export function inspectCapture(capture: KnowledgeCapture, text: string) {
  const retained = capture.original ?? capture.content;
  if (capture.whole) return { changed: retained !== text, content: text, line: 1, endLine: text.split('\n').length };
  const sourceLines = text.replace(/\r\n/g, '\n'), retainedLines = retained.replace(/\r\n/g, '\n');
  const offset = sourceLines.indexOf(retainedLines);
  if (offset >= 0) { const line = sourceLines.slice(0, offset).split('\n').length; return { changed: false, content: capture.content, line, endLine: line + retainedLines.split('\n').length - 1 }; }
  return { changed: true, content: text.split(/\r?\n/).slice(capture.line - 1, capture.endLine).join('\n'), line: capture.line, endLine: capture.endLine };
}
