# Library format configuration

English · [简体中文](../zh-CN/FORMAT.md) · [Project home](../../../README.md)

Each library binds one format policy. Opening another library switches support rules, validation and formatting together. Article themes control article layout; editor themes control the workspace interface.

First inspect `format/config.json.renderer`: a declared package follows its host protocol and its own business implementation; a legacy library without renderer uses trio compatibility. Operator and platform-switch sections below describe the bundled interpreter/legacy route, not every custom package.

```text
library/format/
├── format-support.json   Rule meaning, strength, sources and manual review
├── validator.json        Capabilities, stages, parameters and theme definition
└── formatter.json        Processing steps and parameters
```

All three top-level `schemaVersion` values are currently `1`, and `meta.id` must match. There is no strategy index or per-article binding. Start by copying the complete [built-in configuration](../../../resources/presets/platform/wechat-article/format/), then edit the needed parts.

| Preset | Platform and processing | Seed content and product checks |
|---|---|---|
| WeChat | Platform rules, bundled algorithms and notices | rich seed; product checks remain |
| Empty validator | No platform rules/algorithms; basic Markdown | markdown seed, no snippet categories; product checks remain |

<details>
<summary>Preset configuration details (complete)</summary>

New libraries offer “WeChat Official Account” (default) and “Empty validator” under “Validation and processing template”. WeChat copies the trio above plus algorithm implementations and licenses; Empty validator copies the [empty preset](../../../resources/presets/platform/empty/format/). Library files remain independent and are not overwritten when the preset source changes.

The empty trio shares `meta.id: "empty"`. Sources, rules and manual-review items are empty, `validator.meta.enabled` is false and `formatter.steps` is empty. `product.theme` retains the complete article-theme contract. Product syntax, safety, resources and theme structure are still checked; no platform pass records are generated.

Its algorithm directory contains only `manifest.json`: `{ "schemaVersion": 2, "components": [] }`. It has no algorithm scripts or associated licenses and does not trigger the legacy WeChat algorithm fallback. Empty formatting steps do not provide WeChat dark conversion, code highlighting or other preset processing; basic Markdown rendering remains available.

To customize it, edit the standards name and sources, then add matching rules or formatting steps using the examples below. Set `validator.meta.enabled` to true when platform rules should run. The full trio must still pass structure and reference validation; unsupported fields or scripts cannot be added to JSON.

</details>

Inspect actual sources and algorithm versions in Settings → Local directory → Validation and processing. Normal sources, legacy fallbacks and failures are identified in place; ordinary loading does not trigger a notification.

<a name="doc-policy-responsibilities"></a>

## Configuration selection and responsibilities

1. Choose platform policy from the actual business and output requirements. When platform-specific processing is unnecessary, start with the empty preset or an existing neutral configuration, retaining general syntax, safety, resource and theme-structure checks.
2. Format configuration owns capabilities, criteria, processing and output policy. Article themes or declared library styles own their corresponding design. Deliver complete configuration and dependencies for the selected rendering route.
3. Explain each algorithm, tag mapping, font/class transformation and style omission, and check actual output. Platform identity, sources and enabled capabilities must agree.
4. After configuration changes, check the loaded source, identity, version and dependencies; update declared file hashes for packages. Existing articles explicitly adopt the updated environment, while history retains its original dependencies.
5. The empty preset starts with no snippets or snippet categories and three plain-Markdown starters: a Markdown guide, project review and technical tutorial. Language selection determines wording rather than platform content.

<details>
<summary>Content receipts and legacy compatibility</summary>

Choose the preset through new-library creation. The app records its content policy and seed language in themes/default-themes.loaded. Check contentSeed in that receipt: markdown for the empty preset, rich for the WeChat preset. Later custom format packages retain this content choice. Ordinary opening and reloading retain existing content and valid empty sets. Explicit default loading follows the saved policy and language, filling missing items while retaining authored content, edits and index information. Legacy receipts, existing assets and history remain intact. Create business snippets within the current library capabilities and confirmed scope.

</details>

<a name="doc-format-package"></a>

## Self-contained packages: supported host protocols

New libraries use `rainy-format/2`; configuration stays at `<library>/format/config.json`. Business code, dependencies and notices belong to the library and app upgrades do not overwrite them. Existing `/1` packages and libraries without renderer retain their original semantics without automatic migration.

```text
library/
├── format/
│   ├── config.json
│   ├── renderer.js
│   ├── LICENSES.txt
│   ├── format-support.json
│   ├── validator.json
│   ├── formatter.json
│   └── algorithms/manifest.json
├── styles/a/b/theme.css
└── assets/
```

| Contract | Paths and editing | Compatibility |
|---|---|---|
| rainy-format/2 | entry, files[].path, api.files/loading APIs use full library-relative paths; declared CSS lives under styles/, including deep directories | Requires the markdown-source action; nonempty resource aliases require this protocol |
| rainy-format/1 | entry/file keys remain relative to format/; original paths and bytes are retained | Nonempty aliases are rejected, not ignored; upgrade explicitly |
| No renderer | Legacy trio compatibility | Distinguish missing/invalid files from legal defaults; never mix bundles |

### rainy-format/2: library resources and original source

Merge this fragment into existing config.json; it is not a complete package. Expected SHA verification defaults to enabled:

```json
{
  "validation": {
    "verifySha256": true
  },
  "resources": {
    "aliases": {
      "@styles/": "styles/",
      "@assets/": "assets/"
    }
  }
}
```

Alias keys use forms such as `@styles/`; values name real library directories ending in `/`. Aliases cannot chain or enlarge explicit files[] access. entry, files[].path and API file keys use real paths; resource references may use aliases. New paths reject absolute paths, `..` and encoded escapes. Resolve to real paths for cycle detection, deduplication and ownership. There is no wildcard manifest or arbitrary directory-base setting. config.json itself cannot appear in renderer.files[].

