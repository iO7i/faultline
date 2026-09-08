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

describe('synthetic CSTR counterfactuals', () => {
  const simulator = new DeterministicCstrSimulator();
  const state = simulator.snapshot();
  it('keeps model provenance with an accepted result', () => {
    const result = simulator.simulate(state, {
      kind: 'SETPOINT_CHANGE',
      target: ids.asset('FIC-101'),
      value: { value: 124, unit: 'kg/s' },
    });
    expect(result).toMatchObject({
      status: 'MODEL_ACCEPTS_WITHIN_DOMAIN',
      adapterId: 'synthetic-cstr',
      adapterVersion: '1.0.0',
      basis: 'WITHIN_SYNTHETIC_BOUND',
    });
    expect(result.initialStateDigest).toHaveLength(64);
    expect(result.operationDigest).toHaveLength(64);
  });
  it('distinguishes a rejected synthetic value from an out-of-domain query', () => {
    expect(
      simulator.simulate(state, {
        kind: 'SETPOINT_CHANGE',
        target: ids.asset('FIC-101'),
        value: { value: 131, unit: 'kg/s' },
      }),
    ).toMatchObject({ status: 'MODEL_REJECTS', basis: 'FLOW_EXCEEDS_SYNTHETIC_BOUND' });
    expect(
      simulator.simulate(state, {
        kind: 'SETPOINT_CHANGE',
        target: ids.asset('FIC-101'),
        value: { value: 82, unit: 'degC' },
      }),
    ).toMatchObject({ status: 'MODEL_INCONCLUSIVE', basis: 'UNIT_OUTSIDE_SYNTHETIC_MODEL' });
  });
});
