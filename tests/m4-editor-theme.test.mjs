import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

const {
  BASE_EDITOR_THEME,
  BUILTIN_EDITOR_THEMES,
  getBuiltinEditorThemes,
  EDITOR_COLOR_ROLES,
  composeLegacyEditorTheme,
  parseEditorThemeJson,
  resolveEditorThemeColors,
  resolveEditorThemeSurfaces,
  editorSurfaceTokens,
  validateEditorTheme,
} = await import('../src/lib/editorThemes.ts');
const { BASIC_THEME } = await import('../src/lib/themes.ts');
const { parseThemeConfigJson } = await import('../src/lib/themeValidation.ts');

function copy(value) { return JSON.parse(JSON.stringify(value)); }

test('every built-in editor theme supplies the same 34 roles for light and dark', () => {
  assert.equal(EDITOR_COLOR_ROLES.length, 34);
  assert.equal(BUILTIN_EDITOR_THEMES.length, 11);
  for (const theme of BUILTIN_EDITOR_THEMES) {
    assert.deepEqual(validateEditorTheme(theme), []);
    assert.deepEqual(Object.keys(theme.colors.light), EDITOR_COLOR_ROLES);
    assert.deepEqual(Object.keys(theme.colors.dark), EDITOR_COLOR_ROLES);
    assert.match(resolveEditorThemeColors(theme, 'light').canvas, /^#/);
  }
});

test('search highlight has independent scheme colors and old theme files inherit fluorescent yellow only in memory', () => {
  const old = copy(BASE_EDITOR_THEME);
  for (const mode of ['light', 'dark']) delete old.colors[mode]['search-hit'];
  const raw = JSON.stringify(old), loaded = parseEditorThemeJson(raw);
  assert.equal(JSON.stringify(old), raw);
  assert.notEqual(loaded.colors.light['search-hit'], loaded.colors.dark['search-hit']);
  for (const mode of ['light', 'dark']) assert.equal(resolveEditorThemeColors(loaded, mode)['search-hit'], '#eeff00');
  loaded.palette[loaded.colors.light['search-hit']] = '#ff00ff';
  assert.equal(resolveEditorThemeColors(loaded, 'light')['search-hit'], '#ff00ff');
  assert.equal(resolveEditorThemeColors(loaded, 'dark')['search-hit'], '#eeff00');
  assert.deepEqual(validateEditorTheme(loaded), []);
  assert.deepEqual(parseEditorThemeJson(JSON.stringify(loaded)), loaded);
});

test('new themes retain readable interface, button and source text in both schemes', () => {
  const luminance = (hex) => {
    const rgb = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  for (const theme of BUILTIN_EDITOR_THEMES) {
    const id = theme.id;
    for (const scheme of ['light', 'dark']) {
      const colors = resolveEditorThemeColors(theme, scheme);
      const paint = editorSurfaceTokens(colors, resolveEditorThemeSurfaces(theme)?.[scheme]);
      const pairs = [
        ['body', colors.primary, colors.canvas], ['panel', colors.primary, colors.panel],
        ['muted', colors.muted, colors.panel], ['popup', colors['popup-text'], colors['popup-bg']],
        ['source', colors['editor-text'], colors['editor-surface']],
        ['primary', paint['--color-action-text'], paint['--color-action']],
        ['primary-hover', paint['--color-action-text'], paint['--color-action-hover']],
        ['danger', colors.danger, paint['--color-danger-surface']],
        ['danger-hover', colors['on-danger'], colors.danger],
        ['selected', colors['accent-text'], colors['accent-soft']],
        ['success', colors.success, colors['success-surface']],
        ['warning', colors.warning, colors['warning-surface']],
        ['warning-strong', colors['warning-strong'], colors['warning-surface']],
      ];
      for (const [state, foreground, background] of pairs) {
        const [low, high] = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
        assert.ok((high + 0.05) / (low + 0.05) >= 4.5, `${id}/${scheme}/${state}`);
      }
    }
  }
});

test('bundled editor theme catalog contains the current library selection', () => {
  assert.deepEqual(BUILTIN_EDITOR_THEMES.map((theme) => theme.id), [
    'evening-snow', 'flowing-violet', 'sunshine', 'rose', 'ink-white', 'rainy-design-slate',
    'sea-glass', 'linen', 'evening-snow-ii', 'flowing-violet-ii', 'powder-pink',
  ]);
  assert.equal(BUILTIN_EDITOR_THEMES.some(theme => ['mist', 'dreaming', 'lime'].includes(theme.id)), false);
  const names = { 'sea-glass': ['雨青 · 彩调', 'Sea Glass · Color'], linen: ['纸衫 · 彩调', 'Linen · Color'], 'evening-snow-ii': ['霁蓝 · 彩调', 'Clear Blue · Color'], 'flowing-violet-ii': ['烟紫 · 彩调', 'Smoky Violet · Color'], rose: ['蔷薇', 'Rose'], 'powder-pink': ['粉黛 · 彩调', 'Powder Pink · Color'] };
  for (const [id, [zh, en]] of Object.entries(names)) {
    assert.equal(getBuiltinEditorThemes('zh-CN').find(theme => theme.id === id).name, zh);
    assert.equal(getBuiltinEditorThemes('en-US').find(theme => theme.id === id).name, en);
  }
});

test('regular Rose confines hue to accents and syntax while Powder Pink Color retains tinted structure', () => {
  const powder = BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'powder-pink');
  const rose = BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'rose');
  const linen = BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'linen');
  assert.deepEqual(powder.fonts, linen.fonts);
  for (const mode of ['light', 'dark']) {
    const resolved = resolveEditorThemeColors(rose, mode);
    for (const role of ['canvas', 'rail', 'list', 'panel', 'hover', 'popup-bg', 'primary', 'secondary', 'muted', 'faint', 'popup-text', 'line', 'line-strong', 'editor-surface', 'editor-text', 'editor-heading', 'editor-quote']) {
      const hex = resolved[role];
      assert.equal(hex.slice(1, 3), hex.slice(3, 5), mode + '/' + role);
      assert.equal(hex.slice(3, 5), hex.slice(5, 7), mode + '/' + role);
    }
    assert.match(powder.colors[mode].accent, /^pink-/);
    assert.match(rose.colors[mode].accent, /^rose-/);
    const tinted = resolveEditorThemeColors(powder, mode);
    for (const role of ['canvas', 'rail', 'editor-surface']) {
      const hex = tinted[role];
      assert.ok(hex.slice(1, 3) !== hex.slice(3, 5) || hex.slice(3, 5) !== hex.slice(5, 7), mode + '/' + role);
    }
  }
  assert.ok(Object.keys(rose.palette).every(key => !key.startsWith('pink-')));
  const sun = BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'sunshine');
  for (const role of ['ui', 'heading', 'subHeading', 'eyebrow', 'serif']) assert.match(sun.fonts[role], /^"Sen Local"/);
  for (const role of ['mono', 'editorSource', 'articleSource']) assert.match(sun.fonts[role], /^"Roboto Mono Local"/);
  assert.match(BUILTIN_EDITOR_THEMES.find(theme => theme.id === 'evening-snow').fonts.heading, /^"Noto Sans SC Local"/);
  assert.equal(BASE_EDITOR_THEME.id, 'sea-glass', 'catalog order must not change foundational-theme identity');
});

