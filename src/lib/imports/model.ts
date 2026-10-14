import { KNOWLEDGE_LIMITS, isKnowledgeId, knowledgePath } from '../knowledge/model';
import { resourceReference } from '../resources/types';
import { ProductError } from '../i18n/productMessages';
import type { ResourceStorage } from '../resources/types';
import type { ProductMessageFields } from '../i18n/productMessages';

export const IMPORT_LIMITS = Object.freeze({ documentBytes: KNOWLEDGE_LIMITS.documentBytes, resources: 1000, diagnostics: 2000, taskBytes: 8 * 1024 * 1024, visibleTasks: 200 });
export type MarkdownImportOrigin = { kind: 'local' | 'knowledge'; sourceId: string; path: string; name: string; size: number; modified: number; hash: string };
export type ImportResource = {
  id: string; source: string; location: 'local' | 'https'; storage: ResourceStorage;
  fileName: string; reference: string; state: 'pending' | 'running' | 'complete' | 'failed' | 'cancelled';
  receivedBytes: number; totalBytes?: number; error?: ProductMessageFields | { message: string };
  replacement?: { name: string; size: number; modified: number };
};
export type ImportTask = {
  schemaVersion: 1; id: string; createdAt: string; updatedAt: string;
  target: { articleId: string; month: string; folder: string };
  source: MarkdownImportOrigin;
  state: 'pending' | 'running' | 'paused' | 'complete' | 'cancelled';
  resources: ImportResource[];
  diagnostics: { line: number; source: string; reason: 'unsafe-resource' | 'resource-limit' | 'document-link' | 'unsupported-embedded' }[];
};

export function validateImportTask(input: unknown): ImportTask {
  const fail = (): never => { throw new ProductError('imports.invalidTask'); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail();
  const task = input as ImportTask;
  const keys = (value: unknown, required: string[], optional: string[] = []) => value && typeof value === 'object' && !Array.isArray(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
  const params = (value: unknown, depth = 0): boolean => {
    if (depth > 8) return false;
    if (value === null || value === undefined || typeof value === 'boolean') return true;
    if (typeof value === 'string') return value.length <= 8192;
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.length <= 100 && value.every(item => params(item, depth + 1));
    if (!value || typeof value !== 'object') return false;
    const entries = Object.entries(value);
    return entries.length <= 50 && entries.every(([key, item]) => key.length <= 128 && !['__proto__', 'constructor', 'prototype'].includes(key) && params(item, depth + 1));
  };
  if (!keys(task, ['schemaVersion', 'id', 'createdAt', 'updatedAt', 'target', 'source', 'state', 'resources', 'diagnostics']) || task.schemaVersion !== 1 || !isKnowledgeId(task.id) || !['pending', 'running', 'paused', 'complete', 'cancelled'].includes(task.state) || typeof task.createdAt !== 'string' || typeof task.updatedAt !== 'string' || !Number.isFinite(Date.parse(task.createdAt)) || !Number.isFinite(Date.parse(task.updatedAt))) return fail();
  if (!keys(task.target, ['articleId', 'month', 'folder']) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(task.target.month) || typeof task.target.folder !== 'string' || task.target.articleId !== `${task.target.month}/${task.target.folder}` || knowledgePath(task.target.articleId).length !== 2) return fail();
  if (!keys(task.source, ['kind', 'sourceId', 'path', 'name', 'size', 'modified', 'hash']) || !['local', 'knowledge'].includes(task.source.kind) || !isKnowledgeId(task.source.sourceId) || typeof task.source.name !== 'string' || task.source.name.length > 255 || !Number.isSafeInteger(task.source.size) || task.source.size < 0 || task.source.size > IMPORT_LIMITS.documentBytes || !Number.isFinite(task.source.modified) || !/^[a-f0-9]{64}$/.test(task.source.hash)) return fail();
  knowledgePath(task.source.path);
  if (!Array.isArray(task.resources) || task.resources.length > IMPORT_LIMITS.resources || !Array.isArray(task.diagnostics) || task.diagnostics.length > 3000) return fail();
  const ids = new Set<string>(), names = new Set<string>();
  for (const resource of task.resources) {
    if (!keys(resource, ['id', 'source', 'location', 'storage', 'fileName', 'reference', 'state', 'receivedBytes'], ['totalBytes', 'error', 'replacement']) || !isKnowledgeId(resource.id) || ids.has(resource.id) || typeof resource.source !== 'string' || !resource.source || resource.source.length > 8192 || /[\u0000-\u001f\u007f]/.test(resource.source) || !['local', 'https'].includes(resource.location) || !['image', 'file'].includes(resource.storage) || resource.reference !== resourceReference(resource.storage, resource.fileName) || !['pending', 'running', 'complete', 'failed', 'cancelled'].includes(resource.state) || !Number.isSafeInteger(resource.receivedBytes) || resource.receivedBytes < 0 || resource.totalBytes !== undefined && (!Number.isSafeInteger(resource.totalBytes) || resource.totalBytes < 0)) return fail();
    const name = resource.storage + ':' + resource.fileName.normalize('NFKC').toLowerCase(); if (names.has(name)) return fail();
    if (resource.error && (!keys(resource.error, ['message'], ['messageKey', 'messageParams']) || typeof resource.error.message !== 'string' || resource.error.message.length > 8192 || 'messageKey' in resource.error && typeof resource.error.messageKey !== 'string' || !params('messageParams' in resource.error ? resource.error.messageParams : undefined))) return fail();
    if (resource.replacement && (!keys(resource.replacement, ['name', 'size', 'modified']) || typeof resource.replacement.name !== 'string' || resource.replacement.name.length > 255 || !Number.isSafeInteger(resource.replacement.size) || resource.replacement.size < 0 || !Number.isFinite(resource.replacement.modified))) return fail();
    ids.add(resource.id); names.add(name);
  }
  for (const issue of task.diagnostics) if (!keys(issue, ['line', 'source', 'reason']) || !Number.isSafeInteger(issue.line) || issue.line < 1 || typeof issue.source !== 'string' || issue.source.length > 200 || !['unsafe-resource', 'resource-limit', 'document-link', 'unsupported-embedded'].includes(issue.reason)) return fail();
  if (task.state === 'complete' && (task.resources.some(resource => resource.state !== 'complete') || task.diagnostics.some(issue => issue.reason !== 'document-link'))) return fail();
  return task;
}
