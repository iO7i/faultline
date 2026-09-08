import { describe, expect, it } from 'vitest';
import { executeBounded, reconcile, reconcileOutcome } from './index.js';
import { DeterministicCstrSimulator } from '../../simulator/src/index.js';
import { runDemos } from '../../../apps/cli/src/demo.js';

describe('bounded executor', () => {
  it('records an adapter-bound receipt after an acknowledged synthetic dispatch', () => {
    const result = runDemos();
    const simulator = new DeterministicCstrSimulator();
    const execution = executeBounded(
      result.recoveryPermit,
      result.recoveryIntent,
      {
        now: '2026-01-01T00:00:00.000Z',
        currentContract: result.r17.contract,
        evidence: result.snapshot,
      },
      simulator,
    );
    expect(execution).toMatchObject({
      status: 'DISPATCHED',
      receipt: { acknowledgement: 'ACKNOWLEDGED', adapterId: 'synthetic-cstr', adapterVersion: '1.0.0' },
    });
    if (execution.status !== 'DISPATCHED') throw new Error('expected synthetic dispatch');
    expect(reconcile(result.recoveryIntent, execution.receipt, simulator).status).toBe('RECONCILED');
    expect(reconcileOutcome(result.recoveryIntent, execution.receipt, simulator).status).toBe(
      'VERIFIED_MATCH',
    );
  });
  it('does not reconcile a receipt whose operation digest was detached from the intended operation', () => {
    const result = runDemos();
    const receipt = { ...result.recoveryReceipt, operationDigest: 'detached' };
    const simulator = new DeterministicCstrSimulator();
    simulator.execute(result.recoveryIntent.operation, result.recoveryIntent.logicalOperationId);
    expect(reconcile(result.recoveryIntent, receipt, simulator).status).toBe('RECONCILIATION_INCONCLUSIVE');
    expect(reconcileOutcome(result.recoveryIntent, receipt, simulator).status).toBe('VERIFIED_MISMATCH');
  });
  it('does not call the simulator when the trusted dispatch context rejects a stale permit', () => {
    const result = runDemos();
    const simulator = new DeterministicCstrSimulator();
    expect(
      executeBounded(
        result.permit,
        result.intent,
        {
          now: '2026-01-01T00:00:00.000Z',
          currentContract: result.r18.contract,
          evidence: result.snapshot,
          changeImpact: result.impact,
        },
        simulator,
      ),
    ).toMatchObject({ status: 'REQUIRES_REEVALUATION', effectCount: 0 });
  });
});
