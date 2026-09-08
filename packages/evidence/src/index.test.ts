import { describe, expect, it } from 'vitest';
import { InMemoryEvidenceStore, type Evidence } from './index.js';
import { ids } from '../../contracts/src/index.js';
describe('evidence', () =>
  it('reports missing evidence as not fresh', () =>
    expect(new InMemoryEvidenceStore().snapshot(ids.generation('R17'), '2026-01-01T00:00:00Z', 1).fresh).toBe(
      false,
    )));

describe('evidence snapshots', () => {
  const reading = (): Evidence => ({
    evidenceId: ids.evidence('e-1'),
    plantId: ids.plant('DemoPlant-01'),
    assetId: 'TT-204',
    generation: ids.generation('R17'),
    measuredAt: '2026-01-01T00:00:00.000Z',
    ingestedAt: '2026-01-01T00:00:00.000Z',
    source: 'synthetic',
    sourceRevision: '1',
    class: 'SIMULATED',
    quality: 'GOOD',
    value: { value: 82, unit: 'degC' },
  });
  it('is freshness-bound to measurement time and quality', () => {
    const store = new InMemoryEvidenceStore();
    store.append(reading());
    expect(store.snapshot(ids.generation('R17'), '2026-01-01T00:00:30.000Z', 60_000).fresh).toBe(true);
    expect(store.snapshot(ids.generation('R17'), '2026-01-01T00:01:01.000Z', 60_000).fresh).toBe(false);
    store.append({ ...reading(), evidenceId: ids.evidence('e-2'), quality: 'UNCERTAIN' });
    expect(store.snapshot(ids.generation('R17'), '2026-01-01T00:00:30.000Z', 60_000).fresh).toBe(false);
  });
  it('takes an append-time copy so later caller mutation cannot rewrite a snapshot', () => {
    const store = new InMemoryEvidenceStore();
    const mutable = reading();
    store.append(mutable);
    mutable.value.value = 999;
    const snapshot = store.snapshot(ids.generation('R17'), '2026-01-01T00:00:01.000Z', 60_000);
    expect(snapshot.evidence[0]?.value.value).toBe(82);
  });
});
