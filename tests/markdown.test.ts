import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/ui/markdown.ts';
import { readFileSync } from 'node:fs';

describe('極簡 Markdown', () => {
  it('標題、段落、粗體、清單、引用、連結', () => {
    const html = renderMarkdown('# 標題\n\n一段 **粗** 文字 `code`。\n\n- 甲\n- 乙\n\n> 引用\n\n1. 一\n2. 二\n\n[連結](https://example.com) <script>');
    expect(html).toContain('<h2>標題</h2>');
    expect(html).toContain('<strong>粗</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<ul><li>甲</li><li>乙</li></ul>');
    expect(html).toContain('<ol><li>一</li><li>二</li></ol>');
    expect(html).toContain('<blockquote>引用</blockquote>');
    expect(html).toContain('<a href="https://example.com"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('docs/realism.md 能渲染且三段都在', () => {
    const html = renderMarkdown(readFileSync('docs/realism.md', 'utf8'));
    for (const h of ['TL;DR', '刻意的簡化', '資料不足之處', '下一步會做的', '人寫', 'AI 初稿']) expect(html).toContain(h);
    expect(html.indexOf('TL;DR')).toBeLessThan(html.indexOf('刻意的簡化'));
  });
});
