import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { createUII18n } from '../../src/lib/i18n/runtime.ts';
import { productErrorMessage } from '../../src/lib/i18n/productMessages.ts';
import { formatKnowledgeIssue } from '../../src/lib/knowledge/errors.ts';
import { captureKnowledgeSelection } from '../../src/lib/knowledge/selection.ts';
import { inspectCapture, sortCollectedKnowledge, transferCollectedKnowledge, reorderCollectedKnowledge } from '../../src/lib/knowledge/research.ts';
import { ARTICLE_SORTS } from '../../src/lib/articleListSorting.ts';
import { diffLines } from '../../src/lib/textDiff.ts';

const whole = { id: 'whole', sourceId: 'source', title: 'Source A', path: 'a.md', content: 'Old text.', line: 1, endLine: 2, whole: true, note: '' };
const passage = { ...whole, id: 'passage', whole: false, line: 5, endLine: 7, content: 'A passage.' };
const initial = () => ({ schemaVersion: 1, sourceId: 'source', topics: [{ id: 'topic', name: 'Writing', note: 'Retained note', articleIds: [], items: [structuredClone(whole), structuredClone(passage)] }], citations: [] });
const tick = () => new Promise(setImmediate);
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
const walk = node => Array.isArray(node) ? node.flatMap(walk) : node?.props ? [node, ...(node.type === 'popover' && !node.props.open ? [] : walk(node.props.children)), ...(node.type === 'DialogHeader' ? walk(node.props.actions) : [])] : [];

async function fixture(name, props, { library, research, save } = {}) {
  const cells = [], portals = [], i18n = createUII18n('en-US'); let cursor = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], value => { cells[i] = typeof value === 'function' ? value(cells[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return cells[i] ??= { current: initial }; }, useMemo: callback => callback(), useEffect(callback) { if (research && callback.toString().includes('readResearch') && !callback.toString().includes('researchRevision')) callback(); },
  };
  if (library) library = { bindings: [{ ...library.connection.binding, directory: 'notes' }], indexed: { source: true }, selectedId: library.connection.binding.sourceId, ...library };
  if (library?.manifest) library.manifest = { diagnostics: [], diagnosticCount: 0, ...library.manifest };
  const t = i18n.getFixedT('en-US', 'knowledge'), target = {}, module = { exports: {} };
  const source = await readFile(new URL('../../src/components/knowledge/' + name + '.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, crypto, document: { body: target }, DOMException, require(id) {
      if (id === 'react') return react;
      if (id.endsWith('/SelectField')) return { SelectField: 'select-field' };
      if (id === 'react/jsx-runtime') return jsx;
      if (id === 'react-dom') return { createPortal(node, container) { portals.push(container); return node; } };
      if (id.endsWith('/UILocaleProvider')) return { useUITranslation: () => ({ t }), useUILocale: () => ({ locale: 'en-US' }) };
      if (id.endsWith('/useKnowledgeLibrary')) return { useKnowledgeLibrary: () => library };
      if (id.endsWith('/productMessages')) return { productErrorMessage };
      if (id.endsWith('/knowledge/errors')) return { formatKnowledgeIssue };
      if (id.endsWith('/knowledge/selection')) return { captureKnowledgeSelection };
      if (id.endsWith('/Toast')) return { useToast: () => () => {} };
      if (id.endsWith('/articleIdentity')) return { articleIdentityMap: async () => new Map() };
      if (id.endsWith('/PageHeading')) return { PageHeading: 'page-heading' };
      if (id.endsWith('/ContentIcon')) return { ContentIcon: 'content-icon' };
      if (id.endsWith('/LibraryCard')) return { LibraryCard: 'library-card', LibraryCardFrame: 'library-frame', LibraryCardGrid: 'div' };
      if (id.endsWith('/formatters')) return { formatUIDate: () => 'date' };
      if (id.endsWith('/CollapsiblePanel')) return { PanelHeading: 'panel-heading', PanelIcon: 'panel-icon' };
      if (id.endsWith('/ModeSwitch')) return { ModeSwitch: 'mode-switch' };
      if (id.endsWith('/IconButton')) return { IconButton: 'icon-button' };
      if (id.endsWith('/TooltipButton')) return { TooltipButton: 'tooltip-button' };
      if (id.endsWith('/IconPopover')) return { IconPopover: 'popover' };
      if (id.endsWith('/ButtonBar')) return { ButtonBar: 'group' };
      if (id.endsWith('/DialogFrame')) return Object.fromEntries(['DialogFrame', 'DialogHeader', 'DialogFooter', 'DialogActions', 'DialogButton'].map(key => [key, key === 'DialogButton' ? 'button' : key]));
      if (id.endsWith('/UnsavedChangesDialog')) return { UnsavedChangesDialog: 'unsaved-dialog' };
      if (id.endsWith('/articleListSorting')) return { ARTICLE_SORTS };
      if (id.endsWith('/KnowledgeReader')) return { KnowledgeReader: 'reader', KnowledgeExcerpt: 'excerpt' };
      if (id.endsWith('/knowledge/research')) return { inspectCapture, sortCollectedKnowledge, transferCollectedKnowledge, reorderCollectedKnowledge, readResearch: async () => research, async updateResearch(_root, _source, mutate) { if (save) return save(); const next = structuredClone(research); mutate(next); Object.assign(research, next); return next; } };
      if (id.endsWith('/textDiff')) return { diffLines };
      for (const [suffix, component] of Object.entries({ KnowledgeChanges: 'changes', KnowledgeRelations: 'relations', KnowledgeTopics: 'topics', KnowledgeReader: 'reader', KnowledgeSource: 'source-reader', KnowledgeGraph: 'graph' })) if (id.endsWith('/' + suffix)) return { [suffix]: component };
      throw new Error(id);
    },
  });
  const result = { t, props, portals, target, render() { cursor = 0; return walk(module.exports[name](props)); } };
  result.render(); await tick(); react.useEffect = () => {}; return result;
}

