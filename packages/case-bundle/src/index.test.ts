import { describe, it, expect } from 'vitest';
import { createCaseBundle, crossReferenceErrors, parseCaseBundle, verifyCaseBundle } from './index.js';
import { id } from '../../contracts/src/index.js';
describe('case bundle', () => {
  it('verifies manifest', () =>
    expect(verifyCaseBundle(createCaseBundle(id('case-1', 'CaseBundleId'), { a: 1 }))).toBe(true));
  it('rejects malformed bundles at the boundary', () =>
    expect(parseCaseBundle({ artifacts: {} })).toBeNull());
  it('detects a permit that points at a different bounded operation', () => {
    const bundle = createCaseBundle(id('case-2', 'CaseBundleId'), {
      intendedAction: {
        logicalOperationId: 'op-1',
        engineeringGeneration: 'R17',
        targetAssetId: 'FIC-101',
        operation: { value: 1 },
      },
      revisionBoundPermit: {
        logicalOperationId: 'op-2',
        engineeringGeneration: 'R17',
        assetId: 'FIC-101',
        operationDigest: 'wrong',
      },
    });
    expect(crossReferenceErrors(bundle)).toContain('LOGICAL_OPERATION_REFERENCE_MISMATCH');
    expect(verifyCaseBundle(bundle)).toBe(false);
  });
});
