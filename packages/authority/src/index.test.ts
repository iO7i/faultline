import { describe, expect, it } from 'vitest';
import { revalidatePermitForDispatch } from './index.js';
import { runDemos } from '../../../apps/cli/src/demo.js';

describe('authority', () => {
  it('binds a permit to its contract digest and evidence snapshot', () => {
    const result = runDemos();
    expect(result.permit.dependencyClosureDigest).toHaveLength(64);
    expect(
      revalidatePermitForDispatch(result.permit, result.intent, {
        now: '2026-01-01T00:00:00.000Z',
        currentContract: { ...result.r17.contract, digest: 'changed-contract-digest' as never },
        evidence: result.snapshot,
      }),
    ).toMatchObject({ status: 'REQUIRES_REEVALUATION', code: 'ENGINEERING_BASIS_CHANGED' });
  });
  it('requires reevaluation when the evidence snapshot or approval lifetime changes', () => {
    const result = runDemos();
    const context = {
      now: '2026-01-01T00:00:00.000Z',
      currentContract: result.r17.contract,
      evidence: result.snapshot,
    };
    expect(
      revalidatePermitForDispatch(result.permit, result.intent, {
        ...context,
        evidence: { ...result.snapshot, snapshotId: 'snapshot:other' as typeof result.snapshot.snapshotId },
      }),
    ).toMatchObject({ status: 'REQUIRES_REEVALUATION', code: 'EVIDENCE_SNAPSHOT_CHANGED' });
    expect(
      revalidatePermitForDispatch(
        { ...result.permit, expiresAt: '2025-12-31T23:59:59.000Z' },
        result.intent,
        context,
      ),
    ).toMatchObject({ status: 'REQUIRES_REEVALUATION', code: 'PERMIT_EXPIRED' });
  });
  it('rejects a malformed permit before considering otherwise usable evidence', () => {
    const result = runDemos();
    const malformed = {
      ...result.permit,
      operation: {
        ...result.permit.operation,
        value: { value: 120, unit: 'kg/s' as const },
      },
    };
    expect(
      revalidatePermitForDispatch(malformed, result.intent, {
        now: '2026-01-01T00:00:00.000Z',
        currentContract: result.r17.contract,
        evidence: { ...result.snapshot, fresh: false },
      }),
    ).toMatchObject({ status: 'REJECTED', code: 'PERMIT_BINDING_INVALID' });
  });
  it('does not accept a change-impact record that was computed for other contract artifacts', () => {
    const result = runDemos();
    expect(
      revalidatePermitForDispatch(result.permit, result.intent, {
        now: '2026-01-01T00:00:00.000Z',
        currentContract: result.r18.contract,
        evidence: result.snapshot,
        changeImpact: {
          ...result.impact,
          comparedTo: { ...result.impact.comparedTo, contractDigest: 'other' as never },
        },
      }),
    ).toMatchObject({ status: 'REQUIRES_REEVALUATION', code: 'DEPENDENCY_IMPACT_UNKNOWN' });
  });
});
