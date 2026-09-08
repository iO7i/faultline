import {
  digest,
  type ApprovalId,
  type AssetId,
  type EngineeringGenerationId,
  type EvidenceSnapshotId,
  type LogicalOperationId,
  type PermitId,
} from '../../contracts/src/index.js';
import type { AdmissibilityResult } from '../../admissibility/src/index.js';
import type { EvidenceSnapshot } from '../../evidence/src/index.js';
import type { ChangeImpact, PlantContractArtifact } from '../../plant-contract/src/index.js';
import { operationDigest, type ActionIntent } from '../../proposal/src/index.js';

export type Principal = { id: string; kind: 'HUMAN' | 'AGENT' | 'WORKFLOW' };
export type Approval = {
  id: ApprovalId;
  expiresAt: string;
  plantId: string;
  unitId: string;
  assetId: AssetId;
  capabilityId: string;
  purpose: string;
};
export type RevisionBoundPermit = {
  permitId: PermitId;
  issuedAt: string;
  expiresAt: string;
  principal: Principal;
  approvalId: ApprovalId;
  engineeringGeneration: EngineeringGenerationId;
  contractDigest: string;
  dependencyClosure: readonly string[];
  dependencyClosureDigest: string;
  operationDigest: string;
  logicalOperationId: LogicalOperationId;
  purpose: string;
  plantId: string;
  unitId: string;
  assetId: AssetId;
  capabilityId: string;
  operation: ActionIntent['operation'];
  evidenceSnapshotId: EvidenceSnapshotId;
  evidenceSnapshotDigest: string;
};
export type AuthorityDecision =
  | { status: 'ADMIT'; permit: RevisionBoundPermit }
  | { status: 'DENY'; code: 'AUTHORITY_DENIED' | 'APPROVAL_EXPIRED' };
export type DispatchRevalidationContext = {
  now: string;
  currentContract: PlantContractArtifact;
  evidence: EvidenceSnapshot;
  changeImpact?: ChangeImpact;
};
export type DispatchRevalidation =
  | { status: 'VALID' }
  | {
      status: 'REQUIRES_REEVALUATION';
      code:
        | 'PERMIT_EXPIRED'
        | 'EVIDENCE_STALE'
        | 'EVIDENCE_SNAPSHOT_CHANGED'
        | 'ENGINEERING_BASIS_CHANGED'
        | 'DEPENDENCY_IMPACT_UNKNOWN';
      details: Readonly<Record<string, unknown>>;
    }
  | {
      status: 'REJECTED';
      code: 'ACTION_ARGUMENTS_CHANGED' | 'PERMIT_BINDING_INVALID';
      details: Readonly<Record<string, unknown>>;
    };

export const authorize = (
  principal: Principal,
  approval: Approval,
  admissibility: AdmissibilityResult,
  intent: ActionIntent,
  now: string,
): AuthorityDecision => {
  if (admissibility.status !== 'ADMISSIBLE_WITHIN_DECLARED_MODEL')
    return { status: 'DENY', code: 'AUTHORITY_DENIED' };
  if (Date.parse(approval.expiresAt) <= Date.parse(now)) return { status: 'DENY', code: 'APPROVAL_EXPIRED' };
  if (
    approval.plantId !== intent.plantId ||
    approval.unitId !== intent.unitId ||
    approval.assetId !== intent.targetAssetId ||
    approval.capabilityId !== intent.capabilityId ||
    approval.purpose !== intent.purpose
  )
    return { status: 'DENY', code: 'AUTHORITY_DENIED' };
  const dependencyClosure = [...new Set(admissibility.dependencyClosure)].sort();
  return {
    status: 'ADMIT',
    permit: {
      permitId: `permit:${digest([principal.id, intent.logicalOperationId]).slice(0, 12)}` as PermitId,
      issuedAt: now,
      expiresAt: approval.expiresAt,
      principal,
      approvalId: approval.id,
      engineeringGeneration: intent.engineeringGeneration,
      contractDigest: admissibility.contractDigest,
      dependencyClosure,
      dependencyClosureDigest: digest(dependencyClosure),
      operationDigest: operationDigest(intent.operation),
      logicalOperationId: intent.logicalOperationId,
      purpose: intent.purpose,
      plantId: intent.plantId,
      unitId: intent.unitId,
      assetId: intent.targetAssetId,
      capabilityId: intent.capabilityId,
      operation: intent.operation,
      evidenceSnapshotId: intent.evidenceSnapshotId,
      evidenceSnapshotDigest: admissibility.evidenceSnapshotDigest,
    },
  };
};

export const revalidatePermitForDispatch = (
  permit: RevisionBoundPermit,
  intent: ActionIntent,
  context: DispatchRevalidationContext,
): DispatchRevalidation => {
  if (Date.parse(permit.expiresAt) <= Date.parse(context.now))
    return { status: 'REQUIRES_REEVALUATION', code: 'PERMIT_EXPIRED', details: {} };
  if (permit.dependencyClosureDigest !== digest(permit.dependencyClosure))
    return {
      status: 'REJECTED',
      code: 'PERMIT_BINDING_INVALID',
      details: { field: 'dependencyClosureDigest' },
    };
  if (permit.operationDigest !== operationDigest(permit.operation))
    return {
      status: 'REJECTED',
      code: 'PERMIT_BINDING_INVALID',
      details: { field: 'operationDigest' },
    };
  if (
    permit.logicalOperationId !== intent.logicalOperationId ||
    permit.operationDigest !== operationDigest(intent.operation) ||
    permit.assetId !== intent.targetAssetId ||
    permit.operation.target !== intent.operation.target
  )
    return { status: 'REJECTED', code: 'ACTION_ARGUMENTS_CHANGED', details: {} };
  if (!context.evidence.fresh)
    return {
      status: 'REQUIRES_REEVALUATION',
      code: 'EVIDENCE_STALE',
      details: { snapshotId: context.evidence.snapshotId },
    };
  if (
    context.evidence.snapshotId !== permit.evidenceSnapshotId ||
    context.evidence.digest !== permit.evidenceSnapshotDigest
  )
    return {
      status: 'REQUIRES_REEVALUATION',
      code: 'EVIDENCE_SNAPSHOT_CHANGED',
      details: {
        permitSnapshotId: permit.evidenceSnapshotId,
        currentSnapshotId: context.evidence.snapshotId,
      },
    };
  if (context.currentContract.generation === permit.engineeringGeneration) {
    return context.currentContract.digest === permit.contractDigest
      ? { status: 'VALID' }
      : {
          status: 'REQUIRES_REEVALUATION',
          code: 'ENGINEERING_BASIS_CHANGED',
          details: { reason: 'CONTRACT_DIGEST_CHANGED_WITHIN_GENERATION' },
        };
  }
  if (
    !context.changeImpact ||
    context.changeImpact.coverage !== 'COMPLETE' ||
    context.changeImpact.comparedFrom.generation !== permit.engineeringGeneration ||
    context.changeImpact.comparedFrom.contractDigest !== permit.contractDigest ||
    context.changeImpact.comparedTo.generation !== context.currentContract.generation ||
    context.changeImpact.comparedTo.contractDigest !== context.currentContract.digest
  )
    return { status: 'REQUIRES_REEVALUATION', code: 'DEPENDENCY_IMPACT_UNKNOWN', details: {} };
  if (context.changeImpact.affectedPermits.includes(permit.permitId))
    return {
      status: 'REQUIRES_REEVALUATION',
      code: 'ENGINEERING_BASIS_CHANGED',
      details: { changed: context.changeImpact.changed, affected: context.changeImpact.affected },
    };
  return { status: 'VALID' };
};
