import type { PlantContractArtifact } from '../../plant-contract/src/index.js';
import type { EvidenceSnapshot } from '../../evidence/src/index.js';
import type { ActionIntent } from '../../proposal/src/index.js';
export type CheckResult = { requirement: string; status: 'PASS' | 'FAIL' | 'INCONCLUSIVE'; code?: string };
export type AdmissibilityResult =
  | {
      status: 'ADMISSIBLE_WITHIN_DECLARED_MODEL';
      contractDigest: string;
      evidenceSnapshotDigest: string;
      dependencyClosure: readonly string[];
      checks: readonly CheckResult[];
    }
  | { status: 'REJECTED'; code: string; checks: readonly CheckResult[] }
  | { status: 'INSUFFICIENT_EVIDENCE'; code: string; checks: readonly CheckResult[] };
export const evaluateAdmissibility = (
  contract: PlantContractArtifact,
  evidence: EvidenceSnapshot,
  intent: ActionIntent,
): AdmissibilityResult => {
  if (!evidence.fresh)
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      code: 'EVIDENCE_STALE',
      checks: [{ requirement: 'fresh-good-evidence', status: 'INCONCLUSIVE', code: 'EVIDENCE_STALE' }],
    };
  if (intent.engineeringGeneration !== contract.generation)
    return {
      status: 'REJECTED',
      code: 'ENGINEERING_GENERATION_CHANGED',
      checks: [{ requirement: 'generation-match', status: 'FAIL', code: 'ENGINEERING_GENERATION_CHANGED' }],
    };
  const cap = contract.capabilities.find((c) => c.id === intent.capabilityId);
  const bound = contract.constraints.find(
    (c) => c.capabilityId === intent.capabilityId && c.kind === 'ARGUMENT_BOUND',
  );
  if (!cap)
    return {
      status: 'REJECTED',
      code: 'CAPABILITY_NOT_PERMITTED',
      checks: [{ requirement: 'capability-declared', status: 'FAIL', code: 'CAPABILITY_NOT_PERMITTED' }],
    };
  if (intent.targetAssetId !== cap.target || intent.operation.target !== cap.target)
    return {
      status: 'REJECTED',
      code: 'ACTION_ARGUMENTS_CHANGED',
      checks: [{ requirement: 'exact-target', status: 'FAIL', code: 'ACTION_ARGUMENTS_CHANGED' }],
    };
  if (bound?.max && intent.operation.value.unit !== bound.max.unit)
    return {
      status: 'REJECTED',
      code: 'UNIT_MISMATCH',
      checks: [{ requirement: 'operation-unit', status: 'FAIL', code: 'UNIT_MISMATCH' }],
    };
  if (bound?.max && intent.operation.value.value > bound.max.value)
    return {
      status: 'REJECTED',
      code: 'ACTION_ARGUMENT_OUT_OF_BOUNDS',
      checks: [{ requirement: 'argument-bound', status: 'FAIL', code: 'ACTION_ARGUMENT_OUT_OF_BOUNDS' }],
    };
  return {
    status: 'ADMISSIBLE_WITHIN_DECLARED_MODEL',
    contractDigest: contract.digest,
    evidenceSnapshotDigest: evidence.digest,
    dependencyClosure: [cap.id, ...cap.dependencies],
    checks: [
      { requirement: 'fresh-good-evidence', status: 'PASS' },
      { requirement: 'generation-match', status: 'PASS' },
      { requirement: 'capability-and-bound', status: 'PASS' },
    ],
  };
};
export const fullReevaluate = evaluateAdmissibility;
export const incrementalReevaluate = (
  contract: PlantContractArtifact,
  evidence: EvidenceSnapshot,
  intent: ActionIntent,
  dependencyCoverageComplete: boolean,
): AdmissibilityResult => {
  // This foundation has no partial evaluator yet; incomplete coverage deliberately falls back to full evaluation.
  void dependencyCoverageComplete;
  return fullReevaluate(contract, evidence, intent);
};