test('compact navigation retains every knowledge view, source recovery and expandable filters', async () => {
  const research = initial(), source = {}, library = { connection: { status: 'ready', binding: { name: 'Source', sourceId: 'source' }, source }, manifest: { documents: [{ path: 'a.md', title: 'A' }], scannedAt: 'date' }, busy: null, loading: false, query: '', filters: { phrase: '', exclude: '', title: '', path: '' }, searchActive: false };
  const f = await fixture('KnowledgePage', { root: {}, sessionKey: 1, isRootCurrent: () => true, onSettings() {} }, { library, research });
  let nodes = f.render();
  assert.equal(nodes.some(node => node.type === 'h1'), false, 'the workspace title is not repeated inside source controls');
  assert.ok(nodes.some(node => node.type === 'page-heading'));
  const tabs = nodes.filter(node => node.props.role === 'tab'); assert.equal(tabs.length, 5);
  assert.equal(nodes.some(node => node.type === 'select-field' && node.props['aria-label'] === f.t('view')), false);
  assert.equal(nodes.filter(node => node.type === 'input').length, 1);
  nodes.find(node => node.type === 'popover' && node.props.label === f.t('filters')).props.onToggle();
  nodes = f.render(); assert.equal(nodes.filter(node => node.type === 'input').length, 5);
  for (const [label, component] of [['topics', 'topics'], ['relations', 'relations'], ['changes', 'changes'], ['graph', 'graph']]) {
    f.render().find(node => node.props.role === 'tab' && text(node) === f.t('tabs.' + label)).props.onClick();
    assert.ok(f.render().some(node => node.type === component));
  }

});

