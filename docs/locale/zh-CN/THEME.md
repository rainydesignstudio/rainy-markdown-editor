# 主题、片段与起稿模板制作说明

简体中文 · [English](../en-US/THEME.md) · [项目入口](../../../README.md)

面向为 Rainy 文稿台制作内容的 Agent 和作者。安装与编号教程见 [AGENT-GUIDE.md](AGENT-GUIDE.md)，项目入口见 [README.md](README.md)。

## 先分清产物

| 产物 | 用途 | 保存格式 |
|---|---|---|
| editor-theme | 文稿台界面、源码、颜色和字体 | JSON，kind为editor-theme，formatVersion为4 |
| article-theme | 文章预览、排版及复制输出 | JSON，kind为article-theme，formatVersion为1 |
| 片段 | 可插入正文的小段 Markdown／HTML | JSON，含内容和触发词 |
| 起稿模板 | 新文章的完整起点 | Markdown，含 Front Matter |
| 完整文章 | 最终正文与文章元数据 | article.md，配套独立theme.json、图片与附件 |

应用版本、主题 version 与格式 formatVersion 是三件事。制作新内容使用唯一 ID，避免与内置或用户文件冲突；ID及分类目录名只用小写字母、数字、连字符，长度1～48且首字符为字母或数字。保持旧文章快照，不能以修改主题库替换旧稿的theme.json。

<a name="doc-editor-theme"></a>

## editor-theme：编辑器主题

### 文件结构与字段

文件位置为资料库的 `themes/editor-themes/<id>.json`。从设置 → 外观 → 导入 JSON 进入；也可用主题设计器创建，选择并保存外观后生效。

| 字段 | 约束 |
|---|---|
| kind | 固定为editor-theme |
| id / name | 安全ID；名称1～80字符 |
| version | 三段数字，例如1.0.0 |
| formatVersion | 新主题用4；读取旧格式时由应用规范化 |
| palette | 1～128个色板值；键为安全名称，值为不含alpha的3或6位十六进制颜色 |
| colors | 只含light和dark；每套完整包含下方33个角色，值引用palette中的键 |
| fonts | 完整包含下方8个字体角色，每个值是非空安全字体栈 |
| surfaces | 可选；只使用正式字段与固定结构，未使用时整个字段省略 |

颜色角色：

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

字体角色：

```text
ui serif mono editorSource articleSource heading subHeading eyebrow
```

先设计调色板，再映射语义角色；不要把字面色值直接填入colors，也不要增添未实现的角色。浅色和深色分别设计；跟随系统是显示模式，文件仍只有light／dark。

