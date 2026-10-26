import { bool, libraryPath, mapping, shape, type Guard } from './contracts';
import { ProductError } from '../i18n/productMessages';

export type ResourcePolicy = {
  validation?: { verifySha256: boolean };
  resources?: { aliases: Record<string, string> };
};
export type ResourceResolution = { aliases: Record<string, string>; allowedPaths: readonly string[] };

const directory: Guard = (value, at) => {
  if (typeof value !== 'string' || !value.endsWith('/')) throw new ProductError('libraryContract.directory', { path: at });
  if (resolveLibraryResource(value.slice(0, -1)) !== value.slice(0, -1)) throw new ProductError('libraryContract.directory', { path: at });
};
const alias: Guard = (value, at) => {
  if (typeof value !== 'string' || !/^@[a-zA-Z0-9_-]+\/$/.test(value)) throw new ProductError('libraryContract.alias', { path: at });
};
export const resourcePolicyGuards = {
  validation: shape({ verifySha256: bool }),
  resources: shape({ aliases: mapping(directory, alias) }),
};
export function validateResourcePolicy(value: unknown): ResourcePolicy {
  shape({}, resourcePolicyGuards)(value, 'resource policy');
  return value as ResourcePolicy;
}
export const verifiesSha256 = (policy?: ResourcePolicy) => policy?.validation?.verifySha256 !== false;
export function resourcePolicyOf(policy?: ResourcePolicy): ResourcePolicy | undefined {
  return policy?.validation || policy?.resources ? { ...(policy.validation ? { validation: policy.validation } : {}), ...(policy.resources ? { resources: policy.resources } : {}) } : undefined;
}

/** New-contract paths are library-relative, including CSS dependencies. */
export function resolveLibraryResource(input: string, resolution?: Pick<ResourceResolution, 'aliases'>): string {
  let path: string;
  try { path = decodeURIComponent(input); } catch { throw new ProductError('libraryContract.encoding'); }
  const prefix = Object.keys(resolution?.aliases ?? {}).filter(key => path.startsWith(key)).sort((a, b) => b.length - a.length)[0];
  if (prefix) path = resolution!.aliases[prefix] + path.slice(prefix.length);
  if (path.startsWith('@')) throw new ProductError('libraryContract.unknownAlias', { path: input });
  libraryPath(path, 'resource path');
  return path;
}
export function assertDeclaredResource(path: string, resolution?: ResourceResolution): void {
  if (resolution && !resolution.allowedPaths.includes(path)) throw new ProductError('libraryContract.undeclared', { path });
}
