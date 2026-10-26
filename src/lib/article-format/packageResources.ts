import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import type { PackageResult, RendererPackage } from './packageContract';
import { PACKAGE_LIMITS } from './packageContract';
import { assertDeclaredResource, resolveLibraryResource } from './resourcePaths';
import { STYLE_LIMITS } from './styles';
import { ProductError } from '../i18n/productMessages';
import { articleImageSourceSetCandidates, replaceArticleImageSourceSetUrls } from '../articleMedia';

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf' };
const external = (path: string) => !path || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(path);

/** Resolve only declared library resources; emitted documents need no alias runtime. */
export function materializePackageResources(pkg: RendererPackage, result: PackageResult): PackageResult {
  if (pkg.declaration.protocol !== 'rainy-format/2') return result;
  const resolution = { aliases: pkg.policy?.resources?.aliases ?? {}, allowedPaths: pkg.declaration.files.map(file => file.path) };
  const references = new Map(pkg.declaration.files.map(file => [file.path, file]));
  const cssFiles = new Set<string>(), assets = new Map<string, string>();
  let cssBytes = 0, assetBytes = 0, expandedBytes = 0;
  const canonical = (uri: string) => {
    const path = resolveLibraryResource(uri, resolution); assertDeclaredResource(path, resolution); return path;
  };
  const asset = (uri: string) => {
    if (external(uri)) {
      if (/^blob:/i.test(uri)) throw new ProductError('libraryContract.blob');
      return uri;
    }
    const [name] = uri.split(/[?#]/), fragment = uri.includes('#') ? uri.slice(uri.indexOf('#')) : '';
    const path = canonical(name);
    let data = assets.get(path);
    if (!data) {
      const mime = MIME[path.split('.').at(-1)!.toLowerCase()], ref = references.get(path)!;
      if (!mime) throw new ProductError('libraryContract.resourceType', { path });
      const source = pkg.files[path];
      const bytes = ref.encoding === 'base64' ? Uint8Array.from(atob(source), char => char.charCodeAt(0)) : new TextEncoder().encode(source);
      assetBytes += bytes.byteLength;
      if (assets.size >= STYLE_LIMITS.assets || assetBytes > STYLE_LIMITS.assetBytes) throw new ProductError('libraryContract.resourceLimit');
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      data = `data:${mime};base64,${btoa(binary)}`; assets.set(path, data);
    }
    expandedBytes += data.length + fragment.length;
    if (expandedBytes > PACKAGE_LIMITS.messageBytes) throw new ProductError('libraryContract.resourceLimit');
    return data + fragment;
  };
  const css = (source: string, chain: string[] = []): string => {
    cssBytes += new TextEncoder().encode(source).byteLength;
    if (cssBytes > STYLE_LIMITS.cssBytes || chain.length >= STYLE_LIMITS.depth) throw new ProductError('libraryContract.cssLimit');
    const sheet = postcss.parse(source);
    sheet.walkAtRules('import', rule => {
      const nodes = valueParser(rule.params).nodes.filter(node => node.type !== 'space' && node.type !== 'comment');
      const first = nodes.shift();
      const uri = first?.type === 'string' || first?.type === 'word' ? first.value : first?.type === 'function' && first.value.toLowerCase() === 'url' ? valueParser.stringify(first.nodes).replace(/^(['"])(.*)\1$/, '$2') : null;
      if (uri === null) throw new ProductError('libraryContract.cssImport');
      if (external(uri)) return;
      const path = canonical(uri);
      if (!/\.css$/i.test(path) || references.get(path)?.encoding) throw new ProductError('libraryContract.cssDependency', { path });
      if (chain.includes(path)) throw new ProductError('libraryContract.cssCycle', { path: [...chain, path].join(' → ') });
      cssFiles.add(path); if (cssFiles.size > STYLE_LIMITS.cssFiles) throw new ProductError('libraryContract.cssFiles');
      let imported: postcss.ChildNode[] = postcss.parse(css(pkg.files[path], [...chain, path])).nodes;
      const wrappers: { name: string; params: string }[] = [];
      if (nodes[0]?.value === 'layer') {
        const layer = nodes.shift()!; wrappers.push({ name: 'layer', params: layer.type === 'function' ? valueParser.stringify(layer.nodes) : '' });
      }
      if (nodes[0]?.type === 'function' && nodes[0].value === 'supports') {
        const supports = nodes.shift() as valueParser.FunctionNode;
        const condition = valueParser.stringify(supports.nodes); wrappers.push({ name: 'supports', params: /^\s*(?:\(|not\b|selector\()/i.test(condition) ? condition : '(' + condition + ')' });
      }
      if (nodes.length) wrappers.push({ name: 'media', params: nodes.map(node => valueParser.stringify(node)).join(' ') });
      for (const wrapper of wrappers.reverse()) { const group = postcss.atRule(wrapper); group.append(imported); imported = [group]; }
      rule.replaceWith(...imported);
    });
    sheet.walkDecls(declaration => {
      const parsed = valueParser(declaration.value);
      parsed.walk(node => {
        if (node.type !== 'function' || node.value.toLowerCase() !== 'url') return;
        const uri = valueParser.stringify(node.nodes).trim().replace(/^(['"])(.*)\1$/, '$2');
        const value = asset(uri);
        if (value !== uri) node.nodes = [{ type: 'string', quote: '"', value, sourceIndex: 0, sourceEndIndex: value.length }];
        return false;
      });
      declaration.value = parsed.toString();
    });
    return sheet.toString();
  };
  const html = (source: string) => {
    if (typeof document === 'undefined') throw new ProductError('libraryContract.htmlBrowser');
    const template = document.createElement('template'); template.innerHTML = source;
    for (const element of template.content.querySelectorAll('style')) element.textContent = css(element.textContent ?? '');
    for (const element of template.content.querySelectorAll('[style]')) {
      const declarations = css('article{' + element.getAttribute('style') + '}');
      element.setAttribute('style', declarations.slice(declarations.indexOf('{') + 1, declarations.lastIndexOf('}')));
    }
    for (const element of template.content.querySelectorAll('[src],[poster]')) for (const name of ['src', 'poster']) {
      const uri = element.getAttribute(name);
      if (uri && /^blob:/i.test(uri)) throw new ProductError('libraryContract.blob');
      if (uri && (uri.startsWith('@') || references.has(uri.split(/[?#]/)[0]))) element.setAttribute(name, asset(uri));
    }
    for (const element of template.content.querySelectorAll('[srcset]')) {
      const source = element.getAttribute('srcset')!;
      const replacements = new Map<string, string>();
      for (const { url } of articleImageSourceSetCandidates(source)) {
        if (/^blob:/i.test(url)) throw new ProductError('libraryContract.blob');
        if (url.startsWith('@') || references.has(url.split(/[?#]/)[0])) replacements.set(url, asset(url));
      }
      element.setAttribute('srcset', replaceArticleImageSourceSetUrls(source, replacements));
    }
    return template.innerHTML;
  };
  const output = { ...result };
  if (typeof output.css === 'string') output.css = css(output.css);
  if (typeof output.html === 'string') output.html = html(output.html);
  if (typeof output.data === 'string' && output.encoding !== 'base64' && (/^text\/html(?:;|$)/i.test(output.mime ?? '') || /^html?$/i.test(output.extension ?? ''))) {
    // Keep the document envelope when the browser template parser separates head/body.
    const parsed = new DOMParser().parseFromString(output.data, 'text/html');
    parsed.head.innerHTML = html(parsed.head.innerHTML); parsed.body.innerHTML = html(parsed.body.innerHTML);
    output.data = '<!doctype html>' + parsed.documentElement.outerHTML;
  }
  return output;
}
