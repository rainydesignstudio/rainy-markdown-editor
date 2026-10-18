# Library format configuration

English · [简体中文](../zh-CN/FORMAT.md) · [Project home](../../../README.md)

Each library binds one format policy. Opening another library switches support rules, validation and formatting together. Article themes control article layout; editor themes control the workspace interface.

```text
library/format/
├── format-support.json   Rule meaning, strength, sources and manual review
├── validator.json        Capabilities, stages, parameters and theme definition
└── formatter.json        Processing steps and parameters
```

All three top-level `schemaVersion` values are currently `1`, and `meta.id` must match. There is no strategy index or per-article binding. Start by copying the complete [built-in configuration](../../../resources/presets/platform/wechat-article/format/), then edit the needed parts.

When creating a library, choose “WeChat Official Account” under “Validation and processing template” to copy the trio, algorithm implementation and license. This is the only public preset. Library files remain independent and are not overwritten when the preset source changes.

Settings → Local directory shows the currently loaded validation policy and algorithm version. Built-in defaults, legacy algorithm fallbacks and unavailable configurations are identified explicitly.

<a name="doc-bundled-resources"></a>

## Bundled application resources

Default UI catalogs live in `resources/locale/`, public release data in `resources/changelog/public.json`, and local development/review notes in Git-ignored `resources/changelog/local.md`. Platform sources are in `resources/presets/platform/`. New-library seeds live in `resources/template/fresh-library/en-US/` and `zh-CN/`, each with actual theme, snippet and starter directories, and no articles or history. Theme authoring starting points are in `resources/template/`.

Browser-loaded scripts remain in `public/format/` and `public/algorithm/`; complete font sources, sizes and hashes live in the [font manifest](../../../resources/font-sources.json), downloading only into authorized libraries. `public/fonts/` retains three OFL texts; images and other licenses remain in `public/images/` and `public/licenses/`. The sample uses only `/images/article-sample.png`. Old root URLs and arbitrary relative images are not replaced with the sample; correct the actual snippet/template references. Bilingual prose remains in `docs/locale/`.

<a name="doc-editable-fields"></a>

## What can be edited

| Object | Editable in JSON | Requires engine work |
|---|---|---|
| format-support | Names, sources, descriptions, severities and manual-review selectors | New diagnostic-display capabilities |
| validator.rules | Add/remove/enable entries, supported stages/parameters and existing operators | New algorithms or unsupported parameters |
| validator.product.theme | Tokens, node selectors/property mappings, CSS policy, numeric limits and value patterns | Changes to article-theme file structure or parsing syntax |
| formatter.steps | Add/remove/enable steps and parameters of existing operators | New processing algorithms or output types |

This is a data-driven capability interface. New objects can reuse registered capabilities; they do not create algorithms or execute JSON scripts. A new platform policy can often be configured with the trio, while new algorithms need implementation/registration in the capability layer. Business components keep consuming one immutable snapshot.

`schemaVersion` describes file structure, so do not increment it merely to edit policy. `product.theme.kind` and `formatVersion` identify current article-theme files (`article-theme`/`1`); keep them unchanged. Switching platforms does not require a new theme-file structure. Modified official defaults become a custom library policy and cannot be claimed as unchanged official WeChat defaults.

### Platform validation switch

`validator.meta.enabled` is an optional boolean. Omitted or true retains platform checks. False skips platform rules and their manual reviews without creating platform pass records. Product syntax, safety, image resources and article-theme structure checks remain. Both modes load the entire trio and validate its structure, references, parameters and algorithm files; missing or invalid files still fail. Formatter preview, transformation and output steps are independent.

For example, set validator.json → meta to `{ "id": "custom-platform", "enabled": false }` and use custom-platform as the other two meta.id values. Keep product.theme, rules arrays and formatter.steps. Rules/manualReview may be empty when no platform standards are needed; a trio reduced to metadata alone is invalid. Settings and format reports show when platform validation is off. Reload after changing rules; stale tasks and check caches expire.

