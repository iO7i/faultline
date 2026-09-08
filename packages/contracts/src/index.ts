import { createHash } from 'node:crypto';

export type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type PlantId = Brand<string, 'PlantId'>;
export type AreaId = Brand<string, 'AreaId'>;
export type UnitId = Brand<string, 'UnitId'>;
export type AssetId = Brand<string, 'AssetId'>;
export type InstrumentId = Brand<string, 'InstrumentId'>;
export type StreamId = Brand<string, 'StreamId'>;
export type EngineeringGenerationId = Brand<string, 'EngineeringGenerationId'>;
export type EngineeringSourceId = Brand<string, 'EngineeringSourceId'>;
export type EngineeringRevisionId = Brand<string, 'EngineeringRevisionId'>;
export type PlantContractId = Brand<string, 'PlantContractId'>;
export type PlantContractDigest = Brand<string, 'PlantContractDigest'>;
export type EvidenceId = Brand<string, 'EvidenceId'>;
export type EvidenceSnapshotId = Brand<string, 'EvidenceSnapshotId'>;
export type EvidenceSnapshotDigest = Brand<string, 'EvidenceSnapshotDigest'>;
export type ProposalId = Brand<string, 'ProposalId'>;
export type CapabilityId = Brand<string, 'CapabilityId'>;
export type CapabilityVersion = Brand<string, 'CapabilityVersion'>;
export type ApprovalId = Brand<string, 'ApprovalId'>;
export type AuthorityDecisionId = Brand<string, 'AuthorityDecisionId'>;
export type PermitId = Brand<string, 'PermitId'>;
export type LogicalOperationId = Brand<string, 'LogicalOperationId'>;
export type ExecutionReceiptId = Brand<string, 'ExecutionReceiptId'>;
export type ReadbackId = Brand<string, 'ReadbackId'>;
export type OutcomeId = Brand<string, 'OutcomeId'>;
export type CaseBundleId = Brand<string, 'CaseBundleId'>;
export const id = <T extends string>(value: string, label: T): Brand<string, T> => {
  if (!/^[A-Za-z0-9._:-]+$/.test(value)) throw new Error(`INVALID_ID:${label}`);
  return value as Brand<string, T>;
};
export const ids = {
  plant: (v: string) => id(v, 'PlantId') as PlantId,
  unit: (v: string) => id(v, 'UnitId') as UnitId,
  asset: (v: string) => id(v, 'AssetId') as AssetId,
  instrument: (v: string) => id(v, 'InstrumentId') as InstrumentId,
  generation: (v: string) => id(v, 'EngineeringGenerationId') as EngineeringGenerationId,
  source: (v: string) => id(v, 'EngineeringSourceId') as EngineeringSourceId,
  revision: (v: string) => id(v, 'EngineeringRevisionId') as EngineeringRevisionId,
  plantContract: (v: string) => id(v, 'PlantContractId') as PlantContractId,
  capability: (v: string) => id(v, 'CapabilityId') as CapabilityId,
  evidence: (v: string) => id(v, 'EvidenceId') as EvidenceId,
  proposal: (v: string) => id(v, 'ProposalId') as ProposalId,
  approval: (v: string) => id(v, 'ApprovalId') as ApprovalId,
  caseBundle: (v: string) => id(v, 'CaseBundleId') as CaseBundleId,
  operation: (v: string) => id(v, 'LogicalOperationId') as LogicalOperationId,
};
export type DiagnosticCode =
  | 'UNRESOLVED_ASSET'
  | 'DUPLICATE_IDENTIFIER'
  | 'INVALID_CAPABILITY_DECLARATION'
  | 'INCONSISTENT_GENERATION_BINDING'
  | 'INVALID_TARGET_TYPE'
  | 'NON_ACTUATABLE_TARGET'
  | 'UNIT_MISMATCH'
  | 'DIMENSION_MISMATCH'
  | 'MISSING_PROVENANCE'
  | 'UNAPPROVED_ENGINEERING_SOURCE'
  | 'UNSUPPORTED_TEMPORAL_EXPRESSION'
  | 'EVIDENCE_MISSING'
  | 'EVIDENCE_STALE'
  | 'EVIDENCE_SNAPSHOT_CHANGED'
  | 'EVIDENCE_QUALITY_INSUFFICIENT'
  | 'OPERATING_MODE_NOT_PERMITTED'
  | 'CAPABILITY_NOT_PERMITTED'
  | 'ACTION_ARGUMENT_OUT_OF_BOUNDS'
  | 'AUTHORITY_DENIED'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_EXPIRED'
  | 'PERMIT_EXPIRED'
  | 'ENGINEERING_GENERATION_CHANGED'
  | 'ENGINEERING_BASIS_CHANGED'
  | 'DEPENDENCY_IMPACT_UNKNOWN'
  | 'ACTION_ARGUMENTS_CHANGED'
  | 'PERMIT_BINDING_INVALID'
  | 'COMPLETION_UNKNOWN'
  | 'DUPLICATE_EFFECT_DETECTED'
  | 'READBACK_MISMATCH'
  | 'MODEL_OUT_OF_DOMAIN';
export type Diagnostic = {
  code: DiagnosticCode;
  severity: 'ERROR' | 'WARNING';
  message: string;
  sourceRefs: readonly string[];
  path?: string;
};
const normalize = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(normalize)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, normalize(v)]),
        )
      : value;
export const canonicalize = (value: unknown): string => JSON.stringify(normalize(value));
export const digest = (value: unknown): string =>
  createHash('sha256').update(canonicalize(value)).digest('hex');
export type FaultlineEventType =
  | 'plant_contract.compiled'
  | 'engineering_generation.advanced'
  | 'change_impact.computed'
  | 'proposal.created'
  | 'admissibility.evaluated'
  | 'authority.admitted'
  | 'permit.issued'
  | 'dispatch.revalidation_failed'
  | 'execution.dispatched'
  | 'execution.acknowledgement_lost'
  | 'execution.completion_unknown'
  | 'reconciliation.started'
  | 'reconciliation.existing_effect_found'
  | 'readback.recorded'
  | 'outcome.reconciled'
  | 'case_bundle.completed';
export type DomainEvent = {
  eventId: string;
  type: FaultlineEventType;
  at: string;
  caseId: string;
  logicalOperationId?: LogicalOperationId;
  engineeringGeneration?: EngineeringGenerationId;
  payload: Readonly<Record<string, unknown>>;
};
export class InMemoryEventLog {
  #events: DomainEvent[] = [];
  append(event: DomainEvent) {
    this.#events.push(structuredClone(event));
  }
  list() {
    return this.#events.map((event) => structuredClone(event));
  }
}