fonts中的ui用于界面，heading／subHeading／eyebrow分别服务主标题、副标题和上标；editorSource用于内容类编辑，articleSource用于文章源码；代码字体采用mono及其回退。先确认用户指定字体可用，再加入系统回退。Sen Local、Noto Sans SC Local、Roboto Mono Local 从所选外部源补齐到资料库后也可采用；来源、失败重试与离线使用见[字体下载说明](README.md#doc-font-downloads)，原许可保留。文章主题与微信输出不依赖这些界面字体。

可选surfaces由light／dark两套组成；各项可省略，省略保留既有角色回退。正式字段为primaryButton、primaryText、primaryHover、primaryLine、secondaryButton、eyebrow、dangerSurface、field、shadow、panelShadow、toggleShadow、backdrop和canvasWash。颜色全部引用palette键；primaryHover为一个键或四个渐变键；field／shadow／panelShadow／toggleShadow／backdrop为`{ color, opacity }`，opacity范围0～100；canvasWash为三色键数组与opacity。以[正式类型和校验器](../../../src/lib/editorThemes.ts)为准，不能用该字段注入任意CSS。

<a name="doc-editor-theme-example"></a>

### 完整 editor-theme 示例

保存为 `guide-mist.json` 后导入。示例使用内置雾灰的字段与色板体系，改用独立ID；制作客户主题时按确认的偏好调整色板、角色映射和字体，不只改名称。

```json
{
  "kind": "editor-theme",
  "id": "guide-mist",
  "name": "教程 · 雾灰",
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

### editor-theme 核对

1. 使用正式[校验器](../../../src/lib/editorThemes.ts)或应用导入，确认字段、两套角色和字体有效。
2. 先在测试库导入，再选择并保存外观；关闭重开设置，确认选择和文件一致。
3. 看浅色、深色及跟随系统；正文／提示文字与底色应可读，状态色、焦点、边界、选中与禁用要可区分。
4. 看导航、弹窗、菜单、表单、源码与滚动。预览主题草稿与真正采用分别核对。
5. 主题只能控制已有语义用途。需要改变界面结构或新增控件时，应另行提出应用开发任务。

<a name="doc-article-theme"></a>

## article-theme：文章主题

### 字段与作用域

下述 token、节点、CSS 属性和值的约束以当前资料库 validator.product.theme 为准；表格与示例描述内置默认配置。

文件位置为 `themes/article-themes/<id>.json`。在“主题”页面导入JSON，先检查完整排印。已保存文章使用“复制并应用”，保留原稿和主题快照；未保存新稿使用“应用到当前稿”。新建文章时也可直接选择这套主题。

所有文章主题共用资料库的 Markdown 样张 `themes/preview.md`。主题库、主题编辑器、颜色检查和保存校验使用同一份内容；文章内选择主题仍预览当前正文。新库带有对应种子语言的样张；缺文件时采用库中记住的语言，语言缺失或不支持则回退英文，并标明默认来源。样张读取失败或内容无效时明确报错。打开旧库不补写缺失样张，已有自改样张保持。修改文件后重新载入资料库；切换界面语言不会翻译或替换它。

| 字段 | 约束 |
|---|---|
| kind | 新文件明确填article-theme；旧的无kind快照仍可读取 |
| id / name / version | 安全ID、非空名称、数字版本；建议三段数字 |
| formatVersion | 固定为1 |
| tokens | 完整包含下方11个受支持颜色键，值为安全CSS值 |
| dark.tokens | 可选；手工深色颜色覆盖，只允许上方tokens中的颜色键；缺项继承浅色 |
| css | 字符串，限定文章预览作用域；不超过20,000程序字符串长度 |
| nodes | 可选；只用于正式支持的节点与fontSize／lineHeight／color覆盖 |

必需token：

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

在默认配置中，CSS选择器从 `.article-preview .article-body` 出发；外层 `.article-preview` 仅接受受限文字／背景声明。使用平铺规则，不写嵌套、媒体规则、:root、:host、:global、:has、@import、@font-face、远程资源、可执行内容或!important。display只用文章需要的block、inline、inline-block、table、table-cell、table-row或list-item；不用flex／grid。

节点键为h1～h6、paragraph、blockquote、inlineCode、codeBlock、table、caption、divider；覆盖属性仅fontSize、lineHeight、color。完整属性、值与长度边界见[校验器](../../../src/lib/themeValidation.ts)。

文章明暗纸面、预览字体、深色转换及输出策略由当前资料库的 `format/formatter.json` 决定。内置微信公众号默认通过官方 `mp-darkmode` 转换隔离副本，包含彩色、渐变及背景图片的处理；不再采用仅镜像中性灰的旧模型。其它平台可禁用转换或调整配置。制作时分别核对浅色、深色和接收方效果，原稿与浅色复制不会被深色预览改写。

文章主题的颜色表有浅色／深色两列。`preview.dark-mode.parameters.mode` 为 `algorithm` 时，深色列只读，显示当前样张实际转换后的色值；一个角色可能有多个结果，未使用、计算中与失败分别显示。为 `tokens` 时，两列均可编辑，深色只保存到 `dark.tokens`；点击“继承浅色”可移除单项覆盖。颜色变量在计算样式前应用，固定CSS色值及节点字面颜色仍按原声明生效。字体和排版共用；背景取 `preview.surface`，不增设纸面颜色键。切到自动模式会保留手工组，但不使用或覆盖它。

旧主题未设置dark时保持原有样式；旧formatter未写mode时由原transform推导，preserve保留外置CSS的dark行为。主题和历史不会隐式迁移。深色查看仍只操作隔离副本，浅色复制／导出保持原策略。

主题结构／安全检查与平台格式报告分别反馈。当前资料库的 `format/validator.json` 定义主题 token、节点映射及结构限制，并以已注册能力执行平台规则；规则文案、强度和来源见 `format-support.json`。详情见 [FORMAT.md](FORMAT.md)。有效 JSON 不等于平台合规，实际布局及人工核对未完成时不能记通过。

正文中的语义工具类例如 `text-article-accent`、`bg-article-tint`、`border-article-line` 对应这些token。复制输出由应用生成必要内联样式；不要要求微信加载本地class、CSS变量或自定义字体。工具UI的样式规范不用于改写用户正文数据。

本示例的图片用 `max-width:100%`、`height:auto`、`display:block` 保持常规自适应；这属于示例排版选择。公众号官方宽度规则检查多屏幕的布局、居中和溢出，图片先取实际宽度，失败时按声明／`data-w`／HTML 宽度及透明占位兜底。没有“只有三属性组合才放行 height:auto”的现行判据。输出是否保留自动尺寸取 formatter 的配置；图片加载、文件存在性和实际布局分别核对。

文章编辑器的[预览操作开关](README.md#doc-preview-controls)不属于主题JSON。开启“仅保存时刷新”后，正文编辑保留当前画面；显式采用不同或更新后的主题会重新编译，成功后立即刷新一次，后续正文编辑仍等保存刷新。采用动作不额外触发保存，落盘沿用既有保存流程；编译失败或过期结果不推进预览。关闭此开关恢复实时。文章主题库、片段和起稿模板的设计预览保持各自原有流程。

<a name="doc-article-theme-example"></a>

### 完整 article-theme 示例

使用库级CSS时，基础样式由formatter的css.stylesheets加载，可在本地模块维护preflight、媒体规则、嵌套、图标与字体，见 [FORMAT.md](FORMAT.md#doc-library-styles)。article-theme保留原JSON结构及节点覆盖；文章选择器按render.document映射至实际容器，editor-theme不参与。

先配置正文容器及继承的字体、颜色和背景，再做覆盖；片段使用这个环境的类与token。网站发布用Markdown正文输出，备份保留render.json及共享依赖；无记录旧稿不能承诺复原当时的库级CSS。

保存为 `guide-paper.json`。css字符串中的 `\n` 表示换行，JSON不能含注释或未转义换行；应用编辑器也可在CSS标签页查看和修改。

```json
{
  "kind": "article-theme",
  "id": "guide-paper",
  "name": "教程 · 纸页",
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

## 片段

位置为 `snippets/<分类>/<id>.json`；分类与顺序记于 `snippets/index.json`，正文文件不重复保存categoryId。优先在“模板 → 片段”新建，填写信息、选择分类，然后编辑正文并“保存内容”；Agent也可在用户明确授权的资料目录创建唯一文件，刷新应用后核对。

字段包含id、name、trigger、description、content，可选icon。trigger为 `//` 加小写字母、数字和连字符；name最长80、description最长240、content最长64,000（程序字符串长度）。光标标记 `▌` 最多一个，在插入时移除并定位光标。同名文件或重复触发词先处理冲突，不覆盖未知内容。

默认片段包含四图横排及无内边距变体；滚动容器固定纵向高度按现有规则豁免，宽度豁免仍限实际横向列表内层。引用和生成外壳的复制取[输出策略](FORMAT.md#doc-copy-output)，正文宽度检查保持。

<a name="doc-snippet-example"></a>

### 完整片段示例

保存为 `snippets/default/guide-note.json`；default分类须已经存在。通过应用新建时，把信息填入对应控件，只把content放入正文编辑区。

```json
{
  "id": "guide-note",
  "name": "教程 · 提示",
  "trigger": "//guide-note",
  "description": "一段随文章主题着色的提示，光标落在需要补充的正文位置。",
  "icon": "quote",
  "content": "<section class=\"my-4 rounded-lg bg-article-tint p-4\">\n  <p class=\"m-0 text-article-ink\"><strong class=\"text-article-accent\">提示：</strong>▌在这里补充说明。</p>\n</section>"
}
```

在文章源码里输入 `//guide-note` 并从片段列表采用，或用插入元素入口。整篇交付时输出展开后的内容，不把触发词当作最终文章。

<a name="doc-starter-templates"></a>

## 起稿模板

位置为 `templates/<分类>/<id>.md`；分类索引位于 `templates/index.json`。模板ID由文件名决定，名称来自Front Matter的title，说明来自description；可用templateIcon指定正式图标。正文不可为空，最长250,000（程序字符串长度）。

Front Matter放在源码开头，用两条 `---` 包住合法YAML。title、description、author、createdAt、updatedAt为字符串；categories为字符串数组；theme为包含id／version的对象。新稿会使用新日期与所选文章主题，不能把模板时间当作最终稿的保存时间。

模板生成文稿后可独立修改文章目录；模板ID、文章标题和 `article.md` 文件名各自保持职责。模板正文卡片/引用的内部间距在复制时保留。

<a name="doc-starter-example"></a>

### 完整起稿模板示例

保存为 `templates/default/guide-starter.md`，先导入guide-paper主题。示例日期可由Agent替换为制作时日期；方括号是需要作者填充的正文，不是应用宏。

```markdown
---
title: 从本地资料开始的一篇文章
description: 以一份模板组织正文与提示片段。
author: 示例作者
categories:
  - 教程
createdAt: "2026-10-03T00:00:00.000Z"
updatedAt: "2026-10-03T00:00:00.000Z"
theme:
  id: guide-paper
  version: "1.0.1"
templateIcon: book
---

# [填写文章标题]

[用一段话说明本文讨论什么。]

## 先把资料放好

[补充正文、证据或案例。]

<section class="my-4 rounded-lg bg-article-tint p-4">
  <p class="m-0 text-article-ink"><strong class="text-article-accent">提示：</strong>[补充说明。]</p>
</section>

## 留下下一步

[写一项读者可以执行的行动。]
```

在“模板 → 起稿模板”新建信息后编辑正文并保存，或由获授权的Agent写入新文件、刷新读取。应用内的模板编辑通常隐藏Front Matter，信息在信息弹窗管理；外部文件仍保存完整源码。

<a name="doc-complete-article-example"></a>

## 整篇文章示例

此稿把主题、模板结构和提示片段合在一起，正文无片段触发词或光标占位符。它使用随应用提供的 `/images/article-sample.png`，真实素材通过应用导入后改用 `media/image/<文件名>`。

```markdown
---
title: 从本地资料开始的一篇文章
description: 以一份模板组织正文与提示片段。
author: 示例作者
categories:
  - 教程
createdAt: "2026-10-03T00:00:00.000Z"
updatedAt: "2026-10-03T00:00:00.000Z"
theme:
  id: guide-paper
  version: "1.0.1"
---

# 从本地资料开始的一篇文章

把资料放在自己能找到的位置，写作会轻松一点。今天先建好目录，再写第一段。

## 先把资料放好

在设置里新建一个命名清楚的资料库。正文、主题快照和文章图片会一起保存，代码目录则负责启动应用。

![应用随附的示例图片](/images/article-sample.png)

<section class="my-4 rounded-lg bg-article-tint p-4">
  <p class="m-0 text-article-ink"><strong class="text-article-accent">提示：</strong>先在测试资料库里完成一次保存和重开。</p>
</section>

## 留下下一步

保存文章，然后复制富文本，在接收区确认图片与段落顺序。正式粘贴到公众号后，再由使用者检查草稿和手机预览。
```

通过应用创建／保存文章，让元数据、月目录与theme.json保持一致。Agent直接制作文件时须核对实际资料库、年月、文章目录和主题快照，不能只写article.md就宣称文章完整。

应用保存同步当月index.json中的标题、摘要、作者、分类、日期、主题绑定和保存诊断；列表摘要不包含正文或主题CSS。直接制作文稿后，主动扫描／重建对应年月的索引再核对列表，避免外部文件与列表摘要不一致。索引可重建，不能替代原稿；文章主题及正文检查由目标文章或“检查当前范围”完成。

<a name="doc-verify-examples"></a>

## 五类示例验证

| 产物 | 操作 | 成功证据 |
|---|---|---|
| editor-theme | 导入、选择、保存，切换明暗／系统 | 文件可读回，颜色与字体角色生效，文章快照保持独立 |
| article-theme | 导入、预览；新稿直接采用，已保存文章复制并应用 | 独立主题快照正确，标题／正文／引用／图片可读 |
| 片段 | 新建或载入，使用触发词插入，保存 | 内容展开，光标标记移除，保存重开一致 |
| 起稿模板 | 新建或载入，创建测试新稿 | 结构与信息正确，文章使用所选主题及新日期 |
| 整篇文章 | 保存重开、更新样式、复制接收 | 文字与图片顺序保留，状态与实际文件一致 |

源码校验先跑实际示例，校验器调用可参考仓库测试；不把JSON能解析当作完整通过。再在测试资料库和真实浏览器验证流程。公众号草稿／手机预览由使用者在场检查，未测的格式和平台如实保留。

验证后交付文件、采用方式、通过项与未验证项；模板的填充提示允许保留，完整文章则应清除占位内容。发生读写、主题生成或图片问题时保留稿件，定位失败环节后重试。

界面语言不会翻译本文件示例或已保存的库内名称、正文、规则描述。 内置种子在 `resources/template/fresh-library/zh-CN/` 与 `en-US/` 分别编写完整内容，ID、文件名和设计tokens对应；对象本身不增加i18n字段。新库确定语言后，切换界面不会改写已保存内容，默认英文回退。本文两语示例使用相同技术字段和 ID，示例文字可按读者语言调整。

<a name="doc-resource-references"></a>

## 图片、附件与源码渲染

片段/模板引用应用样图时使用完整 `/images/article-sample.png`。制作真实文稿时，先导入或采用资源，再使用实际分配的文稿路径；共享资源采用后是独立副本，不复制源目录的写权限。

```text
![图片](media/image/photo.png)
[附件](media/file/report.pdf)
```

图片与附件沿用各自描述索引；附件显示类型图标，未知文件回退通用图标，不自动预览/执行。跨稿复制片段或模板时不会连带复制原稿媒体，需重新导入并更新引用。检查导入中/失败/缺失，保存重开后再确认；来源知识文件只读。

公式和Mermaid由库内formatter可选步骤决定，配法与限额见 [FORMAT.md](FORMAT.md#doc-source-rendering)。片段只保存源码，可含行内/块公式或语言标记为math/mermaid的代码块。主题负责周围的标题、段落、间距与配色，不注入执行脚本；Mermaid的图形主题由该步骤控制。

在短/长稿中一起验证源码位置、等待/错误、深浅/窄宽、滚动、保存重开、历史和输出。MathML/静态PNG各有接收限制；未启用库应保持原源码展示。制作内容不能以本机预览替代平台验收。

## 正式实现入口

- [editor-theme类型与校验](../../../src/lib/editorThemes.ts)、[编辑器主题文件读写](../../../src/lib/editorThemeLibrary.ts)
- [article-theme类型](../../../src/lib/types.ts)、[文章主题校验](../../../src/lib/themeValidation.ts)、[主题目录](../../../src/lib/themeDirectories.ts)
- [片段／模板文件与校验](../../../src/lib/contentLibraries.ts)、[Front Matter](../../../src/lib/frontMatter.ts)
- [文章文件与快照读写](../../../src/lib/fileSystem.ts)、[渲染与复制](../../../src/lib/render.ts)
- [资料库格式配置、能力和迁移](FORMAT.md)

本文引用仓库内正式实现；更改类型、字段或校验条件时，同时更新对应示例和说明。

### 编辑器表面色与透明度

设置 → 外观 → 编辑器主题中，所有主题提供相同的33个基础角色与13个表面编辑项；数量统计编辑项，不是不同色值。表面包括主按钮常态/悬停/文字/边线、次按钮、危险按钮、装饰上标、表单、浮层与弹窗阴影、卡片/开关阴影、遮罩和三色工作区点缀。两种模式分别编辑；修改表面色会分离该项的调色板引用，不连带修改原基础角色。

未配置的次按钮保持透明，表单和阴影沿用原回退；首次显式设置相应表面后才覆盖。浮层/弹窗共用shadow材质；卡片和开关阴影独立。按钮悬停可选纯色或四段渐变，点缀和半透明材质可调不透明度；不开放任意CSS或布局尺寸。旧主题及缓存继续有效，不自动重写用户文件。
