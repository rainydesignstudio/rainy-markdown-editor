import { algorithmHash } from './algorithms';
import { canonicalFormatJson, freezeFormatBundle } from './config';
import type { ConfigurationMetadata } from './libraryConfiguration';
import type { FormatSnapshot } from './runtime';
import type { ThemeConfig } from '../types';
import { PACKAGE_LIMITS, validateRendererDeclaration, rendererUsesLibraryPaths, validatePackageResult, type RendererDeclaration, type RendererPackage, type PackageAction, type PackageResult } from './packageContract';
import { resourcePolicyOf, validateResourcePolicy, verifiesSha256, type ResourcePolicy } from './resourcePaths';
import { materializePackageResources } from './packageResources';
import { ProductError } from '../i18n/productMessages';
export * from './packageContract';
export function rendererPolicy(pkg: RendererPackage) {
  const prefix = rendererUsesLibraryPaths(pkg.declaration) ? 'format/' : '';
  const [support, validator, formatter] = ['format-support.json', 'validator.json', 'formatter.json'].map(name => JSON.parse(pkg.files[prefix + name].replace(/^\uFEFF/, '')));
  return { support, validator, formatter };
}
export function rendererPackageData(pkg: Pick<RendererPackage, 'declaration' | 'files' | 'policy'>) {
  return { declaration: pkg.declaration, files: pkg.files, ...(pkg.policy ? { policy: pkg.policy } : {}) };
}
export async function validateRendererPackage(value: unknown): Promise<RendererPackage> {
  const p = value as RendererPackage;
  if (!p || !p.files || typeof p.files !== 'object' || Array.isArray(p.files)) throw new Error('Invalid format package');
  if (p.policy) validateResourcePolicy(p.policy);
  validateRendererDeclaration(p.declaration, 'renderer', p.policy);
  if (Object.keys(p.files).length !== p.declaration.files.length) throw new Error('Incomplete format package files');
  let total = 0;
  for (const ref of p.declaration.files) {
    const source = p.files[ref.path];
    if (typeof source !== 'string') throw new Error(`Missing format package file: ${ref.path}`);
    const bytes = ref.encoding === 'base64' ? Uint8Array.from(atob(source), char => char.charCodeAt(0)) : new TextEncoder().encode(source);
    const size = bytes.byteLength; total += size;
    if (size > PACKAGE_LIMITS.fileBytes || total > PACKAGE_LIMITS.totalBytes || verifiesSha256(p.policy) && await algorithmHash(new Blob([bytes])) !== ref.sha256) throw new Error(`Format package verification failed: ${ref.path}`);
  }
  if (await algorithmHash(canonicalFormatJson(rendererPackageData(p))) !== p.fingerprint) throw new Error('Format package identity mismatch');
  if (JSON.stringify(p).length > PACKAGE_LIMITS.messageBytes) throw new Error('Format package transport exceeds limits');
  const policy = rendererPolicy(p);
  if (new Set([policy.support?.meta?.id, policy.validator?.meta?.id, policy.formatter?.meta?.id]).size !== 1 || typeof policy.support?.meta?.id !== 'string') throw new Error('Format package policy identity mismatch');
  return freezeFormatBundle(p);
}
export async function readRendererPackage(root: FileSystemDirectoryHandle, declaration: RendererDeclaration, configuration?: ResourcePolicy): Promise<RendererPackage> {
  const policy = resourcePolicyOf(configuration);
  validateRendererDeclaration(declaration, 'renderer', policy);
  const format = rendererUsesLibraryPaths(declaration) ? root : await root.getDirectoryHandle('format'), files: Record<string, string> = {};
  let total = 0;
  for (const ref of declaration.files) {
    let dir = format; const parts = ref.path.split('/');
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    const file = await (await dir.getFileHandle(parts.at(-1)!)).getFile(); total += file.size;
    if (file.size > PACKAGE_LIMITS.fileBytes || total > PACKAGE_LIMITS.totalBytes) throw new Error('Format package exceeds limits');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (ref.encoding === 'base64') {
      let binary = ''; for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      files[ref.path] = btoa(binary);
    } else files[ref.path] = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  }
  // Hash opt-out must not silently accept files replaced during the read.
  if (!verifiesSha256(policy)) for (const ref of declaration.files) {
    let dir = format; const parts = ref.path.split('/');
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    const file = await (await dir.getFileHandle(parts.at(-1)!)).getFile();
    const expected = ref.encoding === 'base64' ? new Blob([Uint8Array.from(atob(files[ref.path]), char => char.charCodeAt(0))]) : files[ref.path];
    if (file.size > PACKAGE_LIMITS.fileBytes || await algorithmHash(file) !== await algorithmHash(expected)) throw new ProductError('libraryCss.changed');
  }
  const data = { declaration, files, ...(policy ? { policy } : {}) };
  return validateRendererPackage({ ...data, fingerprint: await algorithmHash(canonicalFormatJson(data)) });
}
export type FormatServices = Record<string, (input: unknown, signal: AbortSignal) => Promise<unknown>>;
type Runner = { frame: HTMLIFrameElement; ready: Promise<MessagePort>; stop: () => void; requests: Map<string, { resolve: (result: PackageResult) => void; reject: (reason: Error) => void; finish: () => void; services: FormatServices; pause: () => void; resume: () => void; signal: AbortSignal; serviceActive?: boolean }> };
const runners = new Map<string, Runner>();
export function disposeRendererRunners() { for (const runner of runners.values()) runner.stop(); runners.clear(); }
function runnerFor(pkg: RendererPackage, authority: string, slot: string): Runner {
  const key = authority + ':' + pkg.fingerprint + ':' + slot;
  const known = runners.get(key); if (known) return known;
  if (runners.size >= 6) {
    const idle = [...runners.values()].find(runner => runner.requests.size === 0);
    if (!idle) throw new Error('Format renderer is busy');
    idle.stop();
  }
  const frame = document.createElement('iframe'); frame.src = '/format/article-package-sandbox.html'; frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:750px;height:2000px;border:0;pointer-events:none';
  const requests: Runner['requests'] = new Map(); let port: MessagePort | undefined, rejectReady: (reason: Error) => void = () => {}, stopped = false;
  const ready = new Promise<MessagePort>((resolve, reject) => {
    rejectReady = reject;
    frame.onload = () => {
      const channel = new MessageChannel(); port = channel.port1;
      port.onmessage = event => {
        if (event.data?.startupError) { stopped = true; frame.remove(); port?.close(); runners.delete(key); reject(new Error(String(event.data.startupError))); return; }
        if (event.data?.ready === true) { resolve(port!); return; }
        const pending = requests.get(event.data?.request); if (!pending) return;
        if (event.data.service) {
          const { service, call, input } = event.data;
          let size: number;
          try { size = JSON.stringify(input)?.length ?? 0; } catch { size = Infinity; }
          if (pending.serviceActive || size > PACKAGE_LIMITS.messageBytes) { port?.postMessage({ request: event.data.request, call, serviceError: 'Format service busy or input exceeds limits' }); return; }
          pending.serviceActive = true; pending.pause();
          void (async () => {
            try {
              if (typeof service !== 'string' || !Object.hasOwn(pending.services, service) || typeof call !== 'string') throw new Error('Format service unavailable');
              const value = await pending.services[service](input, pending.signal);
              if (JSON.stringify(value).length > PACKAGE_LIMITS.messageBytes) throw new Error('Format service result exceeds limits');
              if (requests.get(event.data.request) === pending) port?.postMessage({ request: event.data.request, call, value });
            } catch (error) { if (requests.get(event.data.request) === pending) port?.postMessage({ request: event.data.request, call, serviceError: error instanceof Error ? error.message : String(error) }); }
            finally { pending.serviceActive = false; if (requests.get(event.data.request) === pending) pending.resume(); }
          })();
          return;
        }
        try { if (event.data.error) throw new Error(String(event.data.error)); pending.resolve(validatePackageResult(materializePackageResources(pkg, validatePackageResult(event.data.result)))); }
        catch (error) { pending.reject(error instanceof Error ? error : new Error(String(error))); }
        finally { pending.finish(); }
      };
      frame.contentWindow?.postMessage({ protocol: pkg.declaration.protocol, pkg }, '*', [channel.port2]);
    };
  });
  const stop = () => {
    if (stopped) return; stopped = true; frame.remove(); port?.close(); rejectReady(new Error('Format package runner closed'));
    for (const request of requests.values()) { request.reject(new DOMException('Format request cancelled', 'AbortError')); request.finish(); }
    if (runners.get(key) === runner) runners.delete(key);
  };
  const runner = { frame, ready, requests, stop }; runners.set(key, runner); document.body.append(frame);
  return runner;
}
// Host-only layout declarations do not extend the pinned rainy-format/1 interpreter schema.
export function rendererContextPolicy(snapshot: Pick<FormatSnapshot, 'configuration' | 'rawBundle' | 'renderer'>) {
  const transport = <T extends ConfigurationMetadata>(value: T): T => {
    if (value.rendering?.previewWidth === undefined) return value;
    const { previewWidth, ...rendering } = value.rendering, { rendering: hostRendering, ...rest } = value;
    return { ...rest, ...(Object.keys(rendering).length ? { rendering } : {}) } as T;
  };
  const raw = snapshot.rawBundle;
  const configuration = snapshot.configuration ? { ...transport(snapshot.configuration) } : undefined;
  if (configuration && (!snapshot.renderer || !rendererUsesLibraryPaths(snapshot.renderer.declaration))) {
    delete configuration.validation; delete configuration.resources;
  }
  return { configuration, rawBundle: raw ? {
    ...raw, support: { ...raw.support, meta: transport(raw.support.meta) }, validator: { ...raw.validator, meta: transport(raw.validator.meta) }, formatter: { ...raw.formatter, meta: transport(raw.formatter.meta) },
  } : undefined };
}
export async function invokeRenderer(snapshot: FormatSnapshot, action: string, input: Record<string, unknown>, signal?: AbortSignal, services: FormatServices = {}): Promise<PackageResult> {
  const pkg = snapshot.renderer;
  const operation = pkg?.declaration.actions.find(a => a.id === action);
  if (!pkg || !operation) throw new Error('Format action unavailable');
  signal?.throwIfAborted();
  if (rendererUsesLibraryPaths(pkg.declaration) && action === 'markdown') {
    if (typeof input.source !== 'string') throw new ProductError('libraryContract.missingSource');
    return { data: input.source, extension: 'md', mime: 'text/markdown;charset=utf-8' };
  }
  if (typeof document === 'undefined') throw new Error('Format package requires a browser');
  const runner = runnerFor(pkg, snapshot.id, operation.kind), request = crypto.randomUUID();
  const payload = { ...input, context: { ...rendererContextPolicy(snapshot), algorithms: snapshot.algorithms, settings: pkg.declaration.values,
    environment: snapshot.environment ? { files: snapshot.environment.files, rawFiles: snapshot.environment.rawFiles, policy: snapshot.environment.policy, candidates: snapshot.environment.candidates } : null } };
  if (JSON.stringify(payload).length > PACKAGE_LIMITS.messageBytes) throw new Error('Format input exceeds limits');
  return new Promise((resolve, reject) => {
    const serviceController = new AbortController();
    const finish = () => { serviceController.abort(); clearTimeout(timer); signal?.removeEventListener('abort', abort); runner.requests.delete(request); };
    const abort = () => runner.stop();
    let timer = window.setTimeout(() => runner.stop(), PACKAGE_LIMITS.timeout);
    const pause = () => clearTimeout(timer), resume = () => { clearTimeout(timer); timer = window.setTimeout(() => runner.stop(), PACKAGE_LIMITS.timeout); };
    runner.requests.set(request, { resolve, reject, finish, services, pause, resume, signal: serviceController.signal }); signal?.addEventListener('abort', abort, { once: true });
    void runner.ready.then(port => { if (runner.requests.has(request)) port.postMessage({ request, action, input: payload, services: Object.keys(services) }); }).catch(error => { reject(error); finish(); });
  });
}
export const rendererAction = (snapshot: FormatSnapshot, kind: PackageAction['kind']) => snapshot.renderer?.declaration.actions.find(a => a.kind === kind);
const rendered = new Map<string, Promise<PackageResult>>();
export function renderPackage(source: string, theme: ThemeConfig, snapshot: FormatSnapshot, mode = 'light'): Promise<PackageResult> {
  const key = canonicalFormatJson([snapshot.id, snapshot.renderer?.fingerprint, snapshot.rawBundle, source, theme, mode, snapshot.environment?.fingerprint]);
  let result = rendered.get(key);
  if (!result) {
    result = invokeRenderer(snapshot, rendererAction(snapshot, 'render')!.id, { source, theme, mode }).then(value => {
      if (typeof value.html !== 'string' || typeof value.css !== 'string') throw new Error('Format renderer returned no HTML/CSS'); return value;
    });
    rendered.set(key, result); if (rendered.size > 8) rendered.delete(rendered.keys().next().value!);
    result.catch(() => { if (rendered.get(key) === result) rendered.delete(key); });
  }
  return result;
}
