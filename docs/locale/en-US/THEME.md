# Creating themes, snippets and starter templates

English · [简体中文](../zh-CN/THEME.md) · [Project home](../../../README.md)

Before executing an Agent task, check required reading for this manual under the [ongoing manual-use requirements](AGENT-GUIDE.md#doc-manual-use).

For Agents and authors creating Rainy Manuscript Workspace content. See [AGENT-GUIDE.md](AGENT-GUIDE.md) for installation/tutorials and [README.md](README.md) for the project introduction.

## Identify the deliverable

| Deliverable | Purpose | File format |
|---|---|---|
| editor-theme (editor appearance) | Workspace/source colors and fonts | JSON; kind editor-theme, formatVersion 4 |
| article-theme (article layout) | Article preview, layout and copied output | JSON; kind article-theme, formatVersion 1 |
| Snippet | Insertable Markdown/HTML fragment | JSON with content and trigger |
| Starter template | Complete starting point for a new article | Markdown with Front Matter |
| Complete article | Final body and article metadata | article.md with independent theme.json, images and attachments |

The app version identifies the tool; theme `version` records theme revisions; `formatVersion` identifies the theme file format. Use unique IDs to avoid built-in/user collisions. IDs/category directory names use lowercase letters, digits and hyphens, 1–48 characters, beginning with a letter or digit. Display names may use Chinese, for example ID `my-theme` and name `我的主题`. Keep older article snapshots; changing the theme library must not replace an existing article's `theme.json`.

<a name="doc-design-assets"></a>

## Design assets and compatibility

Article themes hold colors, typography and node styles for the theme route. Snippets hold reusable body structures, starters hold a new manuscript's structure, and `themes/preview.md` holds representative test content.

For library-owned CSS, provide the style entry, resources and configuration declaration described in [FORMAT](FORMAT.md#doc-library-styles), and explain the article theme's actual role. Both routes preserve consistent manuscript identity, theme snapshots and dependencies.

Article layout variables (tokens) follow the current library declaration. The structure below applies to the bundled interpreter/legacy route; inspect the actual theme input of a custom render package too. Every declared key is currently required. When extending the set, check defaults, affected themes and snippet compatibility together. Document each snippet's required tokens and matching themes in its delivery notes, without adding unsupported JSON fields.

Built-in examples use 11 color tokens, not a fixed set for every library. The color editor is distinct from an arbitrary design-token system; available editable fields follow the current implementation.

The empty preset provides three starters with valid Front Matter (file-header metadata) and plain-Markdown bodies; this describes those defaults rather than banning other content supported by the library. HTML-based examples here illustrate the theme route; [FORMAT](FORMAT.md#doc-policy-responsibilities) describes content policy and verification.

<a name="doc-preview-sources"></a>

## Preview dimensions and style provenance

Preview-container width and internal article CSS width are separate. Resource-preview host width follows the shared policy in [FORMAT](FORMAT.md#doc-preview-host); content layout continues to follow the current library declaration.

When styleAuthority is library, the theme CSS area explains: “Styles come from the library. Theme CSS is not used for this rendering.” A read-only “View current preview CSS” action is provided. The theme's original CSS and maintenance controls are retained; shared or generated CSS is not copied into the theme field. Provenance comes from the current configuration and preview result, including a verified style entry or render-package identity when available.

In the theme editor’s CSS tab, choose a declared standalone library file under **CSS source**, then search, edit and **Save CSS and reload**. Source files and theme CSS save separately; choose **Theme CSS (not used in this rendition)** to maintain the original theme. Shared files affect new previews and exports that use them; saved articles and history snapshots are not updated automatically.

Saving checks CSS syntax and file/configuration identity. With expected SHA verification enabled, saving updates the corresponding declaration; with it disabled, configuration bytes are preserved and hashes are not inserted. External edits, lost permission or library switches prevent overwriting. Retry only reload after a successful write followed by reload failure. A declaration is not proof of consumption; never guess a write-back location from generated CSS or JavaScript. See [FORMAT](FORMAT.md#doc-format-package) for protocol paths and the switch.

The viewer shows CSS generated for the current successful preview, labeled with its light/dark mode and source identity. Missing source-file mapping is stated explicitly; package filenames are not treated as proof of a mapping. Valid empty CSS has an explicit empty-result explanation. Failed, incomplete or stale results are not presented as current styles. Theme-owned mode continues to use theme CSS.

“This color is not used in the current preview sample.” moves to a new line at the end of that swatch's existing popup, available on hover and keyboard focus. Existing color information and status detection remain unchanged.

<a name="doc-editor-theme"></a>

## editor-theme: editor appearance

### Structure and fields

Save under `themes/editor-themes/<id>.json`. Import through **Settings → Appearance → Import JSON**, or use the designer. Selecting previews immediately; Save appearance retains the choice. Cancel restores the saved appearance but keeps imported theme files.

| Field | Constraint |
|---|---|
| kind | editor-theme |
| id / name | Safe ID; name 1–80 characters |
| version | Three numeric components, such as 1.0.0 |
| formatVersion | Use 4 for new themes; the app normalizes supported older formats |
| palette | 1–130 entries; keys start with a lowercase letter, then lowercase letters/digits/hyphens, at most 64 characters; 3/6-digit HEX values without alpha |
| colors | Only light/dark; each includes all 34 roles below, referencing palette keys |
| fonts | All 8 roles below, each a nonempty safe font stack of at most 180 characters |
| surfaces | Optional; use defined fields/structure, or omit it entirely |

Theme JSON is limited to 60,000 characters (program-string length). New themes fill all roles below; older files may inherit a missing `search-hit` as described below.

Color roles:

```text
canvas rail list panel hover popup-bg
primary secondary muted faint popup-text
line line-strong
accent accent-strong accent-text accent-soft accent-line selection search-hit on-accent
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

`ui` serves interface text; `heading`, `subHeading` and `eyebrow` serve their respective hierarchy. `editorSource` is for content editors, `articleSource` for article source, and `mono` for code/fallbacks. Confirm chosen fonts are available and provide system fallbacks. Sen Local, Noto Sans SC Local and Roboto Mono Local are available after verified download into the library, retaining original licenses. See [font downloads](README.md#doc-font-downloads) for sources, retries and offline use. Article themes/WeChat output do not depend on these interface fonts.

Optional `surfaces` contains light/dark schemes. Individual items may be omitted to keep role fallbacks; colors reference palette keys. Only the following structures are accepted, never arbitrary CSS.

| Field | Value |
|---|---|
| primaryButton / primaryText / primaryLine / secondaryButton / eyebrow / dangerSurface | palette key |
| primaryHover | one key or exactly four gradient keys |
| field / shadow / panelShadow / toggleShadow / backdrop | `{ color, opacity }`; opacity 0–100 |
| canvasWash | `{ colors: [three palette keys], opacity }` |

The following is only the value of `surfaces`, to merge into a complete theme; it is not independently importable.

```json
{
  "light": {
    "field": {
      "color": "neutral-100",
      "opacity": 80
    }
  },
  "dark": {
    "field": {
      "color": "neutral-900",
      "opacity": 90
    }
  }
}
```

### Editor surface colors and opacity

Settings → Appearance → Editor theme offers the same 34 base roles and 13 surface controls for every theme. Counts describe editable roles, not distinct colors. Controls include primary button fill/hover/text/border, secondary and danger fills, eyebrow, field, popup/dialog shadows, card/toggle shadows, backdrop and a three-color canvas wash. Light and dark are independent. Editing a surface detaches that palette reference without changing the original base role.

Missing secondary-button surfaces stay transparent; fields and shadows keep their fallbacks until explicitly configured. Popups/dialogs share shadow material, while cards and toggles use independent shadows. Hover can use a solid color or four-stop gradient; opacity controls translucent materials and the canvas wash. Arbitrary CSS/layout sizing is not exposed, and older themes/caches are not rewritten automatically.

<a name="doc-editor-theme-example"></a>

`search-hit` controls the search-result background, with independent palette references for light and dark. Every built-in theme defaults to fluorescent yellow. Text automatically uses black or white for contrast. Older files inherit the missing role in memory without a disk migration; explicit saving persists it. Search navigation centers the result when scroll space permits.

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
    "warning-dark-800": "#f0d39d",
    "search-light": "#eeff00",
    "search-dark": "#eeff00"
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
      "editor-quote": "neutral-600",
      "search-hit": "search-light"
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
      "editor-quote": "neutral-300",
      "search-hit": "search-dark"
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

All article themes share the library's Markdown sample at `themes/preview.md`. The theme library, theme editor, color inspection and save validation use this same content; selecting a theme inside an article still previews the actual article. Reload after editing `themes/preview.md`. Changing UI language does not replace it; read failures or invalid content are reported.

<details>
<summary>Sample language and legacy compatibility</summary>

New libraries include a sample in their seed language. A missing file uses that remembered language, falling back to English when the language is absent or unsupported, and shows its default source. Unreadable or invalid samples show an error. Opening an existing library never fills a missing sample; existing custom samples are retained. Reload the library after editing the file. Changing the interface language does not translate or replace it.

</details>

| Field | Constraint under defaults |
|---|---|
| kind | Explicit article-theme for new files; older snapshots without kind remain readable |
| id / name / version | Safe ID, nonempty name and numeric version; three components recommended |
| formatVersion | 1 |
| tokens | All 11 supported keys below with safe CSS values |
| dark.tokens | Optional manual dark overrides, limited to the color keys in tokens; missing keys inherit light values |
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

#### Default theme CSS: selectors, syntax and layout

These constraints apply to bundled article themes, not library CSS.

| Category | Constraint |
|---|---|
| Selectors | Start at .article-preview .article-body; outer .article-preview accepts only restricted text/background declarations |
| Syntax and resources | Flat rules; no nesting, media rules, :root, :host, :global, :has, @import, @font-face, remote assets, executable content or !important |
| Layout | display: block, inline, inline-block, table, table-cell, table-row or list-item; no flex/grid |

#### Default theme node overrides

Supported node keys are h1–h6, paragraph, blockquote, inlineCode, codeBlock, table, caption and divider. Overrides are fontSize, lineHeight and color only. See the [validator](../../../src/lib/themeValidation.ts) for full properties/value/length constraints.

The library's `format/formatter.json` controls light/dark surfaces, preview font, dark conversion and output. Built-in WeChat defaults use official `mp-darkmode` on an isolated copy, including colors, gradients and background images; the old neutral-gray-only model is not used. Other platforms can disable/adjust conversion. Check light, dark and receiver results separately; dark preview does not rewrite source or light copying.

| Mode | Editing and adoption |
|---|---|
| algorithm | Dark values are read-only; inspect actual sample results |
| tokens | Edit dark.tokens; missing values inherit light; switching to automatic retains but does not use manual values |

Article color tables have light and dark columns. When `preview.dark-mode.parameters.mode` is `algorithm`, the dark column is read only and displays actual converted sample values. A role may have multiple results; unused, calculating and failed states are distinct. With `tokens`, both columns are editable and only dark overrides go into `dark.tokens`. Choose **Inherit light** to remove an override. Variables apply before computed styles are captured; fixed CSS and literal node colors keep their authored values. Typography is shared; the canvas uses `preview.surface`, without another paper token. Automatic mode retains the manual group but does not use or overwrite it.

Older themes without dark keep their styles. Older formatters infer mode from transform; preserve retains external CSS dark behavior. Themes and history are not migrated implicitly. Dark viewing uses an isolated copy and keeps existing light clipboard/export policies.

#### Structure and platform checks

Theme-structure/security checks and platform reports are separate. `format/validator.json` defines tokens, node mappings and structure limits and calls registered platform capabilities; `format-support.json` owns rule wording, strength and source. See [FORMAT.md](FORMAT.md). Valid JSON is not platform compliance, and incomplete layout/manual review is not a pass.

#### Output and receiving-platform results

Semantic body utilities such as `text-article-accent`, `bg-article-tint` and `border-article-line` map to these tokens. Copying generates required inline styles; do not require WeChat to load local classes, CSS variables or custom fonts. Tool-interface style rules do not rewrite user body data.

The sample uses `max-width:100%`, `height:auto` and `display:block` for ordinary responsiveness, not as the only valid combination. Output sizing follows the formatter. Check real image loading, file existence, width, centering and horizontal overflow separately.

The article editor's [preview controls](README.md#doc-preview-controls) are separate from theme JSON. Save-only refresh retains body edits until saving; explicitly adopting a theme refreshes once after successful compilation without saving automatically. Later edits still wait for save. Failed/stale work cannot advance the image; turning the option off restores live refresh. Asset-design previews keep their existing workflows.

<a name="doc-article-theme-example"></a>

### Complete article-theme example

With library CSS, `css.stylesheets` loads foundations from local modules, including preflight, media rules, nesting, icons and fonts; see [library styles](FORMAT.md#doc-library-styles). Article themes retain their JSON structure/node overrides. `render.document` maps article selectors to the real container; editor themes do not participate.

Configure container and inherited fonts/colors/backgrounds before adding overrides. Snippets use that environment's classes/tokens. Choose output according to the target website publishing workflow; back up `render.json` and shared dependencies. Old manuscripts without records cannot promise restoration of their original library CSS.

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
  "css": ".article-preview { color: var(--color-article-ink); }\n.article-preview .article-body { max-width: 42rem; margin: 0 auto; padding: 1.25rem; font-size: 1rem; line-height: 1.8; }\n.article-preview .article-body h1, .article-preview .article-body h2, .article-preview .article-body h3 { color: var(--color-article-heading); font-weight: 700; margin: 1.5rem 0 0.75rem; }\n.article-preview .article-body h1 { font-size: 2rem; }\n.article-preview .article-body h2 { font-size: 1.375rem; }\n.article-preview .article-body p { margin: 1rem 0; }\n.article-preview .article-body a { color: var(--color-article-link); text-decoration: underline; }\n.article-preview .article-body blockquote { color: var(--color-article-muted); background-color: var(--color-article-quote-surface); border-left: 0.1875rem solid var(--color-article-line); padding: 0.75rem 1rem; }\n.article-preview .article-body img { max-width: 100%; height: auto; display: block; }\n.article-preview .article-body hr { border: 0; border-bottom: 0.0625rem solid var(--color-article-line); margin: 1.5rem 0; }\n.article-preview .article-body code { color: var(--color-article-code); background-color: var(--color-article-code-tint); padding: 0.125rem 0.25rem; }\n",
  "dark": {
    "tokens": {
      "color-article-ink": "#e2e8f0",
      "color-article-heading": "#f8fafc",
      "color-article-muted": "#94a3b8",
      "color-article-line": "#475569"
    }
  }
}
```

<a name="doc-snippets"></a>

## Snippets

Files live under `snippets/<category>/<id>.json`; `snippets/index.json` stores categories/order, so body files do not repeat categoryId. Prefer **Templates → Snippets**: create information, select a category, edit the body and **Save content**. An explicitly authorized Agent can also create a unique file, then refresh/check the app.

| Field | Constraint |
|---|---|
| id | Unique safe ID; category is stored in the index, not repeated as categoryId |
| name / description | At most 80 / 240 characters |
| trigger | `//` followed by lowercase letters, digits and hyphens |
| content | Nonempty, at most 64,000 characters (program-string length), at most one `▌` |
| icon | Optional supported icon |

Insertion removes the cursor marker and positions the cursor. Resolve filename/trigger collisions without overwriting unknown content.

Image rows: four-image and no-inner-padding variants are available.

<details>
<summary>Image rows: layout-check boundaries</summary>

Default snippets include four-image rows and a variant without inner padding. Existing rules exempt fixed vertical scrolling heights; width exemptions remain limited to the actual inner horizontal list. Quote and generated-shell copying follows [output policy](FORMAT.md#doc-copy-output); body width checks remain.

</details>

Code windows: the defaults include `//mac-style-code-block` and `//mac-style-code-block-nowrap`, with a separate header, red/yellow/green SVG dots and a right-aligned filename. After insertion, edit the filename, language marker and code. These snippets use utility classes and no longer depend on dedicated theme rules with matching names. Adopting or inserting a snippet does not automatically rewrite existing manuscripts or historical snapshots.

Select an existing snippet under **Templates → Snippets**, then use **Duplicate snippet** to create an independent copy prefilled with its code, description, icon and category. Confirm the copy’s name, ID and trigger, resolve conflicts, then validate and save. The original stays unchanged.

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

Front Matter (file-header metadata) starts the source and encloses valid YAML in two `---` lines. title, description, author, createdAt and updatedAt are strings; categories is a string array; theme contains id/version. New manuscripts get new dates and the selected article theme; template dates are not final save timestamps.

Articles created from starters can rename their folders independently. Template ID, article title and the `article.md` filename keep separate roles. Internal card and quote spacing in starter content is retained when copying.

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

| Authoring route | Input |
|---|---|
| In the app | Manage metadata in the information dialog; enter the body in the editor |
| External file | Keep complete Front Matter and body; authors fill brackets, which are not macros |

Create information, edit the body and save under **Templates → Starter templates**, or have an authorized Agent create a new file and refresh. The app usually hides Front Matter during body editing and manages information in its dialog; external files still contain complete source.

<a name="doc-complete-article-example"></a>

## Complete article example

This built-in WeChat-preset example combines theme, starter structure and a note snippet, without unresolved triggers/cursor placeholders. `/images/article-sample.png` is bundled with the app; real imported assets use `media/image/<filename>`.

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

Classify results as pass, fail, unobserved or not applicable, with reasons. Deliver files, adoption method, passes and unverified scope. Starters may keep fill-in prompts; completed articles must remove them. Retain manuscripts when file, style or image operations fail and retry after identifying the stage.

Changing UI language does not translate saved content; new-library language and existing assets are kept separately. See [Agent language maintenance](AGENT-GUIDE.md#doc-language-maintenance).

<details>
<summary>Multilingual authoring constraints (complete)</summary>

UI language does not translate examples or saved library names, bodies and rule descriptions. Complete seeds live under `resources/template/fresh-library/en-US/` and `zh-CN/`, with matching IDs, filenames and design tokens. Objects have no i18n fields. Once a library is created, UI language changes leave saved content unchanged; defaults fall back to English. Both language editions use the same technical fields/IDs; example prose can follow the reader's language.

</details>

<a name="doc-resource-references"></a>

## Images, attachments and source rendering

Use the complete `/images/article-sample.png` URL for the application sample in snippets/starters. Import or adopt real resources first, then use their allocated article paths. Adopting a shared resource makes an independent copy without source-directory write permission.

```text
![Image](media/image/photo.png)
[Attachment](media/file/report.pdf)
```

Images/attachments retain separate description indexes. Attachments use type icons and an unknown-file fallback without automatic preview/execution. Copying a snippet/template to another article does not carry the original media: reimport and update references. Distinguish importing/failed/missing resources and verify save/reopen; knowledge originals stay read-only.

Math/Mermaid support and output follow the current render configuration; the bundled route uses optional formatter steps; see [FORMAT.md](FORMAT.md#doc-source-rendering) for configuration/limits. Snippets keep source and can contain inline/display math or fences marked math/mermaid. Article themes control surrounding headings/paragraphs/spacing/colors without injecting scripts; the Mermaid step controls its diagram theme.

#### Preview and delivery checks

Test short/long articles for source positions, pending/errors, light/dark/narrow/wide, scrolling, save/reopen, history and output. MathML/static PNG have receiver limits. Libraries without the steps retain source display; a local preview does not replace destination acceptance.

## Production implementation references

- [Editor-theme types/validation](../../../src/lib/editorThemes.ts), [theme file operations](../../../src/lib/editorThemeLibrary.ts)
- [Article-theme types](../../../src/lib/types.ts), [validation](../../../src/lib/themeValidation.ts), [theme directories](../../../src/lib/themeDirectories.ts)
- [Snippet/template files and validation](../../../src/lib/contentLibraries.ts), [Front Matter](../../../src/lib/frontMatter.ts)
- [Article/snapshot file operations](../../../src/lib/fileSystem.ts), [rendering/copying](../../../src/lib/render.ts)
- [Library format configuration, capabilities and migration](FORMAT.md)

These are source-package implementation references, not a prerequisite for using a static distribution. These references point to production code. Update examples and guidance when types, fields or validation conditions change.
