# 资料库格式配置

简体中文 · [English](../en-US/FORMAT.md) · [项目入口](../../../README.md)

Agent执行任务前，按[持续查阅要求](AGENT-GUIDE.md#doc-manual-use)核对本手册的必读范围。

一份资料库绑定一套格式策略。打开另一资料库，会同时更换规范、校验和格式化配置；文章主题负责排版，编辑器主题负责工具界面。

先识别`format/config.json.renderer`：声明自主包时按宿主协议及包自身业务实现执行；未声明renderer的旧库才走三件套兼容路线。后文operator及平台开关说明针对内置解释器／旧兼容路线，不是任意自主包的业务协议。

```text
资料库/format/
├── format-support.json   规则含义、强度、来源及人工核对项
├── validator.json        校验能力、阶段、参数及主题结构定义
└── formatter.json        格式化步骤及参数
```

三个文件的顶层 `schemaVersion` 当前都是 `1`，`meta.id` 必须一致。没有方案索引或文章级绑定。完整默认文件在 [内置配置](../../../resources/presets/platform/wechat-article/format/)；复制整套作起点，再修改所需项。

| 预设 | 平台与处理 | 初始内容与通用检查 |
|---|---|---|
| 微信公众号 | 平台规则、随包算法与许可 | rich种子；通用检查保留 |
| 空校验器 | 无平台规则／算法；基础Markdown | markdown种子、无片段分类；通用检查保留 |

<details>
<summary>预设配置细节（完整）</summary>

新建资料库时，“校验与算法模板”提供“微信公众号”（默认）和“空校验器”。微信公众号复制上述三件套及算法实现和许可；空校验器复制[空模板](../../../resources/presets/platform/empty/format/)。创建后的库内配置独立保存，不随模板源自动覆盖。

空校验器的三件套使用相同的`meta.id: "empty"`，规范来源、规则及人工核对项为空，`validator.meta.enabled`为false，`formatter.steps`为空。`product.theme`保留完整文章主题结构定义；通用语法、安全、资源和主题结构检查继续，不生成平台校验通过记录。

算法目录仅有`manifest.json`，内容为`{ "schemaVersion": 2, "components": [] }`，没有算法脚本及对应许可，不触发旧库的微信算法回退。空格式化步骤不附带微信深色转换、代码高亮或其它预置加工；基础Markdown渲染保留。

自定义时先修改规范名称和来源，再按下方示例填写对应规则或格式化步骤；需要执行平台规则时将`validator.meta.enabled`设为true。规则说明、校验器和格式化步骤仍须通过整套结构与引用校验，不能在JSON里添加未支持的字段或脚本。

</details>

“设置 → 本地目录 → 校验与算法”可就地查看实际来源和算法版本；正常来源、旧库回退及异常分别标明，不因每次载入自动弹通知。

<a name="doc-policy-responsibilities"></a>

## 配置选择与职责

1. 平台策略以实际目标业务及输出要求为依据。无需平台专用处理时，从空预设或已有中性配置开始，保留通用语法、安全、资源和主题结构检查。
2. 格式配置承载能力、判据、处理和输出策略；文章主题或已声明的库级样式承载对应设计。新增业务实现按所选渲染路线交付完整配置及依赖。
3. 每项算法、标签映射、字体处理、class处理和样式省略均说明用途，并核对实际输出结果。平台身份、来源和启用能力相互一致。
4. 更新配置后核对加载来源、身份、版本及依赖；新包同步文件校验值。已有文稿通过显式采用更新环境，历史保留原依赖。
5. 空预设的初始片段和片段分类均为空；预置起稿模板为Markdown指南、项目复盘和技术教程三份纯Markdown正文。语言选择仅决定文案，不决定平台内容。

<details>
<summary>内容种子回执与旧库兼容</summary>

通过新建资料库流程选择预设，应用将内容策略与种子语言一起记入 themes/default-themes.loaded。核对回执的contentSeed：空预设为markdown，微信预设为rich；后续自定义格式包沿用该内容选择。普通打开和重新载入保持已有内容与合法空内容集；明确载入默认内容时沿用保存的策略与语言，补缺保留用户自建内容、修改和索引信息。旧库的原回执、已有内容及历史保持原样；业务片段按当前资料库能力和用户确认范围制作。

</details>

<a name="doc-format-package"></a>

## 自主渲染包：新旧宿主协议

新建库使用`rainy-format/2`，配置入口仍为`<库根>/format/config.json`。包的业务逻辑、依赖和许可保留在资料库，应用升级不覆盖；旧`/1`及无renderer的三件套路线按原语义读取，不自动升级。

```text
资料库/
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

| 契约 | 路径与编辑 | 兼容边界 |
|---|---|---|
| rainy-format/2 | entry、files[].path、api.files／装载API均为完整库级路径；声明CSS位于styles/，支持深层目录 | 必须含markdown原稿动作；非空资源别名只用于此协议 |
| rainy-format/1 | entry及文件键相对format/；原包路径与字节保留 | 非空别名明确拒绝，不静默忽略；升级须显式 |
| 无renderer | 原三件套兼容路线 | 缺失／损坏与合法缺省分别处理，不混配 |

### rainy-format/2：库级资源与原稿

配置片段合入现有config.json，不是完整包；字段缺省时预期SHA核对仍开启：

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

别名键形如`@styles/`，值为以`/`结尾的真实库级目录；不成链、不扩大显式files[]权限。entry、files[].path及API文件键使用真实路径，资源引用才使用别名。新路径拒绝绝对路径、`..`及编码逃逸；以最终真实路径核对循环、去重及归属。不使用通配清单，也不设任意目录基准。config.json自身不能列入renderer.files[]。

`validation.verifySha256`省略或true时，声明SHA必须为匹配原始字节的64位小写十六进制；显式false允许预期值省略、空或失配（字段仍是有界字符串）。该开关贯通宿主文件、内置解释器检查、算法脚本／许可、CSS保存及渲染记录；实际内容指纹、冲突、身份、缓存及历史保护保持。外部自定义程序的私有核对逻辑由其维护者适配。

`/2`的actions[]必须包含以下动作对象；label可自定义，宿主识别id／kind／extension：

```json
{
  "id": "markdown",
  "label": "Markdown",
  "kind": "export",
  "extension": "md"
}
```

宿主直接下载含元数据及未保存修改的完整当前原稿，不调用渲染程序；新契约不能关闭此能力。配置不可用时仍有原稿保底入口。它与仅导出body的“Markdown正文”不同；原稿保留源码及原资源引用。

网页成品将声明范围内的本地CSS及资源转换为内联CSS／data URI，保留import的layer／supports／media条件；不残留别名或未跟踪Blob。HTTPS仍按权限加载，不能承诺离线。原稿和网页成品分别验证。

### rainy-format/1：保留旧包语义

已有/1入口及files[]仍相对format/，api.files使用原键名；不通过改路径或加入非空别名暗中升级。SHA开关不改变路径协议。无renderer的旧库才使用三件套兼容执行；坏renderer不作为“未声明”回退。

包版本、应用版本与宿主协议独立。修改业务实现维护包version及适用校验值；不要借应用升级改写已发布旧包。宿主文件授权、浏览器支持与安全限制仍由宿主管理。

`config.json` 保留 `schemaVersion: 1` 及 `meta.id`；`meta.id` 与三件套一致。`renderer` 字段如下：

| 字段 | 内容 | 必填／缺省／协议 |
|---|---|---|
| protocol / id / version / entry | 协议、包身份和版本、JS入口 | 必填；路径基准取上述版本表 |
| files | `{path, sha256?, encoding?}`显式数组，含入口、三件套、模块、CSS、资源和许可 | SHA缺省严格；false时预期值可省略；encoding仅可选base64 |
| actions | `{id, label, kind, extension?, mime?}` | 一个render、一个validate、至多一个copy；format/export可多个；/2另必含markdown |
| settings / values | `{key,label,type,options?}`及对应值 | 必填；text/number/boolean/select；select须options且值有效 |
| permissions | images；可选styles/fonts，HTTPS origin数组或显式`https:` | images必填；未声明外部样式／字体不放行 |

动作及设置各最多64项，文件最多256份、单份16MiB、总计32MiB。文件始终受显式清单约束；开启预期SHA核对时，三件套、代码、CSS及许可字节必须匹配声明；JSON空白及UTF-8 BOM均参与校验。文本默认UTF-8，二进制文件声明encoding为base64，api.files提供对应base64；入口和三件套必须为文本。序列化后的请求及结果也限32MiB。设置值属于整个包身份，但修改 values 不需要改变未修改文件的 hash。

### 共用动作接口

入口导出一个异步函数：

```js
export default async function invoke(action, input, api) {
  // 解析、清洗、算法、校验、格式化与输出均在这里或包内依赖实现。
  if (action === 'my-format') return { source: input.source.trimEnd() };
  if (action === 'my-text-export') return {
    data: input.source, extension: 'txt', mime: 'text/plain'
  };
  throw new Error('Unknown action');
}
```

这是动作函数的片段，需要连同自己的 render、validate 及声明组成完整包。普通业务函数不在宿主注册，也不从应用 `src/` 引用实现。

| 对象 | 合同 |
|---|---|
| input | `input.source`、`theme` 是本次不可变输入；需要时提供 `html`、`css`、`mode`、`deep` 及真实预览的图片 observations。图片 observations 记录实际是否载入及固有尺寸，不伪造成功。 |
| context | `input.context.rawBundle` 是已校验身份与字节的三件套，业务字段由该包解释；算法清单及实现由包通过api.files自行读取和解释；context.algorithms对新包仅为空兼容值。`settings` 为本包值，`environment` 为兼容的库级样式输入。新包可以直接使用自己的原生 CSS，无须使用 Tailwind、微信规则或深色算法。 |
| API | `api.declaration`提供不可变声明；`api.files[path]` 提供清单内原始文本或已声明二进制的base64。`api.importModule(path)` 导入清单内 ES 模块，`api.load(path)` 加载清单内传统脚本。每个 ES 模块须自包含其依赖；模块之间通过此 API 连接，不使用指向应用源码或网络的 import。 |
| 计算沙箱 | 入口在独立的不透明 iframe 运行，只有校验后的包文本与本次输入进入。它没有目录句柄、工作台 DOM、直接联网或任意持久化权限。每个资料库、包及动作类型独立保存模块状态，同类型调用串行处理；取消、切库、重载及过期输入不得提交旧结果。 |

| 动作 | 结果 |
|---|---|
| render | `{html, css}` |
| validate | `{complete, issues, passed}`；issues:`{message,severity,line?}`，正文行号 |
| format | `{source}`；只改草稿 |
| copy | `{html, text}` |
| export | `{data, extension?, mime?, encoding?}`；utf8或base64；/2 markdown由宿主处理 |

render 必须返回 `{html, css}`。validate 必须返回 `{complete, issues, passed}`；issues 项为 `{message, severity, line?}`，severity 为 `error`、`warning`、`info`，line 使用正文行号。返回空对象、抛错或超时都不是通过。format 返回 `{source}`，仅应用到草稿；copy 返回 `{html, text}`；export 返回 `{data, extension?, mime?}`，data默认为UTF-8文本，二进制结果另返回encoding为base64。新增动作会出现在“导出文章”的资料库动作窗口，新增设置会出现在“设置 → 本地目录 → 校验与算法 → 渲染包设置”。

### 宿主服务：捕获、打包和测量

随包解释器还声明ZIP、PNG和PDF导出。仅导出请求可调用api.service("capture-v1", {width, maxCanvasSide, background})，经既有授权预览捕获流程返回{data, width, height, blockEnds}，data为base64 PNG；api.service("archive-source-v1", {})经既有原稿与资源打包流程返回{data}，data为base64 ZIP。资源核对保留在可信UI中，服务进行时暂停计算超时；取消使请求及服务失效。服务不提供目录句柄或任意写入，转换与输出策略由包实现。

深度校验请求可调用api.service("measure-v1", {html, css, widths})读取无脚本文档的真实布局。结果为{screens}，每项包含width、按首个根元素及后代DOM顺序排列的boxes（left/right/top/bottom/width/height及parent.left/right/width），以及images（complete/width/height）。包自行判断溢出、居中或其他业务结果。每次最多8个64–4096px的整数宽度、每份最多20000个元素；视口高2000px，图片最多等待5秒，未加载图片仍标为未完成。服务没有目录或元素句柄，沿用声明的资源权限和取消保护。

### 资源预览与隔离边界

宿主只进行通用安全处理、隔离挂载、输入身份保护及授权的资源/保存操作；不在包结果之后追加微信清洗或固定格式化链。脚本、事件属性、可执行 URL、代码导入等安全底线继续生效。外链图片、CSS和字体只在无脚本的专用预览文档按本包 permissions 加载，工作台主文档和计算沙箱的网络限制保持。外部资源可能不可用，不将其失败或“仍然复制”视为校验通过；作者原始URL与预览本地URL分开；原稿保留作者地址，网页成品按上文消解本地资源，外链策略保持。

外部 CSS 的 HTTPS `@import` 须声明 styles 来源，字体另声明 fonts；原生共享 CSS 不强制转换为工具类或删除 `!important`。完整 HTML＋CSS 与内联富文本快照是不同输出，应由包分别声明、分别验证。富文本接收器是否保留响应式和伪类规则，不由本地复制成功保证。

### 编辑与重载

应用内：主题 → 编辑主题 → CSS → CSS来源，编辑已声明源文件并“保存CSS并重载”；严格核对时更新本文件既有SHA，关闭时配置字节保持。包版本由维护者管理，未改文件的hash不自动刷新；写入后重载失败只重试重载。

IDE：按所用协议修改实际文件。严格核对开启时先同步声明SHA；关闭时可只读重载，重新开启前先同步校验值。最后点击“设置 → 本地目录 → 重新加载渲染配置”。重载本身不写配置，不需要重建应用。下方脚本明确写入预期SHA，支持/1与/2，不自动迁移协议。

在资料库根运行，只有已声明文件会被读取并更新其hash：

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

### 旧稿与历史

只重新加载当前库；坏包明确报错，不用默认微信包补齐。已有文章及历史继续使用保存时的包代码、策略、设置、HTML/CSS与资源清单；点击“更新样式”才显式采用当前包，再保存新记录。历史缺失依赖时报告缺口，不借当前包偷偷重建。宿主升级也不能要求已发布协议的旧包改写文件。

### 部署前置

根路径部署无需配置前缀；部署到子路径时，构建与启动须使用相同的 `NEXT_PUBLIC_ARTICLE_BASE_PATH`（如 `/lab/rainy-markdown-editor`）。宿主沙箱、预览及脚本资源使用此前缀，资料库自身的相对路径不变；根路径和子路径须分别验证加载、失败恢复及保存重开。

使用其他静态服务器时，须为 `format/article-package-sandbox.html` 和 `format/article-package-preview.html` 保留随应用服务器提供的隔离/CSP策略；浏览器或部署层更严格的策略不能由 format 文件绕过。默认 `npm start` 已提供这两条专用规则。公众号、eBay线上及实体手机仍分别点验。

<a name="doc-bundled-resources"></a>

## 应用内置资源

<details>
<summary>源码包维护参考：路径与许可</summary>

维护应用默认内容时，界面文案在 `resources/locale/`，公开公告在 `resources/changelog/public.json`，本地开发与验收记录在不进Git的 `resources/changelog/local.md`。平台源位于 `resources/presets/platform/`；新库内容种子位于 `resources/template/fresh-library/en-US/` 与 `zh-CN/`，每套按真实资料库的主题、片段和模板目录分类，文章与历史为空。主题制作起点在 `resources/template/`。

浏览器直接加载的脚本仍在 `public/format/`、`public/algorithm/`，完整字体来源、大小与hash见[字体清单](../../../resources/font-sources.json)，只下载到授权资料库；`public/fonts/`保留三份OFL文本，图片和其它许可在 `public/images/`、`public/licenses/`。样图只使用 `/images/article-sample.png`；旧根地址或任意相对图片不会被替换成样图，应修改实际片段/模板引用。双语说明正文保留在 `docs/locale/`。

</details>

<a name="doc-editable-fields"></a>

## 可以改什么

| 对象 | 可在 JSON 中修改 | 需要改引擎的情况 |
|---|---|---|
| format-support | 名称、来源、条目说明、诊断级别、人工核对选择器 | 新的诊断展示能力 |
| validator.rules | 增删条目、启停、支持的阶段、参数；复用已有 operator | 新算法或已有能力不支持的新参数 |
| validator.product.theme | token 集合、节点选择器及属性映射、CSS 属性策略、数值上限与值格式 | 改变 article-theme 文件结构或解析语法 |
| formatter.steps | 增删步骤、启停、已有 operator 的参数 | 新的格式化算法或输出类型 |

### 配置、业务实现与宿主的分工

已有能力改配置；新业务算法或operator先修改库内解释器／自主包代码；只有新增宿主接口或工作台展示能力才修改应用。上表“引擎”指相应实现层，不要求一律改工作台。

这是一套数据驱动的能力调用接口。新增对象可以复用已注册能力，不会自动产生新的算法，也不接受 JSON 中的脚本。新增平台策略通常只需修改这三份文件；新增算法需在能力层实现和注册，业务组件继续消费同一配置快照。

`schemaVersion` 是文件结构版本，不能为了修改策略随意增加。`product.theme.kind` 与 `formatVersion` 是当前产品文件的身份（`article-theme`／`1`），保持不动；更换平台不需要更换主题文件结构。修改官方默认策略后，结果属于当前资料库的自定义策略，不能据此宣称符合公众号官方默认配置。

### 平台校验总开关

| 范围 | 效果 |
|---|---|
| 内置解释器／旧兼容路线 | meta.enabled=false关闭平台规则和人工核对，不生成平台通过记录 |
| 仍执行 | 格式化、通用语法、安全、资源和主题结构；完整配置核对 |
| 自主包 | 按包声明及实际实现解释业务开关；不假定服从内置字段 |

`validator.meta.enabled`为可选布尔值，省略或true继续原平台检查。设为false时跳过平台规则及对应人工核对，不生成平台通过记录；通用语法、安全、图片资源及article-theme结构检查继续。关闭前后都加载完整三件套并校验结构、规则引用、参数和算法文件；损坏或缺失仍报错。formatter的预览、转换和输出步骤独立，不受此开关关闭。

例如，将validator.json中的meta设为`{ "id": "custom-platform", "enabled": false }`，其余两份meta.id也使用custom-platform；保留product.theme、rules数组及formatter.steps。不需要平台判据时rules/manualReview可为空，不把三件套删成仅meta的文件。设置摘要与检查弹窗会显示平台校验关闭。规则修改后重新载入库，旧任务和检查缓存失效。

<a name="doc-validator-example"></a>

## 示例：追加校验规则

以下示例分别追加到validator.rules数组、format-support.meta.sources对象及format-support.rules数组，不把片段覆盖成完整配置。

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

| 能力／阶段 | 合同 |
|---|---|
| style operators | `style.present` 检查声明是否出现；`style.values` 检查声明值是否落在给定数组；`style.transparent` 检查透明值；`style.important` 检查作者的 `!important`。前三种能力以 `property` 指定 CSS 属性，单条件与多值条件使用相同规则对象。 |
| authoring / rendered | `authoring` 检查源码和编译出的声明；`rendered` 检查实际 DOM。带 `selector` 的样式规则仅可在 `rendered` 阶段使用。几何规则只支持 `rendered`，不能把静态源码检查当作实际测量。`leaf`／`nodeleaf` 结构规则同时检查修复前的源码；源码阶段支持标签或标签[属性]选择器，复杂选择器限定只在实际DOM阶段使用。 |

<a name="doc-formatter-example"></a>

## 示例：修改格式化步骤

### 软换行

`formatter.json` 用 `steps[]` 调用能力。例如，以下步骤可把 Markdown 单次换行显示为换行：

```json
{
  "id": "soft-breaks",
  "operator": "markdown.soft-breaks",
  "enabled": true,
  "parameters": { "mode": "line-break" }
}
```

### 纸面与字体

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

### 移除CSS属性

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

把字段合并到现有步骤的 `parameters`，保留其它参数，不添加重复输出步骤。完整示例见[默认formatter](../../../resources/presets/platform/wechat-article/format/formatter.json)。旧配置省略新字段时保留原行为，其他平台自行配置。这不改变原稿、预览标签或PNG/PDF，不新增公众号合规判据。旧三件套兼容路径通过JSON调整已注册策略；自主渲染包的新算法按本页rainy-format/1在库内实现。

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

<details>
<summary>实现、许可及性能边界</summary>

代码/实现和许可本地打包。Mermaid采用锁定官方模块重建以统一KaTeX版本，记录在 [resources/render](../../../resources/render/)；许可见 [public/licenses/math](../../../public/licenses/math/) 和 [public/licenses/mermaid](../../../public/licenses/mermaid/)。隔离帧不保证布局计算移出浏览器主线程；先用小图核对输入和滚动，复杂图可简化或提前制图。

</details>

<a name="doc-resource-protocol"></a>

## 资源引用、导入与输出协议

| 资源 | 文稿引用 | 共享引用 | 行为 |
|---|---|---|---|
| 栅格图片 | media/image/文件名 | /shared/image/文件名 | 沿用图片校验、预览和描述索引 |
| 一般附件 | media/file/文件名 | /shared/file/文件名 | 类型图标/按需下载，不执行或自动预览；未知类型回退文件图标 |

文件名按完整URI编码，保留最终实际路径。图片描述索引维持既有 `images` 对象；附件目录的 `index.json` 为version1及 `files` 对象，按文件名保存description。新目录按需出现，旧库不整体迁移。类型登记见 [资源类型表](../../../resources/presets/resource/types.json)，以该表的当前登记为准；扩展名/MIME用于图标，附件不会因声明图片MIME而自动预览。

产品检查核对安全路径、目标归属、文件存在性和图片内容；导入中为未完成，失败/取消与缺失分别报告。`validator.meta.enabled=false`仍运行这些检查，关闭平台校验不关闭资源检查。CSS背景/字体和复杂嵌入未自动迁移项保留并提示，本地文档链接不递归携带。

### 导入任务与输出核对

一般附件上限64MiB；资源授权、任务身份、原件保护和失败补选／重试保持。

<details>
<summary>任务文件与传输参数</summary>

任务在 `imports/tasks/<id>.json`，绑定资料库/文稿/来源及资源最终名称；后台只写资源/状态，不写正在编辑的全文。并发2、64KiB传输块、100ms进度节流、一般附件64MiB；CORS/CSP/无凭证及权限失败明确反馈，可重试/补选。本地/知识源保留，知识索引位于目标库 `knowledge/`。

</details>

复制与PNG/PDF前核对实际当前资源/渲染版本；变化则拒绝旧结果。一般附件不会被伪装为可直接粘贴的媒体。ZIP检查明确引用资源并包含文稿media及被引用shared文件，不含knowledge/imports；部分包需用户确认，跳过未close/失败/缺失文件并保留原引用，沿用256MB内存上限。检查、保存原文、保存渲染记录和输出分别反馈。

<a name="doc-formatter-capabilities"></a>

## 格式化能力

| operator | parameters  适用路线 |
|---|---|---|
| markdown.soft-breaks | `mode`: `space`／`line-break`  内置解释器／旧兼容；自主包自行实现业务 |
| markdown.blank-lines | `preserve`、`betweenBlocks`、`atEdges`  内置解释器／旧兼容；自主包自行实现业务 |
| markdown.code-highlight | styles[]；可选engine（highlight/prism）、themeDefaults、prismStyles（词法样式键→CSS声明）  内置解释器／旧兼容；自主包自行实现业务 |
| markdown.math | singleDollar、maxLength、maxExpressions；可选静态MathML  内置解释器／旧兼容；自主包自行实现业务 |
| markdown.mermaid | theme、maxLength、maxDiagrams；可选静态PNG  内置解释器／旧兼容；自主包自行实现业务 |
| markdown.heading-ids | mode:auto/explicit；explicit保留{#id}且不自动造锚点  内置解释器／旧兼容；自主包自行实现业务 |
| markdown.code-layout | wrapperClasses[]、preTag、contentClasses[]、copyClasses[]、copyHtml、copyLabel  内置解释器／旧兼容；自主包自行实现业务 |
| css.stylesheets | entry、publicRoot；可选allowUnknownClasses  内置解释器／旧兼容；自主包自行实现业务 |
| render.document | root、body、beforeHtml、afterHtml、language、preserveIds、viewport  内置解释器／旧兼容；自主包自行实现业务 |
| render.nodes | image（width/height/classes/style/alt）、link（classes/rootBase/externalTarget）；只补缺省属性  内置解释器／旧兼容；自主包自行实现业务 |
| markdown.code-whitespace | `tabSize`，关闭此步骤保留原始代码空白  内置解释器／旧兼容；自主包自行实现业务 |
| preview.surface | `lightBackground`、`darkBackground`、`fontFamily`、`color`、`stripThemeBackground`  内置解释器／旧兼容；自主包自行实现业务 |
| preview.dark-mode | `mode`: algorithm或tokens；algorithm要求组件transform与options，tokens只含mode  内置解释器／旧兼容；自主包自行实现业务 |
| css.drop-properties | `properties[]`，可重复追加  内置解释器／旧兼容；自主包自行实现业务 |
| css.utility-aliases | `aliases`，CSS 属性名称映射  内置解释器／旧兼容；自主包自行实现业务 |
| output.css | `inlineProperties[]`、`dimensionProperties[]`、`preserveAutoDimensions`、`colorEncoding`: `rgb`／`preserve`；可选 `rootStyleOmissions[]`  内置解释器／旧兼容；自主包自行实现业务 |
| output.html | `wrapperTag`、`preserveAttributes[]`、`removeClasses`、`stripRootBackground`；可选 `tagMap`  内置解释器／旧兼容；自主包自行实现业务 |
| output.text | `maxConsecutiveNewlines`、`trim`  内置解释器／旧兼容；自主包自行实现业务 |
| output.visual | `width`、`pngBackground`、`pdfBackground`、`maxCanvasSide`、`pdfMargin`  内置解释器／旧兼容；自主包自行实现业务 |

加载时按数组顺序编译配置。

执行仍分为 Markdown、CSS、预览和输出阶段；调整数组位置不能把输出操作搬到解析之前。除 `css.drop-properties` 外，同一能力不能同时启用两次，避免参数互相覆盖。关闭能力使用通用引擎的中性行为；关闭输出样式快照会失去对应样式，不等于关闭检查。

富文本复制先按原标签计算样式，再按 `output.html.parameters.tagMap` 映射正文容器标签，例如微信模板的 `{"blockquote":"section"}`；生成的文章外壳仍由 `wrapperTag` 控制。`output.css.parameters.rootStyleOmissions` 只省略生成的文章/正文外壳样式，微信模板排除其 margin、padding 与宽高限制，正文卡片、段落和引用自身的间距/边框保持。两个可选项缺省时保留旧行为，不影响原稿、预览或PNG/PDF。已有资料库须显式更新自己的 formatter.json；旧稿若仍使用旧渲染快照，先“更新样式”再复制，原稿和历史不自动迁移。

| 来源 | 含义 |
|---|---|
| algorithm | mode选来源；transform指组件；options.mode是组件自身参数 |
| tokens | 只写mode，使用theme.dark.tokens，不运行转换组件 |

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

<details>
<summary>SDK接入过程</summary>

官方 SDK 读取内联样式。接入层先采集文章根节点及后代的计算颜色、背景、边框和装饰样式，统一转换为 RGB 后写入隔离副本，再调用原样保留的 SDK。原稿、主题和浅色复制内容不因深色预览改写。

</details>

### 资料库算法组件

每库使用 `format/algorithms/manifest.json`。新清单schemaVersion 2的脚本／许可path为完整库级路径；旧清单1保持原相对语义，不通过只改版本号迁移。预期SHA核对取库策略，实际内容指纹仍进入快照。选择微信公众号时，使用[微信公众号组件](../../../resources/presets/platform/wechat-article/format/algorithms/manifest.json)，新库复制其实现和许可；空校验器仅写入空组件清单。

| 清单字段 | 含义 |
|---|---|
| schemaVersion | 1为旧相对路径，2为完整库级路径 |
| components[] | 每个组件包含唯一id、version、scripts[]、license和capabilities |
| scripts[] | 按顺序加载的实现文件；每项含path及预期SHA-256；路径基准取清单版本，核对策略取库配置 |
| license | 许可path及预期SHA-256；路径基准取清单版本，许可必须保留 |
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

| 边界 | 合同 |
|---|---|
| 允许 | 已验证实现对隔离副本的现有节点作受限颜色／边框／装饰处理；结果完整校验后采用 |
| 禁止 | 不获得工作台DOM、目录句柄、直接网络、任意存储、弹窗或导航权限 |
| 未保障 | 权限隔离不等于任意脚本的CPU预算；取消／失败仍按对应保护处理 |

实现只在不具同源权限的独立沙箱执行，不接收工作台DOM或目录句柄。网络、存储、弹窗和导航受限制；组件改动不获得主页面执行权。已有Blob图片与字体在内存中转交并保留布局上下文，不重新扫描资料目录。沙箱是权限边界，不提供任意脚本的CPU预算。

组件文件、许可、参数和指纹参与快照及缓存；历史依赖清单保留当时的代码，重开历史不读取今天的组件替换它。旧库缺算法目录时明示使用内置默认实现且不写原库；现存但不完整、缺能力或严格核对时hash不符的目录直接失败。旧渲染记录没有组件时另作回退提示，不冒充原算法完整复现。

## 加载、失败与迁移

### 可选应用配置与能力声明

无renderer的旧兼容库可省略下述应用配置；新包需要已有的renderer声明。资料库可增加 `format/config.json`，其 `meta.id` 必须与三件套一致。文件可省略；省略时维持文章主题覆盖、用户选择预览明暗和全部原有操作。已声明但损坏的配置不会回退或与默认文件混用。

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

### 能力合并与冲突

三件套的任意 `meta` 也可声明同形的 `capabilities`、`rendering`。合并只收紧能力：任一声明为false即禁用，config.json不能重新放行。rendering的重复声明必须一致，冲突直接拒绝整套。未声明的控件保留原文案；禁用控件保留位置、显示不可用状态并提供原因，执行入口使用同一配置快照守卫，不靠禁用外观保护。

| 能力 | 控制范围  缺省／限制 |
|---|---|---|
| articleTheme | 文章主题选择、采用和新稿默认主题设置  缺省保留；false收紧；/2原稿能力另行保障 |
| previewMode | 用户切换文章预览明暗  缺省保留；false收紧；/2原稿能力另行保障 |
| algorithm | 渲染算法执行；若formatter或启用的深色规则仍需要算法，禁用声明视为配置冲突，不自动删规则  缺省保留；false收紧；/2原稿能力另行保障 |
| copyRichText | 富文本复制  缺省保留；false收紧；/2原稿能力另行保障 |
| exportPackage / exportMarkdown / exportBody / exportPng / exportPdf | 各种文章导出；每项独立  缺省保留；false收紧；/2原稿能力另行保障 |

`rendering.styleAuthority`可为theme（原通道）或library。library必须具备库级样式入口；编译只消费库样式，不追加文章主题CSS或token覆盖，同时禁用文章主题选择。它不改原稿或主题快照，也不自动采用新环境。主题资源本身的维护与文章主题选择分开。

`rendering.previewMode`可为user、light或dark。固定明暗时开关不可用，原浏览器偏好仍保留；切回user后继续原偏好。当前权限用于操作入口，旧渲染记录保留其自己的渲染声明；旧记录缺少声明时使用原默认，不继承今天的固定配置。新记录的配置与依赖清单一起校验，打开记录不写迁移。

配置随三件套、算法和样式环境一起读取并参与不可变快照与缓存身份。只改配置也会使旧任务失效；外部改动后重新打开资料库，并显式“更新样式”采用新环境。旧兼容库可省略config.json，新建库保留renderer声明；自定义声明不会冒充官方默认。

<a name="doc-preview-host"></a>

### 资源预览外壳宽度

可选的rendering.previewWidth适用于主题、片段与起稿模板的预览外壳：

| 值 | 行为 |
|---|---|
| default或省略 | 保持各入口原有宿主宽度行为 |
| available | 释放宿主额外限宽，使用所在容器的可用宽度 |

该策略只控制资源预览外壳，由宿主消费；传给固定rainy-format/1渲染包的配置上下文不包含此UI字段，旧包无须升级。内部响应式或固定排版继续由现有viewport负责，内容自身的CSS宽度约束保留；普通文章预览与导出尺寸保持现有约定。新增字段沿用配置身份、重复声明冲突、不可变快照与过期守卫，旧配置／渲染记录缺失该字段时按default读取，不回写迁移。

库级样式的来源说明与只读查看见[THEME](THEME.md#doc-preview-sources)。源文件和生成结果分别标识，可靠来源缺失时明确说明，不按包内文件名猜测实际采用关系。

### 主题保存与样本资源

可在当前库validator.json的既有 `product.theme` 中增加：

```json
{ "savePolicy": { "sampleResources": "review" } }
```

### 适用与不适用范围

| 策略／范围 | 结果 |
|---|---|
| 省略或block | 样张资源问题继续阻断 |
| review | 保存主题的样本资源及明确关联的未完成检查保留诊断，允许保存但不记通过 |
| 保持阻断／原校验 | CSS语法安全、主题结构、真实阻断违规、配置及写入错误；片段、模板、真实文章及输出不降级 |

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

`/2`中，CSS入口、清单及本地依赖按完整库级路径或声明别名解析；文件清单仍使用真实路径，CSS全部位于styles/。本地@import与url按同一解析和清单权限核对，不靠../跳转。旧/1与无renderer路线的原相对url及publicRoot语义保留：相对url按其CSS所在目录解析；/image/icons.svg通过publicRoot映射为assets/image/icons.svg，保留片段标识。主题覆盖中的相对资源以themes/article-themes/为基准，推荐用虚拟根路径。字体可置assets/fonts/；不要搬入宿主业务脚本。

拒绝越界、循环、JS插件及缺文件；旧本地样式路线拒绝远程CSS，包预览的HTTPS资源另按permissions管理。上限：CSS256文件／32层／单文件1 MiB／合计8 MiB；资源2048个／合计256 MiB。目录@source须显式声明库内范围，最多256个匹配文件，不默认扫描全部文章。

| 配置 | 效果 |
|---|---|
| viewport: null | 按预览栏宽响应布局，不额外缩放 |
| viewport对象 | width/height是CSS视口，contentWidth是正文宽度；显示缩放不改排版 |
| beforeHtml / afterHtml | 仅预览，不写原稿／Markdown正文／富文本正文 |

viewport设null时按实际预览栏宽响应式排版，使用可用高度滚动，不额外缩放正文。显式viewport对象用于固定排版复现：width/height决定CSS视口，contentWidth决定正文宽度；其显示缩放不改变排版。beforeHtml和afterHtml只参与预览，不写入原稿、Markdown正文或富文本正文；原稿已有内容保留。

自定义CSS类和生成utility共用检查。只作为内容钩子的类，可显式设css.stylesheets.parameters.allowUnknownClasses为true；默认检查未生成样式的类。此选项不关闭源码、安全或平台规则。

### 渲染模块接口与职责

<details>
<summary>源码包实现参考：完整接口与行号</summary>

宿主适配集中于 `src/lib/article-format/`。自主包由版本化协议调用，解析、清洗、算法及输出在库内实现；无renderer的库保留下表兼容实现。两条路径共用授权、身份守卫及既有渲染记录，不自动迁移旧稿。

文章源码框只编辑正文，原始Front Matter在顶部只读折叠显示；正文行号对应完整文件，空行和多行YAML均计入偏移。引擎诊断保留正文坐标，`ArticleFormatReport.bodyLineOffset`携带该次检查对应的文件偏移，界面显示时统一换算；主题CSS继续使用自身行号。折叠查看不改写文件，缺少元数据的源码从第1行开始。

| 入口 | 输入与结果 | 职责 |
|---|---|---|
| renderer.ts / compileArticleStyles | Markdown、文章主题、不可变FormatSnapshot、可选样式环境 → CSS、候选类与诊断 | 样式编译、缓存及配置身份保护 |
| ArticleDocument.tsx / MarkdownPreview.tsx | snapshot、themeId、source、media、children | 正文结构、Markdown/HTML、资源及通用正文标记 |
| useArticleRenderMount.ts | hostRef、snapshot、CSS、dark、资源/图片回调 → 挂载目标、明暗画布及诊断 | ShadowRoot/iframe隔离、纸面几何、字体与深色转换 |
| output.ts / buildClipboardPayload | 对应正文根节点、snapshot → 富文本HTML、纯文本及资源信息 | 输出转换，去掉预览外壳及运行期交互装饰 |

分栏、工具栏、草稿、保存/删除流程与资料库权限仍由工作台负责。媒体窗口、翻译和文件来源通过React适配层与现有资源上下文连接；挂载和卸载归渲染适配层，原文与历史文件不因挂载而迁移。旧tailwind/render及编辑器组件路径只转发到同一实现，不维护两套状态或编译缓存。

</details>

<a name="doc-render-records"></a>

### 渲染记录与历史依赖

### 生成与备份

正常保存原文后另存可选render.json，记录正文／主题hash、渲染步骤、HTML/CSS及依赖版本。清单在styles/.versions/<hash>/manifest.json，资源在assets/.objects/<hash>；相同内容复用，历史目录携带对应引用，文档包只带所需对象。

### 重开与显式更新

已有完整记录使用留存环境。点击“更新样式”显式重读当前配置和依赖，核对后保存新记录；旧历史保留原版本。打开、预览、列表不补写或迁移；无记录旧历史提示依赖未留存。

### 失败与保护

原文、索引和渲染留存分别反馈。依赖失败不回滚原文，也不把旧记录当作本次成功；缺对象、坏清单或正文／主题不匹配会诊断。不要手改hash或自动删除历史对象；备份保留上述目录。

目标网站采用Markdown流程时，可用“导出文章 → Markdown正文”，仅提取可靠解析的body，保留Markdown、HTML、class和锚点，发布者处理图片地址。格式报告按当前库规则检查，历史回放不冒充当前平台合规。

### 可见预览与当前检查

| 对象 | 检查依据 |
|---|---|
| 可见画面 | 仅保存刷新时保留上次画面；成功保存／采用主题编译才推进 |
| 检查／复制／导出 | 使用当前正文、主题和配置，不以冻结画面代替 |
| 失败／过期 | 不推进显示边界；采用主题不自动保存 |

<details>
<summary>完整刷新与滚动实现约束</summary>

文章编辑器的[三个预览开关](README.md#doc-preview-controls)是浏览器界面偏好，不写入格式三件套。仅保存刷新留存可见输入及其资源；当前工作画布仍使用当前正文、主题和配置，供校验、复制、导出与渲染记录使用。独立检查不刷新留存画面；成功保存后的编译，或显式采用不同/更新后主题的成功编译，推进显示边界；主题采用仅刷新这一次，后续正文编辑仍遵循仅保存偏好，不额外触发保存；失败或过期任务不推进。滚动对齐绑定当前可见ShadowRoot或iframe，缓存保存源到当前源的有效节点关系；插删处用最近有效锚点，无对应时保留位置。开关、明暗、分栏与稿件变化后重建位置缓存，沿用被动事件/rAF及4ms分片；滚动不读取资料库或重新编译。开启仅保存刷新时，源码底部保存状态后显示“· 保存刷新预览”。

</details>

<a name="doc-configuration-loading"></a>

### 格式配置

配置在打开资料库、显式重新加载渲染配置或更新样式时读取。输入、查找、列表切换不重复读磁盘。外部修改后显式重新加载，旧任务和检查缓存随配置身份失效；已保存渲染记录的采用另见上文。以下三件套回退仅描述无renderer旧兼容路线；损坏的renderer不得套用：

- 三份都不存在：明确提示使用内置默认整套，不静默写入。
- 缺少部分文件、旧结构、JSON 损坏、未知能力／字段、参数类型错误、重复 ID 或引用缺失：报配置错误，不能混用默认文件补齐后声称通过。
- 原始资料保持可恢复；格式编译和合规检查不会把错误配置当作可信结果。
- 新建资料库生成所选三件套及自主解释器、清单和许可；文章目录为空，不附带测试文章或历史。

### 迁移与语言

旧版清单不能直接改版本号当作新文件。先备份整个旧库与旧清单，再复制完整新三件套，逐项迁移明确需要的本地策略。旧版的兼容分级、字体放行或图片三属性组合不自动迁移为公众号规则。文章主题快照也不会因配置更新而被改写；需在组合中重新检查。

界面语言与库级格式策略相互独立：切换简体中文／English 不读取或改写三件套，不改变 formatter 的 language、原文或导出语言。产品层诊断随界面语言显示，库内规范名称、说明和人工核对文案保持原文。

空图片地址、无效地址及已确认读取/解码失败作为产品资源错误。失败图片不会再次等待已经结束的load/error事件；资源仍在加载时明确保留未完成状态。已确认缺失的本地文件先返回诊断，修复后主动重检；规范规则JSON不因此降低要求。

<a name="doc-official-basis"></a>

## 官方依据与验证范围

微信公众号默认规范以 [微信官方编辑器插件规范](https://developers.weixin.qq.com/doc/service/guide/product/plugin_spec.html) 为准。[官方校验实现](https://github.com/wechatjs/verify-article-structure-spec) 固定至 `0.2.17`、提交 `1340988eccbb63181a56141a5c2171d55cd42521`，仅作为算法和案例对照；冲突时以官网为准。深色转换使用 `mp-darkmode@1.2.3-alpha.1`，保留原 MIT 许可。

源码即时检查、实际布局检查和人工视觉核对分别报告。布局／深色测量在保存检查、主动检查、复制和可视导出时运行；图片载入失败、测量取消或超时不记通过。`data-ignore-width` 只影响宽度规则及其子树；`data-no-dark` 只跳过当前节点转换；`data-ignore-dm` 按当前节点所列规则跳过相应深色诊断。

图片内文字、透明图片、SVG 内容、共用背景容器和视觉／结构顺序仍需人工核对。自动报告通过不代替公众号草稿和手机预览验收。HTML／CSS 语法、可执行内容、文件存在性和主题 JSON 结构属于产品检查，不伪装为微信规范。

<details>
<summary>源码接入与验证入口</summary>

旧处理帧通过本地静态脚本启动、读取不可执行JSON；自主包按已核对的声明在隔离沙箱载入模块。旧处理帧不使用内联启动代码或动态求值。共享源码生成该资源，开发与构建时自动更新，沿用静态服务的 CSP。

能力参数的执行合同见 [contracts.ts](../../../src/lib/article-format/contracts.ts)。配置示例和约束测试见 [配置测试](../../../tests/article-format-config.test.mjs)。

</details>

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

标记节点及其后代豁免全部宽度检测，外层容器仍检查，其他规则仍执行。不把 `flex` 设为全局放行，其他规则按当前库配置执行。

## 知识库写作辅助数据（0.3.2）

知识源只读；以下记录写在文稿资料库，与格式包配置分开。

<details>
<summary>进阶：完整写作辅助数据协议</summary>

`knowledge/<分区目录>/research-<sourceId>.json`为schemaVersion 1，绑定当前只读源；包含`topics`（id/name/note/articleIds/items）和`citations`。收集项含id、sourceId、相对path、可空title、content、物理起止line/endLine、whole及note；渲染选段可附original原文范围，核对后记录change/checkedAt。引用来源另含articleId与citationId；元数据不作为参考文献文案强制字段。文件上限16MiB，原文单篇仍为2MiB。写入只针对文稿库，核对源身份、权限和目标隔离，提交前发现外部文件变化即中止。

书架收集项支持可选createdAt／updatedAt，供创建／更新时间排序；新增记录保存实际时间，内容或备注修改推进updatedAt，查看、检查和排序不改变时间。旧条目缺失时间仍合法，不推算或补造历史时间；相同或缺失时间按保留的手动顺序稳定展示。移动保留条目身份与创建时间，复制生成新的条目身份和创建时间。自动排序不覆盖专题items的手动顺序。现行字段及引用协议保持兼容。

正文引用使用`[[1]](#rme-cite-<uuid>)`，渲染为`[1]`；文末保留`<!-- rainy-citations -->`至`<!-- /rainy-citations -->`区域，条目格式为`<span id="rme-cite-<uuid>"></span> [1] 自由文字`。区域和锚点是保留标记，文字可直接编辑；损坏区域不自动整理或覆盖。整理只处理区域中已登记的真实Markdown链接，代码示例、其他引用与脚注不自动纳入。变化核对更新来源快照，不改正文引用文案。

Markdown代码示例中的引用管理注释与条目锚点不纳入管理。普通插入保留正文选区，旧标记替换须明确纳入。知识源重新定位保留binding.json及research文件名；首次创建失败仅凭保留的所属证据恢复，不把任意空JSON当作有效数据。

</details>

## 文章回收记录

资料库根`_trash/`是应用管理的文章回收数据，与`format/`、普通文章索引及导出分开。结构按实际操作生成：

```text
_trash/
├── <回收UUID>/entry.json
├── <回收UUID>/article/       # 完整原目录：正文、主题、素材、历史与空目录
└── cleanup-<清理UUID>.json   # 固定批次及剩余撤回时间
```

`entry.json`使用schemaVersion 1：id、articleId、month、folder、title、deletedAt、organization（projectId／archived）、orderIndex、可选orderBefore（原手动顺序）、state、files（相对路径→SHA-256）及directories。state为preparing／ready／restored；未完成记录和未知内容保留并报告。校验完整副本及原件身份后才移除来源；恢复位置冲突不覆盖，元信息失败保留已恢复正文和待修记录。

`settings.json` version 2新增可选`trash: { "enabled": true }`；缺省启用，旧库读取不补写，显式保存才写入。关闭不清已有内容且仍可恢复；普通删除改为明确确认的永久删除，无撤销。坏配置阻止删除。界面草稿不改变已保存策略。

清理记录使用schemaVersion 1：id、entryIds、entryHashes、createdAt、remainingMs、committing、removedIds。确认的批次固定，新入站文章不随之清理。文件收据与当前库／页签的同步检查点保留剩余窗口，Toast和业务共用一个时钟；排队、悬停、聚焦、展开详情及异步动作不消耗撤回时间。撤回期结束后才提交物理删除，失败保留未完成记录供重试；通知关闭／卸载及切页不提前提交，也不等于已释放磁盘空间。刷新重开先核对原库与权限；浏览器关闭时不后台清理。

### 浏览器刷新恢复身份

刷新恢复只在浏览器页签记住资料库书签ID、文章路径及创建身份；不写入格式包、不持久化未提交正文。只有刷新/editor才尝试同库已保存文章；其他页面保持原页，失效或已回收身份回列表并说明，用户导航／另选／切库取消迟到结果。
