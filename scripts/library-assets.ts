import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { libraryDirectory } from './library-directory.mjs';
import { initializeLibraryFormat, activateLibraryFormat, getPublicPlatformPreset } from '../src/lib/article-format/library';
import { activateFormatBundle } from '../src/lib/article-format/runtime';
import { initializeThemeDefaults } from '../src/lib/themeDefaults';
import { getBuiltinArticleThemes } from '../src/lib/themes';
import { saveStoredArticle, getStoredArticleDirectory, sanitizeFolderName, readStoredArticleById } from '../src/lib/fileSystem';
import { saveTemplateCategory, saveArticleTemplate } from '../src/lib/contentLibraries';
import { guideSampleSource, guideTemplateSource, GUIDE_PROFILES } from '../src/lib/entryGuide';
import { parseArticle } from '../src/lib/frontMatter';
import { rendererContextPolicy } from '../src/lib/article-format/package';
import { bindPackageInput } from '../src/lib/article-format/packageRendering';
import { prepareRenderRecord, persistRenderRecord, readRenderRecord, renderRecordMatches } from '../src/lib/article-format/renderRecords';
import { canonicalFormatJson } from '../src/lib/article-format/config';

const cwd = process.cwd(), target = path.join(cwd, 'public/prepared-library'), buildRoot = path.join(cwd, '.next/library-builder');
const time = '2000-01-01T00:00:00.000Z', month = '2000-01';
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const blobs = new Map<string, Uint8Array>();
const components: Record<string, { directories: string[]; files: Record<string, string>; sample?: { month: string; folder: string; themeId: string; themeVersion: string; templatePath: string } }> = {};
async function collect(root: string, prefix = '', files: Record<string, string> = {}, directories: string[] = []) {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const relative = prefix + entry.name, full = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw Error('Prepared library must not contain symlinks');
    if (entry.isDirectory()) { directories.push(relative); await collect(full, relative + '/', files, directories); }
    else { const bytes = new Uint8Array(await fs.readFile(full)), id = hash(bytes); blobs.set(id, bytes); files[relative] = id; }
  }
  return { directories: directories.sort(), files };
}
await fs.mkdir(target, { recursive: true });
await fs.mkdir(buildRoot, { recursive: true });
for (const locale of ['zh-CN', 'en-US']) {
  const text = JSON.parse(await fs.readFile(path.join(cwd, 'resources/locale', locale, 'onboarding.json'), 'utf8'));
  for (const profile of [null, ...GUIDE_PROFILES]) {
    for (const preset of profile ? [profile.preset] : ['wechat-article', 'empty']) {
      const id = `${locale}/${profile?.id ?? preset}`, disk = path.join(buildRoot, id);
      const seed = getPublicPlatformPreset(preset);
      activateFormatBundle(seed.bundle, 'build', 'built-in', undefined, seed.algorithms, 'built-in');
      await fs.rm(disk, { recursive: true, force: true }); await fs.mkdir(disk, { recursive: true });
      const root = libraryDirectory(disk) as FileSystemDirectoryHandle;
      const articleDir = await root.getDirectoryHandle('articles', { create: true });
      await articleDir.getDirectoryHandle('_history', { create: true });
      await initializeLibraryFormat(root, preset);
      await initializeThemeDefaults(root, locale, { previewSample: true, contentSeed: preset === 'empty' ? 'markdown' : 'rich' });
      await fs.mkdir(path.join(disk, 'assets/images'), { recursive: true });
      await fs.copyFile(path.join(cwd, 'public/images/article-sample.png'), path.join(disk, 'assets/images/article-sample.png'));
      let sample;
      if (profile) {
        const theme = getBuiltinArticleThemes(locale)[0], title = text.starterExamples[profile.id].title;
        await saveTemplateCategory(root, { id: 'entry-guide', name: text.templateCategory, description: '', order: 0 });
        await saveArticleTemplate(root, `entry-${profile.id}`, guideTemplateSource(text.profiles[profile.id].title, profile.sections.map(section => text.sections[section]), theme, time), null, 'entry-guide');
        const folder = sanitizeFolderName(title), source = guideSampleSource(title, text.starterExamples[profile.id].body, theme, time);
        const saved = await saveStoredArticle(root, source, theme, folder, month);
        if (!saved.article.themeValid || !saved.indexUpdated) throw Error('Build sample failed: ' + id);
        const loaded = await activateLibraryFormat(root, () => true), snapshot = loaded.snapshot;
        if (!snapshot?.renderer || snapshot.error) throw Error('Build format failed: ' + id);
        const pkg = snapshot.renderer;
        // Match the production sandbox's independent runtime for each library.
        const { default: invoke } = await import('data:text/javascript;base64,' + Buffer.from(pkg.files[pkg.declaration.entry]).toString('base64') + '#' + id);
        const output = await invoke('render', { source, theme, context: { ...rendererContextPolicy(snapshot), algorithms: snapshot.algorithms, settings: pkg.declaration.values, environment: null } } as never,
          { declaration: pkg.declaration, files: pkg.files, load: async () => { throw Error('Unexpected runtime script request in light build'); }, service: async () => { throw Error('Unexpected runtime service request in build'); } });
        if (typeof output.html !== 'string' || typeof output.css !== 'string') throw Error('Build render returned no output');
        const host = document.createElement('div'); host.innerHTML = output.html; document.body.append(host);
        const content = host.firstElementChild as HTMLElement;
        bindPackageInput(content, { source: parseArticle(source).body, theme, snapshot, css: output.css });
        for (const image of content.querySelectorAll('img')) image.dataset.localAssetSrc = image.getAttribute('src') ?? '';
        const prepared = await prepareRenderRecord(source, theme, host, output.css, { snapshot, root, articlePath: `articles/${month}/${folder}` });
        await persistRenderRecord(root, await getStoredArticleDirectory(root, month, folder), prepared);
        host.remove();
        const stored = await readStoredArticleById(root, month, folder), record = await readRenderRecord(await getStoredArticleDirectory(root, month, folder));
        if (!record || !await renderRecordMatches(record, stored.source, stored.theme)) throw Error('Build render identity mismatch: ' + id);
        sample = { month, folder, themeId: theme.id, themeVersion: theme.version, templatePath: `templates/entry-guide/entry-${profile.id}.md` };
      }
      components[id] = { ...await collect(disk), ...(sample ? { sample } : {}) };
      console.log('Prepared', id, Object.keys(components[id].files).length, 'files');
    }
  }
}
const metadata = { schemaVersion: 1, components, blobs: Object.fromEntries([...blobs].map(([id, bytes]) => [id, bytes.length])) };
const manifest = { ...metadata, fingerprint: hash(canonicalFormatJson(metadata)) };
await fs.mkdir(path.join(target, 'objects'), { recursive: true });
for (const [id, bytes] of blobs) await fs.writeFile(path.join(target, 'objects', id), bytes);
await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify(manifest) + '\n');
await fs.writeFile(path.join(cwd, 'resources/prepared-library.generated.json'), JSON.stringify(manifest) + '\n');
// Remove superseded generated objects so old fonts or samples cannot leak into a later package.
for (const entry of await fs.readdir(path.join(target, 'objects'), { withFileTypes: true })) {
  if (entry.isFile() && /^[a-f0-9]{64}$/.test(entry.name) && !blobs.has(entry.name)) await fs.unlink(path.join(target, 'objects', entry.name));
}
console.log('Prepared library:', Object.keys(components).length, 'components;', blobs.size, 'distinct objects;', [...blobs.values()].reduce((sum, bytes) => sum + bytes.length, 0), 'bytes');
