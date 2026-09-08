import { describe, expect, it } from 'vitest';
import {
  dimensionForUnit,
  JsonEngineeringFixtureAdapter,
  makeSource,
  parseSyntheticCstrEngineeringFixture,
  unitMatchesDimension,
} from './index.js';
import { ids } from '../../contracts/src/index.js';
describe('engineering sources', () => {
  it('has a stable content digest', () => {
    const s = makeSource({
      sourceId: ids.source('cooling'),
      revision: ids.revision('R17'),
      kind: 'OPERATING_ENVELOPE',
      scope: 'Unit-RX',
      approval: { status: 'APPROVED' },
    });
    expect(s.digest).toHaveLength(64);
  });
  it('distinguishes dimensions rather than accepting unit-shaped strings', () => {
    expect(dimensionForUnit('kg/s')).toBe('MassFlow');
    expect(unitMatchesDimension('degC', 'MassFlow')).toBe(false);
  });
  it('keeps fixture loading behind the future engineering-source adapter seam', async () => {
    const source = makeSource({
      sourceId: ids.source('fixture-source'),
      revision: ids.revision('R17'),
      kind: 'MANUAL_ASSERTION',
      scope: 'Unit-RX',
      approval: { status: 'APPROVED' },
    });
    const adapter = new JsonEngineeringFixtureAdapter({
      ir: {
        plantId: ids.plant('DemoPlant-01'),
        unitId: ids.unit('Unit-RX'),
        generation: ids.generation('R17'),
        nodes: [],
        edges: [],
      },
      sources: [source],
    });
    expect((await adapter.load()).sources[0]?.sourceId).toBe(source.sourceId);
  });
  it('accepts only bounded synthetic CSTR fixture declarations', () => {
    expect(
      parseSyntheticCstrEngineeringFixture({
        generation: 'R17',
        coolingAvailableCapacityPercent: 100,
        feedAdjustMaxKgPerS: 124,
        synthetic: true,
      }),
    ).toMatchObject({ ok: true });
    expect(
      parseSyntheticCstrEngineeringFixture({
        generation: 'R17',
        coolingAvailableCapacityPercent: 101,
        feedAdjustMaxKgPerS: 124,
        synthetic: true,
      }),
    ).toMatchObject({ ok: false, error: 'INVALID_COOLING_CAPACITY_PERCENT' });
  });
});
