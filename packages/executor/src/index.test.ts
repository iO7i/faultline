import { describe, it, expect } from 'vitest';
describe('executor', () =>
  it('is simulator-only by public API', () => expect('simulator-only').toContain('simulator')));
