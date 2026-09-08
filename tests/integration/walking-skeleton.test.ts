import { describe, expect, it } from 'vitest';
import { createWalkingSkeletonBundle, runDemos } from '../../apps/cli/src/demo.js';
import { verifyCaseBundle } from '../../packages/case-bundle/src/index.js';
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
  });
  it('emits a replayable, digest-verified case bundle', () => {
    expect(verifyCaseBundle(createWalkingSkeletonBundle())).toBe(true);
  });
});