test('Ink White preserves monochrome non-feedback roles', () => {
  const theme = BUILTIN_EDITOR_THEMES.find((item) => item.id === 'ink-white');
  for (const scheme of ['light', 'dark']) {
    for (const [role, hex] of Object.entries(resolveEditorThemeColors(theme, scheme))) {
      if (role === 'search-hit') { assert.equal(hex, '#eeff00'); continue; }
      if (['success', 'success-surface', 'warning', 'warning-strong', 'warning-surface', 'warning-line', 'danger', 'on-danger'].includes(role)) continue;
      assert.equal(hex.slice(1, 3), hex.slice(3, 5), `${scheme}/${role}`);
      assert.equal(hex.slice(3, 5), hex.slice(5, 7), `${scheme}/${role}`);
    }
  }
});

test('editor theme parser rejects incomplete, unsafe, and article-theme inputs', () => {
  const incomplete = copy(BASE_EDITOR_THEME);
  delete incomplete.colors.dark['editor-quote'];
  assert.throws(() => parseEditorThemeJson(JSON.stringify(incomplete)), /缺少 editor-quote/);

  const unsafe = copy(BASE_EDITOR_THEME);
  unsafe.palette['sea-glass-100'] = 'url(https://example.test/style.css)';
  assert.throws(() => parseEditorThemeJson(JSON.stringify(unsafe)), /十六进制颜色/);

  const article = copy(BASE_EDITOR_THEME);
  article.kind = 'article-theme';
  assert.throws(() => parseEditorThemeJson(JSON.stringify(article)), /editor-theme/);

  const fontInjection = copy(BASE_EDITOR_THEME);
  fontInjection.fonts.ui = 'Sen; color: red';
  assert.throws(() => parseEditorThemeJson(JSON.stringify(fontInjection)), /不安全/);
});

