import { array, boundedString, choice, libraryPath, mapping, number, shape, text, type Guard } from './contracts';
import { resolveLibraryResource, verifiesSha256, type ResourcePolicy } from './resourcePaths';
import { ProductError } from '../i18n/productMessages';

export const FORMAT_PROTOCOL = 'rainy-format/1' as const;
export const LIBRARY_FORMAT_PROTOCOL = 'rainy-format/2' as const;
export const PACKAGE_LIMITS = Object.freeze({ files: 256, fileBytes: 16 * 1024 * 1024, totalBytes: 32 * 1024 * 1024, messageBytes: 32 * 1024 * 1024, timeout: 30000 });
export type PackageAction = { id: string; label: string; kind: 'render' | 'validate' | 'format' | 'copy' | 'export'; extension?: string; mime?: string };
export type PackageSetting = { key: string; label: string; type: 'text' | 'number' | 'boolean' | 'select'; options?: string[] };
export type RendererDeclaration = {
  protocol: typeof FORMAT_PROTOCOL | typeof LIBRARY_FORMAT_PROTOCOL; id: string; version: string; entry: string;
  files: { path: string; sha256?: string; encoding?: 'base64' }[]; actions: PackageAction[];
  settings: PackageSetting[]; values: Record<string, string | number | boolean>;
  permissions: { images: string[]; styles?: string[]; fonts?: string[] };
};
export type RendererPackage = { declaration: RendererDeclaration; files: Record<string, string>; fingerprint: string; policy?: ResourcePolicy };
export type PackageIssue = { message: string; severity: 'error' | 'warning' | 'info'; line?: number };
export type PackageResult = { html?: string; css?: string; text?: string; source?: string; data?: string; mime?: string; extension?: string; encoding?: 'base64' | 'utf8'; issues?: PackageIssue[]; passed?: string[]; complete?: boolean };
const identifier: Guard = (value, path) => { text(value, path); if (!/^[a-zA-Z0-9][\w.-]{0,79}$/.test(String(value))) throw new Error(`Invalid format package identifier: ${path}`); };
const scalar: Guard = (value, path) => { if (!(typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value))) throw new Error(`Invalid format setting: ${path}`); };
const hash: Guard = (value, path) => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`Invalid format package hash: ${path}`); };
export const packageOriginsGuard = array((origin, at) => {
  text(origin, at); if (origin === 'https:') return;
  const url = new URL(String(origin));
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error(`Invalid resource origin: ${at}`);
});
const exactChoice = (...values: string[]): Guard => (value, path) => { if (typeof value !== 'string') throw new Error(`Invalid format declaration: ${path}`); choice(...values)(value, path); };
export const rendererUsesLibraryPaths = (declaration: RendererDeclaration) => declaration.protocol === LIBRARY_FORMAT_PROTOCOL;
export const rendererFilePath = (declaration: RendererDeclaration, path: string) => rendererUsesLibraryPaths(declaration) ? path : 'format/' + path;
export function validateRendererDeclaration(value: unknown, path: string, policy?: ResourcePolicy): RendererDeclaration {
  const verify = verifiesSha256(policy);
  shape({ protocol: exactChoice(FORMAT_PROTOCOL, LIBRARY_FORMAT_PROTOCOL), id: identifier, version: text, entry: libraryPath,
    files: array(shape({ path: libraryPath, ...(verify ? { sha256: hash } : {}) }, { ...(!verify ? { sha256: boundedString(128) } : {}), encoding: exactChoice('base64') }), 1),
    actions: array(shape({ id: identifier, label: text, kind: exactChoice('render', 'validate', 'format', 'copy', 'export') }, { extension: identifier, mime: text }), 1),
    settings: array(shape({ key: identifier, label: text, type: exactChoice('text', 'number', 'boolean', 'select') }, { options: array(text, 1) })),
    values: mapping(scalar, identifier), permissions: shape({ images: packageOriginsGuard }, { styles: packageOriginsGuard, fonts: packageOriginsGuard }),
  })(value, path);
  const d = value as RendererDeclaration;
  const policyPrefix = rendererUsesLibraryPaths(d) ? 'format/' : '';
  if (rendererUsesLibraryPaths(d)) {
    for (const file of d.files) {
      if (resolveLibraryResource(file.path) !== file.path || /\.css$/i.test(file.path) && !file.path.startsWith('styles/')) throw new ProductError('libraryContract.path', { path: file.path });
    }
    if (resolveLibraryResource(d.entry) !== d.entry || !d.actions.some(a => a.id === 'markdown' && a.kind === 'export' && a.extension === 'md')) throw new ProductError('libraryContract.markdown');
  }
  for (const items of [d.files.map(x => x.path), d.actions.map(x => x.id), d.settings.map(x => x.key)]) if (new Set(items).size !== items.length) throw new Error('Duplicate format package declaration');
  if (d.files.length > PACKAGE_LIMITS.files || !d.files.some(f => f.path === d.entry) || !/\.m?js$/i.test(d.entry) || d.actions.filter(a => a.kind === 'render').length !== 1 || d.actions.filter(a => a.kind === 'validate').length !== 1 || d.actions.filter(a => a.kind === 'copy').length > 1) throw new Error('Incomplete format package declaration');
  const policies = ['format-support.json', 'validator.json', 'formatter.json'].map(name => policyPrefix + name);
  if (policies.some(name => !d.files.some(f => f.path === name))) throw new Error('Format package must include its policy trio');
  if (d.files.some(file => file.encoding && [d.entry, ...policies].includes(file.path))) throw new Error('Format entry and policies must be UTF-8 text');
  if (d.files.some(file => file.path === (policyPrefix + 'config.json'))) throw new ProductError('libraryContract.selfReference');
  if (d.permissions.images.length > 64 || d.actions.length > 64 || d.settings.length > 64) throw new Error('Format package declaration exceeds limits');
  for (const key of Object.keys(d.values)) if (!d.settings.some(s => s.key === key)) throw new Error(`Unknown format setting: ${key}`);
  for (const setting of d.settings) {
    const v = d.values[setting.key];
    if (v === undefined || (setting.type === 'select' ? typeof v !== 'string' || !setting.options?.includes(v) : typeof v !== setting.type.replace('text', 'string'))) throw new Error(`Invalid format setting: ${setting.key}`);
  }
  return d;
}
export const rendererDeclarationGuard: Guard = (value, path) => { validateRendererDeclaration(value, path); };
export function validatePackageResult(value: unknown): PackageResult {
  shape({}, { html: boundedString(PACKAGE_LIMITS.messageBytes), css: boundedString(PACKAGE_LIMITS.messageBytes), text: boundedString(PACKAGE_LIMITS.messageBytes), source: boundedString(PACKAGE_LIMITS.messageBytes), data: boundedString(PACKAGE_LIMITS.messageBytes), mime: text, extension: identifier, encoding: exactChoice('base64', 'utf8'),
    issues: array(shape({ message: text, severity: exactChoice('error', 'warning', 'info') }, { line: number(1, 10000000, true) })), passed: array(text), complete: (v) => { if (typeof v !== 'boolean') throw new Error('Invalid format completion'); },
  })(value, 'result');
  if (JSON.stringify(value).length > PACKAGE_LIMITS.messageBytes) throw new Error('Format result exceeds limits');
  return value as PackageResult;
}