test('source and document heading icons retain their names and toggle the compact rails', async () => {
  const library = { connection: { status: 'ready', binding: { name: 'Source', sourceId: 'source' }, source: {} }, manifest: { documents: [], scannedAt: 'date' }, busy: null, loading: false, query: '', filters: {}, searchActive: false };
  const f = await fixture('KnowledgePage', { root: {}, sessionKey: 1, isRootCurrent: () => true, onSettings() {} }, { library });
  for (const [label, icon, expand, collapse] of [['sources', 'book', 'expandSources', 'collapseSources'], ['tabs.documents', 'document', 'expandDocuments', 'collapseDocuments']]) {
    const trigger = () => f.render().find(node => node.type === 'tooltip-button' && node.props['aria-label'] === f.t(label));
    assert.equal(trigger().props.tooltip, f.t(label));
    assert.ok(walk(trigger()).some(node => node.type === 'content-icon' && node.props.name === icon));
    assert.equal(trigger().props['aria-expanded'], true);
    trigger().props.onClick();
    assert.equal(trigger().props['aria-expanded'], false);
    f.render().find(node => node.type === 'button' && node.props['aria-label'] === f.t(expand)).props.onClick();
    assert.equal(trigger().props['aria-expanded'], true);
    assert.ok(f.render().some(node => node.type === 'button' && node.props['aria-label'] === f.t(collapse)));
  }
});

test('reader collection separates selection and whole-source actions and preserves free citation adoption', async () => {
  const research = initial(), adopted = [], library = { connection: { status: 'ready', binding: { name: 'Source', sourceId: 'source' }, source: {} }, manifest: { documents: [], scannedAt: 'date' }, document: { path: 'a.md', title: 'A', text: 'A paragraph.\n\nAnother paragraph.', line: 1, truncated: false }, busy: null, loading: false, query: '', filters: {}, searchActive: false };
  const f = await fixture('KnowledgePage', { root: {}, sessionKey: 1, isRootCurrent: () => true, onSettings() {}, onAdopt: (...args) => adopted.push(args) }, { library, research });
  let nodes = f.render();
  assert.equal(nodes.some(node => node.type === 'popover' && node.props.label === f.t('collectToTopic')), false);
  nodes.find(node => node.type === 'select-field' && node.props.label === f.t('topicChoose')).props.onChange('topic');
  nodes = f.render();
  assert.equal(nodes.find(node => node.props.tooltip === f.t('collectPassage')).props.disabled, true, 'an unselected paragraph is never silently collected');
  nodes.find(node => node.props.tooltip === f.t('collectDocument')).props.onClick(); await tick();
  assert.equal(research.topics[0].items.length, 3);
  assert.equal(research.topics[0].items[2].whole, true);
  assert.equal(research.topics[0].items[2].content, library.document.text);
  f.render().find(node => node.props.tooltip === f.t('addCitation')).props.onClick();
  assert.equal(adopted[0][0].path, 'a.md'); assert.equal(adopted[0][1], false);
});

test('late research write failure from an unselected source cannot contaminate the new source view', async () => {
  let reject;
  const research = initial(), connection = { status: 'ready', binding: { name: 'Source', sourceId: 'source' }, source: {} };
  const library = { connection, manifest: { documents: [], scannedAt: 'date' }, busy: null, loading: false, query: '', filters: {}, searchActive: false };
  const f = await fixture('KnowledgePage', { root: {}, sessionKey: 1, isRootCurrent: () => true, onSettings() {} }, { library, research, save: () => new Promise((_resolve, fail) => { reject = fail; }) });
  f.render().find(node => node.props.role === 'tab' && text(node) === f.t('tabs.topics')).props.onClick();
  const pending = f.render().find(node => node.type === 'topics').props.onChange(() => {});
  connection.source = {}; f.render(); reject(new Error('old source failed'));
  assert.equal(await pending, false);
  assert.equal(f.render().some(node => node.props.role === 'alert'), false);
});

