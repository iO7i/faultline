import { describe, expect, it } from 'vitest';
import { evaluateAdmissibility, fullReevaluate, incrementalReevaluate } from './index.js';
import { runDemos } from '../../../apps/cli/src/demo.js';

describe('admissibility', () => {
  it('keeps nominal, declared violation, and insufficient evidence distinct', () => {
    const result = runDemos();
    expect(evaluateAdmissibility(result.r17.contract, result.snapshot, result.intent).status).toBe(
      'ADMISSIBLE_WITHIN_DECLARED_MODEL',
    );
    expect(
      evaluateAdmissibility(result.r17.contract, result.snapshot, {
        ...result.intent,
        operation: { ...result.intent.operation, value: { value: 125, unit: 'kg/s' } },
      }),
    ).toMatchObject({ status: 'REJECTED', code: 'ACTION_ARGUMENT_OUT_OF_BOUNDS' });
    expect(
      evaluateAdmissibility(result.r17.contract, { ...result.snapshot, fresh: false }, result.intent),
    ).toMatchObject({
      status: 'INSUFFICIENT_EVIDENCE',
      code: 'EVIDENCE_STALE',
    });
  });
  it('keeps incremental and full reevaluation equivalent until a partial evaluator is implemented', () => {
    const result = runDemos();
    expect(incrementalReevaluate(result.r17.contract, result.snapshot, result.intent, true)).toEqual(
      fullReevaluate(result.r17.contract, result.snapshot, result.intent),
    );
  });
});
