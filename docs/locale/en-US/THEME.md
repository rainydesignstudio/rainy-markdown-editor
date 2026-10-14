# Creating themes, snippets and starter templates

English · [简体中文](../zh-CN/THEME.md) · [Project home](../../../README.md)

For Agents and authors creating Rainy Manuscript Workspace content. See [AGENT-GUIDE.md](AGENT-GUIDE.md) for installation/tutorials and [README.md](README.md) for the project introduction.

## Identify the deliverable

| Deliverable | Purpose | File format |
|---|---|---|
| editor-theme | Workspace/source colors and fonts | JSON; kind editor-theme, formatVersion 4 |
| article-theme | Article preview, layout and copied output | JSON; kind article-theme, formatVersion 1 |
| Snippet | Insertable Markdown/HTML fragment | JSON with content and trigger |
| Starter template | Complete starting point for a new article | Markdown with Front Matter |
| Complete article | Final body and article metadata | article.md with independent theme.json and images |

App version, theme `version` and `formatVersion` are separate. Use unique IDs to avoid built-in/user collisions. IDs/category directory names use lowercase letters, digits and hyphens, 1–48 characters, beginning with a letter or digit. Keep older article snapshots; changing the theme library must not replace an existing article's `theme.json`.

<a name="doc-editor-theme"></a>

## editor-theme: editor appearance

### Structure and fields

Save under `themes/editor-themes/<id>.json`. Import through **Settings → Appearance → Import JSON**, or use the designer. Select the theme and save appearance to adopt it.

| Field | Constraint |
|---|---|
| kind | editor-theme |
| id / name | Safe ID; name 1–80 characters |
| version | Three numeric components, such as 1.0.0 |
| formatVersion | Use 4 for new themes; the app normalizes supported older formats |
| palette | 1–128 entries with safe names and 3/6-digit HEX values without alpha |
| colors | Only light/dark; each includes all 33 roles below, referencing palette keys |
| fonts | All 8 roles below, each a nonempty safe font stack |
| surfaces | Optional; use defined fields/structure, or omit it entirely |

Color roles:

```text
canvas rail list panel hover popup-bg
primary secondary muted faint popup-text
line line-strong
accent accent-strong accent-text accent-soft accent-line selection on-accent
success success-surface
warning warning-strong warning-surface warning-line
danger on-danger
editor-surface editor-text editor-syntax editor-heading editor-quote
```

Font roles:

```text
ui serif mono editorSource articleSource heading subHeading eyebrow
```

Design the palette first, then map semantic roles. Do not put literal colors into `colors` or invent unimplemented roles. Design light/dark separately; Follow system is a display mode, not a third scheme in the file.

`ui` serves interface text; `heading`, `subHeading` and `eyebrow` serve their respective hierarchy. `editorSource` is for content editors, `articleSource` for article source, and `mono` for code/fallbacks. Confirm chosen fonts are available and provide system fallbacks. Bundled Sen Local, Noto Sans SC Local and Roboto Mono Local are also available, retaining original licenses. Article themes/WeChat output do not depend on these interface fonts.

Optional `surfaces` contains light/dark schemes. Its fields may be omitted to retain existing role fallbacks; the full field list and editor controls are described below. Colors reference palette keys and bounded opacity values. Follow the [production type and validator](../../../src/lib/editorThemes.ts); this field cannot inject arbitrary CSS.

<a name="doc-editor-theme-example"></a>

### Complete editor-theme example

Save as `guide-mist.json` and import. It uses the built-in Mist Gray field/palette system under an independent ID. For a customer theme, adjust palette, mappings and fonts to confirmed preferences rather than changing only its name.