test('shelf previews open captured text, save notes, reorder by keyboard and open originals explicitly', async () => {
  const data = initial(), opened = [], props = { data, selected: 'topic', articles: [], busy: false, onSelect() {}, onOpen: (...args) => opened.push(args), async onChange(mutate) { const next = structuredClone(props.data); mutate(next); props.data = next; return true; } };
  const f = await fixture('KnowledgeTopics', props); let nodes = f.render();
  assert.ok(nodes.some(node => node.props.children === f.t('captureWhole')));
  assert.ok(nodes.some(node => node.props.children === f.t('captureLines', { start: 5, end: 7 })));
  assert.equal(nodes.some(node => node.type === 'details'), false);
  nodes.find(node => node.props.role === 'button' && node.props['aria-label'] === f.t('topicOpenCapture', { title: 'Source A' })).props.onClick();
  nodes = f.render(); assert.equal(nodes.find(node => node.type === 'reader').props.text, whole.content);
  nodes.find(node => node.type === 'icon-button' && node.props.tooltip === f.t('topicViewNote')).props.onClick();
  f.render().find(node => node.type === 'textarea' && node.props.value === '').props.onChange({ target: { value: 'My retained note' } });
  f.render().find(node => node.type === 'button' && text(node) === f.t('topicSaveNote')).props.onClick(); await tick();
  assert.equal(props.data.topics[0].items[0].note, 'My retained note');
  assert.ok(Number.isFinite(Date.parse(props.data.topics[0].items[0].updatedAt)));
  f.render().find(node => node.type === 'DialogFrame').props.onClose();
  const grip = () => { const handles = f.render().filter(node => node.type === 'icon-button' && node.props.tooltip === f.t('topicDragHelp')); return handles.find(node => node.props['aria-pressed']) ?? handles[0]; };
  grip().props.onKeyDown({ key: ' ', preventDefault() {} });
  grip().props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
  grip().props.onKeyDown({ key: 'Enter', preventDefault() {} }); await tick();
  assert.equal(props.data.topics[0].items[0].id, 'passage');
  f.render().find(node => node.type === 'button' && text(node) === 'Source A').props.onClick();
  f.render().find(node => node.type === 'icon-button' && node.props.tooltip === f.t('readOriginal')).props.onClick();
  assert.deepEqual(opened[0], ['a.md', 5]);
  assert.equal(data.topics[0].items[0].content, 'Old text.');
});

test('native source-selection callbacks enable passage collection without requiring a mouse or key event', async () => {
  const research = initial(), doc = { path: 'a.md', title: 'A', text: '# A\n\nA paragraph.\n', line: 1, truncated: false };
  const library = { connection: { status: 'ready', binding: { name: 'Source', sourceId: 'source' }, source: {} }, manifest: { documents: [], scannedAt: 'date' }, document: doc, busy: null, loading: false, query: '', filters: {}, searchActive: false };
  const f = await fixture('KnowledgePage', { root: {}, sessionKey: 1, isRootCurrent: () => true, onSettings() {} }, { library, research });
  f.render().find(node => node.type === 'select-field' && node.props.label === f.t('topicChoose')).props.onChange('topic');
  f.render().find(node => node.type === 'mode-switch').props.onToggle();
  const reader = f.render().find(node => node.type === 'source-reader');
  reader.props.textareaRef.current = { value: doc.text, selectionStart: 5, selectionEnd: 17 };
  reader.props.onSelection();
  let nodes = f.render(), action = nodes.find(node => node.props.tooltip === f.t('collectPassage'));
  assert.equal(action.props.disabled, false);
  action.props.onClick(); await tick();
  const item = research.topics[0].items.at(-1);
  assert.equal(item.content, 'A paragraph.'); assert.equal(item.line, 3); assert.equal(item.whole, false);
  assert.ok(Number.isFinite(Date.parse(item.createdAt))); assert.equal(item.createdAt, item.updatedAt);
});

