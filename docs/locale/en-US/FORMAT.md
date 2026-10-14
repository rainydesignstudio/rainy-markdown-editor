# Library format configuration

English · [简体中文](../zh-CN/FORMAT.md) · [Project home](../../../README.md)

Each library binds one format policy. Opening another library switches support rules, validation and formatting together. Article themes control article layout; editor themes control the workspace interface.

```text
library/format/
├── format-support.json   Rule meaning, strength, sources and manual review
├── validator.json        Capabilities, stages, parameters and theme definition
└── formatter.json        Processing steps and parameters
```

All three top-level `schemaVersion` values are currently `1`, and `meta.id` must match. There is no strategy index or per-article binding. Start by copying the complete [built-in configuration](../../../src/lib/article-format/defaults/), then edit the needed parts.

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

<a name="doc-formatter-capabilities"></a>

## Formatter capabilities

| operator | parameters |
|---|---|
| markdown.soft-breaks | `mode`: `space` / `line-break` |
| markdown.blank-lines | `preserve`, `betweenBlocks`, `atEdges` |
| markdown.code-highlight | styles[]; optional engine (highlight/prism), themeDefaults, prismStyles mapping lexical keys to CSS declarations |
| markdown.heading-ids | mode: auto/explicit; explicit retains {#id} without generating anchors |
| markdown.code-layout | wrapperClasses[], preTag, contentClasses[], copyClasses[], copyHtml, copyLabel |
| css.stylesheets | entry, publicRoot; optional allowUnknownClasses |
| render.document | root, body, beforeHtml, afterHtml, language, preserveIds, viewport |
| render.nodes | image (width/height/classes/style/alt), link (classes/rootBase/externalTarget); supplies missing defaults only |
| markdown.code-whitespace | `tabSize`; disabling retains original code whitespace |
| preview.surface | lightBackground, darkBackground, fontFamily, color, stripThemeBackground |
| preview.dark-mode | `transform`: `preserve` / `mp-darkmode`; `options` |
| css.drop-properties | properties[]; repeatable |
| css.utility-aliases | aliases mapping CSS property names |
| output.css | inlineProperties[], dimensionProperties[], preserveAutoDimensions, colorEncoding: rgb/preserve |
| output.html | wrapperTag, preserveAttributes[], removeClasses, stripRootBackground |
| output.text | maxConsecutiveNewlines, trim |
| output.visual | width, pngBackground, pdfBackground, maxCanvasSide, pdfMargin |

Configuration compiles in array order, but execution still has Markdown, CSS, preview and output stages. Reordering cannot move an output operation ahead of parsing. Except for `css.drop-properties`, each capability can be enabled only once to avoid conflicting parameters. Disabled capabilities use neutral engine behavior; disabling output style capture loses those styles and does not disable checking.

Current `mp-darkmode` options are `mode: dark`, `defaultDarkTextColor`, `needJudgeFirstPage`, `noEmit`, `whitelist.attribute[]` and `whitelist.tagName[]`. `noEmit: true` computes conversion records without emitting styles and is usually unsuitable for visible previews. Library light/dark surfaces come from `preview.surface`.

## Loading, failures and migration

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
      "viewport": {
        "width": 1606,
        "height": 959,
        "contentWidth": 996
      }
    }
  }
]
```

`styles/globals.css` can import local CSS modules and built-in Tailwind styles, including @theme, @layer, @utility, @apply, @variant, nesting and @font-face. Library CSS, preflight and fonts are isolated from the workspace. Article themes retain their structure and provide overrides.

Relative URLs resolve from their CSS directory. `/image/icons.svg` maps through publicRoot to `assets/image/icons.svg`, retaining fragments. Relative theme-override assets resolve from `themes/article-themes/`; virtual-root paths are recommended. Fonts can live in `assets/fonts/`. Do not import host-site business scripts.

Escaping the library, cycles, remote CSS assets, JS plugins and missing files are rejected. Limits: 256 CSS files, depth 32, 1 MiB per file, 8 MiB total; 2048 assets, 256 MiB total. Directory @source needs an explicit in-library scope, capped at 256 matching files; it does not scan every article by default.

viewport determines CSS layout width/height; contentWidth determines body width. Display zoom does not alter layout. A null viewport uses the available container. beforeHtml/afterHtml affect preview only, without entering source, Markdown-body output or copied body; existing source content remains.

Custom classes and generated utilities share checks. For classes used solely as content hooks, explicitly set `css.stylesheets.parameters.allowUnknownClasses` to true; by default, classes without generated styles are checked. This does not disable source, safety or platform rules.

<a name="doc-render-records"></a>

### Render records and historical dependencies

After normal source saving, optional `render.json` records body/theme hashes, processing steps, HTML/CSS and dependency versions. Manifests live at `styles/.versions/<hash>/manifest.json`, and resources at `assets/.objects/<hash>`. Identical content is reused; history retains references and document packages include only required objects.

Complete records use their retained environment. **Update styles** explicitly rereads current configuration/dependencies; verify and save to record the new environment, while older history retains its versions. Opening/preview/list operations do not backfill or migrate records. Older history without records explains that dependencies were not retained.

Source, index and render retention have separate feedback. Dependency failure does not roll back source or pass an old record off as current success. Missing objects, damaged manifests and body/theme mismatches produce diagnostics. Do not manually change hashes or automatically delete historical objects; keep these directories in backups.

For website delivery, **Export article → Markdown body** extracts the reliably parsed body, retaining Markdown, HTML, classes and anchors. The publisher handles image addresses. Reports use current library rules; replaying history is not proof of present platform compliance.

<a name="doc-configuration-loading"></a>

### Format configuration

Configuration is read when opening a library. Input, find and list navigation do not reread it from disk. After external JSON edits, save drafts and reopen the current library; old tasks/check caches are invalidated by configuration identity.

- All three absent: explicitly identify complete built-in fallback without silently writing files.
- Partial files, old structure, damaged JSON, unknown capabilities/fields, incorrect parameter types, duplicate IDs or missing references: configuration errors. Do not combine defaults with fragments and claim success.
- Original material remains recoverable; compilation/compliance checks do not trust invalid configuration.
- A new library creates the default trio and empty article directory without test manuscripts/history.

Do not relabel old lists by changing version numbers. Back up the entire old library/list, copy a complete new trio and deliberately migrate needed local policy. Older compatibility tiers, font exemptions and image three-property combinations are not automatically WeChat rules. Configuration changes do not rewrite article-theme snapshots; recheck the combination.

UI language is independent of library policy. Switching Simplified Chinese/English neither rereads nor rewrites the trio, changes formatter language, nor translates source/export content. Product diagnostics follow UI language; library rule names, descriptions and manual-review wording remain original.

<a name="doc-official-basis"></a>

## Official basis and verification scope

WeChat defaults follow the [official editor plugin specification](https://developers.weixin.qq.com/doc/service/guide/product/plugin_spec.html). The [official validation implementation](https://github.com/wechatjs/verify-article-structure-spec) is pinned to `0.2.17`, commit `1340988eccbb63181a56141a5c2171d55cd42521`, as algorithm/case reference only; the official specification takes precedence. Dark conversion uses `mp-darkmode@1.2.3-alpha.1` with its original MIT license.

Live source checks, actual layout checks and manual visual review are separate. Layout/dark measurement runs for saving, manual checks, copying and visual export. Failed image loading, cancellation and timeout are not passes. `data-ignore-width` affects width rules and its subtree; `data-no-dark` skips conversion of the current node only; `data-ignore-dm` skips the listed dark diagnostics for that node.

Text inside images, transparent images, SVG content, shared-background containers and visual/structural order still require manual review. Automated passes do not replace WeChat draft/mobile acceptance. HTML/CSS syntax, executable content, file existence and theme JSON structure are product checks, not invented WeChat rules.

Browser frames start through local static scripts and read non-executable JSON configuration, without inline bootstrap code or dynamic evaluation. Shared source generates the asset during development/build, using the static server's CSP.

See [contracts.ts](../../../src/lib/article-format/contracts.ts) for parameter contracts and [configuration tests](../../../tests/article-format-config.test.mjs) for examples/constraints.