```json
{
  "kind": "editor-theme",
  "id": "guide-mist",
  "name": "Guide · Mist Gray",
  "version": "1.0.0",
  "formatVersion": 4,
  "palette": {
    "white": "#ffffff",
    "neutral-50": "#fafafa",
    "neutral-100": "#f5f5f5",
    "neutral-200": "#e5e5e5",
    "neutral-300": "#d4d4d4",
    "neutral-400": "#a1a1a1",
    "neutral-500": "#737373",
    "neutral-600": "#525252",
    "neutral-700": "#404040",
    "neutral-800": "#262626",
    "neutral-900": "#171717",
    "neutral-950": "#0a0a0a",
    "danger-600": "#ad4e53",
    "danger-dark-600": "#f39da2",
    "moss-500": "#52715a",
    "moss-dark-500": "#a3c8ab",
    "success-50": "#edf6ee",
    "success-dark-50": "#243b30",
    "warning-300": "#e2c58f",
    "warning-50": "#faf2e4",
    "warning-700": "#85602a",
    "warning-800": "#684719",
    "warning-dark-300": "#80683d",
    "warning-dark-50": "#403722",
    "warning-dark-700": "#e0bc79",
    "warning-dark-800": "#f0d39d"
  },
  "colors": {
    "light": {
      "canvas": "neutral-50",
      "rail": "neutral-100",
      "list": "neutral-50",
      "panel": "white",
      "hover": "neutral-100",
      "popup-bg": "white",
      "primary": "neutral-900",
      "secondary": "neutral-800",
      "muted": "neutral-600",
      "faint": "neutral-500",
      "popup-text": "neutral-700",
      "line": "neutral-200",
      "line-strong": "neutral-300",
      "accent": "neutral-600",
      "accent-strong": "neutral-700",
      "accent-text": "neutral-700",
      "accent-soft": "neutral-100",
      "accent-line": "neutral-300",
      "selection": "neutral-200",
      "on-accent": "white",
      "success": "moss-500",
      "success-surface": "success-50",
      "warning": "warning-700",
      "warning-strong": "warning-800",
      "warning-surface": "warning-50",
      "warning-line": "warning-300",
      "danger": "danger-600",
      "on-danger": "white",
      "editor-surface": "white",
      "editor-text": "neutral-700",
      "editor-syntax": "neutral-600",
      "editor-heading": "neutral-800",
      "editor-quote": "neutral-600"
    },
    "dark": {
      "canvas": "neutral-950",
      "rail": "neutral-900",
      "list": "neutral-900",
      "panel": "neutral-800",
      "hover": "neutral-700",
      "popup-bg": "neutral-800",
      "primary": "neutral-50",
      "secondary": "neutral-200",
      "muted": "neutral-300",
      "faint": "neutral-400",
      "popup-text": "neutral-200",
      "line": "neutral-700",
      "line-strong": "neutral-600",
      "accent": "neutral-600",
      "accent-strong": "neutral-500",
      "accent-text": "neutral-200",
      "accent-soft": "neutral-800",
      "accent-line": "neutral-600",
      "selection": "neutral-700",
      "on-accent": "white",
      "success": "moss-dark-500",
      "success-surface": "success-dark-50",
      "warning": "warning-dark-700",
      "warning-strong": "warning-dark-800",
      "warning-surface": "warning-dark-50",
      "warning-line": "warning-dark-300",
      "danger": "danger-dark-600",
      "on-danger": "neutral-950",
      "editor-surface": "neutral-800",
      "editor-text": "neutral-200",
      "editor-syntax": "neutral-400",
      "editor-heading": "neutral-50",
      "editor-quote": "neutral-300"
    }
  },
  "fonts": {
    "ui": "\"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif",
    "serif": "\"Songti SC\", \"Noto Serif CJK SC\", \"Source Han Serif SC\", serif",
    "mono": "\"SFMono-Regular\", Consolas, \"Liberation Mono\", monospace",
    "editorSource": "\"SFMono-Regular\", Consolas, \"Liberation Mono\", monospace",
    "heading": "\"Songti SC\", \"Noto Serif CJK SC\", \"Source Han Serif SC\", serif",
    "eyebrow": "\"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif",
    "subHeading": "\"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif",
    "articleSource": "\"SFMono-Regular\", Consolas, \"Liberation Mono\", monospace"
  }
}
```

### Verify an editor-theme

1. Use the [production validator](../../../src/lib/editorThemes.ts) or app import to check fields, both schemes and fonts.
2. Import into a test library, select/save appearance, then close/reopen settings and confirm the selection/file.
3. Check light, dark and system-following modes. Text/hints must remain readable; state colors, focus, boundaries, selections and disabled controls must be distinguishable.
4. Check navigation, dialogs, menus, forms, source and scrolling. Distinguish a draft preview from actual adoption.
5. Themes control existing semantic roles. Structural UI changes or new controls require separate application development.

<a name="doc-article-theme"></a>

## article-theme: article layout

### Fields and scope

Token, node, CSS-property and value constraints come from the current library's `validator.product.theme`; the table/examples describe built-in defaults.

Save under `themes/article-themes/<id>.json`. Import JSON under **Themes** and inspect full typography. **Copy and apply** retains saved originals/snapshots; **Apply to current draft** adopts directly for new drafts. New-article creation can also select the theme.

