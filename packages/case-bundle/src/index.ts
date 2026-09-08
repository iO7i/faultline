import { digest, type CaseBundleId } from '../../contracts/src/index.js';

export type CaseBundle = {
  caseBundleId: CaseBundleId;
  artifacts: Readonly<Record<string, unknown>>;
  artifactDigests: Readonly<Record<string, string>>;
  manifestDigest: string;
};
const manifest = (caseBundleId: CaseBundleId, artifactDigests: Readonly<Record<string, string>>) => ({
  caseBundleId,
  artifactDigests,
});
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
  const intended = bundle.artifacts.intendedAction;
  const permit = bundle.artifacts.revisionBoundPermit;
  if (!intended || !permit || typeof intended !== 'object' || typeof permit !== 'object') return [];
  const action = intended as Record<string, unknown>;
  const authority = permit as Record<string, unknown>;
  const errors: string[] = [];
  if (action.logicalOperationId !== authority.logicalOperationId)
    errors.push('LOGICAL_OPERATION_REFERENCE_MISMATCH');
  if (action.engineeringGeneration !== authority.engineeringGeneration)
    errors.push('GENERATION_REFERENCE_MISMATCH');
  if (action.targetAssetId !== authority.assetId) errors.push('TARGET_REFERENCE_MISMATCH');
  if (digest(action.operation) !== authority.operationDigest) errors.push('OPERATION_DIGEST_MISMATCH');
  return errors;
};
export const verifyCaseBundle = (bundle: CaseBundle) =>
  bundle.manifestDigest === digest(manifest(bundle.caseBundleId, bundle.artifactDigests)) &&
  Object.entries(bundle.artifacts).every(
    ([name, artifact]) => bundle.artifactDigests[name] === digest(artifact),
  ) &&
  crossReferenceErrors(bundle).length === 0;

export const parseCaseBundle = (value: unknown): CaseBundle | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.caseBundleId !== 'string' ||
    typeof candidate.manifestDigest !== 'string' ||
    !candidate.artifacts ||
    typeof candidate.artifacts !== 'object' ||
    Array.isArray(candidate.artifacts) ||
    !candidate.artifactDigests ||
    typeof candidate.artifactDigests !== 'object' ||
    Array.isArray(candidate.artifactDigests)
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
