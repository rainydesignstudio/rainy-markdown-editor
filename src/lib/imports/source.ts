import type { ReadonlyKnowledgeSource } from '../knowledge/source';
import { knowledgePath, knowledgeReferencePath } from '../knowledge/model';
import { parseKnowledgeText } from '../knowledge/parse';
import { ProductError, productErrorMessage, localizeFilePickerError, type ProductMessageFields } from '../i18n/productMessages';
import { readMarkdownImport } from './document';
import type { MarkdownImportOrigin } from './model';
import { importBookmarks, scopedImportBookmark, type ImportBookmarkStore } from './bookmarks';
import { resourceReferences } from '../resources/references';
import { isApplicationExampleImage } from '../articleExamples';

export type ReadonlyImportSource = Readonly<{
  origin: Readonly<MarkdownImportOrigin>; title: string; directoryName: string | null; localResources?:number; attachmentCount?:number;
  assertCurrent: () => Promise<void>;
  assertTarget: (target: FileSystemHandle) => Promise<void>;
  readMarkdown: () => Promise<File>;
  readResource: (reference: string) => Promise<File>;
  chooseDirectory?: (directory?:FileSystemDirectoryHandle) => Promise<ReadonlyImportSource | null>;
  remember?: (id: string, library: FileSystemDirectoryHandle, store?: ImportBookmarkStore) => Promise<void>;
}>;
export type MarkdownImportChoice={id:string;name:string;file?:FileSystemFileHandle;source:ReadonlyImportSource|null;error?:ProductMessageFields|{message:string}};
const bindings=new WeakMap<ReadonlyImportSource,{file:FileSystemFileHandle;directory:FileSystemDirectoryHandle|null}>();
const granted = async (handle: FileSystemHandle) => await (handle as FileSystemHandle & { queryPermission: (options: { mode: 'read' }) => Promise<PermissionState> }).queryPermission({ mode: 'read' }) === 'granted';
const alive = (current: () => boolean) => { if (!current()) throw new ProductError('imports.changed'); };

async function localSource(file: FileSystemFileHandle, current: () => boolean, directory: FileSystemDirectoryHandle | null = null, previous?: MarkdownImportOrigin): Promise<ReadonlyImportSource> {
  alive(current); if (!await granted(file)) throw new ProductError('imports.sourceRequired');
  const content = await file.getFile(), decoded = await readMarkdownImport(content);
  if (previous && previous.hash !== decoded.hash) throw new ProductError('imports.sourceChanged');
  const relative = directory ? await directory.resolve(file) : [content.name];
  if (!relative?.length) throw new ProductError('imports.sourceDirectoryMismatch');
  const path = relative.join('/'); knowledgePath(path);
  const origin: MarkdownImportOrigin = { kind: 'local', sourceId: previous?.sourceId ?? crypto.randomUUID(), path, name: content.name, size: content.size, modified: content.lastModified, hash: decoded.hash };
  const check = async () => { alive(current); if (!await granted(file) || directory && !await granted(directory)) throw new ProductError('imports.sourceRequired'); alive(current); };
  const body=decoded.text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'');
  const references=resourceReferences(body),attachmentCount=new Set(references.map(item=>item.url)).size;
  const localResources=new Set(references.filter(item=>! /^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(item.url)&&!isApplicationExampleImage(item.url)).map(item=>item.url)).size;
  const source:ReadonlyImportSource=Object.freeze({
    origin: Object.freeze(origin), title: parseKnowledgeText(decoded.text, path).title, directoryName: directory?.name ?? null,
    localResources,attachmentCount,
    assertCurrent: check,
    async assertTarget(target: FileSystemHandle) {
      await check();
      if (await file.isSameEntry(target) || directory && (await directory.isSameEntry(target) || await directory.resolve(target) !== null)) throw new ProductError('imports.sourceDirectoryMismatch');
    },
    async readMarkdown() { await check(); const value = await file.getFile(); alive(current); return value; },
    async remember(id: string, library: FileSystemDirectoryHandle, store = importBookmarks) { await check(); await store.save('source:' + id, { library, file, directory }); alive(current); },
    async readResource(reference: string) {
      await check(); if (!directory) throw new ProductError('imports.sourceDirectoryRequired');
      const path = knowledgeReferencePath(origin.path, reference); if (!path) throw new ProductError('imports.unsafeResource');
      const parts = knowledgePath(path); let parent = directory;
      for (let index = 0; index < parts.length - 1; index++) {
        parent = await parent.getDirectoryHandle(parts[index]);
        const resolved = await directory.resolve(parent);
        if (!resolved || resolved.join('/') !== parts.slice(0, index + 1).join('/')) throw new ProductError('imports.unsafeResource');
        await check();
      }
      const target = await parent.getFileHandle(parts.at(-1)!); const resolved = await directory.resolve(target);
      if (!resolved || resolved.join('/') !== path) throw new ProductError('imports.unsafeResource');
      const value = await target.getFile(); await check(); return value;
    },
    async chooseDirectory(provided?:FileSystemDirectoryHandle) {
      const picker = (window as unknown as { showDirectoryPicker: (options: { mode: 'read' }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      let chosen: FileSystemDirectoryHandle;
      try { chosen = provided??await picker({ mode: 'read' }); } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return null; throw localizeFilePickerError(error); }
      await check(); if (!await granted(chosen)) throw new ProductError('imports.sourceRequired');
      return localSource(file, current, chosen, origin);
    },
  });
  bindings.set(source,{file,directory});return source;
}

async function pickMarkdownFiles(multiple:boolean):Promise<FileSystemFileHandle[]|null>{
  const picker = (window as unknown as { showOpenFilePicker?: (options: unknown) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker;
  if (!picker) throw new ProductError('imports.pickerUnavailable');
  let files: FileSystemFileHandle[];
  try { files = await picker({ multiple, types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }] }); }
  catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return null; throw localizeFilePickerError(error); }
  return files;
}

