import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as history from '../src/lib/textInputHistory.ts';
import * as inlineFormatting from '../src/lib/editor/inlineFormatting.ts';
import * as nativeEdit from '../src/lib/nativeTextareaEdit.ts';
import { withUILocaleImports } from './ui-locale-fixture.mjs';

const source = await readFile(new URL('../src/hooks/useTextInputHistory.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

export function withTextInputHistory(resolve) {
  let react, hook;
  return withUILocaleImports(function require(id) {
    if (id.endsWith('/editor/inlineFormatting')) return inlineFormatting;
    if (id.endsWith('/useTextInputHistory')) {
      if (!hook) {
        const module = { exports: {} };
        vm.runInNewContext(code, { module, exports: module.exports, require(name) {
          if (name === 'react') return new Proxy({}, { get: (_target, key) => react[key] });
          if (name.endsWith('/textInputHistory')) return history;
          if (name.endsWith('/nativeTextareaEdit')) return nativeEdit;
          throw new Error(name);
        } });
        hook = module.exports;
      }
      return hook;
    }
    const result = resolve(id);
    if (id === 'react') react = result;
    return result;
  });
}
