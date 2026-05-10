// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { colorize, highlight } from './coloring.js';

describe('colorize — GUID', () => {
  it('wraps a 32-char uppercase hex GUID in tok-guid span', () => {
    const result = colorize('id [ABCDEF1234567890ABCDEF123456789A] done');
    expect(result.querySelector('span.tok-guid')?.textContent).toBe('[ABCDEF1234567890ABCDEF123456789A]');
  });

  it('wraps a 16-char hex bracket sequence in tok-guid span', () => {
    const result = colorize('token [ABCDEF1234567890] end');
    expect(result.querySelector('span.tok-guid')?.textContent).toBe('[ABCDEF1234567890]');
  });
});

describe('colorize — URL', () => {
  it('wraps an http URL in tok-url span', () => {
    const result = colorize('see http://example.com/path for details');
    expect(result.querySelector('span.tok-url')?.textContent).toBe('http://example.com/path');
  });

  it('wraps an https URL in tok-url span', () => {
    const result = colorize('visit https://example.com');
    expect(result.querySelector('span.tok-url')?.textContent).toBe('https://example.com');
  });
});

describe('colorize — string', () => {
  it('wraps a double-quoted string in tok-string span', () => {
    const result = colorize('value is "hello world" ok');
    expect(result.querySelector('span.tok-string')?.textContent).toBe('"hello world"');
  });

  it('wraps a single-quoted string in tok-string span', () => {
    const result = colorize("value is 'hello world' ok");
    expect(result.querySelector('span.tok-string')?.textContent).toBe("'hello world'");
  });
});

describe('colorize — number', () => {
  it('wraps an integer in tok-number span', () => {
    const result = colorize('count is 42 items');
    expect(result.querySelector('span.tok-number')?.textContent).toBe('42');
  });

  it('wraps a float in tok-number span', () => {
    const result = colorize('ratio is 3.14 exactly');
    expect(result.querySelector('span.tok-number')?.textContent).toBe('3.14');
  });
});

describe('colorize — HTML escaping', () => {
  it('treats <script> as literal text, never as a script element', () => {
    const result = colorize('<script>alert(1)</script>');
    expect(result.querySelector('script')).toBeNull();
    expect(result.textContent).toBe('<script>alert(1)</script>');
    // The literal text must not be inside any token span
    for (const span of result.querySelectorAll('span')) {
      expect(span.textContent).not.toContain('<script>');
    }
  });
});

describe('colorize — no matches', () => {
  it('returns a fragment whose text equals the input and contains no token spans', () => {
    const result = colorize('simple plain text with no special tokens');
    expect(result.textContent).toBe('simple plain text with no special tokens');
    expect(result.querySelector('span')).toBeNull();
    expect(result.querySelector('mark')).toBeNull();
  });
});

describe('colorize — multiple patterns in one string', () => {
  it('handles multiple different patterns without nesting spans', () => {
    const result = colorize('count 42 at https://example.com with "label"');
    expect(result.querySelector('span.tok-url')?.textContent).toBe('https://example.com');
    expect(result.querySelector('span.tok-string')?.textContent).toBe('"label"');
    expect(result.querySelector('span.tok-number')?.textContent).toBe('42');
    expect(result.textContent).toBe('count 42 at https://example.com with "label"');
    // No nested spans
    for (const span of result.querySelectorAll('span')) {
      expect(span.querySelector('span')).toBeNull();
    }
  });
});

describe('colorize — search highlights', () => {
  it('wraps highlighted ranges with mark.match', () => {
    const result = colorize('hello world', [[6, 11]]);
    expect(result.querySelector('mark.match')?.textContent).toBe('world');
  });

  it('places mark outside token span when a highlight spans an entire token', () => {
    const result = colorize('value is 42 done', [[9, 11]]);
    const wrapped = result.querySelector('mark.match > span.tok-number');
    expect(wrapped?.textContent).toBe('42');
  });

  it('splits a token when only part of it is highlighted', () => {
    const result = colorize('value 12345', [[6, 9]]);
    const numberSpans = Array.from(result.querySelectorAll('span.tok-number'));
    expect(numberSpans.map((s) => s.textContent)).toEqual(['123', '45']);
    expect(result.querySelector('mark.match > span.tok-number')?.textContent).toBe('123');
  });
});

describe('highlight', () => {
  it('returns a fragment whose text equals the input when no ranges given', () => {
    const result = highlight('a < b', []);
    expect(result.textContent).toBe('a < b');
    expect(result.querySelector('mark')).toBeNull();
  });

  it('wraps the matched range with mark.match', () => {
    const result = highlight('abcdef', [[2, 4]]);
    expect(result.textContent).toBe('abcdef');
    expect(result.querySelector('mark.match')?.textContent).toBe('cd');
  });

  it('merges overlapping ranges', () => {
    const result = highlight('abcdef', [[1, 3], [2, 5]]);
    expect(result.textContent).toBe('abcdef');
    const marks = Array.from(result.querySelectorAll('mark.match'));
    expect(marks.map((m) => m.textContent)).toEqual(['bcde']);
  });
});