<a name="doc-validator-example"></a>

## MVP: append a validation rule

Append this object to `validator.rules` to reuse value matching. It is a custom demonstration, not a new WeChat requirement:

```json
{
  "id": "custom-alignment",
  "operator": "style.values",
  "enabled": true,
  "stages": [
    "authoring",
    "rendered"
  ],
  "parameters": {
    "property": "text-align",
    "values": [
      "justify"
    ]
  }
}
```

Add the corresponding explanation to `format-support.rules`. `validator` references that rule ID; `source` references an entry in `meta.sources`. Custom rules need their own basis rather than claiming an official WeChat source. Add this source object under `format-support.json` → `meta.sources`, replacing the example URL with your real basis. An Agent should not automatically visit the example address:

```json
{
  "local-policy": {
    "url": "https://example.com/local-format-policy"
  }
}
```

```json
{
  "id": "custom-alignment",
  "section": "local",
  "title": "This library’s alignment policy",
  "description": "Review justified text under this library’s policy.",
  "severity": "warning",
  "source": "local-policy",
  "validator": "custom-alignment"
}
```

`style.present` checks whether a declaration appears; `style.values` matches its value against an array; `style.transparent` checks transparent values; `style.important` checks authored `!important`. The first three identify a CSS property with `property`; single/multiple values use the same rule shape.

`authoring` checks source/compiled declarations; `rendered` checks actual DOM. Style rules with `selector` are rendered-only. Geometry rules require rendered measurements, not static-source claims. `leaf`/`nodeleaf` also inspect source before browser repair: source selectors support tags or tag[attribute]; complex selectors are rendered-only.

<a name="doc-formatter-example"></a>

## MVP: change processing steps

`formatter.json` calls capabilities through `steps[]`. For example, this step renders a single Markdown newline as a line break:

```json
{
  "id": "soft-breaks",
  "operator": "markdown.soft-breaks",
  "enabled": true,
  "parameters": {
    "mode": "line-break"
  }
}
```

Change the existing default step instead of enabling a duplicate soft-break step. Another step controls preview background and default body text:

```json
{
  "id": "paper",
  "operator": "preview.surface",
  "enabled": true,
  "parameters": {
    "lightBackground": "#ffffff",
    "darkBackground": "#191919",
    "fontFamily": "system-ui, sans-serif",
    "color": "#1f1f1f",
    "stripThemeBackground": true
  }
}
```

These are editable-object examples. Other platforms can choose different backgrounds, fonts and conversion strategies; they are not universal engine requirements imposed by WeChat.

The following capability is additive: repeated steps merge property lists.

```json
{
  "id": "drop-decoration",
  "operator": "css.drop-properties",
  "enabled": true,
  "parameters": {
    "properties": [
      "text-transform"
    ]
  }
}
```

<a name="doc-copy-output"></a>

## Rich-text copying and preview shells

The circular-arrow **Update styles** control is in the editor top bar, after **Export** and before **Check format**. Existing articles/history retain render records. Explicitly update styles and save to adopt current library policy; no bulk migration occurs.

| Existing step | parameters field | Effect |
|---|---|---|
| output.html | `tagMap: { "blockquote": "section" }` | WeChat copying reads original quote theme styles before mapping tags in the output copy, retaining nested quotes, borders, backgrounds and inner padding. |
| output.css | `rootStyleOmissions` | Omits named CSS properties only from generated article/body shells. WeChat defaults cover margin/padding and their sides, width/min-width/max-width and height/min-height/max-height. Internal content containers remain intact. |

Merge fields into existing steps’ `parameters`, retaining other parameters rather than adding duplicate output steps. See the complete [default formatter](../../../resources/presets/platform/wechat-article/format/formatter.json). Older configurations without new fields keep their behavior; other platforms choose their own policies. Source, preview tags and PNG/PDF remain unchanged. This adds no official compliance requirement. JSON configures registered policies; new algorithms still require application capabilities. The rendering engine is not a library plugin.