Omitted/true `validation.verifySha256` requires matching 64-character lowercase SHA-256 values over original bytes. Explicit false permits missing, empty or mismatching expected values (still bounded strings). This applies across host files, bundled interpreter checks, algorithm scripts/notices, CSS saves and render-record preparation/storage/restore. Actual-content fingerprints, conflicts, identity, caches and history protection remain. Maintainers adapt any private checks in external custom programs.

The `/2` actions[] must include this object. Labels are customizable; the host recognizes id/kind/extension:

```json
{
  "id": "markdown",
  "label": "Markdown",
  "kind": "export",
  "extension": "md"
}
```

The host downloads the complete current source, including metadata and unsaved edits, without invoking the renderer. New contracts cannot disable it; configuration failure still exposes source recovery. This differs from Markdown body export. Original source keeps its code and authored resource references.

Portable webpage output inlines declared local CSS/resources as CSS/data URIs, preserving import layer/supports/media conditions and removing aliases/untracked Blob URLs. HTTPS resources remain permission-controlled and are not guaranteed offline. Verify source and webpage output separately.

### rainy-format/1: original package semantics

Existing /1 entry/files[] and api.files keys remain relative to format/. Do not silently upgrade by editing paths or adding nonempty aliases. The SHA switch does not change the path protocol. Only libraries without renderer use trio compatibility; malformed renderer declarations do not count as absence.

Package, app and host-protocol versions are independent. Maintain the package version and applicable expected hashes for business changes; app upgrades do not rewrite published old packages. File authorization, browser support and safety remain host responsibilities.

Keep config.json schemaVersion at 1 and meta.id consistent with the trio. Renderer fields:

| Field | Content | Required/default/protocol |
|---|---|---|
| protocol / id / version / entry | Protocol, identity/version and JS entry | Required; path base follows the protocol table |
| files | Explicit `{path, sha256?, encoding?}` array covering entry, policies, modules, CSS, resources and notices | Strict SHA by default; expected values may be absent with false; optional encoding is base64 |
| actions | `{id, label, kind, extension?, mime?}` | One render and validate, at most one copy, multiple format/export; /2 also requires markdown |
| settings / values | `{key,label,type,options?}` and matching values | Required; text/number/boolean/select; select needs options and a valid value |
| permissions | images; optional styles/fonts, HTTPS origin arrays or explicit `https:` | images required; undeclared external styles/fonts stay blocked |

Up to 64 actions and settings, 256 files, 16MiB per file and 32MiB total are accepted. With expected verification enabled, hashes cover actual bytes, including trio whitespace and UTF-8 BOM; manifest access restrictions always remain. Text defaults to UTF-8; binary files declare encoding: "base64" and api.files contains their base64. The entry and trio must be text. Serialized requests/results are also limited to 32MiB. Values participate in package identity; changing only a value does not require new hashes for unchanged files.

### Shared action interface

The entry exports an async function:

```js
export default async function invoke(action, input, api) {
  // Implement parsing, cleanup, algorithms, validation, formatting and output here.
  if (action === 'my-format') return { source: input.source.trimEnd() };
  if (action === 'my-text-export') return {
    data: input.source, extension: 'txt', mime: 'text/plain'
  };
  throw new Error('Unknown action');
}
```

This is an action-function excerpt, not a complete package: provide render, validate and a matching declaration too. Business functions are not registered in the host and do not import implementations from application src/.

| Object | Contract |
|---|---|
| input | input.source and theme are immutable request inputs. HTML, CSS, mode, deep and observations from actual preview images are supplied when needed. Observations describe successful loading and intrinsic dimensions; they do not fabricate success. |
| context | input.context.rawBundle contains the verified trio. The package interprets its business fields. Read and interpret your own algorithms/manifest.json and implementation files through api.files; context.algorithms is an empty compatibility value for packages. Settings contain this package's values, and environment supplies compatible library-style inputs. A package can use native CSS without Tailwind, WeChat rules or a dark algorithm. |
| API | api.declaration supplies the immutable declaration. api.files[path] supplies declared text or declared binary base64. api.importModule(path) imports a declared ES module; api.load(path) loads a declared classic script. Each ES module bundles its own dependencies; connect modules through this API rather than application-source or network imports. |
| Computation sandbox | Execution takes place in an opaque iframe containing only the verified package and request input. It receives no directory handles, workspace DOM, direct network access or arbitrary persistence. Each library/package/action-role has isolated module state; calls within a role are serialized. Cancellation, switching libraries, reload and stale input must not publish obsolete results. |

| Action | Result |
|---|---|
| render | `{html, css}` |
| validate | `{complete, issues, passed}`; issues:`{message,severity,line?}`, body line numbers |
| format | `{source}`; draft only |
| copy | `{html, text}` |
| export | `{data, extension?, mime?, encoding?}`; utf8/base64; host handles /2 markdown |

Render returns `{html, css}`. Validate returns `{complete, issues, passed}`; issue entries are `{message, severity, line?}`, with error/warning/info severity and body-relative line numbers. Empty objects, exceptions and timeouts are not passes. Format returns source and only changes the draft. Copy returns HTML/text. Export returns data plus optional extension/MIME and encoding (utf8 by default, or base64 for binary). Declared actions appear in Export article → Library actions; declared settings appear in Settings → Local directory → Validation and processing → Format package settings.

### Host services: capture, archive and measurement

The bundled interpreter also declares archive, PNG and PDF exports. For export requests only, api.service("capture-v1", {width, maxCanvasSide, background}) asks the existing authorized preview capture flow for {data, width, height, blockEnds}; data is base64 PNG. api.service("archive-source-v1", {}) asks the existing source/resource packaging flow for {data}, a base64 ZIP. Resource review stays in trusted UI; computation timeouts pause during that service, and cancellation invalidates the request and its services. These services expose no directory handles or arbitrary writes. Modules implement all conversion and output policy.

