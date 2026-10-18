<h1 align="center">✍️ Rainy Manuscript Workspace</h1>

<p align="center"><strong>Your library. Your writing rules.</strong></p>

<p align="center">Write Markdown + HTML locally, preview layouts, check formatting and export.</p>

<p align="center">English · <a href="../zh-CN/README.md">简体中文</a> · <a href="../../../README.md">Project home</a></p>

<p align="center">
  <a href="../../../LICENSE"><img src="https://img.shields.io/badge/License-MIT-4CAF50?style=for-the-badge" alt="MIT License" /></a>
  <a href="../../../package.json"><img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&amp;logo=nextdotjs&amp;logoColor=white" alt="Next.js 16" /></a>
  <a href="../../../package.json"><img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&amp;logo=react&amp;logoColor=black" alt="React 19" /></a>
  <a href="../../../package.json"><img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&amp;logo=typescript&amp;logoColor=white" alt="TypeScript 6" /></a>
  <a href="../../../package.json"><img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&amp;logo=tailwindcss&amp;logoColor=white" alt="Tailwind CSS 4" /></a>
</p>

<p align="center"><img src="https://github.com/user-attachments/assets/87578b5d-4015-4255-a0f9-b59367de489f" alt="Your library, your writing rules." width="960" /></p>

`v0.3.1`

Manuscripts, theme snapshots, images and history stay in your authorized local library. The first default format configuration targets WeChat Official Accounts; each library can adapt its own policies for other platforms.

