import { describe, it, expect } from 'vitest';
import { benchmarkCase } from './index.js';
describe('benchmark', () =>
  it('defines public expected result', () =>
    expect(benchmarkCase('x', 'REJECTED', 'x').expected).toBe('REJECTED')));
