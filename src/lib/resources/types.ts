import defaults from '../../../resources/presets/resource/types.json' with { type: 'json' };
import { ProductError } from '../i18n/productMessages';
import { isSnippetCategoryIcon } from '../snippetCategoryIcons';
import type { SnippetCategoryIcon } from '../types';
import { encodeResourceLeaf } from './paths';

export type ResourceType = Readonly<{ id: string; icon: SnippetCategoryIcon; badge: string; extensions: Readonly<Record<string, string>>; mimeAliases: readonly string[]; preview: 'image' | 'none' }>;
export type ResourceTypeRegistry = { schemaVersion: 1; types: ResourceType[] };
export function validateResourceTypes(input: unknown): ResourceTypeRegistry {
  const fail = () => { throw new ProductError('resources.invalidRegistry'); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail();
  const value = input as ResourceTypeRegistry;
  if (Object.keys(value).length !== 2 || value.schemaVersion !== 1 || !Array.isArray(value.types) || !value.types.length || value.types.length > 100) return fail();
  const ids = new Set<string>(), extensions = new Set<string>();
  for (const type of value.types) {
    if (!type || typeof type !== 'object' || Object.keys(type).length !== 6 || typeof type.id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(type.id) || ids.has(type.id) || !isSnippetCategoryIcon(type.icon) || typeof type.badge !== 'string' || !/^[A-Z0-9+]{0,5}$/.test(type.badge) || !['image', 'none'].includes(type.preview) || !type.extensions || typeof type.extensions !== 'object' || Array.isArray(type.extensions) || !Array.isArray(type.mimeAliases)) return fail();
    for (const [extension, mime] of Object.entries(type.extensions)) {
      if (typeof extension !== 'string' || !/^[a-z0-9][a-z0-9.+-]{0,23}$/.test(extension) || extensions.has(extension)) return fail();
      if (typeof mime !== 'string' || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime)) return fail();
      extensions.add(extension);
    }
    if (type.mimeAliases.some(mime => typeof mime !== 'string' || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime))) return fail();
    // Saving arbitrary files does not authorize arbitrary inline previews.
    if (type.preview === 'image' && type.id !== 'image') return fail();
    ids.add(type.id);
  }
  if (!ids.has('file') || !ids.has('image') || !ids.has('svg') || value.types.find(type => type.id === 'file')!.preview !== 'none') return fail();
  return value;
}
export const RESOURCE_TYPES: readonly ResourceType[] = Object.freeze(validateResourceTypes(defaults).types.map(type => Object.freeze({ ...type, extensions: Object.freeze({ ...type.extensions }), mimeAliases: Object.freeze([...type.mimeAliases]) })));
export const RESOURCE_FILE_LIMIT = 64 * 1024 * 1024;
export type ResourceStorage = 'image' | 'file';
export function resourceExtension(name: string): string {
  const leaf = name.replace(/\\/g, '/').split('/').at(-1) ?? '';
  const match = /\.([^.\s]+)$/.exec(leaf); return match?.[1].toLowerCase() ?? '';
}
export function resourceType(name: string, mimeType = ''): ResourceType {
  const extension = resourceExtension(name), mime = mimeType.toLowerCase().split(';')[0].trim();
  return RESOURCE_TYPES.find(type => Object.hasOwn(type.extensions, extension)) ?? RESOURCE_TYPES.find(type => type.mimeAliases.includes(mime) || (mime !== 'application/octet-stream' && Object.values(type.extensions).includes(mime))) ?? RESOURCE_TYPES.find(type => type.id === 'file')!;
}
export function resourceMime(name: string, declared = ''): string {
  const mime = declared.toLowerCase().split(';')[0].trim();
  const registered = resourceType(name).extensions[resourceExtension(name)];
  if (registered && registered !== 'application/octet-stream') return registered;
  if (/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime)) return mime;
  return registered ?? 'application/octet-stream';
}
export function validResourceLeaf(value: string): boolean {
  return Boolean(typeof value === 'string' && value && value.isWellFormed() && value !== '.' && value !== '..' && !value.startsWith('.') && !/[<>:"/\\|?*\u0000-\u001f\u007f]/.test(value) && !/[. ]$/.test(value) && Array.from(value).length <= 120 && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value));
}
export function resourceReference(storage: ResourceStorage, fileName: string, shared = false): string {
  if (!['image', 'file'].includes(storage) || !validResourceLeaf(fileName)) throw new ProductError('resources.unsafeName');
  return `${shared ? '/shared' : 'media'}/${storage}/${encodeResourceLeaf(fileName)}`;
}
