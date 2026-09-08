import {
  revalidatePermitForDispatch,
  type DispatchRevalidationContext,
  type RevisionBoundPermit,
} from '../../authority/src/index.js';
import { digest, type ExecutionReceiptId } from '../../contracts/src/index.js';
import type { ActionIntent } from '../../proposal/src/index.js';
import type { SimulatorAdapter } from '../../simulator/src/index.js';

export type ExecutionReceipt = {
  receiptId: ExecutionReceiptId;
  logicalOperationId: ActionIntent['logicalOperationId'];
  operationDigest: string;
  acknowledgement: 'ACKNOWLEDGED' | 'LOST';
  simulatorEffectCount: number;
  adapterId: string;
  adapterVersion: string;
};
export type ExecutionResult =
  | { status: 'DISPATCHED'; receipt: ExecutionReceipt }
  | { status: 'COMPLETION_UNKNOWN'; code: 'COMPLETION_UNKNOWN'; receipt: ExecutionReceipt }
  | { status: 'REJECTED'; code: string; effectCount: number }
  | { status: 'REQUIRES_REEVALUATION'; code: string; effectCount: number };
export const executeBounded = (
  permit: RevisionBoundPermit,
  intent: ActionIntent,
  context: DispatchRevalidationContext,
  simulator: SimulatorAdapter,
): ExecutionResult => {
  const validation = revalidatePermitForDispatch(permit, intent, context);
  if (validation.status === 'REQUIRES_REEVALUATION')
    return {
      status: 'REQUIRES_REEVALUATION',
      code: validation.code,
      effectCount: simulator.effectCount(intent.logicalOperationId),
    };
  if (validation.status === 'REJECTED')
    return {
      status: 'REJECTED',
      code: validation.code,
      effectCount: simulator.effectCount(intent.logicalOperationId),
    };
  const dispatch = simulator.execute(intent.operation, intent.logicalOperationId);
  const receipt: ExecutionReceipt = {
    receiptId:
      `receipt:${digest([intent.logicalOperationId, intent.operation]).slice(0, 16)}` as ExecutionReceiptId,
    logicalOperationId: intent.logicalOperationId,
    operationDigest: digest(intent.operation),
    acknowledgement: dispatch.acknowledged ? 'ACKNOWLEDGED' : 'LOST',
    simulatorEffectCount: simulator.effectCount(intent.logicalOperationId),
    adapterId: simulator.adapterId,
    adapterVersion: simulator.adapterVersion,
  };
  return dispatch.acknowledged
    ? { status: 'DISPATCHED', receipt }
    : { status: 'COMPLETION_UNKNOWN', code: 'COMPLETION_UNKNOWN', receipt };
};
export type ReconciledExecution = {
  status: 'RECONCILED' | 'RECONCILIATION_INCONCLUSIVE';
  receipt: ExecutionReceipt;
};
export const reconcile = (
  intent: ActionIntent,
  receipt: ExecutionReceipt,
  simulator: SimulatorAdapter,
): ReconciledExecution =>
  simulator.hasEffect(intent.logicalOperationId) &&
  receipt.logicalOperationId === intent.logicalOperationId &&
  receipt.operationDigest === digest(intent.operation)
    ? {
        status: 'RECONCILED',
        receipt: { ...receipt, simulatorEffectCount: simulator.effectCount(intent.logicalOperationId) },
      }
    : { status: 'RECONCILIATION_INCONCLUSIVE', receipt: { ...receipt, simulatorEffectCount: 0 } };
export type OutcomeArtifact = {
  status: 'VERIFIED_MATCH' | 'VERIFIED_PARTIAL' | 'VERIFIED_MISMATCH' | 'INCONCLUSIVE';
  intended: ActionIntent['operation'];
  observedSetpoint: number;
  receiptId: ExecutionReceiptId;
};
export const reconcileOutcome = (
  intent: ActionIntent,
  receipt: ExecutionReceipt,
  simulator: SimulatorAdapter,
): OutcomeArtifact => {
  const observed = simulator.readback();
  return {
    status:
      receipt.logicalOperationId === intent.logicalOperationId &&
      receipt.operationDigest === digest(intent.operation) &&
      observed.setpoint === intent.operation.value.value
        ? 'VERIFIED_MATCH'
        : 'VERIFIED_MISMATCH',
    intended: intent.operation,
    observedSetpoint: observed.setpoint,
    receiptId: receipt.receiptId,
  };
};