Deep validation can call api.service("measure-v1", {html, css, widths}) for actual layout in script-free documents. The result is {screens}; each screen contains width, boxes in first-root-and-descendant DOM order (left/right/top/bottom/width/height and parent.left/right/width), and images (complete/width/height). Packages decide overflow, alignment and other business outcomes. Requests allow up to eight integer widths from 64–4096px and 20,000 elements per document; viewport height is 2000px and images wait up to five seconds, with unavailable images still marked incomplete. The service exposes no directory or element handles and retains declared resource permissions and cancellation guards.

### Resource previews and isolation boundaries

The host applies generic safety, isolated mounting, request identity protection and authorized resource/save operations. It does not run a hidden WeChat cleanup or fixed formatting chain after a package result. Scripts, event attributes, executable URLs and code imports remain blocked. A dedicated script-free preview document loads external images, CSS and fonts only according to package permissions; the workspace and computation sandbox retain their network restrictions. Unavailable resources and Copy anyway are not successful validation. Authored URLs remain separate from local preview resource URLs. Source retains authored references; portable webpages inline local resources as described above, with external-link policy unchanged.

HTTPS CSS imports require declared styles origins; fonts require their own fonts declaration. Native shared CSS need not become utilities or lose !important. Complete HTML+CSS and an inlined rich-text snapshot are distinct outputs; declare and verify them separately. A local clipboard success does not prove that a receiving platform retains media queries or pseudo-class behavior.

### Editing and reload

In the app: Themes → Edit theme → CSS → CSS source → Save CSS and reload. Strict verification updates that file’s existing expected SHA; disabling it preserves configuration bytes. Maintainers control package versions; hashes of unchanged files are not refreshed. Retry only reload after a successful write.

In an IDE: edit the real paths for the selected protocol. With strict verification, synchronize expected hashes before reload. With verification disabled, reload is read-only; synchronize hashes before enabling it again. Select Settings → Local directory → Reload render configuration. Reload does not write configuration or require an app build. The script below explicitly updates expected hashes for /1 or /2 without migrating protocols.

Run from the library root; this reads only declared files and updates their expected hashes:

```sh
node --input-type=module <<'JS'
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const config = JSON.parse(await readFile('format/config.json', 'utf8'));
const protocol = config.renderer.protocol;
if (!['rainy-format/1', 'rainy-format/2'].includes(protocol)) throw Error('Unknown protocol');
const prefix = protocol === 'rainy-format/2' ? '' : 'format/';
for (const item of config.renderer.files) {
  if (item.path.startsWith('/') || item.path.split('/').includes('..')) throw Error('Invalid path');
  item.sha256 = createHash('sha256').update(await readFile(prefix + item.path)).digest('hex');
}
await writeFile('format/config.json', JSON.stringify(config, null, 2) + '\n');
JS
```

### Existing articles and history

Reload affects the current library only. Invalid packages fail explicitly without filling gaps from WeChat defaults. Saved articles and history retain their package code, policies, settings, HTML/CSS and resource manifest. Update styles explicitly adopts today's package; save to record it. Missing historical dependencies are reported instead of rebuilding silently with today's package. Host upgrades must not require editing packages that use a published supported protocol.

### Deployment prerequisites

Other static servers must retain the isolation/CSP rules supplied by the application server for format/article-package-sandbox.html and format/article-package-preview.html. Format files cannot bypass stricter browser/deployment restrictions. The default npm start server supplies both dedicated policies. WeChat, live eBay and physical phones still require separate acceptance.

<a name="doc-bundled-resources"></a>

## Bundled application resources

<details>
<summary>Source-package maintenance: paths and notices</summary>

Default UI catalogs live in `resources/locale/`, public release data in `resources/changelog/public.json`, and local development/review notes in Git-ignored `resources/changelog/local.md`. Platform sources are in `resources/presets/platform/`. New-library seeds live in `resources/template/fresh-library/en-US/` and `zh-CN/`, each with actual theme, snippet and starter directories, and no articles or history. Theme authoring starting points are in `resources/template/`.

Browser-loaded scripts remain in `public/format/` and `public/algorithm/`; complete font sources, sizes and hashes live in the [font manifest](../../../resources/font-sources.json), downloading only into authorized libraries. `public/fonts/` retains three OFL texts; images and other licenses remain in `public/images/` and `public/licenses/`. The sample uses only `/images/article-sample.png`. Old root URLs and arbitrary relative images are not replaced with the sample; correct the actual snippet/template references. Bilingual prose remains in `docs/locale/`.

</details>

<a name="doc-editable-fields"></a>

## What can be edited

| Object | Editable in JSON | Requires engine work |
|---|---|---|
| format-support | Names, sources, descriptions, severities and manual-review selectors | New diagnostic-display capabilities |
| validator.rules | Add/remove/enable entries, supported stages/parameters and existing operators | New algorithms or unsupported parameters |
| validator.product.theme | Tokens, node selectors/property mappings, CSS policy, numeric limits and value patterns | Changes to article-theme file structure or parsing syntax |
| formatter.steps | Add/remove/enable steps and parameters of existing operators | New processing algorithms or output types |

### Configuration, package code and host responsibilities

Configure existing capabilities; implement new business algorithms/operators in the library interpreter or custom package; change the app only for new host APIs or workspace display capabilities. “Engine work” in the table refers to that actual layer, not necessarily the workbench.

This is a data-driven capability interface. New objects can reuse registered capabilities; they do not create algorithms or execute JSON scripts. A new platform policy can often be configured with the trio, while new algorithms need implementation/registration in the capability layer. Business components keep consuming one immutable snapshot.

