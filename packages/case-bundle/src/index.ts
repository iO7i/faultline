import { digest, type CaseBundleId } from '../../contracts/src/index.js';

export type CaseBundle = {
  caseBundleId: CaseBundleId;
  artifacts: Readonly<Record<string, unknown>>;
  artifactDigests: Readonly<Record<string, string>>;
  manifestDigest: string;
};
export type CaseBundleVerification = { valid: boolean; errors: readonly string[] };
const manifest = (caseBundleId: CaseBundleId, artifactDigests: Readonly<Record<string, string>>) => ({
  caseBundleId,
  artifactDigests,
});
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const v1RequiredArtifacts = [
  'schemaVersion',
  'recordedAt',
  'engineering',
  'evidenceSnapshot',
  'intendedAction',
  'revisionBoundPermit',
  'changeImpact',
  'events',
  'stalePermitOutcome',
  'staleWorkflow',
  'ambiguousCompletion',
] as const;
const pairErrors = (actionValue: unknown, permitValue: unknown, prefix: string): string[] => {
  const action = asRecord(actionValue);
  const permit = asRecord(permitValue);
  if (!action || !permit) return [`${prefix}:ACTION_OR_PERMIT_MISSING`];
  const errors: string[] = [];
  if (action.logicalOperationId !== permit.logicalOperationId)
    errors.push(`${prefix}:LOGICAL_OPERATION_REFERENCE_MISMATCH`);
  if (action.engineeringGeneration !== permit.engineeringGeneration)
    errors.push(`${prefix}:GENERATION_REFERENCE_MISMATCH`);
  if (action.targetAssetId !== permit.assetId) errors.push(`${prefix}:TARGET_REFERENCE_MISMATCH`);
  if (digest(action.operation) !== permit.operationDigest) errors.push(`${prefix}:OPERATION_DIGEST_MISMATCH`);
  return errors;
};
export const createCaseBundle = (
  caseBundleId: CaseBundleId,
  artifacts: Readonly<Record<string, unknown>>,
): CaseBundle => {
  const artifactDigests = Object.fromEntries(
    Object.entries(artifacts)
      .map(([name, artifact]) => [name, digest(artifact)] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return {
    caseBundleId,
    artifacts,
    artifactDigests,
    manifestDigest: digest(manifest(caseBundleId, artifactDigests)),
  };
};
export const crossReferenceErrors = (bundle: CaseBundle): readonly string[] => {
  const errors: string[] = [];
  const schemaVersion = bundle.artifacts.schemaVersion;
  if (schemaVersion !== undefined && schemaVersion !== 'faultline.case-bundle.v1')
    errors.push('SCHEMA:UNSUPPORTED_VERSION');
  if (schemaVersion === 'faultline.case-bundle.v1') {
    for (const name of v1RequiredArtifacts)
      if (!(name in bundle.artifacts)) errors.push(`SCHEMA:MISSING_ARTIFACT:${name}`);
  }
  errors.push(
    ...(bundle.artifacts.intendedAction || bundle.artifacts.revisionBoundPermit
      ? pairErrors(bundle.artifacts.intendedAction, bundle.artifacts.revisionBoundPermit, 'PRIMARY')
      : []),
  );
  const staleWorkflow = asRecord(bundle.artifacts.staleWorkflow);
  if (schemaVersion === 'faultline.case-bundle.v1' && staleWorkflow?.status !== 'REJECTED')
    errors.push('STALE_PERMIT:WORKFLOW_STATE_INVALID');
  const ambiguous = asRecord(bundle.artifacts.ambiguousCompletion);
  if (ambiguous) {
    errors.push(
      ...pairErrors(ambiguous.intendedAction, ambiguous.revisionBoundPermit, 'AMBIGUOUS_COMPLETION'),
    );
    const workflow = asRecord(ambiguous.workflow);
    const reconciliation = asRecord(ambiguous.reconciliation);
    const outcome = asRecord(ambiguous.outcome);
    const counterfactual = asRecord(ambiguous.counterfactual);
    const workflowTrace = asRecord(ambiguous.workflowTrace);
    const receipt = workflow ? asRecord(workflow.receipt) : null;
    const reconciledReceipt = reconciliation ? asRecord(reconciliation.receipt) : null;
    if (!workflow || workflow.status !== 'COMPLETION_UNKNOWN')
      errors.push('AMBIGUOUS_COMPLETION:WORKFLOW_STATE_INVALID');
    if (!reconciliation || reconciliation.status !== 'RECONCILED')
      errors.push('AMBIGUOUS_COMPLETION:RECONCILIATION_NOT_RECORDED');
    if (!receipt || reconciledReceipt?.receiptId !== receipt.receiptId)
      errors.push('AMBIGUOUS_COMPLETION:RECEIPT_REFERENCE_MISMATCH');
    if (!receipt || outcome?.receiptId !== receipt.receiptId)
      errors.push('AMBIGUOUS_COMPLETION:OUTCOME_RECEIPT_MISMATCH');
    if (
      !counterfactual ||
      counterfactual.operationDigest !== digest(asRecord(ambiguous.intendedAction)?.operation)
    )
      errors.push('AMBIGUOUS_COMPLETION:COUNTERFACTUAL_OPERATION_MISMATCH');
    if (
      !receipt ||
      counterfactual?.adapterId !== receipt.adapterId ||
      counterfactual?.adapterVersion !== receipt.adapterVersion
    )
      errors.push('AMBIGUOUS_COMPLETION:ADAPTER_PROVENANCE_MISMATCH');
    if (workflowTrace?.status !== 'COMPLETED') errors.push('AMBIGUOUS_COMPLETION:WORKFLOW_TRACE_INVALID');
  }
  const events = bundle.artifacts.events;
  if (Array.isArray(events)) {
    const ids = events.map((event) => (asRecord(event)?.eventId as string | undefined) ?? '');
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) errors.push('EVENT_LOG:EVENT_IDS_INVALID');
  }
  return errors.sort();
};
export const verifyCaseBundleDetailed = (bundle: CaseBundle): CaseBundleVerification => {
  const errors: string[] = [];
  if (bundle.manifestDigest !== digest(manifest(bundle.caseBundleId, bundle.artifactDigests)))
    errors.push('MANIFEST_DIGEST_MISMATCH');
  const artifactNames = Object.keys(bundle.artifacts).sort();
  const digestNames = Object.keys(bundle.artifactDigests).sort();
  if (artifactNames.join('|') !== digestNames.join('|')) errors.push('MANIFEST_ARTIFACT_SET_MISMATCH');
  for (const [name, artifact] of Object.entries(bundle.artifacts))
    if (bundle.artifactDigests[name] !== digest(artifact)) errors.push(`ARTIFACT_DIGEST_MISMATCH:${name}`);
  errors.push(...crossReferenceErrors(bundle));
  return { valid: errors.length === 0, errors: errors.sort() };
};
export const verifyCaseBundle = (bundle: CaseBundle) => verifyCaseBundleDetailed(bundle).valid;

export const parseCaseBundle = (value: unknown): CaseBundle | null => {
  const candidate = asRecord(value);
  if (
    !candidate ||
    typeof candidate.caseBundleId !== 'string' ||
    typeof candidate.manifestDigest !== 'string' ||
    !asRecord(candidate.artifacts) ||
    !asRecord(candidate.artifactDigests)
  )
    return null;
  const artifactDigests = candidate.artifactDigests as Record<string, unknown>;
  if (Object.values(artifactDigests).some((value) => typeof value !== 'string')) return null;
  return {
    caseBundleId: candidate.caseBundleId as CaseBundleId,
    artifacts: candidate.artifacts as Readonly<Record<string, unknown>>,
    artifactDigests: artifactDigests as Readonly<Record<string, string>>,
    manifestDigest: candidate.manifestDigest,
  };
};
