import { describe, expect, it } from 'vitest';
import { createWalkingSkeletonBundle, runDemos } from '../../apps/cli/src/demo.js';
import {
  createCaseBundle,
  verifyCaseBundle,
  verifyCaseBundleDetailed,
} from '../../packages/case-bundle/src/index.js';
describe('walking skeleton', () => {
  it('rejects R17 permit before R18 dispatch', () => {
    const r = runDemos();
    expect(r.stale).toMatchObject({ status: 'REQUIRES_REEVALUATION', code: 'ENGINEERING_BASIS_CHANGED' });
  });
  it('reconciles acknowledgement loss without duplicate effect', () => {
    const r = runDemos();
    expect(r.unknown.status).toBe('COMPLETION_UNKNOWN');
    expect(r.recovered.status).toBe('RECONCILED');
    expect(r.effectCount).toBe(1);
    expect(r.outcome.status).toBe('VERIFIED_MATCH');
    expect(r.unknownWorkflow.status).toBe('COMPLETION_UNKNOWN');
    expect(r.recoveryWorkflow.trace).toEqual([
      'PROPOSED',
      'ADMISSIBLE',
      'AUTHORIZED',
      'REVALIDATING',
      'READY_TO_DISPATCH',
      'DISPATCHING',
      'COMPLETION_UNKNOWN',
      'RECONCILING',
      'COMPLETED',
    ]);
  });
  it('emits a replayable, digest-verified case bundle', () => {
    expect(verifyCaseBundle(createWalkingSkeletonBundle())).toBe(true);
  });
  it('rejects a self-consistent bundle whose nested recovery permit is bound to another operation', () => {
    const original = createWalkingSkeletonBundle();
    const artifacts = structuredClone(original.artifacts) as Record<string, unknown>;
    const ambiguous = artifacts.ambiguousCompletion as Record<string, unknown>;
    const permit = ambiguous.revisionBoundPermit as Record<string, unknown>;
    permit.logicalOperationId = 'wrong-operation';
    const mutated = createCaseBundle(original.caseBundleId, artifacts);
    expect(verifyCaseBundle(mutated)).toBe(false);
    expect(verifyCaseBundleDetailed(mutated).errors).toContain(
      'AMBIGUOUS_COMPLETION:LOGICAL_OPERATION_REFERENCE_MISMATCH',
    );
  });
  it('requires the declared counterfactual provenance to agree with the execution receipt', () => {
    const original = createWalkingSkeletonBundle();
    const artifacts = structuredClone(original.artifacts) as Record<string, unknown>;
    const ambiguous = artifacts.ambiguousCompletion as Record<string, unknown>;
    const counterfactual = ambiguous.counterfactual as Record<string, unknown>;
    counterfactual.adapterVersion = 'other';
    const mutated = createCaseBundle(original.caseBundleId, artifacts);
    expect(verifyCaseBundleDetailed(mutated).errors).toContain(
      'AMBIGUOUS_COMPLETION:ADAPTER_PROVENANCE_MISMATCH',
    );
  });
  it('detects post-bundle artifact mutation, even when the manifest is left unchanged', () => {
    const bundle = createWalkingSkeletonBundle();
    const mutated = structuredClone(bundle);
    (mutated.artifacts.evidenceSnapshot as { fresh: boolean }).fresh = false;
    expect(verifyCaseBundle(mutated)).toBe(false);
    expect(verifyCaseBundleDetailed(mutated).errors).toContain('ARTIFACT_DIGEST_MISMATCH:evidenceSnapshot');
  });
});
