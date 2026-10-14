# 资料库格式配置

一份资料库绑定一套格式策略。打开另一资料库，会同时更换规范、校验和格式化配置；文章主题负责排版，编辑器主题负责工具界面。

```text
资料库/format/
├── format-support.json   规则含义、强度、来源及人工核对项
├── validator.json        校验能力、阶段、参数及主题结构定义
└── formatter.json        格式化步骤及参数
```

三个文件的顶层 `schemaVersion` 当前都是 `1`，`meta.id` 必须一致。没有方案索引或文章级绑定。完整默认文件在 [内置配置](src/lib/article-format/defaults/)；复制整套作起点，再修改所需项。

## 可以改什么

| 对象 | 可在 JSON 中修改 | 需要改引擎的情况 |
|---|---|---|
| format-support | 名称、来源、条目说明、诊断级别、人工核对选择器 | 新的诊断展示能力 |
| validator.rules | 增删条目、启停、支持的阶段、参数；复用已有 operator | 新算法或已有能力不支持的新参数 |
| validator.product.theme | token 集合、节点选择器及属性映射、CSS 属性策略、数值上限与值格式 | 改变 article-theme 文件结构或解析语法 |
| formatter.steps | 增删步骤、启停、已有 operator 的参数 | 新的格式化算法或输出类型 |

这是一套数据驱动的能力调用接口。新增对象可以复用已注册能力，不会自动产生新的算法，也不接受 JSON 中的脚本。新增平台策略通常只需修改这三份文件；新增算法需在能力层实现和注册，业务组件继续消费同一配置快照。

`schemaVersion` 是文件结构版本，不能为了修改策略随意增加。`product.theme.kind` 与 `formatVersion` 是当前产品文件的身份（`article-theme`／`1`），保持不动；更换平台不需要更换主题文件结构。修改官方默认策略后，结果属于当前资料库的自定义策略，不能据此宣称符合公众号官方默认配置。

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

同时在 `format-support.rules` 中追加对应说明。`validator` 指向上面的规则 ID，`source` 必须指向 `meta.sources` 已登记的来源。自定义规则须登记自己的依据，不冒用微信官方来源。

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

## 格式化能力

