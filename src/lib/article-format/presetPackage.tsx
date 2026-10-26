// Bundled into each new library. Its dependencies and semantics travel with that library.
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';
import rehypeSanitize from 'rehype-sanitize';
import { rehypeAlignSanitizedFragmentLinks } from '../articleTableOfContents';
import { articleMarkdownPlugins, articleHtmlPlugins } from './pipeline';
import { activateFormatBundle, getFormatSnapshot } from './runtime';
import { compileArticleStyles } from './renderer';
import { ArticleCodeBlock } from './ArticleCodeBlock';
import { inspectArticleFormatMarkdown, articleFormatMessage, standardFormatIssue } from '../articleFormat';
import { validateArticleUtilityClasses } from './renderer';
import { buildClipboardPayload } from './output';
import { createArticleColorNormalizer } from './colors';
import { parseArticle } from '../frontMatter';
import type { RawFormatBundle } from './config';
import { canonicalFormatJson, compileFormatBundle } from './config';
import { algorithmHash, validateAlgorithmPackage } from './algorithms';
import type { ThemeConfig } from '../types';
import type { ResolvedLibraryConfiguration } from './libraryConfiguration';
import type { AlgorithmPackage } from './algorithmTypes';
import type { PackageResult } from './packageContract';
import type { StylesheetEnvironment } from './styles';
import { loadStylesheetEnvironment } from './styles';
import type { RendererDeclaration } from './packageContract';
import { rendererUsesLibraryPaths } from './packageContract';
import type { ResourcePolicy } from './resourcePaths';
import type { RenderedInspection } from './frame';
import { articleCanvasToPdf } from '../articleVisualExport';

