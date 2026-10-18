# 资料库格式配置

简体中文 · [English](../en-US/FORMAT.md) · [项目入口](../../../README.md)

一份资料库绑定一套格式策略。打开另一资料库，会同时更换规范、校验和格式化配置；文章主题负责排版，编辑器主题负责工具界面。

```text
资料库/format/
├── format-support.json   规则含义、强度、来源及人工核对项
├── validator.json        校验能力、阶段、参数及主题结构定义
└── formatter.json        格式化步骤及参数
```

三个文件的顶层 `schemaVersion` 当前都是 `1`，`meta.id` 必须一致。没有方案索引或文章级绑定。完整默认文件在 [内置配置](../../../resources/presets/platform/wechat-article/format/)；复制整套作起点，再修改所需项。

新建资料库时，在“校验与算法模板”中选择“微信公众号”，会复制这套三件套及算法实现和许可。公开目录只包含此模板；创建后的库内配置独立保存，不随模板源自动覆盖。

“设置 → 本地目录”会显示当前实际加载的校验规范和算法版本；内置回退、旧库算法回退或配置异常会明确标识。

<a name="doc-bundled-resources"></a>

## 应用内置资源

维护应用默认内容时，界面文案在 `resources/locale/`，公开公告在 `resources/changelog/public.json`，本地开发与验收记录在不进Git的 `resources/changelog/local.md`。平台源位于 `resources/presets/platform/`；新库内容种子位于 `resources/template/fresh-library/en-US/` 与 `zh-CN/`，每套按真实资料库的主题、片段和模板目录分类，文章与历史为空。主题制作起点在 `resources/template/`。

浏览器直接加载的脚本仍在 `public/format/`、`public/algorithm/`，完整字体来源、大小与hash见[字体清单](../../../resources/font-sources.json)，只下载到授权资料库；`public/fonts/`保留三份OFL文本，图片和其它许可在 `public/images/`、`public/licenses/`。样图只使用 `/images/article-sample.png`；旧根地址或任意相对图片不会被替换成样图，应修改实际片段/模板引用。双语说明正文保留在 `docs/locale/`。

<a name="doc-editable-fields"></a>

## 可以改什么

| 对象 | 可在 JSON 中修改 | 需要改引擎的情况 |
|---|---|---|
| format-support | 名称、来源、条目说明、诊断级别、人工核对选择器 | 新的诊断展示能力 |
| validator.rules | 增删条目、启停、支持的阶段、参数；复用已有 operator | 新算法或已有能力不支持的新参数 |
| validator.product.theme | token 集合、节点选择器及属性映射、CSS 属性策略、数值上限与值格式 | 改变 article-theme 文件结构或解析语法 |
| formatter.steps | 增删步骤、启停、已有 operator 的参数 | 新的格式化算法或输出类型 |

这是一套数据驱动的能力调用接口。新增对象可以复用已注册能力，不会自动产生新的算法，也不接受 JSON 中的脚本。新增平台策略通常只需修改这三份文件；新增算法需在能力层实现和注册，业务组件继续消费同一配置快照。

`schemaVersion` 是文件结构版本，不能为了修改策略随意增加。`product.theme.kind` 与 `formatVersion` 是当前产品文件的身份（`article-theme`／`1`），保持不动；更换平台不需要更换主题文件结构。修改官方默认策略后，结果属于当前资料库的自定义策略，不能据此宣称符合公众号官方默认配置。

### 平台校验总开关

`validator.meta.enabled`为可选布尔值，省略或true继续原平台检查。设为false时跳过平台规则及对应人工核对，不生成平台通过记录；通用语法、安全、图片资源及article-theme结构检查继续。关闭前后都加载完整三件套并校验结构、规则引用、参数和算法文件；损坏或缺失仍报错。formatter的预览、转换和输出步骤独立，不受此开关关闭。

例如，将validator.json中的meta设为`{ "id": "custom-platform", "enabled": false }`，其余两份meta.id也使用custom-platform；保留product.theme、rules数组及formatter.steps。不需要平台判据时rules/manualReview可为空，不把三件套删成仅meta的文件。设置摘要与检查弹窗会显示平台校验关闭。规则修改后重新载入库，旧任务和检查缓存失效。