`schemaVersion` describes file structure, so do not increment it merely to edit policy. `product.theme.kind` and `formatVersion` identify current article-theme files (`article-theme`/`1`); keep them unchanged. Switching platforms does not require a new theme-file structure. Modified official defaults become a custom library policy and cannot be claimed as unchanged official WeChat defaults.

### Platform validation switch

| Scope | Effect |
|---|---|
| Bundled interpreter/legacy route | meta.enabled=false skips platform rules/manual reviews without platform passes |
| Still active | Formatting, syntax, safety, resources, theme structure and complete configuration checks |
| Custom package | Interpret business switches from the package declaration/implementation; do not assume bundled fields apply |

`validator.meta.enabled` is an optional boolean. Omitted or true retains platform checks. False skips platform rules and their manual reviews without creating platform pass records. Product syntax, safety, image resources and article-theme structure checks remain. Both modes load the entire trio and validate its structure, references, parameters and algorithm files; missing or invalid files still fail. Formatter preview, transformation and output steps are independent.

For example, set validator.json → meta to `{ "id": "custom-platform", "enabled": false }` and use custom-platform as the other two meta.id values. Keep product.theme, rules arrays and formatter.steps. Rules/manualReview may be empty when no platform standards are needed; a trio reduced to metadata alone is invalid. Settings and format reports show when platform validation is off. Reload after changing rules; stale tasks and check caches expire.

<a name="doc-validator-example"></a>

## Example: append a validation rule

Append the following fragments to validator.rules, format-support.meta.sources and format-support.rules respectively; never replace complete configuration files with a fragment.

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

| Capability/stage | Contract |
|---|---|
| style operators | `style.present` checks whether a declaration appears; `style.values` matches its value against an array; `style.transparent` checks transparent values; `style.important` checks authored `!important`. The first three identify a CSS property with `property`; single/multiple values use the same rule shape. |
| authoring / rendered | `authoring` checks source/compiled declarations; `rendered` checks actual DOM. Style rules with `selector` are rendered-only. Geometry rules require rendered measurements, not static-source claims. `leaf`/`nodeleaf` also inspect source before browser repair: source selectors support tags or tag[attribute]; complex selectors are rendered-only. |

<a name="doc-formatter-example"></a>

## Example: change processing steps

### Soft breaks

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

### Surface and font

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

### Dropping CSS properties

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

Merge fields into existing steps’ `parameters`, retaining other parameters rather than adding duplicate output steps. See the complete [default formatter](../../../resources/presets/platform/wechat-article/format/formatter.json). Older configurations without new fields keep their behavior; other platforms choose their own policies. Source, preview tags and PNG/PDF remain unchanged. This adds no official compliance requirement. The legacy trio path configures registered policies; self-contained packages implement new algorithms through rainy-format/1 above.

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

<details>
<summary>Implementation, notices and performance boundaries</summary>

Implementation and licenses ship locally. Mermaid is rebuilt from locked official modules to unify the KaTeX version; see [resources/render](../../../resources/render/), [math licenses](../../../public/licenses/math/) and [Mermaid licenses](../../../public/licenses/mermaid/). An isolated frame does not guarantee off-main-thread layout; check input/scrolling with small graphs and simplify or pre-render complex ones.

</details>

<a name="doc-resource-protocol"></a>

## Resource references, import and output

| Resource | Article reference | Shared reference | Behavior |
|---|---|---|---|
| Raster image | media/image/filename | /shared/image/filename | Existing image validation/preview/description index |
| General attachment | media/file/filename | /shared/file/filename | Type icon/explicit download, no execution or automatic preview; unknown files use a generic icon |

Encode complete filenames as URIs and keep actual final paths. Image metadata keeps the existing `images` object; an attachment directory's `index.json` uses version1 and a `files` object with description per filename. Directories appear on demand; old libraries are not moved wholesale. The [resource registry](../../../resources/presets/resource/types.json) is the source of current type/suffix registrations. Extension/MIME labels do not grant attachment image-preview capability.

Product checks cover safe paths, target identity, existence and image bytes. Importing is incomplete; failed/cancelled and missing references are separate. These checks remain when `validator.meta.enabled=false`. Unmigrated CSS backgrounds/fonts/complex embeds retain source with notices; local document links are not recursively carried.

### Import tasks and output review

General attachments are limited to 64MiB. Resource authorization, task identity, original protection and recovery/retry remain.

<details>
<summary>Task records and transfer parameters</summary>

`imports/tasks/<id>.json` binds library/article/source/final names. Background work writes resources/status only, never old full body text. Concurrency 2, 64KiB chunks, 100ms progress throttling and 64MiB general attachments apply. CORS/CSP, omitted credentials and permission failures remain explicit and support retry/reselection. Originals remain; knowledge indexes live in the target library's `knowledge/`.

</details>

Copy/PNG/PDF checks use current resource/render versions and reject stale output. Attachments are not presented as directly pasteable media. ZIP includes article media and explicitly referenced shared files, excluding knowledge/imports. Partial output needs user confirmation, skips unclosed/failed/missing files, keeps original references and retains the 256MB in-memory limit. Source save, render-record save, checking and output report separately.

<a name="doc-formatter-capabilities"></a>

## Formatter capabilities

