import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceRoots = ['src/styles', 'src/app', 'src/components'];
const sourceExtensions = new Set(['.css', '.js', '.jsx', '.ts', '.tsx']);
const expectedNumericGeometry = [
  'src/components/global/LibraryCard.tsx grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]',
  'src/components/knowledge/KnowledgeReferencePanel.tsx grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))]',
  'src/components/knowledge/KnowledgePage.tsx grid-cols-[auto_minmax(0,1fr)]',
  'src/components/knowledge/KnowledgePage.tsx grid-rows-[auto_minmax(0,1fr)]',
  'src/components/knowledge/KnowledgePage.tsx grid-rows-[auto_minmax(0,1fr)]',
  'src/components/knowledge/KnowledgePage.tsx grid-rows-[auto_minmax(0,1fr)]',
  'src/components/knowledge/KnowledgePage.tsx lg:grid-cols-[auto_minmax(0,1fr)]',
  'src/components/settings/EditorThemeDesigner.tsx md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)]',
  'src/components/global/Toast.tsx max-h-[calc(100dvh-4.5rem)]',
  'src/styles/components-controls.css duration-[500ms,500ms,attr(data-motion-ms_ms,240ms),attr(data-motion-ms_ms,240ms)]',
  'src/styles/components-controls.css ease-[ease-in-out,ease-in-out,cubic-bezier(.2,0,0,1),cubic-bezier(.2,0,0,1)]',
  'src/styles/components-dialog.css max-h-[min(90dvh,56rem)]',
  'src/styles/components-editor.css max-h-[min(32rem,70dvh)]',
  'src/styles/components-shell.css size-[29px]',
];

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectSourceFiles(fullPath));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

function scanNumericArbitraryValues(file, source) {
  const found = [];
  const lines = source.split('\n');
  const pattern = /([\w:/!.-]+-)\[([^\]\r\n]*)\]/g;
  for (const match of source.matchAll(pattern)) {
    const prefix = match[1];
    const value = match[2];
    if (/data-|aria-/.test(prefix) || !/\d/.test(value) || /\$\{|var\(/.test(value)) continue;
    const line = source.slice(0, match.index).split('\n').length;
    const relativePath = path.relative(projectRoot, file).split(path.sep).join('/');
    found.push({
      entry: `${relativePath} ${prefix}[${value}]`,
      location: `${relativePath}:${line}`,
      rationaleContext: lines.slice(Math.max(0, line - 4), line - 1).join('\n'),
    });
  }
  return found;
}

test('numeric arbitrary UI utilities are inventoried and carry inline geometry rationales', async () => {
  const files = (await Promise.all(sourceRoots.map((root) => collectSourceFiles(path.join(projectRoot, root))))).flat();
  const found = [];
  for (const file of files) found.push(...scanNumericArbitraryValues(file, await readFile(file, 'utf8')));

  assert.deepEqual(found.map((item) => item.entry).sort(), expectedNumericGeometry.sort());
  for (const item of found) {
    assert.match(item.rationaleContext, /Geometry rationale:/, `${item.location} ${item.entry} needs a local reason`);
  }
});
