<h1 align="center">✍️ Rainy Manuscript Workspace</h1>

<p align="center"><strong>Your library. Your writing rules.</strong></p>

<p align="center">Write Markdown + HTML locally, preview layouts, check formatting and export.</p>

<p align="center">English · <a href="../zh-CN/README.md">简体中文</a> · <a href="../../../README.md">Project home</a></p>

<p align="center">
  <a href="../../../LICENSE"><img src="https://img.shields.io/badge/License-MIT-4CAF50?style=for-the-badge" alt="MIT License" /></a>
  <a href="https://github.com/rainydesignstudio/rainy-markdown-editor/tree/v0.3.2.1.1"><img src="https://img.shields.io/badge/RELEASE-v0.3.2.1.1-2563EB?style=for-the-badge" alt="Release v0.3.2.1.1" /></a>
  <a href="../../../package.json"><img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&amp;logo=nextdotjs&amp;logoColor=white" alt="Next.js 16" /></a>
  <a href="../../../package.json"><img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&amp;logo=react&amp;logoColor=black" alt="React 19" /></a>
  <a href="../../../package.json"><img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&amp;logo=typescript&amp;logoColor=white" alt="TypeScript 6" /></a>
  <a href="../../../package.json"><img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&amp;logo=tailwindcss&amp;logoColor=white" alt="Tailwind CSS 4" /></a>
</p>

<p align="center"><img src="https://github.com/user-attachments/assets/87578b5d-4015-4255-a0f9-b59367de489f" alt="Your library, your writing rules." width="960" /></p>

Manuscripts, theme snapshots, images, attachments and history stay in your authorized local library; the first default format configuration targets WeChat Official Accounts.<br />
Each library can also tailor its writing policies for platforms such as Shopify, eBay and Discord, or for a custom website; validation and rendering are configured independently.