| operator | parameters  Applicable route |
|---|---|---|
| markdown.soft-breaks | `mode`: `space` / `line-break`  Bundled/legacy interpreter; custom packages own their business logic |
| markdown.blank-lines | `preserve`, `betweenBlocks`, `atEdges`  Bundled/legacy interpreter; custom packages own their business logic |
| markdown.code-highlight | styles[]; optional engine (highlight/prism), themeDefaults, prismStyles mapping lexical keys to CSS declarations  Bundled/legacy interpreter; custom packages own their business logic |
| markdown.math | singleDollar, maxLength, maxExpressions; optional static MathML  Bundled/legacy interpreter; custom packages own their business logic |
| markdown.mermaid | theme, maxLength, maxDiagrams; optional static PNG  Bundled/legacy interpreter; custom packages own their business logic |
| markdown.heading-ids | mode: auto/explicit; explicit retains {#id} without generating anchors  Bundled/legacy interpreter; custom packages own their business logic |
| markdown.code-layout | wrapperClasses[], preTag, contentClasses[], copyClasses[], copyHtml, copyLabel  Bundled/legacy interpreter; custom packages own their business logic |
| css.stylesheets | entry, publicRoot; optional allowUnknownClasses  Bundled/legacy interpreter; custom packages own their business logic |
| render.document | root, body, beforeHtml, afterHtml, language, preserveIds, viewport  Bundled/legacy interpreter; custom packages own their business logic |
| render.nodes | image (width/height/classes/style/alt), link (classes/rootBase/externalTarget); supplies missing defaults only  Bundled/legacy interpreter; custom packages own their business logic |
| markdown.code-whitespace | `tabSize`; disabling retains original code whitespace  Bundled/legacy interpreter; custom packages own their business logic |
| preview.surface | lightBackground, darkBackground, fontFamily, color, stripThemeBackground  Bundled/legacy interpreter; custom packages own their business logic |
| preview.dark-mode | `mode`: algorithm or tokens; algorithm requires component transform/options, tokens contains only mode  Bundled/legacy interpreter; custom packages own their business logic |
| css.drop-properties | properties[]; repeatable  Bundled/legacy interpreter; custom packages own their business logic |
| css.utility-aliases | aliases mapping CSS property names  Bundled/legacy interpreter; custom packages own their business logic |
| output.css | inlineProperties[], dimensionProperties[], preserveAutoDimensions, colorEncoding: rgb/preserve; optional rootStyleOmissions[]  Bundled/legacy interpreter; custom packages own their business logic |
| output.html | wrapperTag, preserveAttributes[], removeClasses, stripRootBackground; optional tagMap  Bundled/legacy interpreter; custom packages own their business logic |
| output.text | maxConsecutiveNewlines, trim  Bundled/legacy interpreter; custom packages own their business logic |
| output.visual | width, pngBackground, pdfBackground, maxCanvasSide, pdfMargin  Bundled/legacy interpreter; custom packages own their business logic |

Configuration compiles in array order, but execution still has Markdown, CSS, preview and output stages. Reordering cannot move an output operation ahead of parsing. Except for `css.drop-properties`, each capability can be enabled only once to avoid conflicting parameters. Disabled capabilities use neutral engine behavior; disabling output style capture loses those styles and does not disable checking.

Rich-text copying resolves styles against each original tag before applying `output.html.parameters.tagMap` to content containers, such as `{"blockquote":"section"}` in the WeChat preset. Generated article shells still use `wrapperTag`. `output.css.parameters.rootStyleOmissions` omits styles only from generated article/body shells: the WeChat preset excludes their margins, padding and width/height constraints while retaining spacing and borders inside content cards, paragraphs and quotes. Omitting either optional setting retains legacy behavior; source, preview and PNG/PDF are unchanged. Existing libraries must explicitly update their formatter.json. For articles retaining an older render snapshot, use Update styles before copying; source and history are not migrated automatically.

| Source | Meaning |
|---|---|
| algorithm | mode selects source; transform selects component; options.mode is component-specific |
| tokens | mode only; uses theme.dark.tokens without a transform component |

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

<details>
<summary>SDK integration</summary>

The official SDK reads inline styles. The integration first captures computed colors, backgrounds, borders and decorative paint for the article root and descendants, writes RGB values to an isolated copy, then calls the unchanged SDK. Dark preview does not rewrite source, themes or light-mode clipboard content.

</details>

### Library algorithm components

Each library uses `format/algorithms/manifest.json`. New manifest schemaVersion 2 uses full library-relative script/notice paths; manifest 1 keeps its old relative semantics. Do not migrate by changing only the version number. Expected SHA checks follow library policy; actual fingerprints still identify snapshots. Choosing WeChat copies the [public WeChat component](../../../resources/presets/platform/wechat-article/format/algorithms/manifest.json), its implementation and license. Empty validator writes only an empty component manifest.

| Manifest field | Meaning |
|---|---|
| schemaVersion | 1: legacy relative paths; 2: full library paths |
| components[] | Each component has a unique id, version, scripts[], license and capabilities |
| scripts[] | Implementations loaded in order; each entry has path/expected SHA-256; path base follows manifest version and verification follows library policy |
| license | Notice path/expected SHA-256; path base follows manifest version and the license must be retained |
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

| Boundary | Contract |
|---|---|
| Allowed | Verified paint changes on existing isolated-copy nodes, adopted only after complete result validation |
| Denied | No workbench DOM, directory handles, direct network, arbitrary storage, popups or navigation |
| Not guaranteed | Permission isolation is not an arbitrary-script CPU budget; cancellation/failure protection remains |

Implementation runs only in a separate sandbox without same-origin permission. No workbench DOM or directory handle is passed in. Network, storage, popups and navigation are restricted; editing a component does not grant execution in the main page. Existing Blob images and fonts are transferred in memory with their layout context, without rescanning the library. The sandbox isolates permissions; it is not a CPU budget for arbitrary scripts.

Component files, license, parameters and fingerprints participate in snapshots and caches. Historical dependency manifests retain the original code rather than substituting today's component. Older libraries without an algorithm directory receive an explicit built-in fallback without writes; present but incomplete directories, missing capabilities and hash failures under strict verification fail. Older render records without components get a separate fallback notice and are not claimed to reproduce their original algorithm exactly.

## Loading, failures and migration

### Optional application configuration and capabilities

A no-renderer legacy library may omit the application configuration below; a package still needs its renderer declaration. A library may add `format/config.json`. Its `meta.id` must match the format trio. Omitting the file preserves theme overrides, user-selected preview appearance and all existing actions. A present but malformed file is rejected instead of falling back or mixing defaults.

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

### Capability intersection and conflicts

Any trio `meta` may declare the same `capabilities` and `rendering` objects. Restrictions intersect: any false declaration disables the capability; config.json cannot enable it again. Repeated rendering declarations must agree or the whole configuration is rejected. Undeclared controls keep their existing labels. Disabled controls remain visible with a reason, and action handlers enforce the same immutable configuration as the UI.

| Capability | Scope  Default/restriction |
|---|---|---|
| articleTheme | Selecting/applying article themes and setting the default for new articles  Retained by default; false restricts; /2 source recovery is separately guaranteed |
| previewMode | User switching of article preview appearance  Retained by default; false restricts; /2 source recovery is separately guaranteed |
| algorithm | Rendering algorithm execution; disabling it conflicts with any formatter or enabled dark rule that still requires an algorithm. Rules are never removed automatically  Retained by default; false restricts; /2 source recovery is separately guaranteed |
| copyRichText | Rich-text copying  Retained by default; false restricts; /2 source recovery is separately guaranteed |
| exportPackage / exportMarkdown / exportBody / exportPng / exportPdf | Each article export format independently  Retained by default; false restricts; /2 source recovery is separately guaranteed |

`rendering.styleAuthority` accepts theme (the legacy path) or library. Library authority requires a library stylesheet entry and compiles that stylesheet without appending article-theme CSS or token overrides. Article theme selection is disabled. Sources and theme snapshots remain unchanged; adopting a new environment is explicit. Maintaining theme resources is separate from selecting a theme for an article.

`rendering.previewMode` accepts user, light or dark. A fixed mode disables the switch without overwriting the browser preference; switching back to user restores that preference. Current capabilities govern actions, while retained render records keep their own rendering declarations. Legacy records without declarations use legacy defaults rather than today's fixed policy. New records bind the configuration to their dependency manifest; opening a record never migrates it.

The optional file loads with the trio, algorithms and styles and participates in immutable snapshot/cache identity. Configuration changes invalidate older work. Reopen the library after external edits, then explicitly update styles to adopt the new environment. Legacy libraries may omit config.json; new libraries retain their renderer declaration. Custom declarations are not labeled official defaults.

<a name="doc-preview-host"></a>

### Resource-preview host width

The optional rendering.previewWidth field controls theme, snippet and starter-preview hosts:

| Value | Behavior |
|---|---|
| default or omitted | Preserve the existing host-width behavior of each entry |
| available | Remove extra host width limits and use the available container width |

The host consumes this resource-preview policy. This UI field is excluded from the configuration context sent to pinned rainy-format/1 renderers, so existing packages do not need an upgrade. Existing viewport behavior continues to govern responsive or fixed internal layout, while content-owned CSS width constraints remain effective. Ordinary manuscript previews and export dimensions retain their current contracts. Configuration identity, conflicting declarations, immutable snapshots and stale-result guards still apply. Older configurations and render records read the missing field as default without being rewritten.

See [THEME](THEME.md#doc-preview-sources) for library-style provenance and read-only viewing. Source files and generated results are labeled separately. Missing reliable provenance is stated explicitly rather than inferred from package filenames.

### Theme saves and sample resources

Add this optional field to the existing `product.theme` object in the current library's validator.json:

```json
{ "savePolicy": { "sampleResources": "review" } }
```

### Applicable and unaffected checks

| Policy/scope | Result |
|---|---|
| Omitted or block | Sample-resource failures still block |
| review | Theme-save sample resource/dependent incomplete checks retain diagnostics and permit saving, not a pass |
| Unaffected | CSS safety/syntax, theme structure, blocking violations, configuration/write failures; snippets, starters, real articles and output retain their checks |

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

In `/2`, CSS entries, manifests and local dependencies use full library paths or declared aliases; manifest keys use real paths and all CSS resides under styles/. Local @import/url share resolution and explicit access checks without ../ traversal. Existing /1 and no-renderer routes retain their relative-URL/publicRoot semantics: Relative URLs resolve from their CSS directory. `/image/icons.svg` maps through publicRoot to `assets/image/icons.svg`, retaining fragments. Relative theme-override assets resolve from `themes/article-themes/`; virtual-root paths are recommended. Fonts can live in `assets/fonts/`. Do not import host-site business scripts.

Traversal, cycles, JS plugins and missing files are rejected. Legacy local styles reject remote CSS; package-preview HTTPS resources separately follow permissions. Limits: 256 CSS files, depth 32, 1 MiB per file, 8 MiB total; 2048 assets, 256 MiB total. Directory @source needs an explicit in-library scope, capped at 256 matching files; it does not scan every article by default.

| Configuration | Effect |
|---|---|
| viewport: null | Responsive to the preview pane, without extra display scaling |
| viewport object | width/height set CSS viewport; contentWidth sets body width; scaling does not change layout |
| beforeHtml / afterHtml | Preview only, excluded from source/Markdown body/rich-text body |

A null viewport lays out content responsively at the actual preview-column width, uses the available height for scrolling, and adds no display scaling. An explicit viewport object reproduces a fixed layout: width/height set the CSS viewport, contentWidth sets body width, and display scaling does not change that layout. beforeHtml/afterHtml affect preview only, without entering source, Markdown-body output or copied body; existing source content remains.

Custom classes and generated utilities share checks. For classes used solely as content hooks, explicitly set `css.stylesheets.parameters.allowUnknownClasses` to true; by default, classes without generated styles are checked. This does not disable source, safety or platform rules.

### Renderer interfaces and ownership

<details>
<summary>Source-package reference: complete interfaces and line coordinates</summary>

The article source field edits only the body. Original Front Matter appears in a read-only disclosure above it, while body numbers refer to the complete file, including blank lines and multiline YAML. Engine findings retain body coordinates; `ArticleFormatReport.bodyLineOffset` carries the corresponding file offset for display. Theme CSS keeps its own coordinates. Expanding the disclosure never rewrites the file; sources without metadata start at line 1.

Host adapters live in `src/lib/article-format/`. Self-contained packages use the versioned protocol above and own parsing, cleanup, algorithms and output; the table below describes the retained legacy implementation. Both paths share authorization, identity guards and existing render records, without implicit manuscript migration.

| Entry | Inputs and results | Responsibility |
|---|---|---|
| renderer.ts / compileArticleStyles | Markdown, article theme, immutable FormatSnapshot and optional stylesheet environment → CSS, candidates and diagnostics | Style compilation, cache and configuration identity |
| ArticleDocument.tsx / MarkdownPreview.tsx | snapshot, themeId, source, media and children | Document structure, Markdown/HTML, resources and common body markers |
| useArticleRenderMount.ts | hostRef, snapshot, CSS, dark and resource/image callbacks → mount target, canvases and diagnostics | ShadowRoot/iframe isolation, paper geometry, fonts and dark conversion |
| output.ts / buildClipboardPayload | Matching document root and snapshot → rich HTML, plain text and resource information | Output conversion without preview shells or temporary interaction decoration |

Pane layout, toolbars, drafts, save/delete workflows and library permissions stay in the workspace. React adapters connect media dialogs, translation and file sources through the existing resource context. Adapters own mounting and cleanup; mounting does not migrate source or history. Legacy compiler/output and editor component paths only forward to the same implementation and cache.

</details>

<a name="doc-render-records"></a>

### Render records and historical dependencies

### Creation and backup

After normal source saving, optional `render.json` records body/theme hashes, processing steps, HTML/CSS and dependency versions. Manifests live at `styles/.versions/<hash>/manifest.json`, and resources at `assets/.objects/<hash>`. Identical content is reused; history retains references and document packages include only required objects.

### Reopening and explicit updates

Complete records use their retained environment. **Update styles** explicitly rereads current configuration/dependencies; verify and save to record the new environment, while older history retains its versions. Opening/preview/list operations do not backfill or migrate records. Older history without records explains that dependencies were not retained.

### Failures and protection

Source, index and render retention have separate feedback. Dependency failure does not roll back source or pass an old record off as current success. Missing objects, damaged manifests and body/theme mismatches produce diagnostics. Do not manually change hashes or automatically delete historical objects; keep these directories in backups.

For a website that accepts Markdown, **Export article → Markdown body** extracts the reliably parsed body, retaining Markdown, HTML, classes and anchors. The publisher handles image addresses. Reports use current library rules; replaying history is not proof of present platform compliance.

### Visible preview and current inspection

| Object | Input |
|---|---|
| Visible preview | Save-only retains prior image; successful save/adoption compilation advances it |
| Inspect/copy/export | Use current source/theme/configuration, not the frozen image |
| Failure/staleness | Cannot advance visible state; adopting a theme does not save automatically |

<details>
<summary>Complete refresh and scrolling implementation constraints</summary>

The article editor's [three preview controls](README.md#doc-preview-controls) are browser UI preferences, separate from the format trio. Save-only refresh retains visible inputs and their resources. The current working canvas still uses the current body, theme and configuration for validation, copying, export and render records. Inspection alone does not advance the display boundary; successful saving followed by compilation, or successful compilation after explicitly adopting a different or updated theme, does. Theme adoption refreshes once without adding a save operation; subsequent body edits still follow the save-only preference. Failed or stale tasks do not advance the display boundary. Scroll alignment binds the visible ShadowRoot or iframe and caches valid correspondences from the saved source to the current source. Edited gaps use the nearest valid anchor; no match keeps the position unchanged. Controls, color mode, column size and document changes rebuild cached positions using passive events, requestAnimationFrame and 4 ms slices. Scrolling does not read the library or recompile. Save-only mode adds “· Save to refresh preview” after the source footer’s saved state.

</details>

<a name="doc-configuration-loading"></a>

### Format configuration

Configuration is read when opening a library, explicitly reloading render configuration or updating styles. Input, find and list navigation do not reread disk files. Reload explicitly after external edits; stale tasks/check caches expire with configuration identity. Adoption of saved render records is described above. The following trio fallback applies only to the no-renderer legacy route, never a malformed renderer:

- All three absent: explicitly identify complete built-in fallback without silently writing files.
- Partial files, old structure, damaged JSON, unknown capabilities/fields, incorrect parameter types, duplicate IDs or missing references: configuration errors. Do not combine defaults with fragments and claim success.
- Original material remains recoverable; compilation/compliance checks do not trust invalid configuration.
- A new library creates its selected trio, self-contained interpreter, declaration and notices, with an empty article directory and no test manuscripts/history.

### Migration and language

Do not relabel old lists by changing version numbers. Back up the entire old library/list, copy a complete new trio and deliberately migrate needed local policy. Older compatibility tiers, font exemptions and image three-property combinations are not automatically WeChat rules. Configuration changes do not rewrite article-theme snapshots; recheck the combination.

UI language is independent of library policy. Switching Simplified Chinese/English neither rereads nor rewrites the trio, changes formatter language, nor translates source/export content. Product diagnostics follow UI language; library rule names, descriptions and manual-review wording remain original.

Empty/invalid image addresses and confirmed loading/decoding failures are product resource errors. Failed images do not wait again for events that have already finished; unsettled resources remain explicitly incomplete. Known missing local files return diagnostics first. Repair them and check again; standards JSON is not relaxed.

<a name="doc-official-basis"></a>

## Official basis and verification scope

WeChat defaults follow the [official editor plugin specification](https://developers.weixin.qq.com/doc/service/guide/product/plugin_spec.html). The [official validation implementation](https://github.com/wechatjs/verify-article-structure-spec) is pinned to `0.2.17`, commit `1340988eccbb63181a56141a5c2171d55cd42521`, as algorithm/case reference only; the official specification takes precedence. Dark conversion uses `mp-darkmode@1.2.3-alpha.1` with its original MIT license.

Live source checks, actual layout checks and manual visual review are separate. Layout/dark measurement runs for saving, manual checks, copying and visual export. Failed image loading, cancellation and timeout are not passes. `data-ignore-width` affects width rules and its subtree; `data-no-dark` skips conversion of the current node only; `data-ignore-dm` skips the listed dark diagnostics for that node.

Text inside images, transparent images, SVG content, shared-background containers and visual/structural order still require manual review. Automated passes do not replace WeChat draft/mobile acceptance. HTML/CSS syntax, executable content, file existence and theme JSON structure are product checks, not invented WeChat rules.

<details>
<summary>Source integration and verification references</summary>

Legacy processing frames start through local static scripts and read inert JSON configuration. Format packages instead load verified declared modules in the opaque runner described above; neither path permits dynamic evaluation. Shared source generates the asset during development/build, using the static server's CSP.

See [contracts.ts](../../../src/lib/article-format/contracts.ts) for parameter contracts and [configuration tests](../../../tests/article-format-config.test.mjs) for examples/constraints.

</details>

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

The marked element and its descendants skip every width check. The outer container and other rules are still checked. There is no global flex allowance; other rules follow the current library configuration.

## Knowledge writing metadata (0.3.2)

Knowledge sources stay read-only; these records live in the manuscript library, separately from format-package configuration.

<details>
<summary>Advanced: complete writing metadata protocol</summary>

`knowledge/<partition-directory>/research-<sourceId>.json` uses schemaVersion 1 and binds one read-only source. It contains `topics` (id/name/note/articleIds/items) and `citations`. Captures retain id, sourceId, relative path, optional-empty title, content, physical line/endLine, whole and note. A rendered selection can retain its raw original range; explicit checks record change/checkedAt. Citation origins add articleId/citationId. None of these fields imposes bibliography wording. The file limit is 16MiB; the original per-document limit remains 2MiB. Writes target only the manuscript library with source/permission/root isolation checks; external file changes abort a pending commit.

Shelf captures support optional createdAt and updatedAt fields for creation/update sorting. New captures record actual times; content or note edits advance updatedAt, while viewing, checking and sorting do not. Older captures without timestamps remain valid; historical times are not inferred or fabricated. Equal or missing timestamps use the retained manual order for stable presentation. Moving preserves the capture identity and creation time; copying creates a new identity and creation time. Automatic sorting does not overwrite the manual order in topic items. Existing fields and citation contracts remain compatible.

Body citations use `[[1]](#rme-cite-<uuid>)`, displaying `[1]`. The manuscript-end region is delimited by `<!-- rainy-citations -->` and `<!-- /rainy-citations -->`; entries use `<span id="rme-cite-<uuid>"></span> [1] Free text`. Delimiters and anchors are reserved, while wording is directly editable. Malformed regions are never automatically tidied or overwritten. Tidying handles only registered real Markdown links; code examples and unrelated references/footnotes remain unmanaged. Source review updates captured origins, never manuscript reference wording.

Citation region comments and entry anchors inside Markdown code examples are unmanaged. Normal insertion preserves selected manuscript text; replacing an old marker requires explicit adoption. Source relocation preserves binding.json and the research filename; failed creation recovery requires retained ownership evidence and never treats arbitrary empty JSON as valid data.

</details>

## Article trash records

Root `_trash/` contains application-managed article recovery data, separate from `format/`, normal article indexes and exports. Operations create:

```text
_trash/
├── <trash-UUID>/entry.json
├── <trash-UUID>/article/       # Complete original tree: body, theme, assets, history and empty directories
└── cleanup-<cleanup-UUID>.json # Fixed batch and remaining undo time
```

`entry.json` schemaVersion 1 contains id, articleId, month, folder, title, deletedAt, organization (projectId/archived), orderIndex, optional orderBefore (original manual order), state, files (relative path → SHA-256) and directories. States are preparing/ready/restored; incomplete records and unknown contents are retained and reported. The complete copy and original identity are verified before retiring the source. Restoration never overwrites an occupied path; metadata failure retains the restored body and repair receipt.

Version 2 `settings.json` accepts optional `trash: { "enabled": true }`, defaulting to enabled. Reading an older library does not insert the field; explicit saving does. Disabling trash retains existing recovery data, which can still be restored; ordinary deletion then requires explicit permanent-deletion confirmation and has no Undo. Invalid settings block deletion. Draft settings do not change the saved policy.

Cleanup records use schemaVersion 1: id, entryIds, entryHashes, createdAt, remainingMs, committing and removedIds. The confirmed batch is fixed and excludes later additions. The file receipt and a library/tab-scoped synchronous checkpoint retain the remaining window; Toast and business logic share one clock. Queueing, hover, focus, expanded details and async actions do not consume undo time. Physical removal commits only after the window ends; failures retain unfinished records for retry. Closing/unmounting a notice or navigating does not commit early or prove disk space was freed. Refresh/reopen checks the original library and permission; a closed browser does not clean up in the background.

### Browser refresh-recovery identity

Refresh recovery remembers only the library bookmark ID, article path and creation identity in the browser tab. It is not format-package data and does not persist unsaved body text. Only an /editor refresh attempts to reopen the same library’s saved article; other pages stay in place. Invalid/trashed identities return to the list with feedback; navigation, another article selection or a library switch cancels late results.