export async function chooseMarkdownImport(current: () => boolean): Promise<ReadonlyImportSource | null> {
  const files=await pickMarkdownFiles(false);if(!files)return null;
  if (!files[0]) return null;
  return localSource(files[0], current);
}

async function readChoices(entries:Array<{name:string;file?:FileSystemFileHandle;error?:unknown}>,current:()=>boolean):Promise<MarkdownImportChoice[]>{
  const choices:MarkdownImportChoice[]=new Array(entries.length);let next=0;
  const read=async()=>{while(next<entries.length){const index=next++,entry=entries[index];alive(current);try{if(!entry.file)throw entry.error??new ProductError('imports.dropUnsupported');choices[index]={id:crypto.randomUUID(),name:entry.name,file:entry.file,source:await localSource(entry.file,current)};}catch(error){alive(current);choices[index]={id:crypto.randomUUID(),name:entry.name,file:entry.file,source:null,error:productErrorMessage(error)};}}};
  await Promise.all(Array.from({length:Math.min(3,entries.length)},read));return choices;
}
export async function chooseMarkdownImports(current:()=>boolean):Promise<MarkdownImportChoice[]|null>{
  const files=await pickMarkdownFiles(true);if(!files)return null;
  return readChoices(files.map(file=>({name:file.name,file})),current);
}

export async function droppedMarkdownImports(transfer:Pick<DataTransfer,'items'>,current:()=>boolean):Promise<MarkdownImportChoice[]>{
  alive(current);
  // Capture every native handle during the trusted drop event, before awaiting.
  const handles=Array.from(transfer.items).filter(item=>item.kind==='file').map(item=>{
    const name=item.getAsFile()?.name??'';
    try{
      const get=(item as DataTransferItem&{getAsFileSystemHandle?:()=>Promise<FileSystemHandle|null>}).getAsFileSystemHandle;
      if(!get)return Promise.resolve({name,error:new ProductError('imports.dropUnsupported')});
      return get.call(item).then(handle=>handle?.kind==='file'?{name:handle.name,file:handle as FileSystemFileHandle}:{name:handle?.name??name,error:new ProductError('imports.markdownOnly')},error=>({name,error}));
    }catch(error){return Promise.resolve({name,error});}
  });
  const entries=await Promise.all(handles);alive(current);return readChoices(entries,current);
}

export async function sameImportChoice(a:MarkdownImportChoice,b:MarkdownImportChoice):Promise<boolean>{
  if(a.name!==b.name)return false;
  if(a.file&&b.file)return a.file.isSameEntry(b.file);
  return Boolean(a.source&&b.source&&a.source.origin.kind===b.source.origin.kind&&a.source.origin.sourceId===b.source.origin.sourceId&&a.source.origin.path===b.source.origin.path);
}

export async function shareImportDirectory(chosen:ReadonlyImportSource,others:ReadonlyImportSource[]):Promise<Map<ReadonlyImportSource,ReadonlyImportSource>>{
  const directory=bindings.get(chosen)?.directory,result=new Map<ReadonlyImportSource,ReadonlyImportSource>();if(!directory)return result;
  for(const source of others){const file=bindings.get(source)?.file;if(!file||source.directoryName||!source.localResources||!source.chooseDirectory)continue;if(await directory.resolve(file)===null)continue;const next=await source.chooseDirectory(directory);if(next)result.set(source,next);}
  return result;
}

export async function knowledgeImportSource(source: ReadonlyKnowledgeSource, path: string): Promise<ReadonlyImportSource> {
  knowledgePath(path); await source.assertCurrent();
  const file = await source.readFile(path), decoded = await readMarkdownImport(file);
  return Object.freeze({
    origin: Object.freeze({ kind: 'knowledge', sourceId: source.binding.sourceId, path, name: file.name, size: file.size, modified: file.lastModified, hash: decoded.hash }),
    title: parseKnowledgeText(decoded.text, path).title, directoryName: source.binding.name,
    attachmentCount:new Set(resourceReferences(decoded.text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'')).map(item=>item.url)).size,
    assertCurrent: source.assertCurrent, assertTarget: source.assertTargetOutsideSource,
    readMarkdown: () => source.readFile(path),
    readResource: (reference: string) => { const target = knowledgeReferencePath(path, reference); if (!target) return Promise.reject(new ProductError('imports.unsafeResource')); return source.readFile(target); },
  });
}

/** Read-only handle restoration happens on explicit retry, never while loading the task list. */
export async function restoreLocalImportSource(id: string, library: FileSystemDirectoryHandle, expected: MarkdownImportOrigin, current: () => boolean, request = false, store: ImportBookmarkStore = importBookmarks): Promise<ReadonlyImportSource | null> {
  const saved = await scopedImportBookmark<{ library: FileSystemDirectoryHandle; file: FileSystemFileHandle; directory: FileSystemDirectoryHandle | null }>(store, 'source:' + id, library);
  if (!saved || saved.file?.kind !== 'file' || saved.directory && saved.directory.kind !== 'directory') return null;
  alive(current);
  for (const handle of [saved.file, saved.directory].filter(Boolean) as FileSystemHandle[]) {
    if (await granted(handle)) continue;
    if (!request || await (handle as FileSystemHandle & { requestPermission: (options: { mode: 'read' }) => Promise<PermissionState> }).requestPermission({ mode: 'read' }) !== 'granted') throw new ProductError('imports.sourceRequired');
    alive(current);
  }
  return localSource(saved.file, current, saved.directory, expected);
}