<a name="doc-source-rendering"></a>

## Optional math and Mermaid source rendering

Add these registered steps to the current library's `formatter.steps[]`, reload the library and explicitly update styles. Defaults do not enable either capability. Older libraries/snapshots keep their own configuration; parameters accept no executable code or custom trust policy.

```json
[
  {"id":"math","operator":"markdown.math","enabled":true,"parameters":{"singleDollar":true,"maxLength":8192,"maxExpressions":128}},
  {"id":"mermaid","operator":"markdown.mermaid","enabled":true,"parameters":{"theme":"neutral","maxLength":16384,"maxDiagrams":16}}
]
```

| Capability | Values and output |
|---|---|
| markdown.math | Boolean singleDollar; maxLength 1–16384; maxExpressions 1–256. Inline/display/math fences become static KaTeX MathML without external fonts/scripts or cross-expression macros. Trusted commands stay disabled with fixed expansion/size limits. Errors retain TeX and line diagnostics. |
| markdown.mermaid | theme default/neutral/dark; maxLength 1–32768; maxDiagrams 1–32. Flowcharts/sequence/state/class/ER become isolated static PNG, without config directives, interaction or external resources. Budget 256 statements, 100 edges, 4096 per side and 8MiB per result; excess retains source. |

Math body example (inline/display; a fence marked math also works):

```text
Inline: $E=mc^2$

$$
\frac{a}{b}
$$
```

Use a fence marked mermaid for a body such as:

```text
flowchart TD
  A[Start] --> B[Finish]
```

Rendering is incomplete until ready; placeholders cannot be copied/exported or stored as render.json/history artifacts. Source can save first, followed by another save/style update when diagrams finish. Invalid syntax is reported at its code block and retained. Verify destination MathML support and PNG reception. Official standards still check static results; enabling a step grants no exemption and does not expand handwritten SVG tag/event permissions.

Implementation and licenses ship locally. Mermaid is rebuilt from locked official modules to unify the KaTeX version; see [resources/render](../../../resources/render/), [math licenses](../../../public/licenses/math/) and [Mermaid licenses](../../../public/licenses/mermaid/). An isolated frame does not guarantee off-main-thread layout; check input/scrolling with small graphs and simplify or pre-render complex ones.

<a name="doc-resource-protocol"></a>

## Resource references, import and output

| Resource | Article reference | Shared reference | Behavior |
|---|---|---|---|
| Raster image | media/image/filename | /shared/image/filename | Existing image validation/preview/description index |
| General attachment | media/file/filename | /shared/file/filename | Type icon/explicit download, no execution or automatic preview; unknown files use a generic icon |

Encode complete filenames as URIs and keep actual final paths. Image metadata keeps the existing `images` object; an attachment directory's `index.json` uses version1 and a `files` object with description per filename. Directories appear on demand; old libraries are not moved wholesale. The [resource registry](../../../resources/presets/resource/types.json) has 23 classes / 284 suffixes. Extension/MIME labels do not grant attachment image-preview capability.

Product checks cover safe paths, target identity, existence and image bytes. Importing is incomplete; failed/cancelled and missing references are separate. These checks remain when `validator.meta.enabled=false`. Unmigrated CSS backgrounds/fonts/complex embeds retain source with notices; local document links are not recursively carried.

`imports/tasks/<id>.json` binds library/article/source/final names. Background work writes resources/status only, never old full body text. Concurrency 2, 64KiB chunks, 100ms progress throttling and 64MiB general attachments apply. CORS/CSP, omitted credentials and permission failures remain explicit and support retry/reselection. Originals remain; knowledge indexes live in the target library's `knowledge/`.

Copy/PNG/PDF checks use current resource/render versions and reject stale output. Attachments are not presented as directly pasteable media. ZIP includes article media and explicitly referenced shared files, excluding knowledge/imports. Partial output needs user confirmation, skips unclosed/failed/missing files, keeps original references and retains the 256MB in-memory limit. Source save, render-record save, checking and output report separately.

