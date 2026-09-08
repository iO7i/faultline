import { describe, expect, it } from 'vitest';
import { InMemoryEvidenceStore } from './index.js';
import { ids } from '../../contracts/src/index.js';
describe('evidence', () =>
  it('reports missing evidence as not fresh', () =>
    expect(new InMemoryEvidenceStore().snapshot(ids.generation('R17'), '2026-01-01T00:00:00Z', 1).fresh).toBe(
      false,
    )));
