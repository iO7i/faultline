import {
  digest,
  type CapabilityId,
  type AssetId,
  type EngineeringGenerationId,
  type EvidenceSnapshotId,
  type LogicalOperationId,
  type PlantId,
  type ProposalId,
  type UnitId,
} from '../../contracts/src/index.js';
import type { Quantity } from '../../plant-ir/src/index.js';
export type IndustrialOperation = { kind: 'SETPOINT_CHANGE'; target: AssetId; value: Quantity };
export type ActionIntent = {
  logicalOperationId: LogicalOperationId;
  proposalId: ProposalId;
  plantId: PlantId;
  unitId: UnitId;
  targetAssetId: AssetId;
  engineeringGeneration: EngineeringGenerationId;
  capabilityId: CapabilityId;
  purpose: string;
  operation: IndustrialOperation;
  evidenceSnapshotId: EvidenceSnapshotId;
};
export type ProposalArtifact = {
  proposalId: ProposalId;
  createdAt: string;
  evidenceSnapshotId: EvidenceSnapshotId;
  evidenceSnapshotDigest: string;
  plantContractGeneration: EngineeringGenerationId;
  capabilityId: CapabilityId;
  capabilityVersion: string;
  reasoningVersion: 'deterministic-fixture-v1';
  operation: IndustrialOperation;
};
export interface ReasonerPort {
  propose(): ProposalArtifact;
}
export class DeterministicFixtureReasoner implements ReasonerPort {
  constructor(private readonly proposal: ProposalArtifact) {}
  propose() {
    return this.proposal;
  }
}
export const operationDigest = (op: IndustrialOperation) => digest(op);
