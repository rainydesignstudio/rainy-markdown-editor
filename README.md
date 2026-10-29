<h1 align="center">✍️ Rainy 文稿台</h1>

<p align="center"><strong>你的资料库，你的写作规则。</strong></p>

<p align="center">在本机浏览器中写 Markdown＋HTML，实时预览、检查格式并导出。</p>

<p align="center">
文稿、主题快照、图片、附件与历史保存在你授权的本地资料库；首套默认格式配置面向微信公众号，<br />
每库也可定制 Shopify、eBay、Discord 等平台及自建官网的写作策略；校验与渲染独立配置。
</p>

<p align="center">
  <a href="docs/locale/zh-CN/README.md">📖 简体中文</a> ·
  <a href="docs/locale/en-US/README.md">📖 English</a> ·
  <a href="docs/locale/zh-CN/README.md#doc-quick-start">🚀 快速开始</a> ·
  <a href="https://rainydesign.cn/lab/rainy-markdown-editor/">🌐 在线使用</a> ·
  <a href="https://github.com/rainydesignstudio/rainy-markdown-editor/issues">💬 反馈</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-4CAF50?style=for-the-badge" alt="MIT License" /></a>
  <a href="https://github.com/rainydesignstudio/rainy-markdown-editor/tree/v0.3.2.1"><img src="https://img.shields.io/badge/RELEASE-v0.3.2.1-2563EB?style=for-the-badge" alt="Release v0.3.2.1" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&amp;logo=nextdotjs&amp;logoColor=white" alt="Next.js 16" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&amp;logo=react&amp;logoColor=black" alt="React 19" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&amp;logo=typescript&amp;logoColor=white" alt="TypeScript 6" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&amp;logo=tailwindcss&amp;logoColor=white" alt="Tailwind CSS 4" /></a>
</p>

<p align="center"><img src="https://github.com/user-attachments/assets/d4fdc16f-8245-4626-beae-32bc3cb9d0cc" alt="Rainy 文稿台" width="960" /></p>

## 🚀 安装

在线使用同样需要在桌面浏览器中授权本地资料目录；实际可用功能以界面显示的版本为准。

需 Git、Node.js 24 LTS（含 npm）。

手动：

```sh
git clone --branch v0.3.2.1 --depth 1 https://github.com/rainydesignstudio/rainy-markdown-editor.git && cd rainy-markdown-editor && npm ci && npm run build && npm start
```

Agent：

> 请从 https://github.com/rainydesignstudio/rainy-markdown-editor 的 v0.3.2.1 安装 Rainy 文稿台；先读根 README.md、docs/locale/zh-CN/README.md 和 docs/locale/zh-CN/AGENT-GUIDE.md。在安装依赖、构建、启动之前，确认我能提供支持本地目录读写、可由你实际控制的外部桌面浏览器，并取得控制授权；不满足就停在这里说明恢复条件，不用内置浏览器替代。沿用已有有效授权，再确认安装目录、端口后克隆、npm ci、构建并启动。目录选择由我在网页中另行授权；资料库保存重开通过后，让我选择分步教程或直接使用，并给出以后启动的命令。

## ✨ 功能与特性

| 功能 | 说明 |
|---|---|
| 🗂️ 本地资料库 | 文稿、主题、素材与历史保存在授权目录。 |
| 👁️ 写作与预览 | Markdown＋HTML 实时排版，配套格式检查与导出。 |
| 🧩 主题与模板 | 自定义编辑器与文章主题，用片段和起稿模板组织内容；文章深色可由算法自动计算或手工配色。 |
| ⚙️ 格式策略 | 每库独立配置；0.3.2开发中增加自主渲染包，支持库内维护渲染、校验和输出动作。 |
| 🖼️ 文稿与素材管理 | 分组、分类、归档、历史对照，以及图片/附件管理。 |
| 🔗 知识库与导入 | 只读检索、关系图与Markdown导入；0.3.2开发中增加多源管理、轻量写作参照、专题和自由引用。 |
| 🧮 公式与图 | 资料库可选公式 MathML 与 Mermaid 静态 PNG，Markdown 保留源码。 |
| 🌐 中英界面 | 切语保留草稿与查找状态，用户内容保持原文。 |

[查看完整功能](docs/locale/zh-CN/README.md#doc-features)

## 📸 界面预览

<table>
  <tr>
    <td width="50%" align="center">
      <a href="https://github.com/user-attachments/assets/d64a358c-f30d-4531-ab2b-2bbd87d0aabf"><img src="https://github.com/user-attachments/assets/d64a358c-f30d-4531-ab2b-2bbd87d0aabf" alt="浅色流紫 · 编辑器" width="100%" /></a><br />
      <sub>浅色流紫 · 编辑器</sub>
    </td>
    <td width="50%" align="center">
      <a href="https://github.com/user-attachments/assets/a835b0df-b59a-4f56-b5df-c8b6f5b145ad"><img src="https://github.com/user-attachments/assets/a835b0df-b59a-4f56-b5df-c8b6f5b145ad" alt="深色 Slate · 编辑器" width="100%" /></a><br />
      <sub>深色 Slate · 编辑器</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <a href="https://github.com/user-attachments/assets/564f5e40-aec3-428a-af88-ec2d0e46e444"><img src="https://github.com/user-attachments/assets/564f5e40-aec3-428a-af88-ec2d0e46e444" alt="深色雨青 · 设置／外观" width="100%" /></a><br />
      <sub>深色雨青 · 设置／外观</sub>
    </td>
    <td width="50%" align="center">
      <a href="https://github.com/user-attachments/assets/3eda266a-824e-4e16-be09-f4c31206dbf2"><img src="https://github.com/user-attachments/assets/3eda266a-824e-4e16-be09-f4c31206dbf2" alt="浅色纸衫 · Rainy Design 开场（深色预览）" width="100%" /></a><br />
      <sub>浅色纸衫 · Rainy Design 开场（深色预览）</sub>
    </td>
  </tr>
</table>

功能配图展示0.3.0.0工程预览，点击查看原图。

## 📚 文档

预览标题栏提供滚动对齐、手动保存报告和仅保存刷新开关，详见[中文说明](docs/locale/zh-CN/README.md#doc-preview-controls)。

| 指南 | 简体中文 |
|---|---|
| 安装与使用 | [开始阅读](docs/locale/zh-CN/README.md) |
| Agent 安装与四个教程 | [Agent 外挂说明书](docs/locale/zh-CN/AGENT-GUIDE.md) |
| 主题、片段与模板 | [制作说明](docs/locale/zh-CN/THEME.md) |
| 格式策略 | [配置说明](docs/locale/zh-CN/FORMAT.md) |

**Agent 安装：** 从对应语言的 README 与 AGENT-GUIDE 开始，先核实可控桌面浏览器，再按确认的目录和权限安装；打印实际启动命令。

配图托管于 GitHub 附件，项目只引用图片链接。

完整字体按需下载到资料库：默认 Google Fonts，国内可手选免费 JSDMirror；已有字体保持。[中文说明](docs/locale/zh-CN/README.md#doc-font-downloads)

回收站、Toast撤销与刷新恢复见[中文说明](docs/locale/zh-CN/README.md#doc-trash-and-resume)／[English](docs/locale/en-US/README.md#doc-trash-and-resume)。
