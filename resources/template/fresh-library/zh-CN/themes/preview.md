# 一页文章的开场

这是一段导语。主题样式会作用在真实排版节点上：**重点句**、[普通链接](#把信息说清楚)、删除线 ~~旧说法~~，以及脚注 <sup>1</sup>。

<section style="background:var(--color-article-quote-surface);border:1px solid var(--color-article-line);border-radius:8px;padding:16px;margin:24px 0;">
  <p style="color:var(--color-article-heading);font-weight:700;margin:0 0 8px;">阅读提示 <span style="color:var(--color-article-accent);">· 重点</span></p>
  <section style="background:var(--color-article-tint);border-radius:4px;padding:12px;">
    <p style="color:var(--color-article-ink);margin:0;">正文需要清楚易读。<a href="#把信息说清楚" style="color:var(--color-article-heading);">继续阅读</a>，或记下 <code style="color:var(--color-article-code);background:var(--color-article-code-tint);">theme.title</code>。</p>
    <p style="color:var(--color-article-muted);margin:8px 0 0;font-size:0.875em;">注释补充信息，引用浅底帮助区分阅读区域。</p>
  </section>
  <pre style="background:var(--color-article-code-surface);color:var(--color-article-code-tint);margin:12px 0 0;padding:12px;"><code style="color:inherit;background:transparent;padding:0;">const title = '排印样本';</code></pre>
</section>

## 把信息说清楚

### 小标题与段落

段落用来承接上下文。这里放一段稍长的文字，观察行宽、行高和留白是否适合连续阅读，而不只看一张颜色卡片。

#### 继续拆分

##### 更细的层级

###### 末级标题

> 引用适合承载采访原话或需要特别强调的一段内容。层级、底色和左侧标记都应清楚但不过分抢眼。

- 第一条列表信息
- 第二条列表信息

1. 先交代背景
2. 再给出结论

- [x] 已完成的事项
- [ ] 尚待确认的事项

正文里也会出现 `行内代码`。

```ts
const article = { title: '排印样本', saved: false };
console.log(article.title);
```

| 信息 | 示例 | 状态 |
| --- | --- | --- |
| 标题 | 层级清楚 | 可读 |
| 正文 | 行宽适中 | 连贯 |

<figure><img src="/images/article-sample.png" alt="Rainy Design 示例图片" /><figcaption>图注在图片下方，作为文章内容的一部分。</figcaption></figure>

---

注脚：这里检查小号注释的阅读感。
