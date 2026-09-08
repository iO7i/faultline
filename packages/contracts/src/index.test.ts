import { describe, expect, it } from 'vitest';
import { digest } from './index.js';
describe('canonical digest', () =>
  it('ignores object key order and detects meaning', () => {
    expect(digest({ b: 2, a: 1 })).toBe(digest({ a: 1, b: 2 }));
    expect(digest({ a: 1 })).not.toBe(digest({ a: 2 }));
  }));