<a name="doc-formatter-capabilities"></a>

## Formatter capabilities

| operator | parameters |
|---|---|
| markdown.soft-breaks | `mode`: `space` / `line-break` |
| markdown.blank-lines | `preserve`, `betweenBlocks`, `atEdges` |
| markdown.code-highlight | styles[]; optional engine (highlight/prism), themeDefaults, prismStyles mapping lexical keys to CSS declarations |
| markdown.math | singleDollar, maxLength, maxExpressions; optional static MathML |
| markdown.mermaid | theme, maxLength, maxDiagrams; optional static PNG |
| markdown.heading-ids | mode: auto/explicit; explicit retains {#id} without generating anchors |
| markdown.code-layout | wrapperClasses[], preTag, contentClasses[], copyClasses[], copyHtml, copyLabel |
| css.stylesheets | entry, publicRoot; optional allowUnknownClasses |
| render.document | root, body, beforeHtml, afterHtml, language, preserveIds, viewport |
| render.nodes | image (width/height/classes/style/alt), link (classes/rootBase/externalTarget); supplies missing defaults only |
| markdown.code-whitespace | `tabSize`; disabling retains original code whitespace |
| preview.surface | lightBackground, darkBackground, fontFamily, color, stripThemeBackground |
| preview.dark-mode | `mode`: algorithm or tokens; algorithm requires component transform/options, tokens contains only mode |
| css.drop-properties | properties[]; repeatable |
| css.utility-aliases | aliases mapping CSS property names |
| output.css | inlineProperties[], dimensionProperties[], preserveAutoDimensions, colorEncoding: rgb/preserve; optional rootStyleOmissions[] |
| output.html | wrapperTag, preserveAttributes[], removeClasses, stripRootBackground; optional tagMap |
| output.text | maxConsecutiveNewlines, trim |
| output.visual | width, pngBackground, pdfBackground, maxCanvasSide, pdfMargin |

Configuration compiles in array order, but execution still has Markdown, CSS, preview and output stages. Reordering cannot move an output operation ahead of parsing. Except for `css.drop-properties`, each capability can be enabled only once to avoid conflicting parameters. Disabled capabilities use neutral engine behavior; disabling output style capture loses those styles and does not disable checking.

Rich-text copying resolves styles against each original tag before applying `output.html.parameters.tagMap` to content containers, such as `{"blockquote":"section"}` in the WeChat preset. Generated article shells still use `wrapperTag`. `output.css.parameters.rootStyleOmissions` omits styles only from generated article/body shells: the WeChat preset excludes their margins, padding and width/height constraints while retaining spacing and borders inside content cards, paragraphs and quotes. Omitting either optional setting retains legacy behavior; source, preview and PNG/PDF are unchanged. Existing libraries must explicitly update their formatter.json. For articles retaining an older render snapshot, use Update styles before copying; source and history are not migrated automatically.

The two `preview.dark-mode.parameters` sources are exclusive. Automatic example:

```json
{"mode":"algorithm","transform":"mp-darkmode","options":{"mode":"dark","whitelist":{"attribute":["data-no-dark"]},"needJudgeFirstPage":false,"noEmit":false}}
```

Manual mode contains only:

```json
{"mode":"tokens"}
```

Top-level mode selects the source; options.mode is still component-specific. Manual mode uses the article theme’s dark.tokens without calling a component and retains external CSS dark classes/preview mode. Missing mode is inferred from legacy transform: preserve means tokens, a component ID means algorithm. Reads do not rewrite old files. validator.product.theme may declare `"darkTokens":{"allowPartial":true,"fallback":"light"}`. Partial overrides are allowed by default; keys reuse registered color tokens, rejecting unknown keys, unsafe values and cycles. Typography is shared and canvas backgrounds still use preview.surface. Official format-support criteria remain: manual mode with rules requiring official conversion reports incomplete rather than passing them automatically.

The default `mp-darkmode` component accepts `mode: dark`, `defaultDarkTextColor`, `defaultDarkBgColor`, `needJudgeFirstPage`, `noEmit`, `whitelist.attribute[]` and `whitelist.tagName[]`. The official default template leaves the SDK's default text color unchanged; explicit color options customize that library. Without `defaultDarkBgColor`, the dark surface from `preview.surface` is used. `noEmit: true` computes conversion records without emitting styles and is usually unsuitable for visible previews. The component validates parameter meaning; the shared layer requires only a bounded JSON object. Custom components can add parameters without new workbench props.

The official SDK reads inline styles. The integration first captures computed colors, backgrounds, borders and decorative paint for the article root and descendants, writes RGB values to an isolated copy, then calls the unchanged SDK. Dark preview does not rewrite source, themes or light-mode clipboard content.

### Library algorithm components

Each library uses `format/algorithms/manifest.json`. The [public WeChat component](../../../resources/presets/platform/wechat-article/format/algorithms/manifest.json) is the default source; new libraries copy its implementation and license.

| Manifest field | Meaning |
|---|---|
| schemaVersion | Protocol version; currently 1 |
| components[] | Each component has a unique id, version, scripts[], license and capabilities |
| scripts[] | Implementations loaded in order; each entry has a relative path and the raw file's SHA-256 |
| license | Relative path and SHA-256 of the required license file |
| capabilities | A transform boolean and validators[]; declare only implemented validation operators |

`preview.dark-mode.parameters.transform` references the component ID. `preserve` runs no component. Scripts expose two methods through `window.ArticleAlgorithm`:

```js
window.ArticleAlgorithm = {
  async transform(root, context) {
    // context: background, options, inlineProperties; root is an isolated copy.
    root.style.color = context.options.defaultDarkTextColor || 'inherit';
  },
  async inspect(root, rules) {
    // Check the supplied rules and return findings, or [] when none are found.
    // Each entry: { ruleId, element, outcome: 'violation'|'review'|'incomplete', detail? }
    return [];
  }
};
```

This illustrates the interface, not WeChat validation. Add a manifest component and implementation files, update their hashes, then point the formatter to its ID. New shared validation operators still require a registered execution capability. Scripts can change paint on existing nodes: colors, backgrounds, borders and text decoration. They cannot add HTML or introduce resources. Returned properties, node indexes, rule IDs and size are checked before any result is applied to the processing copy.

Implementation runs only in a separate sandbox without same-origin permission. No workbench DOM or directory handle is passed in. Network, storage, popups and navigation are restricted; editing a component does not grant execution in the main page. Existing Blob images and fonts are transferred in memory with their layout context, without rescanning the library. The sandbox isolates permissions; it is not a CPU budget for arbitrary scripts.

Component files, license, parameters and fingerprints participate in snapshots and caches. Historical dependency manifests retain the original code rather than substituting today's component. Older libraries without an algorithm directory receive an explicit built-in fallback without writes; present but incomplete directories, hash failures and missing capabilities fail. Older render records without components get a separate fallback notice and are not claimed to reproduce their original algorithm exactly.

## Loading, failures and migration

### Optional application configuration and capabilities

A library may add `format/config.json`. Its `meta.id` must match the format trio. Omitting the file preserves theme overrides, user-selected preview appearance and all existing actions. A present but malformed file is rejected instead of falling back or mixing defaults.

This website-library example requires the trio ID `site-article` and a complete `css.stylesheets` entry:

```json
{
  "schemaVersion": 1,
  "meta": { "id": "site-article" },
  "rendering": { "styleAuthority": "library", "previewMode": "light" },
  "capabilities": {
    "articleTheme": { "enabled": false, "reason": "This library uses the website stylesheet" },
    "exportPdf": { "enabled": false, "reason": "This library delivers website content only" }
  }
}
```

Any trio `meta` may declare the same `capabilities` and `rendering` objects. Restrictions intersect: any false declaration disables the capability; config.json cannot enable it again. Repeated rendering declarations must agree or the whole configuration is rejected. Undeclared controls keep their existing labels. Disabled controls remain visible with a reason, and action handlers enforce the same immutable configuration as the UI.

| Capability | Scope |
|---|---|
| articleTheme | Selecting/applying article themes and setting the default for new articles |
| previewMode | User switching of article preview appearance |
| algorithm | Rendering algorithm execution; disabling it conflicts with any formatter or enabled dark rule that still requires an algorithm. Rules are never removed automatically |
| copyRichText | Rich-text copying |
| exportPackage / exportMarkdown / exportBody / exportPng / exportPdf | Each article export format independently |

`rendering.styleAuthority` accepts theme (the legacy path) or library. Library authority requires a library stylesheet entry and compiles that stylesheet without appending article-theme CSS or token overrides. Article theme selection is disabled. Sources and theme snapshots remain unchanged; adopting a new environment is explicit. Maintaining theme resources is separate from selecting a theme for an article.

`rendering.previewMode` accepts user, light or dark. A fixed mode disables the switch without overwriting the browser preference; switching back to user restores that preference. Current capabilities govern actions, while retained render records keep their own rendering declarations. Legacy records without declarations use legacy defaults rather than today's fixed policy. New records bind the configuration to their dependency manifest; opening a record never migrates it.

The optional file loads with the trio, algorithms and styles and participates in immutable snapshot/cache identity. Configuration changes invalidate older work. Reopen the library after external edits, then explicitly update styles to adopt the new environment. New libraries may still omit config.json. Custom declarations are not labeled official defaults.

### Theme saves and sample resources

Add this optional field to the existing `product.theme` object in the current library's validator.json:

```json
{ "savePolicy": { "sampleResources": "review" } }
```

Review applies only to the preview sample used while saving an article theme. Resource failures and explicitly dependent incomplete checks retain their original diagnostics and require review, but do not block the theme save. They are not passes. Block retains the old behavior and is the default when omitted. CSS syntax/safety, theme structure, genuine blocking violations, invalid configuration and write failures remain blocking. Snippets, templates, articles, copying and exports retain their existing validation. This policy changes neither platform-rule severity nor formatter behavior and does not mean the intermittent sample-image failure is fixed.

<a name="doc-library-styles"></a>

### Library styles and isolated canvases

Older libraries without a CSS entry keep the original pipeline. Website libraries can configure the following in the same steps[] while checking their support rules, validator and existing output policy:

```json
[
  {
    "id": "library-css",
    "operator": "css.stylesheets",
    "enabled": true,
    "parameters": {
      "entry": "styles/globals.css",
      "publicRoot": "assets"
    }
  },
  {
    "id": "document",
    "operator": "render.document",
    "enabled": true,
    "parameters": {
      "root": {
        "tag": "section",
        "id": "article-content",
        "classes": [
          "w-full",
          "min-w-0"
        ]
      },
      "body": null,
      "beforeHtml": "",
      "afterHtml": "",
      "language": "zh-CN",
      "preserveIds": true,
      "viewport": null
    }
  }
]
```

`styles/globals.css` can import local CSS modules and built-in Tailwind styles, including @theme, @layer, @utility, @apply, @variant, nesting and @font-face. Library CSS, preflight and fonts are isolated from the workspace. Article themes retain their structure and provide overrides.

Relative URLs resolve from their CSS directory. `/image/icons.svg` maps through publicRoot to `assets/image/icons.svg`, retaining fragments. Relative theme-override assets resolve from `themes/article-themes/`; virtual-root paths are recommended. Fonts can live in `assets/fonts/`. Do not import host-site business scripts.

Escaping the library, cycles, remote CSS assets, JS plugins and missing files are rejected. Limits: 256 CSS files, depth 32, 1 MiB per file, 8 MiB total; 2048 assets, 256 MiB total. Directory @source needs an explicit in-library scope, capped at 256 matching files; it does not scan every article by default.

A null viewport lays out content responsively at the actual preview-column width, uses the available height for scrolling, and adds no display scaling. An explicit viewport object reproduces a fixed layout: width/height set the CSS viewport, contentWidth sets body width, and display scaling does not change that layout. beforeHtml/afterHtml affect preview only, without entering source, Markdown-body output or copied body; existing source content remains.

Custom classes and generated utilities share checks. For classes used solely as content hooks, explicitly set `css.stylesheets.parameters.allowUnknownClasses` to true; by default, classes without generated styles are checked. This does not disable source, safety or platform rules.

### Renderer interfaces and ownership

The article source field edits only the body. Original Front Matter appears in a read-only disclosure above it, while body numbers refer to the complete file, including blank lines and multiline YAML. Engine findings retain body coordinates; `ArticleFormatReport.bodyLineOffset` carries the corresponding file offset for display. Theme CSS keeps its own coordinates. Expanding the disclosure never rewrites the file; sources without metadata start at line 1.

Rendering implementations live in `src/lib/article-format/` and use the same interfaces across platforms. The optional config.json, format trio and immutable algorithm snapshot retain authority. This extraction adds no executable-plugin entry and changes neither historical manifests nor old manuscripts.

| Entry | Inputs and results | Responsibility |
|---|---|---|
| renderer.ts / compileArticleStyles | Markdown, article theme, immutable FormatSnapshot and optional stylesheet environment → CSS, candidates and diagnostics | Style compilation, cache and configuration identity |
| ArticleDocument.tsx / MarkdownPreview.tsx | snapshot, themeId, source, media and children | Document structure, Markdown/HTML, resources and common body markers |
| useArticleRenderMount.ts | hostRef, snapshot, CSS, dark and resource/image callbacks → mount target, canvases and diagnostics | ShadowRoot/iframe isolation, paper geometry, fonts and dark conversion |
| output.ts / buildClipboardPayload | Matching document root and snapshot → rich HTML, plain text and resource information | Output conversion without preview shells or temporary interaction decoration |

Pane layout, toolbars, drafts, save/delete workflows and library permissions stay in the workspace. React adapters connect media dialogs, translation and file sources through the existing resource context. Adapters own mounting and cleanup; mounting does not migrate source or history. Legacy compiler/output and editor component paths only forward to the same implementation and cache.

<a name="doc-render-records"></a>

### Render records and historical dependencies

After normal source saving, optional `render.json` records body/theme hashes, processing steps, HTML/CSS and dependency versions. Manifests live at `styles/.versions/<hash>/manifest.json`, and resources at `assets/.objects/<hash>`. Identical content is reused; history retains references and document packages include only required objects.

Complete records use their retained environment. **Update styles** explicitly rereads current configuration/dependencies; verify and save to record the new environment, while older history retains its versions. Opening/preview/list operations do not backfill or migrate records. Older history without records explains that dependencies were not retained.

Source, index and render retention have separate feedback. Dependency failure does not roll back source or pass an old record off as current success. Missing objects, damaged manifests and body/theme mismatches produce diagnostics. Do not manually change hashes or automatically delete historical objects; keep these directories in backups.

For website delivery, **Export article → Markdown body** extracts the reliably parsed body, retaining Markdown, HTML, classes and anchors. The publisher handles image addresses. Reports use current library rules; replaying history is not proof of present platform compliance.

### Visible preview and current inspection

The article editor's [three preview controls](README.md#doc-preview-controls) are browser UI preferences, separate from the format trio. Save-only refresh retains visible inputs and their resources. The current working canvas still uses the current body, theme and configuration for validation, copying, export and render records. Inspection alone does not advance the display boundary; successful saving followed by compilation, or successful compilation after explicitly adopting a different or updated theme, does. Theme adoption refreshes once without adding a save operation; subsequent body edits still follow the save-only preference. Failed or stale tasks do not advance the display boundary. Scroll alignment binds the visible ShadowRoot or iframe and caches valid correspondences from the saved source to the current source. Edited gaps use the nearest valid anchor; no match keeps the position unchanged. Controls, color mode, column size and document changes rebuild cached positions using passive events, requestAnimationFrame and 4 ms slices. Scrolling does not read the library or recompile. Save-only mode adds “· Save to refresh preview” after the source footer’s saved state.

<a name="doc-configuration-loading"></a>

### Format configuration

Configuration is read when opening a library. Input, find and list navigation do not reread it from disk. After external JSON edits, save drafts and reopen the current library; old tasks/check caches are invalidated by configuration identity.

- All three absent: explicitly identify complete built-in fallback without silently writing files.
- Partial files, old structure, damaged JSON, unknown capabilities/fields, incorrect parameter types, duplicate IDs or missing references: configuration errors. Do not combine defaults with fragments and claim success.
- Original material remains recoverable; compilation/compliance checks do not trust invalid configuration.
- A new library creates the default trio and empty article directory without test manuscripts/history.

Do not relabel old lists by changing version numbers. Back up the entire old library/list, copy a complete new trio and deliberately migrate needed local policy. Older compatibility tiers, font exemptions and image three-property combinations are not automatically WeChat rules. Configuration changes do not rewrite article-theme snapshots; recheck the combination.

UI language is independent of library policy. Switching Simplified Chinese/English neither rereads nor rewrites the trio, changes formatter language, nor translates source/export content. Product diagnostics follow UI language; library rule names, descriptions and manual-review wording remain original.

Empty/invalid image addresses and confirmed loading/decoding failures are product resource errors. Failed images do not wait again for events that have already finished; unsettled resources remain explicitly incomplete. Known missing local files return diagnostics first. Repair them and check again; standards JSON is not relaxed.

<a name="doc-official-basis"></a>

## Official basis and verification scope

WeChat defaults follow the [official editor plugin specification](https://developers.weixin.qq.com/doc/service/guide/product/plugin_spec.html). The [official validation implementation](https://github.com/wechatjs/verify-article-structure-spec) is pinned to `0.2.17`, commit `1340988eccbb63181a56141a5c2171d55cd42521`, as algorithm/case reference only; the official specification takes precedence. Dark conversion uses `mp-darkmode@1.2.3-alpha.1` with its original MIT license.

Live source checks, actual layout checks and manual visual review are separate. Layout/dark measurement runs for saving, manual checks, copying and visual export. Failed image loading, cancellation and timeout are not passes. `data-ignore-width` affects width rules and its subtree; `data-no-dark` skips conversion of the current node only; `data-ignore-dm` skips the listed dark diagnostics for that node.

Text inside images, transparent images, SVG content, shared-background containers and visual/structural order still require manual review. Automated passes do not replace WeChat draft/mobile acceptance. HTML/CSS syntax, executable content, file existence and theme JSON structure are product checks, not invented WeChat rules.

Browser frames start through local static scripts and read non-executable JSON configuration, without inline bootstrap code or dynamic evaluation. Shared source generates the asset during development/build, using the static server's CSP.

See [contracts.ts](../../../src/lib/article-format/contracts.ts) for parameter contracts and [configuration tests](../../../tests/article-format-config.test.mjs) for examples/constraints.

## Horizontal scrolling and width exemption

Horizontal scrolling uses the existing [official WeChat §1.4.4 exemption](https://developers.weixin.qq.com/doc/service/guide/product/plugin_spec.html#_1-4-4-豁免机制：data-ignore-width):

```html
<section class="overflow-x-scroll pb-3">
  <section data-ignore-width class="flex items-center justify-start gap-3">
    <section class="shrink-0 w-[85%]">Image and caption</section>
    <section class="shrink-0 w-[85%]">Image and caption</section>
  </section>
</section>
```

The marked element and its descendants skip every width check. The outer container and other rules are still checked. There is no global flex allowance, new `usable` field or separate empirical standard.
