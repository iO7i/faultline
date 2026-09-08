import { describe, expect, it } from 'vitest';
import { dimensionForUnit, makeSource, unitMatchesDimension } from './index.js';
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
});
