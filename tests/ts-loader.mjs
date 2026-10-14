import { access, readFile } from 'node:fs/promises';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') && !/[.][a-z]+$/i.test(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      try {
        await access(candidate);
        return nextResolve(candidate.href, context);
      } catch {
        // Keep the original resolution error for non-TypeScript imports.
      }
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.md') && new URL(url).pathname.includes('/resources/template/fresh-library/templates/')) {
    return { format: 'module', shortCircuit: true, source: 'export default ' + JSON.stringify(await readFile(new URL(url), 'utf8')) + ';' };
  }
  return nextLoad(url, context);
}
