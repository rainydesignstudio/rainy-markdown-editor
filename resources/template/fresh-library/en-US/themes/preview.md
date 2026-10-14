# The opening of an article

This introduction shows how the theme styles real article elements: **an important sentence**, [a regular link](#make-information-clear), ~~an earlier idea~~, and a footnote <sup>1</sup>.

<section style="background:var(--color-article-quote-surface);border:1px solid var(--color-article-line);border-radius:8px;padding:16px;margin:24px 0;">
  <p style="color:var(--color-article-heading);font-weight:700;margin:0 0 8px;">Reading note <span style="color:var(--color-article-accent);">· Key point</span></p>
  <section style="background:var(--color-article-tint);border-radius:4px;padding:12px;">
    <p style="color:var(--color-article-ink);margin:0;">Body text should be clear and readable. <a href="#make-information-clear" style="color:var(--color-article-heading);">Keep reading</a>, or note <code style="color:var(--color-article-code);background:var(--color-article-code-tint);">theme.title</code>.</p>
    <p style="color:var(--color-article-muted);margin:8px 0 0;font-size:0.875em;">Notes add context, while a light quotation surface separates reading areas.</p>
  </section>
  <pre style="background:var(--color-article-code-surface);color:var(--color-article-code-tint);margin:12px 0 0;padding:12px;"><code style="color:inherit;background:transparent;padding:0;">const title = 'Typography sample';</code></pre>
</section>

## Make information clear

### Subheadings and paragraphs

Paragraphs connect one idea to the next. This longer sentence helps you judge the line width, line height and spacing for sustained reading, beyond a single color swatch.

#### A closer look

##### A finer level

###### The final heading level

> A quotation can hold someone's words or a passage that deserves attention. Its hierarchy, surface and left marker should be clear without overwhelming the text.

- The first piece of information
- The second piece of information

1. Explain the context
2. State the conclusion

- [x] A completed task
- [ ] A task awaiting confirmation

Body text can also contain `inline code`.

```ts
const article = { title: 'Typography sample', saved: false };
console.log(article.title);
```

| Information | Example | Status |
| --- | --- | --- |
| Heading | Clear hierarchy | Readable |
| Body | Comfortable line width | Connected |

<figure><img src="/images/article-sample.png" alt="Rainy Design example image" /><figcaption>The caption sits below the image as part of the article.</figcaption></figure>

---

Footnote: check how smaller annotations read here.