test('shelf transfer actions select another same-source topic, copy or move captures, and removal never touches other topics', async () => {
  const data = initial(); data.topics.push({ id: 'other', name: 'Other shelf', note: '', articleIds: [], items: [] });
  const props = { data, selected: 'topic', articles: [], busy: false, onSelect() {}, onOpen() {}, async onChange(mutate) { const next = structuredClone(props.data); mutate(next); props.data = next; return true; } };
  const f = await fixture('KnowledgeTopics', props);
  const openFirst = () => f.render().find(node => node.props.role === 'button' && node.props.onClick).props.onClick();
  const transfer = async copy => {
    f.render().find(node => node.type === 'popover' && node.props.label === f.t('topicTransfer')).props.onToggle();
    const target = f.render().find(node => node.type === 'select-field' && node.props.label === f.t('topicTarget'));
    assert.deepEqual(Array.from(target.props.options, item => item.value), ['', 'other']);
    target.props.onChange('other');
    f.render().find(node => node.type === 'button' && text(node) === f.t(copy ? 'topicCopy' : 'topicMove')).props.onClick(); await tick();
  };
  openFirst(); await transfer(true);
  assert.equal(props.data.topics[0].items.length, 2); assert.equal(props.data.topics[1].items.length, 1);
  assert.notEqual(props.data.topics[1].items[0].id, whole.id);
  openFirst(); await transfer(false);
  assert.equal(props.data.topics[0].items.length, 1); assert.equal(props.data.topics[1].items[1].id, whole.id);
  openFirst(); f.render().find(node => node.type === 'icon-button' && node.props.tooltip === f.t('topicRemove')).props.onClick();
  assert.ok(f.render().some(node => node.props.children === f.t('topicRemoveHelp')));
  f.render().find(node => node.type === 'button' && text(node) === f.t('topicRemove')).props.onClick(); await tick();
  assert.equal(props.data.topics[0].items.length, 0); assert.equal(props.data.topics[1].items.length, 2);
  assert.equal(data.topics[0].items.length, 2, 'the original data object is not silently rewritten');
});

test('failed note saves keep the draft in its modal and use the shared unsaved-changes flow', async () => {
  const data = initial(), f = await fixture('KnowledgeTopics', { data, selected: 'topic', articles: [], busy: false, onSelect() {}, onOpen() {}, onChange: async () => false });
  f.render().find(node => node.props.role === 'button' && node.props.onClick).props.onClick();
  f.render().find(node => node.type === 'icon-button' && node.props.tooltip === f.t('topicViewNote')).props.onClick();
  f.render().find(node => node.type === 'textarea' && node.props.value === '').props.onChange({ target: { value: 'Keep this draft' } });
  f.render().find(node => node.type === 'button' && text(node) === f.t('topicSaveNote')).props.onClick(); await tick();
  assert.equal(data.topics[0].items[0].note, '');
  f.render().find(node => node.type === 'DialogFrame').props.onClose();
  let pending = f.render().find(node => node.type === 'unsaved-dialog'); assert.ok(pending);
  assert.equal(await pending.props.onSave(), false);
  assert.ok(f.render().some(node => node.type === 'textarea' && node.props.value === 'Keep this draft'));
  pending.props.onContinue();
  assert.equal(f.render().some(node => node.type === 'unsaved-dialog'), false);
});

test('source-change review opens outside clipping panes and never updates a snapshot on inspection or cancellation', async () => {
  const opened = []; let writes = 0;
  const f = await fixture('KnowledgeChanges', { data: initial(), source: { readFile: async () => ({ size: 20, text: async () => 'New text.' }) }, onOpen: (...args) => opened.push(args), async onChange() { writes++; return true; } });
  let nodes = f.render(); nodes.find(node => node.type === 'button' && text(node) === 'Source A').props.onClick();
  assert.deepEqual(opened[0], ['a.md', 1]);
  nodes.find(node => node.type === 'icon-button' && node.props.tooltip === f.t('reviewChanges')).props.onClick(); await tick();
  nodes = f.render(); assert.equal(f.portals.at(-1), f.target);
  assert.ok(nodes.some(node => node.type === 'DialogFrame'));
  nodes.find(node => node.type === 'button' && node.props.children === f.t('keepSnapshot')).props.onClick();
  assert.equal(f.render().some(node => node.type === 'DialogFrame'), false);
  assert.equal(writes, 0);
});


