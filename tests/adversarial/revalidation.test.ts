import { describe, expect, it } from 'vitest';
import { revalidate } from '../../packages/authority/src/index.js';
import { executeBounded } from '../../packages/executor/src/index.js';
import { DeterministicCstrSimulator } from '../../packages/simulator/src/index.js';
import { runDemos } from '../../apps/cli/src/demo.js';

describe('adversarial revalidation', () => {
  it('treats uncertain dependency coverage as a reason to reevaluate', () => {
    const result = runDemos();
    expect(
      revalidate(result.permit, result.intent, result.r18.g, '2026-01-01T00:00:00.000Z', 'UNCERTAIN'),
    ).toMatchObject({
      status: 'REQUIRES_REEVALUATION',
      code: 'DEPENDENCY_IMPACT_UNKNOWN',
    });
  });
  it('blocks changed arguments and stale evidence before the simulator receives an effect', () => {
    const result = runDemos();
    const changed = {
      ...result.intent,
      operation: { ...result.intent.operation, value: { value: 123, unit: 'kg/s' as const } },
    };
    expect(
      revalidate(result.permit, changed, result.r17.g, '2026-01-01T00:00:00.000Z', 'UNAFFECTED'),
    ).toMatchObject({
      status: 'REJECTED',
      code: 'ACTION_ARGUMENTS_CHANGED',
    });
    const simulator = new DeterministicCstrSimulator();
    expect(
      executeBounded(
        result.permit,
        result.intent,
        result.r17.g,
        simulator,
        '2026-01-01T00:00:00.000Z',
        'UNAFFECTED',
        false,
      ),
    ).toMatchObject({ status: 'REQUIRES_REEVALUATION', code: 'EVIDENCE_STALE', effectCount: 0 });
  });
});