<a name="doc-validator-example"></a>

## MVP：追加校验规则

以下是追加到 `validator.rules` 的一个对象，使用已有的值匹配能力；这是自定义演示，不是新增公众号规范：

```json
{
  "id": "custom-alignment",
  "operator": "style.values",
  "enabled": true,
  "stages": ["authoring", "rendered"],
  "parameters": {
    "property": "text-align",
    "values": ["justify"]
  }
}
```

同时在 `format-support.rules` 中追加对应说明。`validator` 指向上面的规则 ID，`source` 必须指向 `meta.sources` 已登记的来源。自定义规则须登记自己的依据，不冒用微信官方来源。下面是追加到 format-support.json 的 meta.sources 的来源对象；示例地址应替换为自己的真实依据，Agent 不应自动访问示例地址：

```json
{
  "local-policy": { "url": "https://example.com/local-format-policy" }
}
```

```json
{
  "id": "custom-alignment",
  "section": "local",
  "title": "本库的对齐约定",
  "description": "本库要求核对两端对齐文本。",
  "severity": "warning",
  "source": "local-policy",
  "validator": "custom-alignment"
}
```

`style.present` 检查声明是否出现；`style.values` 检查声明值是否落在给定数组；`style.transparent` 检查透明值；`style.important` 检查作者的 `!important`。前三种能力以 `property` 指定 CSS 属性，单条件与多值条件使用相同规则对象。

`authoring` 检查源码和编译出的声明；`rendered` 检查实际 DOM。带 `selector` 的样式规则仅可在 `rendered` 阶段使用。几何规则只支持 `rendered`，不能把静态源码检查当作实际测量。`leaf`／`nodeleaf` 结构规则同时检查修复前的源码；源码阶段支持标签或标签[属性]选择器，复杂选择器限定只在实际DOM阶段使用。

<a name="doc-formatter-example"></a>

## MVP：修改格式化步骤

`formatter.json` 用 `steps[]` 调用能力。例如，以下步骤可把 Markdown 单次换行显示为换行：

```json
{
  "id": "soft-breaks",
  "operator": "markdown.soft-breaks",
  "enabled": true,
  "parameters": { "mode": "line-break" }
}
```

已有默认步骤改参数即可；不要另加第二个启用的软换行步骤。预览背景与正文默认色由另一个步骤决定：

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

这只是可编辑对象示例。其它平台可更换背景、字体和转换策略；它们不是通用引擎写死的微信公众号要求。

以下能力允许重复追加，多个步骤的属性列表会合并：

```json
{
  "id": "drop-decoration",
  "operator": "css.drop-properties",
  "enabled": true,
  "parameters": { "properties": ["text-transform"] }
}
```

<a name="doc-copy-output"></a>

## 富文本复制与预览外壳

编辑页顶栏循环箭头“更新样式”在“导出文章”之后、“检查格式”之前。旧稿/历史保留原渲染记录；显式更新样式并保存才采用当前库策略，不批量迁移。

| 现有步骤 | parameters字段 | 作用 |
|---|---|---|
| output.html | `tagMap: { "blockquote": "section" }` | 微信复制先读取原引用主题样式，再在输出副本映射标签；保留嵌套引用、边框、背景及内间距。 |
| output.css | `rootStyleOmissions` | 只省略生成文章根/正文外壳的指定CSS属性；微信默认包括margin/padding及各边、width/min-width/max-width、height/min-height/max-height，正文内部容器保持。 |

把字段合并到现有步骤的 `parameters`，保留其它参数，不添加重复输出步骤。完整示例见[默认formatter](../../../resources/presets/platform/wechat-article/format/formatter.json)。旧配置省略新字段时保留原行为，其他平台自行配置。这不改变原稿、预览标签或PNG/PDF，不新增公众号合规判据。JSON可调整已注册策略，新算法仍需应用能力层实现；渲染引擎未剥离为库内插件。

<a name="doc-source-rendering"></a>

## 可选公式与 Mermaid 源码渲染

