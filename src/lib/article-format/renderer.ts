import { ProductError, productMessage } from "../i18n/productMessages";
import { compile } from 'tailwindcss';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { getFormatSnapshot, assertFormatReady, assertCurrentFormat, type FormatSnapshot } from './runtime';
import { canonicalFormatJson } from './config';
import { definedCssClasses, normalizeLibraryPath, type StylesheetEnvironment } from './styles';
import { MERMAID_IMAGE_CLASSES } from './mermaid';
import { extractClassCandidates, extractMarkdownClassCandidates } from './output';
import { BASIC_THEME, themeToCss } from '../themes';
import { validateThemeConfig } from '../themeValidation';
import { validateArticleFormatCss, type ArticleFormatIssue } from '../articleFormat';
import type { ThemeConfig } from '../types';
import { TAILWIND_THEME_CSS, TAILWIND_UTILITIES_CSS, TAILWIND_PREFLIGHT_CSS, TAILWIND_INDEX_CSS, TAILWIND_COMPILER_VERSION } from '../tailwind-assets';
import { renderPackage } from './package';
import { assertPackageCss } from './packageRendering';
import { parseArticle } from '../frontMatter';
import { resolveLibraryResource } from './resourcePaths';

type Compiler = Awaited<ReturnType<typeof compile>>;
const cache = new Map<string, Promise<{ css: string; candidates: string[] }>>();
const stats = { baseCompiles: 0, hits: 0 };
export function articleStyleCacheStats() { return { ...stats, entries: cache.size }; }
export function clearArticleStyleCache() { cache.clear(); stats.baseCompiles = 0; stats.hits = 0; }
function stylesheetLoader(id: string, base: string) {
  const normalized = id.replace(/\.css$/, '');
  if (normalized === 'tailwindcss/theme' || normalized === './theme' || normalized === 'tailwindcss') return { path: 'virtual:tailwindcss/theme.css', base, content: TAILWIND_THEME_CSS };
  if (normalized === 'tailwindcss/utilities' || normalized === './utilities') return { path: 'virtual:tailwindcss/utilities.css', base, content: TAILWIND_UTILITIES_CSS };
  throw new Error('M1 浏览器编译器拒绝未知 @import：' + id);
}
const BUILTINS: Record<string, string> = { 'index.css': TAILWIND_INDEX_CSS, 'theme.css': TAILWIND_THEME_CSS, 'preflight.css': TAILWIND_PREFLIGHT_CSS, 'utilities.css': TAILWIND_UTILITIES_CSS };
function libraryStylesheetLoader(environment: StylesheetEnvironment, id: string, base: string) {
  const builtin = id === 'tailwindcss' ? 'index.css' : id.startsWith('tailwindcss/') ? id.slice('tailwindcss/'.length) : base === '/@tailwind' ? id.replace(/^\.\//, '') : null;
  if (builtin) {
    if (!Object.hasOwn(BUILTINS, builtin)) throw new Error('不支持的Tailwind内置样式：' + id);
    return { path: '/@tailwind/' + builtin, base: '/@tailwind', content: BUILTINS[builtin] };
  }
  const path = environment.resolution ? resolveLibraryResource(id, environment.resolution) : normalizeLibraryPath(id, base.replace(/^\//, ''));
  if (!Object.hasOwn(environment.files, path)) throw new Error('CSS依赖未加载：' + path);
  return { path: '/' + path, base: '/' + path.split('/').slice(0, -1).join('/'), content: environment.files[path] };
}
export function renderContainerSelector(container: { tag: string; id?: string; classes: string[] }): string {
  const escape = (text: string) => text.replace(/[^a-zA-Z0-9_-]/g, char => '\\' + char);
  return container.id ? '#' + escape(container.id) : container.tag + container.classes.map(name => '.' + escape(name)).join('');
}
function themeCssForDocument(theme: ThemeConfig, snapshot: FormatSnapshot): string {
  if (snapshot.configuration?.rendering.styleAuthority === 'library') return '';
  const css = themeToCss(theme, snapshot);
  const document = snapshot.bundle.formatter.document;
  if (!document) return css;
  const root = renderContainerSelector(document.root);
  const body = document.body ? root + ' ' + renderContainerSelector(document.body) : root;
  const sheet = postcss.parse(css);
  sheet.walkRules(rule => {
    const parsed = selectorParser().astSync(rule.selector);
    const selectors = parsed.nodes.map(selector => selector.toString().trim()
      .replace(/^(?:article)?\.article-preview\s+\.article-body\b/, body)
      .replace(/^(?:article)?\.article-preview\b/, root));
    rule.selector = selectors.join(', ');
  });
  return sheet.toString();
}
async function createCompiler(theme: ThemeConfig, snapshot: FormatSnapshot = getFormatSnapshot(), environment = snapshot.environment): Promise<Compiler> {
  const errors = validateThemeConfig(theme);
  if (errors.length) throw new Error('主题配置校验失败：' + errors.join('；'));
  if (snapshot.bundle.formatter.stylesheets && !environment) throw new ProductError("tailwind.theStylesheetEnvironmentDeclaredByTheLibraryIsNotLoaded");
  if (environment) {
    const entry = environment.policy.entry;
    const themeCss = await environment.resolveCss(themeCssForDocument(theme, snapshot), 'themes/article-themes/' + theme.id + '.json');
    return compile(environment.files[entry] + '\n' + themeCss, {
      base: '/' + entry.split('/').slice(0, -1).join('/'),
      loadStylesheet: async (id, base) => libraryStylesheetLoader(environment, id, base),
      loadModule: async () => { throw new ProductError("tailwind.libraryStylesDoNotExecuteJsConfigurationOrPlugins"); },
    });
  }
  return compile('@layer theme, base, components, utilities;\n@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities);\n' + themeCssForDocument(theme, snapshot),
    { base: '/', loadStylesheet: async (id, base) => stylesheetLoader(id, base) });
}
function generatedClasses(snapshot: FormatSnapshot): string[] {
  const formatter = snapshot.bundle.formatter;
  return [
    ...(formatter.document?.root.classes ?? ['article-preview']),
    ...(formatter.document?.body?.classes ?? ['article-body']),
    ...extractClassCandidates((formatter.document?.beforeHtml ?? '') + (formatter.document?.afterHtml ?? '') + (formatter.codeLayout?.copyHtml ?? '')),
    ...(formatter.codeLayout?.wrapperClasses ?? []), ...(formatter.codeLayout?.contentClasses ?? []), ...(formatter.codeLayout?.copyClasses ?? []),
    ...(formatter.nodes?.image.classes ?? []), ...(formatter.nodes?.link.classes ?? []),
    ...(formatter.mermaid ? MERMAID_IMAGE_CLASSES.split(' ') : []),
    ...(snapshot.environment?.candidates ?? []),
  ];
}
export async function compileArticleStyles(markdown: string, theme: ThemeConfig, options?: { snapshot?: FormatSnapshot; environment?: StylesheetEnvironment }) {
  const snapshot = options?.snapshot ?? getFormatSnapshot(); assertFormatReady(snapshot);
  if (snapshot.renderer) {
    const result = await renderPackage(parseArticle(markdown).body, theme, snapshot);
    assertCurrentFormat(snapshot); assertPackageCss(result.css!, snapshot.renderer?.declaration.permissions);
    return { css: result.css!, candidates: extractMarkdownClassCandidates(markdown) };
  }
  const environment = options?.environment ?? snapshot.environment;
  const candidates = [...new Set([...extractMarkdownClassCandidates(markdown), ...generatedClasses(snapshot)])].sort();
  const key = TAILWIND_COMPILER_VERSION + ':' + snapshot.id + ':' + snapshot.algorithms.fingerprint + ':' + (environment?.fingerprint ?? 'legacy') + ':' + canonicalFormatJson(theme) + ':' + JSON.stringify(candidates);
  let pending = cache.get(key);
  if (pending) stats.hits++;
  else {
    pending = (async () => {
      stats.baseCompiles++;
      // Each candidate set gets a fresh compiler; Tailwind's build() otherwise retains old candidates.
      const compiler = await createCompiler(theme, snapshot, environment);
      const output = compiler.build(candidates);
      const built = environment ? await environment.resolveCss(output, environment.policy.entry) : output;
      const dropped = snapshot.bundle.formatter.output.dropCssProperties;
      const sheet = dropped.length ? postcss.parse(built) : null;
      sheet?.walkDecls(declaration => { if (dropped.includes(declaration.prop.toLowerCase())) declaration.remove(); });
      return { css: sheet?.toString() ?? built, candidates };
    })();
    cache.set(key, pending);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
    pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
  }
  const result = await pending;
  assertCurrentFormat(snapshot);
  return result;
}
function compiledRules(css: string): Set<string> {
  const rules = new Set<string>();
  postcss.parse(css).walkRules(rule => { rules.add(rule.toString()); });
  return rules;
}
export async function validateArticleUtilityClasses(classes: string[], _label: string, passed?: Set<string>, classLines?: Map<string, number[]>, theme: ThemeConfig = BASIC_THEME): Promise<ArticleFormatIssue[]> {
  if (!classes.length) return [];
  const snapshot = getFormatSnapshot(); assertFormatReady(snapshot);
  const known = new Set([...(snapshot.environment?.classes ?? []), ...(snapshot.configuration?.rendering.styleAuthority === 'library' ? [] : definedCssClasses(theme.css))]);
  const compiler = await createCompiler(theme, snapshot);
  const checked: string[] = [];
  const baseline = compiler.build(generatedClasses(snapshot));
  for (const candidate of definedCssClasses(baseline)) known.add(candidate);
  let previous = compiledRules(baseline);
  const issues: ArticleFormatIssue[] = [];
  for (const candidate of classes) {
    if (known.has(candidate)) continue;
    const lines = classLines?.get(candidate);
    const atSource = (issue: ArticleFormatIssue): ArticleFormatIssue => {
      const { line: _compiledLine, lines: _compiledLines, ...rest } = issue;
      return { ...rest, ...(lines?.length ? { line: lines[0], lines } : {}) };
    };
    checked.push(candidate);
    const current = compiledRules(compiler.build([...generatedClasses(snapshot), ...checked]));
    const added = [...current].filter(rule => !previous.has(rule) && (() => {
      let paintsElement = false;
      postcss.parse(rule).walkDecls(declaration => { if (!declaration.prop.startsWith('--')) paintsElement = true; });
      return paintsElement;
    })());
    previous = current;
    if (!added.length) {
      if (snapshot.bundle.formatter.stylesheets?.allowUnknownClasses) continue;
      issues.push(atSource({ kind: 'value', name: candidate, source: '工具类 ' + candidate, sourceKind: 'utility', tier: 'unknown', ...productMessage('diagnostic.utilityUnavailable', { candidate }), domain: 'product' }));
      continue;
    }
    const portable = postcss.parse(added.join('\n'));
    portable.walkDecls(declaration => {
      if (declaration.prop.startsWith('--tw-')) declaration.remove();
      else declaration.prop = snapshot.bundle.formatter.css.utilityPropertyAliases[declaration.prop] ?? declaration.prop;
    });
    issues.push(...validateArticleFormatCss(portable.toString(), '工具类 ' + candidate, passed).map(issue => atSource({ ...issue, sourceKind: 'utility' })));
  }
  assertCurrentFormat(snapshot);
  return issues;
}
let inspectionUtilities: Promise<string> | undefined;
export function compileThemeInspectionUtilities(): Promise<string> {
  return inspectionUtilities ??= compile('@layer theme, utilities;\n@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities);',
    { base: '/', loadStylesheet: async (id, base) => stylesheetLoader(id, base) })
    .then(compiler => compiler.build(['transition-opacity', 'duration-300', 'data-[theme-inspection-dim=true]:opacity-50']));
}