test('reading actions share the header, switch preserves source, and editor adoption remains available', async () => {
  const document = { path: 'a.md', title: 'A', text: '# A\n\nA paragraph.', line: 1, truncated: false };
  const imported = [], downloads = [];
  const library = { connection: { status: 'ready', binding: { name: 'Source', sourceId: 'source' }, source: {} }, manifest: { documents: [], scannedAt: 'date' }, document, busy: null, loading: false, query: '', filters: {}, searchActive: false, download: path => downloads.push(path) };
  const f = await fixture('KnowledgePage', { root: {}, sessionKey: 1, isRootCurrent: () => true, onSettings() {}, onImport: (...args) => imported.push(args), onAdopt() {} }, { library, research: initial() });
  let nodes = f.render();
  const header = nodes.find(node => node.type === 'header' && walk(node).some(child => child.props.tooltip === f.t('back')));
  const actions = walk(header).filter(node => node.type === 'icon-button');
  assert.deepEqual(actions.map(node => node.props.tooltip), ['back', 'showLineNumbers', 'messages:imports.fromKnowledgeButton', 'download', 'collectPassage', 'collectDocument', 'adoptExcerpt', 'addCitation'].map(key => f.t(key)));
  actions[2].props.onClick(); actions[3].props.onClick();
  assert.deepEqual(imported, [['a.md', 'source']]); assert.deepEqual(downloads, ['a.md']);
  assert.equal(nodes.some(node => node.props.children === f.t('readonly')), false);
  assert.ok(nodes.some(node => node.props.tooltip === f.t('addCitation')));
  actions[1].props.onClick();
  assert.equal(f.render().find(node => node.type === 'reader').props.showLineNumbers, true);
  const mode = nodes.find(node => node.type === 'mode-switch'); assert.equal(mode.props.checked, false);
  mode.props.onToggle(); nodes = f.render();
  assert.equal(nodes.find(node => node.type === 'source-reader').props.text, document.text);
  nodes.find(node => node.type === 'mode-switch').props.onToggle(); nodes = f.render();
  assert.ok(nodes.some(node => node.type === 'reader' && node.props.scrollRef));
  document.text = 'x'.repeat(128 * 1024 + 1);
  assert.equal(f.render().find(node => node.type === 'mode-switch').props.disabled, true);
});

test('collapsed document pagination keeps icon actions, bounds and every page reachable', async () => {
  const library = { connection: { status: 'ready', binding: { name: 'Source', sourceId: 'source' }, source: {} }, manifest: { documents: Array.from({ length: 201 }, (_, i) => ({ path: i + '.md', title: String(i) })), scannedAt: 'date' }, busy: null, loading: false, query: '', filters: {}, searchActive: false };
  const f = await fixture('KnowledgePage', { root: {}, sessionKey: 1, isRootCurrent: () => true, onSettings() {} }, { library });
  f.render().find(node => node.type === 'button' && node.props['aria-label'] === f.t('collapseDocuments')).props.onClick();
  let nodes = f.render();
  assert.equal(nodes.find(node => node.type === 'icon-button' && node.props.tooltip === f.t('previous')).props.disabled, true);
  nodes.find(node => node.type === 'icon-button' && node.props.tooltip === f.t('next')).props.onClick();
  nodes = f.render(); assert.ok(nodes.some(node => node.props.children === f.t('page', { page: 2, pages: 3 })));
  nodes.find(node => node.type === 'icon-button' && node.props.tooltip === f.t('next')).props.onClick();
  nodes = f.render(); assert.equal(nodes.find(node => node.type === 'icon-button' && node.props.tooltip === f.t('next')).props.disabled, true);
  nodes.find(node => node.type === 'icon-button' && node.props.tooltip === f.t('previous')).props.onClick();
  assert.ok(f.render().some(node => node.props.children === f.t('page', { page: 2, pages: 3 })));
});


test('a fast native drag persists the latest drop order before React has rendered intermediate events', async () => {
  const props = { data: initial(), selected: 'topic', articles: [], busy: false, onSelect() {}, onOpen() {}, async onChange(mutate) { const next = structuredClone(props.data); mutate(next); props.data = next; return true; } };
  const f = await fixture('KnowledgeTopics', props), nodes = f.render(), cards = nodes.filter(n => n.type === 'library-frame'), handle = nodes.find(n => n.props.draggable);
  const stored = new Map(), event = { preventDefault() {}, dataTransfer: { setData(k,v) { stored.set(k,v); }, getData(k) { return stored.get(k); } } };
  handle.props.onDragStart(event);
  cards[1].props.onDragOver(event);
  cards[1].props.onDrop(event);
  handle.props.onDragEnd(); await tick();
  assert.deepEqual(Array.from(props.data.topics[0].items, item => item.id), ['passage', 'whole']);
});
