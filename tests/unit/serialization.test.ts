import { describe, expect, it } from 'vitest';
import { digest } from '../../packages/contracts/src/index.js';

describe('deterministic serialization', () => {
  it('does not let input object key ordering change an artifact identity', () => {
    expect(digest({ b: 2, a: { y: 3, x: 1 } })).toBe(digest({ a: { x: 1, y: 3 }, b: 2 }));
    expect(digest({ a: 1 })).not.toBe(digest({ a: 2 }));
  });
});
