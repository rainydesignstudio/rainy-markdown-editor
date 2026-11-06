import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceRoots = ['src/styles', 'src/app', 'src/components'];
const sourceExtensions = new Set(['.css', '.js', '.jsx', '.ts', '.tsx']);
const expectedNumericGeometry = [
  'src/components/editor/ArticleInfoDialog.tsx md:grid-rows-[1fr_auto]',
  'src/components/editor/ArticleInfoDialog.tsx md:grid-rows-[auto_1fr]',
  'src/components/global/IconPopover.tsx max-w-[calc(100vw-1rem)]',
  'src/components/onboarding/GuideHandoff.tsx max-w-[calc(100%-12rem)]',
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
  'src/components/editor/InsertElementsMenu.tsx max-h-[min(32rem,70dvh)]',
  'src/styles/components-shell.css size-[29px]',
  'src/components/onboarding/EntryGuide.tsx grid-rows-[0fr]',
  'src/components/onboarding/EntryGuide.tsx :grid-rows-[1fr]',
  'src/components/onboarding/EntryGuide.tsx grid-rows-[0fr]',
  'src/components/onboarding/EntryGuide.tsx :grid-rows-[1fr]',
  'src/components/onboarding/EntryGuide.tsx grid-cols-[1fr_1fr]',
  'src/components/onboarding/EntryGuide.tsx h-[min(45vh,340px)]',
  'src/components/onboarding/EntryGuide.tsx min-h-[230px]',
  'src/components/onboarding/EntryGuide.tsx focus:shadow-[0_0_0_3px]',
  'src/components/onboarding/EntryGuide.tsx max-w-[calc(100%-10rem)]',
  'src/components/onboarding/GuideScene.tsx ease-[cubic-bezier(.22,1,.36,1)]',
  'src/components/onboarding/GuideScene.tsx origin-[251px_226px]',
  'src/components/onboarding/GuideScene.tsx duration-[500ms,650ms]',
  'src/components/onboarding/GuideScene.tsx ease-[cubic-bezier(.22,1,.36,1)]',
  'src/components/onboarding/GuideScene.tsx delay-[350ms,0ms]',
  'src/components/onboarding/GuideScene.tsx /scene:delay-[0ms,350ms]',
  'src/components/onboarding/GuideScene.tsx transform-[translateY(8px)]',
  'src/components/onboarding/GuideScene.tsx :transform-[translateY(0)]',
  'src/components/onboarding/GuideScene.tsx transform-[translate(72px,256px)_rotate(-15deg)]',
  'src/components/onboarding/GuideScene.tsx ease-[cubic-bezier(.22,1,.36,1)]',
  'src/components/onboarding/GuideScene.tsx /scene:transform-[translate(99px,261px)_rotate(-3deg)_scale(.8)]',
  'src/components/onboarding/GuideScene.tsx transform-[translate(379px,160px)_rotate(24deg)]',
  'src/components/onboarding/GuideScene.tsx ease-[cubic-bezier(.22,1,.36,1)]',
  'src/components/onboarding/GuideScene.tsx /scene:transform-[translate(373px,189px)_rotate(8deg)_scale(.92)]',
  'src/components/onboarding/GuideThemeDeck.tsx duration-[850ms,850ms,850ms,850ms,400ms]',
  'src/components/onboarding/GuideThemeDeck.tsx ease-[cubic-bezier(.2,0,0,1),cubic-bezier(.2,0,0,1),ease,ease,ease]',
  'src/components/onboarding/GuideThemeDeck.tsx ease-[cubic-bezier(.22,1,.36,1)]',
  'src/components/onboarding/GuideThemeDeck.tsx shadow-[0_12px_25px]',
  'src/components/onboarding/GuideThemeDeck.tsx duration-[850ms,850ms,850ms,300ms,300ms]',
  'src/components/onboarding/GuideThemeDeck.tsx ease-[cubic-bezier(.2,0,0,1),ease,ease,ease,ease]',
  'src/components/onboarding/GuideThemeDeck.tsx /deck:hover:shadow-[0_8px_20px]',
  'src/components/onboarding/GuideThemeDeck.tsx /deck:ease-[cubic-bezier(.22,1,.36,1)]',
  'src/components/onboarding/GuideThemeDeck.tsx rounded-[3px]',
  'src/styles/entry-guide.css tracking-[.08em]',
  'src/styles/entry-guide.css drop-shadow-[0_12px_24px]',
  'src/styles/entry-guide.css tracking-[-.03em]',
  'src/styles/entry-guide.css shadow-[inset_-3px_-3px]',
  'src/styles/entry-guide.css shadow-[inset_-3px_-3px]',
  'src/styles/entry-guide.css shadow-[0_6px_20px]',
  'src/styles/entry-guide.css transform-[translateY(-2px)]',
  'src/styles/entry-guide.css shadow-[0_8px_24px]',
  'src/styles/entry-guide.css duration-[350ms,700ms]',
  'src/styles/entry-guide.css ease-[cubic-bezier(.22,1,.36,1)]',
  'src/styles/entry-guide.css duration-[450ms,450ms,300ms]',
  'src/styles/entry-guide.css ease-[cubic-bezier(.22,1,.36,1)]',

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