[🚀 Quick start](#doc-quick-start) · [🌱 First use](#doc-first-use) · [🤖 Tutorials](AGENT-GUIDE.md#doc-tutorials) · [🎨 Themes](THEME.md) · [⚙️ Format policies](FORMAT.md) · [❓ FAQ](#doc-faq)

Screenshots are hosted as GitHub attachments. Click any thumbnail to view the original. Feature images show the 0.3.0.0 engineering preview with English interface and library content.

<a name="doc-preview"></a>

## 📸 Screenshots

<table>
  <tr>
    <td width="50%" align="center">
      <a href="https://github.com/user-attachments/assets/d64a358c-f30d-4531-ab2b-2bbd87d0aabf"><img src="https://github.com/user-attachments/assets/d64a358c-f30d-4531-ab2b-2bbd87d0aabf" alt="Light Flowing Violet · Editor" width="100%" /></a><br />
      <sub>Light Flowing Violet · Editor</sub>
    </td>
    <td width="50%" align="center">
      <a href="https://github.com/user-attachments/assets/a835b0df-b59a-4f56-b5df-c8b6f5b145ad"><img src="https://github.com/user-attachments/assets/a835b0df-b59a-4f56-b5df-c8b6f5b145ad" alt="Dark Slate · Editor" width="100%" /></a><br />
      <sub>Dark Slate · Editor</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <a href="https://github.com/user-attachments/assets/564f5e40-aec3-428a-af88-ec2d0e46e444"><img src="https://github.com/user-attachments/assets/564f5e40-aec3-428a-af88-ec2d0e46e444" alt="Dark Sea Glass · Settings / Appearance" width="100%" /></a><br />
      <sub>Dark Sea Glass · Settings / Appearance</sub>
    </td>
    <td width="50%" align="center">
      <a href="https://github.com/user-attachments/assets/3eda266a-824e-4e16-be09-f4c31206dbf2"><img src="https://github.com/user-attachments/assets/3eda266a-824e-4e16-be09-f4c31206dbf2" alt="Light Linen · Rainy Design opening (dark preview)" width="100%" /></a><br />
      <sub>Light Linen · Rainy Design opening (dark preview)</sub>
    </td>
  </tr>
</table>

<a name="doc-features"></a>

## ✨ Features

| Feature | Description |
|---|---|
| 🗂️ **External libraries** | editor themes, article themes, snippets, starter templates, articles, history and format/check/render policies are separated by library. Each library can have its own writing environment. |
| 💾 **Local management** | article data is processed in your browser. An online deployment still manages your own authorized local library. |
| 👁️ **Rendered previews** | edit source on the left and inspect layout on the right. Preview, rich-text copying and visual export share rendering and format-processing workflows, so you can check layout and images locally. |
| 🎨 **Custom themes** | Editor themes style the workspace; article themes use library-selected automatic read-only dark colors or editable dark token overrides. |
| 🧩 **Reusable templates** | starter templates organize a new article; snippets reuse notes, sections and other structures. Type `//` in the body to select a snippet. |
| 🗃️ **Groups and archives** | organize by project, category and month, with archiving, Fork and historical snapshots. Category tags provide another way to find articles. |
| 🖼️ **Asset library** | Manage shared/article images and attachments with type filters, search, sorting, selection, move/copy, rename, descriptions and deletion; images retain replacement and zoom previews. |
| ⚙️ **External format policies** | each library has its own support rules, validator and formatter. JSON configures platform rules, line breaks, preview backgrounds and conversion strategies. |
| ✅ **Format checks** | live feedback identifies formatting and local-image issues. Saving and copying also produce independent reports so you can review remaining concerns. |
| 🌐 **Chinese/English interface** | language changes preserve drafts, find/replace and existing reports. Dates, counts and release notes follow the UI language; library content stays original. |
| 📦 **Document export** | save manuscripts and export document packages, Markdown, long images or PDF. Available actions are listed in the application's export menu. |
| 🔗 **Read-only knowledge** | Connect a separate source for explicit scans, content search, graphs and importing editable copies. |
| 📥 **Markdown import** | Choose a preselected theme, create the body first, copy resources in the background and pause/retry/replace them. |
| 🧮 **Math and diagrams** | Optional local math/static Mermaid rendering retains source and requires destination checks. |

Built-in content currently includes 7 article themes, 11 editor themes, 21 snippets and 5 starter templates. You can also create your own.

In manuscript details, press Enter or **Apply folder name** to update the index, project and ordering records and reload the manuscript. Valid Chinese and full-width punctuation is preserved; path separators, reserved characters and collisions are rejected. Details and the source header show the folder name; the body remains `article.md`. Success appears below the toolbar as **Folder updated** for three seconds, with no retained result row in the dialog. Errors retain their cause and can be dismissed.

The local image view-and-rename dialog uses ordinary wheel scrolling for long images and Ctrl/⌘ + wheel for zoom. Centered controls at the bottom of the image frame zoom out, zoom in, or fit the width.

<a name="doc-quick-start"></a>

## 🚀 Quick start

### 🤖 Ask an Agent to install it

Copy this request into a clean Agent conversation with little unrelated context:

> Read this project's README.md and docs/locale/en-US/AGENT-GUIDE.md, including the full English README linked from the root, then help me install and use Rainy Manuscript Workspace. Explain the application/library distinction and agree on installation directory, port and permissions before proceeding. Repository paths from the maintainer's machine are not my installation paths; use the location I confirm and follow the current environment's authorization rules. Use the README's npm startup method by default and print the actual directory and startup command. Do not generate extra PowerShell/CMD/Shell startup scripts. After installation, guide me through browser directory authorization and library initialization, then briefly introduce the four numbered tutorials.

**Agent Readable: start with [AGENT-GUIDE.md](AGENT-GUIDE.md); read [THEME.md](THEME.md) when creating content.** Use the clone source confirmed by the user. This branch is in development; confirm the repository and branch intended for installation.

<a name="doc-run-yourself"></a>

### 💻 Run it yourself

Prepare Git, Node.js 24 LTS with npm, and a desktop browser. This repository uses npm and `package-lock.json` to lock dependencies. macOS Arc has been used for local-directory and clipboard checks; the browser must provide File System Access directory authorization. Desktop Chrome/Edge are suggested entry points. Verify actual directory and clipboard behavior for other system/browser combinations.

After obtaining the source, run these commands from the project directory:

```sh
npm install
npm run build
npm start
```

Open the local address printed by the terminal and keep the service running.

The default address is `http://127.0.0.1:3500`. For another confirmed port, use `npm start -- --port 3501`, replacing the port as appropriate. `npm start -- --help` shows startup help. An occupied port causes the service to exit; it does not terminate an existing process.

After building, subsequent starts from the same directory need only `npm start`. After source updates, install required dependencies, rebuild and restart. The startup script reuses `out/`; if `out/index.html` is missing, it explains that `npm run build` is required and exits instead of building implicitly.

WeChat copying retains quote theme styles as `section` and omits generated preview-shell padding and size constraints while preserving internal content spacing. Before copying an existing article with current library policy, use circular-arrow **Update styles** in the editor top bar, after **Export** and before **Check format**. Verify the receiver, then manually retest WeChat. See [copy output configuration](FORMAT.md#doc-copy-output).

<a name="doc-font-downloads"></a>

### Font downloads and offline use

Choose **Settings → Local directory → Font download source**, even before opening or creating a library. Google Fonts is the default; the free **China mirror (JSDMirror)** is available for use in China. No CDN purchase is needed. The preference belongs to this browser origin and does not follow language or automatic region detection.

The app and new builds exclude the complete Sen, Noto Sans SC and Roboto Mono TTFs. Initialization downloads only missing `fonts/` files, checking size and SHA-256 before writing. Existing fonts and custom files are retained. Each file has a 30-second timeout; failures use system fonts while the rest of the library loads. Use **Download missing fonts**, change source and retry, or cancel an active download in the same section.

Once saved, library fonts remain available offline. Install and build do not prefetch fonts. The browser needs HTTPS access to `raw.githubusercontent.com` or `cdn.jsdmirror.com` for missing files, directly rather than through the website server. The [font source manifest](../../../resources/font-sources.json) owns fixed URLs, identities, versions, weights and licenses. Deployment must permit these browser HTTPS connections; font registration still reads the authorized library.

<a name="doc-first-use"></a>

## 🌱 First use

1. Open **Settings → Local directory → New library**. Enter a folder name, choose a validation and processing template (currently “WeChat Official Account”), select its parent and grant read/write access. The app creates a named child directory. If that name exists, choose another or use **Open existing library**.
2. For an existing library, select the library itself using **Open existing library**. Only the latest directory bookmark is remembered; authorize it again if permission expires.
3. Create an article, enter body content and save with `⌘S` on macOS or `Ctrl+S` elsewhere. Saving creates the article directory and theme snapshot.
4. Preview article themes under **Themes**. For saved articles, **Copy and apply** creates an independent copy and retains the original/theme snapshot; an unsaved new draft uses **Apply to current draft**.
5. Manage snippets and starter templates under **Templates**. Insert them through **Insert element** or a snippet trigger.
6. Import shared/article images and attachments under **Assets**. You can also drop local files onto the Assets page, review the target library, file list and formats, then confirm; cancellation writes nothing. Adopting a shared image copies it into the article's own `media/image/`; shared originals and article copies are independent.
7. Optionally connect a [read-only knowledge source](#doc-knowledge), explicitly scan, then browse/search/open graph nodes.
8. Optionally [import Markdown](#doc-markdown-import): create the body first and recover failed background resources in the task dialog.
9. Copy rich text and inspect it in the clipboard receiver. The user then pastes into WeChat and checks the draft and mobile preview. The receiver uses the current library’s light paper and preserves pasted colors; article dark preview does not change its surface.

Narrow windows can switch between source and preview. Directory authorization, asset operations and WeChat editing are primarily desktop-browser workflows.

<a name="doc-preview-controls"></a>

### 👁️ Article preview controls

The three icons in the preview header are ordered left to right. Hover or focus them for descriptions. Preferences are remembered per browser origin.

| Control | Default | Behavior |
|---|---|---|
| Align preview scrolling | Off | Align the rendered element corresponding to the source top. Only source scrolling drives the preview. |
| Show format check after manual save | On | Show the report after manual saving. Turning it off only hides the dialog; auto-save never opens it. |
| Refresh preview only after saving | Off | Retain the visible body, theme and styles while editing. A successful save and compilation refreshes the display; explicitly adopting a different or updated theme also refreshes it once after successful compilation. The source footer shows “Save to refresh preview” while enabled; turning it off resumes live display. |

A retained display does not replace current-draft checks, copying or export. Alignment remains available on retained displays: unchanged content keeps its correspondence, edited gaps use the nearest valid node, and no matching node leaves the current position intact. Copying also refreshes the display if the existing workflow first saves an unsaved draft. Source, checking and render-record failures are reported separately; a retained display or incomplete check is not a pass.

<a name="doc-source-formatting"></a>

### ⌨️ Inline formatting shortcuts

In article source, use `Cmd/Ctrl + B`, `Cmd/Ctrl + I` and `Cmd/Ctrl + U` for bold, italic and underline. The same keys appear beside **Insert element → Text formatting**. Chosen text is retained; an empty selection inserts only paired markers. Repeating the action removes markers directly around the selection. Ordinary Markdown uses Markdown markers, while HTML paragraph text uses HTML inline tags.

Menu and keyboard actions share one undoable edit. Undo/redo still follows the focused input. Composition, read-only and unavailable inputs do not format text, and find/replace fields remain independent.

Empty image addresses and failed links/decoding report errors without repeated timeout waits. Loading resources are not treated as verified; repair the source and run Format check again.

<a name="doc-interface-language"></a>

### 🌐 Interface language

Choose **简体中文** or **English** below the version at the lower left. First use matches the browser language; manual choice is remembered for the current browser origin. Different hostnames, ports and browsers keep separate preferences.

English is the fallback. A saved manual choice takes priority, followed by supported browser languages; unmatched languages use English. New libraries have complete Chinese and English seeds: creating a library in Chinese uses the Chinese seed; other languages use English. The seed language is recorded as `locale` (`zh-CN` / `en-US`) in `themes/default-themes.loaded`. Empty-directory initialization and Load default themes reuse it. Older libraries without a locale use English defaults without rewriting existing files. Later UI language changes do not translate or insert another set of content.

Language changes affect product text, tooltips, diagnostics and date/number display. They do not translate articles, library names, snippet/template bodies or custom-rule wording, and do not save or recompile articles. Editor appearance and article-preview light/dark mode retain their existing preferences.

### 🗃️ Article lists, categories and checks

Lists read summaries from monthly indexes. Opening an article reads its source and theme snapshot. All articles, Ungrouped and projects show unarchived articles; Archive is separate. Categories come from the current collection.

**Check current scope** checks articles after title/month/category filtering, with progress and cancellation. Counts are per article, separating unchecked, stale and failed checks. Records are reused only in the current library session and describe the last check; recheck after body, theme or format-policy changes.

The icon beside Categories opens tag management. Select tags to remove, then confirm scope and affected article count. Only those article tags are removed. Archived categories can be filtered; unarchive before removing tags.

After external file edits, explicitly scan/rebuild the index from the list's repair action. Missing fields or damaged indexes warn that the list may be incomplete. Rebuilding reads the indicated months and retains original manuscripts plus diagnostics for damaged articles. **Refresh** only rereads indexes; it does not scan every body.

<a name="doc-knowledge"></a>

## 🔗 Read-only knowledge

1. Connect a writable manuscript library, then choose a separate directory under **Knowledge → Connect knowledge source**. Only read permission is requested. The roots cannot be identical or contain one another.
2. Use **Scan updates** for the first index and subsequent incremental scans. Daily searches/graphs read the index; choosing a document reads its original. Use **Force rebuild** when content changed without size/mtime changes. Failure/cancellation retains the valid old index; scan time, missing/ambiguous links and incomplete items remain visible.
3. Relations use Markdown links and `[[path or unique filename|alias]]`. Code, math and Mermaid source examples are excluded. Global/local graphs offer filtering, locate, drag and zoom; double-click or Enter opens the read-only document.
4. Choose **Import as manuscript** to create an editable copy with a selected article theme. The knowledge source stays read-only; copied resources, indexes and task records go into the manuscript library.

Each library has one source, up to 10000 indexed documents at 2MiB each. Graphs show at most 300 nodes/2000 edges with truncation notices; filter or use a local graph. The index contains searchable source text and is included when backing up the manuscript library. Back up knowledge originals separately.

<a name="doc-markdown-import"></a>

## 📥 Import Markdown and resources

Choose **Import Markdown** on the article page and select a UTF-8 `.md` or `.markdown` file (2MiB limit). The library's default article theme is preselected and can be changed. Import creates a new manuscript and independent theme snapshot, retaining unknown Front Matter fields while normalizing target dates, categories and theme binding.

A single-file selection grants no access to neighboring resources. Choose a source directory containing that file in the import dialog for read-only access. Originals remain; final names/references are assigned in the new manuscript before resources copy in the background. HTTPS images and explicit attachments are fetched directly subject to CORS/CSP, with credentials omitted and no third-party proxy. Private-network, executable-protocol, authenticated or CORS-restricted resources fail explicitly and can be replaced with local files.

Migration covers Markdown images/explicit attachments and HTML img/srcset/SVG image/audio/video source references. Ordinary web pages and other notes are not crawled; CSS backgrounds/fonts and complex embeds remain with migration notices. Stored resources do not ensure embedded SVG/audio/video or destination support. Non-raster attachments can be managed, adopted and downloaded from Assets.

<a name="doc-import-tasks"></a>

### ⏳ Background tasks and recovery

- Body editing, undo and save remain available while resources stream in chunks with concurrency 2 and footer progress. Arrival updates resources/tasks without rewriting old full text.
- **Import tasks** shows failures and offers pause/cancel, retry, source file/directory selection and replacement files. Switching articles in the same library continues; switching libraries/losing permission pauses, deleting the target cancels. Closing the page stops work; reopen and retry manually. Network byte-range resume is not promised.
- Recovery verifies source, target and existing files. Unverified same-name files remain and report conflicts; replacements record provenance. A task-record failure retains the created manuscript with a retry notice.
- Images retain `media/image/` and `/shared/image/`; other files use `media/file/` and `/shared/file/`. General attachments are limited to 64MiB; existing image limits/formats remain. Assets shares 23 type icons, filters and an unknown-file fallback. Only supported raster images preview automatically; SVG, PDF, audio/video and other attachments do not execute or preview automatically.
- Dropping/choosing files first confirms the list and target; cancellation writes nothing. Adopting shared assets makes independent article copies. Rename updates current references and keeps originals needed by history; deletion checks references.
- Checks distinguish importing, failed and missing resources; incomplete work is not passed. Document packages include article media and explicitly referenced shared resources, excluding knowledge indexes/source caches/tasks. A partial package needs an explicit decision and keeps original references. In-memory packaging remains limited to 256MB.

<a name="doc-math-diagrams"></a>

## 🧮 Math and Mermaid

Both are optional library `formatter.steps[]` capabilities. Older libraries and default configurations without these steps keep their existing behavior; enable them using [FORMAT.md](FORMAT.md#doc-source-rendering).

Math supports inline `$x^2$`, display math and `math` fences, using local KaTeX for static MathML. Mermaid supports flowcharts, sequence, state, class and ER diagrams; an isolated frame produces static PNG. Config directives, interactions and external resources are not executed. Markdown retains source; invalid source stays with diagnostics.

Wait for diagrams before copying/exporting. Pending placeholders cannot become saved render/history artifacts; source saving remains independent, and can be followed by another save/style update once ready. Destination platforms may alter/remove MathML; verify pasted/published images too, or use PNG/PDF. Record light/dark, narrow/wide, real-browser and receiver checks separately.

## 🎨 Two theme types and four tutorials

| Goal | Guide |
|---|---|
| Create a complete article with theme, body and snippets | [Tutorial 1](AGENT-GUIDE.md#doc-tutorial-1) |
| Customize workspace fonts, colors and contrast | [Tutorial 2](AGENT-GUIDE.md#doc-tutorial-2) |
| Design/test article themes, bodies, snippets and starters | [Tutorial 3](AGENT-GUIDE.md#doc-tutorial-3) |
| Organize and import a local Markdown file as a new article | [Tutorial 4](AGENT-GUIDE.md#doc-tutorial-4) |
| Look up fields, file formats, complete examples and checks | [THEME.md](THEME.md) |

An `editor-theme` controls the workspace; an `article-theme` controls article layout/output. Changing appearance does not rewrite article-theme snapshots.

Website libraries can load their own CSS modules, SVG and fonts, configure body containers/layout viewports, and retain rendering dependencies with articles/history. See [library styles and isolated canvases](FORMAT.md#doc-library-styles). For website publication, export **Markdown body** and handle image addresses separately. Whether a rich-text receiver preserves website CSS requires testing.

These tutorials are read and carried out by your external Agent. The workspace has no built-in AI and does not log in to WeChat or publish articles automatically.

<a name="doc-library-and-backups"></a>

## 💾 Libraries and backups

Directories appear as the corresponding operations are used:

```text
library/
├── settings.json                    # After saving workflow, organization or appearance
├── format/                          # One configuration trio for a new library
│   ├── format-support.json
│   ├── validator.json
│   └── formatter.json                # steps[]
├── fonts/                           # Downloaded complete fonts and original licenses
├── themes/
│   ├── article-themes/<id>.json
│   └── editor-themes/<id>.json
├── snippets/
│   ├── index.json                    # Category index
│   └── <category>/<id>.json
├── templates/
│   ├── index.json
│   └── <category>/<id>.md
├── articles/YYYY-MM/
│   ├── index.json                    # Rebuildable monthly index
│   └── <article-directory>/
│       ├── article.md
│       ├── theme.json                # Independent article-theme snapshot
│       ├── media/image/              # Article images and optional description index
│       ├── media/file/               # Attachments and index.json descriptions, on demand
│       ├── render.json               # Optional rendered output/dependency references
│       └── history/snapshot-…/        # Source, theme, manifest and optional render record
├── styles/                          # Optional CSS and immutable rendering versions
│   ├── globals.css
│   └── .versions/<hash>/manifest.json
├── assets/                          # Library images/SVG/fonts, as needed
│   ├── image/
│   ├── fonts/
│   └── .objects/<hash>               # Resource objects referenced by history
├── shared/
│   ├── image/                       # Shared images, on demand
│   └── file/                        # Shared attachments, on demand
├── knowledge/                      # Read-only source binding/index in this library
│   ├── binding.json
│   └── index/manifest.json          # Shards in index/generations/
└── imports/tasks/<id>.json          # Independent resource tasks
```

New-library creation makes top-level directories and the format trio with an empty article directory. It then loads built-in themes, snippets and templates and copies local fonts with their original licenses. Without `settings.json`, defaults are used until settings are explicitly saved. Older-layout migration retains original files; theme subdirectories may contain migration markers.

**Back up code and libraries separately.** Source, metadata and theme snapshots are saved with articles; keep complete article directories to retain images and attachments. Historical snapshots are not complete media backups and cannot replace whole-library backups.

Regularly copy the entire library to an independent location and check that files are readable. Preserve the current library before restoration. Monthly indexes are caches; rebuilding them cannot recover missing bodies. Ignored `data/`, browser bookmarks and `out/` are not library backups.

<a name="doc-faq"></a>

## ❓ FAQ

| Symptom | Action |
|---|---|
| Port is occupied | Choose a confirmed free port or let the user handle the existing service; do not automatically stop unknown processes |
| Interface still shows old code | Rebuild after updating source, restart the static service and refresh |
| Directory permission expired | Reopen and authorize the original library under Settings → Local directory |
| Remembered library is missing after changing address/port | Different origins have separate bookmarks; select the same disk directory again. Files remain on disk |
| Image reference exists but preview cannot find it | Check the article-relative path and actual file; diagnostics distinguish missing from temporarily unreadable |
| Images fail while copying | Repair files/permissions and retry; preparation failure is not a successful full-article copy |
| Preview has not updated after edits | Save or Update styles, then inspect generation status and format report |
| Externally edited articles have stale/incomplete list information | Explicitly scan/rebuild the relevant monthly indexes; an incomplete index does not prove data loss |
| Format configuration error | Repair the complete trio using FORMAT.md, save drafts and reopen the library; partial/old configurations are not mixed with defaults |
| Theme JSON import fails | Check theme type, fields, ID/filename and collisions; see THEME.md |
| WeChat's result differs | Check the WeChat draft and mobile preview and inspect the format report for the tested scope |

<a name="doc-support"></a>

## 🧭 Supported scope

Node.js 24 is an [official LTS branch](https://nodejs.org/en/about/previous-releases). Consult delivery evidence for the actual tested environment/scope; the framework's minimum Node version does not establish support for every test tool.

- Common Markdown/GFM, controlled HTML, article themes and Tailwind article utilities.
- The user verified full-article mixed-image copying in the macOS WeChat receiver. This is not a guarantee for all image formats, browsers or receiving applications.
- WeChat defaults follow the [official editor plugin specification](https://developers.weixin.qq.com/doc/service/guide/product/plugin_spec.html). Live, layout/dark-mode and manual checks are reported separately. Older compatibility tiers and paste experiments do not establish current official compliance. See [FORMAT.md](FORMAT.md) for sources, coverage and migration.
- Read-only knowledge, single-document Markdown import and general resources are included; math/Mermaid are optional library capabilities. Consult validation records for real-browser/receiver scope.
- Collaborative editing, WeChat APIs and automatic publishing remain out of scope.
- This is one Next.js static application with no business backend, database or server-side article storage. Its static server listens locally and exposes no library-directory API.
- Initial installation/build needs dependencies. Once pages/local resources have loaded, editing/saving uses local files; this does not mean an offline installer or complete PWA cache is provided.

<a name="doc-development"></a>

## 🛠️ Development and contributions

```sh
npm run dev
npm run typecheck
npm test
npm run build
```

`npm run dev` defaults to 3500. Check for an existing service before using that port. Dependencies are locked by `package-lock.json`; review affected behavior when updating them. Use `npm ci` to reproduce the lockfile.

When reporting an issue, include app version, system/browser, steps, expected result and actual result. Share a minimal, non-sensitive sample where needed. Reproduce changes before validating saving, preview and relevant output. Real directory permissions, clipboard behavior and WeChat receiver checks are separate from automated tests.

Source/version information is in [package.json](../../../package.json); the app's version button also shows changes. The project uses the [MIT License](../../../LICENSE). Fonts and third-party resources keep their own licenses; see their original files/package metadata. The maintainer confirms GitHub repositories and remote pushes.

## 🤝 Documentation references

The centered header, badges and feature table draw on [WeMD](https://github.com/tenngoxars/WeMD); the compact screenshot gallery draws on [doocs/md](https://github.com/doocs/md). Features, commands and examples describe this project.
