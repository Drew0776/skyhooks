import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AiText from '../src/components/AiText';

const html = (text: string) => renderToStaticMarkup(createElement(AiText, { text }));

test('co-pilot Markdown renders as elements', () => {
  const out = html('### Risk\n* **TG-201** ships `2026-09-27`\n  * nested\n1. First\n---\n| Tag | Days |\n|---|---|\n| TG-102 | 27 |');
  assert.match(out, /<p class="[^"]*">Risk<\/p>/);
  assert.match(out, /<strong[^>]*>TG-201<\/strong> ships <code[^>]*>2026-09-27<\/code>/);
  assert.match(out, /padding-left:14px/);
  assert.match(out, /<hr/);
  assert.match(out, /<th[^>]*>Tag<\/th>/);
  assert.match(out, /<td[^>]*>27<\/td>/);
  assert.doesNotMatch(out, /\*\*|###|\|---/);
});

test('model output cannot inject markup', () => {
  const out = html('<script>alert(1)</script> **<img src=x onerror=alert(1)>**');
  assert.doesNotMatch(out, /<script|<img/);
  assert.match(out, /&lt;script&gt;/);
});
