---
name: add-til
description: "Add a Today I Learned entry to blog.monstuff.com/til. Use when asked to add, write, publish, draft, or create a TIL entry for blog.monstuff.com. Triggers on: add a TIL, write a TIL, new TIL, publish a TIL, create a TIL."
user-invocable: true
---

# Add TIL

Add a Today I Learned entry to Julien's Jekyll blog at `Q:\repos\jcouv.github.io`. Create a dated post in `_posts` with `categories: [til]`, a `/til/<slug>.html` permalink, and a short practical body; include source links when relevant.

Do not add the entry to the home page manually; `/til/` lists posts in the `til` category.

## Conventions

Use these defaults instead of reading existing TIL files just to rediscover the format:

- File path: `Q:\repos\jcouv.github.io\_posts\YYYY-MM-DD-<slug>.md`
- Slug: lowercase, hyphen-separated, derived from the title.
- Front matter:

```yaml
---
published: true
title: <Title>
categories: [til]
permalink: /til/<slug>.html
comments: False
---
```

- Body: short, practical Markdown; usually 2-5 concise paragraphs or a short list.
- Tone: direct, explanatory, and lightly polished; preserve the user's idea but fix typos and clarify technical nuance.

Only inspect existing posts when the requested entry needs a style comparison or there is a possible filename/permalink collision.
