import { describe, expect, it } from 'vitest';
import { revalidatePermitForDispatch } from '../../packages/authority/src/index.js';
import { executeBounded } from '../../packages/executor/src/index.js';
import { DeterministicCstrSimulator } from '../../packages/simulator/src/index.js';
import { runDemos } from '../../apps/cli/src/demo.js';

describe('adversarial revalidation', () => {
  it('treats missing or uncertain dependency coverage as a reason to reevaluate', () => {
    const result = runDemos();
    expect(
      revalidatePermitForDispatch(result.permit, result.intent, {
        now: '2026-01-01T00:00:00.000Z',
        currentContract: result.r18.contract,
        evidence: result.snapshot,
      }),
    ).toMatchObject({ status: 'REQUIRES_REEVALUATION', code: 'DEPENDENCY_IMPACT_UNKNOWN' });
    expect(
      revalidatePermitForDispatch(result.permit, result.intent, {
        now: '2026-01-01T00:00:00.000Z',
        currentContract: result.r18.contract,
        evidence: result.snapshot,
        changeImpact: { ...result.impact, coverage: 'UNCERTAIN' },
      }),
    ).toMatchObject({ status: 'REQUIRES_REEVALUATION', code: 'DEPENDENCY_IMPACT_UNKNOWN' });
  });
  it('blocks changed arguments, changed evidence, and stale evidence before a simulator effect', () => {
    const result = runDemos();
    const changed = {
      ...result.intent,
      operation: { ...result.intent.operation, value: { value: 123, unit: 'kg/s' as const } },
    };
    const context = {
      now: '2026-01-01T00:00:00.000Z',
      currentContract: result.r17.contract,
      evidence: result.snapshot,
    };
    expect(revalidatePermitForDispatch(result.permit, changed, context)).toMatchObject({
      status: 'REJECTED',
      code: 'ACTION_ARGUMENTS_CHANGED',
    });
    expect(
      revalidatePermitForDispatch(result.permit, result.intent, {
        ...context,
        evidence: { ...result.snapshot, fresh: false },
      }),
    ).toMatchObject({ status: 'REQUIRES_REEVALUATION', code: 'EVIDENCE_STALE' });
    const simulator = new DeterministicCstrSimulator();
    expect(
      executeBounded(
        result.permit,
        result.intent,
        { ...context, evidence: { ...result.snapshot, fresh: false } },
        simulator,
      ),
    ).toMatchObject({ status: 'REQUIRES_REEVALUATION', code: 'EVIDENCE_STALE', effectCount: 0 });
  });
});
