import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { DEFAULT_FORMAT_BUNDLE, canonicalFormatJson } from '../src/lib/article-format/config.ts';
import { DEFAULT_LIBRARY_CONFIGURATION, resolveLibraryConfiguration, validateLibraryConfiguration } from '../src/lib/article-format/libraryConfiguration.ts';

test('a library-root package retains the renderer protocol and resource restrictions in the nested interpreter', async () => {
  const file = await readFile(new URL('../src/lib/article-format/presetPackage.tsx', import.meta.url), 'utf8');
  const source = file.slice(file.indexOf('export default async function invoke(')).replace('export default ', '') + '\nglobalThis.invoke = invoke;';
  const policy = { ...DEFAULT_LIBRARY_CONFIGURATION, validation: { verifySha256: true }, resources: { aliases: { '@styles/': 'styles/' } }, capabilities: { ...DEFAULT_LIBRARY_CONFIGURATION.capabilities, exportPng: { enabled: false } } };
  const catalog = JSON.parse(await readFile(new URL('../resources/presets/platform/renderers.generated.json', import.meta.url), 'utf8'));
  const declaration = catalog['wechat-article'].declaration;
  const before = JSON.stringify(policy), observed = [], result = { data: 'zip' };
  let active;
  const context = { canonicalFormatJson, contextKey: '',
    packageStyles: async (_bundle, _api, configuration) => { observed.push(configuration); return undefined; },
    packageAlgorithms: async (_api, configuration) => { observed.push(configuration); return { fingerprint: 'fixture' }; },
    activateFormatBundle(bundle, _library, _source, _environment, _algorithms, _algorithmSource, configuration) {
      validateLibraryConfiguration(configuration); active = resolveLibraryConfiguration(bundle, configuration);
    }, getFormatSnapshot: () => ({}), parseArticle: value => ({ body: value }),
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  await context.invoke('archive', { source: '', context: { rawBundle: DEFAULT_FORMAT_BUNDLE, configuration: policy } }, { declaration, service: async () => result });
  assert.equal(observed.length, 2); assert.ok(observed.every(item => item === policy));
  assert.equal(active.capabilities.exportPng.enabled, false);
  assert.equal(active.resources.aliases['@styles/'], 'styles/'); assert.equal(active.validation.verifySha256, true); assert.equal(JSON.stringify(policy), before);
});