| Field | Constraint under defaults |
|---|---|
| kind | Explicit article-theme for new files; older snapshots without kind remain readable |
| id / name / version | Safe ID, nonempty name and numeric version; three components recommended |
| formatVersion | 1 |
| tokens | All 11 supported keys below with safe CSS values |
| css | String scoped to article preview; at most 20,000 JavaScript string units |
| nodes | Optional supported nodes with fontSize/lineHeight/color overrides |

Required default tokens:

```text
color-article-ink
color-article-heading
color-article-muted
color-article-quote-surface
color-article-line
color-article-accent
color-article-link
color-article-tint
color-article-code
color-article-code-surface
color-article-code-tint
```

Under defaults, selectors start from `.article-preview .article-body`; outer `.article-preview` accepts restricted text/background declarations. Use flat rules without nesting, media rules, :root, :host, :global, :has, @import, @font-face, remote assets, executable content or !important. Use needed block/inline/inline-block/table/table-cell/table-row/list-item display values, not flex/grid.

Supported node keys are h1–h6, paragraph, blockquote, inlineCode, codeBlock, table, caption and divider. Overrides are fontSize, lineHeight and color only. See the [validator](../../../src/lib/themeValidation.ts) for full properties/value/length constraints.

The library's `format/formatter.json` controls light/dark surfaces, preview font, dark conversion and output. Built-in WeChat defaults use official `mp-darkmode` on an isolated copy, including colors, gradients and background images; the old neutral-gray-only model is not used. Other platforms can disable/adjust conversion. Check light, dark and receiver results separately; dark preview does not rewrite source or light copying.

Theme-structure/security checks and platform reports are separate. `format/validator.json` defines tokens, node mappings and structure limits and calls registered platform capabilities; `format-support.json` owns rule wording, strength and source. See [FORMAT.md](FORMAT.md). Valid JSON is not platform compliance, and incomplete layout/manual review is not a pass.

Semantic body utilities such as `text-article-accent`, `bg-article-tint` and `border-article-line` map to these tokens. Copying generates required inline styles; do not require WeChat to load local classes, CSS variables or custom fonts. Tool-interface style rules do not rewrite user body data.

The sample image uses max-width:100%, height:auto and display:block for ordinary responsive layout; this is a sample choice. Official WeChat width checks inspect multi-screen layout, centering and overflow, using measured widths first and declared/data-w/HTML widths or transparent placeholders as fallbacks. There is no current rule allowing height:auto only in a three-property combination. Formatter configuration determines automatic-dimension output; loading, existence and actual layout are separate checks.

The article editor's [preview controls](README.md#doc-preview-controls) are separate from theme JSON. With save-only refresh enabled, editing or choosing a theme can temporarily retain the earlier display. Verify the theme version and layout after saving successfully, or turn the switch off to resume live display. Theme-library, snippet and starter design previews keep their existing workflows.

<a name="doc-article-theme-example"></a>

### Complete article-theme example