[🚀 Quick start](#doc-quick-start) · [🌐 Use online](https://rainydesign.cn/lab/rainy-markdown-editor/) · [🌱 First use](#doc-first-use) · [🤖 Tutorials](AGENT-GUIDE.md#doc-tutorials) · [🎨 Themes](THEME.md) · [⚙️ Format policies](FORMAT.md) · [❓ FAQ](#doc-faq)

Online use still requires selecting and authorizing a local library in a desktop browser with directory read/write support; it does not move the library to the server. Available features depend on the version shown in the interface.

The feature screenshots below show the English interface in 0.3.0.0. Click a thumbnail to view the original.

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
| 🎨 **Custom themes** | Editor themes control workspace appearance; article themes control article layout, with light and dark previews. |
| 🧩 **Reusable templates** | starter templates organize a new article; snippets reuse notes, sections and other structures. Type `//` in the body to select a snippet. |
| 🗃️ **Groups and archives** | organize by project, category and month, with archiving, Fork and historical snapshots. Category tags provide another way to find articles. |
| 🖼️ **Asset library** | Manage shared/article images and attachments with type filters, search, sorting, selection, move/copy, rename, descriptions and deletion; images retain replacement and zoom previews. |
| ⚙️ **External format policies** | Each library stores its own format rules, validation and rendering policies, customizable through configuration files or a standalone rendering package without modifying the application. |
| ✅ **Format checks** | live feedback identifies formatting and local-image issues. Saving and copying also produce independent reports so you can review remaining concerns. |
| 🌐 **Chinese/English interface** | language changes preserve drafts, find/replace and existing reports. Dates, counts and release notes follow the UI language; library content stays original. |
| 📦 **Document export** | save manuscripts and export document packages, Markdown, long images or PDF. Complete source export retains metadata and unsaved edits and remains available when rendering fails. Available actions are listed in the application's export menu. |
| 🔗 **Read-only knowledge** | Connect multiple read-only knowledge sources for search, graphs, topic bookshelves, excerpts, citations and source-change checks, or import editable copies. |
| 📥 **Markdown import** | Choose a preselected theme, create the body first, copy resources in the background and pause/retry/replace them. |
| 🧮 **Math and diagrams** | Optional local math/static Mermaid rendering retains source and requires destination checks. |

Multiple article and editor themes are included. The WeChat preset also provides over twenty snippets and several starter templates. You can also start with an empty library and customize it as needed.

In manuscript details, change the folder name and click **Save article** to save it together with your other changes. Chinese and full-width punctuation is preserved; path separators, reserved characters and duplicate names are rejected. The interface shows the new folder name; the body file remains `article.md`.

The local image view-and-rename dialog uses ordinary wheel scrolling for long images and Ctrl/⌘ + wheel for zoom. Centered controls at the bottom of the image frame zoom out, zoom in, or fit the width.

<a name="doc-quick-start"></a>

## 🚀 Quick start

### 🤖 Ask an Agent to install it

Copy this request into a clean Agent conversation with little unrelated context:

> Read this project's README.md, docs/locale/en-US/README.md and docs/locale/en-US/AGENT-GUIDE.md, then help me install and use Rainy Manuscript Workspace. Explain the application/library distinction. Before installing dependencies, building or starting, verify that I can provide an external desktop browser you can actually control, with local-directory read/write support, and obtain browser-control authorization. If unavailable, stop subsequent steps and explain recovery; do not substitute a built-in browser. Reuse valid existing authorization, agree on installation directory and port, then use the README's npm commands. Print the actual directory and restart command without creating extra startup scripts. I separately grant directory access in the page. After the library passes save/reopen, offer step-by-step tutorials or direct use and briefly list the four numbered tutorials. Follow environment permissions; do not use maintainer-machine paths.

**Agent Readable: start with [AGENT-GUIDE.md](AGENT-GUIDE.md); consult the manuals for later operations under the [ongoing manual-use requirements](AGENT-GUIDE.md#doc-manual-use).** Use the repository and branch you confirm for the installation source and version.

This public package is documentation revision `0.3.2.1.1`; the app still displays `0.3.2.1`, and the package version is `0.3.2+patch.1`.

<a name="doc-run-yourself"></a>

### 💻 Run it yourself

Prepare Git, Node.js 24 LTS with npm, and a desktop browser. This repository uses npm and `package-lock.json` to lock dependencies. The browser must provide File System Access directory authorization. Desktop Chrome/Edge are suggested entry points. Verify actual directory and clipboard behavior for other system/browser combinations.

After obtaining the source, run these commands from the project directory:

```sh
npm ci
npm run build
npm start
```

Open the local address printed by the terminal and keep the service running.

The default address is `http://127.0.0.1:3500`. For another confirmed port, use `npm start -- --port 3501`, replacing the port as appropriate. `npm start -- --help` shows startup help. An occupied port causes the service to exit; it does not terminate an existing process.

After building, start the app from the same project directory with `npm start`. After source updates, install required dependencies, rebuild and refresh the browser. Restart the service if its startup script changed or it still uses the old directory.

After updating a theme or library configuration, choose **Update styles**, then copy and check the result in the clipboard receiver and destination platform. For WeChat Official Accounts, also check the draft and mobile preview manually. See [copy output configuration](FORMAT.md#doc-copy-output) for details.

<a name="doc-font-downloads"></a>

### Font downloads and offline use

Choose **Settings → Local directory → Font download source**, even before opening or creating a library. Google Fonts is the default; the free **China mirror (JSDMirror)** is available for use in China. No CDN purchase is needed. The preference belongs to this browser origin and does not follow language or automatic region detection.

First use downloads missing Sen, Noto Sans SC and Roboto Mono fonts without overwriting existing fonts or custom files. Failed downloads use system fonts while the library continues loading. Use **Download missing fonts**, change source and retry, or cancel an active download in the same section.

Once saved in the library, fonts remain available offline. To download missing fonts, the browser needs access to `raw.githubusercontent.com` or `cdn.jsdmirror.com`. Downloads use the selected source directly rather than passing through the website server. See the [font source manifest](../../../resources/font-sources.json) for font sources and licenses.

<a name="doc-first-use"></a>

## 🌱 First use

1. Open **Settings → Local directory → New library**. Enter a folder name, choose a validation and processing template (“WeChat Official Account” or “Empty validator”), select its parent and grant read/write access. The app creates a named child directory. If that name exists, choose another or use **Open existing library**.
2. For an existing library, select the library itself using **Open existing library**. Only the latest directory bookmark is remembered; authorize it again if permission expires.
3. Create an article, enter body content and save with `⌘S` on macOS or `Ctrl+S` elsewhere. Saving creates the article directory and theme snapshot.
4. Preview article themes under **Themes**. For saved articles, **Copy and apply** creates an independent copy and retains the original/theme snapshot; an unsaved new draft uses **Apply to current draft**.
5. Manage snippets and starter templates under **Templates**. Insert them through **Insert element** or a snippet trigger.
6. Import shared/article images and attachments under **Assets**. You can also drop local files onto the Assets page, review the target library, file list and formats, then confirm; cancellation writes nothing. Adopting a shared image copies it into the article's own `media/image/`; shared originals and article copies are independent.
7. Optionally connect a [read-only knowledge source](#doc-knowledge), explicitly scan, then browse/search/open graph nodes.
8. Optionally [import Markdown](#doc-markdown-import): create the body first and recover failed background resources in the task dialog.
9. Copy rich text and inspect it in the clipboard receiver, then paste it into the target platform and check the result. For WeChat Official Accounts, the user manually pastes and checks the draft and mobile preview. The receiver uses the current library’s light paper and preserves pasted colors; article dark preview does not change its surface.

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

Auto-save defaults to off for new libraries, preserving explicit existing preferences. Auto-save and automatic snapshots pause outside the editor and resume according to their original switches; manual saving and unsaved-change warnings remain.

The preview light/dark switch sits to the left of the three preview controls, whose order is unchanged.

<a name="doc-source-formatting"></a>

### ⌨️ Inline formatting shortcuts

In article source, use `Cmd/Ctrl + B`, `Cmd/Ctrl + I` and `Cmd/Ctrl + U` for bold, italic and underline. The same keys appear beside **Insert element → Text formatting**. Chosen text is retained; an empty selection inserts only paired markers. Repeating the action removes markers directly around the selection. Ordinary Markdown uses Markdown markers, while HTML paragraph text uses HTML inline tags.

Menu and keyboard actions share one undoable edit. Undo/redo still follows the focused input. Composition, read-only and unavailable inputs do not format text, and find/replace fields remain independent.

Empty image addresses and failed links/decoding report errors without repeated timeout waits. Loading resources are not treated as verified; repair the source and run Format check again.

<a name="doc-interface-language"></a>

### 🌐 Interface language

Choose **简体中文** or **English** at the bottom of the left sidebar. First use matches the browser language and falls back to English; manual choices are remembered for the current browser address. New libraries use the interface language selected when they are created. Later interface-language changes do not translate existing library content, rewrite articles or change article layout.

### 🗃️ Article lists, categories and checks

All articles, Ungrouped and projects show unarchived articles; Archive is separate. Categories come from the current collection.

**Check current scope** checks articles after title/month/category filtering, with progress and cancellation. Counts are per article, separating unchecked, stale and failed checks. The list shows the last check result; recheck after body, theme or format-policy changes.

Category tags beside the list title filter articles; click again to clear a selected tag. More than five tags are available under **More tags**. The multi-select icon selects articles for bulk project changes or archiving; the archive list supports bulk unarchiving or deletion.

After editing article files outside the app, scan and rebuild the relevant monthly indexes if list information is stale. **Refresh** does not rescan every article. Follow the page's repair instructions when it reports index problems or an incomplete list; original manuscripts and diagnostics for damaged articles are retained.

<a name="doc-knowledge"></a>

## 🔗 Read-only knowledge

1. Connect a writable manuscript library, then choose a separate directory under **Knowledge → Add knowledge source**. Only read permission is requested. The roots cannot be identical or contain one another.
2. Use **Scan updates** on first use and after editing original files. If the latest content still does not appear, use **Force rebuild**. Failed or cancelled scans retain the previous complete result; missing, ambiguous and incomplete items remain visible.
3. Relations use Markdown links and `[[path or unique filename|alias]]`. Code, math and Mermaid source examples are excluded. Global/local graphs offer filtering, locate, drag and zoom; double-click or Enter opens the read-only document.
4. Choose **Create article** to create an editable copy with a selected article theme. The knowledge source stays read-only; copied resources, indexes and task records go into the manuscript library.

Each manuscript library supports multiple read-only knowledge sources, with independent scanning and search for each source. Filter or use a local graph when a large graph is truncated. Indexes contain searchable source text and are included in manuscript-library backups. Back up knowledge originals separately.

Enter keywords and expand phrase, exclusion, title and path filters. Same-paragraph matches rank first, with collapsible document groups. The reader locates headings/passages and follows document links with a return position. The editor’s right-side **Reference material** is a lightweight browser and reader: browse responsive document cards by source, open the full document, and use breadcrumbs to return to the previous list and reading position. The panel sits above the manuscript preview, can collapse, and has a draggable divider for height adjustment. Source management, scanning, graphs and topics remain on the Knowledge page.

Adopting a passage inserts ordinary text plus `[n]` by default; block quoting is optional. You can also cite an existing argument. Reference entries are free text, with no required metadata. Explicitly reuse an entry, click its body number to edit in a small dialog, or edit the manuscript-end text directly. Only **Reorder numbers and remove unused entries** changes numbering or removes orphaned entries. Insertion preserves a manuscript selection and appends at its end. Select a legacy marker and explicitly check its replacement option to adopt it; other handwritten citations/footnotes stay unmanaged. New-draft source snapshots are recorded after the first save.

Create independent topics in **Collections**, link articles, collect documents/passages, order items and add notes. Captured text stays as collected; originals never move. **References** shows existing inbound/outbound sentences and positions and connects to the graph. **Changes** explicitly checks local originals, marks changed/missing sources, and lets you adjust a displaced passage’s line range before updating its retained snapshot. Manuscript text never changes automatically.

After a lost browser bookmark, relocating the original knowledge source retains its identity, index, topics and citations. Explicitly changing the source requires separate confirmation and creates a new source identity.

<a name="doc-markdown-import"></a>

## 📥 Import Markdown and resources

Choose **Import Markdown** on the article page and select a UTF-8 `.md` or `.markdown` file (2MiB limit). The library's article theme is preselected and can be changed. Import creates an independent manuscript and theme snapshot while retaining the original file.

To include local images or attachments, choose their source directory in the import dialog and grant read access. Selecting only the Markdown file cannot read neighboring resources. Originals remain while resources are copied into the new article. Website permissions or access restrictions can prevent network downloads; select local replacement files when needed.

Body images, audio/video resources and explicit attachment links can be copied with the manuscript. Ordinary web pages, other notes, background images and fonts in styles, and complex embeds are not migrated automatically; omitted items are reported. Saving a resource does not ensure the destination platform can display it, so check the actual result.

<a name="doc-import-tasks"></a>

### ⏳ Background tasks and recovery

- Body editing, undo and save remain available while resources copy in the background with progress. Resources arriving later do not overwrite your edits.
- **Import tasks** shows failures and offers pause/cancel, retry, source file/directory selection and replacement files. Switching articles in the same library continues; switching libraries/losing permission pauses, deleting the target cancels. Closing the page stops work; reopen and retry manually. A retry may download the file again from the beginning.
- Recovery verifies source, target and existing files. Unverified same-name files remain and report conflicts; replacements record provenance. A task-record failure retains the created manuscript with a retry notice.
- Images and attachments can be filtered, searched, adopted and downloaded in Assets. General attachments are limited to 64MiB; images use the supported formats and size limits. Supported images can be previewed; SVG, PDF, audio/video and similar attachments do not preview or execute automatically.
- Dropping/choosing files first confirms the list and target; cancellation writes nothing. Adopting shared assets makes independent article copies. Rename updates current references and keeps originals needed by history; deletion checks references. Cards and details show reference status. **Move or copy** retains originals referenced by manuscripts, history or shared locations and moves unreferenced resources. Unknown reference status disables the action, and execution rechecks it. Escape exits selection mode.
- Checks distinguish importing, failed and missing resources; incomplete work is not passed. Exported document packages include article media and explicitly referenced shared resources, excluding knowledge indexes, source caches and import tasks. Exporting a partial package requires confirmation and retains original references. In-memory packaging remains limited to 256MB.

<a name="doc-math-diagrams"></a>

## 🧮 Math and Mermaid

The bundled rendering package can enable math and Mermaid through library configuration. Older libraries and configurations without these features keep their existing behavior. Custom rendering packages follow their own implementation and declarations. See the examples in [FORMAT.md](FORMAT.md#doc-source-rendering) to enable them.

Math supports inline `$x^2$`, display math and `math` fences. Mermaid supports flowcharts, sequence, state, class and ER diagrams as static images; config directives, interactions and external resources are not executed. Original source is retained and invalid syntax is reported.

Wait for math and diagrams to finish before copying or exporting; the source can be saved first. Check the result after pasting into the destination platform, or use PNG or PDF when needed.

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

<details>
<summary>Advanced directory structure</summary>

Directories appear as the corresponding operations are used:

```text
library/
├── settings.json                    # After saving workflow, organization or appearance
├── _trash/                          # Article recovery and cleanup records, on demand
├── format/                          # Selected configuration and bundled renderer
│   ├── config.json                  # Package declaration, file hashes and settings
│   ├── renderer.js                  # Bundled rendering entry
│   ├── LICENSES.txt                 # Dependency licenses
│   ├── …                            # Other declared modules and resources
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
├── articles/
│   ├── index.json                    # Stable article identity map, on demand
│   └── YYYY-MM/
│       ├── index.json                # Rebuildable monthly index
│       └── <article-directory>/
│           ├── article.md
│           ├── theme.json            # Independent article-theme snapshot
│           ├── media/image/          # Article images and optional description index
│           ├── media/file/           # Attachments and index.json descriptions, on demand
│           ├── render.json           # Optional rendered output/dependency references
│           └── history/snapshot-…/    # Source, theme, manifest and optional render record
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
├── knowledge/                      # Source registry and per-source local partitions
│   ├── binding.json
│   └── <local-partition>/
│       ├── index/manifest.json      # Shards in this partition's index/generations/
│       └── research-<sourceId>.json # Topics, collections and citation records
└── imports/tasks/<id>.json          # Independent resource tasks
```

New-library creation installs the selected configuration and bundled renderer, loads themes and starter content according to the preset, and downloads missing fonts from the selected font source. It creates no articles and does not overwrite existing custom files. Without `settings.json`, defaults are used until settings are explicitly saved. Older libraries may retain a compatible layout; knowledge-source partitions follow the binding registry and should not be moved manually. Older-layout migration retains original files; theme subdirectories may contain migration markers.

</details>

**Back up code and libraries separately.** Source, metadata and theme snapshots are saved with articles; keep complete article directories to retain images and attachments. Historical snapshots are not complete media backups and cannot replace whole-library backups.

Regularly copy the entire library to an independent location and check that files are readable. Preserve the current library before restoration. Monthly indexes are caches; rebuilding them cannot recover missing bodies. Ignored `data/`, browser bookmarks and `out/` are not library backups.

<a name="doc-trash-and-resume"></a>

### Article trash and refresh recovery

Settings → Auto-save has three cards: auto-save, history snapshots and article trash. Trash defaults to enabled. Disabled features retain field values and disable dependent controls; saving commits the policy. With trash enabled, deletion moves the complete article into `_trash/` and offers ten-second Undo. The article sidebar’s trash entry still allows recovery afterward. Disabling trash requires explicit permanent-deletion confirmation with no Undo; existing trash remains recoverable.

Clear trash first warns about the scope, then offers thirty seconds to undo. Undo returns that batch to trash; permanent cleanup starts only after the window ends. Closing a notice or navigating never removes data early. Refresh/reopen checks permission and resumes remaining time; a closed browser does not delete files in the background. Conflicts and failed writes retain data and report the cause. Trash does not replace independent backups.

Operation notices survive page navigation. Hovering, keyboard focus, expanded details and running actions pause automatic dismissal. Important unresolved issues retain their notice until they are resolved.

Editor refresh restores this tab’s saved article in the same library; Settings/lists stay in place. Unsaved changes retain the leave warning without caching unsubmitted body text. See the [Agent guide](AGENT-GUIDE.md#doc-knowledge-workflow) and [record contract](FORMAT.md#article-trash-records).

Loading, normal restoration and successful automatic saves and snapshots do not produce repeated notices. Loading failures show their cause and recovery actions at the loading location; other actual failures retain specific causes and recovery options.

<a name="doc-faq"></a>

## ❓ FAQ

| Symptom | Action |
|---|---|
| Port is occupied | Choose a confirmed free port or let the user handle the existing service; do not automatically stop unknown processes |
| Interface still shows old code | Rebuild after updating source and refresh; restart the service only if it still serves the old directory |
| Directory permission expired | Reopen and authorize the original library under Settings → Local directory |
| Remembered library is missing after changing address/port | Different origins have separate bookmarks; select the same disk directory again. Files remain on disk |
| Image reference exists but preview cannot find it | Check the article-relative path and actual file; diagnostics distinguish missing from temporarily unreadable |
| Images fail while copying | Repair files/permissions and retry; preparation failure is not a successful full-article copy |
| Preview has not updated after edits | Check whether Refresh preview only on save is enabled, then save or update styles as needed and inspect generation status and the format report |
| Externally edited articles have stale/incomplete list information | Explicitly scan/rebuild the relevant monthly indexes; an incomplete index does not prove data loss |
| Format configuration error | Repair the complete configuration using FORMAT.md; for a standalone rendering package, update its file hashes, then use Settings → Local directory → Reload rendering configuration. Missing files or invalid configurations are not mixed with defaults |
| Theme JSON import fails | Check theme type, fields, ID/filename and collisions; see THEME.md |
| WeChat's result differs | Check the WeChat draft and mobile preview and inspect the format report for the tested scope |

<a name="doc-support"></a>

## 🧭 Supported scope

Node.js 24 is an [official LTS branch](https://nodejs.org/en/about/previous-releases) and is the baseline for installation and development.

- Common Markdown/GFM, controlled HTML, article themes and Tailwind article utilities.
- The user verified full-article mixed-image copying in the macOS WeChat receiver. This is not a guarantee for all image formats, browsers or receiving applications.
- WeChat defaults follow the [official editor plugin specification](https://developers.weixin.qq.com/doc/service/guide/product/plugin_spec.html). Checks use the current library configuration; verify actual reception in the draft and mobile preview. See [FORMAT.md](FORMAT.md) for configuration and customization.
- Read-only knowledge, single-document Markdown import and general resources are supported; math/Mermaid are optional library capabilities. Verify the actual result in the destination platform.
- Capacity limits: up to 10000 indexed documents per knowledge source, with a 2MiB limit per document. Graphs show at most 300 nodes/2000 edges; filter or use a local graph after truncation.
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

Source/version information is in [package.json](../../../package.json); the app's version button also shows changes. The project uses the [MIT License](../../../LICENSE). Fonts and third-party resources keep their own licenses; see their original files/package metadata.

## 🤝 Documentation references

The centered header, badges and feature table draw on [WeMD](https://github.com/tenngoxars/WeMD); the compact screenshot gallery draws on [doocs/md](https://github.com/doocs/md). Features, commands and examples describe this project.
