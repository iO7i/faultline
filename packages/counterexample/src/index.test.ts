import { describe, expect, it } from 'vitest';
import {
  applyTransition,
  checkAel,
  createInitialState,
  enabledTransitions,
  exploreScenario,
  replayCounterexample,
  shrinkCounterexample,
  type AelState,
} from './index.js';

describe('Authority-Effect Linearizability', () => {
  it('systematically discovers and shrinks the intentionally unsafe stale-authority commit', () => {
    const result = exploreScenario('refund-stale-approval');
    const counterexample = result.counterexamples[0];
    if (!counterexample) throw new Error('expected an unsafe-model counterexample');
    expect(counterexample.invariant).toBe('I3_STALE_AUTHORITY_CANNOT_COMMIT');
    expect(counterexample.code).toBe('STALE_AUTHORITY_EFFECT');
    expect(counterexample.minimized).toBe(true);
    expect(counterexample.transitionIds).toEqual([
      'dispatch:worker-A',
      'supersede:authority-r17',
      'commit:worker-A',
    ]);
    expect(replayCounterexample(counterexample)).toMatchObject({
      reproduced: true,
      violation: { invariant: 'I3_STALE_AUTHORITY_CANNOT_COMMIT' },
    });
  });
  it('proves the response-loss reference model contains the duplicate as one logical effect', () => {
    const result = exploreScenario('commit-response-lost');
    expect(result.counterexamples).toHaveLength(0);
    expect(result.exploredStates).toBeGreaterThan(1);
    expect(result.faultDecisions).toBeGreaterThan(0);
  });
  it('rejects a cross-tenant resumed worker before it can commit an effect', () => {
    let state = createInitialState('cross-tenant-resume');
    for (const transitionId of ['dispatch:worker-A', 'drift:worker-A', 'commit:worker-A']) {
      const transition = enabledTransitions(state).find((candidate) => candidate.id === transitionId);
      if (!transition) throw new Error(`missing transition ${transitionId}`);
      state = applyTransition(state, transition);
    }
    expect(state.effects).toHaveLength(0);
    expect(state.workers[0]?.status).toBe('REJECTED');
    expect(checkAel(state)).toHaveLength(0);
    expect(exploreScenario('cross-tenant-resume').counterexamples).toHaveLength(0);
  });
  it('evaluates exact arguments, duplicate effects, and terminal accounting independently', () => {
    const base = createInitialState('commit-response-lost');
    const authority = base.authorities[0];
    const worker = base.workers[0];
    if (!authority || !worker) throw new Error('fixture incomplete');
    const mutated = {
      ...base,
      effects: [
        {
          effectId: 'effect-1',
          operationId: worker.operation.operationId,
          tenant: worker.operation.tenant,
          principal: worker.operation.principal,
          action: 'REFUND' as const,
          argumentsHash: 'different-arguments',
          authorityId: authority.authorityId,
          authorityRevision: authority.revision,
          currentAuthorityRevisionAtCommit: authority.revision,
          workerId: worker.workerId,
        },
        {
          effectId: 'effect-2',
          operationId: worker.operation.operationId,
          tenant: worker.operation.tenant,
          principal: worker.operation.principal,
          action: 'REFUND' as const,
          argumentsHash: 'different-arguments',
          authorityId: authority.authorityId,
          authorityRevision: authority.revision,
          currentAuthorityRevisionAtCommit: authority.revision,
          workerId: worker.workerId,
        },
      ],
      accountings: [{ effectId: 'effect-1', status: 'PENDING' as const }],
    } satisfies AelState;
    expect(checkAel(mutated, true).map((violation) => violation.invariant)).toEqual(
      expect.arrayContaining([
        'I2_APPROVAL_BINDS_EXACT_ARGUMENTS',
        'I4_LOGICAL_EFFECT_AT_MOST_ONCE',
        'I6_COMMITTED_EFFECT_IS_ACCOUNTED',
      ]),
    );
  });
  it('distinguishes a missing authority and tenant drift from a later authority supersession', () => {
    let legalThenSuperseded = createInitialState('refund-stale-approval');
    for (const transitionId of ['dispatch:worker-A', 'commit:worker-A', 'supersede:authority-r17']) {
      const transition = enabledTransitions(legalThenSuperseded).find(
        (candidate) => candidate.id === transitionId,
      );
      if (!transition) throw new Error(`missing transition ${transitionId}`);
      legalThenSuperseded = applyTransition(legalThenSuperseded, transition);
    }
    expect(checkAel(legalThenSuperseded).map((violation) => violation.invariant)).not.toContain(
      'I3_STALE_AUTHORITY_CANNOT_COMMIT',
    );

    const orphaned = {
      ...createInitialState('commit-response-lost'),
      effects: [
        {
          effectId: 'orphaned-effect',
          operationId: 'unknown-operation',
          tenant: 'tenant-B',
          principal: 'human-1',
          action: 'REFUND' as const,
          argumentsHash: 'unknown',
          authorityId: 'missing-authority',
          authorityRevision: 17,
          currentAuthorityRevisionAtCommit: 17,
          workerId: 'worker-A',
        },
      ],
      accountings: [{ effectId: 'orphaned-effect', status: 'IN_DOUBT' as const }],
    } satisfies AelState;
    expect(checkAel(orphaned).map((violation) => violation.invariant)).toEqual(
      expect.arrayContaining(['I1_NO_EFFECT_WITHOUT_AUTHORITY', 'I5_TENANT_PRINCIPAL_CANNOT_DRIFT']),
    );
  });
  it('does not claim a shrink when removing a transition breaks replay', () => {
    const counterexample = exploreScenario('refund-stale-approval').counterexamples[0];
    if (!counterexample) throw new Error('expected counterexample');
    const shrunk = shrinkCounterexample({
      ...counterexample,
      transitionIds: [...counterexample.transitionIds, 'readback:missing'],
    });
    expect(shrunk.transitionIds).toEqual(counterexample.transitionIds);
  });
  it('rejects a capsule whose declared violation code does not replay exactly', () => {
    const counterexample = exploreScenario('refund-stale-approval').counterexamples[0];
    if (!counterexample) throw new Error('expected counterexample');
    expect(replayCounterexample({ ...counterexample, code: 'OTHER' }).reproduced).toBe(false);
  });
});