With library CSS, `css.stylesheets` loads foundations from local modules, including preflight, media rules, nesting, icons and fonts; see [library styles](FORMAT.md#doc-library-styles). Article themes retain their JSON structure/node overrides. `render.document` maps article selectors to the real container; editor themes do not participate.

Configure container and inherited fonts/colors/backgrounds before adding overrides. Snippets use that environment's classes/tokens. Website publication uses Markdown-body output; back up `render.json` and shared dependencies. Old manuscripts without records cannot promise restoration of their original library CSS.

Save as `guide-paper.json`. In the CSS string, `\n` represents newlines; JSON cannot contain comments or unescaped newlines. The app's CSS tab can edit the same content.

```json
{
  "kind": "article-theme",
  "id": "guide-paper",
  "name": "Guide · Paper",
  "version": "1.0.1",
  "formatVersion": 1,
  "tokens": {
    "color-article-ink": "#444444",
    "color-article-heading": "#1c1c1c",
    "color-article-muted": "#666666",
    "color-article-quote-surface": "#f8fafc",
    "color-article-line": "#737373",
    "color-article-accent": "#555555",
    "color-article-link": "#444444",
    "color-article-tint": "#f1f5f9",
    "color-article-code": "#334155",
    "color-article-code-surface": "#0f172a",
    "color-article-code-tint": "#e2e8f0"
  },
  "css": ".article-preview { color: var(--color-article-ink); }\n.article-preview .article-body { max-width: 42rem; margin: 0 auto; padding: 1.25rem; font-size: 1rem; line-height: 1.8; }\n.article-preview .article-body h1, .article-preview .article-body h2, .article-preview .article-body h3 { color: var(--color-article-heading); font-weight: 700; margin: 1.5rem 0 0.75rem; }\n.article-preview .article-body h1 { font-size: 2rem; }\n.article-preview .article-body h2 { font-size: 1.375rem; }\n.article-preview .article-body p { margin: 1rem 0; }\n.article-preview .article-body a { color: var(--color-article-link); text-decoration: underline; }\n.article-preview .article-body blockquote { color: var(--color-article-muted); background-color: var(--color-article-quote-surface); border-left: 0.1875rem solid var(--color-article-line); padding: 0.75rem 1rem; }\n.article-preview .article-body img { max-width: 100%; height: auto; display: block; }\n.article-preview .article-body hr { border: 0; border-bottom: 0.0625rem solid var(--color-article-line); margin: 1.5rem 0; }\n.article-preview .article-body code { color: var(--color-article-code); background-color: var(--color-article-code-tint); padding: 0.125rem 0.25rem; }\n"
}
```

<a name="doc-snippets"></a>

## Snippets

Files live under `snippets/<category>/<id>.json`; `snippets/index.json` stores categories/order, so body files do not repeat categoryId. Prefer **Templates → Snippets**: create information, select a category, edit the body and **Save content**. An explicitly authorized Agent can also create a unique file, then refresh/check the app.

Fields are id, name, trigger, description, content and optional icon. Triggers are `//` followed by lowercase letters/digits/hyphens. Limits are name 80, description 240 and content 64,000 JavaScript string units. At most one `▌` marks the insertion cursor and is removed when used. Resolve filename/trigger collisions without overwriting unknown content.

<a name="doc-snippet-example"></a>

### Complete snippet example

Save as `snippets/default/guide-note.json`; the default category must already exist. In the app, put information into its controls and only content into the body editor.

```json
{
  "id": "guide-note",
  "name": "Guide · Note",
  "trigger": "//guide-note",
  "description": "A note using article-theme colors, with the cursor at the text to complete.",
  "icon": "quote",
  "content": "<section class=\"my-4 rounded-lg bg-article-tint p-4\">\n  <p class=\"m-0 text-article-ink\"><strong class=\"text-article-accent\">Note:</strong>▌Add details here.</p>\n</section>"
}
```

Type `//guide-note` and select it, or use Insert element. Complete deliveries contain expanded content rather than unresolved triggers.

<a name="doc-starter-templates"></a>

## Starter templates

Files live under `templates/<category>/<id>.md`, with categories in `templates/index.json`. Filename supplies the ID, Front Matter title supplies the name, and description supplies the summary. `templateIcon` can select a supported icon. Bodies must be nonempty and at most 250,000 JavaScript string units.

Front Matter starts the source and encloses valid YAML in two `---` lines. title, description, author, createdAt and updatedAt are strings; categories is a string array; theme contains id/version. New manuscripts get new dates and the selected article theme; template dates are not final save timestamps.

<a name="doc-starter-example"></a>

### Complete starter example

Save as `templates/default/guide-starter.md`, importing guide-paper first. Replace example dates with creation dates where appropriate. Square brackets are author fill-in prompts, not application macros.

```markdown
---
title: An article built from local materials
description: Organize body text and a note snippet with one starter.
author: Example author
categories:
  - Tutorial
createdAt: "2026-10-03T00:00:00.000Z"
updatedAt: "2026-10-03T00:00:00.000Z"
theme:
  id: guide-paper
  version: "1.0.1"
templateIcon: book
---

# [Write the article title]

[Explain the article in one paragraph.]

## Keep materials together

[Add body text, evidence or an example.]

<section class="my-4 rounded-lg bg-article-tint p-4">
  <p class="m-0 text-article-ink"><strong class="text-article-accent">Note:</strong>[Add details.]</p>
</section>

## Choose the next step

[Give the reader one action.]
```

Create information, edit the body and save under **Templates → Starter templates**, or have an authorized Agent create a new file and refresh. The app usually hides Front Matter during body editing and manages information in its dialog; external files still contain complete source.

<a name="doc-complete-article-example"></a>

## Complete article example

This combines theme, starter structure and a note snippet, without unresolved triggers/cursor placeholders. `/images/article-sample.png` is bundled with the app; real imported assets use `media/image/<filename>`.

```markdown
---
title: An article built from local materials
description: Organize body text and a note snippet with one starter.
author: Example author
categories:
  - Tutorial
createdAt: "2026-10-03T00:00:00.000Z"
updatedAt: "2026-10-03T00:00:00.000Z"
theme:
  id: guide-paper
  version: "1.0.1"
---

# An article built from local materials

Keep materials where you can find them. Start with a clear directory, then write the first paragraph.

## Keep materials together

Create a clearly named library in Settings. Body text, theme snapshots and article images are saved together; the code directory starts the app.

![Bundled sample image](/images/article-sample.png)

<section class="my-4 rounded-lg bg-article-tint p-4">
  <p class="m-0 text-article-ink"><strong class="text-article-accent">Note:</strong>First save and reopen once in a test library.</p>
</section>

## Choose the next step

Save the article, copy rich text, and check image/paragraph order in the receiver. After pasting into WeChat, the user checks the draft and mobile preview.
```

Use app creation/saving to keep metadata, month directory and theme.json consistent. Direct Agent creation must verify library, month, article directory and theme snapshot; writing only article.md is not a complete article.

App saves synchronize title, summary, author, categories, dates, theme binding and save diagnostics to the monthly index.json. Summaries contain neither body nor theme CSS. After direct creation, explicitly scan/rebuild that month's index and check the list. Indexes can be rebuilt but cannot replace manuscripts; body/theme checks run on the target or through **Check current scope**.

<a name="doc-verify-examples"></a>

## Verify all five examples

| Deliverable | Actions | Success evidence |
|---|---|---|
| editor-theme | Import, select, save, switch light/dark/system | Readable file and effective roles/fonts; article snapshots independent |
| article-theme | Import/preview; adopt for new draft or copy/apply for saved article | Correct independent snapshot and readable headings/body/quotes/images |
| Snippet | Create/load, insert by trigger, save | Expanded content, removed cursor marker and matching save/reopen |
| Starter template | Create/load and start a test article | Correct structure/information, selected theme and new dates |
| Complete article | Save/reopen, update styles, copy/receive | Text/image order and status match actual files |

Run actual examples through source validation using repository tests as call references. Parsing JSON alone is not complete verification. Then test the workflow in a test library and real browser. WeChat drafts/mobile previews are checked by the user; report untested formats/platforms honestly.

Deliver files, adoption method, passes and unverified scope. Starters may keep fill-in prompts; completed articles must remove them. Retain manuscripts when file, style or image operations fail and retry after identifying the stage.

UI language does not translate examples or saved library names, bodies and rule descriptions. Both language editions use the same technical fields/IDs; example prose can follow the reader's language.

## Production implementation references

- [Editor-theme types/validation](../../../src/lib/editorThemes.ts), [theme file operations](../../../src/lib/editorThemeLibrary.ts)
- [Article-theme types](../../../src/lib/types.ts), [validation](../../../src/lib/themeValidation.ts), [theme directories](../../../src/lib/themeDirectories.ts)
- [Snippet/template files and validation](../../../src/lib/contentLibraries.ts), [Front Matter](../../../src/lib/frontMatter.ts)
- [Article/snapshot file operations](../../../src/lib/fileSystem.ts), [rendering/copying](../../../src/lib/render.ts)
- [Library format configuration, capabilities and migration](FORMAT.md)

These references point to production code. Update examples and guidance when types, fields or validation conditions change.

### Editor surface colors and opacity

Settings → Appearance → Editor theme offers the same 33 base roles and 13 surface controls for every theme. Counts describe editable roles, not distinct colors. Controls include primary button fill/hover/text/border, secondary and danger fills, eyebrow, field, popup/dialog shadows, card/toggle shadows, backdrop and a three-color canvas wash. Light and dark are independent. Editing a surface detaches that palette reference without changing the original base role.

Each field in surfaces.light and surfaces.dark is optional: missing fields retain existing fallbacks. Valid fields are primaryButton, primaryText, primaryHover, primaryLine, secondaryButton, eyebrow, dangerSurface, field, shadow, panelShadow, toggleShadow, backdrop and canvasWash. Tint fields use { color, opacity }; opacity is 0–100. The canvas wash has three palette references and opacity. Hover accepts one reference or four gradient stops. Missing secondary fill stays transparent until explicitly configured. Popup/dialog shadows share their material; card/toggle shadows are independent. Arbitrary CSS and layout dimensions are not accepted. Old themes and startup caches remain readable without rewriting user files.
