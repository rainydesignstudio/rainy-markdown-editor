import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...walk(node.props.children)] : [];
const jsx = (type, props) => ({ type, props });
const compile = async name => ts.transpileModule(await readFile(new URL('../src/components/editor/' + name + '.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exportForm = await compile('ArticleExportForm');

test('the shared original card form renders arbitrary declarations and a cancel icon', () => {
  const context = { exports: {}, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
    if (id.endsWith('/UILocaleProvider')) return { useUITranslation: () => ({ t: key => key }) };
    return Object.fromEntries(['DialogFrame','DialogHeader','DialogButton','DialogFooter','DialogActions','ContentIcon'].map(name => [name,name]));
  } };
  vm.runInNewContext(exportForm, context);
  const selections = [];
  const tree = context.exports.ArticleExportForm({ choices: [{ id:'custom-doc', title:'Custom document', extension:'custom', detail:'application/custom' },{ id:'blocked', title:'Blocked', disabled:true }], selected:'custom-doc', onSelect:id=>selections.push(id), filename:{base:'稿件',name:'稿件.custom',onChange(){}}, busy:false, disabled:false, error:'', onSubmit(){}, onClose(){} });
  const nodes=walk(tree), radios=nodes.filter(node=>node.type==='input'&&node.props.type==='radio');
  assert.equal(radios.length,2); radios[0].props.onChange();radios[1].props.onChange();assert.deepEqual(selections,['custom-doc']);
  const cancel=nodes.find(node=>node.type==='DialogButton'&&walk(node.props.children).some(child=>child.type==='ContentIcon'&&child.props.name==='close'));
  assert.ok(cancel);assert.ok(nodes.some(node=>node.type==='fieldset'));assert.ok(nodes.some(node=>node.type==='form'));
});