向当前库 `formatter.steps[]` 加入下列已注册步骤，重载资料库并显式更新样式。默认三件套没有启用这两项；旧库/旧快照保持自身配置，参数不接受可执行代码或自定义信任策略。

```json
[
  {"id":"math","operator":"markdown.math","enabled":true,"parameters":{"singleDollar":true,"maxLength":8192,"maxExpressions":128}},
  {"id":"mermaid","operator":"markdown.mermaid","enabled":true,"parameters":{"theme":"neutral","maxLength":16384,"maxDiagrams":16}}
]
```

| 能力 | 取值与输出 |
|---|---|
| markdown.math | singleDollar布尔；maxLength为1–16384；maxExpressions为1–256。支持行内/块公式及math代码块，KaTeX生成静态MathML；不加载外部字体/脚本，宏不跨公式共享。固定拒绝信任命令，限制扩展次数/尺寸；错误保留TeX和行号。 |
| markdown.mermaid | theme为default/neutral/dark；maxLength为1–32768；maxDiagrams为1–32。支持流程/时序/状态/类/ER图，隔离帧静态PNG；不提供配置指令、交互或外部资源。语句预算256、边数100、图边长4096、结果8MiB，超限保留源码。 |

公式正文示例（行内、块公式；也可放入语言标记为math的代码块）：

```text
行内：$E=mc^2$

$$
\frac{a}{b}
$$
```

Mermaid正文使用语言标记为mermaid的代码块，其内容例如：

```text
flowchart TD
  A[开始] --> B[完成]
```

渲染中不记通过、不复制/导出占位，也不把占位存入render.json/历史成品；原文可先保存，图完成后再保存或更新样式。坏语法在代码块位置报告，源码不静默删除。MathML的目标平台支持及PNG的接收结果需要实测；官方判据继续检查静态结果，不因启用步骤而豁免。此能力不扩张手写SVG的标签/事件允许范围。

代码/实现和许可本地打包。Mermaid采用锁定官方模块重建以统一KaTeX版本，记录在 [resources/render](../../../resources/render/)；许可见 [public/licenses/math](../../../public/licenses/math/) 和 [public/licenses/mermaid](../../../public/licenses/mermaid/)。隔离帧不保证布局计算移出浏览器主线程；先用小图核对输入和滚动，复杂图可简化或提前制图。

<a name="doc-resource-protocol"></a>

## 资源引用、导入与输出协议

| 资源 | 文稿引用 | 共享引用 | 行为 |
|---|---|---|---|
| 栅格图片 | media/image/文件名 | /shared/image/文件名 | 沿用图片校验、预览和描述索引 |
| 一般附件 | media/file/文件名 | /shared/file/文件名 | 类型图标/按需下载，不执行或自动预览；未知类型回退文件图标 |

文件名按完整URI编码，保留最终实际路径。图片描述索引维持既有 `images` 对象；附件目录的 `index.json` 为version1及 `files` 对象，按文件名保存description。新目录按需出现，旧库不整体迁移。类型登记见 [资源类型表](../../../resources/presets/resource/types.json)，23类/284后缀；扩展名/MIME用于图标，附件不会因声明图片MIME而自动预览。

产品检查核对安全路径、目标归属、文件存在性和图片内容；导入中为未完成，失败/取消与缺失分别报告。`validator.meta.enabled=false`仍运行这些检查，关闭平台校验不关闭资源检查。CSS背景/字体和复杂嵌入未自动迁移项保留并提示，本地文档链接不递归携带。

任务在 `imports/tasks/<id>.json`，绑定资料库/文稿/来源及资源最终名称；后台只写资源/状态，不写正在编辑的全文。并发2、64KiB传输块、100ms进度节流、一般附件64MiB；CORS/CSP/无凭证及权限失败明确反馈，可重试/补选。本地/知识源保留，知识索引位于目标库 `knowledge/`。

复制与PNG/PDF前核对实际当前资源/渲染版本；变化则拒绝旧结果。一般附件不会被伪装为可直接粘贴的媒体。ZIP检查明确引用资源并包含文稿media及被引用shared文件，不含knowledge/imports；部分包需用户确认，跳过未close/失败/缺失文件并保留原引用，沿用256MB内存上限。检查、保存原文、保存渲染记录和输出分别反馈。