type Input = { source: string; theme: ThemeConfig; html?: string; css?: string; mode?: string; deep?: boolean; observations?: { complete: boolean; width: number; height: number }[]; context: { rawBundle: RawFormatBundle; configuration: ResolvedLibraryConfiguration; algorithms: AlgorithmPackage; settings: Record<string, unknown>; environment: Pick<StylesheetEnvironment, 'files' | 'rawFiles' | 'policy' | 'candidates'> | null } };
type API = { declaration: RendererDeclaration; files: Record<string, string>; load: (path: string) => Promise<void>; service: (name: string, input: unknown) => Promise<{ data: string; width: number; height: number; blockEnds: number[] }> };
type EngineWindow = typeof window & {
  ArticleColorNormalizer: typeof createArticleColorNormalizer;
  ArticleAlgorithm: { transform: (root: HTMLElement, context: unknown) => Promise<void>; inspect: (root: HTMLElement, rules: unknown[]) => Promise<{ ruleId: string; element: Element; outcome: string; detail?: string }[]> };
  ArticleAlgorithmHost: { run: (root: HTMLElement, bundle: ReturnType<typeof getFormatSnapshot>['bundle'], rules: unknown[]) => Promise<unknown> };
  Darkmode?: { reset: (nodes: HTMLElement[]) => void };
  ArticleFormatMeasure: (input: unknown) => Promise<unknown>;
  ArticleFormatEngine: { inspect: (root: HTMLElement, bundle: ReturnType<typeof getFormatSnapshot>['bundle'], css: string) => Promise<RenderedInspection> };
};
const globals = window as EngineWindow;
let engine: Promise<void> | undefined;
let contextKey = '';
let ownAlgorithms: Promise<AlgorithmPackage> | undefined;
let styleKey = '', ownStyles: Promise<StylesheetEnvironment> | undefined;
function packageStyles(bundle: RawFormatBundle, api: API, configuration: ResolvedLibraryConfiguration) {
  const policy = compileFormatBundle(bundle).formatter.stylesheets;
  if (!policy) return undefined;
  const key = canonicalFormatJson([policy, configuration.resources, api.declaration.protocol]);
  if (!ownStyles || styleKey !== key) {
    styleKey = key;
    const directory = (prefix = ''): FileSystemDirectoryHandle => ({
      name: prefix,
      async getDirectoryHandle(name: string) { const path = prefix ? prefix + '/' + name : name; if (!Object.keys(api.files).some(key => key.startsWith(path + '/'))) throw new DOMException('Undeclared style directory', 'NotFoundError'); return directory(path); },
      async getFileHandle(name: string) {
        const path = prefix ? prefix + '/' + name : name, value = api.files[path];
        if (value === undefined) throw new DOMException('Undeclared style file', 'NotFoundError');
        const ref = api.declaration.files.find(file => file.path === path);
        return { async getFile() { return new File([ref?.encoding === 'base64' ? Uint8Array.from(atob(value), char => char.charCodeAt(0)) : value], name); } } as FileSystemFileHandle;
      },
      async *entries() {
        const names = new Set(Object.keys(api.files).filter(path => !prefix || path.startsWith(prefix + '/')).map(path => path.slice(prefix ? prefix.length + 1 : 0).split('/')[0]));
        for (const name of names) { const path = prefix ? prefix + '/' + name : name; yield [name, { name, kind: Object.hasOwn(api.files, path) ? 'file' : 'directory' } as FileSystemHandle]; }
      },
    } as unknown as FileSystemDirectoryHandle);
    ownStyles = loadStylesheetEnvironment(directory(), policy, rendererUsesLibraryPaths(api.declaration) ? { aliases: configuration.resources?.aliases ?? {}, allowedPaths: api.declaration.files.map(file => file.path) } : undefined);
  }
  return ownStyles;
}
async function portablePackageCss(css: string, environment?: StylesheetEnvironment) {
  for (const asset of environment?.assets ?? []) {
    const bytes = new Uint8Array(await asset.blob.arrayBuffer()); let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    css = css.replaceAll(asset.url, 'data:' + asset.mime + ';base64,' + btoa(binary));
  }
  return css;
}
function packageAlgorithms(api: API, policy: ResourcePolicy): Promise<AlgorithmPackage> {
  return ownAlgorithms ??= (async () => {
    const prefix = rendererUsesLibraryPaths(api.declaration) ? 'format/algorithms/' : 'algorithms/';
    const manifest = JSON.parse(api.files[prefix + 'manifest.json'] ?? '{\"schemaVersion\":1,\"components\":[]}');
    const files = Object.fromEntries(manifest.components.flatMap((component: AlgorithmPackage['manifest']['components'][number]) => [...component.scripts, component.license]).map((file: { path: string }) => [file.path, api.files[manifest.schemaVersion === 2 ? file.path : prefix + file.path]]));
    return validateAlgorithmPackage({ manifest, files, fingerprint: await algorithmHash(canonicalFormatJson({ manifest, files })) }, policy);
  })();
}
function mount(html: string, css: string, observations?: Input['observations']) {
  let style = document.head.querySelector<HTMLStyleElement>('[data-package-style]');
  if (!style) { style = document.createElement('style'); style.dataset.packageStyle = ''; document.head.append(style); }
  const template = document.createElement('template'); template.innerHTML = html;
  if (observations) {
    for (const node of template.content.querySelectorAll('img,source')) {
      const set = node.getAttribute('srcset'); if (set) { node.setAttribute('data-clipboard-srcset', set); node.removeAttribute('srcset'); }
    }
    [...template.content.querySelectorAll('img')].forEach((image, index) => {
      const observation = observations[index];
      image.dataset.clipboardSrc = image.getAttribute('data-local-asset-src') ?? image.getAttribute('src') ?? '';
      image.removeAttribute('data-local-asset-src'); image.removeAttribute('data-inspection-src'); image.removeAttribute('data-asset-state');
      if (!observation?.complete) { image.removeAttribute('src'); return; }
      image.src = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${observation.width}" height="${observation.height}"/>`);
    });
  }
  style.textContent = css; document.body.replaceChildren(template.content);
  return document.querySelector<HTMLElement>('[data-article-content-root]') ?? document.body;
}
function markdown(source: string) {
  const snapshot = getFormatSnapshot(), formatter = snapshot.bundle.formatter;
  let plugins = articleHtmlPlugins(snapshot);
  // The empty preset imposes no platform control policy. Safety remains active.
  if (snapshot.bundle.validator.meta.enabled === false) {
    plugins = plugins.filter(p => !(Array.isArray(p) && p[0] === rehypeSanitize)).map(p => Array.isArray(p) && p[0] === rehypeAlignSanitizedFragmentLinks ? [rehypeAlignSanitizedFragmentLinks, { prefix: '' }] : p);
  }
  const html = renderToStaticMarkup(<ReactMarkdown remarkPlugins={articleMarkdownPlugins(snapshot)} remarkRehypeOptions={{ allowDangerousHtml: true }} rehypePlugins={plugins}
    components={{ code: ({ node: _node, children, className, ...props }) => {
      const language = /language-([\w-]+)/.exec(className ?? '')?.[1];
      return language && formatter.codeHighlight.engine === 'prism' ? <ArticleCodeBlock text={String(children)} language={language} formatter={formatter} /> : <code {...props} className={className}>{children}</code>;
    } }}>{source}</ReactMarkdown>);
  const template = document.createElement('template');
  template.innerHTML = snapshot.bundle.validator.meta.enabled === false ? DOMPurify.sanitize(html, { USE_PROFILES: { html: true, svg: true, mathMl: true }, ADD_TAGS: ['animate', 'animateTransform'], FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'base', 'link', 'meta', 'form'], FORBID_ATTR: ['srcdoc'], ADD_FORBID_CONTENTS: ['annotation-xml'] }) : html;
  template.content.querySelectorAll('link[rel="preload"]').forEach(node => node.remove());
  return template.innerHTML;
}
function documentMarkup(body: string, theme: ThemeConfig) {
  const policy = getFormatSnapshot().bundle.formatter.document;
  const root = policy?.root ?? { tag: 'article', classes: ['article-preview'] }, content = policy ? policy.body : { tag: 'div', classes: ['article-body'] };
  const attrs = (container: typeof root, extra: Record<string, string>) => ({ ...extra, id: container.id, className: container.classes.join(' ') });
  return renderToStaticMarkup(createElement(root.tag, attrs(root, { 'data-article-content-root': '', 'data-theme': theme.id }),
    policy?.beforeHtml ? <div data-preview-only dangerouslySetInnerHTML={{ __html: markdown(policy.beforeHtml) }} /> : null,
    content ? createElement(content.tag, { ...attrs(content, { 'data-article-content-body': '' }), dangerouslySetInnerHTML: { __html: body } }) : <div dangerouslySetInnerHTML={{ __html: body }} />,
    policy?.afterHtml ? <div data-preview-only dangerouslySetInnerHTML={{ __html: markdown(policy.afterHtml) }} /> : null));
}
export default async function invoke(action: string, input: Input, api: API): Promise<PackageResult> {
  const bundle = input.context.rawBundle;
  const environment = await packageStyles(bundle, api, input.context.configuration), env = environment?.fingerprint ?? null;
  const algorithms = await packageAlgorithms(api, input.context.configuration);
  const configuration = input.css === undefined ? { schemaVersion: 1 as const, meta: { id: bundle.support.meta.id }, ...input.context.configuration } : undefined;
  const key = canonicalFormatJson([bundle, algorithms.fingerprint, env, configuration]);
  if (contextKey !== key) { activateFormatBundle(bundle, 'package', 'library', environment, algorithms, 'library', configuration); contextKey = key; }
  const snapshot = getFormatSnapshot();
  const source = parseArticle(input.source).body;
  if (action === 'archive') { const result = await api.service('archive-source-v1', {}); return { data: result.data, encoding: 'base64', extension: 'zip', mime: 'application/zip' }; }
  if (action === 'png' || action === 'pdf') {
    const visual = snapshot.bundle.formatter.output.visual;
    const result = await api.service('capture-v1', { width: visual.width, maxCanvasSide: visual.maxCanvasSide, background: action === 'pdf' ? visual.pdfBackground : visual.pngBackground });
    if (action === 'png') return { data: result.data, encoding: 'base64', extension: 'png', mime: 'image/png' };
    const image = new Image(); image.src = 'data:image/png;base64,' + result.data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = result.width; canvas.height = result.height; canvas.getContext('2d')!.drawImage(image, 0, 0);
    const pdf = await articleCanvasToPdf(canvas, result.blockEnds, snapshot), bytes = new Uint8Array(await pdf.arrayBuffer());
    let binary = ''; for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return { data: btoa(binary), encoding: 'base64', extension: 'pdf', mime: 'application/pdf' };
  }
  if (action === 'markdown') return { data: input.source, extension: 'md', mime: 'text/markdown' };
  if (action === 'body') return { data: source, extension: 'md', mime: 'text/markdown' };
  if (action === 'format') return { source: input.source.replace(/[\t ]+$/gm, '') };
  const preview = snapshot.bundle.formatter.preview;
  const configured = input.mode === 'dark' ? preview.dark.background : preview.light.background;
  const background = configured === 'transparent' ? input.mode === 'dark' && input.theme.dark ? '#191919' : '#ffffff' : configured;
  const css = input.css ?? 'html,body{margin:0;font-family:' + (preview.fontFamily === 'inherit' ? 'system-ui,sans-serif' : preview.fontFamily) + ';color:' + preview.color + ';background:' + background + '}\n' + await portablePackageCss((await compileArticleStyles(source, input.theme, { snapshot })).css, environment);
  const html = input.html ?? documentMarkup(markdown(source), input.theme);
  if (action === 'render' && input.mode !== 'dark') return { html, css };
  if (action === 'html') return { data: '<!doctype html><html><head><meta charset="utf-8"><style>' + css.replace(/<\/style/gi, '<\\/style') + '</style></head><body>' + html + '</body></html>', extension: 'html', mime: 'text/html' };
  const root = mount(html, css, input.observations);
  if (action === 'copy') { const payload = buildClipboardPayload(root, snapshot); return { html: payload.html, text: payload.text }; }
  engine ??= api.load(rendererUsesLibraryPaths(api.declaration) ? 'format/engine.js' : 'engine.js'); await engine;
  globals.ArticleColorNormalizer = createArticleColorNormalizer;
  globals.ArticleFormatMeasure = input => api.service('measure-v1', input);
  globals.ArticleAlgorithmHost = { async run(root, bundle, rules) {
    const component = algorithms.manifest.components.find(c => c.id === bundle.formatter.preview.dark.transform);
    if (!component) throw new Error('Package algorithm missing');
    for (const file of component.scripts) await api.load(algorithms.manifest.schemaVersion === 2 ? file.path : (rendererUsesLibraryPaths(api.declaration) ? 'format/algorithms/' : 'algorithms/') + file.path);
    const nodes = [root, ...root.querySelectorAll<HTMLElement>('*')]; globals.Darkmode?.reset(nodes);
    await globals.ArticleAlgorithm.transform(root, { options: bundle.formatter.preview.dark.options, background: bundle.formatter.preview.dark.background, inlineProperties: bundle.formatter.output.inlineProperties });
    const paints = nodes.flatMap(node => { const computed = getComputedStyle(node); return bundle.formatter.output.inlineProperties.filter(name => /color|background|shadow|border|outline|text-(?:decoration|emphasis|stroke|fill)/.test(name)).map(name => [node, name, computed.getPropertyValue(name)] as const); });
    for (const [node, name, value] of paints) if (value) node.style.setProperty(name, value);
    return (await globals.ArticleAlgorithm.inspect(root, rules)).map(f => ({ ruleId: f.ruleId, node: nodes.indexOf(f.element as HTMLElement), outcome: f.outcome, detail: f.detail }));
  } };
  if (action === 'render') {
    if ((snapshot.bundle.formatter.preview.dark.mode ?? 'algorithm') === 'tokens' || snapshot.bundle.formatter.preview.dark.transform === 'preserve') { root.setAttribute('data-article-dark-tokens', 'true'); return { html: root.outerHTML, css }; }
    await globals.ArticleAlgorithmHost.run(root, snapshot.bundle, []);
    return { html: root.outerHTML, css };
  }
  if (action !== 'validate') throw new Error('Unknown package action');
  const passed = new Set<string>(), authoring = inspectArticleFormatMarkdown(source, 'Body', true, passed);
  const issues = [...authoring.issues, ...await validateArticleUtilityClasses(authoring.classes, 'Body', passed, authoring.classLines, input.theme)];
  let complete = true;
  if (input.deep) {
    const checked = await globals.ArticleFormatEngine.inspect(root, snapshot.bundle, css);
    checked.checked.forEach(id => passed.add(id));
    for (const finding of checked.issues) {
      const rule = snapshot.bundle.validator.rules.find(r => r.id === finding.ruleId);
      if (rule) { const issue = standardFormatIssue(rule, 'Rendered', finding.line, finding.detail); if (finding.outcome === 'incomplete') complete = false; if (finding.outcome === 'review') issue.tier = 'warning'; issues.push(issue); }
    }
    for (const resource of checked.resources ?? []) { complete = false; issues.push({ kind: 'element', name: 'Image', source: resource.source, line: resource.line, tier: 'error', message: 'Image ' + resource.reason }); }
    for (const id of checked.manual) { const item = snapshot.bundle.support.manualReview.find(r => r.id === id); if (item) issues.push({ kind: 'value', name: id, source: 'Review', tier: 'warning', message: item.title }); }
  }
  return { complete, passed: [...passed], issues: issues.map(issue => ({ message: issue.message || articleFormatMessage([issue]), severity: ['error', 'danger'].includes(issue.tier) ? 'error' : 'warning', ...(issue.line ? { line: issue.line } : {}) })) };
}
