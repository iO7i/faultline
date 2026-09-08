import {
  revalidate,
  type DependencyImpactStatus,
  type RevisionBoundPermit,
} from '../../authority/src/index.js';
import type { EngineeringGenerationId } from '../../contracts/src/index.js';
import type { ActionIntent } from '../../proposal/src/index.js';
import { DeterministicCstrSimulator } from '../../simulator/src/index.js';

export type ExecutionResult = {
  status: 'DISPATCHED' | 'COMPLETION_UNKNOWN' | 'REJECTED' | 'REQUIRES_REEVALUATION' | 'RECONCILED';
  code?: string;
  effectCount: number;
};
export const executeBounded = (
  permit: RevisionBoundPermit,
  intent: ActionIntent,
  current: EngineeringGenerationId,
  sim: DeterministicCstrSimulator,
  now: string,
  impact: DependencyImpactStatus,
  evidenceFresh = true,
): ExecutionResult => {
  const validation = revalidate(permit, intent, current, now, impact, evidenceFresh);
  if (validation.status === 'REQUIRES_REEVALUATION')
    return {
      status: 'REQUIRES_REEVALUATION',
      code: validation.code,
      effectCount: sim.effectCount(intent.logicalOperationId),
    };
  if (validation.status === 'REJECTED')
    return {
      status: 'REJECTED',
      code: validation.code,
      effectCount: sim.effectCount(intent.logicalOperationId),
    };
  const dispatch = sim.execute(intent.operation, intent.logicalOperationId);
  return dispatch.acknowledged
    ? { status: 'DISPATCHED', effectCount: sim.effectCount(intent.logicalOperationId) }
    : {
        status: 'COMPLETION_UNKNOWN',
        code: 'COMPLETION_UNKNOWN',
        effectCount: sim.effectCount(intent.logicalOperationId),
      };
};
export const reconcile = (intent: ActionIntent, sim: DeterministicCstrSimulator): ExecutionResult =>
  sim.hasEffect(intent.logicalOperationId)
    ? { status: 'RECONCILED', effectCount: sim.effectCount(intent.logicalOperationId) }
    : { status: 'REJECTED', code: 'READBACK_MISMATCH', effectCount: 0 };
export type OutcomeArtifact = {
  status: 'VERIFIED_MATCH' | 'VERIFIED_PARTIAL' | 'VERIFIED_MISMATCH' | 'INCONCLUSIVE';
  intended: ActionIntent['operation'];
  observedSetpoint: number;
};
export const reconcileOutcome = (intent: ActionIntent, sim: DeterministicCstrSimulator): OutcomeArtifact => {
  const observed = sim.readback();
  return {
    status: observed.setpoint === intent.operation.value.value ? 'VERIFIED_MATCH' : 'VERIFIED_MISMATCH',
    intended: intent.operation,
    observedSetpoint: observed.setpoint,
  };
};