test('legacy appearance composition preserves selected base palette, accent, and font', () => {
  const migrated = composeLegacyEditorTheme('linen', 'berry', 'serif');
  const linen = BUILTIN_EDITOR_THEMES.find((theme) => theme.id === 'linen');
  const legacyMist = parseEditorThemeJson(readFileSync(new URL('../resources/template/compatibility/editor-theme-mist-legacy.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateEditorTheme(migrated), []);
  assert.equal(resolveEditorThemeColors(migrated, 'light').canvas, resolveEditorThemeColors(linen, 'light').canvas);
  assert.equal(resolveEditorThemeColors(migrated, 'dark').accent, resolveEditorThemeColors(legacyMist, 'dark').accent);
  assert.equal(migrated.fonts.ui, linen.fonts.serif);
  assert.equal(migrated.fonts.heading, migrated.fonts.ui);
});

test('v1 theme reads upgrade only in memory, while v2 heading is required and independently validated', () => {
  const legacy = JSON.parse(readFileSync(new URL('../resources/template/compatibility/editor-theme-mist-legacy.json', import.meta.url), 'utf8'));
  legacy.formatVersion = 1; delete legacy.fonts.heading; delete legacy.fonts.eyebrow; delete legacy.fonts.subHeading; delete legacy.fonts.articleSource;
  const before = JSON.stringify(legacy);
  const normalized = parseEditorThemeJson(before);
  assert.equal(normalized.formatVersion, 4);
  assert.equal(normalized.fonts.heading, legacy.fonts.ui);
  for (const mode of ['light', 'dark']) for (const [role, value] of Object.entries(legacy.colors[mode])) assert.equal(normalized.colors[mode][role], value);
  for (const [key, value] of Object.entries(legacy.palette)) assert.equal(normalized.palette[key], value);
  assert.equal(resolveEditorThemeColors(normalized, 'light')['search-hit'], '#eeff00');
  assert.equal(JSON.stringify(legacy), before);
  assert.deepEqual(parseEditorThemeJson(JSON.stringify(normalized)), normalized);

  const missing = copy(BASE_EDITOR_THEME);
  delete missing.fonts.heading;
  assert.throws(() => parseEditorThemeJson(JSON.stringify(missing)), /缺少 heading/);
  const unsafe = copy(BASE_EDITOR_THEME);
  unsafe.fonts.heading = 'serif; background: url(evil)';
  assert.throws(() => parseEditorThemeJson(JSON.stringify(unsafe)), /不安全/);
  const unknown = copy(BASE_EDITOR_THEME);
  unknown.formatVersion = 5;
  assert.throws(() => parseEditorThemeJson(JSON.stringify(unknown)), /仅支持1、2、3或4/);
  legacy.fonts.heading = legacy.fonts.ui;
  assert.throws(() => parseEditorThemeJson(JSON.stringify(legacy)), /未知字段 heading/);
});

test('eyebrow fonts are independently configurable and old v2 files inherit UI fonts in memory', () => {
  const old = copy(BASE_EDITOR_THEME);
  old.formatVersion = 2; delete old.fonts.subHeading; delete old.fonts.articleSource;
  delete old.fonts.eyebrow;
  const source = JSON.stringify(old);
  const loaded = parseEditorThemeJson(source);
  assert.equal(loaded.fonts.eyebrow, old.fonts.ui);
  assert.equal(JSON.stringify(old), source);
  loaded.fonts.eyebrow = loaded.fonts.mono;
  const restored = parseEditorThemeJson(JSON.stringify(loaded));
  assert.equal(restored.fonts.eyebrow, loaded.fonts.mono);
  assert.equal(restored.fonts.ui, old.fonts.ui);
  const unsafe = copy(loaded);
  unsafe.fonts.eyebrow = 'sans-serif; color: red';
  assert.throws(() => parseEditorThemeJson(JSON.stringify(unsafe)), /eyebrow.*不安全/);
  for (const theme of BUILTIN_EDITOR_THEMES) assert.equal(theme.fonts.eyebrow, theme.fonts.ui, theme.id);
});

test('retained color/font baselines change only the approved dark hover role', () => {
  const baselines = {
    'sea-glass': 'da24061a113cda26b9ed403a70f91b4997c9abb7107378baf096ae5edbbd35f8',
    linen: '394cff3f032915e2f7c05442aee679b91f4264afdb03b5be4bf936261e74a7b0',
    'rainy-design-slate': '97f67e3192117f547db7a4366cd86155d19000b92538250316771d77d5881f16',
  };
  for (const [id, baseline] of Object.entries(baselines)) {
    const theme = BUILTIN_EDITOR_THEMES.find((item) => item.id === id);
    const { heading, subHeading, eyebrow, articleSource, ...fonts } = theme.fonts;
    assert.equal(heading, fonts.ui);
    assert.equal(eyebrow, fonts.ui);
    const colors = Object.fromEntries(['light', 'dark'].map((mode) => [mode, Object.entries(resolveEditorThemeColors(theme, mode)).filter(([role]) => role !== 'search-hit').map(([role, value]) => mode === 'dark' && role === 'accent-strong' && ['sea-glass', 'linen'].includes(id) ? { 'sea-glass': '#55797a', linen: '#708a5a' }[id] : value)]));
    const signature = createHash('sha256').update(JSON.stringify({ colors, fonts })).digest('hex');
    assert.equal(signature, baseline, id);
  }
});

test('Ink White uses Linen typography and retains semantic feedback while legacy Mist remains readable', () => {
  const mist = BUILTIN_EDITOR_THEMES.find((theme) => theme.id === 'ink-white');
  const legacy = parseEditorThemeJson(readFileSync(new URL('../resources/template/compatibility/editor-theme-mist-legacy.json', import.meta.url), 'utf8'));
  assert.deepEqual(mist.fonts, BUILTIN_EDITOR_THEMES.find((theme) => theme.id === 'linen').fonts);
  const feedback = ['success', 'success-surface', 'warning', 'warning-strong', 'warning-surface', 'warning-line', 'danger', 'on-danger'];
  for (const mode of ['light', 'dark']) {
    const colors = resolveEditorThemeColors(mist, mode);
    const oldColors = resolveEditorThemeColors(legacy, mode);
    for (const role of EDITOR_COLOR_ROLES) {
      if (role === 'search-hit') assert.equal(colors[role], '#eeff00');
      else if (role === 'on-danger') assert.equal(colors[role], mode === 'light' ? '#ffffff' : '#0a0a0a');
      else if (feedback.includes(role)) assert.equal(colors[role], oldColors[role]);
      else {
        const rgb = colors[role].match(/^#(..)(..)(..)$/).slice(1);
        assert.equal(rgb[0], rgb[1], `${mode}.${role}`);
        assert.equal(rgb[1], rgb[2], `${mode}.${role}`);
      }
    }
  }
  const migrated = composeLegacyEditorTheme('mist', 'berry', 'sans');
  for (const mode of ['light', 'dark']) assert.deepEqual(resolveEditorThemeColors(migrated, mode), resolveEditorThemeColors(legacy, mode));
});

test('removing Mist from the catalog preserves every supported legacy appearance combination', () => {
  for (const base of ['sea-glass', 'linen', 'mist']) for (const accent of ['teal', 'moss', 'berry']) for (const font of ['sans', 'serif']) {
    assert.deepEqual(validateEditorTheme(composeLegacyEditorTheme(base, accent, font)), []);
  }
});

test('published editor template includes an independent heading font and all fallback colors', () => {
  const template = parseEditorThemeJson(readFileSync(new URL('../resources/template/editor-theme-template.json', import.meta.url), 'utf8'));
  assert.deepEqual(template, getBuiltinEditorThemes('zh-CN').find(theme => theme.id === BASE_EDITOR_THEME.id));
  const composed = { ...template, id: 'mixed-heading-test', fonts: { ...template.fonts, heading: template.fonts.serif } };
  const restored = parseEditorThemeJson(JSON.stringify(composed));
  assert.equal(restored.fonts.heading, restored.fonts.serif);
  assert.notEqual(restored.fonts.heading, restored.fonts.ui);
  assert.deepEqual(restored.colors, template.colors);
});

test('existing article theme snapshots remain readable with or without the new kind marker', () => {
  const marked = { ...BASIC_THEME, kind: 'article-theme' };
  assert.equal(parseThemeConfigJson(JSON.stringify(marked)).kind, 'article-theme');
  const legacy = copy(marked);
  delete legacy.kind;
  assert.equal(parseThemeConfigJson(JSON.stringify(legacy)).id, 'basic');
});

test('Rainy Studio uses complete slate colors and verified complete Google fonts loaded from libraries', () => {
  const studio = BUILTIN_EDITOR_THEMES.find((theme) => theme.id === 'rainy-design-slate');
  assert.ok(studio);
  assert.equal(resolveEditorThemeColors(studio, 'light').accent, '#62748e');
  assert.equal(resolveEditorThemeColors(studio, 'dark').accent, '#90a1b9');
  for (const [family, asset, license] of [
    ['Sen Local', 'sen-variable.ttf', 'sen-OFL.txt'],
    ['Noto Sans SC Local', 'noto-sans-sc-variable.ttf', 'noto-sans-sc-OFL.txt'],
    ['Roboto Mono Local', 'roboto-mono-variable.ttf', 'roboto-mono-OFL.txt'],
  ]) {
    assert.ok(Object.values(studio.fonts).some((stack) => stack.includes(family)));
    const manifest = JSON.parse(readFileSync(new URL('../resources/font-sources.json', import.meta.url), 'utf8'));
    const font = manifest.fonts.find(item => item.file === asset);
    assert.equal(font.family, family);
    assert.equal(existsSync(new URL(`../public/fonts/${asset}`, import.meta.url)), false);
    assert.match(font.urls['google-fonts'], /^https:\/\/raw\.githubusercontent\.com\/google\/fonts\/[a-f0-9]{40}\//);
    assert.match(font.urls.jsdmirror, /^https:\/\/cdn\.jsdmirror\.com\/gh\/google\/fonts@[a-f0-9]{40}\//);
    assert.match(readFileSync(new URL(`../public/fonts/${license}`, import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE/);
  }
  const css = readFileSync(new URL('../src/styles/editor-theme.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.doesNotMatch(css, /@font-face/, 'font faces are loaded from the authorized data directory');
});

test('v3 migration preserves the writing font and splits code font without rewriting the source', () => {
  const old = copy(BASE_EDITOR_THEME);
  old.formatVersion = 3; delete old.fonts.articleSource;
  old.fonts.editorSource = '"Songti SC", serif';
  const raw = JSON.stringify(old), upgraded = parseEditorThemeJson(raw);
  assert.equal(upgraded.formatVersion, 4);
  assert.equal(upgraded.fonts.articleSource, old.fonts.editorSource);
  assert.equal(upgraded.fonts.editorSource, old.fonts.mono);
  assert.equal(JSON.stringify(old), raw);
  const incomplete = copy(upgraded); delete incomplete.fonts.articleSource;
  assert.throws(() => parseEditorThemeJson(JSON.stringify(incomplete)), /缺少 articleSource/);
});
