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
  dependencyClosureDigest: string;
};
export type AuthorityDecision =
  { status: 'ADMIT'; permit: RevisionBoundPermit } | { status: 'DENY'; code: string };
export type DependencyImpactStatus = 'AFFECTED' | 'UNAFFECTED' | 'UNCERTAIN';
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
      dependencyClosureDigest: digest(dependencyClosure),
    },
  };
};
export const revalidate = (
  permit: RevisionBoundPermit,
  intent: ActionIntent,
  current: EngineeringGenerationId,
  now: string,
  impact: DependencyImpactStatus,
  evidenceFresh = true,
) =>
  Date.parse(permit.expiresAt) <= Date.parse(now)
    ? { status: 'REQUIRES_REEVALUATION' as const, code: 'PERMIT_EXPIRED' }
    : !evidenceFresh
      ? { status: 'REQUIRES_REEVALUATION' as const, code: 'EVIDENCE_STALE' }
      : permit.logicalOperationId !== intent.logicalOperationId ||
          permit.operationDigest !== operationDigest(intent.operation)
        ? { status: 'REJECTED' as const, code: 'ACTION_ARGUMENTS_CHANGED' }
        : permit.assetId !== intent.targetAssetId || permit.operation.target !== intent.operation.target
          ? { status: 'REJECTED' as const, code: 'ACTION_ARGUMENTS_CHANGED' }
          : permit.engineeringGeneration !== current && impact !== 'UNAFFECTED'
            ? {
                status: 'REQUIRES_REEVALUATION' as const,
                code: impact === 'UNCERTAIN' ? 'DEPENDENCY_IMPACT_UNKNOWN' : 'ENGINEERING_BASIS_CHANGED',
              }
            : { status: 'VALID' as const };
