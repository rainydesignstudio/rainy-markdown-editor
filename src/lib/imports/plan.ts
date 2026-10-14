import { resourceReferences, rewriteResourceReferences, unsupportedResourceReferences } from '../resources/references';
import { planResourceFileName } from '../resources/storage';
import { resourceType } from '../resources/types';
import { IMPORT_LIMITS, type ImportTask, type ImportResource } from './model';

export function planMarkdownResources(body: string): Pick<ImportTask, 'resources' | 'diagnostics'> & { body: string } {
  const references = resourceReferences(body), resources: ImportResource[] = [], diagnostics: ImportTask['diagnostics'] = [], mapped = new Map<string, string>();
  diagnostics.push(...unsupportedResourceReferences(body).slice(0, IMPORT_LIMITS.diagnostics - 1).map(item => ({ ...item, reason: 'unsupported-embedded' as const })));
  const grouped = new Map<string, typeof references>();
  for (const reference of references) { const items = grouped.get(reference.url) ?? []; items.push(reference); grouped.set(reference.url, items); }
  for (const [url, items] of grouped) {
    if (resources.length >= IMPORT_LIMITS.resources || diagnostics.length >= IMPORT_LIMITS.diagnostics - 1) { diagnostics.push({ line: items[0].line, source: url.slice(0, 200), reason: 'resource-limit' }); break; }
    const external = /^[a-z][\w+.-]*:/i.test(url) || url.startsWith('//');
    let location: ImportResource['location'] = 'local', name = '', suffix = '';
    try {
      if (!url || url.length > 8192 || /[\u0000-\u001f\u007f]/.test(url)) throw new Error('invalid reference');
      if (external) {
        const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('invalid URL');
        location = 'https'; name = decodeURIComponent(parsed.pathname.split('/').at(-1) ?? ''); suffix = parsed.hash;
      } else {
        const path = url.split('#')[0].split('?')[0]; name = decodeURIComponent(path.replace(/\\/g, '/').split('/').at(-1) ?? '');
        suffix = url.slice(path.length);
      }
      const image = items.some(item => item.kind === 'image') && ['image', 'file'].includes(resourceType(name).id);
      const storage = image ? 'image' : 'file';
      const planned = planResourceFileName(name || (image ? 'image.img' : 'file'), storage);
      const reference = planned.reference + encodeURI(suffix).replace(/[!'()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
      resources.push({ id: crypto.randomUUID(), source: url, location, storage, fileName: planned.fileName, reference: planned.reference, state: 'pending', receivedBytes: 0 });
      mapped.set(url, reference);
    } catch { diagnostics.push({ line: items[0].line, source: url.slice(0, 200), reason: 'unsafe-resource' }); }
  }
  return { body: rewriteResourceReferences(body, references, mapped), resources, diagnostics };
}
