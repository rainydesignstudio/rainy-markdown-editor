import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { UI_RESOURCES } from '../src/lib/i18n/runtime.ts';

const root = new URL('..', import.meta.url).pathname;
const files = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? files(file) : /\.(?:tsx?|mjs)$/.test(file) ? [file] : [];
});
const at = (value, key) => key.split('.').reduce((item, part) => item?.[part], value);
const productCalls = new Set(['ProductError', 'productMessage', 'productText', 'productLabel', 'productReference']);

/** Check source references, not just equality between the two dictionaries. */
export function localeCoverage() {
  const missing = [], parameters = [], dynamic = [], uncheckedParameters = [];
  let references = 0;
  for (const file of [...files(path.join(root, 'src')), ...files(path.join(root, 'scripts'))]) {
    const source = fs.readFileSync(file, 'utf8');
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const namespaces = new Set();
    const collect = node => {
      if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useUITranslation' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) namespaces.add(node.arguments[0].text);
      ts.forEachChild(node, collect);
    };
    collect(tree);
    const visit = node => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const call = node.expression.getText(tree), args = node.arguments ?? [];
        const isProduct = productCalls.has(call), isTranslation = call === 't';
        if ((isProduct || isTranslation) && args[0]) {
          const location = { file: path.relative(root, file), line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1 };
          if (!ts.isStringLiteral(args[0]) && !ts.isNoSubstitutionTemplateLiteral(args[0])) dynamic.push({ ...location, call, expression: args[0].getText(tree) });
          else {
            const raw = args[0].text;
            const namespace = isProduct ? 'messages' : raw.includes(':') ? raw.split(':')[0] : namespaces.size === 1 ? [...namespaces][0] : null;
            const key = isProduct || !raw.includes(':') ? raw : raw.slice(raw.indexOf(':') + 1);
            if (namespace) {
              references++;
              for (const locale of ['zh-CN', 'en-US']) {
                const catalog = UI_RESOURCES[locale][namespace];
                const values = [at(catalog, key), at(catalog, key + '_one'), at(catalog, key + '_other')].filter(value => typeof value === 'string');
                if (!values.length) missing.push({ ...location, locale, key: namespace + ':' + key });
                else {
                  const required = new Set(values.flatMap(value => [...value.matchAll(/{{\s*([^},\s]+)/g)].map(match => match[1])));
                  const options = args[1];
                  if (options && !ts.isObjectLiteralExpression(options)) uncheckedParameters.push({ ...location, key, expression: options.getText(tree) });
                  else if (!options || !options.properties.some(ts.isSpreadAssignment)) {
                    const supplied = new Set(options?.properties.map(property => property.name?.getText(tree).replace(/^['"]|['"]$/g, '')) ?? []);
                    for (const parameter of required) if (!supplied.has(parameter)) parameters.push({ ...location, locale, key: namespace + ':' + key, parameter });
                  } else uncheckedParameters.push({ ...location, key, expression: options.getText(tree) });
                }
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  return { references, missing, parameters, dynamic, uncheckedParameters };
}