<a name="doc-formatter-capabilities"></a>

## 格式化能力

| operator | parameters |
|---|---|
| markdown.soft-breaks | `mode`: `space`／`line-break` |
| markdown.blank-lines | `preserve`、`betweenBlocks`、`atEdges` |
| markdown.code-highlight | styles[]；可选engine（highlight/prism）、themeDefaults、prismStyles（词法样式键→CSS声明） |
| markdown.math | singleDollar、maxLength、maxExpressions；可选静态MathML |
| markdown.mermaid | theme、maxLength、maxDiagrams；可选静态PNG |
| markdown.heading-ids | mode:auto/explicit；explicit保留{#id}且不自动造锚点 |
| markdown.code-layout | wrapperClasses[]、preTag、contentClasses[]、copyClasses[]、copyHtml、copyLabel |
| css.stylesheets | entry、publicRoot；可选allowUnknownClasses |
| render.document | root、body、beforeHtml、afterHtml、language、preserveIds、viewport |
| render.nodes | image（width/height/classes/style/alt）、link（classes/rootBase/externalTarget）；只补缺省属性 |
| markdown.code-whitespace | `tabSize`，关闭此步骤保留原始代码空白 |
| preview.surface | `lightBackground`、`darkBackground`、`fontFamily`、`color`、`stripThemeBackground` |
| preview.dark-mode | `mode`: algorithm或tokens；algorithm要求组件transform与options，tokens只含mode |
| css.drop-properties | `properties[]`，可重复追加 |
| css.utility-aliases | `aliases`，CSS 属性名称映射 |
| output.css | `inlineProperties[]`、`dimensionProperties[]`、`preserveAutoDimensions`、`colorEncoding`: `rgb`／`preserve`；可选 `rootStyleOmissions[]` |
| output.html | `wrapperTag`、`preserveAttributes[]`、`removeClasses`、`stripRootBackground`；可选 `tagMap` |
| output.text | `maxConsecutiveNewlines`、`trim` |
| output.visual | `width`、`pngBackground`、`pdfBackground`、`maxCanvasSide`、`pdfMargin` |

加载时按数组顺序编译配置。执行仍分为 Markdown、CSS、预览和输出阶段；调整数组位置不能把输出操作搬到解析之前。除 `css.drop-properties` 外，同一能力不能同时启用两次，避免参数互相覆盖。关闭能力使用通用引擎的中性行为；关闭输出样式快照会失去对应样式，不等于关闭检查。

富文本复制先按原标签计算样式，再按 `output.html.parameters.tagMap` 映射正文容器标签，例如微信模板的 `{"blockquote":"section"}`；生成的文章外壳仍由 `wrapperTag` 控制。`output.css.parameters.rootStyleOmissions` 只省略生成的文章/正文外壳样式，微信模板排除其 margin、padding 与宽高限制，正文卡片、段落和引用自身的间距/边框保持。两个可选项缺省时保留旧行为，不影响原稿、预览或PNG/PDF。已有资料库须显式更新自己的 formatter.json；旧稿若仍使用旧渲染快照，先“更新样式”再复制，原稿和历史不自动迁移。

`preview.dark-mode.parameters` 的两种来源互斥。自动模式示例：

```json
{"mode":"algorithm","transform":"mp-darkmode","options":{"mode":"dark","whitelist":{"attribute":["data-no-dark"]},"needJudgeFirstPage":false,"noEmit":false}}
```

手工模式只写：

```json
{"mode":"tokens"}
```

自动模式的mode选择来源，options.mode仍是组件自己的参数。手工模式采用文章主题的dark.tokens，不调用算法组件；外置CSS的dark类及预览模式保留。旧参数不含mode时由transform推导：preserve对应tokens，组件ID对应algorithm；读取不改写旧文件。validator.product.theme可声明`"darkTokens":{"allowPartial":true,"fallback":"light"}`，缺省允许部分覆盖，键复用现有颜色token，拒绝未知键、非法值和循环引用。字体／排版共享，画布背景仍取preview.surface。format-support中的官方判据保持；手工模式若仍配置需要官方转换的深色规则，会报告未完成，不自动放行。

默认 `mp-darkmode` 组件的选项为 `mode: dark`、`defaultDarkTextColor`、`defaultDarkBgColor`、`needJudgeFirstPage`、`noEmit`、`whitelist.attribute[]` 和 `whitelist.tagName[]`。官方默认模板不覆盖 SDK 的默认文字色；显式颜色选项属于该库的自定义配置。未设置 `defaultDarkBgColor` 时使用 `preview.surface` 的深色纸面。`noEmit: true` 仅计算转换记录而不生成转换样式，通常不用于可见预览。参数的业务含义由组件验证；通用层只要求有界的JSON对象，自定义组件增加参数不需要增加工作台prop。

官方 SDK 读取内联样式。接入层先采集文章根节点及后代的计算颜色、背景、边框和装饰样式，统一转换为 RGB 后写入隔离副本，再调用原样保留的 SDK。原稿、主题和浅色复制内容不因深色预览改写。

### 资料库算法组件

每库使用 `format/algorithms/manifest.json`。公共默认源在 [微信公众号组件](../../../resources/presets/platform/wechat-article/format/algorithms/manifest.json)，新建资料库会复制其实现和许可。

| 清单字段 | 含义 |
|---|---|
| schemaVersion | 协议版本，目前为1 |
| components[] | 每个组件包含唯一id、version、scripts[]、license和capabilities |
| scripts[] | 按顺序加载的实现文件；每项为相对path与原始文件SHA-256 |
| license | 许可文件的相对path与SHA-256，必须随组件保留 |
| capabilities | transform布尔值、validators[]；只声明确已实现的校验操作 |

`preview.dark-mode.parameters.transform`引用组件ID，`preserve`不运行组件。组件脚本通过`window.ArticleAlgorithm`提供两个方法：

```js
window.ArticleAlgorithm = {
  async transform(root, context) {
    // context: background、options、inlineProperties；root是隔离副本。
    root.style.color = context.options.defaultDarkTextColor || 'inherit';
  },
  async inspect(root, rules) {
    // 按收到的规则执行检查，返回发现的问题；无问题返回[]。
    // 每项：{ ruleId, element, outcome: 'violation'|'review'|'incomplete', detail? }
    return [];
  }
};
```

这是接口示例，不是公众号校验实现。新增组件可追加清单对象与实现文件，更新对应文件hash，再将formatter指向新ID；新增通用校验操作仍须注册执行能力。脚本只可改变现有节点的颜色、背景、边框和文字装饰；不能添加HTML或引入新资源。预览返回的属性、节点索引、规则ID及大小均会检查，完整结果有效后才写入处理副本。

实现只在不具同源权限的独立沙箱执行，不接收工作台DOM或目录句柄。网络、存储、弹窗和导航受限制；组件改动不获得主页面执行权。已有Blob图片与字体在内存中转交并保留布局上下文，不重新扫描资料目录。沙箱是权限边界，不提供任意脚本的CPU预算。

组件文件、许可、参数和指纹参与快照及缓存；历史依赖清单保留当时的代码，重开历史不读取今天的组件替换它。旧库缺算法目录时明示使用内置默认实现且不写原库；现存但不完整、hash不符或缺能力的目录直接失败。旧渲染记录没有组件时另作回退提示，不冒充原算法完整复现。

## 加载、失败与迁移

### 可选应用配置与能力声明

资料库可增加 `format/config.json`，其 `meta.id` 必须与三件套一致。文件可省略；省略时维持文章主题覆盖、用户选择预览明暗和全部原有操作。已声明但损坏的配置不会回退或与默认文件混用。

以下网站库示例要求三件套的 ID 为 `site-article`，并已配置完整的 `css.stylesheets` 入口：

```json
{
  "schemaVersion": 1,
  "meta": { "id": "site-article" },
  "rendering": { "styleAuthority": "library", "previewMode": "light" },
  "capabilities": {
    "articleTheme": { "enabled": false, "reason": "此库直接采用官网排版" },
    "exportPdf": { "enabled": false, "reason": "此库仅交付网页正文" }
  }
}
```

三件套的任意 `meta` 也可声明同形的 `capabilities`、`rendering`。合并只收紧能力：任一声明为false即禁用，config.json不能重新放行。rendering的重复声明必须一致，冲突直接拒绝整套。未声明的控件保留原文案；禁用控件保留位置、显示不可用状态并提供原因，执行入口使用同一配置快照守卫，不靠禁用外观保护。

| 能力 | 控制范围 |
|---|---|
| articleTheme | 文章主题选择、采用和新稿默认主题设置 |
| previewMode | 用户切换文章预览明暗 |
| algorithm | 渲染算法执行；若formatter或启用的深色规则仍需要算法，禁用声明视为配置冲突，不自动删规则 |
| copyRichText | 富文本复制 |
| exportPackage / exportMarkdown / exportBody / exportPng / exportPdf | 各种文章导出；每项独立 |

`rendering.styleAuthority`可为theme（原通道）或library。library必须具备库级样式入口；编译只消费库样式，不追加文章主题CSS或token覆盖，同时禁用文章主题选择。它不改原稿或主题快照，也不自动采用新环境。主题资源本身的维护与文章主题选择分开。

`rendering.previewMode`可为user、light或dark。固定明暗时开关不可用，原浏览器偏好仍保留；切回user后继续原偏好。当前权限用于操作入口，旧渲染记录保留其自己的渲染声明；旧记录缺少声明时使用原默认，不继承今天的固定配置。新记录的配置与依赖清单一起校验，打开记录不写迁移。

配置随三件套、算法和样式环境一起读取并参与不可变快照与缓存身份。只改配置也会使旧任务失效；外部改动后重新打开资料库，并显式“更新样式”采用新环境。默认建库仍可省略config.json；自定义声明不会冒充官方默认。

### 主题保存与样本资源

可在当前库validator.json的既有 `product.theme` 中增加：

```json
{ "savePolicy": { "sampleResources": "review" } }
```

review只作用于保存文章主题时使用的预览样本：资源失败及其明确关联的未完成检查保留原始诊断并提示待核对，允许保存主题；不是校验通过。block继续阻断，省略为block。CSS语法/安全、主题结构、真实阻断级违规、配置错误与写入失败不降级；片段、模板、实际文章及复制/导出继续原校验。此策略不修改平台规则严重性或formatter，也不代表偶发样本图片故障已修复。

<a name="doc-library-styles"></a>

### 库级样式与独立画布

无入口的旧库继续使用原通道。网站类库在同一steps[]内配置以下能力，同时核对当前规范、validator和已有输出策略：

```json
[
  { "id": "library-css", "operator": "css.stylesheets", "enabled": true,
    "parameters": { "entry": "styles/globals.css", "publicRoot": "assets" } },
  { "id": "document", "operator": "render.document", "enabled": true,
    "parameters": {
      "root": { "tag": "section", "id": "article-content", "classes": ["w-full", "min-w-0"] },
      "body": null, "beforeHtml": "", "afterHtml": "", "language": "zh-CN",
      "preserveIds": true, "viewport": null
    } }
]
```

styles/globals.css可导入库内CSS模块及Tailwind内置样式，支持@theme、@layer、@utility、@apply、@variant、嵌套和@font-face。库级样式、preflight和字体隔离于工作台；article-theme保留原结构并承担覆盖。

相对url按其CSS所在目录解析；/image/icons.svg通过publicRoot映射为assets/image/icons.svg，保留片段标识。主题覆盖中的相对资源以themes/article-themes/为基准，推荐用虚拟根路径。字体可置assets/fonts/；不要搬入宿主业务脚本。

拒绝越界、循环、远程CSS资源、JS插件及缺文件。上限：CSS256文件／32层／单文件1 MiB／合计8 MiB；资源2048个／合计256 MiB。目录@source须显式声明库内范围，最多256个匹配文件，不默认扫描全部文章。

viewport设null时按实际预览栏宽响应式排版，使用可用高度滚动，不额外缩放正文。显式viewport对象用于固定排版复现：width/height决定CSS视口，contentWidth决定正文宽度；其显示缩放不改变排版。beforeHtml和afterHtml只参与预览，不写入原稿、Markdown正文或富文本正文；原稿已有内容保留。

自定义CSS类和生成utility共用检查。只作为内容钩子的类，可显式设css.stylesheets.parameters.allowUnknownClasses为true；默认检查未生成样式的类。此选项不关闭源码、安全或平台规则。

### 渲染模块接口与职责

渲染实现集中于 `src/lib/article-format/`，所有平台使用同一套接口；资料库声明仍由可选config.json、三件套及算法快照决定。本次模块迁移不增加可执行插件入口，也不改变历史清单或旧稿。

文章源码框只编辑正文，原始Front Matter在顶部只读折叠显示；正文行号对应完整文件，空行和多行YAML均计入偏移。引擎诊断保留正文坐标，`ArticleFormatReport.bodyLineOffset`携带该次检查对应的文件偏移，界面显示时统一换算；主题CSS继续使用自身行号。折叠查看不改写文件，缺少元数据的源码从第1行开始。

| 入口 | 输入与结果 | 职责 |
|---|---|---|
| renderer.ts / compileArticleStyles | Markdown、文章主题、不可变FormatSnapshot、可选样式环境 → CSS、候选类与诊断 | 样式编译、缓存及配置身份保护 |
| ArticleDocument.tsx / MarkdownPreview.tsx | snapshot、themeId、source、media、children | 正文结构、Markdown/HTML、资源及通用正文标记 |
| useArticleRenderMount.ts | hostRef、snapshot、CSS、dark、资源/图片回调 → 挂载目标、明暗画布及诊断 | ShadowRoot/iframe隔离、纸面几何、字体与深色转换 |
| output.ts / buildClipboardPayload | 对应正文根节点、snapshot → 富文本HTML、纯文本及资源信息 | 输出转换，去掉预览外壳及运行期交互装饰 |

分栏、工具栏、草稿、保存/删除流程与资料库权限仍由工作台负责。媒体窗口、翻译和文件来源通过React适配层与现有资源上下文连接；挂载和卸载归渲染适配层，原文与历史文件不因挂载而迁移。旧tailwind/render及编辑器组件路径只转发到同一实现，不维护两套状态或编译缓存。

<a name="doc-render-records"></a>

### 渲染记录与历史依赖

正常保存原文后另存可选render.json，记录正文／主题hash、渲染步骤、HTML/CSS及依赖版本。清单在styles/.versions/<hash>/manifest.json，资源在assets/.objects/<hash>；相同内容复用，历史目录携带对应引用，文档包只带所需对象。

已有完整记录使用留存环境。点击“更新样式”显式重读当前配置和依赖，核对后保存新记录；旧历史保留原版本。打开、预览、列表不补写或迁移；无记录旧历史提示依赖未留存。

原文、索引和渲染留存分别反馈。依赖失败不回滚原文，也不把旧记录当作本次成功；缺对象、坏清单或正文／主题不匹配会诊断。不要手改hash或自动删除历史对象；备份保留上述目录。

官网交付用“导出文章 → Markdown正文”，仅提取可靠解析的body，保留Markdown、HTML、class和锚点，发布者处理图片地址。格式报告按当前库规则检查，历史回放不冒充当前平台合规。

### 可见预览与当前检查

文章编辑器的[三个预览开关](README.md#doc-preview-controls)是浏览器界面偏好，不写入格式三件套。仅保存刷新留存可见输入及其资源；当前工作画布仍使用当前正文、主题和配置，供校验、复制、导出与渲染记录使用。独立检查不刷新留存画面；成功保存后的编译，或显式采用不同/更新后主题的成功编译，推进显示边界；主题采用仅刷新这一次，后续正文编辑仍遵循仅保存偏好，不额外触发保存；失败或过期任务不推进。滚动对齐绑定当前可见ShadowRoot或iframe，缓存保存源到当前源的有效节点关系；插删处用最近有效锚点，无对应时保留位置。开关、明暗、分栏与稿件变化后重建位置缓存，沿用被动事件/rAF及4ms分片；滚动不读取资料库或重新编译。开启仅保存刷新时，源码底部保存状态后显示“· 保存刷新预览”。

<a name="doc-configuration-loading"></a>

### 格式配置

配置只在打开资料库时读取。输入、查找、列表切换不会重复读取磁盘配置。外部修改 JSON 后，保存好草稿，再重新打开当前资料库以重新加载；所有旧任务和检查缓存随配置标识失效。

- 三份都不存在：明确提示使用内置默认整套，不静默写入。
- 缺少部分文件、旧结构、JSON 损坏、未知能力／字段、参数类型错误、重复 ID 或引用缺失：报配置错误，不能混用默认文件补齐后声称通过。
- 原始资料保持可恢复；格式编译和合规检查不会把错误配置当作可信结果。
- 新建资料库生成默认三件套，文章目录为空，不附带测试文章或历史。

旧版清单不能直接改版本号当作新文件。先备份整个旧库与旧清单，再复制完整新三件套，逐项迁移明确需要的本地策略。旧版的兼容分级、字体放行或图片三属性组合不自动迁移为公众号规则。文章主题快照也不会因配置更新而被改写；需在组合中重新检查。

界面语言与库级格式策略相互独立：切换简体中文／English 不读取或改写三件套，不改变 formatter 的 language、原文或导出语言。产品层诊断随界面语言显示，库内规范名称、说明和人工核对文案保持原文。

空图片地址、无效地址及已确认读取/解码失败作为产品资源错误。失败图片不会再次等待已经结束的load/error事件；资源仍在加载时明确保留未完成状态。已确认缺失的本地文件先返回诊断，修复后主动重检；规范规则JSON不因此降低要求。

<a name="doc-official-basis"></a>

## 官方依据与验证范围

微信公众号默认规范以 [微信官方编辑器插件规范](https://developers.weixin.qq.com/doc/service/guide/product/plugin_spec.html) 为准。[官方校验实现](https://github.com/wechatjs/verify-article-structure-spec) 固定至 `0.2.17`、提交 `1340988eccbb63181a56141a5c2171d55cd42521`，仅作为算法和案例对照；冲突时以官网为准。深色转换使用 `mp-darkmode@1.2.3-alpha.1`，保留原 MIT 许可。

源码即时检查、实际布局检查和人工视觉核对分别报告。布局／深色测量在保存检查、主动检查、复制和可视导出时运行；图片载入失败、测量取消或超时不记通过。`data-ignore-width` 只影响宽度规则及其子树；`data-no-dark` 只跳过当前节点转换；`data-ignore-dm` 按当前节点所列规则跳过相应深色诊断。

图片内文字、透明图片、SVG 内容、共用背景容器和视觉／结构顺序仍需人工核对。自动报告通过不代替公众号草稿和手机预览验收。HTML／CSS 语法、可执行内容、文件存在性和主题 JSON 结构属于产品检查，不伪装为微信规范。

浏览器帧通过本地静态脚本启动，只读取不可执行的 JSON 配置；不使用内联启动代码或动态求值。共享源码生成该资源，开发与构建时自动更新，沿用静态服务的 CSP。

能力参数的执行合同见 [contracts.ts](../../../src/lib/article-format/contracts.ts)。配置示例和约束测试见 [配置测试](../../../tests/article-format-config.test.mjs)。

## 横向滚动与宽度豁免

横向滚动采用[微信官方 §1.4.4](https://developers.weixin.qq.com/doc/service/guide/product/plugin_spec.html#_1-4-4-豁免机制：data-ignore-width)现有豁免：

```html
<section class="overflow-x-scroll pb-3">
  <section data-ignore-width class="flex items-center justify-start gap-3">
    <section class="shrink-0 w-[85%]">图片与图注</section>
    <section class="shrink-0 w-[85%]">图片与图注</section>
  </section>
</section>
```

标记节点及其后代豁免全部宽度检测，外层容器仍检查，其他规则仍执行。不把 `flex` 设为全局放行，不新增 `usable` 或实测判据。