| operator | parameters |
|---|---|
| markdown.soft-breaks | `mode`: `space`／`line-break` |
| markdown.blank-lines | `preserve`、`betweenBlocks`、`atEdges` |
| markdown.code-highlight | styles[]；可选engine（highlight/prism）、themeDefaults、prismStyles（词法样式键→CSS声明） |
| markdown.heading-ids | mode:auto/explicit；explicit保留{#id}且不自动造锚点 |
| markdown.code-layout | wrapperClasses[]、preTag、contentClasses[]、copyClasses[]、copyHtml、copyLabel |
| css.stylesheets | entry、publicRoot；可选allowUnknownClasses |
| render.document | root、body、beforeHtml、afterHtml、language、preserveIds、viewport |
| render.nodes | image（width/height/classes/style/alt）、link（classes/rootBase/externalTarget）；只补缺省属性 |
| markdown.code-whitespace | `tabSize`，关闭此步骤保留原始代码空白 |
| preview.surface | `lightBackground`、`darkBackground`、`fontFamily`、`color`、`stripThemeBackground` |
| preview.dark-mode | `transform`: `preserve`／`mp-darkmode`；`options` |
| css.drop-properties | `properties[]`，可重复追加 |
| css.utility-aliases | `aliases`，CSS 属性名称映射 |
| output.css | `inlineProperties[]`、`dimensionProperties[]`、`preserveAutoDimensions`、`colorEncoding`: `rgb`／`preserve` |
| output.html | `wrapperTag`、`preserveAttributes[]`、`removeClasses`、`stripRootBackground` |
| output.text | `maxConsecutiveNewlines`、`trim` |
| output.visual | `width`、`pngBackground`、`pdfBackground`、`maxCanvasSide`、`pdfMargin` |

加载时按数组顺序编译配置。执行仍分为 Markdown、CSS、预览和输出阶段；调整数组位置不能把输出操作搬到解析之前。除 `css.drop-properties` 外，同一能力不能同时启用两次，避免参数互相覆盖。关闭能力使用通用引擎的中性行为；关闭输出样式快照会失去对应样式，不等于关闭检查。

`mp-darkmode` 的可配置选项目前为 `mode: dark`、`defaultDarkTextColor`、`needJudgeFirstPage`、`noEmit`、`whitelist.attribute[]` 和 `whitelist.tagName[]`。`noEmit: true` 仅计算转换记录而不生成转换样式，通常不用于可见预览。库内明暗纸面分别来自 `preview.surface`。

## 加载、失败与迁移

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
      "preserveIds": true, "viewport": { "width": 1606, "height": 959, "contentWidth": 996 }
    } }
]
```

styles/globals.css可导入库内CSS模块及Tailwind内置样式，支持@theme、@layer、@utility、@apply、@variant、嵌套和@font-face。库级样式、preflight和字体隔离于工作台；article-theme保留原结构并承担覆盖。

相对url按其CSS所在目录解析；/image/icons.svg通过publicRoot映射为assets/image/icons.svg，保留片段标识。主题覆盖中的相对资源以themes/article-themes/为基准，推荐用虚拟根路径。字体可置assets/fonts/；不要搬入宿主业务脚本。

拒绝越界、循环、远程CSS资源、JS插件及缺文件。上限：CSS256文件／32层／单文件1 MiB／合计8 MiB；资源2048个／合计256 MiB。目录@source须显式声明库内范围，最多256个匹配文件，不默认扫描全部文章。

viewport决定CSS排版宽高，contentWidth决定正文宽度；显示缩放不改变排版。viewport设null时使用可用容器尺寸。beforeHtml和afterHtml只参与预览，不写入原稿、Markdown正文或富文本正文；原稿已有内容保留。

自定义CSS类和生成utility共用检查。只作为内容钩子的类，可显式设css.stylesheets.parameters.allowUnknownClasses为true；默认检查未生成样式的类。此选项不关闭源码、安全或平台规则。

### 渲染记录与历史依赖

正常保存原文后另存可选render.json，记录正文／主题hash、渲染步骤、HTML/CSS及依赖版本。清单在styles/.versions/<hash>/manifest.json，资源在assets/.objects/<hash>；相同内容复用，历史目录携带对应引用，文档包只带所需对象。

已有完整记录使用留存环境。点击“更新样式”显式重读当前配置和依赖，核对后保存新记录；旧历史保留原版本。打开、预览、列表不补写或迁移；无记录旧历史提示依赖未留存。

原文、索引和渲染留存分别反馈。依赖失败不回滚原文，也不把旧记录当作本次成功；缺对象、坏清单或正文／主题不匹配会诊断。不要手改hash或自动删除历史对象；备份保留上述目录。

官网交付用“导出文章 → Markdown正文”，仅提取可靠解析的body，保留Markdown、HTML、class和锚点，发布者处理图片地址。格式报告按当前库规则检查，历史回放不冒充当前平台合规。

### 格式配置

配置只在打开资料库时读取。输入、查找、列表切换不会重复读取磁盘配置。外部修改 JSON 后，保存好草稿，再重新打开当前资料库以重新加载；所有旧任务和检查缓存随配置标识失效。

- 三份都不存在：明确提示使用内置默认整套，不静默写入。
- 缺少部分文件、旧结构、JSON 损坏、未知能力／字段、参数类型错误、重复 ID 或引用缺失：报配置错误，不能混用默认文件补齐后声称通过。
- 原始资料保持可恢复；格式编译和合规检查不会把错误配置当作可信结果。
- 新建资料库生成默认三件套，文章目录为空，不附带测试文章或历史。

旧版清单不能直接改版本号当作新文件。先备份整个旧库与旧清单，再复制完整新三件套，逐项迁移明确需要的本地策略。旧版的兼容分级、字体放行或图片三属性组合不自动迁移为公众号规则。文章主题快照也不会因配置更新而被改写；需在组合中重新检查。

## 官方依据与验证范围

微信公众号默认规范以 [微信官方编辑器插件规范](https://developers.weixin.qq.com/doc/service/guide/product/plugin_spec.html) 为准。[官方校验实现](https://github.com/wechatjs/verify-article-structure-spec) 固定至 `0.2.17`、提交 `1340988eccbb63181a56141a5c2171d55cd42521`，仅作为算法和案例对照；冲突时以官网为准。深色转换使用 `mp-darkmode@1.2.3-alpha.1`，保留原 MIT 许可。

源码即时检查、实际布局检查和人工视觉核对分别报告。布局／深色测量在保存检查、主动检查、复制和可视导出时运行；图片载入失败、测量取消或超时不记通过。`data-ignore-width` 只影响宽度规则及其子树；`data-no-dark` 只跳过当前节点转换；`data-ignore-dm` 按当前节点所列规则跳过相应深色诊断。

图片内文字、透明图片、SVG 内容、共用背景容器和视觉／结构顺序仍需人工核对。自动报告通过不代替公众号草稿和手机预览验收。HTML／CSS 语法、可执行内容、文件存在性和主题 JSON 结构属于产品检查，不伪装为微信规范。

浏览器帧通过本地静态脚本启动，只读取不可执行的 JSON 配置；不使用内联启动代码或动态求值。共享源码生成该资源，开发与构建时自动更新，沿用静态服务的 CSP。

能力参数的执行合同见 [contracts.ts](src/lib/article-format/contracts.ts)。配置示例和约束测试见 [配置测试](tests/article-format-config.test.mjs)。
