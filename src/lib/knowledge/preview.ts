import type { ReadonlyKnowledgeSource } from './source';
// A tooltip reads only a bounded prefix; the full safe reader remains the click target.
export async function readKnowledgePreview(source: ReadonlyKnowledgeSource, path: string) {
  const file = await source.readFile(path), prefix = file.slice(0, 64 * 1024), text = (await prefix.text()).replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim();
  await source.assertCurrent();
  return { text: text.slice(0, 900), truncated: file.size > prefix.size || text.length > 900 };
}
