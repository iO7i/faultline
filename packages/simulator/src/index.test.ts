import { describe, it, expect } from 'vitest';
import { DeterministicCstrSimulator } from './index.js';
import { ids } from '../../contracts/src/index.js';
describe('simulator', () =>
  it('deduplicates operation ids', () => {
    const s = new DeterministicCstrSimulator();
    const op = {
      kind: 'SETPOINT_CHANGE' as const,
      target: ids.asset('FIC-101'),
      value: { value: 124, unit: 'kg/s' as const },
    };
    s.execute(op, ids.operation('op-1'));
    s.execute(op, ids.operation('op-1'));
    expect(s.effectCount(ids.operation('op-1'))).toBe(1);
  }));
