import { describe, it, expect } from 'vitest';
import { FallbackCounter, createTokenCounter } from '../src/token-counter';

describe('FallbackCounter', () => {
  it('estimate returns approximate token count', () => {
    expect(FallbackCounter.estimate('Hello world, this is a test')).toBeGreaterThan(0);
  });

  it('estimate handles empty string', () => {
    expect(FallbackCounter.estimate('')).toBe(0);
  });

  it('estimate handles CJK text', () => {
    expect(FallbackCounter.estimate('你好世界这是一段中文测试文本')).toBeGreaterThan(0);
  });

  it('estimate handles very long text', () => {
    const tokens = FallbackCounter.estimate('x'.repeat(10000));
    expect(tokens).toBeGreaterThan(500);
  });

  it('estimate with special chars', () => {
    const tokens = FallbackCounter.estimate('code: function() { return 1 + 1; }');
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('createTokenCounter', () => {
  it('creates with cl100k_base encoding', () => {
    const counter = createTokenCounter('cl100k_base');
    expect(counter).toBeDefined();
    expect(typeof counter.count).toBe('function');
  });

  it('count returns token count for text', () => {
    const counter = createTokenCounter('cl100k_base');
    const result = counter.count('Hello world');
    expect(result.tokens).toBeGreaterThan(0);
    expect(['tiktoken', 'fallback']).toContain(result.method);
  });

  it('isPrecise returns boolean', () => {
    const counter = createTokenCounter('cl100k_base');
    expect(typeof counter.isPrecise()).toBe('boolean');
  });

  it('countBatch returns array of token counts', () => {
    const counter = createTokenCounter('cl100k_base');
    const result = counter.countBatch(['Hello', 'World', 'Test']);
    expect(result.tokens).toHaveLength(3);
  });

  it('countBatch with empty array', () => {
    const counter = createTokenCounter('cl100k_base');
    const result = counter.countBatch([]);
    expect(result.tokens).toEqual([]);
  });
});
