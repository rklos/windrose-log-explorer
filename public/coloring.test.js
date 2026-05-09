import { describe, it, expect } from 'vitest';
import { escapeHtml, colorize } from './coloring.js';

describe('escapeHtml', () => {
  it('escapes & to &amp;', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes < to &lt;', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b');
  });

  it('escapes > to &gt;', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes " to &quot;', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it("escapes ' to &#39;", () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('escapes all five characters in one string', () => {
    expect(escapeHtml('& < > " \'')).toBe('&amp; &lt; &gt; &quot; &#39;');
  });
});

describe('colorize — GUID', () => {
  it('wraps a 32-char uppercase hex GUID in tok-guid span', () => {
    const msg = 'id [ABCDEF1234567890ABCDEF123456789A] done';
    const result = colorize(msg);
    expect(result).toContain('<span class="tok-guid">[ABCDEF1234567890ABCDEF123456789A]</span>');
  });

  it('wraps a 16-char hex bracket sequence in tok-guid span', () => {
    const msg = 'token [ABCDEF1234567890] end';
    const result = colorize(msg);
    expect(result).toContain('<span class="tok-guid">[ABCDEF1234567890]</span>');
  });
});

describe('colorize — URL', () => {
  it('wraps an http URL in tok-url span', () => {
    const msg = 'see http://example.com/path for details';
    const result = colorize(msg);
    expect(result).toContain('<span class="tok-url">http://example.com/path</span>');
  });

  it('wraps an https URL in tok-url span', () => {
    const msg = 'visit https://example.com';
    const result = colorize(msg);
    expect(result).toContain('<span class="tok-url">https://example.com</span>');
  });
});

describe('colorize — string', () => {
  it('wraps a double-quoted string in tok-string span', () => {
    const msg = 'value is "hello world" ok';
    const result = colorize(msg);
    expect(result).toContain('<span class="tok-string">&quot;hello world&quot;</span>');
  });

  it('wraps a single-quoted string in tok-string span', () => {
    const msg = "value is 'hello world' ok";
    const result = colorize(msg);
    expect(result).toContain('<span class="tok-string">&#39;hello world&#39;</span>');
  });
});

describe('colorize — number', () => {
  it('wraps an integer in tok-number span', () => {
    const msg = 'count is 42 items';
    const result = colorize(msg);
    expect(result).toContain('<span class="tok-number">42</span>');
  });

  it('wraps a float in tok-number span', () => {
    const msg = 'ratio is 3.14 exactly';
    const result = colorize(msg);
    expect(result).toContain('<span class="tok-number">3.14</span>');
  });
});

describe('colorize — HTML escaping', () => {
  it('escapes <script> so it appears as &lt;script&gt; and is NOT wrapped in a span', () => {
    const msg = '<script>alert(1)</script>';
    const result = colorize(msg);
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
    // The escaped text must not be inside any token span
    expect(result).not.toMatch(/<span class="tok-[^"]*">[^<]*&lt;script&gt;/);
  });
});

describe('colorize — no matches', () => {
  it('returns the escaped string unchanged when no patterns match', () => {
    const msg = 'simple plain text with no special tokens';
    const result = colorize(msg);
    expect(result).toBe('simple plain text with no special tokens');
    // No leftover placeholder tokens like ` 0 `
    expect(result).not.toMatch(/ \d+ /);
  });
});

describe('colorize — multiple patterns in one string', () => {
  it('handles multiple different patterns without nested spans or leftover placeholders', () => {
    const msg = 'count 42 at https://example.com with "label"';
    const result = colorize(msg);
    expect(result).toContain('<span class="tok-url">https://example.com</span>');
    expect(result).toContain('<span class="tok-string">&quot;label&quot;</span>');
    expect(result).toContain('<span class="tok-number">42</span>');
    // No leftover placeholders
    expect(result).not.toMatch(/ \d+ /);
    // No nested spans
    expect(result).not.toMatch(/<span[^>]*><span/);
  });
});
