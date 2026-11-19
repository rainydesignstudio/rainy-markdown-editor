import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as runtime from 'react/jsx-runtime';

const options = { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX };
const source = name => ts.transpileModule(readFileSync(new URL(`../src/components/global/${name}.tsx`, import.meta.url), 'utf8'), { compilerOptions: options }).outputText;
const buttonCode = source('Button');
const confirmCode = source('ConfirmDialog');
const barCode = source('ButtonBar');

// Expand shared stateless actions so existing behavior fixtures can still inspect native controls.
export function withActionComponents(resolve) {
  const components = new Set();
  const loaded = new Map();
  const adapt = (jsx, base) => (type, props, ...rest) => components.has(type) ? type(props) : base[jsx](type, props, ...rest);
  const load = (name, code) => {
    if (!loaded.has(name)) {
      const module = { exports: {} };
      vm.runInNewContext(code, { module, exports: module.exports, require(id) {
        if (id === './ContentIcon') return { ContentIcon: 'svg' };
        if (id === 'react/jsx-runtime') return { ...runtime, jsx: adapt('jsx', runtime), jsxs: adapt('jsxs', runtime) };
        return resolver(id);
      } });
      for (const component of Object.values(module.exports)) components.add(component);
      loaded.set(name, module.exports);
    }
    return loaded.get(name);
  };
  function resolver(id) {
    if (id.endsWith('/Button')) return load('Button', buttonCode);
    if (id.endsWith('/ConfirmDialog')) return load('ConfirmDialog', confirmCode);
    let value;
    try {
      value = resolve(id);
    } catch (error) {
      if (id.endsWith('/ButtonBar')) return load('ButtonBar', barCode);
      if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
      if (id.endsWith('/ContentIcon')) return { ContentIcon: 'svg' };
      if (id === './DialogFrame') return resolve('../global/DialogFrame');
      throw error;
    }
    if (id.endsWith('/ButtonBar') && !value?.ButtonBar) return load('ButtonBar', barCode);
    if (!value && id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
    if (!value && id.endsWith('/ContentIcon')) return { ContentIcon: 'svg' };
    if (id === 'react/jsx-runtime') return { ...value, jsx: adapt('jsx', value), jsxs: adapt('jsxs', value) };
    return value;
  }
  return resolver;
}
